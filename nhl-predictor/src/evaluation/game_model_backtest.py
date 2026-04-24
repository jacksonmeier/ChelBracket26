"""Walk-forward LightGBM game-level model with team features.

Features (all strictly pre-game):
  - For each side (home/away):
      point_pct, gf_per_game, ga_per_game, gd_per_game,
      pp_pct, pk_pct, shots_for_per_game, shots_against_per_game
    (regular-season aggregates for the same season as the playoff game)
  - Game-level:
      days_rest_home, days_rest_away,
      home_series_wins, away_series_wins, game_in_series, round,
      elimination_flag (either side has 3)

Target: home_win (1 if home_goals > away_goals).

Walk-forward: for each target season S with S >= min_target_season,
train LightGBM on all playoff games with season < S, then predict on S.
Reports aggregate + per-season metrics against coin flip, home-ice, and
the hand-tuned prior formula.

Run:
    cd nhl-predictor/src && python -m evaluation.game_model_backtest
"""
from __future__ import annotations

import json
import logging
import math
import sqlite3
import sys
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "nhl.sqlite"
OUT_PATH = ROOT / "data" / "processed" / "game_model_backtest.json"

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from export import _game_prob_home, _goalie_for, _series_sim  # noqa: E402

FEATURES = [
    "h_point_pct", "h_gf", "h_ga", "h_gd", "h_pp", "h_pk", "h_sf", "h_sa",
    "a_point_pct", "a_gf", "a_ga", "a_gd", "a_pp", "a_pk", "a_sf", "a_sa",
    "d_point_pct", "d_gf", "d_ga", "d_gd", "d_pp", "d_pk", "d_sf", "d_sa",
    "days_rest_home", "days_rest_away",
    "home_series_wins", "away_series_wins",
    "game_in_series", "round", "elimination_flag",
]


def _load_team_stats(conn: sqlite3.Connection) -> dict[tuple[int, int], dict]:
    """Map (team_id, season) → regular-season stats dict."""
    rows = conn.execute(
        "SELECT team_id, season, point_pct, gf_per_game, ga_per_game, "
        "       pp_pct, pk_pct, shots_for_per_game, shots_against_per_game "
        "FROM team_season_stats WHERE game_type=2"
    ).fetchall()
    out: dict[tuple[int, int], dict] = {}
    for r in rows:
        out[(r[0], r[1])] = {
            "point_pct": r[2] or 0.5,
            "gf": r[3] or 2.8,
            "ga": r[4] or 2.8,
            "pp": r[5] or 0.20,
            "pk": r[6] or 0.80,
            "sf": r[7] or 30.0,
            "sa": r[8] or 30.0,
        }
    return out


def _load_games(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT game_id, season, date, home_team_id, away_team_id, "
        "       home_abbrev, away_abbrev, home_goals, away_goals, "
        "       round, series_id, game_in_series "
        "FROM games WHERE home_goals IS NOT NULL AND away_goals IS NOT NULL "
        "ORDER BY date ASC, game_id ASC"
    ).fetchall()
    return [
        {
            "game_id": r[0], "season": r[1], "date": r[2],
            "home_id": r[3], "away_id": r[4],
            "home": r[5], "away": r[6],
            "home_goals": r[7], "away_goals": r[8],
            "round": r[9] or 0, "series_id": r[10],
            "game_in_series": r[11] or 1,
        }
        for r in rows
    ]


def _build_features(games: list[dict], team_stats: dict) -> list[dict]:
    """Return list of feature dicts + labels, in chronological order."""
    from datetime import date as _date

    def _parse(d: str) -> _date:
        return _date.fromisoformat(d)

    # Track last-game date per team (for rest) and per-series win counts.
    last_play: dict[str, str] = {}
    series_wins: dict[str, dict[str, int]] = {}  # series_id → {abbrev: wins}

    out = []
    for g in games:
        hs = team_stats.get((g["home_id"], g["season"]))
        as_ = team_stats.get((g["away_id"], g["season"]))
        if not hs or not as_:
            continue  # missing team stats, skip

        # Rest days (clipped to [0, 10]).
        def rest(abbrev: str) -> int:
            prev = last_play.get(abbrev)
            if not prev:
                return 5
            delta = (_parse(g["date"]) - _parse(prev)).days
            return max(0, min(10, delta - 1))

        days_rest_home = rest(g["home"])
        days_rest_away = rest(g["away"])

        sw = series_wins.setdefault(g["series_id"], {g["home"]: 0, g["away"]: 0})
        hw = sw.get(g["home"], 0)
        aw = sw.get(g["away"], 0)
        elim = 1 if (hw == 3 or aw == 3) else 0

        feats = {
            "h_point_pct": hs["point_pct"], "h_gf": hs["gf"], "h_ga": hs["ga"],
            "h_gd": hs["gf"] - hs["ga"], "h_pp": hs["pp"], "h_pk": hs["pk"],
            "h_sf": hs["sf"], "h_sa": hs["sa"],
            "a_point_pct": as_["point_pct"], "a_gf": as_["gf"], "a_ga": as_["ga"],
            "a_gd": as_["gf"] - as_["ga"], "a_pp": as_["pp"], "a_pk": as_["pk"],
            "a_sf": as_["sf"], "a_sa": as_["sa"],
            "d_point_pct": hs["point_pct"] - as_["point_pct"],
            "d_gf": hs["gf"] - as_["gf"],
            "d_ga": hs["ga"] - as_["ga"],
            "d_gd": (hs["gf"] - hs["ga"]) - (as_["gf"] - as_["ga"]),
            "d_pp": hs["pp"] - as_["pp"],
            "d_pk": hs["pk"] - as_["pk"],
            "d_sf": hs["sf"] - as_["sf"],
            "d_sa": hs["sa"] - as_["sa"],
            "days_rest_home": days_rest_home,
            "days_rest_away": days_rest_away,
            "home_series_wins": hw,
            "away_series_wins": aw,
            "game_in_series": g["game_in_series"],
            "round": g["round"],
            "elimination_flag": elim,
        }
        y = 1 if g["home_goals"] > g["away_goals"] else 0
        out.append({"feats": feats, "y": y, "season": g["season"],
                    "date": g["date"], "home": g["home"], "away": g["away"]})

        # Update running state AFTER emitting features (no lookahead).
        winner = g["home"] if y else g["away"]
        sw[winner] = sw.get(winner, 0) + 1
        last_play[g["home"]] = g["date"]
        last_play[g["away"]] = g["date"]

    return out


def _brier(p: float, y: int) -> float: return (p - y) ** 2
def _log_loss(p: float, y: int, eps: float = 1e-6) -> float:
    p = max(eps, min(1 - eps, p))
    return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def _metrics(preds: list[tuple[float, int]]) -> dict:
    if not preds:
        return {"n": 0}
    n = len(preds)
    acc = sum(1 for p, y in preds if (p >= 0.5) == bool(y)) / n
    return {
        "n": n,
        "accuracy": round(acc, 4),
        "brier": round(sum(_brier(p, y) for p, y in preds) / n, 4),
        "log_loss": round(sum(_log_loss(p, y) for p, y in preds) / n, 4),
        "mean_pred": round(sum(p for p, _ in preds) / n, 4),
        "mean_actual": round(sum(y for _, y in preds) / n, 4),
    }


def _calibration(preds: list[tuple[float, int]], n_bins: int = 10) -> list[dict]:
    bins: list[list] = [[] for _ in range(n_bins)]
    for p, y in preds:
        bins[min(n_bins - 1, int(p * n_bins))].append((p, y))
    out = []
    for i, b in enumerate(bins):
        lo, hi = i / n_bins, (i + 1) / n_bins
        if not b:
            out.append({"bin": [round(lo, 2), round(hi, 2)], "n": 0})
            continue
        out.append({
            "bin": [round(lo, 2), round(hi, 2)], "n": len(b),
            "mean_pred": round(sum(p for p, _ in b) / len(b), 4),
            "actual_rate": round(sum(y for _, y in b) / len(b), 4),
        })
    return out


def _load_series_outcomes(conn: sqlite3.Connection) -> list[dict]:
    """Group playoff games by series_id; return one row per completed best-of-7
    with home/away defined by the Game-1 host (i.e. the top-seeded side).
    """
    rows = conn.execute(
        "SELECT game_id, season, date, home_team_id, away_team_id, "
        "       home_abbrev, away_abbrev, home_goals, away_goals, "
        "       round, series_id, game_in_series "
        "FROM games WHERE series_id IS NOT NULL "
        "AND home_goals IS NOT NULL AND away_goals IS NOT NULL "
        "ORDER BY series_id ASC, game_in_series ASC, date ASC"
    ).fetchall()
    by_series: dict[str, list] = {}
    for r in rows:
        by_series.setdefault(r[10], []).append(r)
    out = []
    for sid, gs in by_series.items():
        g1 = gs[0]
        home_side, away_side = g1[5], g1[6]
        home_id, away_id = g1[3], g1[4]
        hw = aw = 0
        for g in gs:
            g_home = g[5]
            winner = g_home if g[7] > g[8] else g[6]
            if winner == home_side:
                hw += 1
            elif winner == away_side:
                aw += 1
        if hw + aw < 4:
            continue  # incomplete or malformed
        out.append({
            "series_id": sid, "season": g1[1],
            "round": g1[9] or 0,
            "home": home_side, "away": away_side,
            "home_id": home_id, "away_id": away_id,
            "home_win": 1 if hw > aw else 0,
            "length": hw + aw,
        })
    return out


def _series_prob_from_booster(booster, platt_a: float, platt_b: float,
                               clip_lo: float, clip_hi: float,
                               home_feats: dict, away_feats_flipped: dict,
                               home_wins: int = 0, away_wins: int = 0,
                               n_sims: int = 4000, seed: int | None = None,
                               iso=None, temperature: float = 1.0) -> float:
    """Replay a best-of-7 through the trained per-game booster, alternating
    home-arena / away-arena probs. Returns P(home-ice side wins series).
    If `iso` (IsotonicRegression) is provided, it calibrates raw scores;
    otherwise Platt is used. ``temperature`` pulls post-calibration probs
    toward 0.5 (same transform the production GameModel applies).
    """
    import numpy as np

    def _p(feat_row: dict) -> float:
        x = np.array([[feat_row[f] for f in FEATURES]], dtype=float)
        raw = float(booster.predict(x)[0])
        if iso is not None:
            p = float(iso.predict([raw])[0])
        else:
            p = 1.0 / (1.0 + math.exp(-(platt_a * raw + platt_b)))
        if temperature != 1.0:
            p = 0.5 + temperature * (p - 0.5)
        return max(clip_lo, min(clip_hi, p))

    p_home_at_home = _p(home_feats)
    # Away arena: feed flipped features (away-as-home), then invert.
    p_home_at_away = 1.0 - _p(away_feats_flipped)
    p_home_at_away = max(clip_lo, min(clip_hi, p_home_at_away))
    sim = _series_sim(p_home_at_home, p_home_at_away, home_wins, away_wins,
                      n=n_sims, seed=seed)
    return float(sim["p_home_series"])


def _series_feat_vectors(s: dict, season: int, team_stats: dict,
                          round_: int) -> tuple[dict | None, dict | None]:
    """Build the Game-1 feature dict for (home perspective) and the flipped
    (away-as-home) perspective, using season-average team stats. Rest days
    default to 2 (standard pre-series rest). Returns (home_dict, flipped_dict)
    or (None, None) if stats missing.
    """
    hs = team_stats.get((s["home_id"], season))
    as_ = team_stats.get((s["away_id"], season))
    if not hs or not as_:
        return None, None

    def _row(h: dict, a: dict) -> dict:
        return {
            "h_point_pct": h["point_pct"], "h_gf": h["gf"], "h_ga": h["ga"],
            "h_gd": h["gf"] - h["ga"], "h_pp": h["pp"], "h_pk": h["pk"],
            "h_sf": h["sf"], "h_sa": h["sa"],
            "a_point_pct": a["point_pct"], "a_gf": a["gf"], "a_ga": a["ga"],
            "a_gd": a["gf"] - a["ga"], "a_pp": a["pp"], "a_pk": a["pk"],
            "a_sf": a["sf"], "a_sa": a["sa"],
            "d_point_pct": h["point_pct"] - a["point_pct"],
            "d_gf": h["gf"] - a["gf"], "d_ga": h["ga"] - a["ga"],
            "d_gd": (h["gf"] - h["ga"]) - (a["gf"] - a["ga"]),
            "d_pp": h["pp"] - a["pp"], "d_pk": h["pk"] - a["pk"],
            "d_sf": h["sf"] - a["sf"], "d_sa": h["sa"] - a["sa"],
            "days_rest_home": 2, "days_rest_away": 2,
            "home_series_wins": 0, "away_series_wins": 0,
            "game_in_series": 1, "round": round_, "elimination_flag": 0,
        }

    return _row(hs, as_), _row(as_, hs)


def run(min_target_season: int = 20152016,
        calibration_method: str = "platt") -> dict:
    import lightgbm as lgb
    from sklearn.linear_model import LogisticRegression
    from sklearn.isotonic import IsotonicRegression

    if not DB_PATH.exists():
        return {"error": "db missing"}
    conn = sqlite3.connect(DB_PATH)
    team_stats = _load_team_stats(conn)
    games = _load_games(conn)
    series_outcomes = _load_series_outcomes(conn)
    data = _build_features(games, team_stats)
    conn.close()
    log.info("feature rows: %d (team-stat-matched playoff games)", len(data))
    log.info("series outcomes: %d complete best-of-7s", len(series_outcomes))

    by_season: dict[int, list[dict]] = {}
    for d in data:
        by_season.setdefault(d["season"], []).append(d)
    target_seasons = sorted(s for s in by_season if s >= min_target_season)

    preds_model: list[tuple[float, int]] = []
    preds_prior: list[tuple[float, int]] = []
    per_season: dict[int, dict] = {}
    feature_importance: dict[str, int] = {}

    # Series-level accumulators: (predicted P(home-side wins), actual home_win)
    series_preds: list[tuple[float, int]] = []
    series_by_round: dict[int, list[tuple[float, int]]] = {}
    series_by_season: dict[int, list[tuple[float, int]]] = {}

    for S in target_seasons:
        train_rows = [d for d in data if d["season"] < S]
        platt_season = None
        for back in range(1, 5):
            cand = _prev_season(S, back)
            if cand in by_season:
                platt_season = cand
                break
        platt_rows = [d for d in train_rows if d["season"] == platt_season] if platt_season else []
        fit_rows = [d for d in train_rows if d["season"] != platt_season]
        if len(fit_rows) < 200:
            log.info("skip %s: only %d training rows", S, len(fit_rows))
            continue

        Xtr = np.array([[d["feats"][f] for f in FEATURES] for d in fit_rows])
        ytr = np.array([d["y"] for d in fit_rows])
        Xho = np.array([[d["feats"][f] for f in FEATURES] for d in platt_rows]) if platt_rows else None
        yho = np.array([d["y"] for d in platt_rows]) if platt_rows else None

        params = dict(objective="binary", learning_rate=0.05, num_leaves=15,
                      min_data_in_leaf=30, feature_fraction=0.9,
                      bagging_fraction=0.9, bagging_freq=1, verbose=-1)
        dtrain = lgb.Dataset(Xtr, label=ytr, feature_name=FEATURES)
        callbacks = [lgb.log_evaluation(period=0)]
        if Xho is not None and len(Xho) > 20:
            dval = lgb.Dataset(Xho, label=yho, reference=dtrain, feature_name=FEATURES)
            callbacks.append(lgb.early_stopping(stopping_rounds=30, verbose=False))
            booster = lgb.train(params, dtrain, num_boost_round=500,
                                valid_sets=[dval], callbacks=callbacks)
        else:
            booster = lgb.train(params, dtrain, num_boost_round=200, callbacks=callbacks)

        # Calibration on holdout (if enough rows).
        platt_a, platt_b = 1.0, 0.0
        iso = None
        temperature = 1.0
        if Xho is not None and len(Xho) > 20:
            raw_ho = booster.predict(Xho)
            if calibration_method == "isotonic":
                iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                iso.fit(raw_ho, yho)
                cal_ho = iso.predict(raw_ho)
            else:
                lr = LogisticRegression(C=1e4, solver="lbfgs")
                lr.fit(raw_ho.reshape(-1, 1), yho)
                platt_a, platt_b = float(lr.coef_[0, 0]), float(lr.intercept_[0])
                cal_ho = 1.0 / (1.0 + np.exp(-(platt_a * raw_ho + platt_b)))
            cal_ho = np.clip(cal_ho, 0.02, 0.98)
            # Fit temperature on holdout log-loss — mirrors production GameModel.
            from sklearn.metrics import log_loss as _ll
            best_t, best_ll = 1.0, float(_ll(yho, cal_ho, labels=[0, 1]))
            for t in np.linspace(0.50, 1.00, 26):
                p_t = np.clip(0.5 + t * (cal_ho - 0.5), 0.02, 0.98)
                ll = float(_ll(yho, p_t, labels=[0, 1]))
                if ll < best_ll:
                    best_t, best_ll = float(t), ll
            temperature = best_t

        # Score target season.
        Xte = np.array([[d["feats"][f] for f in FEATURES] for d in by_season[S]])
        raw_te = booster.predict(Xte)
        if iso is not None:
            cal_te = iso.predict(raw_te)
        else:
            cal_te = 1.0 / (1.0 + np.exp(-(platt_a * raw_te + platt_b)))
        cal_te = np.clip(cal_te, 0.02, 0.98)
        if temperature != 1.0:
            cal_te = np.clip(0.5 + temperature * (cal_te - 0.5), 0.02, 0.98)

        season_model: list[tuple[float, int]] = []
        season_prior: list[tuple[float, int]] = []
        for p, d in zip(cal_te, by_season[S]):
            y = d["y"]
            season_model.append((float(p), y))
            hp = _goalie_for(d["home"])[1]
            ap = _goalie_for(d["away"])[1]
            season_prior.append((_game_prob_home(hp, ap, home_ice=True), y))

        preds_model.extend(season_model)
        preds_prior.extend(season_prior)

        # ---- Series-level replay on target season S ----
        season_series: list[tuple[float, int]] = []
        for so in series_outcomes:
            if so["season"] != S:
                continue
            home_feats, flipped = _series_feat_vectors(so, S, team_stats, so["round"])
            if home_feats is None:
                continue
            p_series = _series_prob_from_booster(
                booster, platt_a, platt_b, 0.02, 0.98,
                home_feats, flipped,
                home_wins=0, away_wins=0,
                n_sims=4000, seed=hash(so["series_id"]) & 0xFFFFFFFF,
                iso=iso, temperature=temperature,
            )
            pair = (p_series, int(so["home_win"]))
            season_series.append(pair)
            series_preds.append(pair)
            series_by_round.setdefault(so["round"] or 0, []).append(pair)
            series_by_season.setdefault(S, []).append(pair)

        per_season[S] = {
            "model": _metrics(season_model),
            "prior_only": _metrics(season_prior),
            "series_model": _metrics(season_series),
            "train_rows": len(fit_rows),
            "platt_season": platt_season,
            "temperature": round(temperature, 3),
        }

        # Accumulate feature importance.
        imp = booster.feature_importance(importance_type="gain")
        for name, val in zip(FEATURES, imp):
            feature_importance[name] = feature_importance.get(name, 0) + int(val)

        log.info("target %s: train=%d platt=%s test=%d acc=%.3f brier=%.3f",
                 S, len(fit_rows), platt_season, len(Xte),
                 per_season[S]["model"]["accuracy"], per_season[S]["model"]["brier"])

    series_round_metrics = {
        str(r): _metrics(v) for r, v in sorted(series_by_round.items())
    }

    # Series-level post-hoc calibrator. Platt (logistic) rather than isotonic:
    # with only 157 walk-forward series the tails are too sparse for isotonic
    # (≤7 samples per bin outside [0.4, 0.7]) — it pushes >0.74 → 0.98 and
    # <0.26 → 0.02, which *worsens* compounding overconfidence. Platt is
    # two parameters fit on the full set, so it smooths rather than fits
    # empty bins aggressively. Serialized as a knot grid for dep-free apply.
    series_cal_artifact: dict = {"method": "none"}
    if len(series_preds) >= 50:
        from sklearn.linear_model import LogisticRegression as _LR
        xs = np.array([p for p, _ in series_preds], dtype=float).reshape(-1, 1)
        ys = np.array([y for _, y in series_preds], dtype=int)
        # Logit transform so the logistic regresses on log-odds, not probs.
        xs_logit = np.log(xs / (1 - xs))
        lr_s = _LR(C=1e4, solver="lbfgs")
        lr_s.fit(xs_logit, ys)
        a = float(lr_s.coef_[0, 0])
        b = float(lr_s.intercept_[0])

        def _apply(p: float) -> float:
            logit = math.log(p / (1 - p))
            return 1.0 / (1.0 + math.exp(-(a * logit + b)))

        grid = np.linspace(0.02, 0.98, 97)
        mapped = [_apply(float(x)) for x in grid]
        pre = _metrics(series_preds)
        post = _metrics([(_apply(p), y) for p, y in series_preds])
        series_cal_artifact = {
            "method": "platt_logit",
            "a": a, "b": b,
            "knots_x": [round(float(x), 4) for x in grid],
            "knots_y": [round(float(y), 4) for y in mapped],
            "n_fit": len(series_preds),
            "brier_pre": pre["brier"],
            "brier_post": post["brier"],
            "log_loss_pre": pre["log_loss"],
            "log_loss_post": post["log_loss"],
        }
        cal_path = ROOT / "data" / "processed" / "series_calibration.json"
        cal_path.parent.mkdir(parents=True, exist_ok=True)
        cal_path.write_text(json.dumps(series_cal_artifact, indent=2))
        log.info("wrote %s (n=%d, Brier %.4f → %.4f, a=%.3f b=%.3f)",
                 cal_path, len(series_preds), pre["brier"], post["brier"], a, b)

    report = {
        "mode": "walk_forward_game_model",
        "min_target_season": min_target_season,
        "n_games_scored": len(preds_model),
        "features": FEATURES,
        "aggregate": {
            "model": _metrics(preds_model),
            "prior_only": _metrics(preds_prior),
            "home_0545": _metrics([(0.545, y) for _, y in preds_model]),
            "coin_flip": _metrics([(0.5, y) for _, y in preds_model]),
        },
        "calibration_model": _calibration(preds_model),
        "series": {
            "n_series": len(series_preds),
            "aggregate": {
                "model": _metrics(series_preds),
                "home_ice_058": _metrics([(0.58, y) for _, y in series_preds]),
                "coin_flip": _metrics([(0.5, y) for _, y in series_preds]),
            },
            "calibration": _calibration(series_preds),
            "by_round": series_round_metrics,
            "post_hoc_calibrator": series_cal_artifact,
        },
        "per_season": {str(s): v for s, v in sorted(per_season.items())},
        "feature_importance_total_gain": dict(
            sorted(feature_importance.items(), key=lambda kv: -kv[1])
        ),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2))
    log.info("wrote %s", OUT_PATH)
    return report


def _prev_season(s: int, back: int = 1) -> int:
    yr = s // 10000
    return (yr - back) * 10000 + (yr - back + 1)


def _print_summary(r: dict) -> None:
    print(f"\nGame model backtest: {r['n_games_scored']} games\n")
    print(f"{'model':<14}{'n':>6}  {'acc':>7} {'brier':>8} {'ll':>8} {'meanp':>8} {'meany':>8}")
    for k, m in r["aggregate"].items():
        print(f"{k:<14}{m['n']:>6}  {m['accuracy']:>7} {m['brier']:>8} "
              f"{m['log_loss']:>8} {m['mean_pred']:>8} {m['mean_actual']:>8}")
    print("\nPer-season (model vs prior-only):")
    print(f"{'season':<10}{'n':>5}  {'m_acc':>7}{'m_brier':>9}  {'p_acc':>7}{'p_brier':>9}")
    for s, v in r["per_season"].items():
        m, p = v["model"], v["prior_only"]
        print(f"{s:<10}{m['n']:>5}  {m['accuracy']:>7}{m['brier']:>9}  "
              f"{p['accuracy']:>7}{p['brier']:>9}")
    print("\nCalibration (model, non-empty bins):")
    for b in r["calibration_model"]:
        if b["n"] == 0:
            continue
        print(f"  {b['bin']}  n={b['n']:4d}  pred={b['mean_pred']:.3f}  actual={b['actual_rate']:.3f}")
    s = r.get("series") or {}
    if s.get("n_series"):
        print(f"\nSeries-level replay via per-game model + MC ({s['n_series']} series):")
        for k, m in s["aggregate"].items():
            print(f"  {k:<14}{m['n']:>5}  acc={m['accuracy']:.3f}  brier={m['brier']:.4f}  "
                  f"ll={m['log_loss']:.4f}  meanp={m['mean_pred']:.3f}  meany={m['mean_actual']:.3f}")
        print("\nSeries calibration (non-empty bins):")
        for b in s["calibration"]:
            if b["n"] == 0: continue
            print(f"  {b['bin']}  n={b['n']:3d}  pred={b['mean_pred']:.3f}  actual={b['actual_rate']:.3f}")
        print("\nSeries by round:")
        for rd, m in s["by_round"].items():
            print(f"  R{rd}: n={m['n']:3d}  acc={m['accuracy']:.3f}  brier={m['brier']:.4f}  "
                  f"meanp={m['mean_pred']:.3f}  meany={m['mean_actual']:.3f}")
    print("\nFeature importance (total gain, top 12):")
    for name, val in list(r["feature_importance_total_gain"].items())[:12]:
        print(f"  {name:<20} {val}")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-target", type=int, default=20152016)
    ap.add_argument("--calibration", choices=("isotonic", "platt"),
                    default="platt",
                    help="calibrator applied to raw LightGBM scores (default platt)")
    args = ap.parse_args()
    r = run(args.min_target, calibration_method=args.calibration)
    if "error" not in r:
        _print_summary(r)

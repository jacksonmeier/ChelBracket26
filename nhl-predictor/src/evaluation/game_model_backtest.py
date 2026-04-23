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

from export import _game_prob_home, _goalie_for  # noqa: E402

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


def run(min_target_season: int = 20152016) -> dict:
    import lightgbm as lgb
    from sklearn.linear_model import LogisticRegression

    if not DB_PATH.exists():
        return {"error": "db missing"}
    conn = sqlite3.connect(DB_PATH)
    team_stats = _load_team_stats(conn)
    games = _load_games(conn)
    data = _build_features(games, team_stats)
    conn.close()
    log.info("feature rows: %d (team-stat-matched playoff games)", len(data))

    by_season: dict[int, list[dict]] = {}
    for d in data:
        by_season.setdefault(d["season"], []).append(d)
    target_seasons = sorted(s for s in by_season if s >= min_target_season)

    preds_model: list[tuple[float, int]] = []
    preds_prior: list[tuple[float, int]] = []
    per_season: dict[int, dict] = {}
    feature_importance: dict[str, int] = {}

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

        # Platt calibration on holdout (if enough rows).
        platt_a, platt_b = 1.0, 0.0
        if Xho is not None and len(Xho) > 20:
            raw_ho = booster.predict(Xho)
            lr = LogisticRegression(C=1e4, solver="lbfgs")
            lr.fit(raw_ho.reshape(-1, 1), yho)
            platt_a, platt_b = float(lr.coef_[0, 0]), float(lr.intercept_[0])

        # Score target season.
        Xte = np.array([[d["feats"][f] for f in FEATURES] for d in by_season[S]])
        raw_te = booster.predict(Xte)
        cal_te = 1.0 / (1.0 + np.exp(-(platt_a * raw_te + platt_b)))

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
        per_season[S] = {
            "model": _metrics(season_model),
            "prior_only": _metrics(season_prior),
            "train_rows": len(fit_rows),
            "platt_season": platt_season,
        }

        # Accumulate feature importance.
        imp = booster.feature_importance(importance_type="gain")
        for name, val in zip(FEATURES, imp):
            feature_importance[name] = feature_importance.get(name, 0) + int(val)

        log.info("target %s: train=%d platt=%s test=%d acc=%.3f brier=%.3f",
                 S, len(fit_rows), platt_season, len(Xte),
                 per_season[S]["model"]["accuracy"], per_season[S]["model"]["brier"])

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
    print("\nFeature importance (total gain, top 12):")
    for name, val in list(r["feature_importance_total_gain"].items())[:12]:
        print(f"  {name:<20} {val}")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-target", type=int, default=20152016)
    args = ap.parse_args()
    r = run(args.min_target)
    if "error" not in r:
        _print_summary(r)

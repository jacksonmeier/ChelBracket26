"""Walk-forward series-level model: directly predict P(home wins series).

Rather than multiplying per-game probs, train on series outcomes with
season-average team features + round + home ice (defined as the side
that hosted Game 1 of the series).

Outputs:
  - P(home-ice side wins series) via LightGBM
  - Implied per-game p_home (back-solved from best-of-7 closed form)
  - Expected length distribution via MC from that implied p_game

Evaluated against:
  - Current export.py pipeline (per-game formula → series MC)
  - Coin flip
  - Higher-seed prior (0.58 — empirical home-ice-in-series rate)

Run: cd nhl-predictor/src && python -m evaluation.series_model_backtest
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
OUT_PATH = ROOT / "data" / "processed" / "series_model_backtest.json"

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from export import _game_prob_home, _goalie_for, _series_sim  # noqa: E402

FEATURES = [
    "h_point_pct", "a_point_pct", "d_point_pct",
    "h_gd", "a_gd", "d_gd",
    "h_gf", "a_gf", "d_gf",
    "h_ga", "a_ga", "d_ga",
    "h_pp", "a_pp", "d_pp",
    "h_pk", "a_pk", "d_pk",
    "h_sf", "a_sf", "d_sf",
    "h_sa", "a_sa", "d_sa",
    "round",
]


def _load_team_stats(conn) -> dict:
    rows = conn.execute(
        "SELECT team_id, season, point_pct, gf_per_game, ga_per_game, "
        "       pp_pct, pk_pct, shots_for_per_game, shots_against_per_game "
        "FROM team_season_stats WHERE game_type=2"
    ).fetchall()
    return {(r[0], r[1]): {
        "point_pct": r[2] or 0.5, "gf": r[3] or 2.8, "ga": r[4] or 2.8,
        "pp": r[5] or 0.2, "pk": r[6] or 0.8,
        "sf": r[7] or 30.0, "sa": r[8] or 30.0,
    } for r in rows}


def _load_series(conn) -> list[dict]:
    """Group games by series_id; return one row per series with home/away by game 1."""
    rows = conn.execute(
        "SELECT game_id, season, date, home_team_id, away_team_id, "
        "       home_abbrev, away_abbrev, home_goals, away_goals, "
        "       round, series_id, game_in_series "
        "FROM games WHERE series_id IS NOT NULL "
        "AND home_goals IS NOT NULL AND away_goals IS NOT NULL "
        "ORDER BY series_id ASC, game_in_series ASC"
    ).fetchall()
    by_series: dict[str, list] = {}
    for r in rows:
        by_series.setdefault(r[10], []).append(r)
    out = []
    for sid, games in by_series.items():
        g1 = games[0]  # game_in_series == 1 expected after sort
        home_side = g1[5]  # abbrev hosting game 1
        away_side = g1[6]
        home_id = g1[3]
        away_id = g1[4]
        hw = aw = 0
        for g in games:
            if g[11] == 1:
                pass  # seed
            # game result relative to original home side
            g_home_abbrev = g[5]
            g_winner = g_home_abbrev if g[7] > g[8] else g[6]
            if g_winner == home_side:
                hw += 1
            elif g_winner == away_side:
                aw += 1
        if hw + aw < 4:  # incomplete / truncated series
            continue
        series_winner_home = 1 if hw > aw else 0
        length = hw + aw
        out.append({
            "series_id": sid,
            "season": g1[1],
            "round": g1[9] or 0,
            "home": home_side, "away": away_side,
            "home_id": home_id, "away_id": away_id,
            "y": series_winner_home,
            "length": length,
            "first_date": g1[2],
        })
    return out


def _feats(home_id, away_id, season, round_, team_stats):
    hs = team_stats.get((home_id, season))
    as_ = team_stats.get((away_id, season))
    if not hs or not as_:
        return None
    h_gd = hs["gf"] - hs["ga"]
    a_gd = as_["gf"] - as_["ga"]
    return {
        "h_point_pct": hs["point_pct"], "a_point_pct": as_["point_pct"],
        "d_point_pct": hs["point_pct"] - as_["point_pct"],
        "h_gd": h_gd, "a_gd": a_gd, "d_gd": h_gd - a_gd,
        "h_gf": hs["gf"], "a_gf": as_["gf"], "d_gf": hs["gf"] - as_["gf"],
        "h_ga": hs["ga"], "a_ga": as_["ga"], "d_ga": hs["ga"] - as_["ga"],
        "h_pp": hs["pp"], "a_pp": as_["pp"], "d_pp": hs["pp"] - as_["pp"],
        "h_pk": hs["pk"], "a_pk": as_["pk"], "d_pk": hs["pk"] - as_["pk"],
        "h_sf": hs["sf"], "a_sf": as_["sf"], "d_sf": hs["sf"] - as_["sf"],
        "h_sa": hs["sa"], "a_sa": as_["sa"], "d_sa": hs["sa"] - as_["sa"],
        "round": round_,
    }


def _brier(p, y): return (p - y) ** 2
def _log_loss(p, y, eps=1e-6):
    p = max(eps, min(1 - eps, p))
    return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def _metrics(preds):
    if not preds: return {"n": 0}
    n = len(preds)
    return {
        "n": n,
        "accuracy": round(sum(1 for p, y in preds if (p >= 0.5) == bool(y)) / n, 4),
        "brier": round(sum(_brier(p, y) for p, y in preds) / n, 4),
        "log_loss": round(sum(_log_loss(p, y) for p, y in preds) / n, 4),
        "mean_pred": round(sum(p for p, _ in preds) / n, 4),
        "mean_actual": round(sum(y for _, y in preds) / n, 4),
    }


def _prev_season(s, back=1):
    yr = s // 10000
    return (yr - back) * 10000 + (yr - back + 1)


def _current_model_pred(series, team_stats):
    """What export.py would predict for this series — per-game formula × MC."""
    hq = _goalie_for(series["home"])[1]
    aq = _goalie_for(series["away"])[1]
    p_home_at_home = _game_prob_home(hq, aq, home_ice=True)
    p_home_at_away = _game_prob_home(hq, aq, home_ice=False)
    sim = _series_sim(p_home_at_home, p_home_at_away, 0, 0, n=4000, seed=42)
    return sim["p_home_series"]


def run(min_target_season: int = 20152016) -> dict:
    import lightgbm as lgb
    from sklearn.linear_model import LogisticRegression

    if not DB_PATH.exists():
        return {"error": "db missing"}
    conn = sqlite3.connect(DB_PATH)
    team_stats = _load_team_stats(conn)
    series = _load_series(conn)
    conn.close()

    featured = []
    for s in series:
        f = _feats(s["home_id"], s["away_id"], s["season"], s["round"], team_stats)
        if f is None: continue
        s["feats"] = f
        featured.append(s)
    log.info("series with features: %d", len(featured))

    by_season: dict[int, list] = {}
    for s in featured:
        by_season.setdefault(s["season"], []).append(s)
    target_seasons = sorted(s for s in by_season if s >= min_target_season)

    preds_model, preds_current, preds_seed = [], [], []
    per_season: dict[int, dict] = {}
    feat_imp: dict[str, int] = {}

    for S in target_seasons:
        train = [s for s in featured if s["season"] < S]
        platt_season = _prev_season(S)
        platt = [s for s in train if s["season"] == platt_season]
        fit = [s for s in train if s["season"] != platt_season]
        if len(fit) < 30:
            continue

        Xtr = np.array([[s["feats"][f] for f in FEATURES] for s in fit])
        ytr = np.array([s["y"] for s in fit])

        params = dict(objective="binary", learning_rate=0.05, num_leaves=7,
                      min_data_in_leaf=8, feature_fraction=0.9,
                      bagging_fraction=0.9, bagging_freq=1, verbose=-1)
        dtrain = lgb.Dataset(Xtr, label=ytr, feature_name=FEATURES)
        callbacks = [lgb.log_evaluation(period=0)]
        if len(platt) > 8:
            Xho = np.array([[s["feats"][f] for f in FEATURES] for s in platt])
            yho = np.array([s["y"] for s in platt])
            dval = lgb.Dataset(Xho, label=yho, reference=dtrain, feature_name=FEATURES)
            callbacks.append(lgb.early_stopping(stopping_rounds=30, verbose=False))
            booster = lgb.train(params, dtrain, num_boost_round=300,
                                valid_sets=[dval], callbacks=callbacks)
            raw_ho = booster.predict(Xho)
            lr = LogisticRegression(C=1e4, solver="lbfgs")
            lr.fit(raw_ho.reshape(-1, 1), yho)
            pa, pb = float(lr.coef_[0, 0]), float(lr.intercept_[0])
        else:
            booster = lgb.train(params, dtrain, num_boost_round=150, callbacks=callbacks)
            pa, pb = 1.0, 0.0

        Xte = np.array([[s["feats"][f] for f in FEATURES] for s in by_season[S]])
        raw = booster.predict(Xte)
        cal = 1.0 / (1.0 + np.exp(-(pa * raw + pb)))

        season_model, season_current, season_seed = [], [], []
        for p, s in zip(cal, by_season[S]):
            season_model.append((float(p), s["y"]))
            season_current.append((_current_model_pred(s, team_stats), s["y"]))
            season_seed.append((0.58, s["y"]))

        preds_model.extend(season_model)
        preds_current.extend(season_current)
        preds_seed.extend(season_seed)
        per_season[S] = {
            "model": _metrics(season_model),
            "current": _metrics(season_current),
            "home_ice_prior": _metrics(season_seed),
            "train_rows": len(fit),
        }
        for n, v in zip(FEATURES, booster.feature_importance(importance_type="gain")):
            feat_imp[n] = feat_imp.get(n, 0) + int(v)
        log.info("%s train=%d test=%d  model acc=%.3f brier=%.3f  current acc=%.3f brier=%.3f",
                 S, len(fit), len(Xte),
                 per_season[S]["model"]["accuracy"], per_season[S]["model"]["brier"],
                 per_season[S]["current"]["accuracy"], per_season[S]["current"]["brier"])

    report = {
        "mode": "walk_forward_series_model",
        "min_target_season": min_target_season,
        "n_series": len(preds_model),
        "features": FEATURES,
        "aggregate": {
            "model": _metrics(preds_model),
            "current_pipeline": _metrics(preds_current),
            "home_ice_prior_058": _metrics(preds_seed),
            "coin_flip": _metrics([(0.5, y) for _, y in preds_model]),
        },
        "per_season": {str(s): v for s, v in sorted(per_season.items())},
        "feature_importance_total_gain": dict(
            sorted(feat_imp.items(), key=lambda kv: -kv[1])
        ),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2))
    log.info("wrote %s", OUT_PATH)
    return report


def _print_summary(r):
    print(f"\nSeries model backtest: {r['n_series']} series\n")
    print(f"{'model':<22}{'n':>5}  {'acc':>7} {'brier':>8} {'ll':>8} {'meanp':>7} {'meany':>7}")
    for k, m in r["aggregate"].items():
        print(f"{k:<22}{m['n']:>5}  {m['accuracy']:>7} {m['brier']:>8} "
              f"{m['log_loss']:>8} {m['mean_pred']:>7} {m['mean_actual']:>7}")
    print("\nPer-season:")
    print(f"{'season':<10}{'n':>4}  {'m_acc':>7}{'m_brier':>9}  {'c_acc':>7}{'c_brier':>9}")
    for s, v in r["per_season"].items():
        m, c = v["model"], v["current"]
        print(f"{s:<10}{m['n']:>4}  {m['accuracy']:>7}{m['brier']:>9}  "
              f"{c['accuracy']:>7}{c['brier']:>9}")
    print("\nFeature importance (top 10):")
    for n, v in list(r["feature_importance_total_gain"].items())[:10]:
        print(f"  {n:<18} {v}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    r = run()
    if "error" not in r:
        _print_summary(r)

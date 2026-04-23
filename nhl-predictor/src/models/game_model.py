"""LightGBM game-level win-probability model with Platt calibration.

Trained on historical NHL playoff games (via `ingestion.fetch_games`) using
regular-season team summary stats (via `ingestion.fetch_team_stats`) +
series state + round.

Consumers call `predict_p_home(...)` for the probability the home team
(arena host) wins a given playoff game.
"""
from __future__ import annotations

import logging
import pickle
import sqlite3
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

REPO = Path(__file__).resolve().parents[2]
DB_PATH = REPO / "data" / "nhl.sqlite"
MODEL_PATH = REPO / "data" / "processed" / "game_model.pkl"
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

FEATURES = [
    "h_point_pct", "h_gf", "h_ga", "h_gd", "h_pp", "h_pk", "h_sf", "h_sa",
    "a_point_pct", "a_gf", "a_ga", "a_gd", "a_pp", "a_pk", "a_sf", "a_sa",
    "d_point_pct", "d_gf", "d_ga", "d_gd", "d_pp", "d_pk", "d_sf", "d_sa",
    "days_rest_home", "days_rest_away",
    "home_series_wins", "away_series_wins",
    "game_in_series", "round", "elimination_flag",
]

DEFAULT_TEAM_STATS = {
    "point_pct": 0.5, "gf": 2.9, "ga": 2.9, "pp": 0.20, "pk": 0.80,
    "sf": 30.0, "sa": 30.0,
}


def _team_stats_map() -> dict[tuple[int, int], dict]:
    if not DB_PATH.exists():
        return {}
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT team_id, season, point_pct, gf_per_game, ga_per_game, "
            "       pp_pct, pk_pct, shots_for_per_game, shots_against_per_game "
            "FROM team_season_stats WHERE game_type=2"
        ).fetchall()
    except sqlite3.OperationalError:
        return {}
    finally:
        conn.close()
    return {(r[0], r[1]): {
        "point_pct": r[2] or 0.5, "gf": r[3] or 2.9, "ga": r[4] or 2.9,
        "pp": r[5] or 0.20, "pk": r[6] or 0.80,
        "sf": r[7] or 30.0, "sa": r[8] or 30.0,
    } for r in rows}


def _games_with_context() -> list[dict]:
    """Historical playoff game rows enriched with per-team rest + series state."""
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT game_id, season, date, home_team_id, away_team_id, "
        "       home_abbrev, away_abbrev, home_goals, away_goals, "
        "       round, series_id, game_in_series "
        "FROM games WHERE series_id IS NOT NULL "
        "AND home_goals IS NOT NULL AND away_goals IS NOT NULL "
        "ORDER BY date ASC, game_id ASC"
    ).fetchall()
    conn.close()
    from datetime import date as _date
    last_play: dict[str, str] = {}
    series_wins: dict[str, dict] = {}
    out = []
    for r in rows:
        gid, season, date, hid, aid, h, a, hg, ag, rnd, sid, gis = r
        sw = series_wins.setdefault(sid, {h: 0, a: 0})
        hw_pre = sw.get(h, 0)
        aw_pre = sw.get(a, 0)
        elim = 1 if (hw_pre == 3 or aw_pre == 3) else 0

        def rest(team: str) -> int:
            prev = last_play.get(team)
            if not prev: return 5
            delta = (_date.fromisoformat(date) - _date.fromisoformat(prev)).days
            return max(0, min(10, delta - 1))

        out.append({
            "game_id": gid, "season": season, "date": date,
            "home_id": hid, "away_id": aid, "home": h, "away": a,
            "home_goals": hg, "away_goals": ag,
            "round": rnd or 0, "game_in_series": gis or 1,
            "home_series_wins": hw_pre, "away_series_wins": aw_pre,
            "days_rest_home": rest(h), "days_rest_away": rest(a),
            "elimination_flag": elim,
        })
        winner = h if hg > ag else a
        sw[winner] = sw.get(winner, 0) + 1
        last_play[h] = date
        last_play[a] = date
    return out


def _build_feats(home_stats: dict, away_stats: dict, round_: int,
                 home_wins: int, away_wins: int, game_in_series: int,
                 days_rest_home: int = 2, days_rest_away: int = 2) -> list[float]:
    hs, as_ = home_stats, away_stats
    h_gd = hs["gf"] - hs["ga"]
    a_gd = as_["gf"] - as_["ga"]
    elim = 1 if (home_wins == 3 or away_wins == 3) else 0
    row = {
        "h_point_pct": hs["point_pct"], "h_gf": hs["gf"], "h_ga": hs["ga"],
        "h_gd": h_gd, "h_pp": hs["pp"], "h_pk": hs["pk"],
        "h_sf": hs["sf"], "h_sa": hs["sa"],
        "a_point_pct": as_["point_pct"], "a_gf": as_["gf"], "a_ga": as_["ga"],
        "a_gd": a_gd, "a_pp": as_["pp"], "a_pk": as_["pk"],
        "a_sf": as_["sf"], "a_sa": as_["sa"],
        "d_point_pct": hs["point_pct"] - as_["point_pct"],
        "d_gf": hs["gf"] - as_["gf"], "d_ga": hs["ga"] - as_["ga"],
        "d_gd": h_gd - a_gd, "d_pp": hs["pp"] - as_["pp"],
        "d_pk": hs["pk"] - as_["pk"], "d_sf": hs["sf"] - as_["sf"],
        "d_sa": hs["sa"] - as_["sa"],
        "days_rest_home": days_rest_home, "days_rest_away": days_rest_away,
        "home_series_wins": home_wins, "away_series_wins": away_wins,
        "game_in_series": game_in_series, "round": round_,
        "elimination_flag": elim,
    }
    return [row[f] for f in FEATURES]


class GameModel:
    """LightGBM binary classifier over 30 pre-game features."""

    def __init__(self) -> None:
        self.trained = False
        self.booster = None
        self.platt_a = 1.0
        self.platt_b = 0.0
        self.metrics: dict = {}
        self._team_stats: dict | None = None

    def team_stats(self) -> dict:
        if self._team_stats is None:
            self._team_stats = _team_stats_map()
        return self._team_stats

    def _stats_for(self, team_id: int | None, season: int) -> dict:
        if team_id is None:
            return dict(DEFAULT_TEAM_STATS)
        return self.team_stats().get((team_id, season), dict(DEFAULT_TEAM_STATS))

    def train(self, cutoff_season: int | None = None,
              platt_holdout: int | None = None,
              save: bool = True) -> dict:
        """Train on all playoff games <= cutoff_season (excluding platt_holdout),
        Platt-calibrate on platt_holdout.

        Defaults: train on everything, Platt-calibrate on the most recent season.
        """
        import lightgbm as lgb
        from sklearn.linear_model import LogisticRegression

        rows = _games_with_context()
        if not rows:
            log.warning("game_model: no training data")
            self.trained = False
            if save: self._save()
            return {"rows": 0}

        ts = self.team_stats()
        seasons = sorted({r["season"] for r in rows})
        if cutoff_season is None:
            cutoff_season = seasons[-1]
        if platt_holdout is None:
            platt_holdout = seasons[-1]

        X, y, meta = [], [], []
        for r in rows:
            if r["season"] > cutoff_season:
                continue
            hs = ts.get((r["home_id"], r["season"]))
            as_ = ts.get((r["away_id"], r["season"]))
            if not hs or not as_:
                continue
            feats = _build_feats(
                hs, as_, r["round"], r["home_series_wins"], r["away_series_wins"],
                r["game_in_series"], r["days_rest_home"], r["days_rest_away"],
            )
            X.append(feats)
            y.append(1 if r["home_goals"] > r["away_goals"] else 0)
            meta.append(r)
        if len(X) < 200:
            log.warning("game_model: only %d training rows", len(X))
            self.trained = False
            if save: self._save()
            return {"rows": len(X)}
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=int)
        hold_mask = np.array([m["season"] == platt_holdout for m in meta])
        fit_mask = ~hold_mask

        params = dict(objective="binary", learning_rate=0.05, num_leaves=15,
                      min_data_in_leaf=30, feature_fraction=0.9,
                      bagging_fraction=0.9, bagging_freq=1, verbose=-1)
        dtrain = lgb.Dataset(X[fit_mask], label=y[fit_mask], feature_name=FEATURES)
        callbacks = [lgb.log_evaluation(period=0)]
        if hold_mask.sum() > 20:
            dval = lgb.Dataset(X[hold_mask], label=y[hold_mask],
                               reference=dtrain, feature_name=FEATURES)
            callbacks.append(lgb.early_stopping(stopping_rounds=30, verbose=False))
            self.booster = lgb.train(params, dtrain, num_boost_round=500,
                                     valid_sets=[dval], callbacks=callbacks)
            raw_ho = self.booster.predict(X[hold_mask])
            lr = LogisticRegression(C=1e4, solver="lbfgs")
            lr.fit(raw_ho.reshape(-1, 1), y[hold_mask])
            self.platt_a = float(lr.coef_[0, 0])
            self.platt_b = float(lr.intercept_[0])
            from sklearn.metrics import log_loss, brier_score_loss
            cal = 1.0 / (1.0 + np.exp(-(self.platt_a * raw_ho + self.platt_b)))
            self.metrics = {
                "rows": int(len(X)),
                "fit_rows": int(fit_mask.sum()),
                "holdout_rows": int(hold_mask.sum()),
                "holdout_season": int(platt_holdout),
                "holdout_log_loss": float(log_loss(y[hold_mask], cal, labels=[0, 1])),
                "holdout_brier": float(brier_score_loss(y[hold_mask], cal)),
                "holdout_mean_pred": float(cal.mean()),
                "holdout_actual_rate": float(y[hold_mask].mean()),
            }
        else:
            self.booster = lgb.train(params, dtrain, num_boost_round=200,
                                     callbacks=callbacks)
            self.metrics = {"rows": int(len(X))}

        self.trained = True
        if save: self._save()
        log.info("game_model trained: %s", self.metrics)
        return self.metrics

    def predict_p_home(self, home_team_id: int | None, away_team_id: int | None,
                       season: int, round_: int = 1,
                       home_wins: int = 0, away_wins: int = 0,
                       game_in_series: int = 1,
                       days_rest_home: int = 2,
                       days_rest_away: int = 2) -> float | None:
        """P(home team wins this game). Returns None if untrained."""
        if not self.trained or self.booster is None:
            return None
        hs = self._stats_for(home_team_id, season)
        as_ = self._stats_for(away_team_id, season)
        feats = _build_feats(hs, as_, round_, home_wins, away_wins,
                             game_in_series, days_rest_home, days_rest_away)
        x = np.array([feats], dtype=float)
        raw = float(self.booster.predict(x)[0])
        p = 1.0 / (1.0 + np.exp(-(self.platt_a * raw + self.platt_b)))
        return max(0.05, min(0.95, float(p)))

    def _save(self) -> None:
        try:
            with MODEL_PATH.open("wb") as f:
                pickle.dump(self, f)
        except Exception as e:
            log.warning("game_model save failed: %s", e)

    # Back-compat for the old stub API; not used by production.
    def predict(self, features: dict) -> dict:
        return {"home_win_prob": 0.5, "ci_low": 0.42, "ci_high": 0.58, "warnings": []}


def load() -> GameModel:
    if MODEL_PATH.exists():
        try:
            with MODEL_PATH.open("rb") as f:
                m = pickle.load(f)
            if isinstance(m, GameModel) and m.trained:
                return m
        except Exception as e:
            log.warning("game_model load failed: %s", e)
    m = GameModel()
    m.train()
    return m


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    m = GameModel()
    print(m.train())

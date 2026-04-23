"""LightGBM goalie quality sub-model with Platt-scaling calibration.

Trains on historical playoff goalie game logs (populated by
`ingestion.fetch_goalie_stats`). Features are strictly pre-game rolling
aggregates — no lookahead. The calibrated output feeds the main game
model as `home_goalie_score` / `away_goalie_score`.
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
MODEL_PATH = REPO / "data" / "processed" / "goalie_sub_model.pkl"
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

FEATURE_COLS = [
    "sv_pct_l10", "shots_faced_l10", "starts_l10",
    "sv_pct_career", "starts_career", "playoff_starts_career",
]


def _load_playoff_logs() -> list[dict]:
    """Load all playoff goalie game rows, oldest first."""
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT goalie_id, game_id, season, date, team_id, opponent_id, decision, "
        "       shots_faced, saves, save_pct, goals_allowed "
        "FROM goalie_game_log WHERE date IS NOT NULL ORDER BY date ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _build_features(rows: list[dict]) -> tuple[np.ndarray, np.ndarray, list[dict]]:
    """Walk chronologically, emitting pre-game rolling features per row.

    Returns (X, y, meta) where y is 1 for W, 0 for L. Rows without a
    win/loss decision or without shot data are skipped.
    """
    prior: dict[int, list[dict]] = {}  # goalie_id → list of *prior* rows
    X, y, meta = [], [], []
    for r in rows:
        gid = r["goalie_id"]
        hist = prior.setdefault(gid, [])
        decision = (r.get("decision") or "").upper()
        label = 1 if decision == "W" else 0 if decision == "L" else None

        # Feature snapshot using only rows strictly prior to this game.
        last10 = hist[-10:]
        last10_sv = [h["save_pct"] for h in last10 if h["save_pct"] is not None]
        last10_shots = [h["shots_faced"] for h in last10 if h["shots_faced"] is not None]
        career_sv = [h["save_pct"] for h in hist if h["save_pct"] is not None]

        feats = {
            "sv_pct_l10": float(np.mean(last10_sv)) if last10_sv else 0.905,
            "shots_faced_l10": float(np.sum(last10_shots)) if last10_shots else 30.0 * max(1, len(last10)),
            "starts_l10": float(len(last10)),
            "sv_pct_career": float(np.mean(career_sv)) if career_sv else 0.905,
            "starts_career": float(len(hist)),
            "playoff_starts_career": float(len(hist)),
        }

        if label is not None and r.get("shots_faced") is not None:
            X.append([feats[c] for c in FEATURE_COLS])
            y.append(label)
            meta.append({**r, **feats})

        hist.append(r)

    return np.asarray(X, dtype=float), np.asarray(y, dtype=int), meta


def _fit_platt(raw_scores: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Single-variable logistic regression: P = sigmoid(a * raw + b)."""
    from sklearn.linear_model import LogisticRegression
    lr = LogisticRegression(C=1e4, solver="lbfgs")
    lr.fit(raw_scores.reshape(-1, 1), y)
    return float(lr.coef_[0, 0]), float(lr.intercept_[0])


class GoalieSubModel:
    """Calibrated goalie quality scorer."""

    def __init__(self) -> None:
        self.trained = False
        self.booster = None
        self.platt_a = 1.0
        self.platt_b = 0.0
        self.holdout_season: int | None = None
        self.metrics: dict = {}

    def train(self, as_of_season: int | str = "current", holdout_season: int = 20232024) -> dict:
        """Fit LightGBM on all games before `holdout_season`, Platt-calibrate on holdout."""
        import lightgbm as lgb

        rows = _load_playoff_logs()
        if not rows:
            log.warning("goalie_sub_model: no training data at %s", DB_PATH)
            self.trained = False
            self._save()
            return {"rows": 0}

        X, y, meta = _build_features(rows)
        if len(X) == 0:
            log.warning("goalie_sub_model: zero usable rows after feature build")
            self.trained = False
            self._save()
            return {"rows": 0}

        train_mask = np.array([m["season"] < holdout_season for m in meta])
        hold_mask = np.array([m["season"] == holdout_season for m in meta])

        if train_mask.sum() < 100:
            log.warning("goalie_sub_model: not enough training rows (%d)", train_mask.sum())
            self.trained = False
            self._save()
            return {"rows": int(len(X))}

        Xtr, ytr = X[train_mask], y[train_mask]
        Xho, yho = X[hold_mask], y[hold_mask]

        params = dict(
            objective="binary",
            learning_rate=0.05,
            num_leaves=31,
            min_data_in_leaf=20,
            feature_fraction=0.9,
            bagging_fraction=0.9,
            bagging_freq=1,
            verbose=-1,
        )
        dtrain = lgb.Dataset(Xtr, label=ytr, feature_name=FEATURE_COLS)
        callbacks = [lgb.log_evaluation(period=0)]
        if len(Xho) > 0:
            dval = lgb.Dataset(Xho, label=yho, reference=dtrain, feature_name=FEATURE_COLS)
            callbacks.append(lgb.early_stopping(stopping_rounds=25, verbose=False))
            self.booster = lgb.train(params, dtrain, num_boost_round=400,
                                     valid_sets=[dval], callbacks=callbacks)
        else:
            self.booster = lgb.train(params, dtrain, num_boost_round=200, callbacks=callbacks)

        # Platt scaling on held-out scores.
        self.holdout_season = holdout_season
        metrics: dict = {
            "rows": int(len(X)),
            "train_rows": int(train_mask.sum()),
            "holdout_rows": int(hold_mask.sum()),
        }
        if len(Xho) > 20:
            from sklearn.metrics import log_loss, brier_score_loss
            raw_ho = self.booster.predict(Xho)
            a, b = _fit_platt(raw_ho, yho)
            self.platt_a, self.platt_b = a, b
            calibrated = 1.0 / (1.0 + np.exp(-(a * raw_ho + b)))
            metrics["holdout_log_loss"] = float(log_loss(yho, calibrated, labels=[0, 1]))
            metrics["holdout_brier"] = float(brier_score_loss(yho, calibrated))
            metrics["holdout_raw_mean"] = float(raw_ho.mean())
            metrics["holdout_cal_mean"] = float(calibrated.mean())
            metrics["holdout_actual_rate"] = float(yho.mean())

        self.trained = True
        self.metrics = metrics
        self._save()
        log.info("goalie_sub_model trained: %s", metrics)
        return metrics

    def score(self, goalie_id: int | None, opponent_id: int | None, as_of_date: str) -> float:
        """Return calibrated P(goalie's team wins) in [0.25, 0.75].

        Falls back to heuristic when model/DB unavailable.
        """
        feats = self._feature_vector(goalie_id, as_of_date)
        if not self.trained or self.booster is None:
            sv = feats["sv_pct_l10"]
            return max(0.25, min(0.75, 0.5 + (sv - 0.910) * 6.0))
        x = np.array([[feats[c] for c in FEATURE_COLS]], dtype=float)
        raw = float(self.booster.predict(x)[0])
        cal = 1.0 / (1.0 + np.exp(-(self.platt_a * raw + self.platt_b)))
        return max(0.25, min(0.75, float(cal)))

    def _feature_vector(self, goalie_id: int | None, as_of_date: str) -> dict:
        defaults = {c: 0.0 for c in FEATURE_COLS}
        defaults["sv_pct_l10"] = 0.905
        defaults["sv_pct_career"] = 0.905
        defaults["shots_faced_l10"] = 300.0
        defaults["starts_l10"] = 7.0
        if goalie_id is None or not DB_PATH.exists():
            return defaults
        try:
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                "SELECT save_pct, shots_faced FROM goalie_game_log "
                "WHERE goalie_id=? AND date < ? ORDER BY date ASC",
                (goalie_id, as_of_date),
            ).fetchall()
            conn.close()
        except Exception as e:
            log.warning("goalie feature fetch failed: %s", e)
            return defaults
        if not rows:
            return defaults
        last10 = rows[-10:]
        last10_sv = [r[0] for r in last10 if r[0] is not None]
        last10_shots = [r[1] for r in last10 if r[1] is not None]
        career_sv = [r[0] for r in rows if r[0] is not None]
        return {
            "sv_pct_l10": float(np.mean(last10_sv)) if last10_sv else 0.905,
            "shots_faced_l10": float(np.sum(last10_shots)) if last10_shots else 300.0,
            "starts_l10": float(len(last10)),
            "sv_pct_career": float(np.mean(career_sv)) if career_sv else 0.905,
            "starts_career": float(len(rows)),
            "playoff_starts_career": float(len(rows)),
        }

    def _save(self) -> None:
        try:
            with MODEL_PATH.open("wb") as f:
                pickle.dump(self, f)
        except Exception as e:
            log.warning("goalie_sub_model save failed: %s", e)


def load() -> GoalieSubModel:
    if MODEL_PATH.exists():
        try:
            with MODEL_PATH.open("rb") as f:
                m = pickle.load(f)
            if isinstance(m, GoalieSubModel):
                return m
        except Exception as e:
            log.warning("goalie_sub_model load failed: %s", e)
    m = GoalieSubModel()
    m.train()
    return m


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    m = GoalieSubModel()
    print(m.train())

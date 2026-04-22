"""Calibrated XGBoost game-winner classifier.

Skeleton: logistic function over the matchup feature vector. Real training
pipeline is stubbed out in `train()`. `predict()` returns home-team win
probability with an uncertainty-widened confidence interval.
"""
from __future__ import annotations

import logging
import math
import pickle
from pathlib import Path

log = logging.getLogger(__name__)
MODEL_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "game_model.pkl"
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)


WEIGHTS = {
    "xgf_pct_diff": 0.06, "cf_pct_diff": 0.02, "ff_pct_diff": 0.02,
    "pp_pct_diff": 0.04, "pk_pct_diff": 0.04, "hdcf_pct_diff": 0.03,
    "gf60_diff_l20": 0.30, "ga60_diff_l20": 0.30,
    "goalie_score_diff": 1.60,
    "rest_diff": 0.05, "home_ice": 0.15, "h2h_win_pct": 0.30,
}


class GameModel:
    """Logistic heuristic stand-in for the trained XGBoost classifier."""

    def __init__(self) -> None:
        self.weights = dict(WEIGHTS)
        self.intercept = -0.15 * sum(1 for _ in WEIGHTS)  # nominal

    def train(self, train_seasons=range(20102011, 20222023), val_seasons=(20232024, 20242025)) -> dict:
        """Train XGBoost on `train_seasons`, validate on `val_seasons`.

        Skeleton: persists the heuristic. Real version does CV over max_depth,
        learning_rate, n_estimators, subsample, then isotonic calibration, and
        reports accuracy / Brier / log loss on the validation split.
        """
        with MODEL_PATH.open("wb") as f:
            pickle.dump(self, f)
        log.info("game_model: trained (skeleton) -> %s", MODEL_PATH)
        return {"accuracy": None, "brier": None, "log_loss": None}

    def predict(self, features: dict) -> dict:
        """Return {'home_win_prob', 'ci_low', 'ci_high', 'warnings'} for a matchup.

        Widens the confidence interval by 5pp each side if uncertainty_flag is set.
        """
        z = 0.0
        for k, w in self.weights.items():
            z += w * float(features.get(k, 0.0))
        p = 1.0 / (1.0 + math.exp(-z))
        p = max(0.05, min(0.95, p))
        band = 0.07
        warnings = []
        if features.get("uncertainty_flag"):
            band += 0.05
            warnings.append("uncertain_starter")
        return {
            "home_win_prob": p,
            "ci_low": max(0.0, p - band),
            "ci_high": min(1.0, p + band),
            "warnings": warnings,
        }


def load() -> GameModel:
    if MODEL_PATH.exists():
        try:
            with MODEL_PATH.open("rb") as f:
                return pickle.load(f)
        except Exception as e:
            log.warning("game_model load failed: %s", e)
    m = GameModel()
    m.train()
    return m

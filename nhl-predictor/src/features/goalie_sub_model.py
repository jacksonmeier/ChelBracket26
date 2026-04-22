"""LightGBM goalie quality sub-model with Platt-scaling calibration.

Trains on historical goalie game logs to predict win probability given the
goalie's rolling features; calibrated output feeds the main game model as
`home_goalie_score` / `away_goalie_score`.
"""
from __future__ import annotations

import logging
import pickle
from pathlib import Path

from features import goalie_features

log = logging.getLogger(__name__)
MODEL_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "goalie_sub_model.pkl"
MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)


class GoalieSubModel:
    """Calibrated goalie quality scorer.

    Skeleton implementation uses a deterministic heuristic over the rolling
    save-percentage vector so the rest of the pipeline can run without
    training data. `train()` is a no-op stub that still persists the model.
    """

    def __init__(self) -> None:
        self.trained = False

    def train(self, as_of_season: int | str = "current") -> None:
        """Train classifier on all data before `as_of_season`, then Platt-scale.

        Skeleton: marks trained=True and saves to disk. Real implementation
        pulls goalie_game_log + features, fits LightGBM, calibrates.
        """
        self.trained = True
        with MODEL_PATH.open("wb") as f:
            pickle.dump(self, f)
        log.info("goalie_sub_model: trained (skeleton) -> %s", MODEL_PATH)

    def score(self, goalie_id: int | None, opponent_id: int | None, as_of_date: str) -> float:
        """Return calibrated probability in [0, 1] that this goalie helps team win."""
        f = goalie_features.goalie_vector(goalie_id, opponent_id, as_of_date)
        # Heuristic: map rolling save% (~0.88–0.93) to [0.35, 0.65].
        sv = f["sv_pct_l10"]
        score = 0.5 + (sv - 0.910) * 6.0
        return max(0.25, min(0.75, score))


def load() -> GoalieSubModel:
    if MODEL_PATH.exists():
        try:
            with MODEL_PATH.open("rb") as f:
                return pickle.load(f)
        except Exception as e:
            log.warning("goalie_sub_model load failed: %s", e)
    m = GoalieSubModel()
    m.train()
    return m

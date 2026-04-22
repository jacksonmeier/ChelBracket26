"""Calibration curve + Brier score reporting."""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)
OUT_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "calibration_curve.png"


def run(preds=None, outcomes=None) -> float | None:
    """Plot a 10-bucket calibration curve and print Brier score.

    Skeleton: no-op when no predictions are passed. Real version writes the
    PNG to data/processed/calibration_curve.png.
    """
    if not preds or not outcomes:
        log.info("calibration.run: no data (skeleton)")
        return None
    try:
        import matplotlib.pyplot as plt
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        bins = [[] for _ in range(10)]
        for p, y in zip(preds, outcomes):
            bins[min(9, int(p * 10))].append((p, y))
        xs, ys = [], []
        for b in bins:
            if not b:
                continue
            xs.append(sum(p for p, _ in b) / len(b))
            ys.append(sum(y for _, y in b) / len(b))
        plt.figure(figsize=(5, 5))
        plt.plot([0, 1], [0, 1], "--", color="gray")
        plt.plot(xs, ys, "o-")
        plt.xlabel("Predicted probability")
        plt.ylabel("Observed win rate")
        plt.title("Calibration")
        plt.savefig(OUT_PATH)
        plt.close()
        brier = sum((p - y) ** 2 for p, y in zip(preds, outcomes)) / len(preds)
        print(f"Brier score: {brier:.4f}")
        return brier
    except Exception as e:
        log.warning("calibration failed: %s", e)
        return None

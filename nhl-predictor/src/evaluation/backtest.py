"""Walk-forward backtester for the game model (2019–2024)."""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def run() -> dict:
    """Re-train per year and score every game in that year's playoffs.

    Reports per-year + aggregate accuracy, Brier score, frequency the top Cup
    pick actually won, and frequency the winner was in the top 3. Skeleton
    returns an empty shell until real training data lands.
    """
    years = [2019, 2020, 2021, 2022, 2023, 2024]
    summary = {"per_year": {}, "aggregate": {"accuracy": None, "brier": None,
                                             "top1_cup_hit": None, "top3_cup_hit": None}}
    for y in years:
        summary["per_year"][y] = {"accuracy": None, "brier": None}
        log.info("backtest %s: skeleton (no training data)", y)
    return summary

"""Goalie features — rolling, per-opponent, and starter confirmation.

Starter confirmation is intentionally isolated so it can be re-queried close to
game time without recomputing the rest of the vector.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

log = logging.getLogger(__name__)
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

DEFAULTS = {
    "gsax_season": 0.0, "gsax_l10": 0.0, "gsax_playoffs_career": 0.0,
    "sv_pct_l10": 0.905, "sv_pct_hd_l10": 0.800, "sv_pct_vs_opponent": 0.905,
    "starts_l10": 7, "games_since_rest": 2, "shots_faced_l10": 300,
    "playoff_experience": 0,
}


def goalie_vector(goalie_id: int | None, opponent_id: int | None, as_of_date: str) -> dict[str, float]:
    """Compute goalie rolling/career features as of `as_of_date`.

    No lookahead — uses only goalie_game_log rows with date < as_of_date.
    Falls back to league-average defaults when data is missing.
    """
    feats = dict(DEFAULTS)
    if goalie_id is None:
        return feats
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute(
            "SELECT save_pct, shots_faced FROM goalie_game_log "
            "WHERE goalie_id=? AND date < ? ORDER BY date DESC LIMIT 10",
            (goalie_id, as_of_date),
        )
        rows = cur.fetchall()
        if rows:
            svs = [r[0] for r in rows if r[0] is not None]
            if svs:
                feats["sv_pct_l10"] = sum(svs) / len(svs)
            shots = [r[1] for r in rows if r[1] is not None]
            if shots:
                feats["shots_faced_l10"] = sum(shots)
            feats["starts_l10"] = len(rows)
        conn.close()
    except Exception as e:
        log.warning("goalie_vector fallback for %s: %s", goalie_id, e)
    return feats


def is_confirmed_starter(goalie_id: int | None, team_id: int, game_date: str) -> bool:
    """Live check whether this goalie is the confirmed starter for the given game.

    Historical backfill: returns True unconditionally so training data is usable.
    For future games this would query the NHL API lineup endpoint; the skeleton
    returns True and leaves the live check as a TODO.
    """
    if goalie_id is None:
        return False
    return True

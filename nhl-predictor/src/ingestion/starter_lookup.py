"""Live starting-goalie lookup for upcoming playoff games.

The NHL API doesn't publish a dedicated "probable starter" field for FUT
games, so we heuristically derive it from /gamecenter/<id>/landing
`matchup.goalieComparison`: the team's playoff leader with games played > 0
is the assumed starter. Tied/empty data yields `confirmed=False`.

This module is intentionally isolated from the rest of the feature pipeline
so it can be re-queried close to game time without recomputing the main
feature vector.
"""
from __future__ import annotations

import logging
from typing import Any

from . import nhl_client

log = logging.getLogger(__name__)


def _pick_starter(team_block: dict[str, Any]) -> tuple[dict | None, bool]:
    """Return (leader_dict_or_None, confirmed_bool) for one side of goalieComparison."""
    leaders = team_block.get("leaders") or []
    played = [ld for ld in leaders if (ld.get("gamesPlayed") or 0) > 0]
    if not played:
        return (leaders[0] if leaders else None), False
    if len(played) == 1:
        return played[0], True
    # Multiple goalies with starts — pick the one with more starts; flag uncertain.
    played.sort(key=lambda ld: -(ld.get("gamesPlayed") or 0))
    top = played[0]
    confirmed = (top.get("gamesPlayed") or 0) > (played[1].get("gamesPlayed") or 0) + 1
    return top, confirmed


def lookup(game_id: int | str) -> dict[str, Any]:
    """Fetch probable starters for `game_id`.

    Returns dict with shape:
        {
          "home": {"player_id", "name", "sv_pct", "gp", "confirmed"},
          "away": {...},
          "any_unconfirmed": bool,
        }
    Each side may have None values when the feed doesn't have playoff data yet.
    """
    url = f"{nhl_client.WEB_BASE}/gamecenter/{game_id}/landing"
    data = nhl_client.fetch(url, f"gamecenter_{game_id}_landing", None)
    if not data:
        return {"home": None, "away": None, "any_unconfirmed": True}

    gc = (data.get("matchup") or {}).get("goalieComparison") or {}
    out: dict[str, Any] = {}
    any_unc = False
    for side_key, feed_key in (("home", "homeTeam"), ("away", "awayTeam")):
        block = gc.get(feed_key) or {}
        leader, confirmed = _pick_starter(block)
        if not leader:
            out[side_key] = None
            any_unc = True
            continue
        any_unc = any_unc or not confirmed
        out[side_key] = {
            "player_id": leader.get("playerId"),
            "name": (leader.get("name") or {}).get("default") or "TBD",
            "sv_pct": leader.get("savePctg"),
            "gp": leader.get("gamesPlayed") or 0,
            "confirmed": confirmed,
        }
    out["any_unconfirmed"] = any_unc
    return out

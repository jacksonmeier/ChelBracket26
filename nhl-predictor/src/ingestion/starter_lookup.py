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


def _pick_starter(team_block: dict[str, Any], roster_player_ids: set[int]) -> tuple[dict | None, bool]:
    """Return (leader_dict_or_None, confirmed_bool) for one side of goalieComparison.

    Only considers leaders whose playerId appears in `roster_player_ids` for this
    team — filters out feed quirks where a goalie from a different team bubbles
    into the leaders list (e.g. midseason trades, shared playerIds).
    """
    leaders = team_block.get("leaders") or []
    if roster_player_ids:
        leaders = [ld for ld in leaders if ld.get("playerId") in roster_player_ids]
    played = [ld for ld in leaders if (ld.get("gamesPlayed") or 0) > 0]
    if not played:
        return (leaders[0] if leaders else None), False
    if len(played) == 1:
        return played[0], True
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
    # Gamecenter data changes hourly on game day — short cache TTL.
    data = nhl_client.fetch(url, f"gamecenter_{game_id}_landing", None, stale_seconds=1800)
    if not data:
        return {"home": None, "away": None, "any_unconfirmed": True}

    gc = (data.get("matchup") or {}).get("goalieComparison") or {}

    # Build team_id -> set of roster goalie playerIds from goalieSeasonStats.
    gss_goalies = ((data.get("matchup") or {}).get("goalieSeasonStats") or {}).get("goalies") or []
    roster_by_team: dict[int, set[int]] = {}
    for g in gss_goalies:
        tid = g.get("teamId")
        pid = g.get("playerId")
        if tid is None or pid is None:
            continue
        roster_by_team.setdefault(tid, set()).add(pid)

    home_team_id = (data.get("homeTeam") or {}).get("id")
    away_team_id = (data.get("awayTeam") or {}).get("id")

    out: dict[str, Any] = {}
    any_unc = False
    for side_key, feed_key, team_id in (
        ("home", "homeTeam", home_team_id),
        ("away", "awayTeam", away_team_id),
    ):
        block = gc.get(feed_key) or {}
        roster = roster_by_team.get(team_id, set())
        leader, confirmed = _pick_starter(block, roster)
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

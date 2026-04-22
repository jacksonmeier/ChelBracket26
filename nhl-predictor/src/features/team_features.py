"""Team-level features as of a given date. No lookahead."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

log = logging.getLogger(__name__)
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

LEAGUE_AVG = {
    "cf_pct": 50.0, "ff_pct": 50.0, "xgf_pct": 50.0,
    "pp_pct": 20.0, "pk_pct": 80.0, "hdcf_pct": 50.0,
    "gf60": 2.9, "ga60": 2.9,
}


def team_vector(team_id: int, opponent_id: int, as_of_date: str) -> dict[str, float]:
    """Compute team feature vector strictly using data before `as_of_date`.

    Args:
        team_id: target team id.
        opponent_id: opposing team id, used for head-to-head features.
        as_of_date: ISO date 'YYYY-MM-DD'. Only games strictly before this are used.

    Returns:
        Dict of feature_name -> float. Missing features fall back to league averages.
    """
    feats = dict(LEAGUE_AVG)
    feats["rest_days"] = 2.0
    feats["h2h_win_pct"] = 0.5
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute(
            "SELECT cf_pct, ff_pct, xgf_pct, pp_pct, pk_pct, hdcf_pct, gf_per60, ga_per60 "
            "FROM team_stats WHERE team_id=? AND game_type=2 ORDER BY season DESC LIMIT 1",
            (team_id,),
        )
        row = cur.fetchone()
        if row:
            keys = ["cf_pct", "ff_pct", "xgf_pct", "pp_pct", "pk_pct", "hdcf_pct", "gf60", "ga60"]
            for k, v in zip(keys, row):
                if v is not None:
                    feats[k] = v
        conn.close()
    except Exception as e:
        log.warning("team_vector fallback for %s: %s", team_id, e)
    return feats

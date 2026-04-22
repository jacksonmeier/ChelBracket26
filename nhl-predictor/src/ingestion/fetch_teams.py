"""Fetch per-team-season stats (regular + playoff) from 2010 to present."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from ingestion import nhl_client

log = logging.getLogger(__name__)
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS team_stats (
    team_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    game_type INTEGER NOT NULL,
    cf_pct REAL, ff_pct REAL, xgf_pct REAL,
    gf_per60 REAL, ga_per60 REAL,
    pp_pct REAL, pk_pct REAL, hdcf_pct REAL,
    sv_pct REAL, shots_for_pg REAL, shots_against_pg REAL,
    PRIMARY KEY (team_id, season, game_type)
);
"""


def fetch_all(start: int = 20102011, end: int = 20252026) -> int:
    """Fetch team_stats rows. Returns count written."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    written = 0
    season = start
    while season <= end:
        for gt in (2, 3):
            url = (
                f"{nhl_client.STATS_BASE}/team/summary"
                f"?cayenneExp=gameTypeId={gt} and seasonId={season}"
            )
            data = nhl_client.fetch(url, f"team_summary_{season}_{gt}", season)
            if not data or "data" not in data:
                continue
            for row in data["data"]:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO team_stats "
                        "(team_id, season, game_type, gf_per60, ga_per60, pp_pct, pk_pct, "
                        " sv_pct, shots_for_pg, shots_against_pg) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            row.get("teamId"),
                            season,
                            gt,
                            row.get("goalsForPerGame"),
                            row.get("goalsAgainstPerGame"),
                            row.get("powerPlayPct"),
                            row.get("penaltyKillPct"),
                            row.get("savePct"),
                            row.get("shotsForPerGame"),
                            row.get("shotsAgainstPerGame"),
                        ),
                    )
                    written += 1
                except Exception as e:
                    log.warning("team row insert failed: %s", e)
        start_yr = season // 10000
        season = (start_yr + 1) * 10000 + (start_yr + 2)
    conn.commit()
    conn.close()
    log.info("fetch_teams: wrote %d rows", written)
    return written

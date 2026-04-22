"""Fetch per-goalie playoff game logs and season aggregates."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from ingestion import nhl_client

log = logging.getLogger(__name__)
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS goalie_game_log (
    goalie_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    season INTEGER,
    date TEXT,
    team_id INTEGER,
    opponent_id INTEGER,
    decision TEXT,
    shots_faced INTEGER,
    saves INTEGER,
    save_pct REAL,
    goals_allowed INTEGER,
    hd_shots_faced INTEGER,
    hd_saves INTEGER,
    PRIMARY KEY (goalie_id, game_id)
);
CREATE TABLE IF NOT EXISTS goalie_season_stats (
    goalie_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    game_type INTEGER NOT NULL,
    gp INTEGER, wins INTEGER, losses INTEGER,
    save_pct REAL, gaa REAL, shutouts INTEGER,
    PRIMARY KEY (goalie_id, season, game_type)
);
"""


def fetch_all(start: int = 20102011, end: int = 20252026) -> int:
    """Fetch goalie logs + season aggregates. Returns rows written."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    written = 0
    season = start
    while season <= end:
        url = (
            f"{nhl_client.STATS_BASE}/goalie/summary"
            f"?cayenneExp=gameTypeId=3 and seasonId={season}"
        )
        data = nhl_client.fetch(url, f"goalie_summary_{season}_3", season)
        if data and "data" in data:
            for row in data["data"]:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO goalie_season_stats "
                        "(goalie_id, season, game_type, gp, wins, losses, save_pct, gaa, shutouts) "
                        "VALUES (?, ?, 3, ?, ?, ?, ?, ?, ?)",
                        (
                            row.get("playerId"),
                            season,
                            row.get("gamesPlayed"),
                            row.get("wins"),
                            row.get("losses"),
                            row.get("savePct"),
                            row.get("goalsAgainstAverage"),
                            row.get("shutouts"),
                        ),
                    )
                    written += 1
                except Exception as e:
                    log.warning("goalie row insert failed: %s", e)
        start_yr = season // 10000
        season = (start_yr + 1) * 10000 + (start_yr + 2)
    conn.commit()
    conn.close()
    log.info("fetch_goalies: wrote %d rows", written)
    return written

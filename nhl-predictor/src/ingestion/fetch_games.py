"""Fetch playoff game results 2010-11 through most recently completed playoff.

Writes to the `games` table in nhl.sqlite. Skeleton implementation — the real
fetcher walks every series from the playoff bracket endpoint. This version
creates the schema and a stub fetch that can be expanded.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from ingestion import nhl_client

log = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    game_id INTEGER PRIMARY KEY,
    season INTEGER NOT NULL,
    date TEXT NOT NULL,
    home_team_id INTEGER NOT NULL,
    away_team_id INTEGER NOT NULL,
    home_goals INTEGER,
    away_goals INTEGER,
    winner INTEGER,
    ot_flag INTEGER DEFAULT 0,
    game_number INTEGER,
    series_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
"""


def init_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn


def fetch_all(start_season: int = 20102011, end_season: int = 20242025) -> int:
    """Fetch and persist playoff games. Returns rows written.

    Skeleton: iterates seasons, calls the NHL API for playoff schedule, and
    upserts rows. Network failures degrade to whatever is cached.
    """
    conn = init_db()
    written = 0
    season = start_season
    while season <= end_season:
        data = nhl_client.fetch(
            f"{nhl_client.STATS_BASE}/game?cayenneExp=gameTypeId=3 and seasonId={season}",
            f"games_playoffs_{season}",
            season,
        )
        if data and "data" in data:
            for g in data["data"]:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO games "
                        "(game_id, season, date, home_team_id, away_team_id, "
                        " home_goals, away_goals, winner, ot_flag) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            g.get("id") or g.get("gameId"),
                            season,
                            g.get("gameDate", ""),
                            g.get("homeTeamId"),
                            g.get("visitingTeamId"),
                            g.get("homeScore"),
                            g.get("visitingScore"),
                            g.get("homeTeamId") if (g.get("homeScore") or 0) > (g.get("visitingScore") or 0) else g.get("visitingTeamId"),
                            1 if g.get("gameOutcome", "").startswith("OT") else 0,
                        ),
                    )
                    written += 1
                except Exception as e:
                    log.warning("row insert failed: %s", e)
        # advance one season
        start = season // 10000
        season = (start + 1) * 10000 + (start + 2)
    conn.commit()
    conn.close()
    log.info("fetch_games: wrote %d rows", written)
    return written

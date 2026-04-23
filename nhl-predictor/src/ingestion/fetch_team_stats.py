"""Fetch regular-season team summary stats per season."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from ingestion import nhl_client

log = logging.getLogger(__name__)
DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS team_season_stats (
    team_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    game_type INTEGER NOT NULL,
    team_name TEXT,
    gp INTEGER,
    wins INTEGER,
    losses INTEGER,
    ot_losses INTEGER,
    points INTEGER,
    point_pct REAL,
    gf INTEGER,
    ga INTEGER,
    gf_per_game REAL,
    ga_per_game REAL,
    pp_pct REAL,
    pk_pct REAL,
    shots_for_per_game REAL,
    shots_against_per_game REAL,
    faceoff_win_pct REAL,
    PRIMARY KEY (team_id, season, game_type)
);
CREATE INDEX IF NOT EXISTS idx_team_season ON team_season_stats(season);
"""


def _iter_seasons(start: int, end: int):
    s = start
    while s <= end:
        yield s
        yr = s // 10000
        s = (yr + 1) * 10000 + (yr + 2)


def fetch_all(start: int = 20102011, end: int = 20242025, game_type: int = 2) -> int:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    written = 0
    for season in _iter_seasons(start, end):
        url = (f"{nhl_client.STATS_BASE}/team/summary"
               f"?cayenneExp=seasonId={season} and gameTypeId={game_type}")
        data = nhl_client.fetch(url, f"team_summary_{season}_{game_type}", season)
        rows = (data or {}).get("data") or []
        for r in rows:
            conn.execute(
                "INSERT OR REPLACE INTO team_season_stats "
                "(team_id, season, game_type, team_name, gp, wins, losses, ot_losses, "
                " points, point_pct, gf, ga, gf_per_game, ga_per_game, pp_pct, pk_pct, "
                " shots_for_per_game, shots_against_per_game, faceoff_win_pct) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    r.get("teamId"), season, game_type, r.get("teamFullName"),
                    r.get("gamesPlayed"), r.get("wins"), r.get("losses"), r.get("otLosses"),
                    r.get("points"), r.get("pointPct"),
                    r.get("goalsFor"), r.get("goalsAgainst"),
                    r.get("goalsForPerGame"), r.get("goalsAgainstPerGame"),
                    r.get("powerPlayPct"), r.get("penaltyKillPct"),
                    r.get("shotsForPerGame"), r.get("shotsAgainstPerGame"),
                    r.get("faceoffWinPct"),
                ),
            )
            written += 1
        conn.commit()
        log.info("season %d: %d team rows", season, len(rows))
    conn.close()
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    n = fetch_all()
    print({"rows": n})

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


def _next_season(season: int) -> int:
    start_yr = season // 10000
    return (start_yr + 1) * 10000 + (start_yr + 2)


def _iter_seasons(start: int, end: int):
    s = start
    while s <= end:
        yield s
        s = _next_season(s)


def fetch_season_summary(season: int, game_type: int = 3) -> list[dict]:
    """Season-level playoff summary for one season. Returns list of goalie rows."""
    url = (
        f"{nhl_client.STATS_BASE}/goalie/summary"
        f"?cayenneExp=gameTypeId={game_type} and seasonId={season}"
    )
    data = nhl_client.fetch(url, f"goalie_summary_{season}_{game_type}", season)
    return (data or {}).get("data") or []


def fetch_goalie_game_log(goalie_id: int, season: int, game_type: int = 3) -> list[dict]:
    """Per-game log for one goalie in one season/game-type."""
    url = f"{nhl_client.WEB_BASE}/player/{goalie_id}/game-log/{season}/{game_type}"
    data = nhl_client.fetch(url, f"goalie_gamelog_{goalie_id}_{season}_{game_type}", season)
    return (data or {}).get("gameLog") or []


def _insert_game_log_rows(conn: sqlite3.Connection, goalie_id: int, season: int,
                          rows: list[dict]) -> int:
    written = 0
    for g in rows:
        try:
            shots = g.get("shotsAgainst")
            goals = g.get("goalsAgainst")
            saves = (shots - goals) if (shots is not None and goals is not None) else None
            sv_pct = (saves / shots) if (shots and saves is not None) else None
            conn.execute(
                "INSERT OR REPLACE INTO goalie_game_log "
                "(goalie_id, game_id, season, date, team_id, opponent_id, decision, "
                " shots_faced, saves, save_pct, goals_allowed, hd_shots_faced, hd_saves) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
                (
                    goalie_id,
                    g.get("gameId"),
                    season,
                    g.get("gameDate"),
                    g.get("teamAbbrev"),  # abbrev; we don't yet resolve → team_id
                    g.get("opponentAbbrev"),
                    g.get("decision"),
                    shots,
                    saves,
                    sv_pct,
                    goals,
                ),
            )
            written += 1
        except Exception as e:
            log.warning("game_log insert failed (%s, %s): %s", goalie_id, g.get("gameId"), e)
    return written


def fetch_all(start: int = 20102011, end: int = 20252026,
              include_game_log: bool = True, game_type: int = 3) -> dict[str, int]:
    """Fetch goalie season aggregates and (optionally) per-game logs.

    Returns {"season_rows": ..., "game_log_rows": ..., "goalies": ...}.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)

    season_rows = 0
    game_log_rows = 0
    goalie_ids: set[int] = set()

    for season in _iter_seasons(start, end):
        summary = fetch_season_summary(season, game_type)
        for row in summary:
            gid = row.get("playerId")
            if gid is None:
                continue
            goalie_ids.add(gid)
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO goalie_season_stats "
                    "(goalie_id, season, game_type, gp, wins, losses, save_pct, gaa, shutouts) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        gid, season, game_type,
                        row.get("gamesPlayed"), row.get("wins"), row.get("losses"),
                        row.get("savePct"), row.get("goalsAgainstAverage"),
                        row.get("shutouts"),
                    ),
                )
                season_rows += 1
            except Exception as e:
                log.warning("season row insert failed for %s: %s", gid, e)

            if include_game_log:
                log_rows = fetch_goalie_game_log(gid, season, game_type)
                game_log_rows += _insert_game_log_rows(conn, gid, season, log_rows)

        conn.commit()
        log.info("season %d: %d goalies, %d log rows so far", season,
                 len(summary), game_log_rows)

    conn.close()
    return {
        "season_rows": season_rows,
        "game_log_rows": game_log_rows,
        "goalies": len(goalie_ids),
    }


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=20102011)
    ap.add_argument("--end", type=int, default=20252026)
    ap.add_argument("--game-type", type=int, default=3, help="2=regular, 3=playoffs")
    ap.add_argument("--no-game-log", action="store_true")
    args = ap.parse_args()
    stats = fetch_all(args.start, args.end,
                      include_game_log=not args.no_game_log,
                      game_type=args.game_type)
    print(stats)

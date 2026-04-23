"""Fetch playoff game results 2010-11 through the most recently completed playoff.

Walks every NHL team's season schedule (`club-schedule-season/{ABBREV}/{SEASON}`)
and keeps `gameType == 3` rows, deduped on game_id. Cached through
`nhl_client.fetch`.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from ingestion import nhl_client

log = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "nhl.sqlite"

# Abbrevs that have hosted playoff games since 2010. Defunct/relocated
# franchises appear under their then-current abbrev.
TEAM_ABBREVS = [
    "ANA", "ARI", "ATL", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL",
    "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH", "NYI",
    "NYR", "OTT", "PHI", "PHX", "PIT", "SEA", "SJS", "STL", "TBL", "TOR",
    "UTA", "VAN", "VGK", "WPG", "WSH",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    game_id INTEGER PRIMARY KEY,
    season INTEGER NOT NULL,
    date TEXT NOT NULL,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_abbrev TEXT,
    away_abbrev TEXT,
    home_goals INTEGER,
    away_goals INTEGER,
    winner_abbrev TEXT,
    ot_flag INTEGER DEFAULT 0,
    round INTEGER,
    series_idx INTEGER,
    game_in_series INTEGER,
    series_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_games_series ON games(series_id);
"""


def _iter_seasons(start: int, end: int):
    s = start
    while s <= end:
        yield s
        start_yr = s // 10000
        s = (start_yr + 1) * 10000 + (start_yr + 2)


def _parse_playoff_id(game_id: int) -> tuple[int, int, int]:
    """Extract (round, series_idx, game_in_series) from a playoff game_id.

    NHL format: YYYY 03 R M G — last three digits encode round/matchup/game.
    """
    s = str(game_id)
    rnd = int(s[-3])
    series_idx = int(s[-2])
    game_n = int(s[-1])
    return rnd, series_idx, game_n


def _fetch_team_season(abbrev: str, season: int) -> list[dict]:
    url = f"{nhl_client.WEB_BASE}/club-schedule-season/{abbrev}/{season}"
    data = nhl_client.fetch(url, f"club_schedule_{abbrev}_{season}", season)
    return (data or {}).get("games") or []


def _row_from_game(g: dict) -> dict | None:
    if g.get("gameType") != 3:
        return None
    if g.get("gameState") not in ("OFF", "FINAL"):
        return None
    home = g.get("homeTeam") or {}
    away = g.get("awayTeam") or {}
    hg = home.get("score")
    ag = away.get("score")
    if hg is None or ag is None:
        return None
    gid = g.get("id")
    try:
        rnd, sidx, gn = _parse_playoff_id(gid)
    except Exception:
        rnd, sidx, gn = None, None, None
    season = g.get("season")
    series_id = f"{season}-R{rnd}-{sidx}" if rnd is not None else None
    outcome = g.get("gameOutcome") or {}
    last_period = (outcome.get("lastPeriodType") or "").upper()
    ot = 1 if last_period in ("OT", "SO") else 0
    winner = home.get("abbrev") if hg > ag else away.get("abbrev")
    return {
        "game_id": gid,
        "season": season,
        "date": g.get("gameDate", ""),
        "home_team_id": home.get("id"),
        "away_team_id": away.get("id"),
        "home_abbrev": home.get("abbrev"),
        "away_abbrev": away.get("abbrev"),
        "home_goals": hg,
        "away_goals": ag,
        "winner_abbrev": winner,
        "ot_flag": ot,
        "round": rnd,
        "series_idx": sidx,
        "game_in_series": gn,
        "series_id": series_id,
    }


def init_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn


def fetch_all(start_season: int = 20102011, end_season: int = 20252026) -> int:
    conn = init_db()
    seen: set[int] = set()
    written = 0
    for season in _iter_seasons(start_season, end_season):
        season_rows = 0
        for abbrev in TEAM_ABBREVS:
            games = _fetch_team_season(abbrev, season)
            for g in games:
                row = _row_from_game(g)
                if not row or row["game_id"] in seen:
                    continue
                seen.add(row["game_id"])
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO games "
                        "(game_id, season, date, home_team_id, away_team_id, "
                        " home_abbrev, away_abbrev, home_goals, away_goals, "
                        " winner_abbrev, ot_flag, round, series_idx, "
                        " game_in_series, series_id) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            row["game_id"], row["season"], row["date"],
                            row["home_team_id"], row["away_team_id"],
                            row["home_abbrev"], row["away_abbrev"],
                            row["home_goals"], row["away_goals"],
                            row["winner_abbrev"], row["ot_flag"],
                            row["round"], row["series_idx"],
                            row["game_in_series"], row["series_id"],
                        ),
                    )
                    written += 1
                    season_rows += 1
                except Exception as e:
                    log.warning("insert failed %s: %s", row.get("game_id"), e)
        conn.commit()
        log.info("season %d: %d new playoff games", season, season_rows)
    conn.close()
    return written


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=20102011)
    ap.add_argument("--end", type=int, default=20242025)
    args = ap.parse_args()
    n = fetch_all(args.start, args.end)
    print({"rows_written": n})

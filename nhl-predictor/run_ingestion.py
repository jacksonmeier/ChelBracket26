"""Run all ingestion fetchers and print row counts."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from ingestion import fetch_games, fetch_goalie_stats, fetch_teams  # noqa: E402


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    g = fetch_games.fetch_all()
    t = fetch_teams.fetch_all()
    go = fetch_goalie_stats.fetch_all()
    print(f"games: {g}")
    print(f"team_stats: {t}")
    print(f"goalie rows: {go}")


if __name__ == "__main__":
    main()

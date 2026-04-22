"""NHL API client with on-disk JSON caching.

Wraps api-web.nhle.com and api.nhle.com/stats/rest. Uses nhl-api-py when
available, falls back to raw requests. Cache files live in data/raw/.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

WEB_BASE = "https://api-web.nhle.com/v1"
STATS_BASE = "https://api.nhle.com/stats/rest/en"

CURRENT_SEASON = 20252026  # update annually
STALE_SECONDS = 24 * 3600


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace("?", "_").replace("&", "_").replace("=", "-")
    return RAW_DIR / f"{safe}.json"


def _is_fresh(path: Path, season: int | None, stale_seconds: int) -> bool:
    """Return True if cache is still valid.

    Completed historical seasons are never re-fetched. Current season +
    season-less requests are re-fetched after `stale_seconds`.
    """
    if not path.exists():
        return False
    if season is not None and season != CURRENT_SEASON:
        return True
    age = time.time() - path.stat().st_mtime
    return age < stale_seconds


def fetch(url: str, cache_key: str, season: int | None = None,
          stale_seconds: int = STALE_SECONDS) -> dict[str, Any] | None:
    """GET `url`, cache to disk under `cache_key`. Returns parsed JSON or None on failure.

    `stale_seconds` overrides the default 24h TTL — pass a shorter value for
    rapidly-changing data like live gamecenter feeds.
    """
    path = _cache_path(cache_key)
    if _is_fresh(path, season, stale_seconds):
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        path.write_text(json.dumps(data))
        return data
    except Exception as e:
        log.warning("fetch failed for %s: %s", url, e)
        if path.exists():
            try:
                return json.loads(path.read_text())
            except Exception:
                return None
        return None


def schedule_now() -> dict[str, Any] | None:
    """Fetch today's schedule."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return fetch(f"{WEB_BASE}/schedule/{today}", f"schedule_{today}", CURRENT_SEASON)


def playoff_bracket(season: int = CURRENT_SEASON) -> dict[str, Any] | None:
    return fetch(f"{WEB_BASE}/playoff-bracket/{season // 10000}", f"bracket_{season}", season)

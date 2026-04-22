"""Full playoff bracket Monte Carlo."""
from __future__ import annotations

import random
from typing import Any

from models import series_sim


def _simulate_series_once(home_id: int, away_id: int, home_wins: int, away_wins: int,
                          home_goalie: int | None, away_goalie: int | None, date: str) -> int:
    """Return winning team id for one Bernoulli-draw series."""
    result = series_sim.simulate_series(
        home_id, away_id, home_goalie, away_goalie,
        current_home_wins=home_wins, current_away_wins=away_wins,
        game_date=date, n_sims=200,
    )
    return home_id if random.random() < result["p_home_wins_series"] else away_id


def simulate_bracket(bracket: dict[str, Any], n_sims: int = 50_000) -> dict[str, Any]:
    """Run `n_sims` full bracket sims, chaining series_sim through every round.

    `bracket` shape: {'rounds': [[{series}, ...], ...], 'game_date': ISO}
    Returns {team_id: {round_k_prob: ..., cup_prob: ...}}.

    For speed the skeleton collapses per-series sims to a single p and samples.
    """
    results: dict[int, dict[str, float]] = {}
    date = bracket.get("game_date", "2026-04-22")
    for _ in range(n_sims):
        alive = []
        for series in bracket["rounds"][0]:
            winner = _simulate_series_once(
                series["home"], series["away"],
                series.get("home_wins", 0), series.get("away_wins", 0),
                series.get("home_goalie"), series.get("away_goalie"),
                date,
            )
            alive.append(winner)
            results.setdefault(series["home"], {"r1": 0, "r2": 0, "r3": 0, "cup": 0})
            results.setdefault(series["away"], {"r1": 0, "r2": 0, "r3": 0, "cup": 0})
            results[winner]["r1"] += 1
        for rnd in range(1, len(bracket.get("rounds", [[]])) or 4):
            next_alive = []
            for i in range(0, len(alive), 2):
                if i + 1 >= len(alive):
                    next_alive.append(alive[i])
                    continue
                w = _simulate_series_once(alive[i], alive[i + 1], 0, 0, None, None, date)
                next_alive.append(w)
                if rnd == 1:
                    results[w]["r2"] += 1
                elif rnd == 2:
                    results[w]["r3"] += 1
                elif rnd == 3:
                    results[w]["cup"] += 1
            alive = next_alive
            if len(alive) <= 1:
                if alive and rnd >= 3:
                    results[alive[0]]["cup"] += 1
                break
    out = {}
    for team_id, counts in results.items():
        out[team_id] = {k: v / n_sims for k, v in counts.items()}
    return out

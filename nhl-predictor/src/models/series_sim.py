"""Monte Carlo best-of-7 series simulator."""
from __future__ import annotations

import random
from typing import Any

from features.matchup_features import matchup_vector
from models import game_model

HOME_SCHEDULE = [True, True, False, False, True, False, True]  # games 1..7


def simulate_series(
    home_team_id: int,
    away_team_id: int,
    home_goalie_id: int | None,
    away_goalie_id: int | None,
    current_home_wins: int = 0,
    current_away_wins: int = 0,
    game_date: str = "2026-04-22",
    n_sims: int = 10_000,
) -> dict[str, Any]:
    """Simulate `n_sims` best-of-7 completions, return probabilities.

    Flips home/away via HOME_SCHEDULE; re-uses the matchup vector and just
    swaps home_ice for each game rather than recomputing features.
    """
    model = game_model.load()
    feats = matchup_vector(home_team_id, away_team_id, home_goalie_id, away_goalie_id, game_date)
    p_home_at_home = model.predict({**feats, "home_ice": 1.0})["home_win_prob"]
    flipped = {**feats, "home_ice": 0.0,
               "home_goalie_score": feats["away_goalie_score"],
               "away_goalie_score": feats["home_goalie_score"],
               "goalie_score_diff": -feats["goalie_score_diff"]}
    for k in ("xgf_pct_diff", "cf_pct_diff", "ff_pct_diff", "pp_pct_diff",
              "pk_pct_diff", "hdcf_pct_diff", "gf60_diff_l20", "ga60_diff_l20",
              "h2h_win_pct", "rest_diff"):
        if k in flipped and k != "h2h_win_pct":
            flipped[k] = -flipped[k]
    p_home_at_away = 1.0 - model.predict(flipped)["home_win_prob"]

    home_wins = 0
    length_dist = {4: 0, 5: 0, 6: 0, 7: 0}

    for _ in range(n_sims):
        hw, aw = current_home_wins, current_away_wins
        games_played = hw + aw
        while hw < 4 and aw < 4:
            is_home_game = HOME_SCHEDULE[games_played]
            p = p_home_at_home if is_home_game else p_home_at_away
            if random.random() < p:
                hw += 1
            else:
                aw += 1
            games_played += 1
        if hw == 4:
            home_wins += 1
        length_dist[games_played] = length_dist.get(games_played, 0) + 1

    p_home_series = home_wins / n_sims
    total = sum(length_dist.values()) or 1
    length_pct = {k: v / total for k, v in length_dist.items()}
    most_likely_len = max(length_pct, key=length_pct.get)
    most_likely = {
        "winner": "home" if p_home_series >= 0.5 else "away",
        "games": most_likely_len,
    }
    return {
        "p_home_wins_series": p_home_series,
        "p_away_wins_series": 1 - p_home_series,
        "length_distribution": length_pct,
        "most_likely": most_likely,
    }

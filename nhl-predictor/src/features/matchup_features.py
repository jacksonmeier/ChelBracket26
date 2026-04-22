"""Flatten team + goalie features into a single matchup vector."""
from __future__ import annotations

import logging

from features import goalie_features, goalie_sub_model, team_features

log = logging.getLogger(__name__)


def matchup_vector(
    home_team_id: int,
    away_team_id: int,
    home_goalie_id: int | None,
    away_goalie_id: int | None,
    game_date: str,
    game_id: int | None = None,
) -> dict:
    """Produce flat feature dict for the game model, plus an uncertainty flag.

    Strictly uses data available before `game_date`. Missing features are
    filled with league averages. Home and away goalie scores are kept as
    separate features in addition to the diff so the game model can learn
    asymmetric goalie effects.

    Returns dict with numeric features and boolean `uncertainty_flag`.
    """
    home = team_features.team_vector(home_team_id, away_team_id, game_date)
    away = team_features.team_vector(away_team_id, home_team_id, game_date)

    sub = goalie_sub_model.load()
    home_gs = sub.score(home_goalie_id, away_team_id, game_date)
    away_gs = sub.score(away_goalie_id, home_team_id, game_date)

    home_conf = goalie_features.is_confirmed_starter(home_goalie_id, home_team_id, game_date, game_id)
    away_conf = goalie_features.is_confirmed_starter(away_goalie_id, away_team_id, game_date, game_id)

    feats = {
        "xgf_pct_diff": home["xgf_pct"] - away["xgf_pct"],
        "cf_pct_diff":  home["cf_pct"]  - away["cf_pct"],
        "ff_pct_diff":  home["ff_pct"]  - away["ff_pct"],
        "pp_pct_diff":  home["pp_pct"]  - away["pp_pct"],
        "pk_pct_diff":  home["pk_pct"]  - away["pk_pct"],
        "hdcf_pct_diff": home["hdcf_pct"] - away["hdcf_pct"],
        "gf60_diff_l20": home["gf60"] - away["gf60"],
        "ga60_diff_l20": away["ga60"] - home["ga60"],
        "home_goalie_score": home_gs,
        "away_goalie_score": away_gs,
        "goalie_score_diff": home_gs - away_gs,
        "rest_diff": home["rest_days"] - away["rest_days"],
        "home_ice": 1.0,
        "h2h_win_pct": home["h2h_win_pct"],
        "uncertainty_flag": not (home_conf and away_conf),
    }
    return feats

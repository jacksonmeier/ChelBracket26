"""CLI entry point for single-game, series, bracket, and update commands."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from features.matchup_features import matchup_vector  # noqa: E402
from models import bracket_sim, game_model, series_sim  # noqa: E402


def cmd_game(args) -> None:
    feats = matchup_vector(args.home, args.away, args.home_goalie, args.away_goalie, args.date)
    pred = game_model.load().predict(feats)
    print(json.dumps({
        "home": args.home, "away": args.away, "date": args.date,
        "home_win_prob": pred["home_win_prob"],
        "away_win_prob": 1 - pred["home_win_prob"],
        "ci": [pred["ci_low"], pred["ci_high"]],
        "warnings": pred["warnings"],
        "home_goalie_score": feats["home_goalie_score"],
        "away_goalie_score": feats["away_goalie_score"],
        "uncertainty_flag": feats["uncertainty_flag"],
    }, indent=2))


def cmd_series(args) -> None:
    result = series_sim.simulate_series(
        args.home, args.away, args.home_goalie, args.away_goalie,
        args.home_wins, args.away_wins, args.date,
    )
    print(json.dumps(result, indent=2))


def cmd_bracket(args) -> None:
    bracket_file = Path(__file__).resolve().parents[1] / "data" / "processed" / "bracket_state.json"
    if not bracket_file.exists():
        print("No bracket state file; run export.py to fetch first.", file=sys.stderr)
        return
    bracket = json.loads(bracket_file.read_text())
    result = bracket_sim.simulate_bracket(bracket, n_sims=args.sims)
    for team_id, probs in sorted(result.items(), key=lambda kv: -kv[1].get("cup", 0)):
        print(f"{team_id}: cup={probs.get('cup', 0):.3f}")


def cmd_update(args) -> None:
    from ingestion import fetch_games, fetch_goalie_stats  # noqa: F401
    from features.goalie_sub_model import GoalieSubModel
    fetch_games.fetch_all()
    fetch_goalie_stats.fetch_all()
    GoalieSubModel().train(as_of_season="current")
    print("update complete")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    pg = sub.add_parser("game"); pg.add_argument("--home", type=int, required=True)
    pg.add_argument("--away", type=int, required=True)
    pg.add_argument("--home-goalie", type=int, dest="home_goalie", default=None)
    pg.add_argument("--away-goalie", type=int, dest="away_goalie", default=None)
    pg.add_argument("--date", required=True); pg.set_defaults(func=cmd_game)

    ps = sub.add_parser("series"); ps.add_argument("--home", type=int, required=True)
    ps.add_argument("--away", type=int, required=True)
    ps.add_argument("--home-wins", type=int, default=0)
    ps.add_argument("--away-wins", type=int, default=0)
    ps.add_argument("--home-goalie", type=int, default=None)
    ps.add_argument("--away-goalie", type=int, default=None)
    ps.add_argument("--date", default="2026-04-22"); ps.set_defaults(func=cmd_series)

    pb = sub.add_parser("bracket"); pb.add_argument("--year", type=int, default=2026)
    pb.add_argument("--sims", type=int, default=50_000); pb.set_defaults(func=cmd_bracket)

    pu = sub.add_parser("update"); pu.set_defaults(func=cmd_update)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

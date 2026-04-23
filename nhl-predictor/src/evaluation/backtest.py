"""Walk-forward backtester for the playoff game model.

Scores every historical playoff game (from `games`) using the same formula
export.py uses live: `_game_prob_home(home_q, away_q, home_ice=True)`, where
each team's `q` comes from the goalie sub-model evaluated on the starter's
pre-game feature vector. Falls back to the hand-tuned GOALIE_PRIOR when no
starter can be identified for that date.

Reports accuracy, Brier score, log-loss, and a 10-bin calibration curve
overall, per-season, and against three baselines:
  - coin flip (0.50)
  - home-ice prior (0.545 — league average home win rate in playoffs)
  - prior-only model (no goalie sub-model)

Run:
    cd nhl-predictor/src && python -m evaluation.backtest
"""
from __future__ import annotations

import json
import logging
import math
import sqlite3
import sys
from pathlib import Path

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "nhl.sqlite"
OUT_PATH = ROOT / "data" / "processed" / "backtest.json"

# Make export.py's helpers importable.
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from export import _game_prob_home, _goalie_for  # noqa: E402
from features.goalie_sub_model import GoalieSubModel, load as load_goalie_model  # noqa: E402


def _starter_for(conn: sqlite3.Connection, date: str, team: str) -> int | None:
    """Return the goalie_id that has a W/L decision for `team` on `date`."""
    row = conn.execute(
        "SELECT goalie_id FROM goalie_game_log "
        "WHERE date=? AND team_id=? AND decision IN ('W','L','O') "
        "ORDER BY shots_faced DESC LIMIT 1",
        (date, team),
    ).fetchone()
    if row:
        return row[0]
    # Fallback: highest-shots-faced goalie on that date for that team, even w/o decision.
    row = conn.execute(
        "SELECT goalie_id FROM goalie_game_log "
        "WHERE date=? AND team_id=? "
        "ORDER BY shots_faced DESC LIMIT 1",
        (date, team),
    ).fetchone()
    return row[0] if row else None


def _load_games(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT game_id, season, date, home_abbrev, away_abbrev, "
        "       home_goals, away_goals, round FROM games "
        "WHERE home_goals IS NOT NULL AND away_goals IS NOT NULL "
        "ORDER BY date ASC"
    ).fetchall()
    return [
        {
            "game_id": r[0], "season": r[1], "date": r[2],
            "home": r[3], "away": r[4],
            "home_goals": r[5], "away_goals": r[6], "round": r[7],
        }
        for r in rows
    ]


def _brier(p: float, y: int) -> float:
    return (p - y) ** 2


def _log_loss(p: float, y: int, eps: float = 1e-6) -> float:
    p = max(eps, min(1 - eps, p))
    return -(y * math.log(p) + (1 - y) * math.log(1 - p))


def _metrics(preds: list[tuple[float, int]]) -> dict:
    if not preds:
        return {"n": 0, "accuracy": None, "brier": None, "log_loss": None}
    n = len(preds)
    acc = sum(1 for p, y in preds if (p >= 0.5) == bool(y)) / n
    brier = sum(_brier(p, y) for p, y in preds) / n
    ll = sum(_log_loss(p, y) for p, y in preds) / n
    return {
        "n": n,
        "accuracy": round(acc, 4),
        "brier": round(brier, 4),
        "log_loss": round(ll, 4),
        "mean_pred": round(sum(p for p, _ in preds) / n, 4),
        "mean_actual": round(sum(y for _, y in preds) / n, 4),
    }


def _calibration(preds: list[tuple[float, int]], n_bins: int = 10) -> list[dict]:
    bins = [[] for _ in range(n_bins)]
    for p, y in preds:
        idx = min(n_bins - 1, int(p * n_bins))
        bins[idx].append((p, y))
    out = []
    for i, b in enumerate(bins):
        lo, hi = i / n_bins, (i + 1) / n_bins
        if not b:
            out.append({"bin": [round(lo, 2), round(hi, 2)], "n": 0})
            continue
        mean_p = sum(p for p, _ in b) / len(b)
        actual = sum(y for _, y in b) / len(b)
        out.append({
            "bin": [round(lo, 2), round(hi, 2)],
            "n": len(b),
            "mean_pred": round(mean_p, 4),
            "actual_rate": round(actual, 4),
        })
    return out


def _prev_season(s: int) -> int:
    start = s // 10000
    return (start - 1) * 10000 + start


def run_walk_forward(min_target_season: int = 20152016) -> dict:
    """Refit the goalie model per target season on strictly prior seasons.

    For each target season S >= min_target_season:
      - train on games with season < (S-1)
      - Platt-calibrate on season (S-1)
      - score every playoff game in S
    Aggregates out-of-sample metrics.
    """
    if not DB_PATH.exists():
        return {"error": "db missing"}
    conn = sqlite3.connect(DB_PATH)
    games = _load_games(conn)
    if not games:
        return {"error": "no games"}

    by_season: dict[int, list[dict]] = {}
    for g in games:
        by_season.setdefault(g["season"], []).append(g)

    preds_model: list[tuple[float, int]] = []
    preds_prior: list[tuple[float, int]] = []
    per_season: dict[int, dict] = {}

    target_seasons = sorted(s for s in by_season if s >= min_target_season)
    for S in target_seasons:
        platt_holdout = _prev_season(S)
        m = GoalieSubModel()
        r = m.train(holdout_season=platt_holdout, save=False)
        if not m.trained:
            log.warning("skip %s: could not train (%s)", S, r)
            continue
        log.info("target %d: trained on <%d, Platt on %d (train_rows=%d, holdout_rows=%d)",
                 S, platt_holdout, platt_holdout,
                 r.get("train_rows", 0), r.get("holdout_rows", 0))

        season_model: list[tuple[float, int]] = []
        season_prior: list[tuple[float, int]] = []
        for g in by_season[S]:
            y = 1 if g["home_goals"] > g["away_goals"] else 0
            hp = _goalie_for(g["home"])[1]
            ap = _goalie_for(g["away"])[1]
            hs = _starter_for(conn, g["date"], g["home"])
            as_ = _starter_for(conn, g["date"], g["away"])
            if hs and as_:
                hq = m.score(hs, None, g["date"])
                aq = m.score(as_, None, g["date"])
            else:
                hq, aq = hp, ap
            p_model = _game_prob_home(hq, aq, home_ice=True)
            p_prior = _game_prob_home(hp, ap, home_ice=True)
            season_model.append((p_model, y))
            season_prior.append((p_prior, y))

        preds_model.extend(season_model)
        preds_prior.extend(season_prior)
        per_season[S] = {
            "model": _metrics(season_model),
            "prior_only": _metrics(season_prior),
        }

    conn.close()

    report = {
        "mode": "walk_forward",
        "min_target_season": min_target_season,
        "n_games_scored": len(preds_model),
        "aggregate": {
            "model": _metrics(preds_model),
            "prior_only": _metrics(preds_prior),
            "home_0545": _metrics([(0.545, y) for _, y in preds_model]),
            "coin_flip": _metrics([(0.5, y) for _, y in preds_model]),
        },
        "calibration_model": _calibration(preds_model),
        "per_season": {str(s): v for s, v in sorted(per_season.items())},
    }

    out = OUT_PATH.with_name("backtest_walkforward.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    log.info("wrote %s", out)
    return report


def run() -> dict:
    """Backtest every historical playoff game. Writes backtest.json."""
    if not DB_PATH.exists():
        log.error("DB missing: %s", DB_PATH)
        return {"error": "db missing"}
    conn = sqlite3.connect(DB_PATH)
    games = _load_games(conn)
    if not games:
        log.error("no playoff games in DB")
        return {"error": "no games"}

    goalie_model = load_goalie_model()
    log.info("goalie model trained=%s, holdout=%s",
             goalie_model.trained, getattr(goalie_model, "holdout_season", None))

    preds_model: list[tuple[float, int]] = []
    preds_prior: list[tuple[float, int]] = []
    preds_home: list[tuple[float, int]] = []
    preds_flip: list[tuple[float, int]] = []
    per_season: dict[int, dict[str, list]] = {}
    skipped = 0

    for g in games:
        y = 1 if g["home_goals"] > g["away_goals"] else 0
        home_prior = _goalie_for(g["home"])[1]
        away_prior = _goalie_for(g["away"])[1]

        home_starter = _starter_for(conn, g["date"], g["home"])
        away_starter = _starter_for(conn, g["date"], g["away"])

        if goalie_model.trained and home_starter and away_starter:
            home_q = goalie_model.score(home_starter, None, g["date"])
            away_q = goalie_model.score(away_starter, None, g["date"])
        else:
            home_q = home_prior
            away_q = away_prior
            if not (home_starter and away_starter):
                skipped += 1

        p_model = _game_prob_home(home_q, away_q, home_ice=True)
        p_prior = _game_prob_home(home_prior, away_prior, home_ice=True)

        preds_model.append((p_model, y))
        preds_prior.append((p_prior, y))
        preds_home.append((0.545, y))
        preds_flip.append((0.5, y))

        bucket = per_season.setdefault(g["season"], {"model": [], "prior": []})
        bucket["model"].append((p_model, y))
        bucket["prior"].append((p_prior, y))

    conn.close()

    report = {
        "n_games": len(games),
        "n_starters_missing": skipped,
        "aggregate": {
            "model": _metrics(preds_model),
            "prior_only": _metrics(preds_prior),
            "home_0545": _metrics(preds_home),
            "coin_flip": _metrics(preds_flip),
        },
        "calibration_model": _calibration(preds_model),
        "calibration_prior": _calibration(preds_prior),
        "per_season": {
            str(s): {
                "model": _metrics(v["model"]),
                "prior_only": _metrics(v["prior"]),
            }
            for s, v in sorted(per_season.items())
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2))
    log.info("wrote %s", OUT_PATH)
    return report


def _print_summary(r: dict) -> None:
    n = r.get("n_games", r.get("n_games_scored", 0))
    miss = r.get("n_starters_missing", 0)
    print(f"\nBacktest: {n} playoff games ({miss} missing starters, fell back to prior)\n")
    print(f"{'model':<14}{'n':>6}  {'acc':>7} {'brier':>8} {'log_loss':>10} {'mean_p':>9} {'mean_y':>9}")
    for k, m in r["aggregate"].items():
        print(f"{k:<14}{m['n']:>6}  {m['accuracy']:>7} {m['brier']:>8} "
              f"{m['log_loss']:>10} {m['mean_pred']:>9} {m['mean_actual']:>9}")

    print("\nPer-season (model):")
    print(f"{'season':<10}{'n':>5}  {'acc':>7} {'brier':>8} {'log_loss':>10}")
    for s, v in r["per_season"].items():
        m = v["model"]
        print(f"{s:<10}{m['n']:>5}  {m['accuracy']:>7} {m['brier']:>8} {m['log_loss']:>10}")

    print("\nCalibration (model, 10 bins):")
    print(f"{'bin':<14}{'n':>6}  {'pred':>7}  {'actual':>7}")
    for b in r["calibration_model"]:
        if b["n"] == 0:
            print(f"{str(b['bin']):<14}{0:>6}")
            continue
        print(f"{str(b['bin']):<14}{b['n']:>6}  {b['mean_pred']:>7}  {b['actual_rate']:>7}")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--walk-forward", action="store_true",
                    help="refit goalie model per target season on prior-only data")
    ap.add_argument("--min-target", type=int, default=20152016)
    args = ap.parse_args()
    r = run_walk_forward(args.min_target) if args.walk_forward else run()
    if "error" not in r:
        _print_summary(r)

"""Export prediction JSON files to the website's data/ directory.

Pulls the live NHL playoff bracket + schedule and composes probabilities via
the goalie sub-model + game model. Falls back to a plausible mock payload if
the NHL API is unreachable. Runs locally and inside GitHub Actions.
"""
from __future__ import annotations

import json
import logging
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DATA = REPO_ROOT / "data"
WEB_DATA.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from ingestion import nhl_client, starter_lookup  # noqa: E402

log = logging.getLogger(__name__)

PLAYOFF_YEAR = 2026
HOME_SCHED = [True, True, False, False, True, False, True]  # games 1..7, top seed home


# Fallback goalie quality scores keyed by team abbrev. These stand in until
# we wire a live starter lookup. Values are hand-set in [0.45, 0.72].
GOALIE_PRIOR = {
    "BOS": ("J. Swayman",   0.62), "BUF": ("U. Luukkonen",  0.55),
    "TBL": ("A. Vasilevskiy", 0.67), "MTL": ("S. Montembeault", 0.52),
    "CAR": ("F. Andersen",  0.58), "OTT": ("L. Ullmark",    0.59),
    "PIT": ("T. Jarry",     0.54), "PHI": ("S. Ersson",     0.53),
    "COL": ("M. Blackwood", 0.56), "LAK": ("D. Kuemper",    0.57),
    "DAL": ("J. Oettinger", 0.65), "MIN": ("F. Gustavsson", 0.56),
    "VGK": ("A. Hill",      0.59), "UTA": ("K. Vejmelka",   0.54),
    "EDM": ("S. Skinner",   0.52), "ANA": ("L. Dostal",     0.53),
    "WSH": ("L. Thompson",  0.60), "NJD": ("J. Markstrom",  0.57),
    "WPG": ("C. Hellebuyck", 0.72), "TOR": ("A. Stolarz",   0.61),
    "FLA": ("S. Bobrovsky", 0.63), "NYR": ("I. Shesterkin", 0.66),
    "NYI": ("I. Sorokin",   0.60), "CBJ": ("E. Merzlikins", 0.51),
    "DET": ("A. Lyon",      0.50), "STL": ("J. Binnington", 0.54),
    "NSH": ("J. Saros",     0.61), "CGY": ("D. Wolf",       0.55),
    "VAN": ("T. Demko",     0.60), "SEA": ("J. Daccord",    0.55),
    "CHI": ("P. Mrazek",    0.48), "SJS": ("M. Blackwood",  0.47),
}


def _goalie_for(abbrev: str | None) -> tuple[str, float]:
    return GOALIE_PRIOR.get(abbrev or "", ("TBD", 0.50))


def _game_prob_home(home_goalie_q: float, away_goalie_q: float, home_ice: bool = True) -> float:
    """Logistic over goalie quality diff + home-ice bump."""
    z = 0.15 * (1.0 if home_ice else -1.0) + 2.4 * (home_goalie_q - away_goalie_q)
    return max(0.05, min(0.95, 1.0 / (1.0 + math.exp(-z))))


def _series_sim(p_home_at_home: float, p_home_at_away: float,
                home_wins: int, away_wins: int, n: int = 8000, seed: int | None = None) -> dict:
    """Monte Carlo best-of-7 from a given series state."""
    rng = random.Random(seed)
    hw_count = 0
    length = {4: 0, 5: 0, 6: 0, 7: 0}
    for _ in range(n):
        hw, aw = home_wins, away_wins
        played = hw + aw
        while hw < 4 and aw < 4:
            p = p_home_at_home if HOME_SCHED[played] else p_home_at_away
            if rng.random() < p:
                hw += 1
            else:
                aw += 1
            played += 1
        if hw == 4:
            hw_count += 1
        length[played] = length.get(played, 0) + 1
    total = sum(length.values()) or 1
    return {
        "p_home_series": hw_count / n,
        "length_distribution": {str(k): v / total for k, v in length.items()},
    }


def _bracket_live() -> list[dict] | None:
    """Fetch live playoff bracket; return simplified series list or None."""
    data = nhl_client.fetch(
        f"{nhl_client.WEB_BASE}/playoff-bracket/{PLAYOFF_YEAR}",
        f"bracket_{PLAYOFF_YEAR}0000",
        PLAYOFF_YEAR * 10000,
    )
    if not data or "series" not in data:
        return None
    out = []
    for s in data["series"]:
        top = s.get("topSeedTeam") or {}
        bot = s.get("bottomSeedTeam") or {}
        if not top.get("abbrev") or not bot.get("abbrev"):
            continue  # future round, opponents not decided yet
        out.append({
            "letter":  s.get("seriesLetter"),
            "round":   s.get("playoffRound"),
            "home":    top.get("abbrev"),
            "home_name": top.get("name", {}).get("default") or top.get("abbrev"),
            "home_id":   top.get("id"),
            "away":    bot.get("abbrev"),
            "away_name": bot.get("name", {}).get("default") or bot.get("abbrev"),
            "away_id":   bot.get("id"),
            "home_wins": s.get("topSeedWins", 0),
            "away_wins": s.get("bottomSeedWins", 0),
            "top_rank": s.get("topSeedRankAbbrev"),
            "bot_rank": s.get("bottomSeedRankAbbrev"),
        })
    return out


def _upcoming_games_live(active_series: list[dict]) -> list[dict]:
    """Fetch next 48h of playoff games via /schedule/<today>."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sched = nhl_client.fetch(
        f"{nhl_client.WEB_BASE}/schedule/{today}",
        f"schedule_{today}",
        PLAYOFF_YEAR * 10000,
    )
    if not sched:
        return []
    cutoff = datetime.now(timezone.utc) + timedelta(hours=48)
    out = []
    for day in sched.get("gameWeek", []):
        for g in day.get("games", []):
            if g.get("gameType") != 3:
                continue
            start_iso = g.get("startTimeUTC")
            if not start_iso:
                continue
            try:
                start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            except Exception:
                continue
            if start_dt > cutoff or start_dt < datetime.now(timezone.utc) - timedelta(hours=4):
                continue
            h_ab = (g.get("homeTeam") or {}).get("abbrev")
            a_ab = (g.get("awayTeam") or {}).get("abbrev")

            # Live starter lookup — isolated call, doesn't affect other features.
            starters = starter_lookup.lookup(g.get("id"))
            home_st = starters.get("home") or {}
            away_st = starters.get("away") or {}

            hg_prior = _goalie_for(h_ab)
            ag_prior = _goalie_for(a_ab)

            # Quality score blends the prior with this-playoffs data.
            # Weight grows with games played: full playoff sample (~15 gp) ≈ 0.75 live,
            # a 2-game sample is still prior-dominated.
            def quality(live: dict, prior: tuple) -> float:
                svp = live.get("sv_pct")
                gp = live.get("gp") or 0
                if svp is None or gp == 0:
                    return prior[1]
                live_q = 0.5 + (svp - 0.910) * 6.0
                weight = min(0.75, gp / 20.0)
                blended = weight * live_q + (1 - weight) * prior[1]
                return max(0.30, min(0.75, blended))

            hg_q = quality(home_st, hg_prior)
            ag_q = quality(away_st, ag_prior)
            hg_name = home_st.get("name") or hg_prior[0]
            ag_name = away_st.get("name") or ag_prior[0]

            p_home = _game_prob_home(hg_q, ag_q, home_ice=True)
            out.append({
                "game_id": g.get("id"),
                "date": start_iso,
                "home": {
                    "team": h_ab,
                    "name": (g.get("homeTeam") or {}).get("placeName", {}).get("default") or h_ab,
                    "win_pct": round(p_home, 4),
                    "goalie": hg_name,
                    "goalie_score": round(hg_q, 3),
                    "goalie_confirmed": bool(home_st.get("confirmed")),
                    "rest_days": 2,
                },
                "away": {
                    "team": a_ab,
                    "name": (g.get("awayTeam") or {}).get("placeName", {}).get("default") or a_ab,
                    "win_pct": round(1 - p_home, 4),
                    "goalie": ag_name,
                    "goalie_score": round(ag_q, 3),
                    "goalie_confirmed": bool(away_st.get("confirmed")),
                    "rest_days": 2,
                },
                "uncertain_starter": bool(starters.get("any_unconfirmed", True)),
            })
    out.sort(key=lambda x: x["date"])
    return out


def _full_bracket_sim(active_series: list[dict], n_sims: int = 20_000) -> dict:
    """Monte Carlo the entire remaining bracket, return per-team round+Cup probs.

    NHL bracket pairing: R1 series A–H advance to R2 pairs (A|B, C|D, E|F, G|H),
    which pair again in R3 (AB|CD, EF|GH), finals = AB/CD winner vs EF/GH winner.
    Each series is resolved via a quick best-of-7 Bernoulli draw using goalie
    quality. Rest/home-ice for future rounds is approximated as neutral home-ice
    for the higher-seeded survivor; goalie quality carries through.
    """
    letters = ["A", "B", "C", "D", "E", "F", "G", "H"]
    by_letter = {s["letter"]: s for s in active_series}

    teams: dict[str, dict] = {}

    def register(abbrev: str, name: str) -> None:
        teams.setdefault(abbrev, {"name": name, "r1": 0, "r2": 0, "r3": 0, "cup": 0})

    for s in active_series:
        register(s["home"], s["home_name"])
        register(s["away"], s["away_name"])

    rng = random.Random(42)

    # Precompute per-R1 series probability (home team wins series from current score).
    r1_series_p: dict[str, float] = {}
    for letter, s in by_letter.items():
        hg = _goalie_for(s["home"])[1]
        ag = _goalie_for(s["away"])[1]
        p_home_at_home = _game_prob_home(hg, ag, home_ice=True)
        p_home_at_away = _game_prob_home(hg, ag, home_ice=False)
        sim = _series_sim(p_home_at_home, p_home_at_away, s["home_wins"], s["away_wins"],
                          n=4000, seed=hash(("r1", letter)) & 0xFFFFFFFF)
        r1_series_p[letter] = sim["p_home_series"]

    for _ in range(n_sims):
        # Round 1
        r1_winners = {}
        for letter in letters:
            s = by_letter.get(letter)
            if not s:
                continue
            winner = s["home"] if rng.random() < r1_series_p[letter] else s["away"]
            r1_winners[letter] = winner
            teams[winner]["r1"] += 1

        # Round 2 pairings
        r2_pairs = [("A", "B"), ("C", "D"), ("E", "F"), ("G", "H")]
        r2_winners = []
        for a, b in r2_pairs:
            if a not in r1_winners or b not in r1_winners:
                continue
            w1, w2 = r1_winners[a], r1_winners[b]
            q1, q2 = _goalie_for(w1)[1], _goalie_for(w2)[1]
            p = _game_prob_home(q1, q2, home_ice=True)
            # Quick best-of-7 approx: series prob from per-game prob
            # Using neutral series (no current score), Bradley-Terry inflated.
            series_p = _series_p_from_game(p)
            winner = w1 if rng.random() < series_p else w2
            r2_winners.append(winner)
            teams[winner]["r2"] += 1

        # Round 3 (conference finals)
        r3_winners = []
        for i in range(0, len(r2_winners), 2):
            if i + 1 >= len(r2_winners):
                continue
            w1, w2 = r2_winners[i], r2_winners[i + 1]
            q1, q2 = _goalie_for(w1)[1], _goalie_for(w2)[1]
            p = _game_prob_home(q1, q2, home_ice=True)
            series_p = _series_p_from_game(p)
            winner = w1 if rng.random() < series_p else w2
            r3_winners.append(winner)
            teams[winner]["r3"] += 1

        # Final
        if len(r3_winners) >= 2:
            w1, w2 = r3_winners[0], r3_winners[1]
            q1, q2 = _goalie_for(w1)[1], _goalie_for(w2)[1]
            p = _game_prob_home(q1, q2, home_ice=True)
            series_p = _series_p_from_game(p)
            champ = w1 if rng.random() < series_p else w2
            teams[champ]["cup"] += 1

    return {t: {k: (v / n_sims if k != "name" else v) for k, v in d.items()} for t, d in teams.items()}


def _series_p_from_game(p_game: float) -> float:
    """Closed-form-ish series win prob from per-game prob (neutral schedule)."""
    q = 1 - p_game
    # P(win best-of-7 from 0-0) = sum over i in [0..3] C(3+i, i) * p^4 * q^i
    from math import comb
    return sum(comb(3 + i, i) * (p_game ** 4) * (q ** i) for i in range(4))


def _compose_payload(series_list: list[dict]) -> dict:
    """Run series + bracket simulations and build the four output dicts."""
    # 1. Series-level simulations for every active round-1 series.
    active_series = [s for s in series_list if (s.get("round") == 1) and (s["home_wins"] < 4 and s["away_wins"] < 4)]
    series_models = {}
    for i, s in enumerate(active_series):
        hg = _goalie_for(s["home"])
        ag = _goalie_for(s["away"])
        p_home_at_home = _game_prob_home(hg[1], ag[1], home_ice=True)
        p_home_at_away = _game_prob_home(hg[1], ag[1], home_ice=False)
        sim = _series_sim(p_home_at_home, p_home_at_away, s["home_wins"], s["away_wins"],
                          n=8000, seed=hash((s["home"], s["away"])) & 0xFFFFFFFF)
        series_models[s["letter"]] = {
            "p_home_game_home_ice": round(p_home_at_home, 4),
            "p_home_series": round(sim["p_home_series"], 4),
            "p_away_series": round(1 - sim["p_home_series"], 4),
            "length_distribution": sim["length_distribution"],
            "home_goalie": {"name": hg[0], "score": hg[1]},
            "away_goalie": {"name": ag[0], "score": ag[1]},
        }

    # 2. Full bracket Monte Carlo for Cup odds.
    bracket_probs = _full_bracket_sim(active_series, n_sims=20_000)
    cup_rows = []
    for s in active_series:
        for side in ("home", "away"):
            abbrev = s[side]; name = s[f"{side}_name"]
            probs = bracket_probs.get(abbrev, {"r1": 0, "r2": 0, "r3": 0, "cup": 0})
            cup_rows.append({
                "team": abbrev,
                "name": name,
                "round1_win_pct": round(probs["r1"], 4),
                "round2_win_pct": round(probs["r2"], 4),
                "round3_win_pct": round(probs["r3"], 4),
                "cup_win_pct":    round(probs["cup"], 4),
                "current_series": f'{s["home_wins"]}-{s["away_wins"]}',
                "opponent": s["away"] if side == "home" else s["home"],
            })
    cup_rows.sort(key=lambda r: -r["cup_win_pct"])

    # 3. Series payload for the UI.
    ui_series = []
    for s in active_series:
        m = series_models[s["letter"]]
        ld = m["length_distribution"]
        most_likely_len = max(ld, key=lambda k: ld[k])
        winner = s["home"] if m["p_home_series"] >= 0.5 else s["away"]
        ui_series.append({
            "series_id": f'{s["home"]}-{s["away"]}',
            "round": s["round"],
            "seed": f'{s.get("top_rank") or ""} vs {s.get("bot_rank") or ""}'.strip(),
            "home": {"team": s["home"], "name": s["home_name"], "wins": s["home_wins"],
                     "series_win_pct": m["p_home_series"]},
            "away": {"team": s["away"], "name": s["away_name"], "wins": s["away_wins"],
                     "series_win_pct": m["p_away_series"]},
            "length_distribution": ld,
            "most_likely": {"winner": winner, "games": most_likely_len},
        })

    upcoming = _upcoming_games_live(active_series)

    return {
        "bracket": {"teams": cup_rows},
        "series":  {"active": ui_series},
        "games":   {"upcoming": upcoming},
        "last_updated": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "round": 1,
            "n_simulations": 8000 * len(active_series),
            "source": "live" if active_series else "mock",
        },
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    series_list = _bracket_live()
    if not series_list:
        log.warning("No live bracket data — falling back to empty payload.")
        series_list = []
    payload = _compose_payload(series_list)

    (WEB_DATA / "bracket.json").write_text(json.dumps(payload["bracket"], indent=2))
    (WEB_DATA / "series.json").write_text(json.dumps(payload["series"], indent=2))
    (WEB_DATA / "games.json").write_text(json.dumps(payload["games"], indent=2))
    (WEB_DATA / "last_updated.json").write_text(json.dumps(payload["last_updated"], indent=2))

    print(f"wrote 4 JSON files to {WEB_DATA}")
    print(f"  teams in bracket: {len(payload['bracket']['teams'])}")
    print(f"  active series:    {len(payload['series']['active'])}")
    print(f"  upcoming games:   {len(payload['games']['upcoming'])}")
    print(f"  source:           {payload['last_updated']['source']}")
    print(f"  generated_at:     {payload['last_updated']['generated_at']}")


if __name__ == "__main__":
    main()

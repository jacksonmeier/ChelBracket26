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
from features.goalie_sub_model import GoalieSubModel, load as _load_goalie_model  # noqa: E402
from models.game_model import GameModel, load as _load_game_model  # noqa: E402

_GOALIE_MODEL: GoalieSubModel | None = None
_GAME_MODEL: GameModel | None = None


def _game_model() -> GameModel | None:
    global _GAME_MODEL
    if _GAME_MODEL is not None:
        return _GAME_MODEL
    try:
        _GAME_MODEL = _load_game_model()
    except Exception as e:
        log.warning("game model unavailable: %s", e)
        _GAME_MODEL = None
    return _GAME_MODEL


def _goalie_model() -> GoalieSubModel | None:
    """Return the trained goalie sub-model, caching across calls.

    Falls back to None if load/train fails so callers can default to
    GOALIE_PRIOR without crashing the whole export.
    """
    global _GOALIE_MODEL
    if _GOALIE_MODEL is not None:
        return _GOALIE_MODEL
    try:
        _GOALIE_MODEL = _load_goalie_model()
    except Exception as e:
        log.warning("goalie sub-model unavailable: %s", e)
        _GOALIE_MODEL = None
    return _GOALIE_MODEL

log = logging.getLogger(__name__)

PLAYOFF_YEAR = 2026
HOME_SCHED = [True, True, False, False, True, False, True]  # games 1..7, top seed home

# Map NHL API seriesLetter → pool series ID. Based on standard 2026 bracket ordering:
# R1 letters A–H follow NHL's division pairs; the pool uses E1–E4 for East, W1–W4 for West.
# R2 letters I–L are the winners of (A|B, C|D, E|F, G|H); pool labels them E5/E6/W5/W6.
# R3 M|N = conference finals → pool ECF/WCF. O = Stanley Cup Final → pool SCF.
LETTER_TO_POOL_SERIES = {
    "A": "E1", "B": "E2", "C": "E3", "D": "E4",
    "E": "W1", "F": "W2", "G": "W3", "H": "W4",
    "I": "E5", "J": "E6", "K": "W5", "L": "W6",
    "M": "ECF", "N": "WCF", "O": "SCF",
}


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


def _model_quality(player_id: int | None, opp_id: int | None, as_of_date: str,
                   fallback: float) -> float:
    """Score a probable starter via the goalie sub-model, else return `fallback`."""
    if player_id is None:
        return fallback
    m = _goalie_model()
    if m is None or not getattr(m, "trained", False):
        return fallback
    try:
        return float(m.score(player_id, opp_id, as_of_date))
    except Exception as e:
        log.warning("goalie_sub_model.score failed for %s: %s", player_id, e)
        return fallback


def _probable_starters(active_series: list[dict]) -> dict[str, dict]:
    """Best-effort: for each team in an active series, find a scheduled game
    in the next 7 days and run starter_lookup on it.

    Returns {team_abbrev: {"player_id", "name", "confirmed"}}.
    """
    out: dict[str, dict] = {}
    teams_needed = {s["home"] for s in active_series} | {s["away"] for s in active_series}
    today = datetime.now(timezone.utc).date()
    for offset in range(0, 8):
        if not teams_needed:
            break
        day = (today + timedelta(days=offset)).strftime("%Y-%m-%d")
        sched = nhl_client.fetch(
            f"{nhl_client.WEB_BASE}/schedule/{day}",
            f"schedule_{day}",
            PLAYOFF_YEAR * 10000,
        )
        if not sched:
            continue
        for week in sched.get("gameWeek", []):
            for g in week.get("games", []):
                if g.get("gameType") != 3:
                    continue
                h_ab = (g.get("homeTeam") or {}).get("abbrev")
                a_ab = (g.get("awayTeam") or {}).get("abbrev")
                if h_ab not in teams_needed and a_ab not in teams_needed:
                    continue
                starters = starter_lookup.lookup(g.get("id"))
                for side, ab in (("home", h_ab), ("away", a_ab)):
                    s = starters.get(side) or {}
                    if ab in teams_needed and s.get("player_id"):
                        out[ab] = {
                            "player_id": s.get("player_id"),
                            "name": s.get("name"),
                            "confirmed": bool(s.get("confirmed")),
                        }
                        teams_needed.discard(ab)
    return out


CURRENT_SEASON = 20252026


def _game_prob_home(home_goalie_q: float, away_goalie_q: float, home_ice: bool = True) -> float:
    """Fallback formula: logistic over goalie quality diff + home-ice bump."""
    z = 0.15 * (1.0 if home_ice else -1.0) + 2.4 * (home_goalie_q - away_goalie_q)
    return max(0.05, min(0.95, 1.0 / (1.0 + math.exp(-z))))


def _p_game(home_abbrev: str, away_abbrev: str,
            home_id: int | None, away_id: int | None,
            season: int = CURRENT_SEASON, round_: int = 1,
            home_wins: int = 0, away_wins: int = 0,
            game_in_series: int = 1,
            at_home_arena: bool = True,
            fallback_home_q: float = 0.5,
            fallback_away_q: float = 0.5) -> float:
    """P(the team whose arena we care about wins this game).

    `home_abbrev` / `home_id` = the team with home-ice advantage in the series.
    `at_home_arena=True`  → game is at home team's arena (games 1,2,5,7).
    `at_home_arena=False` → game is at away team's arena (games 3,4,6); we
    flip the matchup into the model and invert.

    Falls back to `_game_prob_home` if the model is untrained/unavailable.
    """
    m = _game_model()
    if m is not None and m.trained:
        if at_home_arena:
            p = m.predict_p_home(home_id, away_id, season, round_,
                                 home_wins, away_wins, game_in_series)
        else:
            p = m.predict_p_home(away_id, home_id, season, round_,
                                 away_wins, home_wins, game_in_series)
            p = None if p is None else 1.0 - p
        if p is not None:
            return max(0.05, min(0.95, p))
    return _game_prob_home(fallback_home_q, fallback_away_q,
                           home_ice=at_home_arena)


def _series_sim(p_home_at_home: float, p_home_at_away: float,
                home_wins: int, away_wins: int, n: int = 8000, seed: int | None = None) -> dict:
    """Monte Carlo best-of-7 from a given series state."""
    rng = random.Random(seed)
    hw_count = 0
    length = {4: 0, 5: 0, 6: 0, 7: 0}
    joint = {"home": {4: 0, 5: 0, 6: 0, 7: 0}, "away": {4: 0, 5: 0, 6: 0, 7: 0}}
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
            joint["home"][played] = joint["home"].get(played, 0) + 1
        else:
            joint["away"][played] = joint["away"].get(played, 0) + 1
        length[played] = length.get(played, 0) + 1
    total = sum(length.values()) or 1
    return {
        "p_home_series": hw_count / n,
        "length_distribution": {str(k): v / total for k, v in length.items()},
        "joint_distribution": {
            side: {str(k): v / total for k, v in d.items()} for side, d in joint.items()
        },
    }


def _sim_one_series(p_home_at_home: float, p_home_at_away: float,
                    hw0: int, aw0: int, rng: random.Random) -> tuple[bool, int]:
    """Play out one best-of-7 from (hw0, aw0). Returns (home_won, total_games_played)."""
    hw, aw = hw0, aw0
    played = hw + aw
    while hw < 4 and aw < 4:
        p = p_home_at_home if HOME_SCHED[played] else p_home_at_away
        if rng.random() < p:
            hw += 1
        else:
            aw += 1
        played += 1
    return hw == 4, played


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


def _series_state_for(home_ab: str, away_ab: str,
                      active_series: list[dict]) -> tuple[int, int, int, int]:
    """Return (round, this_home_wins, this_away_wins, game_in_series) for the
    series containing these two teams, viewed from the perspective of home_ab.
    Defaults to (1, 0, 0, 1) when no matching series found.
    """
    for s in active_series or []:
        if {s["home"], s["away"]} == {home_ab, away_ab}:
            if s["home"] == home_ab:
                hw, aw = s.get("home_wins", 0), s.get("away_wins", 0)
            else:
                hw, aw = s.get("away_wins", 0), s.get("home_wins", 0)
            return (s.get("round") or 1, hw, aw, hw + aw + 1)
    return (1, 0, 0, 1)


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

            h_id = (g.get("homeTeam") or {}).get("id")
            a_id = (g.get("awayTeam") or {}).get("id")
            rnd, hw, aw, gis = _series_state_for(h_ab, a_ab, active_series)
            p_home = _p_game(h_ab, a_ab, h_id, a_id,
                             round_=rnd, home_wins=hw, away_wins=aw,
                             game_in_series=gis, at_home_arena=True,
                             fallback_home_q=hg_q, fallback_away_q=ag_q)
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


def _full_bracket_sim(active_series: list[dict], n_sims: int = 20_000,
                      n_samples_keep: int = 5_000,
                      team_quality=None) -> dict:
    """Monte Carlo the entire remaining bracket.

    NHL bracket pairing: R1 series A–H advance to R2 pairs (A|B, C|D, E|F, G|H),
    which pair again in R3 (AB|CD, EF|GH), finals = AB/CD winner vs EF/GH winner.

    Returns:
        {
          "probs": {abbrev: {name, r1, r2, r3, cup}},  # aggregate probabilities
          "samples": [ { "A": ["BOS", 6], ..., "O": ["COL", 5] }, ... ],  # first n_samples_keep sims
        }
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

    def _tq(abbrev: str) -> float:
        if team_quality is not None:
            return team_quality(abbrev)
        return _goalie_for(abbrev)[1]

    abbrev_to_id: dict[str, int | None] = {}
    for s in active_series:
        abbrev_to_id[s["home"]] = s.get("home_id")
        abbrev_to_id[s["away"]] = s.get("away_id")

    # Precompute per-R1 per-game probs; series state starts at current wins.
    r1_probs: dict[str, tuple[float, float]] = {}
    for letter, s in by_letter.items():
        hg = _tq(s["home"])
        ag = _tq(s["away"])
        hw, aw = s["home_wins"], s["away_wins"]
        r1_probs[letter] = (
            _p_game(s["home"], s["away"], s.get("home_id"), s.get("away_id"),
                    round_=1, home_wins=hw, away_wins=aw,
                    game_in_series=hw + aw + 1, at_home_arena=True,
                    fallback_home_q=hg, fallback_away_q=ag),
            _p_game(s["home"], s["away"], s.get("home_id"), s.get("away_id"),
                    round_=1, home_wins=hw, away_wins=aw,
                    game_in_series=hw + aw + 1, at_home_arena=False,
                    fallback_home_q=hg, fallback_away_q=ag),
        )

    samples: list[dict] = []

    for sim_i in range(n_sims):
        sample: dict[str, list] = {}

        # Round 1
        r1_winners = {}
        for letter in letters:
            s = by_letter.get(letter)
            if not s:
                continue
            # If series already decided, emit actual result.
            if s["home_wins"] >= 4 or s["away_wins"] >= 4:
                winner = s["home"] if s["home_wins"] >= 4 else s["away"]
                games = s["home_wins"] + s["away_wins"]
            else:
                ph_home, ph_away = r1_probs[letter]
                home_won, games = _sim_one_series(ph_home, ph_away,
                                                   s["home_wins"], s["away_wins"], rng)
                winner = s["home"] if home_won else s["away"]
            r1_winners[letter] = winner
            teams[winner]["r1"] += 1
            if sim_i < n_samples_keep:
                sample[letter] = [winner, games]

        # Round 2 pairings: A|B=I, C|D=J, E|F=K, G|H=L
        r2_pairs = [("A", "B", "I"), ("C", "D", "J"), ("E", "F", "K"), ("G", "H", "L")]
        r2_winners: dict[str, str] = {}
        for a, b, rkey in r2_pairs:
            if a not in r1_winners or b not in r1_winners:
                continue
            w1, w2 = r1_winners[a], r1_winners[b]
            q1, q2 = _tq(w1), _tq(w2)
            _rnd = 2
            ph_home = _p_game(w1, w2, abbrev_to_id.get(w1), abbrev_to_id.get(w2),
                              round_=_rnd, at_home_arena=True,
                              fallback_home_q=q1, fallback_away_q=q2)
            ph_away = _p_game(w1, w2, abbrev_to_id.get(w1), abbrev_to_id.get(w2),
                              round_=_rnd, at_home_arena=False,
                              fallback_home_q=q1, fallback_away_q=q2)
            home_won, games = _sim_one_series(ph_home, ph_away, 0, 0, rng)
            winner = w1 if home_won else w2
            r2_winners[rkey] = winner
            teams[winner]["r2"] += 1
            if sim_i < n_samples_keep:
                sample[rkey] = [winner, games]

        # Round 3 (conference finals): I|J=M, K|L=N
        r3_pairs = [("I", "J", "M"), ("K", "L", "N")]
        r3_winners: dict[str, str] = {}
        for a, b, rkey in r3_pairs:
            if a not in r2_winners or b not in r2_winners:
                continue
            w1, w2 = r2_winners[a], r2_winners[b]
            q1, q2 = _tq(w1), _tq(w2)
            _rnd = 3
            ph_home = _p_game(w1, w2, abbrev_to_id.get(w1), abbrev_to_id.get(w2),
                              round_=_rnd, at_home_arena=True,
                              fallback_home_q=q1, fallback_away_q=q2)
            ph_away = _p_game(w1, w2, abbrev_to_id.get(w1), abbrev_to_id.get(w2),
                              round_=_rnd, at_home_arena=False,
                              fallback_home_q=q1, fallback_away_q=q2)
            home_won, games = _sim_one_series(ph_home, ph_away, 0, 0, rng)
            winner = w1 if home_won else w2
            r3_winners[rkey] = winner
            teams[winner]["r3"] += 1
            if sim_i < n_samples_keep:
                sample[rkey] = [winner, games]

        # Stanley Cup Final: M|N=O
        if "M" in r3_winners and "N" in r3_winners:
            w1, w2 = r3_winners["M"], r3_winners["N"]
            q1, q2 = _tq(w1), _tq(w2)
            _rnd = 4
            ph_home = _p_game(w1, w2, abbrev_to_id.get(w1), abbrev_to_id.get(w2),
                              round_=_rnd, at_home_arena=True,
                              fallback_home_q=q1, fallback_away_q=q2)
            ph_away = _p_game(w1, w2, abbrev_to_id.get(w1), abbrev_to_id.get(w2),
                              round_=_rnd, at_home_arena=False,
                              fallback_home_q=q1, fallback_away_q=q2)
            home_won, games = _sim_one_series(ph_home, ph_away, 0, 0, rng)
            champ = w1 if home_won else w2
            teams[champ]["cup"] += 1
            if sim_i < n_samples_keep:
                sample["O"] = [champ, games]

        if sim_i < n_samples_keep:
            samples.append(sample)

    probs = {t: {k: (v / n_sims if k != "name" else v) for k, v in d.items()} for t, d in teams.items()}
    return {"probs": probs, "samples": samples}


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
    today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    starter_map = _probable_starters(active_series)

    def team_quality(abbrev: str) -> float:
        prior = _goalie_for(abbrev)[1]
        st = starter_map.get(abbrev)
        if not st:
            return prior
        return _model_quality(st.get("player_id"), None, today_iso, prior)

    series_models = {}
    for i, s in enumerate(active_series):
        hg = _goalie_for(s["home"])
        ag = _goalie_for(s["away"])
        hq = team_quality(s["home"])
        aq = team_quality(s["away"])
        hw0, aw0 = s["home_wins"], s["away_wins"]
        p_home_at_home = _p_game(s["home"], s["away"],
                                 s.get("home_id"), s.get("away_id"),
                                 round_=1, home_wins=hw0, away_wins=aw0,
                                 game_in_series=hw0 + aw0 + 1,
                                 at_home_arena=True,
                                 fallback_home_q=hq, fallback_away_q=aq)
        p_home_at_away = _p_game(s["home"], s["away"],
                                 s.get("home_id"), s.get("away_id"),
                                 round_=1, home_wins=hw0, away_wins=aw0,
                                 game_in_series=hw0 + aw0 + 1,
                                 at_home_arena=False,
                                 fallback_home_q=hq, fallback_away_q=aq)
        sim = _series_sim(p_home_at_home, p_home_at_away, s["home_wins"], s["away_wins"],
                          n=8000, seed=hash((s["home"], s["away"])) & 0xFFFFFFFF)
        series_models[s["letter"]] = {
            "p_home_game_home_ice": round(p_home_at_home, 4),
            "p_home_series": round(sim["p_home_series"], 4),
            "p_away_series": round(1 - sim["p_home_series"], 4),
            "length_distribution": sim["length_distribution"],
            "joint_distribution": sim["joint_distribution"],
            "home_goalie": {"name": hg[0], "score": hg[1]},
            "away_goalie": {"name": ag[0], "score": ag[1]},
        }

    # 2. Full bracket Monte Carlo for Cup odds + sample retention for pool scoring.
    bracket_result = _full_bracket_sim(active_series, n_sims=20_000, n_samples_keep=5_000,
                                       team_quality=team_quality)
    bracket_probs = bracket_result["probs"]
    raw_samples = bracket_result["samples"]
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
        jd = m.get("joint_distribution") or {}
        best_side, best_len, best_p = "home", "7", -1.0
        for side in ("home", "away"):
            for k, p in (jd.get(side) or {}).items():
                if p > best_p:
                    best_side, best_len, best_p = side, k, p
        most_likely_len = best_len
        winner = s["home"] if best_side == "home" else s["away"]
        ui_series.append({
            "series_id": f'{s["home"]}-{s["away"]}',
            "round": s["round"],
            "seed": f'{s.get("top_rank") or ""} vs {s.get("bot_rank") or ""}'.strip(),
            "home": {"team": s["home"], "name": s["home_name"], "wins": s["home_wins"],
                     "series_win_pct": m["p_home_series"]},
            "away": {"team": s["away"], "name": s["away_name"], "wins": s["away_wins"],
                     "series_win_pct": m["p_away_series"]},
            "length_distribution": ld,
            "joint_distribution": m.get("joint_distribution"),
            "most_likely": {"winner": winner, "games": most_likely_len},
        })

    upcoming = _upcoming_games_live(active_series)

    # 4. Pool-scoring samples: translate NHL letters → pool series IDs.
    pool_series_ids = ["E1","E2","E3","E4","W1","W2","W3","W4",
                       "E5","E6","W5","W6","ECF","WCF","SCF"]
    pool_samples = []
    for s in raw_samples:
        mapped = {}
        for letter, pool_id in LETTER_TO_POOL_SERIES.items():
            if letter in s:
                mapped[pool_id] = s[letter]
        pool_samples.append(mapped)

    return {
        "bracket": {"teams": cup_rows},
        "series":  {"active": ui_series},
        "games":   {"upcoming": upcoming},
        "bracket_samples": {
            "n_samples": len(pool_samples),
            "series_ids": pool_series_ids,
            "samples": pool_samples,
        },
        "last_updated": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "round": 1,
            "n_simulations": 8000 * len(active_series),
            "source": "live" if active_series else "mock",
        },
    }


def _write_model_calibration() -> None:
    """Emit a compact calibration report for the Predictions UI.

    Pulls from the walk-forward backtest (honest OOS metrics across 2015-25)
    plus the trained production model's Platt-holdout stats.
    """
    bt_path = Path(__file__).resolve().parent / "data" / "processed" / "game_model_backtest.json"
    out: dict = {"generated_at": datetime.now(timezone.utc).isoformat()}
    if bt_path.exists():
        try:
            bt = json.loads(bt_path.read_text())
            agg = bt.get("aggregate", {})
            out["walk_forward"] = {
                "n_games": bt.get("n_games_scored"),
                "min_season": bt.get("min_target_season"),
                "model": agg.get("model"),
                "baselines": {
                    "coin_flip": agg.get("coin_flip"),
                    "home_ice_0545": agg.get("home_0545"),
                    "prior_only": agg.get("prior_only"),
                },
                "calibration": bt.get("calibration_model", []),
            }
        except Exception as e:
            log.warning("calibration: backtest read failed: %s", e)
    m = _game_model()
    if m is not None and getattr(m, "metrics", None):
        out["production_model"] = m.metrics
    (WEB_DATA / "model_calibration.json").write_text(json.dumps(out, indent=2))


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
    # Samples file is large and doesn't benefit from pretty-printing.
    (WEB_DATA / "bracket_samples.json").write_text(json.dumps(payload["bracket_samples"]))
    _write_model_calibration()

    print(f"wrote 6 JSON files to {WEB_DATA}")
    print(f"  teams in bracket: {len(payload['bracket']['teams'])}")
    print(f"  active series:    {len(payload['series']['active'])}")
    print(f"  upcoming games:   {len(payload['games']['upcoming'])}")
    print(f"  bracket samples:  {payload['bracket_samples']['n_samples']}")
    print(f"  source:           {payload['last_updated']['source']}")
    print(f"  generated_at:     {payload['last_updated']['generated_at']}")


if __name__ == "__main__":
    main()

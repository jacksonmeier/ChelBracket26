# Bracket Challenge 26

A 2026 NHL playoff bracket pool with a live, model-driven prediction layer. The site is a single-page web app (HTML/CSS/JS + Firestore) for entering brackets, scoring, and viewing standings; the engine room is a Python pipeline that ingests NHL data, trains a calibrated game-level win-probability model, and Monte Carlos every active series and the remaining bracket on a daily cron.

This README focuses on the model and prediction pipeline, with the rest of the project covered for context.

---

## Predictions pipeline

The pipeline produces four JSON files the frontend reads directly:

| File | What it holds |
|---|---|
| [data/bracket.json](data/bracket.json) | Per-team round-by-round and Cup-win probabilities |
| [data/series.json](data/series.json) | Per-active-series win prob, length distribution, joint (winner × games) distribution, top SHAP drivers |
| [data/games.json](data/games.json) | Per-game home win prob for the next 48h, with probable starters and goalie quality scores |
| [data/bracket_samples.json](data/bracket_samples.json) | Up to 5,000 raw Monte Carlo bracket samples (used by the *What If* and *Predictions* views) |
| [data/cup_odds_history.json](data/cup_odds_history.json) | Daily snapshot of Cup odds — used for sparklines and "movers" |
| [data/model_calibration.json](data/model_calibration.json) | Walk-forward calibration / reliability data shown on the Predictions page |

End-to-end flow:

```
NHL API ──► nhl-predictor/src/ingestion ──► data/nhl.sqlite
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          ▼                     ▼                     ▼
              features/team_features    features/goalie_sub_model    features/matchup_features
                          │                     │                     │
                          └──────────┬──────────┴──────────┬──────────┘
                                     ▼                     ▼
                              models/game_model    models/series_sim / bracket_sim
                                     │                     │
                                     └──────────┬──────────┘
                                                ▼
                                  nhl-predictor/export.py
                                                │
                                                ▼
                                          data/*.json
```

---

## The game-level model

The core estimator is a **LightGBM binary classifier** that predicts P(home team wins) for a single playoff game. Source: [nhl-predictor/src/models/game_model.py](nhl-predictor/src/models/game_model.py).

### Features (31 total)

All strictly **pre-game** to avoid lookahead. For each side we use full-season aggregates from the same season as the playoff game, lightly recency-blended with the prior season (75/25) to smooth one-year noise:

- Per-side: `point_pct`, `gf_per_game`, `ga_per_game`, `goal_diff`, `pp_pct`, `pk_pct`, `shots_for`, `shots_against`
- Differential ("edge") features for each of the above
- Game state: `days_rest_home`, `days_rest_away`, `home_series_wins`, `away_series_wins`, `game_in_series`, `round`, `elimination_flag`

Recency blending is a substitute for true rolling-window stats — the DB only stores full-season aggregates, so `RECENCY_BLEND_WEIGHT = 0.25` of the prior season is mixed in. This will be replaced with a real L20 rolling window once game-level regular-season stats are ingested.

### Training

- **Data:** all completed NHL playoff games in the local SQLite DB (populated by [`ingestion/fetch_games.py`](nhl-predictor/src/ingestion/fetch_games.py)), enriched with rolling per-team rest days and pre-game series state.
- **Hyperparameters:** `learning_rate=0.05`, `num_leaves=15`, `min_data_in_leaf=30`, feature/bagging fraction 0.9, early stopping on the holdout (30 rounds).
- **Holdout:** the most recent season is held out for calibration and metrics.
- **Calibration:** the raw GBDT score is calibrated with **Platt scaling** by default (`isotonic` is supported but needs more holdout data — with n<20 per tail bin we observed it saying 97% when actuals were 64%).
- **Temperature scaling:** on top of the calibrator, β ∈ [0.50, 1.00] is grid-searched on holdout log-loss. β < 1 pulls per-game probs toward 0.5, which is critical because per-game overconfidence compounds catastrophically across 4 best-of-7 rounds.
- **Clipping:** `[0.02, 0.98]` to keep series sims well-behaved.

### Backtest results

From the most recent walk-forward run (see [data/model_calibration.json](data/model_calibration.json) and [nhl-predictor/data/processed/game_model_backtest.json](nhl-predictor/data/processed/game_model_backtest.json)):

| Predictor | Brier | Log-loss | Accuracy |
|---|---|---|---|
| Coin flip | 0.2500 | 0.6931 | 0.516 |
| Home-ice (54.5%) | 0.2505 | 0.6943 | 0.516 |
| Goalie-prior only | 0.2510 | 0.6952 | 0.507 |
| **LightGBM + Platt + temperature** | **0.2512** | **0.6957** | **0.506** |

Playoff hockey is genuinely close to a coin flip — the model's edge over baselines is real but small (a couple of log-loss points), and it earns most of its value through **calibration**, not raw accuracy. The reliability curve (binned predicted vs. actual rate) lives in `model_calibration.json` and is rendered on the Predictions page.

### Explainability

`GameModel.explain(...)` returns the top-k features by `|SHAP contribution|` for any matchup. The top three drivers per active series are surfaced in [data/series.json](data/series.json) and shown in the UI.

---

## The goalie sub-model

The starter is a known weak spot in any team-level model, so goalies get their own LightGBM classifier in [nhl-predictor/src/features/goalie_sub_model.py](nhl-predictor/src/features/goalie_sub_model.py).

- **Target:** W/L decision in playoff goalie game logs.
- **Features (5):** `sv_pct_l10`, `shots_faced_l10`, `starts_l10`, `sv_pct_career`, `starts_career` — all computed from rows strictly prior to the game.
- **Calibration:** Platt scaling on the holdout season.
- **Output:** clipped to `[0.25, 0.75]` and exposed as `home_goalie_score` / `away_goalie_score` on the matchup vector.

When the live starter lookup ([`ingestion/starter_lookup.py`](nhl-predictor/src/ingestion/starter_lookup.py)) finds a confirmed starter, that quality score is **blended** with a DB-derived team prior. Weight grows with games played: a 2-game playoff sample is still prior-dominated; ~15 GP gets to ~0.75 live.

When the model is unavailable, the pipeline degrades to a heuristic `0.5 + (sv_pct − 0.910) × 6` mapped into the same `[0.25, 0.75]` range, so priors and live signal stay on one scale.

---

## Series and bracket simulation

### Per-series

Both an **exact closed-form** path and a **Monte Carlo** path are available:

- `_series_prob_exact` ([export.py](nhl-predictor/export.py)) recursively enumerates the 64 best-of-7 paths using the standard 2-2-1-1-1 home schedule (`HOME_SCHED = [T, T, F, F, T, F, T]`). Used wherever determinism matters.
- `_series_sim` runs 8,000 Monte Carlo trials per series, capturing both the win prob and the joint distribution over (winner, games).

The model is queried twice per series — once with home-ice = true (games 1, 2, 5, 7) and once with home-ice = false (games 3, 4, 6) — yielding `p_home_at_home` and `p_home_at_away`. Each game in the sim picks the right one based on `HOME_SCHED`.

### Series-level calibrator

Round-by-round compounding tends to over-amplify favorites: a model that's 5% off per game can be 15-20% off per series. To correct this, [nhl-predictor/data/processed/series_calibration.json](nhl-predictor/data/processed/series_calibration.json) holds a **walk-forward isotonic calibrator** fit on historical series outcomes. At inference time:

1. Compute the raw per-game probs `p_hh, p_ha`.
2. Compute the raw exact series prob.
3. Look up the calibrated target via the isotonic knot grid.
4. **Shrink** `p_hh, p_ha` toward 0.5 by a scalar β found via bisection so that the resulting exact series prob matches the calibrated target. This preserves the home/away-arena ratio while correcting the magnitude.

This step happens before every Monte Carlo, so individual game probs, series probs, and bracket probs all stay internally consistent.

### Full bracket

`_full_bracket_sim` ([export.py](nhl-predictor/export.py)) Monte Carlos the entire remaining bracket — typically **20,000 simulations**, with the first 5,000 saved to `bracket_samples.json` for the *What If* page. Pairings follow standard NHL playoff bracket structure (R1 letters A–H → R2 pairs A|B, C|D, E|F, G|H → conference finals → SCF). Already-decided series emit deterministic results.

To keep it fast despite re-deriving probs on every sim, the per-(matchup, round) calibrated probs are **cached** the first time they're computed and reused across all 20k iterations — series state in R1 is the only thing that changes per-sim before the cache kicks in.

---

## Data ingestion

Everything lives in a local SQLite DB at [nhl-predictor/data/nhl.sqlite](nhl-predictor/data/nhl.sqlite). The ingestion modules in [nhl-predictor/src/ingestion/](nhl-predictor/src/ingestion/) wrap the public NHL API endpoints (`api-web.nhle.com` and `api.nhle.com/stats/rest`) with a JSON cache on disk:

- `fetch_games.py` — historical playoff games + scores + series IDs
- `fetch_team_stats.py` — regular-season team summary stats by season
- `fetch_goalie_stats.py` — playoff goalie game logs (saves, shots faced, decisions)
- `fetch_teams.py` — team metadata
- `starter_lookup.py` — best-effort probable-starter detection from gamecenter feeds
- `nhl_client.py` — shared HTTP client; completed historical seasons are cached forever, current season has a 24h TTL

Run a full ingest with:

```bash
cd nhl-predictor
pip install -r requirements.txt
python run_ingestion.py
```

---

## Automation

Two GitHub Actions workflows keep the site fresh:

- **[update_predictions.yml](.github/workflows/update_predictions.yml)** — runs `export.py` daily at 10:00 UTC (and on every push to `main`). Refits the goalie sub-model with the latest playoff data, regenerates all four output JSONs, and commits them back.
- **[retrain_game_model.yml](.github/workflows/retrain_game_model.yml)** — runs Mondays at 08:00 UTC. Re-ingests playoff games + team stats, retrains the LightGBM game model, reruns the walk-forward backtest, and commits the updated `game_model.pkl` + backtest JSON.

The trained artifacts (`game_model.pkl`, `goalie_sub_model.pkl`, `series_calibration.json`, backtest JSONs) live under [nhl-predictor/data/processed/](nhl-predictor/data/processed/) and are checked into the repo so the site can deploy from any commit.

---

## CLI

[nhl-predictor/src/predict.py](nhl-predictor/src/predict.py) is a small argparse wrapper for ad-hoc queries:

```bash
# Single game
PYTHONPATH=nhl-predictor/src python -m predict game \
  --home 22 --away 6 --date 2026-04-22

# Series
PYTHONPATH=nhl-predictor/src python -m predict series \
  --home 22 --away 6 --home-wins 2 --away-wins 1 --date 2026-04-22

# Full bracket (uses data/processed/bracket_state.json)
PYTHONPATH=nhl-predictor/src python -m predict bracket --sims 50000

# Refresh data + retrain goalie model
PYTHONPATH=nhl-predictor/src python -m predict update
```

---

## The web app

The user-facing pool lives at the repo root and is plain static HTML/CSS/JS — no build step:

- [index.html](index.html) — single-page app shell, all views in one document
- [style.css](style.css) — main stylesheet
- [app.js](app.js) — view router, bracket entry, scoring, leaderboard, schedule, predictions, and *What If* renderers
- [config.js](config.js) — Firestore config (api key + project id; safe to commit, security is in Firestore rules)
- [predictions/style.css](predictions/style.css) — prediction-page-specific styles
- [logo.png](logo.png) — site logo

### Views

- **Home** — countdown, live ticker, top movers
- **Enter** — bracket entry form
- **Brackets** — view all submitted brackets
- **Leaderboard** — pool standings
- **Schedule** — upcoming games with model win probabilities
- **Stats** — pool-wide pick distribution
- **Predictions** — Cup odds chart, per-series breakdowns with SHAP drivers, calibration plot
- **What If** — pick any series outcome and see how Cup odds shift, driven by the saved 5,000 Monte Carlo samples
- **Commish** — admin tools

### Storage

Bracket entries and pool state live in **Firestore**. The prediction JSONs are static files served from the repo, so the model pipeline and the pool app are decoupled — the website works even if the Python pipeline is offline.

---

## Repo layout

```
.
├── index.html, app.js, style.css      ← static web app
├── config.js, logo.png
├── data/                              ← outputs the website reads
│   ├── bracket.json                   ← per-team round/Cup probs
│   ├── series.json                    ← per-active-series sim + drivers
│   ├── games.json                     ← next-48h game probs
│   ├── bracket_samples.json           ← 5k Monte Carlo samples
│   ├── cup_odds_history.json          ← daily snapshot history
│   ├── model_calibration.json         ← reliability curve / metrics
│   ├── teams.json, brackets.json, …   ← pool config + entries cache
├── predictions/style.css              ← Predictions page CSS
├── nhl-predictor/                     ← Python pipeline
│   ├── export.py                      ← orchestrator (writes data/*.json)
│   ├── run_ingestion.py
│   ├── requirements.txt
│   ├── data/
│   │   ├── nhl.sqlite                 ← ingested data
│   │   ├── raw/                       ← cached API responses
│   │   └── processed/
│   │       ├── game_model.pkl
│   │       ├── goalie_sub_model.pkl
│   │       ├── series_calibration.json
│   │       └── *_backtest.json
│   └── src/
│       ├── predict.py                 ← CLI
│       ├── ingestion/                 ← NHL API fetchers + SQLite writers
│       ├── features/                  ← team / goalie / matchup features
│       ├── models/                    ← game_model, series_sim, bracket_sim
│       └── evaluation/                ← walk-forward backtests + calibration
└── .github/workflows/                 ← daily predict cron + weekly retrain cron
```

---

## Local development

```bash
# 1. Pipeline
cd nhl-predictor
pip install -r requirements.txt
python run_ingestion.py          # populate data/nhl.sqlite (slow, first time only)
python export.py                 # write data/*.json at repo root

# 2. Web app
cd ..
python -m http.server 8000       # any static server works
open http://localhost:8000
```

The frontend reads `data/*.json` directly; no API server required.

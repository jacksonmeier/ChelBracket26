/* ============================================================
   ChelBracket26 — app.js
   All application logic: routing, data, scoring, rendering
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────

const COMM_PASSWORD = 'chelbracket26';

const SK = {
  BRACKETS: 'chelb26_brackets',
  RESULTS:  'chelb26_results',
  TEAMS:    'chelb26_teams',
  SETTINGS: 'chelb26_settings',
  MY_ID:    'chelb26_my_bracket_id',
};

const DB_DOCS = ['brackets', 'results', 'teams', 'settings'];

const SERIES = [
  { id:'E1',  round:1, conf:'East',  t1:'atlantic1',  t2:'ewildcard1', abbr:'Atl 1 vs E-WC1' },
  { id:'E2',  round:1, conf:'East',  t1:'atlantic2',  t2:'atlantic3',  abbr:'Atl 2 vs Atl 3' },
  { id:'E3',  round:1, conf:'East',  t1:'metro1',     t2:'ewildcard2', abbr:'Met 1 vs E-WC2' },
  { id:'E4',  round:1, conf:'East',  t1:'metro2',     t2:'metro3',     abbr:'Met 2 vs Met 3'  },
  { id:'W1',  round:1, conf:'West',  t1:'central1',   t2:'wwildcard2', abbr:'Cen 1 vs W-WC2' },
  { id:'W2',  round:1, conf:'West',  t1:'central2',   t2:'central3',   abbr:'Cen 2 vs Cen 3'  },
  { id:'W3',  round:1, conf:'West',  t1:'pacific1',   t2:'wwildcard1', abbr:'Pac 1 vs W-WC1'  },
  { id:'W4',  round:1, conf:'West',  t1:'pacific2',   t2:'pacific3',   abbr:'Pac 2 vs Pac 3'  },
  { id:'E5',  round:2, conf:'East',  from:['E1','E2'], abbr:'E-R2 Top' },
  { id:'E6',  round:2, conf:'East',  from:['E3','E4'], abbr:'E-R2 Bot' },
  { id:'W5',  round:2, conf:'West',  from:['W1','W2'], abbr:'W-R2 Top' },
  { id:'W6',  round:2, conf:'West',  from:['W3','W4'], abbr:'W-R2 Bot' },
  { id:'ECF', round:3, conf:'East',  from:['E5','E6'], abbr:'Eastern Final' },
  { id:'WCF', round:3, conf:'West',  from:['W5','W6'], abbr:'Western Final' },
  { id:'SCF', round:4, conf:'Final', from:['ECF','WCF'], abbr:'Stanley Cup Final' },
];

const BY_ID = Object.fromEntries(SERIES.map(s => [s.id, s]));

const ROUND_PTS = {
  1: { w:10, g:5,  max:15 },
  2: { w:20, g:10, max:30 },
  3: { w:30, g:15, max:45 },
  4: { w:40, g:20, max:60 },
};

const ROUND_NAMES = { 1:'First Round', 2:'Second Round', 3:'Conference Finals', 4:'Stanley Cup Final' };

const TEAM_SLOTS = [
  { key:'atlantic1',  label:'Atlantic 1st',  conf:'Eastern', div:'Atlantic' },
  { key:'atlantic2',  label:'Atlantic 2nd',  conf:'Eastern', div:'Atlantic' },
  { key:'atlantic3',  label:'Atlantic 3rd',  conf:'Eastern', div:'Atlantic' },
  { key:'ewildcard1', label:'E Wildcard 1',  conf:'Eastern', div:'Wildcard (Metro)' },
  { key:'ewildcard2', label:'E Wildcard 2',  conf:'Eastern', div:'Wildcard (Atlantic)' },
  { key:'metro1',     label:'Metro 1st',     conf:'Eastern', div:'Metropolitan' },
  { key:'metro2',     label:'Metro 2nd',     conf:'Eastern', div:'Metropolitan' },
  { key:'metro3',     label:'Metro 3rd',     conf:'Eastern', div:'Metropolitan' },
  { key:'central1',   label:'Central 1st',   conf:'Western', div:'Central' },
  { key:'central2',   label:'Central 2nd',   conf:'Western', div:'Central' },
  { key:'central3',   label:'Central 3rd',   conf:'Western', div:'Central' },
  { key:'wwildcard1', label:'W Wildcard 1',  conf:'Western', div:'Wildcard (Pacific)' },
  { key:'wwildcard2', label:'W Wildcard 2',  conf:'Western', div:'Wildcard (Central)' },
  { key:'pacific1',   label:'Pacific 1st',   conf:'Western', div:'Pacific' },
  { key:'pacific2',   label:'Pacific 2nd',   conf:'Western', div:'Pacific' },
  { key:'pacific3',   label:'Pacific 3rd',   conf:'Western', div:'Pacific' },
];

const DEFAULT_TEAMS = {
  atlantic1:  'Buffalo Sabres',
  atlantic2:  'Tampa Bay Lightning',
  atlantic3:  'Montreal Canadiens',
  ewildcard1: 'Boston Bruins',
  ewildcard2: 'Ottawa Senators',
  metro1:     'Carolina Hurricanes',
  metro2:     'Pittsburgh Penguins',
  metro3:     'Philadelphia Flyers',
  central1:   'Colorado Avalanche',
  central2:   'Dallas Stars',
  central3:   'Minnesota Wild',
  wwildcard1: 'Utah Mammoth',
  wwildcard2: 'Los Angeles Kings',
  pacific1:   'Vegas Golden Knights',
  pacific2:   'Edmonton Oilers',
  pacific3:   'Anaheim Ducks',
};
const DEFAULT_SETTINGS = { lockDate: null, hideEntryTab: false };

// Bracket canvas layout
const BW = 165, BH = 108, YGAP = 158, YTOP = 20, CW = 1420, CH = 640;
const COL = BW + 25; // horizontal step between rounds (box width + gap)
const SCF_W = 255, SCF_H = 210; // Stanley Cup Final box — height used for connector midpoint
const POSITIONS = {
  E1:{ x:0,         y:YTOP+0*YGAP }, E2:{ x:0,         y:YTOP+1*YGAP },
  E3:{ x:0,         y:YTOP+2*YGAP }, E4:{ x:0,         y:YTOP+3*YGAP },
  E5:{ x:COL,       y:YTOP+0.5*YGAP }, E6:{ x:COL,     y:YTOP+2.5*YGAP },
  ECF:{ x:2*COL,    y:YTOP+1.5*YGAP },
  SCF:{ x:Math.round((CW-SCF_W)/2), y:Math.round(YTOP+1.5*YGAP-(SCF_H-BH)/2) },
  WCF:{ x:CW-2*COL-BW, y:YTOP+1.5*YGAP },
  W5:{ x:CW-COL-BW, y:YTOP+0.5*YGAP }, W6:{ x:CW-COL-BW, y:YTOP+2.5*YGAP },
  W1:{ x:CW-BW,    y:YTOP+0*YGAP }, W2:{ x:CW-BW,     y:YTOP+1*YGAP },
  W3:{ x:CW-BW,    y:YTOP+2*YGAP }, W4:{ x:CW-BW,     y:YTOP+3*YGAP },
};
const CONNECTORS = [
  ['E1','E5','r','l'],['E2','E5','r','l'],['E3','E6','r','l'],['E4','E6','r','l'],
  ['E5','ECF','r','l'],['E6','ECF','r','l'],['ECF','SCF','r','l'],
  ['W1','W5','l','r'],['W2','W5','l','r'],['W3','W6','l','r'],['W4','W6','l','r'],
  ['W5','WCF','l','r'],['W6','WCF','l','r'],['WCF','SCF','l','r'],
];

// ── Team Logos ─────────────────────────────────────────────

const TEAM_ABBR = {
  'Buffalo Sabres':       'BUF',
  'Tampa Bay Lightning':  'TBL',
  'Montreal Canadiens':   'MTL',
  'Boston Bruins':        'BOS',
  'Ottawa Senators':      'OTT',
  'Carolina Hurricanes':  'CAR',
  'Pittsburgh Penguins':  'PIT',
  'Philadelphia Flyers':  'PHI',
  'Colorado Avalanche':   'COL',
  'Dallas Stars':         'DAL',
  'Minnesota Wild':       'MIN',
  'Utah Mammoth':         'UTA',
  'Los Angeles Kings':    'LAK',
  'Vegas Golden Knights': 'VGK',
  'Edmonton Oilers':      'EDM',
  'Anaheim Ducks':        'ANA',
};

// Short city/nickname for display in entry cards
const TEAM_CITY = {
  'Buffalo Sabres':       'Buffalo',
  'Tampa Bay Lightning':  'Tampa Bay',
  'Montreal Canadiens':   'Montréal',
  'Boston Bruins':        'Boston',
  'Ottawa Senators':      'Ottawa',
  'Carolina Hurricanes':  'Carolina',
  'Pittsburgh Penguins':  'Pittsburgh',
  'Philadelphia Flyers':  'Philadelphia',
  'Colorado Avalanche':   'Colorado',
  'Dallas Stars':         'Dallas',
  'Minnesota Wild':       'Minnesota',
  'Utah Mammoth':         'Utah',
  'Los Angeles Kings':    'LA Kings',
  'Vegas Golden Knights': 'Vegas',
  'Edmonton Oilers':      'Edmonton',
  'Anaheim Ducks':        'Anaheim',
};

function logoVariant() {
  // NHL asset convention: _light.svg is for light backgrounds (dark-colored logo),
  // _dark.svg is for dark backgrounds (light-colored logo).
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}
function logoUrlForAbbr(abbr) {
  return abbr ? `https://assets.nhle.com/logos/nhl/svg/${abbr}_${logoVariant()}.svg` : '';
}
function logoUrl(name) {
  return logoUrlForAbbr(TEAM_ABBR[name]);
}

function logoImg(name, cls) {
  const url = logoUrl(name);
  if (!url) return '';
  return `<img class="${cls}" src="${url}" alt="" onerror="this.style.display='none'">`;
}

// Re-render logos when the color scheme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    document.querySelectorAll('img[src*="assets.nhle.com/logos/nhl/svg/"]').forEach(img => {
      img.src = img.src.replace(/_(light|dark)\.svg/, `_${logoVariant()}.svg`);
      img.style.display = '';
    });
  });
}

// Update a team-pick button's abbr + text in place
function setTeamBtn(btn, name) {
  if (!btn) return;
  const abbrEl = btn.querySelector('.team-abbr-txt');
  if (abbrEl) {
    const abbr = TEAM_ABBR[name] || name.split(' ').pop().toUpperCase().slice(0, 3);
    abbrEl.textContent = abbr;
  }
  const nameEl = btn.querySelector('.team-name-txt');
  if (nameEl) {
    const city = name === 'TBD' ? '' : (TEAM_CITY[name] || name);
    nameEl.textContent = city;
    nameEl.style.display = city ? '' : 'none';
  }
  // Legacy: update logo if present
  const img = btn.querySelector('.team-logo-sm');
  if (img) { const u = logoUrl(name); img.src = u; img.style.display = u ? '' : 'none'; }
}

// ── App State ──────────────────────────────────────────────

const state = {
  view:          'home',
  commLoggedIn:  false,
  entryPicks:    {},
  viewingId:     null,
  dbConfigured:  false,
  scheduleDate:  new Date().toISOString().slice(0, 10),
  apiSeriesWins: {}, // abbrev → wins
  apiGames:      {}, // dateStr → [game objects] — cached playoff game data
  gameById:      {}, // gameId → game object (for modal lookup)
  feedFilter:    { bracketId: '', team: '' },
  whatIfPicks:   {}, // sid → {winner, games}
  whatIfMode:    'scratch', // 'scratch' | 'current'
};

// In-memory data store (loaded from GitHub on startup)
const appData = {
  brackets: [],
  results:  {},
  teams:    { ...DEFAULT_TEAMS },
  settings: { ...DEFAULT_SETTINGS },
};

// ── Firebase Firestore API ─────────────────────────────────

function isDbConfigured() {
  const c = window.CHELB_CONFIG;
  return !!(c && c.apiKey && c.apiKey !== 'YOUR_API_KEY'
               && c.projectId && c.projectId !== 'YOUR_PROJECT_ID');
}

function fsUrl(doc) {
  const c = window.CHELB_CONFIG;
  return `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/(default)/documents/pool/${doc}?key=${c.apiKey}`;
}

async function dbRead(doc) {
  const res = await fetch(fsUrl(doc), { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`DB read failed (${res.status})`);
  const json = await res.json();
  return JSON.parse(json.fields.data.stringValue);
}

async function dbWrite(doc, data) {
  const url = fsUrl(doc) + '&updateMask.fieldPaths=data';
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(data) } } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || `DB write failed (${res.status})`);
  }
}

// ── Data Layer ─────────────────────────────────────────────

// Reads always come from memory (populated at init)
function getBrackets() { return appData.brackets; }
function getResults()  { return appData.results; }
function getTeams()    { return appData.teams; }
function getSettings() { return appData.settings; }

// Writes: update memory + localStorage backup + async Firebase sync
function saveBrackets(v) {
  appData.brackets = v;
  localStorage.setItem(SK.BRACKETS, JSON.stringify(v));
  if (isDbConfigured()) {
    setSyncStatus('saving');
    dbWrite('brackets', v)
      .then(() => setSyncStatus('ok'))
      .catch(e => { setSyncStatus('error'); toast('Sync error: ' + e.message, 'error'); });
  }
}

function saveResults(v) {
  appData.results = v;
  localStorage.setItem(SK.RESULTS, JSON.stringify(v));
  if (isDbConfigured()) {
    setSyncStatus('saving');
    dbWrite('results', v)
      .then(() => setSyncStatus('ok'))
      .catch(e => { setSyncStatus('error'); toast('Sync error: ' + e.message, 'error'); });
  }
}

function saveTeams(v) {
  appData.teams = v;
  localStorage.setItem(SK.TEAMS, JSON.stringify(v));
  if (isDbConfigured()) {
    setSyncStatus('saving');
    dbWrite('teams', v)
      .then(() => setSyncStatus('ok'))
      .catch(e => { setSyncStatus('error'); toast('Sync error: ' + e.message, 'error'); });
  }
}

function saveSettings(v) {
  appData.settings = v;
  localStorage.setItem(SK.SETTINGS, JSON.stringify(v));
  if (isDbConfigured()) {
    setSyncStatus('saving');
    dbWrite('settings', v)
      .then(() => setSyncStatus('ok'))
      .catch(e => { setSyncStatus('error'); toast('Sync error: ' + e.message, 'error'); });
  }
}

async function loadAllData() {
  if (!isDbConfigured()) {
    // Fall back to localStorage — no Firebase config found
    appData.brackets = JSON.parse(localStorage.getItem(SK.BRACKETS)) || [];
    appData.results  = JSON.parse(localStorage.getItem(SK.RESULTS))  || {};
    appData.teams    = JSON.parse(localStorage.getItem(SK.TEAMS))    || { ...DEFAULT_TEAMS };
    appData.settings = JSON.parse(localStorage.getItem(SK.SETTINGS)) || { ...DEFAULT_SETTINGS };
    return;
  }

  try {
    const [b, r, t, s] = await Promise.all([
      dbRead('brackets'),
      dbRead('results'),
      dbRead('teams'),
      dbRead('settings'),
    ]);
    appData.brackets = b ?? (JSON.parse(localStorage.getItem(SK.BRACKETS)) || []);
    appData.results  = r ?? (JSON.parse(localStorage.getItem(SK.RESULTS))  || {});
    // When Firestore has no teams doc, always use DEFAULT_TEAMS (not stale localStorage)
    appData.teams    = t ?? { ...DEFAULT_TEAMS };
    appData.settings = s ?? (JSON.parse(localStorage.getItem(SK.SETTINGS)) || { ...DEFAULT_SETTINGS });

    // If teams or settings weren't in Firestore yet, seed them now
    if (!t) dbWrite('teams',    appData.teams).catch(() => {});
    if (!s) dbWrite('settings', appData.settings).catch(() => {});

    // Refresh localStorage cache
    localStorage.setItem(SK.BRACKETS, JSON.stringify(appData.brackets));
    localStorage.setItem(SK.RESULTS,  JSON.stringify(appData.results));
    localStorage.setItem(SK.TEAMS,    JSON.stringify(appData.teams));
    localStorage.setItem(SK.SETTINGS, JSON.stringify(appData.settings));

    state.dbConfigured = true;
    setSyncStatus('ok');
  } catch (e) {
    console.warn('Firebase load failed, using localStorage cache:', e.message);
    appData.brackets = JSON.parse(localStorage.getItem(SK.BRACKETS)) || [];
    appData.results  = JSON.parse(localStorage.getItem(SK.RESULTS))  || {};
    appData.teams    = JSON.parse(localStorage.getItem(SK.TEAMS))    || { ...DEFAULT_TEAMS };
    appData.settings = JSON.parse(localStorage.getItem(SK.SETTINGS)) || { ...DEFAULT_SETTINGS };
    setSyncStatus('error');
    toast('Could not reach Firebase — showing cached data.', 'error');
  }
}

// Reload data from Firebase in the background and refresh current view
async function refreshData() {
  if (!isDbConfigured()) return;
  try {
    const [b, r, t, s] = await Promise.all([
      dbRead('brackets'),
      dbRead('results'),
      dbRead('teams'),
      dbRead('settings'),
    ]);
    if (b) appData.brackets = b;
    if (r) appData.results  = r;
    if (t) appData.teams    = t;
    if (s) appData.settings = s;
    localStorage.setItem(SK.BRACKETS, JSON.stringify(appData.brackets));
    localStorage.setItem(SK.RESULTS,  JSON.stringify(appData.results));
    localStorage.setItem(SK.TEAMS,    JSON.stringify(appData.teams));
    localStorage.setItem(SK.SETTINGS, JSON.stringify(appData.settings));
    setSyncStatus('ok');
    // Re-render current view silently
    if (state.view === 'home')        renderHome();
    if (state.view === 'leaderboard') renderLeaderboard();
    if (state.view === 'viewer' && state.viewingId) renderViewer(state.viewingId);
  } catch (e) {
    setSyncStatus('error');
  }
}

// ── Sync Status UI ─────────────────────────────────────────

function setSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const labels = { ok:'✓ Synced', saving:'↑ Saving…', error:'⚠ Sync error', local:'Local only' };
  el.className = 'sync-badge sync-' + status;
  el.textContent = labels[status] || status;
}

// ── Loading Overlay ────────────────────────────────────────

function showLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) { el.className = 'loading-overlay'; }
}
function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) { el.className = 'loading-overlay hidden'; }
}

// ── Bracket Logic ──────────────────────────────────────────

function getSeriesTeams(sid, picks, teams) {
  const s = BY_ID[sid];
  if (!s) return ['TBD','TBD'];
  if (s.round === 1) return [teams[s.t1] || s.t1, teams[s.t2] || s.t2];
  const t1 = (picks[s.from[0]] && picks[s.from[0]].winner) || 'TBD';
  const t2 = (picks[s.from[1]] && picks[s.from[1]].winner) || 'TBD';
  return [t1, t2];
}

function getActualTeams(sid, results, teams) {
  const s = BY_ID[sid];
  if (!s) return ['TBD','TBD'];
  if (s.round === 1) return [teams[s.t1] || s.t1, teams[s.t2] || s.t2];
  const t1 = (results[s.from[0]] && results[s.from[0]].winner) || 'TBD';
  const t2 = (results[s.from[1]] && results[s.from[1]].winner) || 'TBD';
  return [t1, t2];
}

function isLocked() {
  const { lockDate } = getSettings();
  return lockDate && new Date() > new Date(lockDate);
}

// ── Scoring ────────────────────────────────────────────────

function scoreOneBracket(bracket, results) {
  let pts = 0, correct = 0;
  const bd = {};
  for (const s of SERIES) {
    const pick = bracket.picks[s.id];
    const result = results[s.id];
    if (!pick || !result || !result.completed) { bd[s.id] = { pts:0, status:'pending' }; continue; }
    const p = ROUND_PTS[s.round];
    let sp = 0;
    if (pick.winner === result.winner) {
      sp += p.w; correct++;
      if (pick.games === result.games) sp += p.g;
    }
    pts += sp;
    bd[s.id] = { pts:sp, correct: pick.winner===result.winner, gamesCorrect: pick.games===result.games, status:'done' };
  }
  return { pts, correct, breakdown: bd };
}

// Returns true when the loser team in a pick already has more wins than
// the pick allows — e.g. picking "PIT in 5" means PHI can have at most 1
// win (5-4=1), so if PHI already has 2 wins that games pick is dead.
function isGamesImpossible(pickedGames, loserCurrentWins) {
  if (!pickedGames) return false;
  return loserCurrentWins > (pickedGames - 4);
}

function maxPossible(bracket, results) {
  const teams = getTeams();
  let max = 0;
  for (const s of SERIES) {
    const pick = bracket.picks?.[s.id];
    if (!pick) continue;
    const result = results[s.id];
    const p = ROUND_PTS[s.round];
    if (result && result.completed) {
      if (pick.winner === result.winner) max += p.w + (pick.games === result.games ? p.g : 0);
    } else {
      // Check if the games pick is still achievable given current series state
      let gamesOk = true;
      if (pick.winner && pick.games) {
        const [t1, t2] = getActualTeams(s.id, results, teams);
        const loserTeam = pick.winner === t1 ? t2 : t1;
        const loserAbbr = TEAM_ABBR[loserTeam];
        const loserWins = loserAbbr ? (state.apiSeriesWins[loserAbbr] ?? 0) : 0;
        gamesOk = !isGamesImpossible(pick.games, loserWins);
      }
      max += gamesOk ? p.max : p.w;
    }
  }
  return max;
}

// ── Auto-apply completed series from live NHL API ──────────
//
// Derives completed-series results from `state.apiSeriesWins` so that
// points, leaderboard, live bracket, and live feed update automatically
// the moment a series clinches — no Commish intervention required.
//
// A series is considered complete when either team has reached 4 wins
// in the live series-status payload. Games count is `4 + loserWins`.
// Already-completed entries in `results` are left untouched.
function autoApplyCompletedSeries() {
  if (!state.apiSeriesWins || Object.keys(state.apiSeriesWins).length === 0) return false;
  const results = { ...getResults() };
  const teams   = getTeams();
  let changed = false;

  for (const s of SERIES) {
    if (results[s.id]?.completed) continue;
    const [t1, t2] = getActualTeams(s.id, results, teams);
    if (!t1 || !t2 || t1 === 'TBD' || t2 === 'TBD') continue;
    const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
    if (!a1 || !a2) continue;
    const w1 = state.apiSeriesWins[a1];
    const w2 = state.apiSeriesWins[a2];
    if (w1 == null || w2 == null) continue;

    let winner = null, loserWins = null;
    if (w1 >= 4 && w1 > w2) { winner = t1; loserWins = w2; }
    else if (w2 >= 4 && w2 > w1) { winner = t2; loserWins = w1; }
    if (!winner) continue;

    const games = 4 + Math.max(0, Math.min(3, loserWins));
    results[s.id] = { winner, games, completed: true };
    changed = true;
  }

  if (changed) saveResults(results);
  return changed;
}

// ── Live Feed ──────────────────────────────────────────────

// Per-series chronological game progression with running wins after
// each FINAL/OFF game. Used to figure out exactly which game made
// each feed event "true" so we can hide redundant repeats.
//
// Returns { a1, a2, games: [{ time, w1, w2 }, …] } or null.
function seriesProgression(sid, results, teams) {
  const [t1, t2] = getActualTeams(sid, results, teams);
  if (!t1 || !t2 || t1 === 'TBD' || t2 === 'TBD') return null;
  const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
  if (!a1 || !a2) return null;
  const games = [];
  for (const arr of Object.values(state.apiGames || {})) {
    for (const g of arr || []) {
      const ga = g.awayTeam?.abbrev, gh = g.homeTeam?.abbrev;
      if ((ga !== a1 && ga !== a2) || (gh !== a1 && gh !== a2)) continue;
      const isDone = g.gameState === 'FINAL' || g.gameState === 'OFF';
      if (!isDone) continue;
      games.push(g);
    }
  }
  games.sort((g1, g2) => (g1.startTimeUTC || '').localeCompare(g2.startTimeUTC || ''));

  let w1 = 0, w2 = 0;
  const out = [];
  for (const g of games) {
    const ha = g.homeTeam?.abbrev, aa = g.awayTeam?.abbrev;
    const hScore = g.homeTeam?.score ?? 0;
    const aScore = g.awayTeam?.score ?? 0;
    const winnerAbbr = hScore > aScore ? ha : aa;
    if (winnerAbbr === a1) w1++;
    else if (winnerAbbr === a2) w2++;
    out.push({ time: g.startTimeUTC, w1, w2 });
  }
  return { a1, a2, games: out };
}

// Earliest game in `progression` that satisfied the predicate. Returns
// the game's startTimeUTC, or null if no games in our window satisfy it.
function determinedAtTime(prog, predicate) {
  if (!prog) return null;
  for (const g of prog.games) {
    if (predicate(g.w1, g.w2)) return g.time;
  }
  return null;
}

function buildFeedEvents() {
  const brackets = appData.brackets || [];
  const results  = appData.results  || {};
  const teams    = getTeams();
  const events   = [];

  // Cache per-series progression so we don't rebuild it for every bracket.
  const progBySeries = {};
  const progFor = sid => {
    if (!(sid in progBySeries)) progBySeries[sid] = seriesProgression(sid, results, teams);
    return progBySeries[sid];
  };

  for (const b of brackets) {
    for (let i = 0; i < SERIES.length; i++) {
      const s = SERIES[i];
      const pick = b.picks?.[s.id];
      if (!pick?.winner) continue;
      const result = results[s.id];
      const p = ROUND_PTS[s.round];
      const prog = progFor(s.id);
      const base = {
        bracketId: b.id,
        bracketName: b.bracketName || b.name,
        playerName: b.playerName || '',
        seriesId: s.id,
        seriesAbbr: s.abbr,
        round: s.round,
        seriesIndex: i,
        pickedTeam: pick.winner,
        pickedGames: pick.games,
      };

      if (result?.completed) {
        const winnerAbbr = TEAM_ABBR[result.winner];
        const isW1 = winnerAbbr === prog?.a1;
        const clinchTime = determinedAtTime(prog, (w1, w2) => (isW1 ? w1 : w2) >= 4);
        if (pick.winner === result.winner) {
          const gamesMatch = pick.games === result.games;
          events.push({
            ...base,
            type: 'won',
            team: result.winner,
            points: p.w + (gamesMatch ? p.g : 0),
            gamesMatch,
            actualGames: result.games,
            when: clinchTime,
          });
        } else {
          events.push({
            ...base,
            type: 'missed',
            team: pick.winner,
            actualWinner: result.winner,
            points: p.max,
            when: clinchTime,
          });
        }
        continue;
      }

      // In-progress: check eliminated / games-dead
      const [t1, t2] = getActualTeams(s.id, results, teams);
      if (!t1 || !t2 || t1 === 'TBD' || t2 === 'TBD') continue;
      const opponent = pick.winner === t1 ? t2 : (pick.winner === t2 ? t1 : null);
      if (!opponent) continue;
      const oppAbbr = TEAM_ABBR[opponent];
      const oppWins = oppAbbr ? (state.apiSeriesWins[oppAbbr] ?? 0) : 0;
      const oppIsW1 = oppAbbr === prog?.a1;

      if (oppWins >= 4) {
        const when = determinedAtTime(prog, (w1, w2) => (oppIsW1 ? w1 : w2) >= 4);
        events.push({
          ...base,
          type: 'eliminated',
          team: pick.winner,
          opponent,
          points: p.max,
          when,
        });
      } else if (pick.games && isGamesImpossible(pick.games, oppWins)) {
        const threshold = pick.games - 3; // opp wins that make pickedGames impossible
        const when = determinedAtTime(prog, (w1, w2) => (oppIsW1 ? w1 : w2) >= threshold);
        events.push({
          ...base,
          type: 'games_dead',
          team: pick.winner,
          opponent,
          points: p.g,
          when,
        });
      }
    }
  }

  // "What's new" filter: drop events whose determining game isn't the
  // most recent game played in that series. A pick that was killed
  // back at game 3 shouldn't reappear in the feed every time game 4,
  // 5, 6 finishes. Events without a known timestamp (the determining
  // game predates our cached game window) are also dropped — the user
  // would have already seen those.
  const fresh = events.filter(e => {
    if (!e.when) return false;
    const prog = progBySeries[e.seriesId];
    const lastTime = prog?.games?.length ? prog.games[prog.games.length - 1].time : null;
    return lastTime && e.when === lastTime;
  });

  // Most-recent game first.
  const typeRank = { eliminated: 0, games_dead: 1, missed: 2, won: 3 };
  fresh.sort((a, b) => {
    if (a.when !== b.when) return (b.when || '').localeCompare(a.when || '');
    return (b.round - a.round) ||
           (b.seriesIndex - a.seriesIndex) ||
           (typeRank[a.type] - typeRank[b.type]) ||
           a.bracketName.localeCompare(b.bracketName);
  });
  return fresh;
}

function feedTeamChip(name) {
  if (!name) return '';
  const abbr = TEAM_ABBR[name] || name.split(' ').pop().toUpperCase().slice(0, 3);
  const url  = logoUrlForAbbr(abbr);
  return `<span class="feed-team"><img class="feed-team-logo" src="${url}" alt="" onerror="this.style.display='none'"><b>${esc(abbr)}</b></span>`;
}

function feedMessage(e) {
  const bName = esc(e.bracketName);
  const pName = esc(e.playerName);
  const team  = feedTeamChip(e.team);
  const who = `<strong>${bName}</strong>${pName ? ` by ${pName}` : ''}`;
  switch (e.type) {
    case 'won':
      return `${who} <span class="feed-pts feed-pts--pos">+${e.points} pts</span> — ${team} won` +
             (e.gamesMatch ? ` in ${e.actualGames}` : '');
    case 'missed':
      return `${who} <span class="feed-pts feed-pts--neg">missed ${e.points} pts</span> — had ${feedTeamChip(e.pickedTeam)}, but ${feedTeamChip(e.actualWinner)} took the series`;
    case 'eliminated':
      return `${who} <span class="feed-pts feed-pts--neg">lost ${e.points} possible pts</span> — ${team} can no longer win the series`;
    case 'games_dead':
      return `${who} <span class="feed-pts feed-pts--neg">lost ${e.points} possible pts</span> — ${team} in ${e.pickedGames} is no longer possible`;
  }
  return '';
}

function populateFeedBracketFilter() {
  const sel = document.getElementById('feed-bracket-filter');
  if (!sel) return;
  const brackets = (appData.brackets || []).slice().sort((a, b) =>
    (a.bracketName || a.name || '').localeCompare(b.bracketName || b.name || '')
  );
  const current = state.feedFilter.bracketId;
  sel.innerHTML = `<option value="">All brackets</option>` + brackets.map(b => {
    const label = (b.bracketName || b.name || '') + (b.playerName ? ` · ${b.playerName}` : '');
    return `<option value="${esc(b.id)}"${b.id === current ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function populateFeedTeamFilter(events) {
  const sel = document.getElementById('feed-team-filter');
  if (!sel) return;
  const teamSet = new Set();
  for (const e of events) {
    if (e.team) teamSet.add(e.team);
    if (e.opponent) teamSet.add(e.opponent);
    if (e.actualWinner) teamSet.add(e.actualWinner);
  }
  const teams = [...teamSet].sort();
  const current = state.feedFilter.team;
  sel.innerHTML = `<option value="">All teams</option>` + teams.map(t =>
    `<option value="${esc(t)}"${t === current ? ' selected' : ''}>${esc(t)}</option>`
  ).join('');
}

function renderHomeFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;
  const events = buildFeedEvents();

  populateFeedBracketFilter();
  populateFeedTeamFilter(events);

  const { bracketId, team } = state.feedFilter;
  const filtered = events.filter(e =>
    (!bracketId || e.bracketId === bracketId) &&
    (!team || e.team === team || e.opponent === team || e.actualWinner === team)
  );

  if (filtered.length === 0) {
    const hasFilter = bracketId || team;
    list.innerHTML = `<div class="feed-empty">No events yet${hasFilter ? ' for the selected filter' : ''}.</div>`;
    return;
  }
  list.innerHTML = filtered.map(e =>
    `<div class="feed-item feed-item--${e.type}" data-bracket-id="${esc(e.bracketId)}">
       <div class="feed-item-msg">${feedMessage(e)}</div>
       <div class="feed-item-meta">${esc(e.seriesAbbr)} · ${ROUND_NAMES[e.round]}</div>
     </div>`
  ).join('');
}

function bindFeedFilters() {
  const bSel = document.getElementById('feed-bracket-filter');
  const tSel = document.getElementById('feed-team-filter');
  if (bSel && !bSel.dataset.bound) {
    bSel.addEventListener('change', () => {
      state.feedFilter.bracketId = bSel.value;
      renderHomeFeed();
    });
    bSel.dataset.bound = '1';
  }
  if (tSel && !tSel.dataset.bound) {
    tSel.addEventListener('change', () => {
      state.feedFilter.team = tSel.value;
      renderHomeFeed();
    });
    tSel.dataset.bound = '1';
  }
}

// ── Navigation ─────────────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  state.view = name;
  closeMobileMenu();
  if (name === 'home')         renderHome();
  if (name === 'entry')        renderEntry();
  if (name === 'viewer')       renderViewer();
  if (name === 'leaderboard')  renderLeaderboard();
  if (name === 'schedule')     renderSchedule();
  if (name === 'stats')        renderStats();
  if (name === 'predictions')  renderPredictions();
  if (name === 'whatif')       renderWhatIf();
  if (name === 'commissioner') renderCommissioner();
}

// ── Predictions ────────────────────────────────────────────

const PRED_DATA = [
  ['bracket',       'data/bracket.json'],
  ['series',        'data/series.json'],
  ['games',         'data/games.json'],
  ['lastUpdated',   'data/last_updated.json'],
  ['samples',       'data/bracket_samples.json'],
  ['cupHistory',    'data/cup_odds_history.json'],
];

// Score one bracket against a sample outcome {seriesId: [abbr, games]}.
function scoreBracketAgainstSample(bracket, sample) {
  let pts = 0;
  if (!bracket || !bracket.picks) return 0;
  for (const s of SERIES) {
    const pick = bracket.picks[s.id];
    const outcome = sample[s.id];
    if (!pick || !outcome) continue;
    const [winnerAbbr, games] = outcome;
    const pickAbbr = TEAM_ABBR[pick.winner] || pick.winner;
    if (pickAbbr === winnerAbbr) {
      const p = ROUND_PTS[s.round];
      pts += p.w;
      if (pick.games === games) pts += p.g;
    }
  }
  return pts;
}

function computePoolOdds(entries, samplesData) {
  const samples = (samplesData && samplesData.samples) || [];
  if (!entries.length || !samples.length) return [];
  const n = samples.length;
  const winShare = new Array(entries.length).fill(0);
  const totalPts = new Array(entries.length).fill(0);
  for (let i = 0; i < n; i++) {
    const sample = samples[i];
    let bestPts = -1, winners = [];
    for (let j = 0; j < entries.length; j++) {
      const pts = scoreBracketAgainstSample(entries[j], sample);
      totalPts[j] += pts;
      if (pts > bestPts) { bestPts = pts; winners = [j]; }
      else if (pts === bestPts) { winners.push(j); }
    }
    const share = 1 / winners.length;
    for (const j of winners) winShare[j] += share;
  }
  return entries.map((e, j) => ({
    id: e.id,
    playerName: e.playerName,
    bracketName: e.bracketName,
    cupPick: e.picks?.SCF?.winner || null,
    winPoolPct: winShare[j] / n,
    expectedPts: totalPts[j] / n,
  })).sort((a, b) => b.winPoolPct - a.winPoolPct);
}

function predFmtPct(p) {
  if (p == null || isNaN(p)) return '—';
  return (p * 100).toFixed(1) + '%';
}

// Pull deltas from the committed history file written by export.py. Returns
// null if no usable prior day is found so the caller can fall back to the
// localStorage-based path.
function getHistoryDeltas(history, currentValues, field) {
  const entries = (history && Array.isArray(history.history)) ? history.history : [];
  if (entries.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const priorEntries = entries.filter(e => e && e.date && e.date < today);
  if (priorEntries.length === 0) return null;
  const prev = priorEntries[priorEntries.length - 1];
  const prevTeams = (prev && prev.teams) || {};
  const out = {};
  for (const key of Object.keys(currentValues)) {
    const prevTeam = prevTeams[key];
    if (!prevTeam) continue;
    const prevVal = prevTeam[field];
    if (prevVal == null || currentValues[key] == null) continue;
    out[key] = currentValues[key] - prevVal;
  }
  return out;
}

// Compute per-key deltas vs a stored daily snapshot. Rolls today→snapshot on a new calendar day.
function getDailyDeltas(storageKey, currentValues) {
  const today = new Date().toISOString().slice(0, 10);
  let store = {};
  try { store = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { store = {}; }
  const deltas = {};
  if (store.snapshot && store.snapshot.values) {
    for (const k of Object.keys(currentValues)) {
      const prev = store.snapshot.values[k];
      if (prev != null && currentValues[k] != null) deltas[k] = currentValues[k] - prev;
    }
  }
  if (!store.today) {
    store.today = { date: today, values: currentValues };
  } else if (store.today.date !== today) {
    store.snapshot = store.today;
    store.today = { date: today, values: currentValues };
    // Recompute deltas against the newly-promoted snapshot.
    for (const k of Object.keys(currentValues)) {
      const prev = store.snapshot.values[k];
      if (prev != null) deltas[k] = currentValues[k] - prev;
    }
  } else {
    store.today.values = currentValues;
  }
  try { localStorage.setItem(storageKey, JSON.stringify(store)); } catch {}
  return deltas;
}

function renderPctDelta(delta) {
  if (delta == null || isNaN(delta) || Math.abs(delta) < 0.0005) return '';
  const pp = delta * 100;
  const up = pp > 0;
  const arrow = up ? '▲' : '▼';
  const cls = up ? 'delta-up' : 'delta-down';
  return `<span class="pct-delta ${cls}">${arrow} ${Math.abs(pp).toFixed(1)}%</span>`;
}

function predLogoImg(abbrev) {
  if (!abbrev) return '';
  const safe = String(abbrev).replace(/[^A-Z]/g, '');
  return `<img class="team-logo" src="${logoUrlForAbbr(safe)}" alt="${safe}" loading="lazy" onerror="this.style.display='none'">`;
}

function predBar(pct, side) {
  const width = Math.max(2, Math.min(100, (pct || 0) * 100));
  return `<div class="prob-bar prob-${side}"><div class="prob-fill" style="width:${width.toFixed(1)}%"></div><span class="prob-label">${predFmtPct(pct)}</span></div>`;
}

function renderCupOdds(data, cupHistory) {
  const teams = (data && data.teams) || [];
  if (!teams.length) return '<div class="empty-state">No odds available yet.</div>';
  const current = {};
  for (const t of teams) if (t.team != null && t.cup_win_pct != null) current[t.team] = t.cup_win_pct;
  // Prefer the committed history file (persists across browsers/devices);
  // fall back to the per-browser localStorage snapshot if history is missing
  // or hasn't yet recorded a prior day.
  const historyDeltas = getHistoryDeltas(cupHistory, current, 'cup');
  const deltas = historyDeltas || getDailyDeltas('cupOddsDaily', current);
  const rows = teams.map((t, i) => `
    <tr class="${i === 0 ? 'cup-leader' : ''}">
      <td class="rank">${i + 1}</td>
      <td class="team-cell">${predLogoImg(t.team)}<span class="team-abbr">${t.team}</span></td>
      <td class="series-score">${t.current_series || ''}</td>
      <td>${predFmtPct(t.round1_win_pct)}</td>
      <td>${predFmtPct(t.round2_win_pct)}</td>
      <td>${predFmtPct(t.round3_win_pct)}</td>
      <td class="cup-pct">${predFmtPct(t.cup_win_pct)}${renderPctDelta(deltas[t.team])}</td>
    </tr>
  `).join('');
  return `
    <div class="table-wrap">
      <table class="pred-table cup-table">
        <thead>
          <tr><th>#</th><th>Team</th><th>Score</th><th>R1%</th><th>R2%</th><th>R3%</th><th>Cup%</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderPredSeries(data) {
  const active = (data && data.active) || [];
  if (!active.length) return '<div class="empty-state">No active series.</div>';
  return active.map(s => {
    const j = s.joint_distribution;
    const len = s.length_distribution || {};
    const cells = j
      ? [['home', s.home.team], ['away', s.away.team]].flatMap(([side, abbr]) =>
          ['4','5','6','7'].map(k => `
            <div class="len-cell">
              <div class="len-games">${abbr} in ${k}</div>
              <div class="len-pct">${predFmtPct((j[side] || {})[k] || 0)}</div>
            </div>`))
      : ['4','5','6','7'].map(k => `
          <div class="len-cell">
            <div class="len-games">in ${k}</div>
            <div class="len-pct">${predFmtPct(len[k] || 0)}</div>
          </div>`);
    const lengths = cells.join('');
    let most = s.most_likely || {};
    if (j) {
      let bestSide = 'home', bestLen = '7', bestP = -1;
      for (const side of ['home','away']) {
        for (const k of ['4','5','6','7']) {
          const p = (j[side] || {})[k] || 0;
          if (p > bestP) { bestP = p; bestSide = side; bestLen = k; }
        }
      }
      most = { winner: s[bestSide].team, games: bestLen };
    }
    const drivers = renderDriverStrip(s.drivers, s.home.team, s.away.team);
    return `
      <div class="series-card">
        <div class="series-top">
          <div class="series-seed">${s.seed || ''} · Round ${s.round || 1}</div>
          <div class="series-most">Most likely: <strong>${most.winner || '—'} in ${most.games || '—'}</strong></div>
        </div>
        <div class="series-teams">
          <div class="series-team">
            <div class="t-name">${predLogoImg(s.home.team)}<span class="team-abbr">${s.home.team}</span> ${s.home.name || ''}</div>
            ${predBar(s.home.series_win_pct, 'home')}
          </div>
          <div class="series-score-big">${s.home.wins}–${s.away.wins}</div>
          <div class="series-team">
            <div class="t-name">${predLogoImg(s.away.team)}<span class="team-abbr">${s.away.team}</span> ${s.away.name || ''}</div>
            ${predBar(s.away.series_win_pct, 'away')}
          </div>
        </div>
        <div class="series-lengths">${lengths}</div>
        ${drivers}
      </div>`;
  }).join('');
}

function renderDriverStrip(drivers, homeAbbr, awayAbbr) {
  if (!drivers || !drivers.length) return '';
  const fmtVal = (feature, v) => {
    if (v == null) return '';
    if (/pct$/.test(feature) || /^(h|a|d)_pp$|^(h|a|d)_pk$|^(h|a|d)_point_pct$/.test(feature)) {
      return (v * 100).toFixed(1) + '%';
    }
    return Number(v).toFixed(2);
  };
  const relabel = (label) => label.replace(/^Home\b/, homeAbbr).replace(/^Away\b/, awayAbbr);
  const pills = drivers.map(d => {
    const favors = d.favors === 'home' ? homeAbbr : awayAbbr;
    const valTxt = fmtVal(d.feature, d.value);
    return `<span class="driver-pill driver-${d.favors}" title="SHAP log-odds: ${d.shap}">
      <span class="driver-label">${esc(relabel(d.label))}</span>
      ${valTxt ? `<span class="driver-value">${valTxt}</span>` : ''}
      <span class="driver-favors">→ ${favors}</span>
    </span>`;
  }).join('');
  return `<div class="series-drivers"><div class="drivers-label">Top model drivers</div><div class="drivers-row">${pills}</div></div>`;
}

function renderPredGames(data) {
  const games = (data && data.upcoming) || [];
  if (!games.length) return '<div class="empty-state">No games scheduled in the next 48 hours.</div>';
  return games.map(g => {
    const d = g.date ? new Date(g.date) : null;
    const when = d ? d.toLocaleString(undefined, { weekday:'short', hour:'numeric', minute:'2-digit' }) : '';
    const badge = g.uncertain_starter ? `<span class="uncertain-badge" title="Starting goalie unconfirmed">⚠ Unconfirmed starter</span>` : '';
    return `
      <div class="game-card">
        <div class="game-top">
          <span class="game-when">${when}</span>
          ${badge}
        </div>
        <div class="game-matchup">
          <div class="game-side">
            <div class="t-name">${predLogoImg(g.home.team)}<span class="team-abbr">${g.home.team}</span> ${g.home.name || ''}</div>
            <div class="t-goalie">${g.home.goalie || '—'} · quality ${g.home.goalie_score != null ? g.home.goalie_score.toFixed(2) : '—'}</div>
            <div class="t-rest">Rest: ${g.home.rest_days}d</div>
            ${predBar(g.home.win_pct, 'home')}
          </div>
          <div class="game-vs">vs</div>
          <div class="game-side">
            <div class="t-name">${predLogoImg(g.away.team)}<span class="team-abbr">${g.away.team}</span> ${g.away.name || ''}</div>
            <div class="t-goalie">${g.away.goalie || '—'} · quality ${g.away.goalie_score != null ? g.away.goalie_score.toFixed(2) : '—'}</div>
            <div class="t-rest">Rest: ${g.away.rest_days}d</div>
            ${predBar(g.away.win_pct, 'away')}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderPredLastUpdated(d) {
  const el = document.getElementById('predLastUpdated');
  if (!el) return;
  if (!d || !d.generated_at) { el.textContent = 'Updated: unknown'; return; }
  try {
    const dt = new Date(d.generated_at);
    el.textContent = 'Updated ' + dt.toLocaleString(undefined, { month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' });
  } catch {
    el.textContent = 'Updated ' + d.generated_at;
  }
}

function renderPoolOdds(ranked, entryCount) {
  if (!ranked.length) return '<div class="empty-state">No pool entries yet.</div>';
  const current = {};
  for (const r of ranked) if (r.id != null && r.winPoolPct != null) current[r.id] = r.winPoolPct;
  const deltas = getDailyDeltas('poolOddsDaily', current);
  const rows = ranked.map((r, i) => {
    const cupAbbr = r.cupPick ? (TEAM_ABBR[r.cupPick] || '') : '';
    return `
    <tr class="${i === 0 ? 'cup-leader' : ''}">
      <td class="rank">${i + 1}</td>
      <td><div class="team-cell"><span class="team-abbr">${r.bracketName || '—'}</span><span class="team-name">${r.playerName || ''}</span></div></td>
      <td><div class="team-cell">${cupAbbr ? predLogoImg(cupAbbr) : ''}<span class="team-abbr">${cupAbbr}</span></div></td>
      <td>${r.expectedPts.toFixed(1)}</td>
      <td class="cup-pct">${predFmtPct(r.winPoolPct)}${renderPctDelta(deltas[r.id])}</td>
    </tr>`;
  }).join('');
  return `
    <div class="table-wrap">
      <table class="pred-table pool-table">
        <thead>
          <tr><th>#</th><th>Bracket</th><th>Cup</th><th>Exp Pts</th><th>P(Win)</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="view-sub" style="margin-top:0.6rem;color:var(--text-3);font-size:0.78rem">Across ${entryCount} entries · 5,000 simulated brackets · ties split evenly.</p>`;
}

function renderModelCalibration(data) {
  if (!data) return '<div class="empty-state">No calibration data.</div>';
  const wf = data.walk_forward;
  if (!wf || !wf.model) return '<div class="empty-state">No backtest data available.</div>';
  const m = wf.model, cf = wf.baselines?.coin_flip, hi = wf.baselines?.home_ice_0545;
  const metricCard = (label, value, sub) => `
    <div class="cal-metric">
      <div class="cal-metric-label">${label}</div>
      <div class="cal-metric-value">${value}</div>
      ${sub ? `<div class="cal-metric-sub">${sub}</div>` : ''}
    </div>`;
  const metrics = [
    metricCard('Games', m.n.toLocaleString(), `since ${String(wf.min_season).slice(0,4)}–${String(wf.min_season).slice(6,8)} playoffs`),
    metricCard('Accuracy', (m.accuracy * 100).toFixed(1) + '%', `coin flip ${(cf.accuracy*100).toFixed(1)}% · home-ice ${(hi.accuracy*100).toFixed(1)}%`),
    metricCard('Brier', m.brier.toFixed(4), `coin flip ${cf.brier.toFixed(4)} · home-ice ${hi.brier.toFixed(4)}`),
    metricCard('Log loss', m.log_loss.toFixed(4), `coin flip ${cf.log_loss.toFixed(4)}`),
  ].join('');

  const gameBins = (wf.calibration || []).filter(b => b.n > 0);
  const seriesWf = data.series_walk_forward || {};
  const seriesBins = (seriesWf.calibration || []).filter(b => b.n > 0);
  const W = 420, H = 260, PAD = 36;
  const sx = (p) => PAD + p * (W - 2 * PAD);
  const sy = (p) => H - PAD - p * (H - 2 * PAD);
  const maxN = Math.max(1, ...gameBins.map(b => b.n), ...seriesBins.map(b => b.n));
  const plotDot = (b, color, label) => {
    const r = 4 + 8 * (b.n / maxN);
    return `<circle cx="${sx(b.mean_pred).toFixed(1)}" cy="${sy(b.actual_rate).toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="0.7" stroke="${color}" stroke-width="1.5"><title>${label}: pred ${(b.mean_pred*100).toFixed(1)}% · actual ${(b.actual_rate*100).toFixed(1)}% · n=${b.n}</title></circle>`;
  };
  const gameDots = gameBins.map(b => plotDot(b, 'var(--accent)', 'Games')).join('');
  const seriesDots = seriesBins.map(b => plotDot(b, 'var(--warning, #e0a93b)', 'Series')).join('');
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map(t => `
    <line x1="${sx(t)}" y1="${sy(0)}" x2="${sx(t)}" y2="${sy(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,3"/>
    <line x1="${sx(0)}" y1="${sy(t)}" x2="${sx(1)}" y2="${sy(t)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,3"/>
    <text x="${sx(t)}" y="${H - PAD + 14}" text-anchor="middle" fill="var(--text-3)" font-size="10">${(t*100).toFixed(0)}%</text>
    <text x="${PAD - 6}" y="${sy(t) + 3}" text-anchor="end" fill="var(--text-3)" font-size="10">${(t*100).toFixed(0)}%</text>`).join('');
  const svg = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" class="cal-plot">
      ${gridTicks}
      <line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" stroke="var(--text-3)" stroke-width="1.5" stroke-dasharray="4,4"/>
      ${gameDots}
      ${seriesDots}
      <text x="${W/2}" y="${H - 6}" text-anchor="middle" fill="var(--text-2)" font-size="11">Predicted probability</text>
      <text x="12" y="${H/2}" text-anchor="middle" fill="var(--text-2)" font-size="11" transform="rotate(-90 12 ${H/2})">Actual win rate</text>
    </svg>`;
  const legend = seriesBins.length
    ? `<div class="cal-legend"><span class="cal-legend-swatch" style="background:var(--accent)"></span>Games <span class="cal-legend-swatch" style="background:var(--warning, #e0a93b);margin-left:0.8rem"></span>Series</div>`
    : '';
  const seriesAgg = seriesWf.model;
  const seriesNote = seriesAgg
    ? `Series replay: n=${seriesAgg.n}, Brier ${seriesAgg.brier?.toFixed(3)}, mean pred ${(seriesAgg.mean_pred*100).toFixed(1)}% vs actual ${(seriesAgg.mean_actual*100).toFixed(1)}%.`
    : '';
  const prodNote = data.production_model
    ? `Production model: Platt-calibrated on season ${String(data.production_model.holdout_season).slice(0,4)}–${String(data.production_model.holdout_season).slice(6)} (n=${data.production_model.holdout_rows}, Brier ${data.production_model.holdout_brier?.toFixed(3)}).`
    : '';
  return `
    <div class="cal-wrap">
      <div class="cal-metrics">${metrics}</div>
      <div class="cal-chart-wrap">
        <div class="cal-chart-title">Reliability curve (walk-forward OOS)</div>
        ${legend}
        ${svg}
        <p class="cal-caption">Each dot is a 10%-wide bin of predicted probabilities. Dot size = sample count in that bin. Dashes = perfect calibration. ${seriesNote} ${prodNote}</p>
      </div>
    </div>`;
}

function setupPredPills() {
  const nav = document.getElementById('predPills');
  if (!nav || nav._wired) return;
  nav._wired = true;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.pred-pill');
    if (!btn) return;
    const pane = btn.dataset.pane;
    nav.querySelectorAll('.pred-pill').forEach(p => p.classList.toggle('active', p === btn));
    document.querySelectorAll('#view-predictions .sec[data-pane]').forEach(sec => {
      sec.hidden = sec.dataset.pane !== pane;
    });
  });
}

async function renderPredictions() {
  setupPredPills();
  const fetchJson = async (p) => {
    const r = await fetch(p, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${p} ${r.status}`);
    return r.json();
  };
  const set = (id, html, err) => { const el = document.getElementById(id); if (el) el.innerHTML = html || `<div class="empty-state">${err}</div>`; };

  if (!state._predictionsLoaded) {
    state._predictionsLoaded = true;
    const results = await Promise.allSettled(PRED_DATA.map(([, p]) => fetchJson(p)));
    const [bracket, series, games, lastUpdated, samples, cupHistory] = results.map(r => r.status === 'fulfilled' ? r.value : null);
    state._predSamples = samples;
    try { set('cupOdds',       bracket && renderCupOdds(bracket, cupHistory),   "Couldn't load Cup odds."); } catch (e) { console.error(e); set('cupOdds', null, 'Failed to render odds.'); }
    try { set('activeSeries',  series  && renderPredSeries(series), "Couldn't load series."); }   catch (e) { console.error(e); set('activeSeries', null, 'Failed to render series.'); }
    try { set('upcomingGames', games   && renderPredGames(games),   "Couldn't load games."); }    catch (e) { console.error(e); set('upcomingGames', null, 'Failed to render games.'); }
    renderPredLastUpdated(lastUpdated);
  }

  // Pool odds re-renders on every nav into view — entries may have updated.
  const el = document.getElementById('poolOdds');
  if (!el) return;
  const entries = getBrackets();
  if (!state._predSamples) {
    el.innerHTML = '<div class="empty-state">Couldn\'t load simulation data.</div>';
    return;
  }
  if (!entries.length) {
    el.innerHTML = '<div class="empty-state">No pool entries yet.</div>';
    return;
  }
  try {
    const ranked = computePoolOdds(entries, state._predSamples);
    el.innerHTML = renderPoolOdds(ranked, entries.length);
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="empty-state">Failed to compute pool odds.</div>';
  }
}

// ── Actual NHL Bracket ─────────────────────────────────────

async function renderActualBracket() {
  const el = document.getElementById('actualBracket');
  if (!el) return;
  el.innerHTML = `<div class="bracket-scroll-wrap"><div class="bracket-canvas" id="actualBracketCanvas"></div></div>`;
  await fetchApiSeriesWins();
  buildActualBracketCanvas();
}

function buildActualBracketCanvas() {
  const canvas = document.getElementById('actualBracketCanvas');
  if (!canvas) return;
  const results = getResults(), teams = getTeams();
  canvas.style.width  = CW + 'px';
  canvas.style.height = CH + 'px';

  const svg = createSVG(CW, CH);
  const nodeW = id => id === 'SCF' ? SCF_W : BW;
  const nodeH = id => id === 'SCF' ? SCF_H : BH;
  CONNECTORS.forEach(([fid, tid, fside, tside]) => {
    const fp = POSITIONS[fid], tp = POSITIONS[tid];
    if (!fp || !tp) return;
    const fx = fside==='r' ? fp.x+nodeW(fid) : fp.x, fy = fp.y+nodeH(fid)/2;
    const tx = tside==='r' ? tp.x+nodeW(tid) : tp.x, ty = tp.y+nodeH(tid)/2;
    const mx = (fx+tx)/2;
    const line = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.setAttribute('points',`${fx},${fy} ${mx},${fy} ${mx},${ty} ${tx},${ty}`);
    line.setAttribute('fill','none'); line.setAttribute('stroke','#1e3060'); line.setAttribute('stroke-width','2');
    svg.appendChild(line);
  });
  canvas.appendChild(svg);

  [['EASTERN','0'],['WESTERN','auto']].forEach(([label, left]) => {
    const lbl = document.createElement('div');
    lbl.className = 'bracket-conf-label';
    lbl.style.left = left === 'auto' ? 'auto' : left+'px';
    if (left === 'auto') lbl.style.right = '0';
    lbl.style.top = '-2px'; lbl.textContent = label;
    canvas.appendChild(lbl);
  });

  for (const s of SERIES) {
    const pos = POSITIONS[s.id];
    if (!pos) continue;

    const [t1, t2] = getActualTeams(s.id, results, teams);
    const result    = results[s.id];
    const winner    = result?.completed ? result.winner : null;
    const loserWins = result?.completed ? result.games - 4 : null;

    let t1Class = '', t2Class = '';
    if (winner) {
      t1Class = t1 === winner ? 'winner' : 'eliminated';
      t2Class = t2 === winner ? 'winner' : 'eliminated';
    }

    // Series score: completed shows final, in-progress pulls from NHL API
    let seriesScore = '';
    if (result?.completed) {
      seriesScore = `<div class="bk-games bk-series-score">4–${loserWins}</div>`;
    } else if (t1 !== 'TBD' && t2 !== 'TBD') {
      const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
      const w1 = a1 != null ? (state.apiSeriesWins[a1] ?? null) : null;
      const w2 = a2 != null ? (state.apiSeriesWins[a2] ?? null) : null;
      if (w1 != null && w2 != null) {
        let label;
        if (w1 === w2) label = w1 === 0 ? 'Series even 0–0' : `Tied ${w1}–${w2}`;
        else if (w1 > w2) label = `${t1.split(' ').pop()} leads ${w1}–${w2}`;
        else              label = `${t2.split(' ').pop()} leads ${w2}–${w1}`;
        seriesScore = `<div class="bk-games bk-series-score">${esc(label)}</div>`;
      }
    }

    const box = document.createElement('div');

    if (s.id === 'SCF') {
      let champHtml;
      if (winner) {
        champHtml = `<div class="scf-champion">
          <img class="scf-champ-logo" src="${logoUrl(winner)}" alt="" onerror="this.style.display='none'">
          <div class="scf-champ-name">${esc(winner)}</div>
          <div class="scf-champ-label">🏆 Stanley Cup Champions</div>
        </div>`;
      } else {
        champHtml = `<div class="scf-champion"><div class="scf-champ-tbd">?</div><div class="scf-champ-label">To Be Determined</div></div>`;
      }
      const t1Html = t1==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t1Class}">${logoImg(t1,'bk-logo')}${esc(t1)}</span>`;
      const t2Html = t2==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t2Class}">${logoImg(t2,'bk-logo')}${esc(t2)}</span>`;
      box.className = 'bk-box scf-box';
      box.style.left = pos.x+'px'; box.style.top = pos.y+'px';
      box.style.width = SCF_W+'px';
      box.innerHTML = `
        <div class="bk-label scf-label">Stanley Cup Final</div>
        ${champHtml}
        <div class="scf-finalists">${t1Html}<span class="scf-vs">vs</span>${t2Html}</div>
        ${seriesScore}`;
    } else {
      const t1Html = t1==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t1Class}">${logoImg(t1,'bk-logo')}${esc(t1)}</span>`;
      const t2Html = t2==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t2Class}">${logoImg(t2,'bk-logo')}${esc(t2)}</span>`;
      box.className = 'bk-box';
      box.style.left = pos.x+'px'; box.style.top = pos.y+'px'; box.style.width = BW+'px';
      box.innerHTML = `
        <div class="bk-label">${esc(s.abbr)}</div>
        ${t1Html}${t2Html}
        ${seriesScore}`;
    }
    box.style.cursor = 'pointer';
    box.addEventListener('click', () => showSeriesModal(s.id));
    canvas.appendChild(box);
  }
}

// ── Series Modal ───────────────────────────────────────────

async function loadPredSeries() {
  if (state._predSeriesData !== undefined) return state._predSeriesData;
  try {
    const r = await fetch('data/series.json', { cache: 'no-store' });
    state._predSeriesData = r.ok ? await r.json() : null;
  } catch { state._predSeriesData = null; }
  return state._predSeriesData;
}

function findPredSeriesOdds(predData, a1, a2) {
  const list = predData?.active;
  if (!list || !a1 || !a2) return null;
  const entry = list.find(s => (s.home.team === a1 && s.away.team === a2) || (s.home.team === a2 && s.away.team === a1));
  if (!entry) return null;
  const pct = t => entry.home.team === t ? entry.home.series_win_pct : entry.away.series_win_pct;
  return { [a1]: pct(a1), [a2]: pct(a2) };
}

async function showSeriesModal(sid) {
  const modal = document.getElementById('seriesModal');
  const content = document.getElementById('seriesModalContent');
  if (!modal || !content) return;

  content.innerHTML = '<div class="series-modal-loading">Loading…</div>';
  content.dataset.currentSeries = sid;
  modal.classList.add('open');

  await fetchAllPlayoffGames();
  const predSeries = await loadPredSeries();

  const results = getResults(), teams = getTeams(), brackets = getBrackets();
  const s = BY_ID[sid];
  const [t1, t2] = getActualTeams(sid, results, teams);
  const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
  const modelOdds = findPredSeriesOdds(predSeries, a1, a2);
  const fmtPct = p => (p * 100).toFixed(1) + '%';
  const oddsBadge = abbr => modelOdds && modelOdds[abbr] != null
    ? `<div class="sm-team-odds">${fmtPct(modelOdds[abbr])}</div>` : '';

  // TBD branch — series hasn't been set yet; show bracket picks for teams to advance here
  if (t1 === 'TBD' || t2 === 'TBD') {
    renderTbdSeriesModal(content, sid, t1, t2, brackets);
    return;
  }

  // All games in this series (match by both team abbrevs)
  const allGames = Object.entries(state.apiGames)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, gs]) => gs)
    .filter(g => {
      const ga = g.awayTeam?.abbrev, gh = g.homeTeam?.abbrev;
      return (ga === a1 || ga === a2) && (gh === a1 || gh === a2);
    });

  // Series status
  const r = results[sid];
  const w1 = a1 ? (state.apiSeriesWins[a1] ?? 0) : 0;
  const w2 = a2 ? (state.apiSeriesWins[a2] ?? 0) : 0;
  let statusLine = '';
  if (r?.completed) {
    const score = r.games === 4 ? '4–0' : r.games === 5 ? '4–1' : r.games === 6 ? '4–2' : '4–3';
    statusLine = `<span class="sm-status sm-status-done">🏒 ${esc(r.winner)} wins ${score}</span>`;
  } else if (w1 + w2 > 0) {
    if (w1 === w2) statusLine = `<span class="sm-status">Tied ${w1}–${w2}</span>`;
    else if (w1 > w2) statusLine = `<span class="sm-status">${esc(t1.split(' ').pop())} leads ${w1}–${w2}</span>`;
    else statusLine = `<span class="sm-status">${esc(t2.split(' ').pop())} leads ${w2}–${w1}</span>`;
  }

  // Game cards
  const gameCards = allGames.map(g => {
    const isFinal = g.gameState === 'FINAL' || g.gameState === 'OFF';
    const isLive  = g.gameState === 'LIVE'  || g.gameState === 'CRIT';
    const date = new Date(g.startTimeUTC).toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const gNum = g.seriesStatus?.gameNumberOfSeries ?? '?';
    const ptType = g.periodDescriptor?.periodType;
    const ptSuffix = ptType === 'OT' ? 'OT' : ptType === 'SO' ? 'SO' : '';

    if (isFinal || isLive) {
      const aScore = g.awayTeam.score ?? 0, hScore = g.homeTeam.score ?? 0;
      const aWin = aScore > hScore;
      const stateTag = isLive
        ? `<span class="sm-game-live">● LIVE</span>`
        : `<span class="sm-game-final">Final${ptSuffix ? ' / ' + ptSuffix : ''}</span>`;
      return `<div class="sm-game-card" data-game-id="${g.id || ''}" style="cursor:pointer">
        <div class="sm-game-meta"><span class="sm-game-num">Game ${gNum}</span><span class="sm-game-date">${date}</span>${stateTag}</div>
        <div class="sm-game-matchup">
          <div class="sm-game-side ${aWin ? 'sm-side-win' : 'sm-side-loss'}">
            <img class="sm-game-logo" src="${logoUrl(g.awayTeam.name?.default || g.awayTeam.abbrev)}" onerror="this.style.display='none'" alt="">
            <span class="sm-game-abbr">${esc(g.awayTeam.abbrev)}</span>
            <span class="sm-game-score">${aScore}</span>
          </div>
          <div class="sm-game-dash">–</div>
          <div class="sm-game-side ${!aWin ? 'sm-side-win' : 'sm-side-loss'} sm-game-side-home">
            <span class="sm-game-score">${hScore}</span>
            <span class="sm-game-abbr">${esc(g.homeTeam.abbrev)}</span>
            <img class="sm-game-logo" src="${logoUrl(g.homeTeam.name?.default || g.homeTeam.abbrev)}" onerror="this.style.display='none'" alt="">
          </div>
        </div>
      </div>`;
    } else {
      const tStr = new Date(g.startTimeUTC).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'});
      return `<div class="sm-game-card sm-game-upcoming" data-game-id="${g.id || ''}" style="cursor:pointer">
        <div class="sm-game-meta"><span class="sm-game-num">Game ${gNum}</span><span class="sm-game-date">${date}</span></div>
        <div class="sm-game-time">${tStr}</div>
      </div>`;
    }
  }).join('');

  // Bracket picks — sorted by games picked (ascending: sweeps first)
  const total = brackets.length;
  const t1Entries = [], t2Entries = [];
  brackets.forEach(b => {
    const pick = b.picks?.[sid];
    if (!pick?.winner) return;
    const loserTeam = pick.winner === t1 ? t2 : t1;
    const loserAbbr = TEAM_ABBR[loserTeam];
    const loserWins = loserAbbr ? (state.apiSeriesWins[loserAbbr] ?? 0) : 0;
    const gamesImpossible = isGamesImpossible(pick.games, loserWins);
    const entry = { id: b.id, bracketLabel: esc(b.bracketName || b.name), byLabel: (b.bracketName && b.playerName) ? esc(b.playerName) : '', games: pick.games ?? null, gamesImpossible };
    if (pick.winner === t1) t1Entries.push(entry);
    else if (pick.winner === t2) t2Entries.push(entry);
  });
  const sortByGames = arr => [...arr].sort((a, b) => (a.games ?? 99) - (b.games ?? 99));
  const entryPill = e => `<div class="sm-pill" data-bid="${e.id}" style="cursor:pointer">
    <div class="sm-pill-main">${e.bracketLabel}${e.byLabel ? `<span class="sm-pill-by">${e.byLabel}</span>` : ''}</div>
    ${e.games ? `<span class="sm-pill-games${e.gamesImpossible ? ' sm-pill-games-dead' : ''}">in ${e.games}</span>` : ''}
  </div>`;

  const pickBlock = (team, abbr, entries) => {
    const pct = total > 0 ? Math.round(entries.length / total * 100) : 0;
    const pills = sortByGames(entries).map(entryPill).join('');
    return `<div class="sm-pick-block">
      <div class="sm-pick-hdr">
        <img class="sm-pick-logo" src="${logoUrl(team)}" onerror="this.style.display='none'" alt="">
        <span class="sm-pick-team-name">${esc(team)}</span>
        <span class="sm-pick-badge">${entries.length} <span class="sm-pick-pct">${pct}%</span></span>
      </div>
      <div class="sm-pill-list">${pills || '<span class="sm-pick-none">No picks</span>'}</div>
    </div>`;
  };

  content.innerHTML = `
    <div class="sm-matchup-header">
      <div class="sm-team-side">
        <img class="sm-team-logo-lg" src="${logoUrl(t1)}" onerror="this.style.display='none'" alt="">
        <div class="sm-team-name-lg">${esc(t1)}</div>
        ${oddsBadge(a1)}
      </div>
      <div class="sm-matchup-center">
        <div class="sm-matchup-round">${esc(s.abbr)}</div>
        <div class="sm-matchup-vs">VS</div>
        ${statusLine ? `<div class="sm-status-wrap">${statusLine}</div>` : ''}
        ${modelOdds ? `<div class="sm-odds-label">Odds to Win</div>` : ''}
      </div>
      <div class="sm-team-side sm-team-side-right">
        <img class="sm-team-logo-lg" src="${logoUrl(t2)}" onerror="this.style.display='none'" alt="">
        <div class="sm-team-name-lg">${esc(t2)}</div>
        ${oddsBadge(a2)}
      </div>
    </div>

    <div class="sm-section-label">Game Summary</div>
    <div class="sm-games-list">
      ${gameCards || '<div class="sm-no-games">No games played yet.</div>'}
    </div>

    <div class="sm-section-label">Bracket Picks</div>
    <div class="sm-picks-grid">
      ${pickBlock(t1, a1, t1Entries)}
      ${pickBlock(t2, a2, t2Entries)}
    </div>`;
}

function renderTbdSeriesModal(content, sid, t1, t2, brackets) {
  const s = BY_ID[sid];
  const total = brackets.length;
  const roundName = ROUND_NAMES[s.round] || s.abbr;

  const tbdSide = (team) => team === 'TBD'
    ? `<div class="sm-team-logo-lg sm-team-logo-tbd">?</div>
       <div class="sm-team-name-lg">To Be Determined</div>`
    : `<img class="sm-team-logo-lg" src="${logoUrl(team)}" onerror="this.style.display='none'" alt="">
       <div class="sm-team-name-lg">${esc(team)}</div>`;

  // For each upstream slot, group brackets by the team they picked to advance
  const renderSlot = (slotId) => {
    const slotSeries = BY_ID[slotId];
    const slotLabel = slotSeries ? slotSeries.abbr : slotId;
    const byTeam = {};
    brackets.forEach(b => {
      const adv = b.picks?.[slotId]?.winner;
      if (!adv) return;
      if (!byTeam[adv]) byTeam[adv] = [];
      const winsThis = b.picks?.[sid]?.winner === adv;
      byTeam[adv].push({
        id: b.id,
        bracketLabel: esc(b.bracketName || b.name),
        byLabel: (b.bracketName && b.playerName) ? esc(b.playerName) : '',
        winsThis,
      });
    });
    const sorted = Object.entries(byTeam).sort((a, b) => b[1].length - a[1].length);
    if (sorted.length === 0) {
      return `<div class="sm-tbd-col">
        <div class="sm-tbd-col-hdr">${esc(slotLabel)} Winner</div>
        <div class="sm-pick-none" style="padding:0.75rem">No picks yet.</div>
      </div>`;
    }
    const isSCF = sid === 'SCF';
    const flagClass = isSCF ? 'sm-pill-winner' : 'sm-pill-advance';
    const flagText  = isSCF ? 'winner' : 'advances';
    const blocks = sorted.map(([team, list]) => {
      const pct = total > 0 ? Math.round(list.length / total * 100) : 0;
      const pills = list.map(e => `
        <div class="sm-pill" data-bid="${e.id}" style="cursor:pointer">
          <div class="sm-pill-main">${e.bracketLabel}${e.byLabel ? `<span class="sm-pill-by">${e.byLabel}</span>` : ''}</div>
          ${e.winsThis ? `<span class="${flagClass}">${flagText}</span>` : ''}
        </div>`).join('');
      return `<div class="sm-pick-block">
        <div class="sm-pick-hdr">
          <img class="sm-pick-logo" src="${logoUrl(team)}" onerror="this.style.display='none'" alt="">
          <span class="sm-pick-team-name">${esc(team)}</span>
          <span class="sm-pick-badge">${list.length} <span class="sm-pick-pct">${pct}%</span></span>
        </div>
        <div class="sm-pill-list">${pills}</div>
      </div>`;
    }).join('');
    return `<div class="sm-tbd-col">
      <div class="sm-tbd-col-hdr">${esc(slotLabel)} Winner</div>
      ${blocks}
    </div>`;
  };

  const slots = s.from || [];
  const slotHtml = slots.length === 2
    ? `<div class="sm-tbd-grid">${renderSlot(slots[0])}${renderSlot(slots[1])}</div>`
    : '';

  content.innerHTML = `
    <div class="sm-matchup-header">
      <div class="sm-team-side">${tbdSide(t1)}</div>
      <div class="sm-matchup-center">
        <div class="sm-matchup-round">${esc(s.abbr)}</div>
        <div class="sm-matchup-vs">VS</div>
        <div class="sm-status-wrap"><span class="sm-status">Awaiting teams</span></div>
      </div>
      <div class="sm-team-side sm-team-side-right">${tbdSide(t2)}</div>
    </div>

    <div class="sm-section-label">Teams Picked to Reach the ${esc(roundName)}</div>
    <p class="sm-tbd-help">Each side shows which teams brackets picked to win their upstream series. Pills flagged ${sid === 'SCF' ? '<span class="sm-pill-winner-inline">winner</span> also picked that team to win the Cup.' : '<span class="sm-pill-advance-inline">advances</span> also picked that team to win this series.'}</p>
    ${slotHtml}`;
}

function closeSeriesModal() {
  document.getElementById('seriesModal')?.classList.remove('open');
}

// ── Home ───────────────────────────────────────────────────

function renderHome() {
  renderHomeFeed();
  bindFeedFilters();
  renderCountdown();
  renderTodayGames();
  renderHomeLeaderboard();
  // Bracket render fetches apiSeriesWins (which auto-applies completed series);
  // re-render dependents once that's available so feed events, leaderboard
  // points, and series-done counts all reflect the latest live data.
  renderActualBracket().then(() => {
    renderHomeFeed();
    renderHomeLeaderboard();
  }).catch(() => {});
  // Pull full playoff game history so the feed can compute the exact
  // determining game for each event (so old "X in N is no longer
  // possible" messages don't reappear every time a series plays again).
  fetchAllPlayoffGames().then(() => {
    if (state.view === 'home') renderHomeFeed();
  }).catch(() => {});
}

function renderHeroCard() {
  const brackets = getBrackets(), results = getResults();
  const el = document.getElementById('heroPoolCard');
  if (!el) return;
  const ranked = rankBrackets(brackets, results);
  const entryCount = brackets.length;
  const prizePool = entryCount * 25;
  const doneSeries = SERIES.filter(s => results[s.id] && results[s.id].completed).length;
  const topScore = ranked[0] ? ranked[0].pts : 0;

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const top4 = ranked.slice(0, 4).map((b, i) => {
    const rankStr = String(i + 1).padStart(2, '0');
    const bName = esc(b.bracketName || b.name);
    const pName = b.playerName ? ` · ${esc(b.playerName)}` : '';
    return `<div class="hero-leader-row">
      <span class="hero-leader-rank">${rankStr}</span>
      <span class="hero-leader-name">${bName}<small>${pName}</small></span>
      <span class="hero-leader-pts">${b.pts}</span>
    </div>`;
  }).join('') || '<div style="padding:1rem 1.25rem;font-size:0.82rem;color:var(--text-3)">No entries yet.</div>';

  el.innerHTML = `
    <div class="hero-card-hdr">
      <div class="hero-card-title">Pool Overview</div>
      <div class="hero-card-meta">Live · ${today}</div>
    </div>
    <div class="hero-stats">
      <div>
        <div class="hero-stat-val red">${entryCount}</div>
        <div class="hero-stat-lbl">Entries</div>
      </div>
      <div>
        <div class="hero-stat-val">$${prizePool.toLocaleString()}</div>
        <div class="hero-stat-lbl">Prize Pool</div>
      </div>
      <div>
        <div class="hero-stat-val ice">${doneSeries}/${SERIES.length}</div>
        <div class="hero-stat-lbl">Series Done</div>
      </div>
      <div>
        <div class="hero-stat-val">${topScore}</div>
        <div class="hero-stat-lbl">Top Score</div>
      </div>
    </div>
    <div style="padding:0.5rem 1.25rem 0.4rem">
      <div class="hero-card-title" style="font-size:0.62rem;color:var(--text-3);margin-bottom:0.4rem">Top 4</div>
    </div>
    <div class="hero-leader">${top4}</div>`;
}

// ── NHL Live Scores ────────────────────────────────────────

const NHL_SCORE_URL = 'https://api-web.nhle.com/v1/score/now';
const CORS_PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

// The NHL score endpoint uses topSeedTeamId; the schedule endpoint uses
// topSeedTeamAbbrev. This helper handles both.
function ssTopIsAway(ss, away) {
  if (ss.topSeedTeamAbbrev) return ss.topSeedTeamAbbrev === away.abbrev;
  return ss.topSeedTeamId === away.id;
}

// Build series wins map from NHL score API games.
// seriesStatus has topSeedTeamId/topSeedWins/bottomSeedTeamId/bottomSeedWins.
// Returns { 'TOR': 3, 'BOS': 2, ... }
function extractSeriesWins(games) {
  const wins = {};
  (games || []).filter(g => g.gameType === 3).forEach(g => {
    const ss = g.seriesStatus;
    const away = g.awayTeam, home = g.homeTeam;
    if (!ss || !away || !home) return;
    const topIsAway = ssTopIsAway(ss, away);
    const awayWins = topIsAway ? (ss.topSeedWins ?? 0) : (ss.bottomSeedWins ?? 0);
    const homeWins = topIsAway ? (ss.bottomSeedWins ?? 0) : (ss.topSeedWins ?? 0);
    if (away.abbrev) wins[away.abbrev] = awayWins;
    if (home.abbrev) wins[home.abbrev] = homeWins;
  });
  return wins;
}

// Fetch series wins for all active playoff series.
// Tries today + yesterday so series without games today are still covered.
// Populates state.apiSeriesWins: { 'TOR': 3, 'BOS': 2, ... }
async function fetchApiSeriesWins() {
  const dates = [new Date(), new Date(Date.now() - 86400000), new Date(Date.now() - 2*86400000)];
  const wins = {};
  for (const d of dates) {
    const dateStr = d.toISOString().slice(0, 10);
    const url = `https://api-web.nhle.com/v1/score/${dateStr}`;
    try {
      const res = await fetchWithProxy(url);
      const data = await res.json();
      const games = (data.games || []).filter(g => g.gameType === 3);
      Object.assign(wins, extractSeriesWins(games));
      if (!state.apiGames[dateStr]) state.apiGames[dateStr] = games;
    } catch (_) {}
  }
  if (Object.keys(wins).length > 0) {
    state.apiSeriesWins = wins;
    autoApplyCompletedSeries();
  }
}

// Fetch ALL playoff games from season start to today, caching by date.
async function fetchAllPlayoffGames() {
  const start = new Date(PLAYOFF_START);
  const today = new Date();
  const missing = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (!state.apiGames[ds]) missing.push(ds);
  }
  await Promise.all(missing.map(async ds => {
    try {
      const res = await fetchWithProxy(`https://api-web.nhle.com/v1/score/${ds}`);
      const data = await res.json();
      state.apiGames[ds] = (data.games || []).filter(g => g.gameType === 3);
    } catch (_) { state.apiGames[ds] = []; }
  }));
}

async function fetchWithProxy(url) {
  // Try direct first (works if browser/NHL ever allows CORS)
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return r;
  } catch (_) {}
  // Fall back through each proxy
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { cache: 'no-store' });
      if (r.ok) return r;
    } catch (_) {}
  }
  throw new Error('All NHL API attempts failed');
}

function updateTicker(games) {
  const el = document.getElementById('tickerContent');
  if (!el) return;
  if (!games.length) {
    el.textContent = '2026 NHL Playoffs · Bracket Challenge 26 · No games today';
    return;
  }
  const segments = games.map(g => {
    const away = g.awayTeam, home = g.homeTeam;
    const aAbbr = away.abbrev || '???', hAbbr = home.abbrev || '???';
    const gstate = g.gameState;
    const isFinal = gstate === 'FINAL' || gstate === 'OFF';
    const isLive  = gstate === 'LIVE'  || gstate === 'CRIT';
    if (isFinal || isLive) {
      const ptType = g.periodDescriptor?.periodType;
      const sfx = ptType === 'OT' ? '/OT' : ptType === 'SO' ? '/SO' : '';
      const tag = isLive
        ? (() => { const pd = g.periodDescriptor || {}; const p = pd.periodType === 'OT' ? 'OT' : pd.periodType === 'SO' ? 'SO' : `P${pd.number||''}`; const t = g.clock?.timeRemaining || ''; return `● ${p}${t ? ' '+t : ''}`; })()
        : `Final${sfx}`;
      const winner = away.score > home.score ? aAbbr : hAbbr;
      return `${aAbbr} ${away.score ?? 0}  ${home.score ?? 0} ${hAbbr}  ${tag}`;
    } else {
      const t = new Date(g.startTimeUTC).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
      return `${aAbbr} vs ${hAbbr}  ${t}`;
    }
  });
  el.textContent = segments.join('   ·   ');
}

async function renderTodayGames() {
  const el = document.getElementById('todayGames');
  if (!el) return;
  try {
    const res = await fetchWithProxy(NHL_SCORE_URL);
    const data = await res.json();
    const games = (data.games || []).filter(g => g.gameType === 3); // playoffs only
    updateTicker(games);
    if (!games.length) {
      el.innerHTML = '<div class="scores-empty">No playoff games scheduled today.</div>';
      document.getElementById('scoresRefreshBadge').textContent = '';
      return;
    }
    el.innerHTML = `<div class="tg-grid">${games.map(gameCard).join('')}</div>`;
    const now = new Date();
    document.getElementById('scoresRefreshBadge').textContent =
      'Updated ' + now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  } catch (e) {
    el.innerHTML = '<div class="scores-empty">Could not load games — check back soon.</div>';
  }
}

// ── Schedule ────────────────────────────────────────────────

// 2026 playoff window: April 18 – June 30
const PLAYOFF_START = '2026-04-18';
const PLAYOFF_END   = '2026-06-30';

function scheduleDates() {
  const dates = [];
  const cur = new Date(PLAYOFF_START + 'T12:00:00Z');
  const end = new Date(PLAYOFF_END   + 'T12:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function renderSchedule() {
  renderDateStrip(state.scheduleDate);
  fetchScheduleGames(state.scheduleDate);
}

function renderDateStrip(selected) {
  const strip = document.getElementById('scheduleDateStrip');
  if (!strip) return;
  const dates = scheduleDates();
  strip.innerHTML = dates.map(d => {
    const dt = new Date(d + 'T12:00:00Z');
    const mon = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = dt.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const num = dt.getUTCDate();
    const active = d === selected ? ' active' : '';
    return `<button class="date-btn${active}" data-date="${d}">
      <span class="date-day">${day}</span>
      <span class="date-num">${num}</span>
      <span class="date-mon">${mon}</span>
    </button>`;
  }).join('');

  // Scroll selected into view
  strip.querySelector('.date-btn.active')
    ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });

  strip.addEventListener('click', e => {
    const btn = e.target.closest('.date-btn');
    if (!btn) return;
    state.scheduleDate = btn.dataset.date;
    renderSchedule();
  }, { once: true });
}

async function fetchScheduleGames(date) {
  const el = document.getElementById('scheduleGames');
  if (!el) return;
  el.innerHTML = '<div class="scores-loading">Loading games…</div>';
  try {
    const res = await fetchWithProxy(`https://api-web.nhle.com/v1/score/${date}`);
    const data = await res.json();
    const games = (data.games || []).filter(g => g.gameType === 3);
    const badge = document.getElementById('scheduleRefreshBadge');
    if (!games.length) {
      el.innerHTML = '<div class="scores-empty">No playoff games on this date.</div>';
      if (badge) badge.textContent = '';
      return;
    }
    el.innerHTML = `<div class="tg-grid tg-grid-wide">${games.map(gameCard).join('')}</div>`;
    if (badge) badge.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch (e) {
    el.innerHTML = '<div class="scores-empty">Could not load games — check back soon.</div>';
  }
}

function gameCard(g) {
  const away = g.awayTeam, home = g.homeTeam;
  const gstate = g.gameState; // FUT PRE LIVE CRIT FINAL OFF
  const isLive  = gstate === 'LIVE' || gstate === 'CRIT';
  const isFinal = gstate === 'FINAL' || gstate === 'OFF';
  const isFut   = !isLive && !isFinal;

  // ── Status badge ──
  let statusHtml;
  if (isLive) {
    const pd = g.periodDescriptor || {};
    const pNum = pd.number || g.period || '';
    const pType = pd.periodType || 'REG';
    const periodLabel = pType === 'OT' ? 'OT' : pType === 'SO' ? 'SO' : `P${pNum}`;
    const clock = g.clock?.timeRemaining || '';
    statusHtml = `<span class="mc-status mc-live">● Live${clock ? ' · ' + clock : ''} · ${periodLabel}</span>`;
  } else if (isFinal) {
    const pType = g.periodDescriptor?.periodType || 'REG';
    const suffix = pType === 'OT' ? '/OT' : pType === 'SO' ? '/SO' : '';
    statusHtml = `<span class="mc-status mc-final">Final${suffix}</span>`;
  } else {
    const t = new Date(g.startTimeUTC);
    const timeStr = t.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZoneName:'short' });
    statusHtml = `<span class="mc-status mc-future">${timeStr}</span>`;
  }

  // ── Series info ──
  const ss = g.seriesStatus;
  const gameNum = ss?.gameNumberOfSeries ?? null;
  const topLine = gameNum ? `Game ${gameNum}` : 'Playoff';

  let seriesRecord = '';
  if (ss) {
    const topIsAway = ssTopIsAway(ss, away);
    const aw = topIsAway ? (ss.topSeedWins ?? 0) : (ss.bottomSeedWins ?? 0);
    const hw = topIsAway ? (ss.bottomSeedWins ?? 0) : (ss.topSeedWins ?? 0);
    if (aw === hw) {
      seriesRecord = aw === 0 ? 'Series begins' : `Tied ${aw}–${hw}`;
    } else if (aw > hw) {
      seriesRecord = `<b>${away.abbrev}</b> leads ${aw}–${hw}`;
    } else {
      seriesRecord = `<b>${home.abbrev}</b> leads ${hw}–${aw}`;
    }
  }

  // ── Abbreviations & city names ──
  const awayAbbr = away.abbrev || TEAM_ABBR[away.name?.default || ''] || '???';
  const homeAbbr = home.abbrev || TEAM_ABBR[home.name?.default || ''] || '???';
  const awayCity = away.name?.default || awayAbbr;
  const homeCity = home.name?.default || homeAbbr;
  const awayLead = !isFut && away.score > home.score;
  const homeLead = !isFut && home.score > away.score;

  // ── Center content (score or time) ──
  let centerHtml;
  if (isFut) {
    const t = new Date(g.startTimeUTC);
    const timeStr = t.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    centerHtml = `<div class="mc-time">${timeStr}</div>`;
  } else {
    centerHtml = `<div class="mc-score">
      <span${awayLead ? '' : ' class="dim"'}>${away.score}</span>
      <span class="dash">–</span>
      <span${homeLead ? '' : ' class="dim"'}>${home.score}</span>
    </div>`;
  }

  const awayDim = !isFut && !awayLead && home.score > 0;
  const homeDim = !isFut && !homeLead && away.score > 0;
  const awayLogoUrl = logoUrlForAbbr(awayAbbr);
  const homeLogoUrl = logoUrlForAbbr(homeAbbr);

  if (g.id) state.gameById[g.id] = g;

  return `<div class="mc${isLive ? ' mc-live-card' : ''}" data-game-id="${g.id || ''}" style="cursor:pointer">
    <div class="mc-top"><span>${esc(topLine)}</span>${statusHtml}</div>
    <div class="mc-body">
      <div class="mc-team-side">
        <img class="mc-logo${awayDim ? ' dim' : ''}" src="${awayLogoUrl}" onerror="this.style.display='none'" alt="${awayAbbr}">
        <div class="mc-abbr${awayDim ? ' dim' : ''}">${awayAbbr}</div>
        <div class="mc-city">${esc(awayCity)}</div>
      </div>
      <div class="mc-center">${centerHtml}</div>
      <div class="mc-team-side home">
        <img class="mc-logo${homeDim ? ' dim' : ''}" src="${homeLogoUrl}" onerror="this.style.display='none'" alt="${homeAbbr}">
        <div class="mc-abbr${homeDim ? ' dim' : ''}">${homeAbbr}</div>
        <div class="mc-city">${esc(homeCity)}</div>
      </div>
    </div>
    ${seriesRecord ? `<div class="mc-series">${seriesRecord}</div>` : ''}
  </div>`;
}

// ── Game Detail Modal ────────────────────────────────────────

async function showGameModal(gameId, fromSeriesId) {
  const modal = document.getElementById('seriesModal');
  const content = document.getElementById('seriesModalContent');
  if (!modal || !content) return;

  const quick = state.gameById[gameId];

  // Auto-detect series from team abbreviations if not provided
  if (!fromSeriesId && quick) {
    const awayAbbr = quick.awayTeam?.abbrev;
    const homeAbbr = quick.homeTeam?.abbrev;
    const results = getResults(), teams = getTeams();
    for (const s of SERIES) {
      const [t1, t2] = getActualTeams(s.id, results, teams);
      const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
      if (a1 && a2 && ((a1 === awayAbbr && a2 === homeAbbr) || (a2 === awayAbbr && a1 === homeAbbr))) {
        fromSeriesId = s.id;
        break;
      }
    }
  }
  content.innerHTML = buildGameModalShell(quick);
  modal.classList.add('open');

  try {
    const res = await fetchWithProxy(`https://api-web.nhle.com/v1/gamecenter/${gameId}/landing`);
    const data = await res.json();
    content.innerHTML = buildGameModalFull(data, fromSeriesId);
  } catch (_) {
    if (quick) content.innerHTML = buildGameModalFull(quick, fromSeriesId);
    else content.querySelector('.gm-loading').textContent = 'Could not load game details.';
  }
}

function buildGameModalShell(g) {
  if (!g) return '<div class="gm-loading series-modal-loading">Loading…</div>';
  const away = g.awayTeam, home = g.homeTeam;
  const awayAbbr = away.abbrev || '???';
  const homeAbbr = home.abbrev || '???';
  const isFinal = g.gameState === 'FINAL' || g.gameState === 'OFF';
  const isLive  = g.gameState === 'LIVE'  || g.gameState === 'CRIT';
  const scoreHtml = (isFinal || isLive)
    ? `<div class="gm-score">${away.score ?? 0}<span class="gm-dash">–</span>${home.score ?? 0}</div>`
    : `<div class="gm-vs">VS</div>`;
  return `<div class="sm-matchup-header">
    <div class="sm-team-side">
      <img class="sm-team-logo-lg" src="${logoUrlForAbbr(awayAbbr)}" onerror="this.style.display='none'" alt="">
      <div class="sm-team-name-lg">${esc(away.name?.default || awayAbbr)}</div>
    </div>
    <div class="sm-matchup-center">${scoreHtml}<div class="gm-loading series-modal-loading" style="margin-top:0.5rem">Loading…</div></div>
    <div class="sm-team-side sm-team-side-right">
      <img class="sm-team-logo-lg" src="${logoUrlForAbbr(homeAbbr)}" onerror="this.style.display='none'" alt="">
      <div class="sm-team-name-lg">${esc(home.name?.default || homeAbbr)}</div>
    </div>
  </div>`;
}

function buildGameModalFull(data, fromSeriesId) {
  const away = data.awayTeam, home = data.homeTeam;
  const awayAbbr = away.abbrev || '???';
  const homeAbbr = home.abbrev || '???';
  const gstate = data.gameState;
  const isFinal = gstate === 'FINAL' || gstate === 'OFF';
  const isLive  = gstate === 'LIVE'  || gstate === 'CRIT';
  const isFut   = !isFinal && !isLive;

  // Status line
  const pd = data.periodDescriptor || {};
  const ptType = pd.periodType || 'REG';
  const pNum = pd.number || 0;
  let statusBadge;
  if (isFinal) {
    const sfx = ptType === 'OT' ? '/OT' : ptType === 'SO' ? '/SO' : '';
    statusBadge = `<span class="sm-status sm-status-done">Final${sfx}</span>`;
  } else if (isLive) {
    const clock = data.clock?.timeRemaining || '';
    const pLabel = ptType === 'OT' ? 'OT' : ptType === 'SO' ? 'SO' : `P${pNum}`;
    statusBadge = `<span class="sm-status sm-status-live">● Live · ${clock ? clock + ' · ' : ''}${pLabel}</span>`;
  } else {
    const t = new Date(data.startTimeUTC);
    const timeStr = t.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZoneName:'short' });
    statusBadge = `<span class="sm-status sm-status-future">${timeStr}</span>`;
  }

  // Header
  const awayWin = !isFut && (away.score ?? 0) > (home.score ?? 0);
  const homeWin = !isFut && (home.score ?? 0) > (away.score ?? 0);
  const scoreOrVs = isFut
    ? `<div class="sm-matchup-vs">VS</div>`
    : `<div class="gm-score${awayWin ? ' gm-away-win' : homeWin ? ' gm-home-win' : ''}"><span class="${awayWin ? '' : 'gm-dim'}">${away.score ?? 0}</span><span class="gm-dash">–</span><span class="${homeWin ? '' : 'gm-dim'}">${home.score ?? 0}</span></div>`;

  // Series record
  const ss = data.seriesStatus;
  let seriesLine = '';
  if (ss) {
    const gNum = ss.gameNumberOfSeries ? `Game ${ss.gameNumberOfSeries}` : '';
    const topIsAway = ssTopIsAway(ss, away);
    const aw = topIsAway ? (ss.topSeedWins ?? 0) : (ss.bottomSeedWins ?? 0);
    const hw = topIsAway ? (ss.bottomSeedWins ?? 0) : (ss.topSeedWins ?? 0);
    const record = aw === hw ? (aw === 0 ? 'Series begins' : `Tied ${aw}–${hw}`)
      : aw > hw ? `${awayAbbr} leads ${aw}–${hw}` : `${homeAbbr} leads ${hw}–${aw}`;
    seriesLine = gNum ? `${gNum} · ${record}` : record;
  }

  const venue = data.venue?.default ? `<div class="gm-venue">${esc(data.venue.default)}</div>` : '';

  let html = fromSeriesId
    ? `<button class="gm-back-btn" data-series-id="${fromSeriesId}">← View Series</button>`
    : '';
  html += `<div class="sm-matchup-header">
    <div class="sm-team-side">
      <img class="sm-team-logo-lg" src="${logoUrlForAbbr(awayAbbr)}" onerror="this.style.display='none'" alt="">
      <div class="sm-team-name-lg">${esc(away.name?.default || awayAbbr)}</div>
      ${away.sog != null ? `<div class="gm-sog">${away.sog} SOG</div>` : ''}
    </div>
    <div class="sm-matchup-center">
      ${scoreOrVs}
      <div class="sm-status-wrap">${statusBadge}</div>
      ${seriesLine ? `<div class="sm-matchup-round">${esc(seriesLine)}</div>` : ''}
      ${venue}
    </div>
    <div class="sm-team-side sm-team-side-right">
      <img class="sm-team-logo-lg" src="${logoUrlForAbbr(homeAbbr)}" onerror="this.style.display='none'" alt="">
      <div class="sm-team-name-lg">${esc(home.name?.default || homeAbbr)}</div>
      ${home.sog != null ? `<div class="gm-sog">${home.sog} SOG</div>` : ''}
    </div>
  </div>`;

  const summary = data.summary || {};

  // Period-by-period shots/score table
  const periods = summary.scoring || [];
  // shotsByPeriod: try both common field names
  const shotsByPeriod = summary.shotsByPeriod || summary.shotsOnGoalByPeriod || [];
  if (periods.length || shotsByPeriod.length) {
    // Build shot counts by period number
    const shotMap = {};
    shotsByPeriod.forEach(p => {
      const key = p.periodDescriptor?.number ?? p.number ?? p.period;
      shotMap[key] = p;
    });

    const periodRows = periods.map(p => {
      const pGoals = p.goals || [];
      const awayG = pGoals.filter(g => (g.teamAbbrev?.default || g.teamAbbrev) === awayAbbr).length;
      const homeG = pGoals.filter(g => (g.teamAbbrev?.default || g.teamAbbrev) === homeAbbr).length;
      const pNum = p.periodDescriptor?.number ?? p.period;
      const pType = p.periodDescriptor?.periodType || 'REG';
      const label = pType === 'OT' ? 'OT' : pType === 'SO' ? 'SO' : `P${pNum}`;
      const shots = shotMap[pNum];
      const aSog = shots?.away ?? shots?.awaySOG ?? '–';
      const hSog = shots?.home ?? shots?.homeSOG ?? '–';
      return `<tr>
        <td class="gm-tbl-period">${label}</td>
        <td class="gm-tbl-goals ${awayG > homeG ? 'gm-tbl-lead' : ''}">${awayG}</td>
        <td class="gm-tbl-shots">${aSog}</td>
        <td class="gm-tbl-div">|</td>
        <td class="gm-tbl-goals ${homeG > awayG ? 'gm-tbl-lead' : ''}">${homeG}</td>
        <td class="gm-tbl-shots">${hSog}</td>
      </tr>`;
    });

    html += `<div class="sm-section-label">By Period</div>
    <div class="gm-period-table-wrap">
      <table class="gm-period-table">
        <thead>
          <tr>
            <th rowspan="2"></th>
            <th colspan="2" class="gm-th-team">${awayAbbr}</th>
            <th rowspan="2"></th>
            <th colspan="2" class="gm-th-team">${homeAbbr}</th>
          </tr>
          <tr>
            <th class="gm-th-sub">G</th><th class="gm-th-sub">SOG</th>
            <th class="gm-th-sub">G</th><th class="gm-th-sub">SOG</th>
          </tr>
        </thead>
        <tbody>${periodRows.join('')}</tbody>
        <tfoot><tr>
          <td class="gm-tbl-period">TOT</td>
          <td class="gm-tbl-goals gm-tbl-total ${awayWin ? 'gm-tbl-lead' : ''}">${away.score ?? '–'}</td>
          <td class="gm-tbl-shots">${away.sog ?? '–'}</td>
          <td class="gm-tbl-div">|</td>
          <td class="gm-tbl-goals gm-tbl-total ${homeWin ? 'gm-tbl-lead' : ''}">${home.score ?? '–'}</td>
          <td class="gm-tbl-shots">${home.sog ?? '–'}</td>
        </tr></tfoot>
      </table>
    </div>`;
  }

  // Goal-by-goal scoring summary
  const periods2 = summary.scoring || [];
  const allGoals = periods2.flatMap(p => {
    const pLabel = (p.periodDescriptor?.periodType === 'OT') ? 'OT'
      : (p.periodDescriptor?.periodType === 'SO') ? 'SO'
      : `P${p.periodDescriptor?.number ?? p.period}`;
    return (p.goals || []).map(g => ({ ...g, _pLabel: pLabel }));
  });

  if (allGoals.length) {
    const goalRows = allGoals.map(g => {
      const teamAbbr = g.teamAbbrev?.default || g.teamAbbrev || '';
      const isAway = teamAbbr === awayAbbr;
      const scorer = `${g.firstName?.default || ''} ${g.lastName?.default || g.lastName || ''}`.trim();
      const assists = (g.assists || []).map(a => `${a.firstName?.default || ''} ${a.lastName?.default || a.lastName || ''}`.trim()).filter(Boolean);
      const strength = g.strength?.code && g.strength.code !== 'EV' ? `<span class="gm-goal-strength">${g.strength.code}</span>` : '';
      const emptyNet = g.goalModifier === 'empty-net' ? `<span class="gm-goal-strength gm-goal-en">EN</span>` : '';
      const assistLine = assists.length ? `<div class="gm-goal-assists">Assists: ${assists.join(', ')}</div>` : '<div class="gm-goal-assists">Unassisted</div>';
      return `<div class="gm-goal-row ${isAway ? 'gm-goal-away' : 'gm-goal-home'}">
        <div class="gm-goal-team-bar" style="background:${isAway ? 'var(--red-dim)' : 'var(--ice-dim)'}"></div>
        <div class="gm-goal-info">
          <div class="gm-goal-top">
            <span class="gm-goal-period">${g._pLabel} ${g.timeInPeriod || ''}</span>
            <span class="gm-goal-abbr">${teamAbbr}</span>
            ${strength}${emptyNet}
          </div>
          <div class="gm-goal-scorer">${esc(scorer)}</div>
          ${assistLine}
        </div>
      </div>`;
    });
    html += `<div class="sm-section-label">Scoring Summary</div>
    <div class="gm-goals-list">${goalRows.join('')}</div>`;
  } else if (!isFut) {
    html += `<div class="sm-section-label">Scoring Summary</div>
    <div class="gm-no-goals">No goals recorded yet.</div>`;
  }

  // Penalty summary — summary.penalties is grouped by period like summary.scoring
  const allPenalties = (summary.penalties || []).flatMap(pg => {
    const pNum = pg.periodDescriptor?.number ?? pg.period;
    const pType = pg.periodDescriptor?.periodType || 'REG';
    const pLabel = pType === 'OT' ? 'OT' : pType === 'SO' ? 'SO' : `P${pNum}`;
    return (pg.penalties || []).map(p => ({ ...p, _pLabel: pLabel }));
  });
  if (allPenalties.length) {
    const penRows = allPenalties.map(pen => {
      const teamAbbr = pen.teamAbbrev?.default || pen.teamAbbrev || '';
      const isAway = teamAbbr === awayAbbr;
      const player = `${pen.committedByPlayer?.firstName?.default || ''} ${pen.committedByPlayer?.lastName?.default || ''}`.trim();
      const drawnBy = pen.drawnBy ? `${pen.drawnBy.firstName?.default || ''} ${pen.drawnBy.lastName?.default || ''}`.trim() : '';
      const desc = pen.descKey ? pen.descKey.replace(/-/g, ' ') : (pen.type || '');
      const mins = pen.duration ? `${pen.duration} min` : '';
      return `<div class="gm-pen-row">
        <div class="gm-pen-team-bar" style="background:${isAway ? 'var(--red-dim)' : 'var(--ice-dim)'}"></div>
        <div class="gm-pen-info">
          <div class="gm-pen-top">
            <span class="gm-goal-period">${pen._pLabel} ${pen.timeInPeriod || ''}</span>
            <span class="gm-goal-abbr">${teamAbbr}</span>
            ${mins ? `<span class="gm-pen-mins">${mins}</span>` : ''}
          </div>
          <div class="gm-pen-player">${esc(player)}</div>
          <div class="gm-goal-assists">${esc(desc)}${drawnBy ? ` · drawn by ${esc(drawnBy)}` : ''}</div>
        </div>
      </div>`;
    });
    html += `<div class="sm-section-label">Penalties</div>
    <div class="gm-goals-list">${penRows.join('')}</div>`;
  }

  // Upcoming: show venue/time prominently
  if (isFut) {
    const t = new Date(data.startTimeUTC);
    const fullDate = t.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
    const timeStr  = t.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZoneName:'short' });
    html += `<div class="gm-upcoming-detail">
      <div class="gm-upcoming-date">${fullDate}</div>
      <div class="gm-upcoming-time">${timeStr}</div>
      ${data.venue?.default ? `<div class="gm-upcoming-venue">${esc(data.venue.default)}</div>` : ''}
    </div>`;
  }

  return html;
}

function renderCountdown() {
  const el = document.getElementById('homeCountdown');
  const { lockDate, hideEntryTab } = getSettings();
  if (!lockDate || hideEntryTab) { el.innerHTML = ''; return; }
  const target = new Date(lockDate), now = new Date();
  if (now >= target) { el.innerHTML = '<span class="countdown-locked">🔒 Bracket Entry Locked</span>'; return; }
  const diff = target - now;
  const d = Math.floor(diff/86400000), h = Math.floor((diff%86400000)/3600000),
        m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
  el.innerHTML = `
    <div class="countdown-label">Bracket locks in</div>
    <div class="countdown-digits">
      <div class="countdown-unit"><span class="countdown-num">${pad(d)}</span><span class="countdown-lbl">Days</span></div>
      <div class="countdown-unit"><span class="countdown-num">${pad(h)}</span><span class="countdown-lbl">Hrs</span></div>
      <div class="countdown-unit"><span class="countdown-num">${pad(m)}</span><span class="countdown-lbl">Min</span></div>
      <div class="countdown-unit"><span class="countdown-num">${pad(s)}</span><span class="countdown-lbl">Sec</span></div>
    </div>`;
}

function renderHomeLeaderboard() {
  const el = document.getElementById('homeLeaderboard');
  const brackets = getBrackets(), results = getResults();
  if (!brackets.length) {
    el.innerHTML = '<div class="empty-state">No entries yet. Be the first to submit a bracket!</div>';
    return;
  }
  const ranked = rankBrackets(brackets, results);
  el.innerHTML = buildLeaderboardTable(ranked.slice(0, 8), results, true, brackets.length);
}

function rankBrackets(brackets, results) {
  return brackets.map(b => {
    const { pts, correct } = scoreOneBracket(b, results);
    return { ...b, pts, correct, proj: maxPossible(b, results) };
  }).sort((a,b) => b.pts - a.pts || b.proj - a.proj);
}

function buildLeaderboardTable(ranked, results, mini = false, totalCount = null) {
  if (!ranked.length) return '<div class="empty-state">No entries yet.</div>';
  const entryCount = totalCount !== null ? totalCount : ranked.length;
  const prizePool = entryCount * 25;
  const first = (entryCount - 1) * 25;
  const second = 25;

  const prizeStrip = `<div class="prize-strip">
    <div class="prize-item"><div class="prize-lbl">Prize Pool</div><div class="prize-val gold">$${prizePool.toLocaleString()}</div></div>
    <div class="prize-item"><div class="prize-lbl">1st Place</div><div class="prize-val gold">$${first.toLocaleString()}</div></div>
    <div class="prize-item"><div class="prize-lbl">2nd Place</div><div class="prize-val silver">$${second.toLocaleString()}</div></div>
    <div class="prize-item"><div class="prize-lbl">Max Score</div><div class="prize-val">390</div></div>
  </div>`;

  const hasResults = Object.values(results).some(r => r.completed);
  let rows = '';
  ranked.forEach((b, i) => {
    const rank = i + 1;
    const rankStr = String(rank).padStart(2, '0');
    const topClass = rank === 1 ? ' top-1' : rank === 2 ? ' top-2' : rank === 3 ? ' top-3' : '';
    const cupWinner = b.picks && b.picks['SCF'] && b.picks['SCF'].winner;
    const cupAbbr = cupWinner ? (TEAM_ABBR[cupWinner] || cupWinner.split(' ').pop()) : null;
    const cupCity = cupWinner ? (TEAM_CITY[cupWinner] || cupWinner) : null;
    const cupLogoUrl = logoUrlForAbbr(cupAbbr);
    const cupCell = cupAbbr
      ? `<img class="lb-cup-logo" src="${cupLogoUrl}" onerror="this.style.display='none'" alt="${esc(cupAbbr)}"><span class="lb-cup-abbr">${esc(cupAbbr)}</span>`
      : `<span style="color:var(--text-3)">—</span>`;

    rows += `<div class="lb-row${topClass}" data-bid="${b.id}">
      <div class="lb-rank">${rankStr}</div>
      <div class="lb-name">
        <span class="lb-bracket">${esc(b.bracketName || b.name)}</span>
        ${b.playerName ? `<span class="lb-player">${esc(b.playerName)}</span>` : ''}
      </div>
      <div class="lb-points">
        <div class="lb-pts-val">${b.pts}</div>
        <div class="lb-pts-lbl">pts · max ${b.proj}</div>
      </div>
      ${hasResults ? `<div class="lb-meta"><b>${b.correct}</b> correct</div>` : ''}
      <div class="lb-cup">${cupCell}</div>
    </div>`;
  });
  return prizeStrip + `<div class="lb-list">${rows}</div>`;
}

// ── Bracket Entry ──────────────────────────────────────────

function applyEntryTabVisibility() {
  const { hideEntryTab } = getSettings();
  const hidden = !!hideEntryTab;
  document.querySelectorAll('[data-view="entry"]').forEach(el => {
    el.style.display = hidden ? 'none' : '';
  });
}

function renderEntry() {
  const locked = isLocked();
  const { hideEntryTab } = getSettings();
  document.getElementById('entryLockedMsg').style.display = (locked && !hideEntryTab) ? '' : 'none';
  if (document.getElementById('entrySuccessMsg').style.display !== 'none') return;
  document.getElementById('entryFormWrap').style.display = '';
  document.getElementById('entrySuccessMsg').style.display = 'none';
  renderEntryRounds();
}

function renderEntryRounds() {
  const teams = getTeams();
  const byRound = {};
  SERIES.forEach(s => {
    if (!byRound[s.round]) byRound[s.round] = { East:[], West:[], Final:[] };
    byRound[s.round][s.conf].push(s);
  });
  let html = '';
  for (let round = 1; round <= 4; round++) {
    const pts = ROUND_PTS[round];
    html += `<div class="entry-round-header">
      <span class="entry-round-title">${ROUND_NAMES[round]}</span>
      <span class="entry-round-pts">${pts.w} pts / ${pts.g} bonus for games</span>
    </div>`;
    const confs = round < 4 ? ['East','West'] : ['Final'];
    for (const conf of confs) {
      const confSeries = byRound[round][conf] || [];
      if (!confSeries.length) continue;
      if (round < 4) {
        const label = round < 3 ? `${conf}ern Conference` : `${conf}ern Conference Final`;
        html += `<div class="entry-conf-label">${label}</div>`;
      }
      html += `<div class="entry-series-grid">`;
      confSeries.forEach(s => { html += buildEntrySeriesCard(s, teams); });
      html += `</div>`;
    }
  }
  document.getElementById('entryRounds').innerHTML = html;
  syncEntryPicksToDOM();
}

function buildEntrySeriesCard(s, teams) {
  const [t1, t2] = getSeriesTeams(s.id, state.entryPicks, teams);
  const dis = isLocked() ? 'disabled' : '';
  const a1 = TEAM_ABBR[t1] || t1.split(' ').pop().toUpperCase().slice(0, 3);
  const a2 = TEAM_ABBR[t2] || t2.split(' ').pop().toUpperCase().slice(0, 3);
  const n1 = t1 === 'TBD' ? '' : (TEAM_CITY[t1] || t1);
  const n2 = t2 === 'TBD' ? '' : (TEAM_CITY[t2] || t2);
  return `
    <div class="series-card" id="ecard-${s.id}" data-sid="${s.id}">
      <div class="sc-top series-card-label"><span>${esc(s.abbr)}</span></div>
      <div class="sc-pick-row team-picks">
        <button class="sc-pick team-pick-btn" data-sid="${s.id}" data-team="t1" ${dis}>
          <div class="sc-pick-abbr team-abbr-txt">${esc(a1)}</div>
          ${n1 ? `<div class="sc-pick-name team-name-txt">${esc(n1)}</div>` : ''}
        </button>
        <div class="sc-vs">vs</div>
        <button class="sc-pick team-pick-btn" data-sid="${s.id}" data-team="t2" ${dis}>
          <div class="sc-pick-abbr team-abbr-txt">${esc(a2)}</div>
          ${n2 ? `<div class="sc-pick-name team-name-txt">${esc(n2)}</div>` : ''}
        </button>
      </div>
      <div class="sc-games-lbl games-label">Series Length</div>
      <div class="sc-games games-btns">
        ${[4,5,6,7].map(g=>`<button class="sc-g game-btn" data-sid="${s.id}" data-games="${g}" ${dis}>${g}</button>`).join('')}
      </div>
    </div>`;
}

function syncEntryPicksToDOM() {
  const teams = getTeams();
  for (const s of SERIES) {
    if (s.round === 1) continue;
    const [t1, t2] = getSeriesTeams(s.id, state.entryPicks, teams);
    const card = document.getElementById('ecard-' + s.id);
    if (!card) continue;
    const btns = card.querySelectorAll('.team-pick-btn');
    setTeamBtn(btns[0], t1);
    setTeamBtn(btns[1], t2);
  }
  for (const [sid, pick] of Object.entries(state.entryPicks)) {
    const card = document.getElementById('ecard-' + sid);
    if (!card) continue;
    const [t1, t2] = getSeriesTeams(sid, state.entryPicks, teams);
    card.querySelectorAll('.team-pick-btn').forEach(btn => {
      const teamVal = btn.dataset.team === 't1' ? t1 : t2;
      const sel = teamVal === pick.winner;
      btn.classList.toggle('selected', sel);
      const chk = btn.querySelector('.pick-check');
      if (chk) chk.textContent = sel ? '✓' : '';
    });
    card.querySelectorAll('.game-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.games) === pick.games);
    });
    card.classList.toggle('complete', !!(pick.winner && pick.games));
  }
}

function handleEntryPick(sid, winnerTeam, games) {
  if (!state.entryPicks[sid]) state.entryPicks[sid] = {};
  if (winnerTeam !== undefined) { state.entryPicks[sid].winner = winnerTeam; clearDependentPicks(sid); }
  if (games !== undefined) state.entryPicks[sid].games = games;
  syncEntryPicksToDOM();
}

function clearDependentPicks(changedSid) {
  const teams = getTeams();
  for (const s of SERIES) {
    if (s.from && s.from.includes(changedSid)) {
      delete state.entryPicks[s.id];
      clearDependentPicks(s.id);
      const card = document.getElementById('ecard-' + s.id);
      if (card) {
        const [t1, t2] = getSeriesTeams(s.id, state.entryPicks, teams);
        const btns = card.querySelectorAll('.team-pick-btn');
        setTeamBtn(btns[0], t1);
        setTeamBtn(btns[1], t2);
        btns.forEach(b => { b.classList.remove('selected'); const chk = b.querySelector('.pick-check'); if (chk) chk.textContent=''; });
        card.querySelectorAll('.game-btn').forEach(b => b.classList.remove('selected'));
        card.classList.remove('complete');
      }
    }
  }
}

async function submitBracket() {
  const playerName  = document.getElementById('entryPlayerName').value.trim();
  const bracketName = document.getElementById('entryBracketName').value.trim();
  if (!playerName)  { toast('Please enter your name.', 'error'); return; }
  if (!bracketName) { toast('Please enter a bracket name.', 'error'); return; }
  if (isLocked()) { toast('Bracket entry is locked.', 'error'); return; }

  const missing = SERIES.filter(s => { const p = state.entryPicks[s.id]; return !p||!p.winner||!p.games; });
  if (missing.length) {
    toast(`${missing.length} series still need picks.`, 'error');
    missing.forEach(s => {
      const card = document.getElementById('ecard-' + s.id);
      if (card) { card.style.borderColor='var(--error)'; setTimeout(()=>{ card.style.borderColor=''; }, 2000); }
    });
    return;
  }

  const submitBtn = document.getElementById('submitBracketBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    // Always fetch the latest brackets from Firebase before writing to avoid overwrites
    let brackets;
    if (isDbConfigured()) {
      const fresh = await dbRead('brackets').catch(() => null);
      brackets = fresh ?? getBrackets();
      appData.brackets = brackets; // sync memory
    } else {
      brackets = getBrackets();
    }

    if (brackets.find(b => b.bracketName.toLowerCase() === bracketName.toLowerCase())) {
      toast('A bracket with that name already exists. Pick a different bracket name.', 'error');
      submitBtn.disabled = false; submitBtn.textContent = 'Submit Bracket';
      return;
    }

    const bracket = {
      id: genId(),
      playerName,
      bracketName,
      // keep legacy `name` field so old display code still works
      name: `${bracketName} (${playerName})`,
      timestamp: new Date().toISOString(),
      picks: JSON.parse(JSON.stringify(state.entryPicks)),
    };
    brackets.push(bracket);
    saveBrackets(brackets);
    localStorage.setItem(SK.MY_ID, bracket.id);

    document.getElementById('entryFormWrap').style.display = 'none';
    document.getElementById('entrySuccessMsg').style.display = '';
    document.getElementById('viewMyBracketBtn').dataset.bid = bracket.id;
    toast('Bracket submitted! Good luck 🏒', 'success');
  } catch (e) {
    toast('Submission failed: ' + e.message, 'error');
    submitBtn.disabled = false; submitBtn.textContent = 'Submit Bracket';
  }
}

// ── Bracket Viewer ─────────────────────────────────────────

function renderViewer(bracketId) {
  const brackets = getBrackets();
  const sel = document.getElementById('viewerSelect');
  const saved = localStorage.getItem(SK.MY_ID);

  sel.innerHTML = '<option value="">— Select a participant —</option>' +
    brackets.map(b => {
      const label = b.bracketName
        ? `${esc(b.bracketName)} — ${esc(b.playerName || '')}${b.id===saved?' (you)':''}`
        : `${esc(b.name)}${b.id===saved?' (you)':''}`;
      return `<option value="${b.id}">${label}</option>`;
    }).join('');

  const bid = bracketId || state.viewingId;
  if (bid) { sel.value = bid; state.viewingId = bid; drawBracket(bid); }
}

async function drawBracket(bid) {
  const brackets = getBrackets(), results = getResults(), teams = getTeams();
  const bracket = brackets.find(b => b.id === bid);
  if (!bracket) {
    document.getElementById('viewerContent').innerHTML = '<div class="empty-state">Bracket not found.</div>';
    return;
  }
  const { pts, correct, breakdown } = scoreOneBracket(bracket, results);
  const proj = maxPossible(bracket, results);
  const doneSeries = SERIES.filter(s => results[s.id] && results[s.id].completed).length;

  const displayName = bracket.bracketName
    ? `<span class="viewer-bracket-name">${esc(bracket.bracketName)}</span><span class="viewer-player-name">by ${esc(bracket.playerName || '')}</span>`
    : `<span class="viewer-bracket-name">${esc(bracket.name)}</span>`;

  document.getElementById('viewerContent').innerHTML = `
    <div class="viewer-heading">${displayName}</div>
    <div class="viewer-bar">
      <div class="vbar-item"><div class="vbar-val red">${pts}</div><div class="vbar-lbl">Points</div></div>
      <div class="vbar-item"><div class="vbar-val">${proj}</div><div class="vbar-lbl">Max Possible</div></div>
      <div class="vbar-item"><div class="vbar-val">${correct}</div><div class="vbar-lbl">Correct</div></div>
      <div class="vbar-item"><div class="vbar-val">${doneSeries}/${SERIES.length}</div><div class="vbar-lbl">Series Done</div></div>
    </div>
    <div class="bracket-scroll-wrap">
      <div class="bracket-canvas" id="bracketCanvas"></div>
    </div>`;

  // Ensure series wins are fresh before painting the canvas
  if (Object.keys(state.apiSeriesWins).length === 0) await fetchApiSeriesWins();
  buildBracketCanvas(bracket.picks, results, teams, breakdown);
}

function buildBracketCanvas(picks, results, teams, breakdown, canvasId, onSeriesClick) {
  const canvas = document.getElementById(canvasId || 'bracketCanvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';

  const svg = createSVG(CW, CH);
  const nodeW = id => id==='SCF' ? SCF_W : BW;
  const nodeH = id => id==='SCF' ? SCF_H : BH;
  CONNECTORS.forEach(([fid, tid, fside, tside]) => {
    const fp = POSITIONS[fid], tp = POSITIONS[tid];
    if (!fp || !tp) return;
    const fx = fside==='r' ? fp.x+nodeW(fid) : fp.x, fy = fp.y+nodeH(fid)/2;
    const tx = tside==='r' ? tp.x+nodeW(tid) : tp.x, ty = tp.y+nodeH(tid)/2;
    const mx = (fx+tx)/2;
    const line = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.setAttribute('points',`${fx},${fy} ${mx},${fy} ${mx},${ty} ${tx},${ty}`);
    line.setAttribute('fill','none'); line.setAttribute('stroke','#1e3060'); line.setAttribute('stroke-width','2');
    svg.appendChild(line);
  });
  canvas.appendChild(svg);

  [['EASTERN','0'],['WESTERN','auto']].forEach(([label, left]) => {
    const lbl = document.createElement('div');
    lbl.className = 'bracket-conf-label';
    lbl.style.left = left === 'auto' ? 'auto' : left + 'px';
    if (left === 'auto') lbl.style.right = '0';
    lbl.style.top = '-2px'; lbl.textContent = label;
    canvas.appendChild(lbl);
  });

  for (const s of SERIES) {
    const pos = POSITIONS[s.id];
    if (!pos) continue;
    const [t1, t2] = getSeriesTeams(s.id, picks, teams);
    const pick = picks[s.id];
    const result = results[s.id];

    let t1Class = '', t2Class = '', statusBadge = '';
    const pickedWinner = pick ? pick.winner : null;
    const actualWinner = (result && result.completed) ? result.winner : null;

    if (pickedWinner) {
      const t1Picked = pickedWinner === t1, t2Picked = pickedWinner === t2;
      t1Class = t1Picked ? 'winner' : ''; t2Class = t2Picked ? 'winner' : '';
      if (actualWinner) {
        if (pickedWinner === actualWinner) {
          const gOk = pick.games === result.games;
          statusBadge = `<span class="bk-result-badge ${gOk?'bk-clinched':'bk-correct'}">✓ ${gOk?'Perfect':'Correct'}</span>`;
        } else {
          statusBadge = `<span class="bk-result-badge bk-wrong">✗ Wrong</span>`;
          if (t1Picked) t1Class = 'eliminated';
          if (t2Picked) t2Class = 'eliminated';
        }
        if (t1 === actualWinner) t1Class = 'winner';
        if (t2 === actualWinner) t2Class = 'winner';
        const loser = actualWinner === t1 ? t2 : t1;
        if (t1 === loser && t1Class !== 'winner') t1Class = 'eliminated';
        if (t2 === loser && t2Class !== 'winner') t2Class = 'eliminated';
      } else {
        statusBadge = pick.games ? `<span class="bk-result-badge bk-pending">In ${pick.games}</span>` : '';
      }
    }

    // Actual teams (from real results, for R2+ propagation) — used for live score + click handler
    const [at1, at2] = getActualTeams(s.id, results, teams);
    const actualTeamsKnown = at1 !== 'TBD' && at2 !== 'TBD';

    // Live series score from NHL API — only show if this series has actually started.
    let liveScoreLabel = '';
    if (!(result && result.completed) && actualTeamsKnown) {
      const a1 = TEAM_ABBR[at1], a2 = TEAM_ABBR[at2];
      const w1 = a1 != null ? (state.apiSeriesWins[a1] ?? null) : null;
      const w2 = a2 != null ? (state.apiSeriesWins[a2] ?? null) : null;
      if (w1 != null && w2 != null) {
        if (w1 === w2) liveScoreLabel = w1 === 0 ? '0–0' : `Tied ${w1}–${w2}`;
        else if (w1 > w2) liveScoreLabel = `${at1.split(' ').pop()} ${w1}–${w2}`;
        else              liveScoreLabel = `${at2.split(' ').pop()} ${w2}–${w1}`;
      }
    }

    // For in-progress: show picked games in the badge; drop separate gamesInfo line.
    // For completed: badge already says ✓ Perfect / ✓ Correct / ✗ Wrong — no extra line needed.
    const box = document.createElement('div');
    const isSCF = s.id === 'SCF';

    if (isSCF) {
      const champTeam = pick && pick.winner;
      const confirmed = result && result.completed;
      const isCorrect = confirmed && champTeam === result.winner;
      const isWrong   = confirmed && champTeam && champTeam !== result.winner;
      let champHtml;
      if (champTeam) {
        const champStateClass = isCorrect ? 'scf-correct' : isWrong ? 'scf-wrong' : '';
        const champLabel = isCorrect ? '🏆 Stanley Cup Champions!' : isWrong ? '❌ Eliminated' : 'Stanley Cup Champions';
        champHtml = `
          <div class="scf-champion ${champStateClass}">
            <img class="scf-champ-logo" src="${logoUrl(champTeam)}" alt="" onerror="this.style.display='none'">
            <div class="scf-champ-name">${esc(champTeam)}</div>
            <div class="scf-champ-label">${champLabel}</div>
          </div>`;
      } else {
        champHtml = `<div class="scf-champion"><div class="scf-champ-tbd">?</div><div class="scf-champ-label">Make your picks!</div></div>`;
      }
      const t1Html = t1==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t1Class}">${logoImg(t1,'bk-logo')}${esc(t1)}</span>`;
      const t2Html = t2==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t2Class}">${logoImg(t2,'bk-logo')}${esc(t2)}</span>`;
      // SCF: restore picked games display
      const pickedGames = pick ? pick.games : null;
      const actualGames = confirmed ? result.games : null;
      const scfGamesNote = pickedGames
        ? `<div class="bk-games">${actualGames ? `Picked ${pickedGames}g · Actual ${actualGames}g` : `Picked in ${pickedGames}`}</div>`
        : '';
      box.className = 'bk-box scf-box';
      box.style.left = pos.x+'px'; box.style.top = pos.y+'px';
      box.style.width = SCF_W+'px';
      box.innerHTML = `
        <div class="bk-label scf-label">Stanley Cup Final</div>
        ${champHtml}
        <div class="scf-finalists">${t1Html}<span class="scf-vs">vs</span>${t2Html}</div>
        ${liveScoreLabel ? `<div class="bk-games bk-series-score">${esc(liveScoreLabel)}</div>` : ''}
        ${scfGamesNote}`;
    } else {
      const t1Html = t1==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t1Class}">${logoImg(t1,'bk-logo')}${esc(t1)}</span>`;
      const t2Html = t2==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t2Class}">${logoImg(t2,'bk-logo')}${esc(t2)}</span>`;
      box.className = 'bk-box';
      box.style.left = pos.x+'px'; box.style.top = pos.y+'px'; box.style.width = BW+'px';
      box.innerHTML = `
        <div class="bk-label">${esc(s.abbr)}</div>
        ${t1Html}${t2Html}
        ${statusBadge ? `<div class="bk-badge-row">${statusBadge}</div>` : ''}
        ${liveScoreLabel ? `<div class="bk-games bk-series-score">${esc(liveScoreLabel)}</div>` : ''}`;
    }
    canvas.appendChild(box);

    // Make clickable. If a custom handler was provided (e.g. what-if picker),
    // every box becomes clickable. Otherwise default to the read-only series
    // detail modal, which only makes sense once both teams are known.
    if (onSeriesClick) {
      box.style.cursor = 'pointer';
      box.addEventListener('click', () => onSeriesClick(s.id));
    } else if (actualTeamsKnown) {
      box.style.cursor = 'pointer';
      box.addEventListener('click', () => showSeriesModal(s.id));
    }
  }
}

function createSVG(w, h) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width',w); svg.setAttribute('height',h);
  Object.assign(svg.style, { position:'absolute', top:'0', left:'0', pointerEvents:'none' });
  return svg;
}

// ── Leaderboard ────────────────────────────────────────────

function renderLeaderboard() {
  const brackets = getBrackets(), results = getResults();
  const el = document.getElementById('leaderboardContent');
  if (!brackets.length) { el.innerHTML = '<div class="empty-state">No entries yet.</div>'; return; }
  el.innerHTML = buildLeaderboardTable(rankBrackets(brackets, results), results, false, brackets.length);
  // Pull fresh series wins so any series that just clinched gets auto-applied,
  // then re-render once if results changed.
  fetchApiSeriesWins().then(() => {
    if (state.view !== 'leaderboard') return;
    const r2 = getResults();
    const ranked = rankBrackets(getBrackets(), r2);
    el.innerHTML = buildLeaderboardTable(ranked, r2, false, getBrackets().length);
  }).catch(() => {});
}

// ── Stats ──────────────────────────────────────────────────

function allPlayoffFinalGames() {
  return Object.values(state.apiGames || {}).flat().filter(g =>
    g && (g.gameState === 'FINAL' || g.gameState === 'OFF')
  );
}

function teamGameRecord(abbr, games) {
  let gp=0, w=0, l=0, gf=0, ga=0, otW=0, otL=0, homeW=0, homeL=0, roadW=0, roadL=0;
  for (const g of games) {
    const isAway = g.awayTeam?.abbrev === abbr;
    const isHome = g.homeTeam?.abbrev === abbr;
    if (!isAway && !isHome) continue;
    const myScore  = isAway ? (g.awayTeam.score ?? 0) : (g.homeTeam.score ?? 0);
    const oppScore = isAway ? (g.homeTeam.score ?? 0) : (g.awayTeam.score ?? 0);
    const pt = g.periodDescriptor?.periodType;
    const isOT = pt === 'OT' || pt === 'SO';
    gp++; gf += myScore; ga += oppScore;
    if (myScore > oppScore) { w++; if (isOT) otW++; if (isHome) homeW++; else roadW++; }
    else                    { l++; if (isOT) otL++; if (isHome) homeL++; else roadL++; }
  }
  return { gp, w, l, gf, ga, diff: gf-ga, otW, otL, homeW, homeL, roadW, roadL };
}

function seriesGamesForSid(sid, games, results, teams) {
  const [t1, t2] = getActualTeams(sid, results, teams);
  if (t1 === 'TBD' || t2 === 'TBD') return [];
  const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
  if (!a1 || !a2) return [];
  return games.filter(g => {
    const ga = g.awayTeam?.abbrev, gh = g.homeTeam?.abbrev;
    return (ga === a1 || ga === a2) && (gh === a1 || gh === a2);
  }).sort((a, b) => (a.startTimeUTC || '').localeCompare(b.startTimeUTC || ''));
}

function renderStats() {
  const el = document.getElementById('statsContent');
  if (!el) return;
  const brackets = getBrackets();
  const results  = getResults();
  const teams    = getTeams();

  // Kick off non-blocking data fetches; re-render once when fresh data lands.
  if (!state._statsApiWinsFetched) {
    state._statsApiWinsFetched = true;
    fetchApiSeriesWins().then(() => { if (state.view === 'stats') renderStats(); }).catch(()=>{});
  }
  if (!state._statsApiGamesInflight && !state._statsApiGamesDone) {
    state._statsApiGamesInflight = true;
    fetchAllPlayoffGames().then(() => {
      state._statsApiGamesInflight = false;
      state._statsApiGamesDone = true;
      if (state.view === 'stats') renderStats();
    }).catch(() => { state._statsApiGamesInflight = false; });
  }

  // ── Eliminated teams ─────────────────────────────────────
  const eliminated = new Set();
  for (const s of SERIES) {
    const r = results[s.id];
    if (r?.completed) {
      const [t1, t2] = getActualTeams(s.id, results, teams);
      if (r.winner === t1) eliminated.add(t2);
      else if (r.winner === t2) eliminated.add(t1);
    }
  }

  // ── Common helpers ───────────────────────────────────────
  function seriesStatusText(sid) {
    const r = results[sid];
    if (r?.completed) return `<span class="stats-badge stats-badge-done">Final</span>`;
    const [t1, t2] = getActualTeams(sid, results, teams);
    if (t1 === 'TBD' || t2 === 'TBD') return `<span class="stats-badge">TBD</span>`;
    const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
    const w1 = a1 ? (state.apiSeriesWins[a1] ?? 0) : 0;
    const w2 = a2 ? (state.apiSeriesWins[a2] ?? 0) : 0;
    if (w1 === 0 && w2 === 0) return `<span class="stats-badge">Series even</span>`;
    if (w1 === w2) return `<span class="stats-badge">Tied ${w1}-${w2}</span>`;
    const leader = w1 > w2 ? (a1 || t1) : (a2 || t2);
    const wl = Math.max(w1, w2), ll = Math.min(w1, w2);
    return `<span class="stats-badge stats-badge-live">${leader} leads ${wl}-${ll}</span>`;
  }

  // ── Aggregates ───────────────────────────────────────────
  const total      = brackets.length;
  const seriesDone = SERIES.filter(s => results[s.id]?.completed).length;
  const scores     = brackets.map(b => scoreOneBracket(b, results).pts);
  const avgScore   = total ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0;
  const topScore   = total ? Math.max(...scores) : 0;

  // Points earned / possible pool-wide so far
  let ptsEarned = 0, ptsAvailable = 0;
  for (const s of SERIES) {
    const r = results[s.id];
    if (!r?.completed) continue;
    ptsAvailable += total * ROUND_PTS[s.round].max;
    for (const b of brackets) {
      const pick = b.picks?.[s.id];
      if (!pick) continue;
      if (pick.winner === r.winner) {
        ptsEarned += ROUND_PTS[s.round].w;
        if (+pick.games === +r.games) ptsEarned += ROUND_PTS[s.round].g;
      }
    }
  }

  // Perfect series % across completed series picks
  let perfectPicks = 0, totalCompletedPicks = 0;
  for (const s of SERIES) {
    const r = results[s.id];
    if (!r?.completed) continue;
    for (const b of brackets) {
      const pick = b.picks?.[s.id];
      if (!pick || !pick.winner) continue;
      totalCompletedPicks++;
      if (pick.winner === r.winner && +pick.games === +r.games) perfectPicks++;
    }
  }
  const perfectPct = totalCompletedPicks ? Math.round((perfectPicks / totalCompletedPicks) * 100) : 0;

  // Playoff-game aggregates from NHL API cache
  const apiGames = allPlayoffFinalGames();
  const gamesPlayed = apiGames.length;
  const gamesRemaining = Math.max(0, 15 * 7 - gamesPlayed);

  // ── Per-series pick counts ───────────────────────────────
  const pickCounts = {};
  for (const s of SERIES) {
    const [t1, t2] = getActualTeams(s.id, results, teams);
    let c1 = 0, c2 = 0;
    const gamesBy = { [t1]: {4:0,5:0,6:0,7:0}, [t2]: {4:0,5:0,6:0,7:0} };
    for (const b of brackets) {
      const p = b.picks?.[s.id];
      if (!p?.winner) continue;
      if (p.winner === t1) { c1++; if (p.games && gamesBy[t1][p.games] != null) gamesBy[t1][p.games]++; }
      else if (p.winner === t2) { c2++; if (p.games && gamesBy[t2][p.games] != null) gamesBy[t2][p.games]++; }
    }
    pickCounts[s.id] = { t1, t2, c1, c2, gamesBy };
  }

  // ── Cup pick counts ──────────────────────────────────────
  const cupCounts = {};
  for (const b of brackets) {
    const w = b.picks?.SCF?.winner;
    if (w) cupCounts[w] = (cupCounts[w] || 0) + 1;
  }
  const cupEntries = Object.entries(cupCounts).sort((a, b) => b[1] - a[1]);

  // ── Round stats with points + max remaining ──────────────
  const roundStats = {};
  for (const s of SERIES) {
    const rs = roundStats[s.round] || (roundStats[s.round] = { done: 0, totalSeries: 0, correct: 0, perfect: 0, earned: 0, maxRemaining: 0 });
    rs.totalSeries++;
    const r = results[s.id];
    if (r?.completed) {
      rs.done++;
      for (const b of brackets) {
        const p = b.picks?.[s.id];
        if (p?.winner === r.winner) {
          rs.correct++;
          rs.earned += ROUND_PTS[s.round].w;
          if (p && +p.games === +r.games) { rs.perfect++; rs.earned += ROUND_PTS[s.round].g; }
        }
      }
    } else {
      // max remaining per entry for this series
      for (const b of brackets) {
        const [t1, t2] = getActualTeams(s.id, results, teams);
        const p = b.picks?.[s.id];
        if (!p?.winner) continue;
        // if the picked team hasn't been eliminated, full max still available
        if (!eliminated.has(p.winner)) {
          const loser = p.winner === t1 ? t2 : t1;
          const loserWins = (TEAM_ABBR[loser] && state.apiSeriesWins[TEAM_ABBR[loser]]) || 0;
          if (!isGamesImpossible(p.games, loserWins)) rs.maxRemaining += ROUND_PTS[s.round].max;
          else rs.maxRemaining += ROUND_PTS[s.round].w;
        }
      }
    }
  }

  const rounds = [1, 2, 3, 4];

  // ── Pool Pulse (8 pills) ─────────────────────────────────
  const pulseHtml = `
    <div class="stats-pulse stats-pulse-lg">
      <div class="stats-pill"><div class="stats-pill-val">${total}</div><div class="stats-pill-lbl">Entries</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${seriesDone}<span class="stats-pill-denom">/15</span></div><div class="stats-pill-lbl">Series Done</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${gamesPlayed}</div><div class="stats-pill-lbl">Games Played</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${avgScore || '—'}</div><div class="stats-pill-lbl">Avg Score</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${topScore || '—'}</div><div class="stats-pill-lbl">Top Score</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${ptsEarned}<span class="stats-pill-denom">/${ptsAvailable || 0}</span></div><div class="stats-pill-lbl">Pts Earned / Possible</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${totalCompletedPicks ? perfectPct + '%' : '—'}</div><div class="stats-pill-lbl">Perfect Series %</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${gamesRemaining}</div><div class="stats-pill-lbl">Games Remaining</div></div>
    </div>`;

  // ── Tab strip ────────────────────────────────────────────
  if (!state.statsTab || (state.statsTab === 'pool' && !total)) {
    state.statsTab = total ? 'pool' : 'playoffs';
  }
  const defaultTab = state.statsTab;
  const tabsHtml = `
    <div class="stats-tabs">
      <button class="stats-tab${defaultTab==='pool' ? ' active' : ''}" data-tab="pool"${total ? '' : ' disabled'}>Pool</button>
      <button class="stats-tab${defaultTab==='playoffs' ? ' active' : ''}" data-tab="playoffs">Playoffs</button>
    </div>`;

  // ── Pool tab ─────────────────────────────────────────────
  let poolHtml = '';
  if (!total) {
    poolHtml = '<div class="stats-section"><div class="empty-state">Submit a bracket to see pool stats.</div></div>';
  } else {
    // Cup Picks
    let cupHtml = `<div class="stats-section"><div class="stats-sec-title">Stanley Cup Picks</div><div class="stats-cup-list">`;
    if (!cupEntries.length) {
      cupHtml += '<div class="empty-state" style="padding:1rem 0">No Cup picks yet.</div>';
    } else {
      for (const [team, count] of cupEntries) {
        const pct = Math.round((count / total) * 100);
        const abbr = TEAM_ABBR[team] || team.split(' ').pop().toUpperCase().slice(0, 3);
        const logo = logoImg(team, 'stats-cup-logo');
        const dead = eliminated.has(team);
        cupHtml += `
          <div class="stats-cup-row${dead ? ' stats-cup-dead' : ''}">
            <div class="stats-cup-team">${logo}<span class="stats-cup-abbr">${abbr}</span><span class="stats-cup-name">${team}</span></div>
            <div class="stats-bar-wrap"><div class="stats-bar-fill${dead ? ' stats-bar-dead' : ''}" style="width:${pct}%"></div></div>
            <div class="stats-cup-count">${count} <span class="stats-cup-pct">(${pct}%)</span></div>
          </div>`;
      }
    }
    cupHtml += '</div></div>';

    // ── Series Impact: pool points won/lost per completed series ──
    const seriesImpact = [];
    for (const s of SERIES) {
      const r = results[s.id];
      if (!r?.completed) continue;
      const [t1, t2] = getActualTeams(s.id, results, teams);
      const winnerTeam = r.winner;
      const loserTeam  = winnerTeam === t1 ? t2 : t1;
      let won = 0, lost = 0;
      for (const b of brackets) {
        const pick = b.picks?.[s.id];
        if (!pick?.winner) continue;
        if (pick.winner === winnerTeam) {
          won += ROUND_PTS[s.round].w;
          if (+pick.games === +r.games) won += ROUND_PTS[s.round].g;
        } else if (pick.winner === loserTeam) {
          lost += ROUND_PTS[s.round].max;
        }
      }
      seriesImpact.push({ s, t1, t2, winnerTeam, loserTeam, games: r.games, won, lost, net: won - lost });
    }
    seriesImpact.sort((a, b) => b.net - a.net || b.won - a.won);

    let impactHtml = '';
    if (seriesImpact.length) {
      const maxAbs = Math.max(1, ...seriesImpact.flatMap(x => [x.won, x.lost]));
      let rows = '';
      for (const item of seriesImpact) {
        const { s, t1, t2, winnerTeam, games, won, lost, net } = item;
        const a1 = TEAM_ABBR[t1] || t1.split(' ').pop().toUpperCase().slice(0,3);
        const a2 = TEAM_ABBR[t2] || t2.split(' ').pop().toUpperCase().slice(0,3);
        const winAbbr = TEAM_ABBR[winnerTeam] || winnerTeam.split(' ').pop().toUpperCase().slice(0,3);
        const wonPct  = (won  / maxAbs) * 100;
        const lostPct = (lost / maxAbs) * 100;
        const netCls = net > 0 ? 'stats-pos' : net < 0 ? 'stats-neg' : '';
        const netStr = (net > 0 ? '+' : '') + net;
        rows += `
          <div class="stats-impact-row" data-series-id="${s.id}" style="cursor:pointer">
            <div class="stats-impact-series">
              <span class="stats-impact-sid">${s.abbr}</span>
              <span class="stats-impact-matchup">
                ${logoImg(t1,'stats-impact-logo')}<span class="stats-impact-abbr${winnerTeam===t1?' stats-impact-winner':''}">${a1}</span>
                <span class="stats-impact-vs">vs</span>
                ${logoImg(t2,'stats-impact-logo')}<span class="stats-impact-abbr${winnerTeam===t2?' stats-impact-winner':''}">${a2}</span>
              </span>
              <span class="stats-impact-result">${winAbbr} in ${games}</span>
            </div>
            <div class="stats-impact-side stats-impact-lost">
              <div class="stats-impact-bargroup">
                <span class="stats-impact-val stats-neg">${lost ? '−' + lost : '0'}</span>
                <div class="stats-impact-bar"><span class="stats-impact-fill stats-impact-fill-lost" style="width:${lostPct}%"></span></div>
              </div>
            </div>
            <div class="stats-impact-side stats-impact-won">
              <div class="stats-impact-bargroup">
                <div class="stats-impact-bar"><span class="stats-impact-fill stats-impact-fill-won" style="width:${wonPct}%"></span></div>
                <span class="stats-impact-val stats-pos">${won ? '+' + won : '0'}</span>
              </div>
            </div>
            <div class="stats-impact-net ${netCls}"><span class="stats-impact-net-val">${netStr}</span></div>
          </div>`;
      }
      impactHtml = `
        <div class="stats-section">
          <div class="stats-sec-title">Pool Points by Series</div>
          <div class="stats-impact-legend">
            <span class="stats-impact-legend-item"><span class="stats-impact-swatch stats-impact-fill-lost"></span>Points lost (brackets picked the loser — max points denied)</span>
            <span class="stats-impact-legend-item"><span class="stats-impact-swatch stats-impact-fill-won"></span>Points won (brackets picked the winner — points earned)</span>
          </div>
          <div class="stats-impact-head">
            <div class="stats-impact-head-cell">Series</div>
            <div class="stats-impact-head-cell stats-impact-head-lost">Lost</div>
            <div class="stats-impact-head-cell stats-impact-head-won">Won</div>
            <div class="stats-impact-head-cell stats-impact-head-net">Net</div>
          </div>
          <div class="stats-impact-list">${rows}</div>
        </div>`;
    }

    // Series Breakdown (tabbed by round)
    const roundPills = rounds.map(r =>
      `<button class="stats-round-pill${r === 1 ? ' active' : ''}" data-round="${r}">${ROUND_NAMES[r]}</button>`
    ).join('');

    let roundGrids = '';
    for (const round of rounds) {
      const roundSeries = SERIES.filter(s => s.round === round);
      let cards = '';
      for (const s of roundSeries) {
        const { t1, t2, c1, c2, gamesBy } = pickCounts[s.id];
        const r = results[s.id];
        const a1 = TEAM_ABBR[t1] || (t1 !== 'TBD' ? t1.split(' ').pop().toUpperCase().slice(0,3) : '?');
        const a2 = TEAM_ABBR[t2] || (t2 !== 'TBD' ? t2.split(' ').pop().toUpperCase().slice(0,3) : '?');
        const logo1 = t1 !== 'TBD' ? logoImg(t1, 'stats-sc-logo') : '';
        const logo2 = t2 !== 'TBD' ? logoImg(t2, 'stats-sc-logo') : '';
        const totalPicks = c1 + c2;
        const pct1 = totalPicks ? Math.round((c1 / totalPicks) * 100) : 50;
        const pct2 = totalPicks ? Math.round((c2 / totalPicks) * 100) : 50;
        const statusBadge = seriesStatusText(s.id);

        // Most-picked games length line
        let lenLine = '';
        if (totalPicks) {
          const all = [4,5,6,7].map(g => ({ g, n: (gamesBy[t1]?.[g]||0) + (gamesBy[t2]?.[g]||0) }));
          const top = all.sort((x,y)=>y.n-x.n)[0];
          if (top && top.n) {
            const pctG = Math.round((top.n / totalPicks) * 100);
            lenLine = `<div class="stats-sc-length">Most-picked length: <b>${top.g} games</b> (${pctG}%)</div>`;
          }
        }

        let resultLine = '';
        if (r?.completed) {
          const correctCount = brackets.filter(b => b.picks?.[s.id]?.winner === r.winner).length;
          const correctPct = Math.round((correctCount / total) * 100);
          resultLine = `<div class="stats-sc-result">
            <span class="stats-sc-winner">${TEAM_ABBR[r.winner] || r.winner} won in ${r.games}</span>
            <span class="stats-sc-accuracy">${correctCount}/${total} correct (${correctPct}%)</span>
          </div>`;
        }
        cards += `
          <div class="stats-sc-card" data-series-id="${s.id}" style="cursor:pointer">
            <div class="stats-sc-header">
              <div class="stats-sc-teams">
                ${logo1}<span class="stats-sc-abbr">${a1}</span>
                <span class="stats-sc-vs">vs</span>
                <span class="stats-sc-abbr">${a2}</span>${logo2}
              </div>
              ${statusBadge}
            </div>
            <div class="stats-sc-picks">
              <div class="stats-sc-pick-row">
                <span class="stats-sc-pick-lbl">${a1}</span>
                <div class="stats-bar-wrap stats-bar-sm"><div class="stats-bar-fill" style="width:${pct1}%"></div></div>
                <span class="stats-sc-pick-cnt">${c1}</span>
              </div>
              <div class="stats-sc-pick-row">
                <span class="stats-sc-pick-lbl">${a2}</span>
                <div class="stats-bar-wrap stats-bar-sm"><div class="stats-bar-fill" style="width:${pct2}%"></div></div>
                <span class="stats-sc-pick-cnt">${c2}</span>
              </div>
            </div>
            ${lenLine}
            ${resultLine}
          </div>`;
      }
      roundGrids += `<div class="stats-series-grid${round === 1 ? '' : ' hidden'}" data-round-grid="${round}">${cards}</div>`;
    }

    const seriesHtml = `<div class="stats-section">
      <div class="stats-sec-hdr-row">
        <div class="stats-sec-title">Series Breakdown</div>
        <div class="stats-round-pills">${roundPills}</div>
      </div>
      ${roundGrids}
    </div>`;

    // Round Performance
    let accHtml = `<div class="stats-section"><div class="stats-sec-title">Round-by-Round Performance</div>
      <div class="stats-ledger-wrap">
      <table class="stats-acc-table">
        <thead><tr><th>Round</th><th>Series Done</th><th>Correct</th><th>Accuracy</th><th>Pts Earned</th><th>Max Remaining</th><th>Perfect</th></tr></thead>
        <tbody>`;
    for (const round of rounds) {
      const rs = roundStats[round] || { done: 0, totalSeries: 0, correct: 0, perfect: 0, earned: 0, maxRemaining: 0 };
      const maxCorrect = rs.done * total;
      const accPct = maxCorrect ? Math.round((rs.correct / maxCorrect) * 100) : null;
      accHtml += `<tr>
        <td>${ROUND_NAMES[round]}</td>
        <td>${rs.done}/${rs.totalSeries}</td>
        <td>${rs.done ? rs.correct : '—'}</td>
        <td>${accPct !== null ? accPct + '%' : '—'}</td>
        <td>${rs.done ? rs.earned : '—'}</td>
        <td>${rs.maxRemaining || '—'}</td>
        <td>${rs.done ? rs.perfect : '—'}</td>
      </tr>`;
    }
    accHtml += '</tbody></table></div></div>';

    // Rooting Interest Map
    const aliveTeams = new Map(); // team → { cupPicks, alivePicks }
    for (const b of brackets) {
      // Cup pick
      const cupW = b.picks?.SCF?.winner;
      if (cupW && !eliminated.has(cupW)) {
        const r = aliveTeams.get(cupW) || { cupPicks: 0, alivePicks: 0 };
        r.cupPicks++;
        aliveTeams.set(cupW, r);
      }
      // Any non-eliminated winning pick
      const seenForThisBracket = new Set();
      for (const s of SERIES) {
        const p = b.picks?.[s.id];
        const rr = results[s.id];
        if (!p?.winner) continue;
        if (rr?.completed) continue; // only future/ongoing
        if (eliminated.has(p.winner)) continue;
        if (!seenForThisBracket.has(p.winner)) {
          seenForThisBracket.add(p.winner);
          const r = aliveTeams.get(p.winner) || { cupPicks: 0, alivePicks: 0 };
          r.alivePicks++;
          aliveTeams.set(p.winner, r);
        }
      }
    }
    const aliveArr = Array.from(aliveTeams.entries()).sort((a,b)=> b[1].alivePicks - a[1].alivePicks || b[1].cupPicks - a[1].cupPicks);
    let rootHtml = `<div class="stats-section"><div class="stats-sec-title">Rooting Interest</div>`;
    if (!aliveArr.length) {
      rootHtml += '<div class="empty-state" style="padding:1rem 0">No live rooting interests yet.</div>';
    } else {
      rootHtml += '<div class="stats-root-list">';
      for (const [team, stats] of aliveArr) {
        const abbr = TEAM_ABBR[team] || team.split(' ').pop().toUpperCase().slice(0,3);
        const pct = Math.round((stats.alivePicks / total) * 100);
        rootHtml += `
          <div class="stats-root-row">
            <div class="stats-root-team">${logoImg(team,'stats-root-logo')}<span class="stats-root-abbr">${abbr}</span><span class="stats-root-name">${team}</span></div>
            <div class="stats-bar-wrap"><div class="stats-bar-fill" style="width:${pct}%"></div></div>
            <div class="stats-root-meta">${stats.alivePicks} alive · ${stats.cupPicks} Cup</div>
          </div>`;
      }
      rootHtml += '</div>';
    }
    rootHtml += '</div>';

    // Consensus & Divergence
    const seriesWithPicks = SERIES.map(s => {
      const { t1, t2, c1, c2 } = pickCounts[s.id];
      const totalP = c1 + c2;
      if (!totalP || t1 === 'TBD' || t2 === 'TBD') return null;
      const majorPct = Math.round(Math.max(c1, c2) / totalP * 100);
      const majorTeam = c1 >= c2 ? t1 : t2;
      const minorTeam = c1 >= c2 ? t2 : t1;
      const minorCount = Math.min(c1, c2);
      return { s, t1, t2, c1, c2, totalP, majorPct, majorTeam, minorTeam, minorCount };
    }).filter(Boolean);

    const unanimous = [...seriesWithPicks].sort((a,b)=> b.majorPct - a.majorPct).slice(0,3);
    const split = [...seriesWithPicks].sort((a,b)=> Math.abs(a.majorPct-50) - Math.abs(b.majorPct-50)).slice(0,3);

    const consRow = (row) => {
      const aMaj = TEAM_ABBR[row.majorTeam] || row.majorTeam.split(' ').pop().toUpperCase().slice(0,3);
      const aMin = TEAM_ABBR[row.minorTeam] || row.minorTeam.split(' ').pop().toUpperCase().slice(0,3);
      return `<div class="stats-consensus-row">
        <div class="stats-consensus-lbl">${row.s.abbr}</div>
        <div class="stats-consensus-detail">${logoImg(row.majorTeam,'stats-consensus-logo')}<b>${aMaj}</b> ${row.majorPct}% <span class="stats-consensus-min">vs ${aMin} ${100-row.majorPct}% (${row.minorCount})</span></div>
      </div>`;
    };

    let consHtml = `<div class="stats-section"><div class="stats-sec-title">Consensus &amp; Divergence</div>
      <div class="stats-consensus-grid">
        <div class="stats-consensus-col">
          <div class="stats-consensus-hd">Most Unanimous</div>
          ${unanimous.length ? unanimous.map(consRow).join('') : '<div class="empty-state" style="padding:0.75rem 0">—</div>'}
        </div>
        <div class="stats-consensus-col">
          <div class="stats-consensus-hd">Most Split</div>
          ${split.length ? split.map(consRow).join('') : '<div class="empty-state" style="padding:0.75rem 0">—</div>'}
        </div>
      </div>
    </div>`;

    // Full Leaderboard
    const ranked = rankBrackets(brackets, results);
    const leaderTop = ranked.length ? ranked[0].pts : 0;
    let lbHtml = `<div class="stats-section"><div class="stats-sec-title">Full Leaderboard</div>
      <div class="stats-ledger-wrap">
      <table class="stats-acc-table stats-leader-table">
        <thead><tr><th>#</th><th>Bracket</th><th>Player</th><th>Pts</th><th>Max</th><th>Cup Pick</th><th></th></tr></thead>
        <tbody>`;
    ranked.forEach((b, i) => {
      const cup = b.picks?.SCF?.winner;
      const cupAbbr = cup ? (TEAM_ABBR[cup] || cup.split(' ').pop().toUpperCase().slice(0,3)) : '—';
      const cupDead = cup && eliminated.has(cup);
      const cupHtml = cup
        ? `<span class="stats-leader-cup${cupDead ? ' stats-leader-cup-dead' : ''}">${logoImg(cup,'stats-leader-logo')}<span>${cupAbbr}</span></span>`
        : '<span class="stats-leader-cup">—</span>';
      const alive = b.proj >= leaderTop;
      const aliveBadge = alive
        ? '<span class="stats-badge stats-badge-live">Alive</span>'
        : '<span class="stats-badge">Out</span>';
      lbHtml += `<tr class="stats-leader-row${alive ? '' : ' stats-row-dim'}" data-bid="${esc(b.id)}" style="cursor:pointer">
        <td>${i+1}</td>
        <td><b>${esc(b.name||'Untitled')}</b></td>
        <td>${esc(b.player||'—')}</td>
        <td>${b.pts}</td>
        <td>${b.proj}</td>
        <td>${cupHtml}</td>
        <td>${aliveBadge}</td>
      </tr>`;
    });
    lbHtml += '</tbody></table></div></div>';

    poolHtml = cupHtml + impactHtml + seriesHtml + accHtml + rootHtml + consHtml + lbHtml;
  }

  // ── Playoffs tab ─────────────────────────────────────────
  let playoffsHtml = '';
  if (!gamesPlayed) {
    playoffsHtml = '<div class="stats-section"><div class="empty-state">Loading playoff game history…</div></div>';
  } else {
    // Playoffs at a Glance
    let otGames = 0, multiOtGames = 0, oneGoal = 0, totalGoals = 0, homeW = 0, roadW = 0;
    let biggest = { margin: -1, game: null };
    for (const g of apiGames) {
      const hs = g.homeTeam?.score ?? 0, as = g.awayTeam?.score ?? 0;
      const pt = g.periodDescriptor?.periodType;
      const pn = g.periodDescriptor?.number || 0;
      totalGoals += hs + as;
      if (pt === 'OT') { otGames++; if (pn > 4) multiOtGames++; }
      if (Math.abs(hs - as) === 1) oneGoal++;
      if (hs > as) homeW++; else roadW++;
      const margin = Math.abs(hs - as);
      if (margin > biggest.margin) biggest = { margin, game: g };
    }
    const avgGoals = gamesPlayed ? (totalGoals / gamesPlayed).toFixed(2) : '—';
    const homePct = gamesPlayed ? Math.round(homeW / gamesPlayed * 100) : 0;
    const roadPct = gamesPlayed ? Math.round(roadW / gamesPlayed * 100) : 0;
    const biggestLabel = biggest.game
      ? `${biggest.game.awayTeam?.abbrev} ${biggest.game.awayTeam?.score}–${biggest.game.homeTeam?.score} ${biggest.game.homeTeam?.abbrev}`
      : '—';

    const glanceHtml = `
      <div class="stats-section">
        <div class="stats-sec-title">Playoffs at a Glance</div>
        <div class="stats-pulse stats-pulse-lg">
          <div class="stats-pill"><div class="stats-pill-val">${gamesPlayed}</div><div class="stats-pill-lbl">Games Played</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${otGames}</div><div class="stats-pill-lbl">OT Games</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${multiOtGames}</div><div class="stats-pill-lbl">Multi-OT Games</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${avgGoals}</div><div class="stats-pill-lbl">Avg Goals / Game</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${oneGoal}</div><div class="stats-pill-lbl">1-Goal Games</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${biggest.margin >= 0 ? biggest.margin : '—'}</div><div class="stats-pill-lbl">Biggest Margin</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${homePct}%</div><div class="stats-pill-lbl">Home Win %</div></div>
          <div class="stats-pill"><div class="stats-pill-val">${roadPct}%</div><div class="stats-pill-lbl">Road Win %</div></div>
        </div>
      </div>`;

    // Team Ledger
    const teamAbbrs = new Set();
    apiGames.forEach(g => {
      if (g.homeTeam?.abbrev) teamAbbrs.add(g.homeTeam.abbrev);
      if (g.awayTeam?.abbrev) teamAbbrs.add(g.awayTeam.abbrev);
    });
    const eliminatedAbbrs = new Set();
    eliminated.forEach(t => { const a = TEAM_ABBR[t]; if (a) eliminatedAbbrs.add(a); });

    const rows = Array.from(teamAbbrs).map(abbr => {
      const rec = teamGameRecord(abbr, apiGames);
      return { abbr, ...rec, out: eliminatedAbbrs.has(abbr) };
    }).sort((a, b) => b.diff - a.diff || b.w - a.w);

    let ledgerHtml = `<div class="stats-section"><div class="stats-sec-title">Team Ledger</div>
      <div class="stats-ledger-wrap">
      <table class="stats-acc-table stats-ledger-table">
        <thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>GF</th><th>GA</th><th>Diff</th><th>OT</th><th>Home</th><th>Road</th><th>Status</th></tr></thead>
        <tbody>`;
    for (const r of rows) {
      const diffCls = r.diff > 0 ? 'stats-pos' : r.diff < 0 ? 'stats-neg' : '';
      ledgerHtml += `<tr${r.out ? ' class="stats-row-dim"' : ''}>
        <td class="stats-ledger-team"><img src="${logoUrlForAbbr(r.abbr)}" class="stats-ledger-logo" onerror="this.style.display='none'"><b>${r.abbr}</b></td>
        <td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td>
        <td>${r.gf}</td><td>${r.ga}</td>
        <td class="${diffCls}">${r.diff > 0 ? '+'+r.diff : r.diff}</td>
        <td>${r.otW}-${r.otL}</td>
        <td>${r.homeW}-${r.homeL}</td>
        <td>${r.roadW}-${r.roadL}</td>
        <td>${r.out ? '<span class="stats-badge">Out</span>' : '<span class="stats-badge stats-badge-live">In</span>'}</td>
      </tr>`;
    }
    ledgerHtml += '</tbody></table></div></div>';

    // Series State Board
    let boardHtml = `<div class="stats-section"><div class="stats-sec-title">Series State Board</div>`;
    for (const round of rounds) {
      const roundSeries = SERIES.filter(s => s.round === round);
      const visible = roundSeries.filter(s => {
        const [t1, t2] = getActualTeams(s.id, results, teams);
        return t1 !== 'TBD' && t2 !== 'TBD';
      });
      if (!visible.length) continue;
      boardHtml += `<div class="stats-board-round-hd">${ROUND_NAMES[round]}</div><div class="stats-board-list">`;
      for (const s of visible) {
        const [t1, t2] = getActualTeams(s.id, results, teams);
        const a1 = TEAM_ABBR[t1], a2 = TEAM_ABBR[t2];
        const sg = seriesGamesForSid(s.id, apiGames, results, teams);
        let gf1 = 0, gf2 = 0;
        for (const g of sg) {
          const hs = g.homeTeam?.score ?? 0, as = g.awayTeam?.score ?? 0;
          if (g.homeTeam?.abbrev === a1) { gf1 += hs; gf2 += as; }
          else { gf1 += as; gf2 += hs; }
        }
        const r = results[s.id];
        const badge = seriesStatusText(s.id);
        let extraBadge = '';
        if (r?.completed) {
          if (+r.games === 4) extraBadge = '<span class="stats-badge stats-badge-done">Sweep</span>';
          else if (+r.games === 7) extraBadge = '<span class="stats-badge stats-badge-live">Went 7</span>';
        }
        boardHtml += `<div class="stats-board-row">
          <div class="stats-board-label">${s.abbr}</div>
          <div class="stats-board-matchup">
            ${logoImg(t1,'stats-board-logo')}<b>${a1}</b>
            <span class="stats-board-score">${gf1}–${gf2}</span>
            <b>${a2}</b>${logoImg(t2,'stats-board-logo')}
          </div>
          <div class="stats-board-gp">${sg.length} gp</div>
          <div class="stats-board-badges">${badge}${extraBadge}</div>
        </div>`;
      }
      boardHtml += '</div>';
    }
    boardHtml += '</div>';

    // Notable Games: biggest blowout, highest-scoring, longest
    const blowout = biggest.game;
    let highest = null, highestGoals = -1;
    let longest = null, longestPeriod = -1;
    for (const g of apiGames) {
      const hs = g.homeTeam?.score ?? 0, as = g.awayTeam?.score ?? 0;
      if (hs + as > highestGoals) { highestGoals = hs + as; highest = g; }
      const pt = g.periodDescriptor?.periodType;
      if (pt === 'OT' || pt === 'SO') {
        const num = g.periodDescriptor?.number || 4;
        if (num > longestPeriod) { longestPeriod = num; longest = g; }
      }
    }
    const gameCardHtml = (g, title, sub) => {
      if (!g) return `<div class="stats-notable-card"><div class="stats-notable-title">${title}</div><div class="empty-state" style="padding:0.75rem 0">—</div></div>`;
      const a = g.awayTeam, h = g.homeTeam;
      const dateStr = (g.gameDate || '').slice(0, 10);
      const pt = g.periodDescriptor?.periodType;
      const ptNum = g.periodDescriptor?.number || 0;
      const otLabel = pt === 'OT' ? (ptNum > 4 ? `${ptNum - 3}OT` : 'OT') : pt === 'SO' ? 'SO' : '';
      return `<div class="stats-notable-card" data-game-id="${g.id || ''}" style="${g.id ? 'cursor:pointer' : ''}">
        <div class="stats-notable-title">${title}</div>
        <div class="stats-notable-teams">
          <div class="stats-notable-team">${logoImg(a.abbrev==='UTA'?'Utah Mammoth':(a.name?.default||a.abbrev),'stats-notable-logo')}<b>${a.abbrev}</b><span class="stats-notable-score">${a.score}</span></div>
          <div class="stats-notable-team">${logoImg(h.abbrev==='UTA'?'Utah Mammoth':(h.name?.default||h.abbrev),'stats-notable-logo')}<b>${h.abbrev}</b><span class="stats-notable-score">${h.score}</span></div>
        </div>
        <div class="stats-notable-sub">${sub}${otLabel ? ' · '+otLabel : ''}${dateStr ? ' · '+dateStr : ''}</div>
      </div>`;
    };

    const notableHtml = `<div class="stats-section"><div class="stats-sec-title">Notable Games</div>
      <div class="stats-notable-grid">
        ${gameCardHtml(blowout, 'Biggest Blowout', `Margin of ${blowout ? biggest.margin : '—'}`)}
        ${gameCardHtml(highest, 'Highest-Scoring', `${highestGoals > 0 ? highestGoals : '—'} total goals`)}
        ${gameCardHtml(longest, 'Longest Game', longest ? (longest.periodDescriptor?.periodType === 'SO' ? 'Shootout finish' : `Ended in ${longest.periodDescriptor?.number > 4 ? (longest.periodDescriptor.number - 3) + 'OT' : 'OT'}`) : 'No OT games yet')}
      </div>
    </div>`;

    playoffsHtml = glanceHtml + ledgerHtml + boardHtml + notableHtml;
  }

  // ── Assemble ─────────────────────────────────────────────
  el.innerHTML = pulseHtml + tabsHtml +
    `<div class="stats-tab-pane${defaultTab==='pool' ? ' active' : ''}" data-pane="pool">${poolHtml}</div>` +
    `<div class="stats-tab-pane${defaultTab==='playoffs' ? ' active' : ''}" data-pane="playoffs">${playoffsHtml}</div>`;

  // Wire tabs
  el.querySelectorAll('.stats-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.disabled) return;
      state.statsTab = tab.dataset.tab;
      el.querySelectorAll('.stats-tab').forEach(t => t.classList.toggle('active', t === tab));
      el.querySelectorAll('.stats-tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
    });
  });

  // Wire series cards
  el.querySelectorAll('.stats-sc-card[data-series-id]').forEach(card => {
    card.addEventListener('click', () => showSeriesModal(card.dataset.seriesId));
  });

  // Wire impact rows → series modal
  el.querySelectorAll('.stats-impact-row[data-series-id]').forEach(row => {
    row.addEventListener('click', () => showSeriesModal(row.dataset.seriesId));
  });

  // Wire round pills
  el.querySelectorAll('.stats-round-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      el.querySelectorAll('.stats-round-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const round = pill.dataset.round;
      el.querySelectorAll('[data-round-grid]').forEach(g => g.classList.toggle('hidden', g.dataset.roundGrid !== round));
    });
  });

  // Wire leaderboard rows → bracket viewer
  el.querySelectorAll('.stats-leader-row[data-bid]').forEach(row => {
    row.addEventListener('click', () => {
      const bid = row.dataset.bid;
      state.viewingId = bid;
      showView('viewer');
      renderViewer(bid);
      drawBracket(bid);
    });
  });

  // Wire notable-game cards → game modal
  el.querySelectorAll('.stats-notable-card[data-game-id]').forEach(card => {
    const gid = card.dataset.gameId;
    if (!gid) return;
    card.addEventListener('click', () => showGameModal(gid));
  });
}

// ── What If ────────────────────────────────────────────────

function clearDependentWhatIfPicks(changedSid) {
  for (const s of SERIES) {
    if (s.from && s.from.includes(changedSid)) {
      delete state.whatIfPicks[s.id];
      clearDependentWhatIfPicks(s.id);
    }
  }
}

function handleWhatIfPick(sid, winnerTeam, games) {
  if (!state.whatIfPicks[sid]) state.whatIfPicks[sid] = {};
  if (winnerTeam !== undefined) {
    if (state.whatIfPicks[sid].winner !== winnerTeam) {
      state.whatIfPicks[sid].winner = winnerTeam;
      clearDependentWhatIfPicks(sid);
    }
  }
  if (games !== undefined) state.whatIfPicks[sid].games = games;
  renderWhatIfBracket();
  renderWhatIfStats();
  // If the picker modal is open for this series (or any series, since R2+
  // matchups change as upstream picks change), re-render its contents.
  const modal = document.getElementById('seriesModal');
  if (modal && modal.classList.contains('open') && state._whatIfModalSid) {
    renderWhatIfModalContent();
  }
}

function clearWhatIfPick(sid) {
  if (!state.whatIfPicks[sid]) return;
  delete state.whatIfPicks[sid];
  clearDependentWhatIfPicks(sid);
  renderWhatIfBracket();
  renderWhatIfStats();
  const modal = document.getElementById('seriesModal');
  if (modal && modal.classList.contains('open') && state._whatIfModalSid) {
    renderWhatIfModalContent();
  }
}

function prefillWhatIfFromCurrent() {
  state.whatIfPicks = {};
  const results = appData.results || {};
  for (const s of SERIES) {
    const r = results[s.id];
    if (r && r.completed && r.winner) {
      state.whatIfPicks[s.id] = { winner: r.winner, games: r.games };
    }
  }
}

function buildWhatIfResults(picks) {
  const out = { ...(appData.results || {}) };
  for (const s of SERIES) {
    const p = picks[s.id];
    if (!p || !p.winner) continue;
    out[s.id] = { completed: true, winner: p.winner, games: p.games || null };
  }
  return out;
}

function countFilledPicks(picks) {
  let n = 0;
  for (const s of SERIES) if (picks[s.id] && picks[s.id].winner) n++;
  return n;
}

function computeWhatIfProbability(picks, samplesData) {
  const samples = (samplesData && samplesData.samples) || [];
  if (!samples.length) return null;
  const filled = SERIES.filter(s => picks[s.id] && picks[s.id].winner);
  if (!filled.length) return { matches: samples.length, n: samples.length, prob: 1 };
  let matches = 0;
  outer: for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    for (const s of filled) {
      const p = picks[s.id];
      const out = sample[s.id];
      if (!out) continue outer;
      const winnerAbbr = out[0];
      const games = out[1];
      const pickAbbr = TEAM_ABBR[p.winner] || p.winner;
      if (pickAbbr !== winnerAbbr) continue outer;
      if (p.games != null && p.games !== games) continue outer;
    }
    matches++;
  }
  return { matches, n: samples.length, prob: matches / samples.length };
}

function fmtWhatIfProb(prob) {
  if (prob == null) return '—';
  if (prob === 0) return '<0.02%';
  if (prob >= 0.9999) return '100%';
  if (prob >= 0.01) return (prob * 100).toFixed(1) + '%';
  if (prob >= 0.0001) return (prob * 100).toFixed(2) + '%';
  return (prob * 100).toFixed(3) + '%';
}

function renderWhatIfBracket() {
  const results = buildWhatIfResults(state.whatIfPicks);
  buildBracketCanvas(state.whatIfPicks, results, getTeams(), {}, 'whatIfCanvas', openWhatIfPickerModal);
}

function buildWhatIfModalCard(s, teams) {
  const [t1, t2] = getSeriesTeams(s.id, state.whatIfPicks, teams);
  const t1TBD = t1 === 'TBD', t2TBD = t2 === 'TBD';
  const a1 = t1TBD ? 'TBD' : (TEAM_ABBR[t1] || t1.split(' ').pop().toUpperCase().slice(0, 3));
  const a2 = t2TBD ? 'TBD' : (TEAM_ABBR[t2] || t2.split(' ').pop().toUpperCase().slice(0, 3));
  const n1 = t1TBD ? '' : (TEAM_CITY[t1] || t1);
  const n2 = t2TBD ? '' : (TEAM_CITY[t2] || t2);
  const pick = state.whatIfPicks[s.id];
  const pts = ROUND_PTS[s.round];
  const hint = (t1TBD || t2TBD)
    ? `<div class="wif-modal-hint">Pick the upstream series first to set this matchup.</div>`
    : '';
  const sel = (cond) => cond ? ' selected' : '';
  return `
    <div class="wif-modal-hdr">
      <div class="wif-modal-kicker">${ROUND_NAMES[s.round]} · ${pts.w} pts / ${pts.g} bonus</div>
      <div class="wif-modal-title">${esc(s.abbr)}</div>
    </div>
    ${hint}
    <div class="series-card wif-modal-card complete-${pick && pick.winner && pick.games ? 'yes' : 'no'}" data-sid="${s.id}">
      <div class="sc-pick-row team-picks">
        <button class="sc-pick wif-team-btn${sel(pick && pick.winner === t1)}" data-sid="${s.id}" data-team="t1" ${t1TBD ? 'disabled' : ''}>
          <div class="sc-pick-abbr team-abbr-txt">${esc(a1)}</div>
          ${n1 ? `<div class="sc-pick-name team-name-txt">${esc(n1)}</div>` : ''}
        </button>
        <div class="sc-vs">vs</div>
        <button class="sc-pick wif-team-btn${sel(pick && pick.winner === t2)}" data-sid="${s.id}" data-team="t2" ${t2TBD ? 'disabled' : ''}>
          <div class="sc-pick-abbr team-abbr-txt">${esc(a2)}</div>
          ${n2 ? `<div class="sc-pick-name team-name-txt">${esc(n2)}</div>` : ''}
        </button>
      </div>
      <div class="sc-games-lbl games-label">Series Length</div>
      <div class="sc-games games-btns">
        ${[4,5,6,7].map(g=>`<button class="sc-g wif-game-btn${sel(pick && pick.games === g)}" data-sid="${s.id}" data-games="${g}">${g}</button>`).join('')}
      </div>
      ${pick && pick.winner ? `<button class="btn btn-sm btn-ghost wif-modal-clear" data-sid="${s.id}">Clear pick</button>` : ''}
    </div>`;
}

function renderWhatIfModalContent() {
  const sid = state._whatIfModalSid;
  const content = document.getElementById('seriesModalContent');
  if (!sid || !content) return;
  const s = BY_ID[sid];
  if (!s) return;
  content.innerHTML = buildWhatIfModalCard(s, getTeams());
  content.dataset.whatif = '1';
}

function openWhatIfPickerModal(sid) {
  const modal = document.getElementById('seriesModal');
  if (!modal) return;
  state._whatIfModalSid = sid;
  renderWhatIfModalContent();
  modal.classList.add('open');
}

function renderWhatIfStats() {
  const filled = countFilledPicks(state.whatIfPicks);
  const filledEl = document.getElementById('whatIfPicksVal');
  if (filledEl) filledEl.textContent = `${filled} / ${SERIES.length}`;
  const subEl = document.getElementById('whatIfPicksSub');
  if (subEl) {
    const withGames = SERIES.filter(s => state.whatIfPicks[s.id] && state.whatIfPicks[s.id].games).length;
    subEl.textContent = withGames === filled
      ? (filled === 0 ? 'Pick winners + game lengths' : `${withGames} with game length`)
      : `${withGames} with game length, ${filled - withGames} winner-only`;
  }

  // Probability tile
  const probEl = document.getElementById('whatIfProbVal');
  const probSubEl = document.getElementById('whatIfProbSub');
  if (probEl && probSubEl) {
    if (!state._predSamples) {
      probEl.textContent = '—';
      probSubEl.textContent = 'Loading simulation data…';
    } else {
      const r = computeWhatIfProbability(state.whatIfPicks, state._predSamples);
      if (!r) {
        probEl.textContent = '—';
        probSubEl.textContent = 'No simulation data';
      } else if (filled === 0) {
        probEl.textContent = '100%';
        probSubEl.textContent = 'Empty bracket — fill in picks';
      } else {
        probEl.textContent = fmtWhatIfProb(r.prob);
        probSubEl.textContent = `${r.matches.toLocaleString()} of ${r.n.toLocaleString()} sims match`;
      }
    }
  }

  // Standings
  const standingsEl = document.getElementById('whatIfStandings');
  if (!standingsEl) return;
  const brackets = getBrackets();
  if (!brackets.length) {
    standingsEl.innerHTML = '<div class="empty-state">No pool entries yet.</div>';
    return;
  }
  if (filled === 0) {
    standingsEl.innerHTML = '<div class="empty-state">Pick at least one series to see how standings change.</div>';
    return;
  }
  const whatIfResults = buildWhatIfResults(state.whatIfPicks);
  const ranked = rankBrackets(brackets, whatIfResults);
  standingsEl.innerHTML = buildLeaderboardTable(ranked, whatIfResults, false, brackets.length);
}

function setWhatIfMode(mode) {
  state.whatIfMode = mode;
  document.querySelectorAll('.whatif-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (mode === 'current') prefillWhatIfFromCurrent();
  else state.whatIfPicks = {};
  renderWhatIfBracket();
  renderWhatIfStats();
}

async function renderWhatIf() {
  // Lazy-load Monte Carlo samples if Predictions hasn't already loaded them.
  if (!state._predSamples && !state._whatIfSamplesInflight) {
    state._whatIfSamplesInflight = true;
    fetch('data/bracket_samples.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { state._predSamples = j; if (state.view === 'whatif') renderWhatIfStats(); })
      .catch(() => {})
      .finally(() => { state._whatIfSamplesInflight = false; });
  }
  // Ensure live series wins are loaded (used by buildBracketCanvas live score labels).
  if (Object.keys(state.apiSeriesWins).length === 0) {
    fetchApiSeriesWins().then(() => { if (state.view === 'whatif') renderWhatIfBracket(); }).catch(()=>{});
  }
  renderWhatIfBracket();
  renderWhatIfStats();
}

// ── Commissioner ───────────────────────────────────────────

function renderCommissioner() {
  if (state.commLoggedIn) {
    document.getElementById('commLogin').style.display = 'none';
    document.getElementById('commPanel').style.display = '';
    renderCommTeams(); renderCommResults(); renderCommSettings(); renderCommManage(); renderCommModel();
  } else {
    document.getElementById('commLogin').style.display = '';
    document.getElementById('commPanel').style.display = 'none';
  }
}

async function renderCommModel() {
  const el = document.getElementById('modelCalibration');
  if (!el) return;
  try {
    const r = await fetch('data/model_calibration.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    el.innerHTML = renderModelCalibration(await r.json());
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="empty-state">Couldn\'t load calibration.</div>';
  }
}

function renderCommTeams() {
  const teams = getTeams(), el = document.getElementById('teamsGrid');
  let html = '';
  ['Eastern','Western'].forEach(conf => {
    const slots = TEAM_SLOTS.filter(s => s.conf === conf);
    html += `<div style="grid-column:1/-1;margin:0.25rem 0 0.1rem"><strong style="color:var(--accent);font-family:var(--font-head)">${conf} Conference</strong></div>`;
    slots.forEach(slot => {
      html += `<div class="team-input-group">
        <div class="team-input-label">${slot.label}</div>
        <div class="team-input-sub">${slot.div}</div>
        <input type="text" class="form-input team-name-inp" data-key="${slot.key}" value="${esc(teams[slot.key]||'')}" placeholder="${slot.label}" maxlength="40">
      </div>`;
    });
  });
  el.innerHTML = html;
}

function saveCommTeams() {
  const teams = getTeams();
  document.querySelectorAll('.team-name-inp').forEach(inp => {
    teams[inp.dataset.key] = inp.value.trim() || DEFAULT_TEAMS[inp.dataset.key];
  });
  saveTeams(teams);
  showSaveMsg('teamsSavedMsg');
  toast('Teams saved!', 'success');
}

function renderCommResults() {
  const results = getResults(), teams = getTeams(), el = document.getElementById('resultsGrid');
  let html = '';
  for (let round = 1; round <= 4; round++) {
    html += `<div class="results-round-section">
      <div class="results-round-title">${ROUND_NAMES[round]} (${ROUND_PTS[round].w}+${ROUND_PTS[round].g} pts)</div>
      <div class="results-grid-inner">`;
    SERIES.filter(s => s.round===round).forEach(s => {
      const [t1,t2] = getActualTeams(s.id, results, teams);
      const r = results[s.id] || {};
      html += `<div class="result-card ${r.completed?'completed':''}" id="rcard-${s.id}">
        <div class="result-card-label">${s.abbr}</div>
        <div class="result-matchup">${esc(t1)} vs ${esc(t2)}</div>
        <div class="result-fields">
          <div class="form-group">
            <div class="form-label" style="font-size:0.65rem">Winner</div>
            <select class="form-select result-winner-sel" data-sid="${s.id}">
              <option value="">— Pick —</option>
              <option value="${esc(t1)}" ${r.winner===t1?'selected':''}>${esc(t1)}</option>
              <option value="${esc(t2)}" ${r.winner===t2?'selected':''}>${esc(t2)}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label" style="font-size:0.65rem">Games</div>
            <select class="form-select result-games-sel" data-sid="${s.id}">
              <option value="">—</option>
              ${[4,5,6,7].map(g=>`<option value="${g}" ${r.games===g?'selected':''}>${g}</option>`).join('')}
            </select>
          </div>
        </div>
        <label class="result-complete-check">
          <input type="checkbox" class="result-done-chk" data-sid="${s.id}" ${r.completed?'checked':''}> Mark as completed
        </label>
      </div>`;
    });
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

function saveCommResults() {
  const results = getResults();
  document.querySelectorAll('.result-winner-sel').forEach(sel => {
    const sid = sel.dataset.sid;
    if (!results[sid]) results[sid] = {};
    results[sid].winner = sel.value || null;
  });
  document.querySelectorAll('.result-games-sel').forEach(sel => {
    const sid = sel.dataset.sid;
    if (!results[sid]) results[sid] = {};
    results[sid].games = sel.value ? parseInt(sel.value) : null;
  });
  document.querySelectorAll('.result-done-chk').forEach(chk => {
    const sid = chk.dataset.sid;
    if (!results[sid]) results[sid] = {};
    results[sid].completed = chk.checked;
    const card = document.getElementById('rcard-' + sid);
    if (card) card.classList.toggle('completed', chk.checked);
  });
  saveResults(results);
  showSaveMsg('resultsSavedMsg');
  toast('Results saved — scores recalculated!', 'success');
}

function renderCommSettings() {
  const { lockDate, hideEntryTab } = getSettings();
  const el = document.getElementById('lockDateInput');
  if (lockDate) el.value = lockDate.slice(0,16);
  const toggle = document.getElementById('hideEntryTabToggle');
  if (toggle) toggle.checked = !!hideEntryTab;

  // Show Firebase sync status in settings
  const statusEl = document.getElementById('ghSyncInfo');
  if (!statusEl) return;
  if (isDbConfigured()) {
    const c = window.CHELB_CONFIG;
    statusEl.innerHTML = `<div class="alert alert-success" style="margin-top:1rem">
      ✓ Firebase sync active — <strong>${c.projectId}</strong><br>
      <small>All bracket data is stored in Firestore and shared across devices.</small>
    </div>`;
  } else {
    statusEl.innerHTML = `<div class="alert alert-warning" style="margin-top:1rem">
      ⚠ Firebase not configured — data is local to this browser only.<br>
      <small>Edit <code>config.js</code> with your Firebase <code>apiKey</code> and <code>projectId</code>, then commit and push.</small>
    </div>`;
  }
}

function saveCommSettings() {
  const val = document.getElementById('lockDateInput').value;
  const toggle = document.getElementById('hideEntryTabToggle');
  const settings = getSettings();
  settings.lockDate = val ? new Date(val).toISOString() : null;
  settings.hideEntryTab = toggle ? toggle.checked : false;
  saveSettings(settings);
  applyEntryTabVisibility();
  showSaveMsg('settingsSavedMsg');
  toast('Settings saved!', 'success');
}

function renderCommManage() {
  const brackets = getBrackets(), el = document.getElementById('manageEntriesGrid');
  if (!brackets.length) { el.innerHTML = '<div class="empty-state">No entries submitted yet.</div>'; return; }
  let html = `<div class="manage-table-wrap"><table class="manage-table">
    <thead><tr><th>Bracket</th><th>Player</th><th>Submitted</th><th></th></tr></thead><tbody>`;
  brackets.forEach(b => {
    html += `<tr>
      <td><strong>${esc(b.bracketName || b.name)}</strong></td>
      <td style="color:var(--text-muted)">${esc(b.playerName || '—')}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${new Date(b.timestamp).toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="viewBracketFromComm('${b.id}')">View</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEntry('${b.id}')">Delete</button>
      </td>
    </tr>`;
  });
  el.innerHTML = html + '</tbody></table></div>';
}

window.viewBracketFromComm = function(bid) { state.viewingId = bid; showView('viewer'); drawBracket(bid); };

window.deleteEntry = function(bid) {
  if (!confirm('Delete this bracket? This cannot be undone.')) return;
  saveBrackets(getBrackets().filter(b => b.id !== bid));
  renderCommManage();
  toast('Entry deleted.', 'success');
};

// ── Export CSV ─────────────────────────────────────────────

function exportCSV() {
  const brackets = getBrackets(), results = getResults();
  const ranked = rankBrackets(brackets, results);
  const rows = [['Rank','Name','Points','Correct Series','Max Possible','Submitted']];
  ranked.forEach((b,i) => rows.push([i+1, b.name, b.pts, b.correct, b.proj, new Date(b.timestamp).toLocaleDateString()]));
  const csv = rows.map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = 'BracketChallenge26_Leaderboard.csv';
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Utilities ──────────────────────────────────────────────

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function pad(n) { return String(n).padStart(2,'0'); }
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast' + (type?' '+type:'');
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function showSaveMsg(id) {
  const el = document.getElementById(id); if (!el) return;
  el.style.display = '';
  setTimeout(() => { el.style.display='none'; }, 2500);
}
function closeMobileMenu() { document.getElementById('mobileMenu').classList.remove('open'); }

// ── Event Listeners & Init ─────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Nav buttons
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => showView(el.dataset.view));
  });

  // Hamburger
  document.getElementById('navHamburger').addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.toggle('open');
  });

  // Series modal close
  document.getElementById('seriesModalClose').addEventListener('click', closeSeriesModal);
  document.getElementById('seriesModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSeriesModal();
  });

  // Entry picks (delegated)
  document.getElementById('entryRounds').addEventListener('click', e => {
    const teamBtn = e.target.closest('.team-pick-btn');
    if (teamBtn) {
      const [t1, t2] = getSeriesTeams(teamBtn.dataset.sid, state.entryPicks, getTeams());
      handleEntryPick(teamBtn.dataset.sid, teamBtn.dataset.team==='t1'?t1:t2, undefined);
    }
    const gameBtn = e.target.closest('.game-btn');
    if (gameBtn) handleEntryPick(gameBtn.dataset.sid, undefined, parseInt(gameBtn.dataset.games));
  });

  document.getElementById('submitBracketBtn').addEventListener('click', submitBracket);

  // What-If picks (delegated on the shared series modal)
  document.getElementById('seriesModalContent').addEventListener('click', e => {
    if (document.getElementById('seriesModalContent').dataset.whatif !== '1') return;
    const teamBtn = e.target.closest('.wif-team-btn');
    if (teamBtn && !teamBtn.disabled) {
      const [t1, t2] = getSeriesTeams(teamBtn.dataset.sid, state.whatIfPicks, getTeams());
      handleWhatIfPick(teamBtn.dataset.sid, teamBtn.dataset.team==='t1'?t1:t2, undefined);
      return;
    }
    const gameBtn = e.target.closest('.wif-game-btn');
    if (gameBtn) { handleWhatIfPick(gameBtn.dataset.sid, undefined, parseInt(gameBtn.dataset.games)); return; }
    const clearBtn = e.target.closest('.wif-modal-clear');
    if (clearBtn) clearWhatIfPick(clearBtn.dataset.sid);
  });

  // Drop the what-if marker when the modal closes so the regular series-modal
  // doesn't leak through this handler.
  document.getElementById('seriesModalClose').addEventListener('click', () => {
    document.getElementById('seriesModalContent').dataset.whatif = '';
    state._whatIfModalSid = null;
  });
  document.getElementById('seriesModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      document.getElementById('seriesModalContent').dataset.whatif = '';
      state._whatIfModalSid = null;
    }
  });

  // What-If mode toggle
  document.querySelectorAll('.whatif-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setWhatIfMode(btn.dataset.mode));
  });

  // What-If reset
  document.getElementById('whatIfResetBtn').addEventListener('click', () => {
    if (state.whatIfMode === 'current') prefillWhatIfFromCurrent();
    else state.whatIfPicks = {};
    renderWhatIfBracket();
    renderWhatIfStats();
  });

  document.getElementById('viewMyBracketBtn').addEventListener('click', e => {
    const bid = e.target.dataset.bid;
    state.viewingId = bid;
    showView('viewer');
    renderViewer(bid);
    drawBracket(bid);
  });

  document.getElementById('viewerSelect').addEventListener('change', e => {
    state.viewingId = e.target.value;
    if (e.target.value) drawBracket(e.target.value);
    else document.getElementById('viewerContent').innerHTML = '<div class="empty-state">Select a participant above to view their bracket.</div>';
  });

  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);

  // Commissioner login
  document.getElementById('commLoginBtn').addEventListener('click', () => {
    if (document.getElementById('commPasswordInput').value === COMM_PASSWORD) {
      state.commLoggedIn = true;
      document.getElementById('commLoginError').style.display = 'none';
      renderCommissioner();
    } else {
      document.getElementById('commLoginError').style.display = '';
      document.getElementById('commPasswordInput').value = '';
    }
  });
  document.getElementById('commPasswordInput').addEventListener('keydown', e => {
    if (e.key==='Enter') document.getElementById('commLoginBtn').click();
  });
  document.getElementById('commLogoutBtn').addEventListener('click', () => { state.commLoggedIn=false; renderCommissioner(); });

  // Commissioner tabs
  document.getElementById('commTabs').addEventListener('click', e => {
    const tab = e.target.closest('.comm-tab'); if (!tab) return;
    document.querySelectorAll('.comm-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.comm-pane').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('commPane-'+tab.dataset.tab).classList.add('active');
  });

  document.getElementById('saveTeamsBtn').addEventListener('click', saveCommTeams);
  document.getElementById('saveResultsBtn').addEventListener('click', saveCommResults);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveCommSettings);

  // Full leaderboard — click any row to view that bracket
  document.getElementById('leaderboardContent').addEventListener('click', e => {
    const row = e.target.closest('.lb-row[data-bid]'); if (!row) return;
    const bid = row.dataset.bid;
    state.viewingId = bid; showView('viewer'); renderViewer(bid); drawBracket(bid);
  });

  // Home leaderboard — click any row to view that bracket
  document.getElementById('homeLeaderboard').addEventListener('click', e => {
    const row = e.target.closest('.lb-row[data-bid]'); if (!row) return;
    const bid = row.dataset.bid;
    state.viewingId = bid; showView('viewer'); renderViewer(bid); drawBracket(bid);
  });

  // Score card click → game detail modal
  document.getElementById('appMain').addEventListener('click', e => {
    const card = e.target.closest('.mc[data-game-id]');
    if (!card) return;
    const gid = card.dataset.gameId;
    if (gid) showGameModal(gid);
  });

  // Series modal: click a game card → game detail modal (with back link)
  document.getElementById('seriesModalContent').addEventListener('click', e => {
    const card = e.target.closest('.sm-game-card[data-game-id]');
    if (card?.dataset.gameId) {
      const sid = document.getElementById('seriesModalContent').dataset.currentSeries;
      showGameModal(card.dataset.gameId, sid || undefined);
      return;
    }
    // Game modal "← View Series" button
    const back = e.target.closest('.gm-back-btn[data-series-id]');
    if (back) { showSeriesModal(back.dataset.seriesId); return; }
    // Bracket pick pill → open that bracket in viewer
    const pill = e.target.closest('.sm-pill[data-bid]');
    if (pill?.dataset.bid) {
      closeSeriesModal();
      state.viewingId = pill.dataset.bid;
      showView('viewer');
      renderViewer(pill.dataset.bid);
      drawBracket(pill.dataset.bid);
    }
  });

  setInterval(() => { if (state.view==='home') renderCountdown(); }, 1000);

  // Refresh NHL scores every 30s while on home or schedule view
  setInterval(() => {
    if (state.view === 'home') {
      renderTodayGames();
      // Refresh series wins so newly-clinched series auto-apply without a reload.
      fetchApiSeriesWins().then(() => {
        if (state.view !== 'home') return;
        renderActualBracket();
        renderHomeFeed();
        renderHomeLeaderboard();
      }).catch(() => {});
    }
    if (state.view === 'schedule') fetchScheduleGames(state.scheduleDate);
    if (state.view === 'stats') {
      fetchApiSeriesWins().then(() => { if (state.view === 'stats') renderStats(); }).catch(()=>{});
    }
    if (state.view === 'leaderboard') {
      fetchApiSeriesWins().then(() => { if (state.view === 'leaderboard') renderLeaderboard(); }).catch(() => {});
    }
  }, 30000);

  // Auto-refresh bracket data every 60 seconds
  setInterval(() => { refreshData(); }, 60000);

  // ── Boot ──────────────────────────────────────────────────
  if (isDbConfigured()) showLoading();
  try {
    await loadAllData();
  } finally {
    hideLoading();
  }
  applyEntryTabVisibility();
  showView('home');
});

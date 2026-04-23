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
  if (name === 'commissioner') renderCommissioner();
}

// ── Predictions ────────────────────────────────────────────

const PRED_DATA = [
  ['bracket',       'data/bracket.json'],
  ['series',        'data/series.json'],
  ['games',         'data/games.json'],
  ['lastUpdated',   'data/last_updated.json'],
  ['samples',       'data/bracket_samples.json'],
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

function predLogoImg(abbrev) {
  if (!abbrev) return '';
  const safe = String(abbrev).replace(/[^A-Z]/g, '');
  return `<img class="team-logo" src="${logoUrlForAbbr(safe)}" alt="${safe}" loading="lazy" onerror="this.style.display='none'">`;
}

function predBar(pct, side) {
  const width = Math.max(2, Math.min(100, (pct || 0) * 100));
  return `<div class="prob-bar prob-${side}"><div class="prob-fill" style="width:${width.toFixed(1)}%"></div><span class="prob-label">${predFmtPct(pct)}</span></div>`;
}

function renderCupOdds(data) {
  const teams = (data && data.teams) || [];
  if (!teams.length) return '<div class="empty-state">No odds available yet.</div>';
  const rows = teams.map((t, i) => `
    <tr class="${i === 0 ? 'cup-leader' : ''}">
      <td class="rank">${i + 1}</td>
      <td class="team-cell">${predLogoImg(t.team)}<span class="team-abbr">${t.team}</span></td>
      <td class="series-score">${t.current_series || ''}</td>
      <td>${predFmtPct(t.round1_win_pct)}</td>
      <td>${predFmtPct(t.round2_win_pct)}</td>
      <td>${predFmtPct(t.round3_win_pct)}</td>
      <td class="cup-pct">${predFmtPct(t.cup_win_pct)}</td>
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
      </div>`;
  }).join('');
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
  const rows = ranked.map((r, i) => {
    const cupAbbr = r.cupPick ? (TEAM_ABBR[r.cupPick] || '') : '';
    return `
    <tr class="${i === 0 ? 'cup-leader' : ''}">
      <td class="rank">${i + 1}</td>
      <td><div class="team-cell"><span class="team-abbr">${r.bracketName || '—'}</span><span class="team-name">${r.playerName || ''}</span></div></td>
      <td><div class="team-cell">${cupAbbr ? predLogoImg(cupAbbr) : ''}<span class="team-abbr">${cupAbbr}</span></div></td>
      <td>${r.expectedPts.toFixed(1)}</td>
      <td class="cup-pct">${predFmtPct(r.winPoolPct)}</td>
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

async function renderPredictions() {
  const fetchJson = async (p) => {
    const r = await fetch(p, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${p} ${r.status}`);
    return r.json();
  };
  const set = (id, html, err) => { const el = document.getElementById(id); if (el) el.innerHTML = html || `<div class="empty-state">${err}</div>`; };

  if (!state._predictionsLoaded) {
    state._predictionsLoaded = true;
    const results = await Promise.allSettled(PRED_DATA.map(([, p]) => fetchJson(p)));
    const [bracket, series, games, lastUpdated, samples] = results.map(r => r.status === 'fulfilled' ? r.value : null);
    state._predSamples = samples;
    try { set('cupOdds',       bracket && renderCupOdds(bracket),   "Couldn't load Cup odds."); } catch (e) { console.error(e); set('cupOdds', null, 'Failed to render odds.'); }
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
    // Clickable if both teams are known
    if (t1 !== 'TBD' && t2 !== 'TBD') {
      box.style.cursor = 'pointer';
      box.addEventListener('click', () => showSeriesModal(s.id));
    }
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

function closeSeriesModal() {
  document.getElementById('seriesModal')?.classList.remove('open');
}

// ── Home ───────────────────────────────────────────────────

function renderHome() {
  renderCountdown();
  renderHeroCard();
  renderTodayGames();
  renderActualBracket(); // async — fires and updates when done
  renderHomeLeaderboard();
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
  if (Object.keys(wins).length > 0) state.apiSeriesWins = wins;
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

function buildBracketCanvas(picks, results, teams, breakdown) {
  const canvas = document.getElementById('bracketCanvas');
  if (!canvas) return;
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

    // Make clickable if actual teams are known (same rule as actual bracket)
    if (actualTeamsKnown) {
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
}

// ── Stats ──────────────────────────────────────────────────

function renderStats() {
  const el = document.getElementById('statsContent');
  if (!el) return;
  const brackets = getBrackets();
  const results  = getResults();
  const teams    = getTeams();

  if (!brackets.length) {
    el.innerHTML = '<div class="empty-state">No entries yet.</div>';
    return;
  }

  // ── Pool Pulse aggregates ──────────────────────────────
  const seriesDone = SERIES.filter(s => results[s.id]?.completed).length;
  const scores     = brackets.map(b => scoreOneBracket(b, results).pts);
  const avgScore   = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const topScore   = Math.max(...scores);

  // ── Figure out eliminated teams ────────────────────────
  // A team is eliminated if they lost a completed series
  const eliminated = new Set();
  for (const s of SERIES) {
    const r = results[s.id];
    if (r?.completed) {
      const [t1, t2] = getActualTeams(s.id, results, teams);
      if (r.winner === t1) eliminated.add(t2);
      else if (r.winner === t2) eliminated.add(t1);
    }
  }

  // ── Stanley Cup pick counts ────────────────────────────
  const cupCounts = {};
  for (const b of brackets) {
    const w = b.picks?.SCF?.winner;
    if (w) cupCounts[w] = (cupCounts[w] || 0) + 1;
  }
  const cupEntries = Object.entries(cupCounts).sort((a, b) => b[1] - a[1]);
  const total = brackets.length;

  // ── Per-series pick counts ─────────────────────────────
  const pickCounts = {}; // sid → { team1Name: count, team2Name: count }
  for (const s of SERIES) {
    const [t1, t2] = getActualTeams(s.id, results, teams);
    let c1 = 0, c2 = 0;
    for (const b of brackets) {
      const w = b.picks?.[s.id]?.winner;
      if (w === t1) c1++;
      else if (w === t2) c2++;
    }
    pickCounts[s.id] = { t1, t2, c1, c2 };
  }

  // ── Round accuracy ─────────────────────────────────────
  const roundStats = {}; // round → { done, total, correct }
  for (const s of SERIES) {
    if (!roundStats[s.round]) roundStats[s.round] = { done: 0, total: 0, correct: 0 };
    roundStats[s.round].total++;
    const r = results[s.id];
    if (r?.completed) {
      roundStats[s.round].done++;
      for (const b of brackets) {
        if (b.picks?.[s.id]?.winner === r.winner) roundStats[s.round].correct++;
      }
    }
  }

  // ── Series live status ─────────────────────────────────
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

  // ── Build HTML ─────────────────────────────────────────

  // Section 1: Pool Pulse
  const pulseHtml = `
    <div class="stats-pulse">
      <div class="stats-pill"><div class="stats-pill-val">${total}</div><div class="stats-pill-lbl">Entries</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${seriesDone}<span class="stats-pill-denom">/15</span></div><div class="stats-pill-lbl">Series Done</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${total > 0 ? avgScore : '—'}</div><div class="stats-pill-lbl">Avg Score</div></div>
      <div class="stats-pill"><div class="stats-pill-val">${topScore}</div><div class="stats-pill-lbl">Top Score</div></div>
    </div>`;

  // Section 2: Cup Picks
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

  // Section 3: Series Breakdown by round (tabbed)
  const rounds = [1, 2, 3, 4];
  const roundPills = rounds.map(r =>
    `<button class="stats-round-pill${r === 1 ? ' active' : ''}" data-round="${r}">${ROUND_NAMES[r]}</button>`
  ).join('');

  let roundGrids = '';
  for (const round of rounds) {
    const roundSeries = SERIES.filter(s => s.round === round);
    let cards = '';
    for (const s of roundSeries) {
      const { t1, t2, c1, c2 } = pickCounts[s.id];
      const r = results[s.id];
      const a1 = TEAM_ABBR[t1] || (t1 !== 'TBD' ? t1.split(' ').pop().toUpperCase().slice(0,3) : '?');
      const a2 = TEAM_ABBR[t2] || (t2 !== 'TBD' ? t2.split(' ').pop().toUpperCase().slice(0,3) : '?');
      const logo1 = t1 !== 'TBD' ? logoImg(t1, 'stats-sc-logo') : '';
      const logo2 = t2 !== 'TBD' ? logoImg(t2, 'stats-sc-logo') : '';
      const totalPicks = c1 + c2;
      const pct1 = totalPicks ? Math.round((c1 / totalPicks) * 100) : 50;
      const pct2 = totalPicks ? Math.round((c2 / totalPicks) * 100) : 50;
      const statusBadge = seriesStatusText(s.id);
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
          ${resultLine}
        </div>`;
    }
    roundGrids += `<div class="stats-series-grid${round === 1 ? '' : ' hidden'}" data-round-grid="${round}">${cards}</div>`;
  }

  let seriesHtml = `<div class="stats-section">
    <div class="stats-sec-hdr-row">
      <div class="stats-sec-title">Series Breakdown</div>
      <div class="stats-round-pills">${roundPills}</div>
    </div>
    ${roundGrids}
  </div>`;

  // Section 4: Round Accuracy
  let accHtml = `<div class="stats-section"><div class="stats-sec-title">Round Accuracy</div>
    <table class="stats-acc-table">
      <thead><tr><th>Round</th><th>Series Done</th><th>Correct Picks</th><th>Accuracy</th></tr></thead>
      <tbody>`;
  for (const round of rounds) {
    const rs = roundStats[round] || { done: 0, total: 0, correct: 0 };
    const maxCorrect = rs.done * total;
    const accPct = maxCorrect ? Math.round((rs.correct / maxCorrect) * 100) : null;
    accHtml += `<tr>
      <td>${ROUND_NAMES[round]}</td>
      <td>${rs.done}/${rs.total}</td>
      <td>${rs.done ? rs.correct : '—'}</td>
      <td>${accPct !== null ? accPct + '%' : '—'}</td>
    </tr>`;
  }
  accHtml += '</tbody></table></div>';

  el.innerHTML = pulseHtml + cupHtml + seriesHtml + accHtml;

  el.querySelectorAll('.stats-sc-card[data-series-id]').forEach(card => {
    card.addEventListener('click', () => showSeriesModal(card.dataset.seriesId));
  });

  el.querySelectorAll('.stats-round-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      el.querySelectorAll('.stats-round-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const round = pill.dataset.round;
      el.querySelectorAll('[data-round-grid]').forEach(g => g.classList.toggle('hidden', g.dataset.roundGrid !== round));
    });
  });
}

// ── Commissioner ───────────────────────────────────────────

function renderCommissioner() {
  if (state.commLoggedIn) {
    document.getElementById('commLogin').style.display = 'none';
    document.getElementById('commPanel').style.display = '';
    renderCommTeams(); renderCommResults(); renderCommSettings(); renderCommManage();
  } else {
    document.getElementById('commLogin').style.display = '';
    document.getElementById('commPanel').style.display = 'none';
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
    if (state.view === 'home') renderTodayGames();
    if (state.view === 'schedule') fetchScheduleGames(state.scheduleDate);
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

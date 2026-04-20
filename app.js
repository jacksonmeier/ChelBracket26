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
const BW = 165, BH = 92, YGAP = 150, YTOP = 20, CW = 1420, CH = 600;
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

function logoUrl(name) {
  const abbr = TEAM_ABBR[name];
  return abbr ? `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg` : '';
}

function logoImg(name, cls) {
  const url = logoUrl(name);
  if (!url) return '';
  return `<img class="${cls}" src="${url}" alt="" onerror="this.style.display='none'">`;
}

// Update a team-pick button's logo + text in place
function setTeamBtn(btn, name) {
  if (!btn) return;
  const img = btn.querySelector('.team-logo-sm');
  if (img) { const u = logoUrl(name); img.src = u; img.style.display = u ? '' : 'none'; }
  btn.querySelector('.team-name-txt').textContent = name;
}

// ── App State ──────────────────────────────────────────────

const state = {
  view:          'home',
  commLoggedIn:  false,
  entryPicks:    {},
  viewingId:     null,
  dbConfigured:  false,
  scheduleDate:  new Date().toISOString().slice(0, 10),
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

function maxPossible(bracket, results) {
  let max = 0;
  for (const s of SERIES) {
    const pick = bracket.picks[s.id];
    if (!pick) continue;
    const result = results[s.id];
    const p = ROUND_PTS[s.round];
    if (result && result.completed) {
      if (pick.winner === result.winner) max += p.w + (pick.games === result.games ? p.g : 0);
    } else {
      max += p.max;
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
  if (name === 'commissioner') renderCommissioner();
}

// ── Actual NHL Bracket ─────────────────────────────────────

function renderActualBracket() {
  const el = document.getElementById('actualBracket');
  if (!el) return;
  el.innerHTML = `<div class="bracket-scroll-wrap"><div class="bracket-canvas" id="actualBracketCanvas"></div></div>`;
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

    // Series score: completed shows final, in-progress shows current wins
    let seriesScore = '';
    if (result?.completed) {
      seriesScore = `<div class="bk-games bk-series-score">4–${loserWins}</div>`;
    } else if (result && (result.w1 != null || result.w2 != null)) {
      const w1 = result.w1 ?? 0, w2 = result.w2 ?? 0;
      let label;
      if (w1 === w2) label = w1 === 0 ? '' : `Tied ${w1}–${w2}`;
      else if (w1 > w2) label = `${t1 !== 'TBD' ? t1.split(' ').pop() : 'Team 1'} leads ${w1}–${w2}`;
      else              label = `${t2 !== 'TBD' ? t2.split(' ').pop() : 'Team 2'} leads ${w2}–${w1}`;
      if (label) seriesScore = `<div class="bk-games bk-series-score">${esc(label)}</div>`;
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
    canvas.appendChild(box);
  }
}

// ── Home ───────────────────────────────────────────────────

function renderHome() {
  renderCountdown();
  renderTodayGames();
  renderActualBracket();
  renderHomeLeaderboard();
}

// ── NHL Live Scores ────────────────────────────────────────

const NHL_SCORE_URL = 'https://api-web.nhle.com/v1/score/now';
const CORS_PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

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

async function renderTodayGames() {
  const el = document.getElementById('todayGames');
  if (!el) return;
  try {
    const res = await fetchWithProxy(NHL_SCORE_URL);
    const data = await res.json();
    const games = (data.games || []).filter(g => g.gameType === 3); // playoffs only
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
    return `<button class="sched-date-btn${active}" data-date="${d}">
      <span class="sched-day">${day}</span>
      <span class="sched-num">${num}</span>
      <span class="sched-mon">${mon}</span>
    </button>`;
  }).join('');

  // Scroll selected into view
  strip.querySelector('.sched-date-btn.active')
    ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });

  strip.addEventListener('click', e => {
    const btn = e.target.closest('.sched-date-btn');
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
  const state = g.gameState; // FUT PRE LIVE CRIT FINAL OFF
  const isLive  = state === 'LIVE' || state === 'CRIT';
  const isFinal = state === 'FINAL' || state === 'OFF';
  const isFut   = !isLive && !isFinal;

  // ── Status badge ──
  let statusHtml;
  if (isLive) {
    const pd = g.periodDescriptor || {};
    const pNum = pd.number || g.period || '';
    const pType = pd.periodType || 'REG';
    const periodLabel = pType === 'OT' ? 'OT' : pType === 'SO' ? 'SO' : `P${pNum}`;
    const clock = g.clock?.timeRemaining || '';
    statusHtml = `<span class="tg-badge tg-live">🔴 LIVE &nbsp;${clock ? clock + ' · ' : ''}${periodLabel}</span>`;
  } else if (isFinal) {
    const pType = g.periodDescriptor?.periodType || 'REG';
    const suffix = pType === 'OT' ? '/OT' : pType === 'SO' ? '/SO' : '';
    statusHtml = `<span class="tg-badge tg-final">Final${suffix}</span>`;
  } else {
    const t = new Date(g.startTimeUTC);
    const timeStr = t.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZoneName:'short' });
    statusHtml = `<span class="tg-badge tg-future">${timeStr}</span>`;
  }

  // ── Series info ──
  const ss = g.seriesStatus;
  const gameNum = ss?.gameNumberOfSeries ?? null;
  const gameNumHtml = gameNum ? `<span class="tg-game-num">Game ${gameNum}</span>` : '';

  let seriesRecord = '';
  if (ss && ss.seriesTitle) {
    seriesRecord = esc(ss.seriesTitle);
  } else {
    const aw = away.seriesWins ?? 0, hw = home.seriesWins ?? 0;
    seriesRecord = aw === hw
      ? `Series tied ${aw}-${hw}`
      : aw > hw ? `${away.abbrev} leads ${aw}-${hw}` : `${home.abbrev} leads ${hw}-${aw}`;
  }
  const seriesHtml = `<div class="tg-series">${seriesRecord}</div>`;

  // ── Team rows ──
  const awayLead = !isFut && away.score > home.score;
  const homeLead = !isFut && home.score > away.score;

  function teamRow(team, leading) {
    const logoSrc = team.logo || logoUrl(team.name?.default || '');
    const name = team.name?.default || team.abbrev;
    return `<div class="tg-team${leading ? ' tg-lead' : ''}">
      <img class="tg-logo" src="${logoSrc}" alt="" onerror="this.style.display='none'">
      <span class="tg-name">${esc(name)}</span>
      ${!isFut ? `<span class="tg-score${leading ? ' tg-score-lead' : ''}">${team.score}</span>` : ''}
    </div>`;
  }

  return `<div class="tg-card">
    <div class="tg-card-header">${statusHtml}${gameNumHtml}</div>
    <div class="tg-teams">
      ${teamRow(away, awayLead)}
      ${teamRow(home, homeLead)}
    </div>
    ${seriesHtml}
  </div>`;
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
  const prizeBanner = `<div class="prize-pool-banner">
    <span class="prize-pool-icon">💰</span>
    <span class="prize-pool-label">Prize Pool</span>
    <span class="prize-pool-amount">$${prizePool.toLocaleString()}</span>
    <span class="prize-pool-meta">${entryCount} bracket${entryCount !== 1 ? 's' : ''} × $25</span>
  </div>`;
  const hasResults = Object.values(results).some(r => r.completed);
  let html = prizeBanner + `<div class="lb-table-wrap"><table class="lb-table"><thead><tr>
    <th>Rank</th><th>Name</th><th>Cup Pick</th><th>Points</th>
    ${hasResults ? '<th>Correct</th>' : ''}
    <th>Max Possible</th>
    ${!mini ? '<th></th>' : ''}
  </tr></thead><tbody>`;
  ranked.forEach((b, i) => {
    const rank = i + 1;
    const badgeClass = rank===1?'rank-badge-1':rank===2?'rank-badge-2':'rank-badge-n';
    const prize = rank===1?'<span class="prize-badge prize-1st">💰 Winner</span>'
                : rank===2?'<span class="prize-badge prize-2nd">🥈 Entry Back</span>':'';
    const cupWinner = b.picks && b.picks['SCF'] && b.picks['SCF'].winner;
    const cupCell = cupWinner
      ? `<span class="lb-cup-pick">${logoImg(cupWinner,'bk-logo')}${esc(cupWinner)}</span>`
      : `<span style="color:var(--text-muted)">—</span>`;
    html += `<tr class="lb-row ${rank===1?'rank-1':rank===2?'rank-2':''}" data-bid="${b.id}" style="cursor:pointer">
      <td class="lb-rank"><span class="rank-badge ${badgeClass}">${rank}</span></td>
      <td class="lb-name">
        <span class="lb-bracket-name">${esc(b.bracketName || b.name)}</span>
        ${b.playerName ? `<span class="lb-player-name">${esc(b.playerName)}</span>` : ''}
        ${prize}
      </td>
      <td class="lb-cup">${cupCell}</td>
      <td class="lb-pts">${b.pts}</td>
      ${hasResults ? `<td>${b.correct} <span style="color:var(--text-muted);font-size:0.8em">series</span></td>` : ''}
      <td class="lb-proj">${b.proj}</td>
      ${!mini ? `<td><button class="lb-view-btn" data-bid="${b.id}">View →</button></td>` : ''}
    </tr>`;
  });
  return html + '</tbody></table></div>';
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
  return `
    <div class="series-card" id="ecard-${s.id}" data-sid="${s.id}">
      <div class="series-card-label">${s.abbr}</div>
      <div class="team-picks">
        <button class="team-pick-btn" data-sid="${s.id}" data-team="t1" ${dis}>
          ${logoImg(t1,'team-logo-sm')}<span class="team-name-txt">${esc(t1)}</span><span class="pick-check"></span>
        </button>
        <button class="team-pick-btn" data-sid="${s.id}" data-team="t2" ${dis}>
          ${logoImg(t2,'team-logo-sm')}<span class="team-name-txt">${esc(t2)}</span><span class="pick-check"></span>
        </button>
      </div>
      <div class="games-label">Series length (games)</div>
      <div class="games-btns">
        ${[4,5,6,7].map(g=>`<button class="game-btn" data-sid="${s.id}" data-games="${g}" ${dis}>${g}</button>`).join('')}
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
      btn.querySelector('.pick-check').textContent = sel ? '✓' : '';
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
        btns.forEach(b => { b.classList.remove('selected'); b.querySelector('.pick-check').textContent=''; });
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

function drawBracket(bid) {
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
    <div class="viewer-score-bar">
      <div class="vsb-item"><span class="vsb-val">${pts}</span><span class="vsb-lbl">Points</span></div>
      <div class="vsb-item"><span class="vsb-val">${correct}</span><span class="vsb-lbl">Correct Series</span></div>
      <div class="vsb-item"><span class="vsb-val">${proj}</span><span class="vsb-lbl">Max Possible</span></div>
      <div class="vsb-item"><span class="vsb-val">${doneSeries}/${SERIES.length}</span><span class="vsb-lbl">Series Done</span></div>
    </div>
    <div class="bracket-scroll-wrap">
      <div class="bracket-canvas" id="bracketCanvas"></div>
    </div>`;

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

    const pickedGames = pick ? pick.games : null;
    const actualGames = (result && result.completed) ? result.games : null;
    const gamesInfo = pickedGames ? `Picked: ${pickedGames}g${actualGames?' · Actual: '+actualGames+'g':''}` : '';

    const box = document.createElement('div');
    const isSCF = s.id === 'SCF';

    if (isSCF) {
      // ── Stanley Cup Final — large hero card ──
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
      box.className = 'bk-box scf-box';
      box.style.left = pos.x+'px'; box.style.top = pos.y+'px';
      box.style.width = SCF_W+'px';
      box.innerHTML = `
        <div class="bk-label scf-label">Stanley Cup Final</div>
        ${champHtml}
        <div class="scf-finalists">${t1Html}<span class="scf-vs">vs</span>${t2Html}</div>
        ${gamesInfo ? `<div class="bk-games">${gamesInfo}</div>` : ''}`;
    } else {
      const t1Html = t1==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t1Class}">${logoImg(t1,'bk-logo')}${esc(t1)}</span>`;
      const t2Html = t2==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t2Class}">${logoImg(t2,'bk-logo')}${esc(t2)}</span>`;
      box.className = 'bk-box';
      box.style.left = pos.x+'px'; box.style.top = pos.y+'px'; box.style.width = BW+'px';
      box.innerHTML = `
        <div class="bk-label">${esc(s.abbr)}</div>
        ${t1Html}${t2Html}
        ${statusBadge ? `<div style="margin-top:0.2rem">${statusBadge}</div>` : ''}
        ${gamesInfo ? `<div class="bk-games">${gamesInfo}</div>` : ''}`;
    }
    canvas.appendChild(box);
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
  el.querySelectorAll('.lb-view-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.viewingId = btn.dataset.bid; showView('viewer'); drawBracket(btn.dataset.bid); });
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
        <div class="result-wins-row">
          <span class="result-wins-label">Series score:</span>
          <span class="result-wins-team">${esc(t1.length>10?t1.split(' ').pop():t1)}</span>
          <input type="number" class="result-wins-input result-w1-input" data-sid="${s.id}" min="0" max="4" value="${r.w1 ?? ''}" placeholder="0">
          <span class="result-wins-sep">–</span>
          <input type="number" class="result-wins-input result-w2-input" data-sid="${s.id}" min="0" max="4" value="${r.w2 ?? ''}" placeholder="0">
          <span class="result-wins-team">${esc(t2.length>10?t2.split(' ').pop():t2)}</span>
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
  document.querySelectorAll('.result-w1-input').forEach(inp => {
    const sid = inp.dataset.sid;
    if (!results[sid]) results[sid] = {};
    results[sid].w1 = inp.value !== '' ? parseInt(inp.value) : null;
  });
  document.querySelectorAll('.result-w2-input').forEach(inp => {
    const sid = inp.dataset.sid;
    if (!results[sid]) results[sid] = {};
    results[sid].w2 = inp.value !== '' ? parseInt(inp.value) : null;
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

  // Full leaderboard view button
  document.getElementById('leaderboardContent').addEventListener('click', e => {
    const btn = e.target.closest('.lb-view-btn'); if (!btn) return;
    state.viewingId = btn.dataset.bid; showView('viewer'); renderViewer(btn.dataset.bid); drawBracket(btn.dataset.bid);
  });

  // Home leaderboard — click any row to view that bracket
  document.getElementById('homeLeaderboard').addEventListener('click', e => {
    const row = e.target.closest('.lb-row[data-bid]'); if (!row) return;
    const bid = row.dataset.bid;
    state.viewingId = bid; showView('viewer'); renderViewer(bid); drawBracket(bid);
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

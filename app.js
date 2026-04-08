/* ============================================================
   ChelBracket26 — app.js
   All application logic: routing, data, scoring, rendering
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────

const COMM_PASSWORD = 'chelbracket26';

const SK = {
  TEAMS:    'chelb26_teams',
  BRACKETS: 'chelb26_brackets',
  RESULTS:  'chelb26_results',
  SETTINGS: 'chelb26_settings',
  MY_ID:    'chelb26_my_bracket_id',
};

// All 15 series in bracket order
const SERIES = [
  // Round 1 — Eastern Conference
  { id:'E1',  round:1, conf:'East', t1:'atlantic1',  t2:'ewildcard2', abbr:'Atl 1 vs E-WC2' },
  { id:'E2',  round:1, conf:'East', t1:'atlantic2',  t2:'atlantic3',  abbr:'Atl 2 vs Atl 3' },
  { id:'E3',  round:1, conf:'East', t1:'metro1',     t2:'ewildcard1', abbr:'Met 1 vs E-WC1' },
  { id:'E4',  round:1, conf:'East', t1:'metro2',     t2:'metro3',     abbr:'Met 2 vs Met 3'  },
  // Round 1 — Western Conference
  { id:'W1',  round:1, conf:'West', t1:'central1',   t2:'wwildcard2', abbr:'Cen 1 vs W-WC2' },
  { id:'W2',  round:1, conf:'West', t1:'central2',   t2:'central3',   abbr:'Cen 2 vs Cen 3'  },
  { id:'W3',  round:1, conf:'West', t1:'pacific1',   t2:'wwildcard1', abbr:'Pac 1 vs W-WC1'  },
  { id:'W4',  round:1, conf:'West', t1:'pacific2',   t2:'pacific3',   abbr:'Pac 2 vs Pac 3'  },
  // Round 2 — Eastern
  { id:'E5',  round:2, conf:'East', from:['E1','E2'], abbr:'E-R2 Top' },
  { id:'E6',  round:2, conf:'East', from:['E3','E4'], abbr:'E-R2 Bot' },
  // Round 2 — Western
  { id:'W5',  round:2, conf:'West', from:['W1','W2'], abbr:'W-R2 Top' },
  { id:'W6',  round:2, conf:'West', from:['W3','W4'], abbr:'W-R2 Bot' },
  // Round 3 — Conference Finals
  { id:'ECF', round:3, conf:'East', from:['E5','E6'], abbr:'Eastern Final' },
  { id:'WCF', round:3, conf:'West', from:['W5','W6'], abbr:'Western Final' },
  // Round 4 — Stanley Cup Final
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

// Team slot keys and their display labels
const TEAM_SLOTS = [
  { key:'atlantic1',  label:'Atlantic 1st',   conf:'Eastern', div:'Atlantic' },
  { key:'atlantic2',  label:'Atlantic 2nd',   conf:'Eastern', div:'Atlantic' },
  { key:'atlantic3',  label:'Atlantic 3rd',   conf:'Eastern', div:'Atlantic' },
  { key:'ewildcard1', label:'E Wildcard 1',   conf:'Eastern', div:'Wildcard (Metro)' },
  { key:'ewildcard2', label:'E Wildcard 2',   conf:'Eastern', div:'Wildcard (Atlantic)' },
  { key:'metro1',     label:'Metro 1st',      conf:'Eastern', div:'Metropolitan' },
  { key:'metro2',     label:'Metro 2nd',      conf:'Eastern', div:'Metropolitan' },
  { key:'metro3',     label:'Metro 3rd',      conf:'Eastern', div:'Metropolitan' },
  { key:'central1',   label:'Central 1st',    conf:'Western', div:'Central' },
  { key:'central2',   label:'Central 2nd',    conf:'Western', div:'Central' },
  { key:'central3',   label:'Central 3rd',    conf:'Western', div:'Central' },
  { key:'wwildcard1', label:'W Wildcard 1',   conf:'Western', div:'Wildcard (Pacific)' },
  { key:'wwildcard2', label:'W Wildcard 2',   conf:'Western', div:'Wildcard (Central)' },
  { key:'pacific1',   label:'Pacific 1st',    conf:'Western', div:'Pacific' },
  { key:'pacific2',   label:'Pacific 2nd',    conf:'Western', div:'Pacific' },
  { key:'pacific3',   label:'Pacific 3rd',    conf:'Western', div:'Pacific' },
];

const DEFAULT_TEAMS = Object.fromEntries(TEAM_SLOTS.map(s => [s.key, s.label]));

// Bracket canvas layout constants
const BW = 145, BH = 80, YGAP = 110, YTOP = 15, CW = 1350, CH = 460;

const POSITIONS = {
  E1:  { x: 0,   y: YTOP + 0*YGAP },
  E2:  { x: 0,   y: YTOP + 1*YGAP },
  E3:  { x: 0,   y: YTOP + 2*YGAP },
  E4:  { x: 0,   y: YTOP + 3*YGAP },
  E5:  { x: 180, y: YTOP + 0.5*YGAP },
  E6:  { x: 180, y: YTOP + 2.5*YGAP },
  ECF: { x: 360, y: YTOP + 1.5*YGAP },
  SCF: { x: Math.round((CW - BW)/2), y: YTOP + 1.5*YGAP },
  WCF: { x: CW - 360 - BW, y: YTOP + 1.5*YGAP },
  W5:  { x: CW - 180 - BW, y: YTOP + 0.5*YGAP },
  W6:  { x: CW - 180 - BW, y: YTOP + 2.5*YGAP },
  W1:  { x: CW - BW, y: YTOP + 0*YGAP },
  W2:  { x: CW - BW, y: YTOP + 1*YGAP },
  W3:  { x: CW - BW, y: YTOP + 2*YGAP },
  W4:  { x: CW - BW, y: YTOP + 3*YGAP },
};

// SVG connector lines: [fromId, toId, fromSide ('r'=right,'l'=left), toSide]
const CONNECTORS = [
  ['E1','E5','r','l'], ['E2','E5','r','l'],
  ['E3','E6','r','l'], ['E4','E6','r','l'],
  ['E5','ECF','r','l'], ['E6','ECF','r','l'],
  ['ECF','SCF','r','l'],
  ['W1','W5','l','r'], ['W2','W5','l','r'],
  ['W3','W6','l','r'], ['W4','W6','l','r'],
  ['W5','WCF','l','r'], ['W6','WCF','l','r'],
  ['WCF','SCF','l','r'],
];

// ── App State ──────────────────────────────────────────────

const state = {
  view:          'home',
  commLoggedIn:  false,
  entryPicks:    {},    // { seriesId: { winner, games } }
  viewingId:     null,
};

// ── Storage ────────────────────────────────────────────────

function getTeams()    { return JSON.parse(localStorage.getItem(SK.TEAMS))    || {...DEFAULT_TEAMS}; }
function getBrackets() { return JSON.parse(localStorage.getItem(SK.BRACKETS)) || []; }
function getResults()  { return JSON.parse(localStorage.getItem(SK.RESULTS))  || {}; }
function getSettings() {
  const d = { lockDate:null };
  return Object.assign(d, JSON.parse(localStorage.getItem(SK.SETTINGS)) || {});
}
function saveTeams(v)    { localStorage.setItem(SK.TEAMS,    JSON.stringify(v)); }
function saveBrackets(v) { localStorage.setItem(SK.BRACKETS, JSON.stringify(v)); }
function saveResults(v)  { localStorage.setItem(SK.RESULTS,  JSON.stringify(v)); }
function saveSettings(v) { localStorage.setItem(SK.SETTINGS, JSON.stringify(v)); }

// ── Bracket Logic ──────────────────────────────────────────

// Get the two teams for a series based on a picks/results source
function getSeriesTeams(sid, picks, teams) {
  const s = BY_ID[sid];
  if (!s) return ['TBD','TBD'];
  if (s.round === 1) return [teams[s.t1] || s.t1, teams[s.t2] || s.t2];
  const t1 = (picks[s.from[0]] && picks[s.from[0]].winner) || 'TBD';
  const t2 = (picks[s.from[1]] && picks[s.from[1]].winner) || 'TBD';
  return [t1, t2];
}

// Get teams from actual results cascade (for commissioner result entry)
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
    if (!pick || !result || !result.completed) {
      bd[s.id] = { pts:0, status:'pending' };
      continue;
    }
    const p = ROUND_PTS[s.round];
    let sp = 0;
    if (pick.winner === result.winner) {
      sp += p.w;
      correct++;
      if (pick.games === result.games) sp += p.g;
    }
    pts += sp;
    bd[s.id] = { pts:sp, correct: pick.winner === result.winner, gamesCorrect: pick.games === result.games, status:'done' };
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
      if (pick.winner === result.winner) {
        max += p.w + (pick.games === result.games ? p.g : 0);
      }
    } else {
      max += p.max;
    }
  }
  return max;
}

// ── Navigation ─────────────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  state.view = name;
  closeMobileMenu();

  if (name === 'home')         renderHome();
  if (name === 'entry')        renderEntry();
  if (name === 'viewer')       renderViewer();
  if (name === 'leaderboard')  renderLeaderboard();
  if (name === 'commissioner') renderCommissioner();
}

// ── Home ───────────────────────────────────────────────────

function renderHome() {
  renderCountdown();
  renderHomeLeaderboard();
}

function renderCountdown() {
  const el = document.getElementById('homeCountdown');
  const { lockDate } = getSettings();
  if (!lockDate) { el.innerHTML = ''; return; }
  const target = new Date(lockDate);
  const now = new Date();
  if (now >= target) {
    el.innerHTML = '<span class="countdown-locked">🔒 Bracket Entry Locked</span>';
    return;
  }
  const diff = target - now;
  const d = Math.floor(diff/86400000);
  const h = Math.floor((diff%86400000)/3600000);
  const m = Math.floor((diff%3600000)/60000);
  const s = Math.floor((diff%60000)/1000);

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
  const brackets = getBrackets();
  const results = getResults();
  if (!brackets.length) {
    el.innerHTML = '<div class="empty-state">No entries yet. Be the first to submit a bracket!</div>';
    return;
  }
  const ranked = rankBrackets(brackets, results).slice(0, 8);
  el.innerHTML = buildLeaderboardTable(ranked, results, true);
}

function rankBrackets(brackets, results) {
  return brackets.map(b => {
    const { pts, correct } = scoreOneBracket(b, results);
    const proj = maxPossible(b, results);
    return { ...b, pts, correct, proj };
  }).sort((a,b) => b.pts - a.pts || b.proj - a.proj);
}

function buildLeaderboardTable(ranked, results, mini = false) {
  if (!ranked.length) return '<div class="empty-state">No entries yet.</div>';
  const hasResults = Object.values(results).some(r => r.completed);

  let html = `<div class="lb-table-wrap"><table class="lb-table">
    <thead><tr>
      <th>Rank</th>
      <th>Name</th>
      <th>Points</th>
      ${hasResults ? '<th>Correct</th>' : ''}
      <th>Max Possible</th>
      ${!mini ? '<th></th>' : ''}
    </tr></thead><tbody>`;

  ranked.forEach((b, i) => {
    const rank = i + 1;
    const badgeClass = rank===1?'rank-badge-1':rank===2?'rank-badge-2':'rank-badge-n';
    const rowClass   = rank===1?'rank-1':rank===2?'rank-2':'';
    const prize      = rank===1?'<span class="prize-badge prize-1st">💰 Winner</span>'
                     : rank===2?'<span class="prize-badge prize-2nd">🥈 Entry Back</span>':'';
    html += `<tr class="${rowClass}">
      <td class="lb-rank"><span class="rank-badge ${badgeClass}">${rank}</span></td>
      <td class="lb-name">${esc(b.name)}${prize}</td>
      <td class="lb-pts">${b.pts}</td>
      ${hasResults ? `<td>${b.correct} <span style="color:var(--text-muted);font-size:0.8em">series</span></td>` : ''}
      <td class="lb-proj">${b.proj}</td>
      ${!mini ? `<td><button class="lb-view-btn" data-bid="${b.id}">View →</button></td>` : ''}
    </tr>`;
  });

  html += '</tbody></table></div>';
  return html;
}

// ── Bracket Entry ──────────────────────────────────────────

function renderEntry() {
  const locked = isLocked();
  document.getElementById('entryLockedMsg').style.display = locked ? '' : 'none';

  const submitted = document.getElementById('entrySuccessMsg').style.display !== 'none';
  if (submitted) return;

  document.getElementById('entryFormWrap').style.display = '';
  document.getElementById('entrySuccessMsg').style.display = 'none';

  renderEntryRounds();
}

function renderEntryRounds() {
  const teams = getTeams();
  const results = getResults(); // used only to check if series is "in progress"
  const el = document.getElementById('entryRounds');

  // Group series by round, then by conference within round
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

    if (round < 4) {
      const confs = round <= 2 ? ['East','West'] : ['East','West'];
      for (const conf of confs) {
        const confSeries = byRound[round][conf] || [];
        if (!confSeries.length) continue;
        if (round < 3) html += `<div class="entry-conf-label">${conf}ern Conference</div>`;
        else           html += `<div class="entry-conf-label">${conf}ern Conference Final</div>`;
        html += `<div class="entry-series-grid">`;
        confSeries.forEach(s => { html += buildEntrySeriesCard(s, teams); });
        html += `</div>`;
      }
    } else {
      // Stanley Cup Final
      const finalSeries = byRound[4]['Final'] || [];
      html += `<div class="entry-series-grid">`;
      finalSeries.forEach(s => { html += buildEntrySeriesCard(s, teams); });
      html += `</div>`;
    }
  }
  el.innerHTML = html;
  syncEntryPicksToDOM();
}

function buildEntrySeriesCard(s, teams) {
  const [t1, t2] = getSeriesTeams(s.id, state.entryPicks, teams);
  const tbd = t1 === 'TBD' || t2 === 'TBD';
  const locked = isLocked();
  const disAttr = locked ? 'disabled' : '';
  return `
    <div class="series-card" id="ecard-${s.id}" data-sid="${s.id}">
      <div class="series-card-label">${s.abbr}</div>
      <div class="team-picks">
        <button class="team-pick-btn" data-sid="${s.id}" data-team="t1" ${disAttr}>
          <span class="team-name-txt">${esc(t1)}</span>
          <span class="pick-check"></span>
        </button>
        <button class="team-pick-btn" data-sid="${s.id}" data-team="t2" ${disAttr}>
          <span class="team-name-txt">${esc(t2)}</span>
          <span class="pick-check"></span>
        </button>
      </div>
      <div class="games-label">Series length (games)</div>
      <div class="games-btns">
        ${[4,5,6,7].map(g => `<button class="game-btn" data-sid="${s.id}" data-games="${g}" ${disAttr}>${g}</button>`).join('')}
      </div>
    </div>`;
}

function syncEntryPicksToDOM() {
  const teams = getTeams();
  // Update team names in later rounds based on picks
  for (const s of SERIES) {
    if (s.round === 1) continue;
    const [t1, t2] = getSeriesTeams(s.id, state.entryPicks, teams);
    const card = document.getElementById('ecard-' + s.id);
    if (!card) continue;
    const btns = card.querySelectorAll('.team-pick-btn');
    if (btns[0]) btns[0].querySelector('.team-name-txt').textContent = t1;
    if (btns[1]) btns[1].querySelector('.team-name-txt').textContent = t2;
  }

  // Apply selected states
  for (const [sid, pick] of Object.entries(state.entryPicks)) {
    const card = document.getElementById('ecard-' + sid);
    if (!card) continue;
    const teamBtns = card.querySelectorAll('.team-pick-btn');
    const [t1, t2] = getSeriesTeams(sid, state.entryPicks, teams);
    teamBtns.forEach(btn => {
      const teamVal = btn.dataset.team === 't1' ? t1 : t2;
      const isSelected = teamVal === pick.winner;
      btn.classList.toggle('selected', isSelected);
      btn.querySelector('.pick-check').textContent = isSelected ? '✓' : '';
    });
    card.querySelectorAll('.game-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.games) === pick.games);
    });
    const allPicked = pick.winner && pick.games;
    card.classList.toggle('complete', !!allPicked);
  }
}

function handleEntryPick(sid, winnerTeam, games) {
  if (!state.entryPicks[sid]) state.entryPicks[sid] = {};
  if (winnerTeam !== undefined) {
    state.entryPicks[sid].winner = winnerTeam;
    // Cascade: clear later-round picks that depended on this series
    clearDependentPicks(sid);
  }
  if (games !== undefined) {
    state.entryPicks[sid].games = games;
  }
  syncEntryPicksToDOM();
}

function clearDependentPicks(changedSid) {
  // Find series that use changedSid as a source, recursively clear
  for (const s of SERIES) {
    if (s.from && s.from.includes(changedSid)) {
      if (state.entryPicks[s.id]) {
        delete state.entryPicks[s.id];
      }
      clearDependentPicks(s.id);
    }
  }
  // Re-render later round cards with updated team names
  const teams = getTeams();
  for (const s of SERIES) {
    if (s.round === 1) continue;
    const [t1, t2] = getSeriesTeams(s.id, state.entryPicks, teams);
    const card = document.getElementById('ecard-' + s.id);
    if (!card) continue;
    const btns = card.querySelectorAll('.team-pick-btn');
    if (btns[0]) btns[0].querySelector('.team-name-txt').textContent = t1;
    if (btns[1]) btns[1].querySelector('.team-name-txt').textContent = t2;
    // Clear visual selection for cleared picks
    if (!state.entryPicks[s.id]) {
      btns.forEach(b => { b.classList.remove('selected'); b.querySelector('.pick-check').textContent=''; });
      card.querySelectorAll('.game-btn').forEach(b => b.classList.remove('selected'));
      card.classList.remove('complete');
    }
  }
}

function submitBracket() {
  const name = document.getElementById('entryName').value.trim();
  if (!name) { toast('Please enter your name.', 'error'); return; }
  if (isLocked()) { toast('Bracket entry is locked.', 'error'); return; }

  // Check all 15 series have picks
  const missing = SERIES.filter(s => {
    const p = state.entryPicks[s.id];
    return !p || !p.winner || !p.games;
  });
  if (missing.length) {
    toast(`${missing.length} series still need picks (winner + games).`, 'error');
    // Highlight missing
    missing.forEach(s => {
      const card = document.getElementById('ecard-' + s.id);
      if (card) { card.style.borderColor='var(--error)'; setTimeout(()=>{ card.style.borderColor=''; },2000); }
    });
    return;
  }

  // Duplicate name check
  const brackets = getBrackets();
  if (brackets.find(b => b.name.toLowerCase() === name.toLowerCase())) {
    toast('A bracket with that name already exists.', 'error'); return;
  }

  const bracket = {
    id: genId(),
    name,
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
}

// ── Bracket Viewer ─────────────────────────────────────────

function renderViewer(bracketId) {
  const brackets = getBrackets();
  const sel = document.getElementById('viewerSelect');

  // Populate select
  const saved = localStorage.getItem(SK.MY_ID);
  sel.innerHTML = '<option value="">— Select a participant —</option>' +
    brackets.map(b => `<option value="${b.id}"${b.id===saved?' data-mine':''}>${esc(b.name)}${b.id===saved?' (you)':''}</option>`).join('');

  if (bracketId) {
    sel.value = bracketId;
    state.viewingId = bracketId;
    drawBracket(bracketId);
  } else if (state.viewingId) {
    sel.value = state.viewingId;
    drawBracket(state.viewingId);
  }
}

function drawBracket(bid) {
  const brackets = getBrackets();
  const results = getResults();
  const teams = getTeams();
  const bracket = brackets.find(b => b.id === bid);
  if (!bracket) {
    document.getElementById('viewerContent').innerHTML = '<div class="empty-state">Bracket not found.</div>';
    return;
  }

  const { pts, correct, breakdown } = scoreOneBracket(bracket, results);
  const proj = maxPossible(bracket, results);
  const totalSeries = SERIES.length;
  const doneSeries = SERIES.filter(s => results[s.id] && results[s.id].completed).length;

  let html = `
    <div class="viewer-score-bar">
      <div class="vsb-item"><span class="vsb-val">${pts}</span><span class="vsb-lbl">Points</span></div>
      <div class="vsb-item"><span class="vsb-val">${correct}</span><span class="vsb-lbl">Correct Series</span></div>
      <div class="vsb-item"><span class="vsb-val">${proj}</span><span class="vsb-lbl">Max Possible</span></div>
      <div class="vsb-item"><span class="vsb-val">${doneSeries}/${totalSeries}</span><span class="vsb-lbl">Series Complete</span></div>
    </div>
    <div class="bracket-scroll-wrap">
      <div class="bracket-canvas" id="bracketCanvas"></div>
    </div>`;

  document.getElementById('viewerContent').innerHTML = html;
  buildBracketCanvas(bracket.picks, results, teams, breakdown);
}

function buildBracketCanvas(picks, results, teams, breakdown) {
  const canvas = document.getElementById('bracketCanvas');
  if (!canvas) return;
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';

  // SVG for connector lines
  const svg = createSVG(CW, CH);
  CONNECTORS.forEach(([fid, tid, fside, tside]) => {
    const fp = POSITIONS[fid], tp = POSITIONS[tid];
    if (!fp || !tp) return;
    const fx = fside==='r' ? fp.x+BW : fp.x;
    const fy = fp.y + BH/2;
    const tx = tside==='r' ? tp.x+BW : tp.x;
    const ty = tp.y + BH/2;
    const mx = (fx+tx)/2;
    const line = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.setAttribute('points', `${fx},${fy} ${mx},${fy} ${mx},${ty} ${tx},${ty}`);
    line.setAttribute('fill','none');
    line.setAttribute('stroke','#1e3060');
    line.setAttribute('stroke-width','2');
    svg.appendChild(line);
  });
  canvas.appendChild(svg);

  // Conference labels
  const eastLbl = document.createElement('div');
  eastLbl.className = 'bracket-conf-label';
  eastLbl.style.left = '0'; eastLbl.style.top = '-2px';
  eastLbl.textContent = 'EASTERN';
  canvas.appendChild(eastLbl);

  const westLbl = document.createElement('div');
  westLbl.className = 'bracket-conf-label';
  westLbl.style.right = '0'; westLbl.style.left='auto'; westLbl.style.top = '-2px';
  westLbl.textContent = 'WESTERN';
  canvas.appendChild(westLbl);

  // Series boxes
  for (const s of SERIES) {
    const pos = POSITIONS[s.id];
    if (!pos) continue;

    const [t1, t2] = getSeriesTeams(s.id, picks, teams);
    const pick = picks[s.id];
    const result = results[s.id];
    const bd = breakdown ? breakdown[s.id] : null;

    const box = document.createElement('div');
    box.className = 'bk-box' + (s.id==='SCF'?' scf':'');
    box.style.left = pos.x + 'px';
    box.style.top  = pos.y + 'px';
    box.style.width = BW + 'px';

    // Determine state for each team
    let t1Class='', t2Class='', statusBadge='';
    let pickedWinner = pick ? pick.winner : null;
    let actualWinner = (result && result.completed) ? result.winner : null;

    if (pickedWinner) {
      const t1Picked = pickedWinner===t1;
      const t2Picked = pickedWinner===t2;
      if (t1Picked) t1Class = 'winner'; else if (t2Class!=='winner') t1Class='';
      if (t2Picked) t2Class = 'winner'; else t2Class='';

      if (actualWinner) {
        const correctPick = pickedWinner===actualWinner;
        if (correctPick) {
          const gCorrect = pick.games === result.games;
          statusBadge = `<span class="bk-result-badge ${gCorrect?'bk-clinched':'bk-correct'}">✓ ${gCorrect?'Perfect':'Correct'}</span>`;
          if (bd) {
            // shade eliminated team
            if (t1Class==='winner' && actualWinner!==t1) { t1Class='eliminated'; t2Class='winner'; }
            if (t2Class==='winner' && actualWinner!==t2) { t2Class='eliminated'; t1Class='winner'; }
          }
        } else {
          statusBadge = `<span class="bk-result-badge bk-wrong">✗ Wrong</span>`;
          // show actual winner, cross out picked
          if (t1Picked) { t1Class='eliminated'; }
          if (t2Picked) { t2Class='eliminated'; }
        }
        // eliminate actual loser
        if (t1===actualWinner) t1Class='winner';
        if (t2===actualWinner) t2Class='winner';
        const loser = (actualWinner===t1)?t2:t1;
        if (!pickedWinner || pickedWinner!==loser) {
          if (t1===loser && t1Class!=='winner') t1Class='eliminated';
          if (t2===loser && t2Class!=='winner') t2Class='eliminated';
        }
      } else {
        // no result yet — just show pick
        if (!actualWinner) {
          statusBadge = pick.games ? `<span class="bk-result-badge bk-pending">In ${pick.games}</span>` : '';
        }
      }
    }

    const t1Display = t1==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t1Class}">${esc(t1)}</span>`;
    const t2Display = t2==='TBD' ? `<span class="bk-team tbd">TBD</span>` : `<span class="bk-team ${t2Class}">${esc(t2)}</span>`;

    const pickedGames = pick ? pick.games : null;
    const actualGames = (result && result.completed) ? result.games : null;
    const gamesInfo = pickedGames ? `Picked: ${pickedGames}g${actualGames?' · Actual: '+actualGames+'g':''}` : '';

    box.innerHTML = `
      <div class="bk-label">${esc(s.abbr)}</div>
      ${t1Display}
      ${t2Display}
      ${statusBadge ? `<div style="margin-top:0.2rem">${statusBadge}</div>` : ''}
      ${gamesInfo ? `<div class="bk-games">${gamesInfo}</div>` : ''}`;

    canvas.appendChild(box);
  }
}

function createSVG(w, h) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.position = 'absolute';
  svg.style.top = '0'; svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  return svg;
}

// ── Leaderboard ────────────────────────────────────────────

function renderLeaderboard() {
  const brackets = getBrackets();
  const results = getResults();
  const el = document.getElementById('leaderboardContent');
  if (!brackets.length) {
    el.innerHTML = '<div class="empty-state">No entries yet.</div>';
    return;
  }
  const ranked = rankBrackets(brackets, results);
  el.innerHTML = buildLeaderboardTable(ranked, results, false);

  // Attach view-bracket buttons
  el.querySelectorAll('.lb-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewingId = btn.dataset.bid;
      showView('viewer');
      drawBracket(btn.dataset.bid);
    });
  });
}

// ── Commissioner ───────────────────────────────────────────

function renderCommissioner() {
  if (state.commLoggedIn) {
    document.getElementById('commLogin').style.display = 'none';
    document.getElementById('commPanel').style.display = '';
    renderCommTeams();
    renderCommResults();
    renderCommSettings();
    renderCommManage();
  } else {
    document.getElementById('commLogin').style.display = '';
    document.getElementById('commPanel').style.display = 'none';
  }
}

function renderCommTeams() {
  const teams = getTeams();
  const el = document.getElementById('teamsGrid');
  const confs = ['Eastern','Western'];
  let html = '';
  confs.forEach(conf => {
    const slots = TEAM_SLOTS.filter(s => s.conf === conf);
    html += `<div style="grid-column:1/-1;margin:0.25rem 0 0.1rem"><strong style="color:var(--accent);font-family:var(--font-head)">${conf} Conference</strong></div>`;
    slots.forEach(slot => {
      html += `
        <div class="team-input-group">
          <div class="team-input-label">${slot.label}</div>
          <div class="team-input-sub">${slot.div}</div>
          <input type="text" class="form-input team-name-inp" data-key="${slot.key}" value="${esc(teams[slot.key] || '')}" placeholder="${slot.label}" maxlength="40">
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
  const results = getResults();
  const teams = getTeams();
  const el = document.getElementById('resultsGrid');
  let html = '';

  for (let round = 1; round <= 4; round++) {
    const roundSeries = SERIES.filter(s => s.round === round);
    html += `<div class="results-round-section">
      <div class="results-round-title">${ROUND_NAMES[round]} (${ROUND_PTS[round].w}+${ROUND_PTS[round].g} pts)</div>
      <div class="results-grid-inner">`;
    roundSeries.forEach(s => {
      const [t1, t2] = getActualTeams(s.id, results, teams);
      const r = results[s.id] || {};
      const completed = r.completed || false;
      html += `
        <div class="result-card ${completed?'completed':''}" id="rcard-${s.id}">
          <div class="result-card-label">${s.abbr}</div>
          <div class="result-matchup">${esc(t1)} vs ${esc(t2)}</div>
          <div class="result-fields">
            <div class="form-group">
              <div class="form-label" style="font-size:0.65rem">Winner</div>
              <select class="form-select result-winner-sel" data-sid="${s.id}">
                <option value="">— Pick winner —</option>
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
            <input type="checkbox" class="result-done-chk" data-sid="${s.id}" ${completed?'checked':''}> Mark as completed
          </label>
        </div>`;
    });
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

function saveCommResults() {
  const results = getResults();
  document.querySelectorAll('[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    if (!results[sid]) results[sid] = {};
  });
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
  const { lockDate } = getSettings();
  const el = document.getElementById('lockDateInput');
  if (lockDate) {
    // datetime-local needs format: YYYY-MM-DDTHH:mm
    el.value = lockDate.slice(0,16);
  }
}

function saveCommSettings() {
  const val = document.getElementById('lockDateInput').value;
  const settings = getSettings();
  settings.lockDate = val ? new Date(val).toISOString() : null;
  saveSettings(settings);
  showSaveMsg('settingsSavedMsg');
  toast('Settings saved!', 'success');
}

function renderCommManage() {
  const brackets = getBrackets();
  const el = document.getElementById('manageEntriesGrid');
  if (!brackets.length) {
    el.innerHTML = '<div class="empty-state">No entries submitted yet.</div>';
    return;
  }
  let html = `<div class="manage-table-wrap"><table class="manage-table">
    <thead><tr><th>Name</th><th>Submitted</th><th></th></tr></thead><tbody>`;
  brackets.forEach(b => {
    const dt = new Date(b.timestamp).toLocaleString();
    html += `<tr>
      <td><strong>${esc(b.name)}</strong></td>
      <td style="color:var(--text-muted);font-size:0.82rem">${dt}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="viewBracketFromCommissioner('${b.id}')">View</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEntry('${b.id}')">Delete</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

window.viewBracketFromCommissioner = function(bid) {
  state.viewingId = bid;
  showView('viewer');
  drawBracket(bid);
};

window.deleteEntry = function(bid) {
  if (!confirm('Delete this bracket? This cannot be undone.')) return;
  let brackets = getBrackets().filter(b => b.id !== bid);
  saveBrackets(brackets);
  renderCommManage();
  toast('Entry deleted.', 'success');
};

// ── Export CSV ─────────────────────────────────────────────

function exportCSV() {
  const brackets = getBrackets();
  const results = getResults();
  const ranked = rankBrackets(brackets, results);

  const rows = [['Rank','Name','Points','Correct Series','Max Possible','Submitted']];
  ranked.forEach((b, i) => {
    rows.push([i+1, b.name, b.pts, b.correct, b.proj, new Date(b.timestamp).toLocaleDateString()]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ChelBracket26_Leaderboard.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Utilities ──────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

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
  setTimeout(() => el.remove(), 3200);
}

function showSaveMsg(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = '';
  setTimeout(() => { el.style.display='none'; }, 2500);
}

function closeMobileMenu() {
  document.getElementById('mobileMenu').classList.remove('open');
}

// ── Event Listeners ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Navigation buttons (nav + mobile menu)
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => showView(el.dataset.view));
  });

  // Hamburger
  document.getElementById('navHamburger').addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.toggle('open');
  });

  // Entry: team pick buttons (delegated)
  document.getElementById('entryRounds').addEventListener('click', e => {
    const teamBtn = e.target.closest('.team-pick-btn');
    if (teamBtn) {
      const sid = teamBtn.dataset.sid;
      const teams = getTeams();
      const [t1, t2] = getSeriesTeams(sid, state.entryPicks, teams);
      const winner = teamBtn.dataset.team === 't1' ? t1 : t2;
      handleEntryPick(sid, winner, undefined);
    }
    const gameBtn = e.target.closest('.game-btn');
    if (gameBtn) {
      handleEntryPick(gameBtn.dataset.sid, undefined, parseInt(gameBtn.dataset.games));
    }
  });

  // Submit bracket
  document.getElementById('submitBracketBtn').addEventListener('click', submitBracket);

  // View my bracket after submission
  document.getElementById('viewMyBracketBtn').addEventListener('click', e => {
    const bid = e.target.dataset.bid;
    state.viewingId = bid;
    showView('viewer');
    renderViewer(bid);
    drawBracket(bid);
  });

  // Viewer select
  document.getElementById('viewerSelect').addEventListener('change', e => {
    state.viewingId = e.target.value;
    if (e.target.value) drawBracket(e.target.value);
    else document.getElementById('viewerContent').innerHTML = '<div class="empty-state">Select a participant above to view their bracket.</div>';
  });

  // Export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);

  // Commissioner login
  document.getElementById('commLoginBtn').addEventListener('click', () => {
    const pw = document.getElementById('commPasswordInput').value;
    if (pw === COMM_PASSWORD) {
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

  // Commissioner logout
  document.getElementById('commLogoutBtn').addEventListener('click', () => {
    state.commLoggedIn = false;
    renderCommissioner();
  });

  // Commissioner tabs
  document.getElementById('commTabs').addEventListener('click', e => {
    const tab = e.target.closest('.comm-tab');
    if (!tab) return;
    document.querySelectorAll('.comm-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.comm-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('commPane-' + tab.dataset.tab).classList.add('active');
  });

  // Commissioner saves
  document.getElementById('saveTeamsBtn').addEventListener('click', saveCommTeams);
  document.getElementById('saveResultsBtn').addEventListener('click', saveCommResults);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveCommSettings);

  // Leaderboard view buttons (delegated — rendered dynamically)
  document.getElementById('leaderboardContent').addEventListener('click', e => {
    const btn = e.target.closest('.lb-view-btn');
    if (!btn) return;
    state.viewingId = btn.dataset.bid;
    showView('viewer');
    renderViewer(btn.dataset.bid);
    drawBracket(btn.dataset.bid);
  });

  // Countdown timer
  setInterval(() => {
    if (state.view === 'home') renderCountdown();
  }, 1000);

  // Boot
  showView('home');
});

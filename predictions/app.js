// Predictions page — fetches 4 JSON files, renders sections.

const DATA = [
  ['bracket',      'data/bracket.json'],
  ['series',       'data/series.json'],
  ['games',        'data/games.json'],
  ['lastUpdated',  'data/last_updated.json'],
];

function fmtPct(p) {
  if (p == null || isNaN(p)) return '—';
  return (p * 100).toFixed(1) + '%';
}

function bar(pct, side /* 'home' | 'away' */) {
  const width = Math.max(2, Math.min(100, pct * 100));
  return `<div class="prob-bar prob-${side}"><div class="prob-fill" style="width:${width.toFixed(1)}%"></div><span class="prob-label">${fmtPct(pct)}</span></div>`;
}

function renderCupOdds(data) {
  const teams = (data && data.teams) || [];
  if (!teams.length) {
    return '<div class="empty-state">No odds available yet.</div>';
  }
  const rows = teams.map((t, i) => `
    <tr class="${i === 0 ? 'cup-leader' : ''}">
      <td class="rank">${i + 1}</td>
      <td class="team-cell"><span class="team-abbr">${t.team}</span><span class="team-name">${t.name || ''}</span></td>
      <td class="series-score">${t.current_series || ''}</td>
      <td>${fmtPct(t.round1_win_pct)}</td>
      <td>${fmtPct(t.round2_win_pct)}</td>
      <td>${fmtPct(t.round3_win_pct)}</td>
      <td class="cup-pct">${fmtPct(t.cup_win_pct)}</td>
    </tr>
  `).join('');
  return `
    <div class="table-wrap">
      <table class="pred-table">
        <thead>
          <tr><th>#</th><th>Team</th><th>R1</th><th>R1%</th><th>R2%</th><th>R3%</th><th>Cup%</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderSeries(data) {
  const active = (data && data.active) || [];
  if (!active.length) return '<div class="empty-state">No active series.</div>';
  return active.map(s => {
    const len = s.length_distribution || {};
    const lengths = ['4', '5', '6', '7'].map(k => `
      <div class="len-cell">
        <div class="len-games">in ${k}</div>
        <div class="len-pct">${fmtPct(len[k] || 0)}</div>
      </div>`).join('');
    const most = s.most_likely || {};
    return `
      <div class="series-card">
        <div class="series-top">
          <div class="series-seed">${s.seed || ''} · Round ${s.round || 1}</div>
          <div class="series-most">Most likely: <strong>${most.winner || '—'} in ${most.games || '—'}</strong></div>
        </div>
        <div class="series-teams">
          <div class="series-team">
            <div class="t-name"><span class="team-abbr">${s.home.team}</span> ${s.home.name || ''}</div>
            ${bar(s.home.series_win_pct, 'home')}
          </div>
          <div class="series-score-big">${s.home.wins}–${s.away.wins}</div>
          <div class="series-team">
            <div class="t-name"><span class="team-abbr">${s.away.team}</span> ${s.away.name || ''}</div>
            ${bar(s.away.series_win_pct, 'away')}
          </div>
        </div>
        <div class="series-lengths">${lengths}</div>
      </div>`;
  }).join('');
}

function renderGames(data) {
  const games = (data && data.upcoming) || [];
  if (!games.length) return '<div class="empty-state">No games scheduled in the next 48 hours.</div>';
  return games.map(g => {
    const d = g.date ? new Date(g.date) : null;
    const when = d ? d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    const badge = g.uncertain_starter ? `<span class="uncertain-badge" title="Starting goalie unconfirmed">⚠ Unconfirmed starter</span>` : '';
    return `
      <div class="game-card">
        <div class="game-top">
          <span class="game-when">${when}</span>
          ${badge}
        </div>
        <div class="game-matchup">
          <div class="game-side">
            <div class="t-name"><span class="team-abbr">${g.home.team}</span> ${g.home.name || ''}</div>
            <div class="t-goalie">${g.home.goalie || '—'} · quality ${g.home.goalie_score != null ? g.home.goalie_score.toFixed(2) : '—'}</div>
            <div class="t-rest">Rest: ${g.home.rest_days}d</div>
            ${bar(g.home.win_pct, 'home')}
          </div>
          <div class="game-vs">vs</div>
          <div class="game-side">
            <div class="t-name"><span class="team-abbr">${g.away.team}</span> ${g.away.name || ''}</div>
            <div class="t-goalie">${g.away.goalie || '—'} · quality ${g.away.goalie_score != null ? g.away.goalie_score.toFixed(2) : '—'}</div>
            <div class="t-rest">Rest: ${g.away.rest_days}d</div>
            ${bar(g.away.win_pct, 'away')}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderLastUpdated(d) {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  if (!d || !d.generated_at) { el.textContent = 'Updated: unknown'; return; }
  try {
    const dt = new Date(d.generated_at);
    const s = dt.toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    el.textContent = `Updated ${s}`;
  } catch {
    el.textContent = `Updated ${d.generated_at}`;
  }
}

async function fetchJson(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function init() {
  const results = await Promise.allSettled(DATA.map(([, p]) => fetchJson(p)));
  const [bracket, series, games, lastUpdated] = results.map(r => r.status === 'fulfilled' ? r.value : null);

  try {
    document.getElementById('cupOdds').innerHTML = bracket ? renderCupOdds(bracket) : '<div class="empty-state">Couldn\'t load Cup odds.</div>';
  } catch (e) { document.getElementById('cupOdds').innerHTML = '<div class="empty-state">Failed to render odds.</div>'; console.error(e); }

  try {
    document.getElementById('activeSeries').innerHTML = series ? renderSeries(series) : '<div class="empty-state">Couldn\'t load series.</div>';
  } catch (e) { document.getElementById('activeSeries').innerHTML = '<div class="empty-state">Failed to render series.</div>'; console.error(e); }

  try {
    document.getElementById('upcomingGames').innerHTML = games ? renderGames(games) : '<div class="empty-state">Couldn\'t load games.</div>';
  } catch (e) { document.getElementById('upcomingGames').innerHTML = '<div class="empty-state">Failed to render games.</div>'; console.error(e); }

  renderLastUpdated(lastUpdated);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('navHamburger')?.addEventListener('click', () => {
    document.getElementById('mobileMenu')?.classList.toggle('open');
  });
  init();
});

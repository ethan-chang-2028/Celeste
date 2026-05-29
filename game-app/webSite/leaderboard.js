// ---------------------------------------------------------------------------
// leaderboard.js — four boards: AI win rate, PvP win rate, and per-map run
// records (Mirror Temple, Heart of the Mountain) ranked by time & deaths.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  const tbody     = document.getElementById('lb-body');
  const thead     = document.getElementById('lb-head');
  const tabsWrap  = document.getElementById('lb-tabs');
  const subtitle  = document.getElementById('lb-subtitle');

  let allRecords = [];
  let activeBoard = 'ai';
  let sortKey = null;
  let sortDir = 1; // 1 = asc, -1 = desc

  // -- Cell renderers ------------------------------------------------------
  function rankCell(row, i) {
    const cls = i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    return `<td class="lb-rank ${cls}">${i + 1}</td>`;
  }

  function playerCell(row) {
    const flag = row.country ? countryFlag(row.country) : '';
    const avatar = row.avatarUrl
      ? `<img src="${row.avatarUrl}" alt="" onerror="this.style.display='none'">`
      : `<span class="avatar-fallback">${(row.playerName || '?')[0].toUpperCase()}</span>`;
    return `<td><div class="lb-player">${avatar}<span>${row.playerName || 'Anonymous'}</span> <span class="lb-flag">${flag}</span></div></td>`;
  }

  // -- Board definitions ---------------------------------------------------
  const BOARDS = {
    ai: {
      subtitle: 'Win rate against the C++ AI opponent across Player-vs-AI races.',
      defaultSort: 'winRate',
      data: () => aggregateWinRates('pvai'),
      columns: [
        { key: 'rank',    label: '#',        cell: rankCell },
        { key: 'player',  label: 'Player',   cell: playerCell, value: r => r.playerName || '' },
        { key: 'winRate', label: 'Win Rate', cell: r => `<td class="lb-rate">${fmtPct(r.winRate)}</td>`, value: r => r.winRate, defaultDir: -1 },
        { key: 'record',  label: 'Record',   cell: r => `<td class="lb-record">${r.wins}W – ${r.losses}L</td>`, value: r => r.wins, defaultDir: -1 },
      ],
    },
    pvp: {
      subtitle: 'Win rate in online Player-vs-Player races.',
      defaultSort: 'winRate',
      data: () => aggregateWinRates('pvp'),
      columns: [
        { key: 'rank',    label: '#',        cell: rankCell },
        { key: 'player',  label: 'Player',   cell: playerCell, value: r => r.playerName || '' },
        { key: 'winRate', label: 'Win Rate', cell: r => `<td class="lb-rate">${fmtPct(r.winRate)}</td>`, value: r => r.winRate, defaultDir: -1 },
        { key: 'record',  label: 'Record',   cell: r => `<td class="lb-record">${r.wins}W – ${r.losses}L</td>`, value: r => r.wins, defaultDir: -1 },
      ],
    },
    maze: {
      subtitle: 'Fastest Mirror Temple completions — lowest time wins, deaths break ties.',
      defaultSort: 'time',
      data: () => runsForLevel('maze'),
      columns: [
        { key: 'rank',   label: '#',      cell: rankCell },
        { key: 'player', label: 'Player', cell: playerCell, value: r => r.playerName || '' },
        { key: 'time',   label: 'Time',   cell: r => `<td class="lb-time">${fmtTime(r.completionTime)}</td>`, value: r => r.completionTime },
        { key: 'deaths', label: 'Deaths', cell: r => `<td>${r.deathCount}</td>`, value: r => r.deathCount },
      ],
    },
    mountain: {
      subtitle: 'Fastest Heart of the Mountain completions — lowest time wins, deaths break ties.',
      defaultSort: 'time',
      data: () => runsForLevel('mountain'),
      columns: [
        { key: 'rank',   label: '#',      cell: rankCell },
        { key: 'player', label: 'Player', cell: playerCell, value: r => r.playerName || '' },
        { key: 'time',   label: 'Time',   cell: r => `<td class="lb-time">${fmtTime(r.completionTime)}</td>`, value: r => r.completionTime },
        { key: 'deaths', label: 'Deaths', cell: r => `<td>${r.deathCount}</td>`, value: r => r.deathCount },
      ],
    },
  };

  // -- Aggregation ---------------------------------------------------------
  function aggregateWinRates(raceType) {
    const byPlayer = new Map();
    for (const r of allRecords) {
      if (r.raceType !== raceType) continue;
      const key = r.playerName || 'Anonymous';
      let e = byPlayer.get(key);
      if (!e) {
        e = { playerName: key, country: r.country, avatarUrl: r.avatarUrl, wins: 0, total: 0 };
        byPlayer.set(key, e);
      }
      e.total += 1;
      if (r.won) e.wins += 1;
    }
    return [...byPlayer.values()].map(e => ({
      ...e,
      losses: e.total - e.wins,
      winRate: e.total ? e.wins / e.total : 0,
    }));
  }

  function runsForLevel(levelId) {
    return allRecords.filter(r => r.levelId === levelId && r.completionTime != null);
  }

  // -- Render --------------------------------------------------------------
  function render() {
    const board = BOARDS[activeBoard];
    const cols = board.columns;
    subtitle.textContent = board.subtitle;

    // Header
    thead.innerHTML = '<tr>' + cols.map(c =>
      `<th data-sort="${c.key}">${c.label}</th>`).join('') + '</tr>';
    thead.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        const col = cols.find(c => c.key === key);
        if (!col || !col.value) return; // rank column is not sortable
        if (key === sortKey) sortDir *= -1;
        else { sortKey = key; sortDir = col.defaultDir || 1; }
        render();
      });
    });

    // Rows
    let rows = board.data();
    const sortCol = cols.find(c => c.key === sortKey);
    if (sortCol && sortCol.value) {
      rows = rows.slice().sort((a, b) => {
        const av = sortCol.value(a), bv = sortCol.value(b);
        if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
        return (av - bv) * sortDir;
      });
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="lb-empty">No results yet. Be the first!</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((row, i) =>
      '<tr>' + cols.map(c => c.cell(row, i)).join('') + '</tr>').join('');
  }

  function selectBoard(board) {
    if (!BOARDS[board]) return;
    activeBoard = board;
    sortKey = BOARDS[board].defaultSort;
    const col = BOARDS[board].columns.find(c => c.key === sortKey);
    sortDir = col && col.defaultDir ? col.defaultDir : 1;

    tabsWrap.querySelectorAll('.lb-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.board === board));
    render();
  }

  // -- Helpers -------------------------------------------------------------
  function fmtPct(rate) {
    return `${(rate * 100).toFixed(1)}%`;
  }

  function fmtTime(s) {
    if (s == null) return '—';
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2).padStart(5, '0');
    return m > 0 ? `${m}:${sec}` : `${sec}s`;
  }

  function countryFlag(c) {
    // tiny ISO-2 -> regional indicator conversion
    if (!c || c.length !== 2) return '';
    return String.fromCodePoint(...[...c.toUpperCase()].map(ch => 0x1f1a5 + ch.charCodeAt(0)));
  }

  // -- Init ----------------------------------------------------------------
  tabsWrap.querySelectorAll('.lb-tab').forEach(t =>
    t.addEventListener('click', () => selectBoard(t.dataset.board)));

  async function loadLeaderboard() {
    try {
      allRecords = await Platform.getLeaderboard();
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      tbody.innerHTML = '<tr><td class="lb-empty">Failed to load leaderboard data.</td></tr>';
      return;
    }
    selectBoard(activeBoard);
  }

  loadLeaderboard();
})();

// ---------------------------------------------------------------------------
// leaderboard.js — four boards selected via tabs:
//   ai       → win rate vs the AI opponent (Player-vs-AI races)
//   pvp      → win rate in online Player-vs-Player races
//   maze     → Mirror Temple, fastest solo completions (time + deaths)
//   mountain → Heart of the Mountain, fastest solo completions (time + deaths)
// Data comes from window.ApexData (platform-data.js).
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    const D = window.ApexData;
    const body     = document.getElementById('lbBody');
    const head     = document.getElementById('lbHead');
    const tabsWrap = document.getElementById('tabs');
    const subtitle = document.getElementById('subtitle');

    let runs = [];
    try {
        runs = await D.fetchRuns();
    } catch (_) {
        body.innerHTML = '<tr><td class="empty">Could not load runs.</td></tr>';
        return;
    }

    // Decorate every run with its display identity once.
    const decorated = runs.map(r => {
        const id = D.runIdentity(r);
        return { ...r, username: id.username, country: id.country || '—', avatar: id.avatar };
    });

    // ── Cell renderers ────────────────────────────────────────────────────────
    function rankCell(_row, i) {
        const cls = i === 1 ? ' silver' : i === 2 ? ' bronze' : '';
        return `<td class="rank${cls}">${i + 1}</td>`;
    }
    function playerCell(row) {
        return `<td>${D.avatarEmoji(row.avatar)} ${escapeHtml(row.username)} ` +
               `<span class="country">${escapeHtml(row.country)}</span></td>`;
    }

    // ── Aggregation ───────────────────────────────────────────────────────────
    function winRates(raceType) {
        const byPlayer = new Map();
        for (const r of decorated) {
            if (r.raceType !== raceType) continue;
            let e = byPlayer.get(r.username);
            if (!e) {
                e = { username: r.username, country: r.country, avatar: r.avatar, wins: 0, total: 0 };
                byPlayer.set(r.username, e);
            }
            e.total += 1;
            if (r.won) e.wins += 1;
        }
        return [...byPlayer.values()].map(e => ({
            ...e, losses: e.total - e.wins, winRate: e.total ? e.wins / e.total : 0,
        }));
    }
    function soloRuns(levelId) {
        return decorated.filter(r => r.levelId === levelId && r.raceType === 'solo');
    }

    // ── Board definitions ─────────────────────────────────────────────────────
    const BOARDS = {
        ai: {
            subtitle: 'Win rate against the C++ AI opponent across Player-vs-AI races.',
            defaultSort: 'winRate', defaultDir: 'desc',
            data: () => winRates('pvai'),
            columns: [
                { key: 'rank',    label: '#',        cell: rankCell },
                { key: 'player',  label: 'Player',   cell: playerCell, value: r => r.username.toLowerCase() },
                { key: 'winRate', label: 'Win Rate', cell: r => `<td class="rate">${pct(r.winRate)}</td>`, value: r => r.winRate },
                { key: 'record',  label: 'Record',   cell: r => `<td class="record">${r.wins}W – ${r.losses}L</td>`, value: r => r.wins },
            ],
        },
        pvp: {
            subtitle: 'Win rate in online Player-vs-Player races.',
            defaultSort: 'winRate', defaultDir: 'desc',
            data: () => winRates('pvp'),
            columns: [
                { key: 'rank',    label: '#',        cell: rankCell },
                { key: 'player',  label: 'Player',   cell: playerCell, value: r => r.username.toLowerCase() },
                { key: 'winRate', label: 'Win Rate', cell: r => `<td class="rate">${pct(r.winRate)}</td>`, value: r => r.winRate },
                { key: 'record',  label: 'Record',   cell: r => `<td class="record">${r.wins}W – ${r.losses}L</td>`, value: r => r.wins },
            ],
        },
        maze: {
            subtitle: 'Fastest Mirror Temple solo completions — lowest time wins.',
            defaultSort: 'time', defaultDir: 'asc',
            data: () => soloRuns('maze'),
            columns: [
                { key: 'rank',   label: '#',      cell: rankCell },
                { key: 'player', label: 'Player', cell: playerCell, value: r => r.username.toLowerCase() },
                { key: 'time',   label: 'Time',   cell: r => `<td class="time">${r.completionTime.toFixed(2)}s</td>`, value: r => r.completionTime },
                { key: 'deaths', label: 'Deaths', cell: r => `<td>${r.deathCount}</td>`, value: r => r.deathCount },
            ],
        },
        mountain: {
            subtitle: 'Fastest Heart of the Mountain solo completions — lowest time wins.',
            defaultSort: 'time', defaultDir: 'asc',
            data: () => soloRuns('mountain'),
            columns: [
                { key: 'rank',   label: '#',      cell: rankCell },
                { key: 'player', label: 'Player', cell: playerCell, value: r => r.username.toLowerCase() },
                { key: 'time',   label: 'Time',   cell: r => `<td class="time">${r.completionTime.toFixed(2)}s</td>`, value: r => r.completionTime },
                { key: 'deaths', label: 'Deaths', cell: r => `<td>${r.deathCount}</td>`, value: r => r.deathCount },
            ],
        },
    };

    let activeBoard = 'ai';
    let sortKey = null;
    let sortDir = 'asc';

    function render() {
        const board = BOARDS[activeBoard];
        const cols = board.columns;
        subtitle.textContent = board.subtitle;

        // Header (with sort arrows)
        head.innerHTML = '<tr>' + cols.map(c => {
            const arrow = c.key === sortKey
                ? ` <span class="arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>` : '';
            return `<th data-sort="${c.key}">${c.label}${arrow}</th>`;
        }).join('') + '</tr>';
        head.querySelectorAll('th').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                const col = cols.find(c => c.key === key);
                if (!col || !col.value) return; // rank not sortable
                if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                else { sortKey = key; sortDir = key === 'player' ? 'asc' : 'desc'; }
                render();
            });
        });

        // Rows
        let rows = board.data();
        const sortCol = cols.find(c => c.key === sortKey);
        if (sortCol && sortCol.value) {
            const dir = sortDir === 'asc' ? 1 : -1;
            rows = rows.slice().sort((a, b) => {
                const av = sortCol.value(a), bv = sortCol.value(b);
                if (av < bv) return -1 * dir;
                if (av > bv) return 1 * dir;
                return 0;
            });
        }

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="${cols.length}" class="empty">No results yet. Be the first!</td></tr>`;
            return;
        }
        body.innerHTML = rows.map((row, i) =>
            '<tr>' + cols.map(c => c.cell(row, i)).join('') + '</tr>').join('');
    }

    function selectBoard(name) {
        if (!BOARDS[name]) return;
        activeBoard = name;
        sortKey = BOARDS[name].defaultSort;
        sortDir = BOARDS[name].defaultDir;
        tabsWrap.querySelectorAll('.tab').forEach(t =>
            t.classList.toggle('active', t.dataset.board === name));
        render();
    }

    tabsWrap.querySelectorAll('.tab').forEach(t =>
        t.addEventListener('click', () => selectBoard(t.dataset.board)));

    function pct(rate) { return `${(rate * 100).toFixed(1)}%`; }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    selectBoard('ai');
});

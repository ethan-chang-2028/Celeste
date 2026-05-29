document.addEventListener('DOMContentLoaded', async () => {
    const D = window.ApexData;
    const body = document.getElementById('lbBody');

    const levelSel   = document.getElementById('levelFilter');
    const periodSel  = document.getElementById('periodFilter');
    const countrySel = document.getElementById('countryFilter');

    let runs = [];
    let sortKey = 'time';   // default: best completion time ascending
    let sortDir = 'asc';

    try {
        runs = await D.fetchRuns();
    } catch (_) {
        body.innerHTML = '<tr><td colspan="7" class="empty">Could not load runs.</td></tr>';
        return;
    }

    // ── Build a denormalised view joining player info ─────────────────────────
    const rows = runs.map(r => {
        const id = D.runIdentity(r);
        return {
            ...r,
            username: id.username,
            country: id.country || '—',
            avatar: id.avatar,
            levelLabel: D.levelName(r.levelId),
            date: new Date(r.completedAt),
        };
    });

    // ── Populate filter dropdowns ─────────────────────────────────────────────
    D.LEVELS.forEach(l => {
        const o = document.createElement('option');
        o.value = l.id; o.textContent = l.name;
        levelSel.appendChild(o);
    });
    [...new Set(rows.map(r => r.country).filter(c => c && c !== '—'))].sort().forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        countrySel.appendChild(o);
    });

    // ── Filtering ─────────────────────────────────────────────────────────────
    function withinPeriod(date, period) {
        if (period === 'all') return true;
        const ageDays = (Date.now() - date.getTime()) / 86400000;
        if (period === 'weekly') return ageDays <= 7;
        if (period === 'daily')  return ageDays <= 1;
        return true;
    }

    function applyFilters() {
        const lvl = levelSel.value, per = periodSel.value, cty = countrySel.value;
        return rows.filter(r =>
            (lvl === 'all' || r.levelId === lvl) &&
            (cty === 'all' || r.country === cty) &&
            withinPeriod(r.date, per)
        );
    }

    // ── Sorting ───────────────────────────────────────────────────────────────
    function sortRows(list) {
        const dir = sortDir === 'asc' ? 1 : -1;
        const getters = {
            rank:   r => r.completionTime,         // rank tracks time
            player: r => r.username.toLowerCase(),
            level:  r => r.levelLabel.toLowerCase(),
            time:   r => r.completionTime,
            deaths: r => r.deathCount,
            mode:   r => r.raceType,
            date:   r => r.date.getTime(),
        };
        const g = getters[sortKey] || getters.time;
        return list.slice().sort((a, b) => {
            const av = g(a), bv = g(b);
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function render() {
        const list = sortRows(applyFilters());

        // Update header arrows
        document.querySelectorAll('thead th').forEach(th => {
            const k = th.dataset.sort;
            const base = th.textContent.replace(/[▲▼]\s*$/, '').trim();
            th.innerHTML = k === sortKey
                ? `${base} <span class="arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>`
                : base;
        });

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="7" class="empty">No runs match these filters.</td></tr>';
            return;
        }

        body.innerHTML = list.map((r, i) => {
            const modeClass = r.raceType === 'pvp' ? 'pvp' : r.raceType === 'pvai' ? 'pvai' : '';
            return `<tr data-uid="${escapeAttr(r.playerId)}">
                <td class="rank">${i + 1}</td>
                <td>${D.avatarEmoji(r.avatar)} ${escapeHtml(r.username)} <span style="color:#5a627e;font-size:.78rem;">${escapeHtml(r.country)}</span></td>
                <td>${escapeHtml(r.levelLabel)}</td>
                <td class="time">${r.completionTime.toFixed(2)}s</td>
                <td>${r.deathCount}</td>
                <td><span class="pill ${modeClass}">${r.raceType.toUpperCase()}</span></td>
                <td>${r.date.toLocaleDateString()}</td>
            </tr>`;
        }).join('');

        // Clickable rows → that player's profile
        body.querySelectorAll('tr[data-uid]').forEach(tr => {
            tr.addEventListener('click', () => {
                window.location.href = `/profile.html?user=${encodeURIComponent(tr.dataset.uid)}`;
            });
        });
    }

    // ── Wire up controls ──────────────────────────────────────────────────────
    [levelSel, periodSel, countrySel].forEach(s => s.addEventListener('change', render));
    document.querySelectorAll('thead th').forEach(th => {
        th.addEventListener('click', () => {
            const k = th.dataset.sort;
            if (sortKey === k) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
            else { sortKey = k; sortDir = (k === 'player' || k === 'level' || k === 'mode') ? 'asc' : 'asc'; }
            render();
        });
    });

    render();

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function escapeAttr(s) { return escapeHtml(s); }
});

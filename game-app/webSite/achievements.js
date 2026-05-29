document.addEventListener('DOMContentLoaded', () => {
    const D = window.ApexData;

    // Require login (matches stats.js behaviour)
    const user = D.currentUser();
    if (!user) {
        window.location.href = window.location.protocol === 'file:' ? 'index.html' : '/index.html';
        return;
    }

    // ── Header ────────────────────────────────────────────────────────────────
    document.getElementById('avatarBadge').textContent = D.avatarEmoji(user.avatar);
    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('displayRole').textContent =
        (user.role || 'player').charAt(0).toUpperCase() + (user.role || 'player').slice(1);

    // ── Gather this player's measurable stats ─────────────────────────────────
    const stats = JSON.parse(localStorage.getItem(`celeste_stats_${user.id}`) || '{}');
    const bestTimes = user.bestTimes && typeof user.bestTimes === 'object' ? user.bestTimes : {};
    const bestTimeSec = Object.values(bestTimes).length
        ? Math.min(...Object.values(bestTimes).map(Number).filter(n => n > 0))
        : null;
    const earnedFlags = Array.isArray(user.achievements) ? user.achievements : [];

    const values = {
        levelsCompleted: user.levelsCompleted || 0,
        deathCount: stats.deathCount ?? user.deathCount ?? 0,
        dashCount: stats.dashCount ?? 0,
        berriesCollected: stats.berriesCollected ?? 0,
        goldenBerriesCollected: stats.goldenBerriesCollected ?? 0,
        bestTimeSec,
    };

    // ── Compute unlock state + progress per achievement ───────────────────────
    function evaluate(a) {
        if (a.flag) {
            const unlocked = earnedFlags.includes(a.id);
            return { unlocked, label: unlocked ? 'Earned' : 'Not yet earned', pct: unlocked ? 100 : 0 };
        }
        const cur = values[a.stat];
        if (a.lowerIsBetter) {
            const has = typeof cur === 'number' && cur > 0;
            const unlocked = has && cur <= a.goal;
            return {
                unlocked,
                label: has ? `${cur.toFixed(2)}s (target ≤ ${a.goal}s)` : `target ≤ ${a.goal}s`,
                pct: unlocked ? 100 : (has ? Math.min(99, Math.round((a.goal / cur) * 100)) : 0),
            };
        }
        const n = Number(cur) || 0;
        const unlocked = n >= a.goal;
        return {
            unlocked,
            label: `${n.toLocaleString()} / ${a.goal.toLocaleString()}`,
            pct: Math.min(100, Math.round((n / a.goal) * 100)),
        };
    }

    const results = D.ACHIEVEMENTS.map(a => ({ a, r: evaluate(a) }));
    const earned = results.filter(x => x.r.unlocked);

    // ── Overall summary ───────────────────────────────────────────────────────
    document.getElementById('earnedCount').textContent = earned.length;
    document.getElementById('totalCount').textContent = results.length;
    document.getElementById('overallFill').style.width =
        `${Math.round((earned.length / results.length) * 100)}%`;

    // ── Badge gallery (earned only) ───────────────────────────────────────────
    const gallery = document.getElementById('gallery');
    if (earned.length) {
        gallery.innerHTML = earned.map(x =>
            `<div class="badge" title="${escapeAttr(x.a.name)}">${x.a.icon}</div>`
        ).join('');
    }

    // ── Full grid ─────────────────────────────────────────────────────────────
    document.getElementById('achGrid').innerHTML = results.map(({ a, r }) => `
        <div class="ach ${r.unlocked ? 'unlocked' : 'locked'}">
            <div class="ico">${r.unlocked ? a.icon : '🔒'}</div>
            <div class="ach-body">
                <p class="ach-name">${escapeHtml(a.name)} ${r.unlocked ? '<span class="tick">✓</span>' : ''}</p>
                <p class="ach-desc">${escapeHtml(a.desc)}</p>
                <div class="pbar"><span style="width:${r.pct}%"></span></div>
                <div class="pmeta">${escapeHtml(r.label)}</div>
            </div>
        </div>
    `).join('');

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function escapeAttr(s) { return escapeHtml(s); }
});

document.addEventListener('DOMContentLoaded', () => {
    const raw = sessionStorage.getItem('loggedInUser');
    if (!raw) {
        window.location.href = window.location.protocol === 'file:'
            ? 'index.html' : '/index.html';
        return;
    }

    const user = JSON.parse(raw);

    // ── Player header ─────────────────────────────────────────────────────────
    const avatarEmojis = { Madeline: '🧗', Badeline: '🌑', Granny: '👵', Theo: '📷' };
    document.getElementById('avatarBadge').textContent =
        avatarEmojis[user.avatar] || '🎮';
    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('displayRole').textContent =
        (user.role || 'player').charAt(0).toUpperCase() +
        (user.role || 'player').slice(1);

    // ── Per-user stats ────────────────────────────────────────────────────────
    const stats = JSON.parse(
        localStorage.getItem(`celeste_stats_${user.id}`) || '{}'
    );

    function setVal(id, raw) {
        const el = document.getElementById(id);
        if (!el) return;
        const n = raw || 0;
        el.textContent = n.toLocaleString();
        if (n > 0) el.classList.remove('zero');
        else        el.classList.add('zero');
    }

    setVal('statDashes',  stats.dashCount);
    setVal('statDeaths',  stats.deathCount);
    setVal('statBerries', stats.berriesCollected);
    setVal('statGolden',  stats.goldenBerriesCollected);

    // ── AI global stats ───────────────────────────────────────────────────────
    const ai = JSON.parse(
        localStorage.getItem('celeste_ai_global_stats') || '{}'
    );

    function setAI(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        if (val == null) { el.textContent = '--'; return; }
        el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
        el.classList.remove('zero');
    }

    setAI('aiGen',  ai.generation);
    setAI('aiRuns', ai.runCount);
    setAI('aiTime', ai.bestTimeMs != null
        ? `${(ai.bestTimeMs / 1000).toFixed(2)}s` : null);
    setAI('aiFit',  ai.globalBestFit != null
        ? `${(ai.globalBestFit * 100).toFixed(1)}%` : null);
});

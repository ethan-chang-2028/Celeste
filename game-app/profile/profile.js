document.addEventListener('DOMContentLoaded', () => {
    const loggedInUserData = sessionStorage.getItem('loggedInUser');

    if (!loggedInUserData) {
        window.location.href = window.location.protocol === 'file:'
            ? '../webSite/index.html' : '/index.html';
        return;
    }

    const user = JSON.parse(loggedInUserData);

    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('displayEmail').textContent = user.email;
    document.getElementById('displayRole').textContent =
        user.role.charAt(0).toUpperCase() + user.role.slice(1);

    // ── Per-user stats ────────────────────────────────────────────────────────
    const statsKey = `celeste_stats_${user.id}`;
    const stats = JSON.parse(localStorage.getItem(statsKey) || '{}');

    document.getElementById('statDashes').textContent =
        (stats.dashCount || 0).toLocaleString();
    document.getElementById('statDeaths').textContent =
        (stats.deathCount || 0).toLocaleString();
    document.getElementById('statBerries').textContent =
        (stats.berriesCollected || 0).toLocaleString();
    document.getElementById('statGoldenBerries').textContent =
        (stats.goldenBerriesCollected || 0).toLocaleString();

    // ── AI global stats ───────────────────────────────────────────────────────
    const ai = JSON.parse(localStorage.getItem('celeste_ai_global_stats') || '{}');

    document.getElementById('aiGeneration').textContent =
        ai.generation != null ? ai.generation.toLocaleString() : '--';
    document.getElementById('aiRunCount').textContent =
        ai.runCount != null ? ai.runCount.toLocaleString() : '--';
    document.getElementById('aiBestTime').textContent =
        ai.bestTimeMs != null ? `${(ai.bestTimeMs / 1000).toFixed(2)}s` : '--';
    document.getElementById('aiBestFit').textContent =
        ai.globalBestFit != null ? `${(ai.globalBestFit * 100).toFixed(1)}%` : '--';

    // ── Logout ────────────────────────────────────────────────────────────────
    document.getElementById('logoutButton').addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = window.location.protocol === 'file:'
            ? '../webSite/index.html' : '/index.html';
    });
});

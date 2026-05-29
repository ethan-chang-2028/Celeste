document.addEventListener('DOMContentLoaded', async () => {
    const D = window.ApexData;

    // ── Adjust auth links if already logged in ────────────────────────────────
    const user = D.currentUser();
    if (user) {
        const authLink = document.getElementById('authLink');
        if (authLink) { authLink.textContent = user.username; authLink.href = '/profile.html'; }
        const loginCta = document.getElementById('loginCta');
        if (loginCta) { loginCta.textContent = 'My Profile'; loginCta.href = '/profile.html'; }
        const reg = document.getElementById('registerCta');
        if (reg) { reg.textContent = 'Continue Playing'; reg.href = '/game.html'; }
    }

    // ── Top-times snapshot (best time per player+level, fastest 5) ────────────
    const body = document.getElementById('snapshotBody');
    try {
        const runs = await D.fetchRuns();
        const top = runs.slice().sort((a, b) => a.completionTime - b.completionTime).slice(0, 5);

        if (!top.length) {
            body.innerHTML = '<tr><td colspan="4" style="color:#7a82a6">No runs recorded yet. Be the first!</td></tr>';
            return;
        }

        body.innerHTML = top.map((r, i) => {
            const id = D.runIdentity(r);
            return `<tr>
                <td class="rank">${i + 1}</td>
                <td>${D.avatarEmoji(id.avatar)} ${escapeHtml(id.username)}</td>
                <td>${escapeHtml(D.levelName(r.levelId))}</td>
                <td class="time">${r.completionTime.toFixed(2)}s</td>
            </tr>`;
        }).join('');
    } catch (_) {
        body.innerHTML = '<tr><td colspan="4" style="color:#7a82a6">Could not load times.</td></tr>';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
});

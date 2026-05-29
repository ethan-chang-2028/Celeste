document.addEventListener('DOMContentLoaded', () => {
    const registerForm  = document.getElementById('registerForm');
    const errorMessage  = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    function getLocalUsers() {
        return JSON.parse(localStorage.getItem('registeredUsers') || '[]');
    }

    function localRegister({ username, email, password, country, avatar }) {
        const existing = getLocalUsers();
        if (existing.find(u => u.username === username)) {
            return { ok: false, message: 'Username is already taken.' };
        }
        if (existing.find(u => u.email === email)) {
            return { ok: false, message: 'An account with that email already exists.' };
        }
        const newUser = {
            id: 'u-' + Math.random().toString(36).slice(2, 8),
            username, email, password, country, avatar,
            role: 'player', bio: '', deathCount: 0,
            bestTimes: {}, levelsCompleted: 0, achievements: [],
            rank: null, registeredAt: new Date().toISOString(), lastLogin: null
        };
        existing.push(newUser);
        localStorage.setItem('registeredUsers', JSON.stringify(existing));
        return { ok: true };
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.style.display  = 'none';
        successMessage.style.display = 'none';

        const username = document.getElementById('usernameInput').value.trim();
        const email    = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        const country  = document.getElementById('countryInput').value.trim();
        const avatar   = document.getElementById('avatarInput').value;

        // Try server first, fall back to localStorage
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, country, avatar }),
                signal: controller.signal
            });
            clearTimeout(timer);

            const data = await res.json();
            if (res.ok) {
                // Mirror the account into localStorage too, so it survives even if
                // the server's data file is later reset (ephemeral/autoscale
                // container) and so login can always fall back to it.
                localRegister({ username, email, password, country, avatar });
                successMessage.textContent = 'Account created! Redirecting to login...';
                successMessage.style.display = 'block';
                setTimeout(() => { window.location.href = '/'; }, 1500);
                return;
            }
            errorMessage.textContent = data.message || 'Registration failed.';
            errorMessage.style.display = 'block';
            return;
        } catch (_) {
            // Server unreachable — use local fallback
        }

        const result = localRegister({ username, email, password, country, avatar });
        if (result.ok) {
            successMessage.textContent = 'Account created! Redirecting to login...';
            successMessage.style.display = 'block';
            const loginUrl = window.location.protocol === 'file:'
                ? 'index.html'
                : '/';
            setTimeout(() => { window.location.href = loginUrl; }, 1500);
        } else {
            errorMessage.textContent = result.message;
            errorMessage.style.display = 'block';
        }
    });
});

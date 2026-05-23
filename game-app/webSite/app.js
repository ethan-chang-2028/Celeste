document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    // Built-in test account (works without a server)
    const seedUsers = [
        { id: 'u-4f2a9c', username: 'SkyDasher99', email: 'sky@example.com',
          password: 'testpassword123', role: 'player', country: '', avatar: 'Madeline' }
    ];

    function getLocalUsers() {
        return JSON.parse(localStorage.getItem('registeredUsers') || '[]');
    }

    function localLogin(identifier, password) {
        const allUsers = [...seedUsers, ...getLocalUsers()];
        const found = allUsers.find(u =>
            (u.username === identifier || u.email === identifier) && u.password === password
        );
        if (!found) return null;
        const { password: _pw, ...safeUser } = found;
        return safeUser;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.style.display = 'none';

        const identifier = document.getElementById('usernameInput').value.trim();
        const password   = document.getElementById('passwordInput').value;

        // Try server first, fall back to localStorage
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: identifier, password }),
                signal: controller.signal
            });
            clearTimeout(timer);

            const data = await res.json();
            if (res.ok) {
                sessionStorage.setItem('loggedInUser', JSON.stringify(data.user));
                window.location.href = '/profile';
                return;
            }
            errorMessage.textContent = data.message || 'Invalid username or password.';
            errorMessage.style.display = 'block';
            return;
        } catch (_) {
            // Server unreachable — use local fallback
        }

        const user = localLogin(identifier, password);
        if (user) {
            sessionStorage.setItem('loggedInUser', JSON.stringify(user));
            // Redirect: prefer server route, fall back to relative path
            window.location.href = window.location.protocol === 'file:'
                ? '../profile/profile.html'
                : '/profile';
        } else {
            errorMessage.textContent = 'Invalid username or password.';
            errorMessage.style.display = 'block';
        }
    });
});

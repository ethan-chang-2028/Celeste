// game-app/webSite/app.js
//
// Browser UI logic — uses CelesteBridge (loaded from /js-bridge.js)
// instead of raw fetch calls so all languages share the same protocol.

const bridge = new CelesteBridge("browser");

// ── DOM references ────────────────────────────────────────────────────────────

const loginView     = document.getElementById('login-view');
const registerView  = document.getElementById('register-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm     = document.getElementById('login-form');
const registerForm  = document.getElementById('register-form');
const logoutBtn     = document.getElementById('logout-btn');
const loginError    = document.getElementById('login-error');
const registerMsg   = document.getElementById('register-msg');
const userDisplay   = document.getElementById('user-display');

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', updateUI);

// ── Navigation ────────────────────────────────────────────────────────────────

document.getElementById('show-register-btn').addEventListener('click', () => {
    loginView.style.display    = 'none';
    registerView.style.display = 'block';
    loginError.textContent     = '';
});

document.getElementById('show-login-btn').addEventListener('click', () => {
    registerView.style.display = 'none';
    loginView.style.display    = 'block';
    registerMsg.textContent    = '';
});

// ── Register ──────────────────────────────────────────────────────────────────

registerForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const data = await bridge.register(username, password);
        registerMsg.style.color = 'green';
        registerMsg.textContent = data.message + ' You can now log in.';
        registerForm.reset();
    } catch (err) {
        registerMsg.style.color = 'red';
        registerMsg.textContent = err.message || 'Server error. Is Node.js running?';
    }
});

// ── Login ─────────────────────────────────────────────────────────────────────

loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const data = await bridge.login(username, password);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('username', username);
        loginForm.reset();
        loginError.textContent = '';
        updateUI();
    } catch (err) {
        loginError.textContent = err.message || 'Server error. Is Node.js running?';
    }
});

// ── Logout ────────────────────────────────────────────────────────────────────

logoutBtn.addEventListener('click', function () {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    updateUI();
});

// ── UI state ──────────────────────────────────────────────────────────────────

function updateUI() {
    const isLoggedIn      = localStorage.getItem('isLoggedIn');
    const storedUsername  = localStorage.getItem('username');

    if (isLoggedIn === 'true') {
        loginView.style.display     = 'none';
        registerView.style.display  = 'none';
        dashboardView.style.display = 'block';
        userDisplay.textContent     = storedUsername;
    } else {
        loginView.style.display     = 'block';
        registerView.style.display  = 'none';
        dashboardView.style.display = 'none';
    }
}

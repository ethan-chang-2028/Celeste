// HTML Elements
const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const dashboardView = document.getElementById('dashboard-view');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');

const loginError = document.getElementById('login-error');
const registerMsg = document.getElementById('register-msg');
const userDisplay = document.getElementById('user-display');

// Check login status on page load
document.addEventListener('DOMContentLoaded', updateUI);

// --- NAVIGATION BETWEEN FORMS ---
document.getElementById('show-register-btn').addEventListener('click', () => {
    loginView.style.display = 'none';
    registerView.style.display = 'block';
    loginError.textContent = '';
});

document.getElementById('show-login-btn').addEventListener('click', () => {
    registerView.style.display = 'none';
    loginView.style.display = 'block';
    registerMsg.textContent = '';
});

// --- REGISTER LOGIC ---
registerForm.addEventListener('submit', async function(event) {
    event.preventDefault(); 

    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const response = await fetch('http://localhost:3000/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            registerMsg.style.color = "green";
            registerMsg.textContent = data.message + " You can now log in.";
            registerForm.reset();
        } else {
            registerMsg.style.color = "red";
            registerMsg.textContent = data.message; // E.g., "Username taken"
        }
    } catch (error) {
        registerMsg.style.color = "red";
        registerMsg.textContent = "Server error. Is Node.js running?";
    }
});

// --- LOGIN LOGIC ---
loginForm.addEventListener('submit', async function(event) {
    event.preventDefault(); 

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Login successful! Save state and update screen
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', username);
            loginForm.reset();
            loginError.textContent = '';
            updateUI();
        } else {
            // Login failed (wrong password or user doesn't exist)
            loginError.textContent = data.message;
        }
    } catch (error) {
        loginError.textContent = "Server error. Is Node.js running?";
    }
});

// --- LOGOUT LOGIC ---
logoutBtn.addEventListener('click', function() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    updateUI();
});

// --- UI UPDATE LOGIC ---
function updateUI() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const storedUsername = localStorage.getItem('username');

    if (isLoggedIn === 'true') {
        loginView.style.display = 'none';
        registerView.style.display = 'none';
        dashboardView.style.display = 'block';
        userDisplay.textContent = storedUsername; 
    } else {
        loginView.style.display = 'block';
        registerView.style.display = 'none';
        dashboardView.style.display = 'none';
    }
}
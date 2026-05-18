// Dummy credentials for demonstration 
const VALID_USERNAME = "admin";
const VALID_PASSWORD = "pass123";

// Grab elements from the HTML
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const errorMsg = document.getElementById('error-msg');
const userDisplay = document.getElementById('user-display');

// 1. Check if the user is already logged in when the page loads
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
});

// 2. Handle the Login Process
loginForm.addEventListener('submit', function(event) {
    event.preventDefault(); // Stop the form from refreshing the page

    // Get what the user typed in
    const enteredUsername = document.getElementById('username').value;
    const enteredPassword = document.getElementById('password').value;

    // Check if credentials match
    if (enteredUsername === VALID_USERNAME && enteredPassword === VALID_PASSWORD) {
        // Save login state to browser storage
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('username', enteredUsername);

        // Clear out the form and any errors
        loginForm.reset();
        errorMsg.textContent = '';

        // Switch the view to the dashboard
        updateUI();
    } else {
        // Show an error message
        errorMsg.textContent = "Invalid username or password!";
    }
});

// 3. Handle the Logout Process
logoutBtn.addEventListener('click', function() {
    // Remove login state from browser storage
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');

    // Switch the view back to the login screen
    updateUI();
});

// 4. Function to toggle between Login and Dashboard views
function updateUI() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const storedUsername = localStorage.getItem('username');

    if (isLoggedIn === 'true') {
        // User is logged in: Hide login form, show dashboard
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        userDisplay.textContent = storedUsername; 
    } else {
        // User is logged out: Show login form, hide dashboard
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
    }
}
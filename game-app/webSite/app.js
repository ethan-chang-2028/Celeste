document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    // Hardcoded dummy data instead of fetching account.json
    const users = [
        {
            "id": "u-4f2a9c",
            "username": "SkyDasher99",
            "email": "sky@example.com",
            "passwordHash": "testpassword123", 
            "role": "player"
        }
    ];

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Stop page refresh

        const usernameInput = document.getElementById('usernameInput').value;
        const passwordInput = document.getElementById('passwordInput').value;

        // Check if credentials match our hardcoded data
        const foundUser = users.find(user => 
            (user.username === usernameInput || user.email === usernameInput) && 
            user.passwordHash === passwordInput
        );

        if (foundUser) {
            sessionStorage.setItem('loggedInUser', JSON.stringify(foundUser));

            window.location.href = '../profile/profile.html';
        } else {
            errorMessage.textContent = "Invalid username or password.";
            errorMessage.style.display = "block";
        }
    });
});
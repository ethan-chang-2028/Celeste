document.addEventListener('DOMContentLoaded', () => {
    // 1. Check if the user is actually logged in!
    // We get the data we saved in app.js
    const loggedInUserData = sessionStorage.getItem('loggedInUser');

    if (!loggedInUserData) {
        const loginUrl = window.location.protocol === 'file:'
            ? '../webSite/index.html'
            : '/';
        window.location.href = loginUrl;
        return;
    }

    // 2. Parse the JSON string back into a JavaScript object
    const user = JSON.parse(loggedInUserData);

    // 3. Update the HTML with the user's information
    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('displayEmail').textContent = user.email;

    // Capitalize the first letter of their role (e.g., "player" -> "Player")
    const roleStr = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    document.getElementById('displayRole').textContent = roleStr;

    // NOTE: For now, the stats are just hardcoded in the HTML. 
    // Later in your 2-week sprint, when you hook up your C# WebAssembly game logic, 
    // you can save their actual game stats to users.json and load them here!

    // 4. Handle Logging out
    const logoutButton = document.getElementById('logoutButton');
    logoutButton.addEventListener('click', () => {
        // Clear the saved user data
        sessionStorage.removeItem('loggedInUser');

        const loginUrl = window.location.protocol === 'file:'
            ? '../webSite/index.html'
            : '/';
        window.location.href = loginUrl;
    });
});
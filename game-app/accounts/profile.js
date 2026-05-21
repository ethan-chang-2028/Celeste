// 1. ROUTE GUARD: Check if the user is actually logged in
const currentUsername = localStorage.getItem("username");
const isLoggedIn = localStorage.getItem("isLoggedIn");

if (isLoggedIn !== "true" || !currentUsername) {
    // If not logged in, kick them back to the login page
    window.location.href = "../webSite/index.html"; 
}

// Layout view vs edit toggles
const viewMode = document.getElementById("view-mode");
const editForm = document.getElementById("edit-form");

// DOM elements for display
const displayUsername = document.getElementById("display-username");
const displayAvatar = document.getElementById("display-avatar");
const displayCountry = document.getElementById("display-country");
const displayBio = document.getElementById("display-bio");

// Form inputs
const editUsernameInput = document.getElementById("edit-username");
const editAvatarInput = document.getElementById("edit-avatar");
const editCountryInput = document.getElementById("edit-country");
const editBioInput = document.getElementById("edit-bio");

// 2. LOAD USER PROFILE ON PAGE LOAD
function loadUserProfile() {
    let users = JSON.parse(localStorage.getItem("database_users")) || [];
    // Find the current logged in user profile
    let currentUser = users.find(u => u.username === currentUsername);

    if (currentUser) {
        // Display data or use clean fallbacks if they haven't set them yet
        displayUsername.textContent = currentUser.username;
        displayAvatar.src = currentUser.avatar || "/avatars/default.png";
        displayCountry.textContent = currentUser.country || "Not Specified";
        displayBio.textContent = currentUser.bio || "No bio written yet.";

        // Pre-fill form inputs so they are ready when clicking "Edit"
        editUsernameInput.value = currentUser.username;
        editAvatarInput.value = currentUser.avatar || "/avatars/Madeline.png";
        editCountryInput.value = currentUser.country || "United States";
        editBioInput.value = currentUser.bio || "";
    }
}

// Trigger data load when the page is ready
document.addEventListener("DOMContentLoaded", loadUserProfile);

// Toggle visibility buttons
document.getElementById("edit-btn").addEventListener("click", () => {
    viewMode.classList.add("hidden");
    editForm.classList.remove("hidden");
});

document.getElementById("cancel-btn").addEventListener("click", () => {
    editForm.classList.add("hidden");
    viewMode.classList.remove("hidden");
});

// 3. HANDLE SAVING CHANGES
editForm.addEventListener("submit", function(e) {
    e.preventDefault();

    const newUsername = editUsernameInput.value.trim();
    const updatedData = {
        avatar: editAvatarInput.value,
        country: editCountryInput.value,
        bio: editBioInput.value
    };

    // Rule check: 3-20 chars alphanumeric for username
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
        alert("Username must be 3–20 characters, alphanumeric and underscores only.");
        return;
    }

    let users = JSON.parse(localStorage.getItem("database_users")) || [];

    // Check if they are trying to change their username to something already taken by someone else
    const usernameTaken = users.some(u => u.username === newUsername && u.username !== currentUsername);
    if (usernameTaken) {
        alert("That username is already taken!");
        return;
    }

    // Find our current user index inside the database array and update them
    const userIndex = users.findIndex(u => u.username === currentUsername);
    if (userIndex !== -1) {
        users[userIndex].username = newUsername;
        users[userIndex].avatar = updatedData.avatar;
        users[userIndex].country = updatedData.country;
        users[userIndex].bio = updatedData.bio;

        // Save the updated array back to Local Storage
        localStorage.setItem("database_users", JSON.stringify(users));

        // Make sure active session updates to the new username if they changed it
        localStorage.setItem("username", newUsername);

        // Refresh page to instantly show updated values cleanly
        window.location.reload();
    }
});
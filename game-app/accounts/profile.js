// Sample active session tracking (established upon successful login)
let currentUserId = sessionStorage.getItem("loggedInUserId"); 

// Toggle View vs Edit Layout elements
const viewMode = document.getElementById("view-mode");
const editForm = document.getElementById("edit-form");

document.getElementById("edit-btn").addEventListener("click", () => {
    viewMode.classList.add("hidden");
    editForm.classList.remove("hidden");
});

document.getElementById("cancel-btn").addEventListener("click", () => {
    editForm.classList.add("hidden");
    viewMode.classList.remove("hidden");
});

// Handle saving changes
editForm.addEventListener("submit", function(e) {
    e.preventDefault();

    const updatedData = {
        username: document.getElementById("edit-username").value,
        avatar: document.getElementById("edit-avatar").value,
        country: document.getElementById("edit-country").value,
        bio: document.getElementById("edit-bio").value
    };

    // Rule check: 3-20 chars alphanumeric for username
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(updatedData.username)) {
        alert("Username must be 3–20 characters, alphanumeric and underscores only."); [cite: 589]
        return;
    }

    // Persist to users.json (via your platform file handling service)
    saveUserDataToJSON(currentUserId, updatedData); [cite: 585]

    // Immediately update UI view
    document.getElementById("display-username").textContent = updatedData.username;
    document.getElementById("display-avatar").src = updatedData.avatar;
    document.getElementById("display-country").textContent = updatedData.country;
    document.getElementById("display-bio").textContent = updatedData.bio;

    // Switch back to read-only view mode
    editForm.classList.add("hidden");
    viewMode.classList.remove("hidden");
});
async function handleAuth(type) {
  // Grab the values from your HTML inputs
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Make sure they aren't blank
  if (!username || !password) {
    alert("Please fill in both fields");
    return;
  }

  try {
    // Send the data to your server (/login or /register)
    const response = await fetch(`/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const message = await response.text();

    if (response.ok) {
      alert(message); // Shows "Login successful!" or "Account created!"

      if (type === 'login') {
        // Redirect the user to the game page
        window.location.href = '/profile.html';
      }
    } else {
      // Shows error if password is wrong or user exists
      alert("Error: " + message); 
    }
  } catch (error) {
    console.error("Auth Error:", error);
    alert("Something went wrong communicating with the server.");
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/logout', { method: 'POST' });
    if (response.ok) {
      // Send them back to the login screen
      window.location.href = '/index.html'; 
    }
  } catch (error) {
    console.error("Logout Error:", error);
  }
}
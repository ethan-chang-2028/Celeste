document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const usernameInput = document.getElementById('usernameInput').value.trim();
        const passwordInput = document.getElementById('passwordInput').value;

        errorMessage.style.display = 'none';

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput, password: passwordInput })
            });

            const data = await res.json();

            if (res.ok) {
                sessionStorage.setItem('loggedInUser', JSON.stringify(data.user));
                window.location.href = '/profile';
            } else {
                errorMessage.textContent = data.message || 'Invalid username or password.';
                errorMessage.style.display = 'block';
            }
        } catch (err) {
            errorMessage.textContent = 'Could not reach the server. Is it running?';
            errorMessage.style.display = 'block';
        }
    });
});

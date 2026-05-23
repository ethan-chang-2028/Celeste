document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';

        const username = document.getElementById('usernameInput').value.trim();
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        const country = document.getElementById('countryInput').value.trim();
        const avatar = document.getElementById('avatarInput').value;

        try {
            const res = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, country, avatar })
            });

            const data = await res.json();

            if (res.ok) {
                successMessage.textContent = 'Account created! Redirecting to login...';
                successMessage.style.display = 'block';
                setTimeout(() => { window.location.href = '/'; }, 1500);
            } else {
                errorMessage.textContent = data.message || 'Registration failed.';
                errorMessage.style.display = 'block';
            }
        } catch (err) {
            errorMessage.textContent = 'Could not reach the server. Is it running?';
            errorMessage.style.display = 'block';
        }
    });
});

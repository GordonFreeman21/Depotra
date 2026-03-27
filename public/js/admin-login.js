// admin-login.js
// Handles admin login via the backend API

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const error = document.getElementById('loginError');
  const submitBtn = this.querySelector('button[type="submit"]');

  error.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      error.textContent = data.message || 'Invalid username or password.';
      error.className = 'error-text';
      return;
    }

    localStorage.setItem('depotra_admin', JSON.stringify({
      id: data.id || '',
      username: data.username,
      token: data.token,
      loginAt: new Date().toISOString()
    }));

    window.location.href = 'admin-dashboard.html';
  } catch {
    error.textContent = 'Connection error. Please try again.';
    error.className = 'error-text';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }
});

// admin-login.js
// Handles admin login using localStorage

document.getElementById('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const error = document.getElementById('loginError');

  const admin = window.depotraStorage.findAdmin(username);
  if (!admin || admin.password !== password) {
    error.textContent = 'Invalid username or password.';
    error.className = 'error-text';
    return;
  }

  // Save login state (for demo: localStorage)
  localStorage.setItem('depotra_admin', JSON.stringify({
    id: admin.id,
    username: admin.username,
    loginAt: new Date().toISOString()
  }));

  window.location.href = 'admin-dashboard.html';
});

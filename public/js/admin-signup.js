// admin-signup.js
// Handles admin signup using localStorage

document.getElementById('signupForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const message = document.getElementById('signupMessage');

  if (password !== confirmPassword) {
    message.textContent = 'Passwords do not match.';
    message.className = 'error-text';
    return;
  }

  if (!username || !password) {
    message.textContent = 'Username and password are required.';
    message.className = 'error-text';
    return;
  }

  const existing = window.depotraStorage.findAdmin(username);
  if (existing) {
    message.textContent = 'Username already exists.';
    message.className = 'error-text';
    return;
  }

  window.depotraStorage.addAdmin({
    id: crypto.randomUUID(),
    username,
    password, // NOTE: Insecure, for demo only!
    createdAt: new Date().toISOString()
  });

  message.textContent = 'Admin account created successfully!';
  message.className = 'success-text';
  setTimeout(() => {
    window.location.href = 'admin-login.html';
  }, 1200);
});

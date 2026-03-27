// admin-signup.js
// Admin account creation has moved to the Admin Dashboard.
// Redirect logged-in admins to the dashboard; show access denied to everyone else.

(function () {
  const adminRaw = localStorage.getItem('depotra_admin');
  if (adminRaw) {
    try {
      JSON.parse(adminRaw);
      // Already logged in – go to the dashboard where admins can be created
      window.location.href = 'admin-dashboard.html';
    } catch { /* malformed data, stay on the access-denied page */ }
  }
  // Not logged in – the static HTML already shows the access-denied message
})();

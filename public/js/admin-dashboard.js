// admin-dashboard.js

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

function requireAdmin() {
  const adminRaw = localStorage.getItem('depotra_admin');
  if (!adminRaw) {
    window.location.href = 'admin-login.html';
    return null;
  }
  try {
    const admin = JSON.parse(adminRaw);
    if (!admin || !admin.token) {
      localStorage.removeItem('depotra_admin');
      window.location.href = 'admin-login.html';
      return null;
    }
    return admin;
  } catch {
    window.location.href = 'admin-login.html';
    return null;
  }
}

const currentAdmin = requireAdmin();
if (currentAdmin) {
  document.getElementById('adminUsername').textContent = currentAdmin.username;
}

function authHeaders() {
  const token = currentAdmin && currentAdmin.token;
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── DOM references ──────────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logoutBtn');
const addGameBtn = document.getElementById('addGameBtn');
const gameModal = document.getElementById('gameModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const gameForm = document.getElementById('gameForm');
const gamesTableBody = document.getElementById('gamesTableBody');
const dashboardSearch = document.getElementById('dashboardSearch');
const dashboardEmpty = document.getElementById('dashboardEmpty');
const toastContainer = document.getElementById('toastContainer');
const sortButtons = Array.from(document.querySelectorAll('.sort-btn'));
const fetchSteamBtn = document.getElementById('fetchSteamBtn');
const dashboardLoading = document.getElementById('dashboardLoading');
const totalGames = document.getElementById('totalGames');
const featuredGames = document.getElementById('featuredGames');
const recentGames = document.getElementById('recentGames');
const missingImages = document.getElementById('missingImages');
const selectAll = document.getElementById('selectAll');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const bulkCount = document.getElementById('bulkCount');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const createAdminBtn = document.getElementById('createAdminBtn');
const createAdminModal = document.getElementById('createAdminModal');
const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
const cancelAdminModalBtn = document.getElementById('cancelAdminModalBtn');
const createAdminForm = document.getElementById('createAdminForm');
const confirmModal = document.getElementById('confirmModal');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmMessage = document.getElementById('confirmMessage');
const statusFilterBtns = document.querySelectorAll('.filter-btn');

// ── State ────────────────────────────────────────────────────────────────────
let sortState = { key: 'updatedAt', dir: 'desc' };
let activeFilter = 'all';
let confirmCallback = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success', actionLabel = '', onAction = null) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'error' ? '⚠' : '✓'}</span>
    <span>${escapeHtml(message)}</span>
    ${actionLabel ? `<button type="button" class="btn btn-blue toast-action">${escapeHtml(actionLabel)}</button>` : ''}
  `;

  if (actionLabel && onAction) {
    toast.querySelector('.toast-action').addEventListener('click', () => {
      onAction();
      toast.remove();
    });
  }

  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function statusChip(game) {
  const complete = game.title && game.description && game.downloadLink;
  if (game.featured) {
    return '<span class="chip chip-featured">Featured</span>';
  }
  if (complete) {
    return '<span class="chip chip-complete">Complete</span>';
  }
  return '<span class="chip chip-draft">Draft</span>';
}

function getGameStatus(game) {
  if (game.featured) return 'featured';
  if (game.title && game.description && game.downloadLink) return 'complete';
  return 'draft';
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function confirmAction(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = okLabel;
    confirmModal.classList.remove('hidden');
    confirmCallback = (result) => {
      confirmModal.classList.add('hidden');
      resolve(result);
    };
  });
}

confirmOkBtn.addEventListener('click', () => confirmCallback && confirmCallback(true));
confirmCancelBtn.addEventListener('click', () => confirmCallback && confirmCallback(false));
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) confirmCallback && confirmCallback(false);
});

// ── Game Modal ────────────────────────────────────────────────────────────────
function openModal() {
  gameModal.classList.remove('hidden');
}

function closeModal() {
  gameModal.classList.add('hidden');
  gameForm.reset();
  document.getElementById('gameId').value = '';
  document.getElementById('onlineFixLinkRow').classList.add('hidden');
  document.getElementById('genericFixLinkRow').classList.add('hidden');
}

function getGames() {
  return window.depotraStorage.listGames();
}

async function saveGame(formData) {
  // Empty id → POST (create new game); non-empty id → PUT (update existing game)
  const id = formData.get('gameId') || '';
  const tags = String(formData.get('tags') || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

  const payload = {
    steamAppId: String(formData.get('steamAppId') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    imageUrl: String(formData.get('imageUrl') || '').trim(),
    downloadLink: String(formData.get('downloadLink') || '').trim(),
    genre: String(formData.get('genre') || '').trim(),
    developer: String(formData.get('developer') || '').trim(),
    publisher: String(formData.get('publisher') || '').trim(),
    releaseDate: String(formData.get('releaseDate') || '').trim(),
    tags,
    featured: formData.get('featured') === 'on',
    onlineFix: formData.get('onlineFix') === 'yes',
    onlineFixLink: String(formData.get('onlineFixLink') || '').trim(),
    genericFix: formData.get('genericFix') === 'yes',
    genericFixLink: String(formData.get('genericFixLink') || '').trim()
  };

  const url = id ? `/api/admin/games/${encodeURIComponent(id)}` : '/api/admin/games';
  const method = id ? 'PUT' : 'POST';

  const response = await fetch(url, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Failed to save game (${response.status})`);
  }

  const savedGame = await response.json();

  // Sync localStorage with full API response (includes steamData with metacritic)
  const existing = window.depotraStorage.findGameById(savedGame.id);
  if (existing) {
    window.depotraStorage.updateGame(savedGame.id, savedGame);
  } else {
    window.depotraStorage.addGame(savedGame);
  }

  return savedGame;
}

function fillForm(game) {
  document.getElementById('gameId').value = game.id || '';
  document.getElementById('steamAppId').value = game.steamAppId || '';
  document.getElementById('title').value = game.title || '';
  document.getElementById('description').value = game.description || '';
  document.getElementById('imageUrl').value = game.imageUrl || '';
  document.getElementById('downloadLink').value = game.downloadLink || '';
  document.getElementById('genre').value = game.genre || '';
  document.getElementById('developer').value = game.developer || '';
  document.getElementById('publisher').value = game.publisher || '';
  document.getElementById('releaseDate').value = game.releaseDate || '';
  document.getElementById('tags').value = Array.isArray(game.tags) ? game.tags.join(', ') : '';
  document.getElementById('featured').checked = Boolean(game.featured);

  const onlineFixSelect = document.getElementById('onlineFix');
  onlineFixSelect.value = game.onlineFix ? 'yes' : 'no';
  document.getElementById('onlineFixLink').value = game.onlineFixLink || '';
  document.getElementById('onlineFixLinkRow').classList.toggle('hidden', !game.onlineFix);

  const genericFixSelect = document.getElementById('genericFix');
  genericFixSelect.value = game.genericFix ? 'yes' : 'no';
  document.getElementById('genericFixLink').value = game.genericFixLink || '';
  document.getElementById('genericFixLinkRow').classList.toggle('hidden', !game.genericFix);
}

// ── Sort Indicators ───────────────────────────────────────────────────────────
function getSortIcon(key) {
  if (sortState.key !== key) return ' ⇅';
  return sortState.dir === 'asc' ? ' ↑' : ' ↓';
}

function updateSortButtons() {
  sortButtons.forEach((btn) => {
    const key = btn.getAttribute('data-sort');
    if (!btn.dataset.label) {
      btn.dataset.label = btn.textContent.trim();
    }
    btn.textContent = btn.dataset.label + getSortIcon(key);
    btn.classList.toggle('sort-active', sortState.key === key);
  });
}

// ── Bulk Select ───────────────────────────────────────────────────────────────
function getSelectedIds() {
  return Array.from(document.querySelectorAll('.row-select:checked')).map((cb) => cb.getAttribute('data-id'));
}

function updateBulkBar() {
  const selected = getSelectedIds();
  const allCheckboxes = document.querySelectorAll('.row-select');

  if (selected.length > 0) {
    bulkDeleteBtn.classList.remove('hidden');
    bulkCount.textContent = String(selected.length);
  } else {
    bulkDeleteBtn.classList.add('hidden');
    bulkCount.textContent = '0';
  }

  selectAll.indeterminate = selected.length > 0 && selected.length < allCheckboxes.length;
  selectAll.checked = allCheckboxes.length > 0 && selected.length === allCheckboxes.length;
}

// ── Render Table ──────────────────────────────────────────────────────────────
function renderRows() {
  const term = dashboardSearch.value.trim().toLowerCase();
  const allGamesData = getGames();

  let games = allGamesData.filter((game) => {
    if (!term) return true;
    return (
      (game.title || '').toLowerCase().includes(term) ||
      (game.genre || '').toLowerCase().includes(term)
    );
  });

  if (activeFilter !== 'all') {
    games = games.filter((game) => getGameStatus(game) === activeFilter);
  }

  games.sort((a, b) => {
    const key = sortState.key;
    const dir = sortState.dir === 'asc' ? 1 : -1;

    if (key === 'featured') {
      return ((a.featured === b.featured) ? 0 : (a.featured ? 1 : -1)) * dir;
    }

    const av = String(a[key] || '').toLowerCase();
    const bv = String(b[key] || '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  // Stats always reflect ALL games, not the current filter
  totalGames.textContent = String(allGamesData.length);
  featuredGames.textContent = String(allGamesData.filter((g) => g.featured).length);
  recentGames.textContent = String(allGamesData.filter((g) => {
    const ts = Date.parse(g.createdAt || 0);
    return Number.isFinite(ts) && Date.now() - ts <= 7 * 24 * 60 * 60 * 1000;
  }).length);
  missingImages.textContent = String(allGamesData.filter((g) => !g.imageUrl).length);

  updateSortButtons();

  if (games.length === 0) {
    gamesTableBody.innerHTML = '';
    dashboardEmpty.classList.remove('hidden');
    updateBulkBar();
    return;
  }

  dashboardEmpty.classList.add('hidden');

  gamesTableBody.innerHTML = games.map((game) => `
    <tr>
      <td class="col-check">
        <input type="checkbox" class="row-select" data-id="${escapeHtml(game.id)}" />
      </td>
      <td><img class="game-thumb" src="${escapeHtml(game.imageUrl || '')}" alt="${escapeHtml(game.title || 'Game')}" /></td>
      <td>${escapeHtml(game.title || '')}</td>
      <td>${escapeHtml(game.genre || '')}</td>
      <td>${game.featured ? 'Yes' : 'No'}</td>
      <td>${statusChip(game)}</td>
      <td class="action-cell">
        <button class="btn btn-blue" data-action="edit" data-id="${escapeHtml(game.id)}" type="button">Edit</button>
        <button class="btn btn-red" data-action="delete" data-id="${escapeHtml(game.id)}" type="button">Delete</button>
        <button class="btn btn-copy" data-action="copy-link" data-link="${escapeHtml(game.downloadLink || '')}" type="button" title="Copy download link">⎘ Copy Link</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.row-select').forEach((cb) => {
    cb.addEventListener('change', updateBulkBar);
  });

  updateBulkBar();
}

// ── Event Listeners ───────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('depotra_admin');
  window.location.href = 'admin-login.html';
});

addGameBtn.addEventListener('click', () => {
  gameForm.reset();
  document.getElementById('gameId').value = '';
  document.getElementById('onlineFixLinkRow').classList.add('hidden');
  document.getElementById('genericFixLinkRow').classList.add('hidden');
  document.getElementById('modalTitle').textContent = 'Add Game';
  openModal();
});

closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

// Show/hide Online Fix link field
document.getElementById('onlineFix').addEventListener('change', function () {
  document.getElementById('onlineFixLinkRow').classList.toggle('hidden', this.value !== 'yes');
});

// Show/hide Generic Fix link field
document.getElementById('genericFix').addEventListener('change', function () {
  document.getElementById('genericFixLinkRow').classList.toggle('hidden', this.value !== 'yes');
});

gameModal.addEventListener('click', (event) => {
  if (event.target === gameModal) closeModal();
});

fetchSteamBtn.addEventListener('click', async () => {
  const appId = document.getElementById('steamAppId').value.trim();
  if (!appId) {
    showToast('Please enter a Steam App ID', 'error');
    return;
  }

  dashboardLoading.classList.remove('hidden');
  try {
    const response = await fetch(`/api/steam/details/${encodeURIComponent(appId)}`);
    if (!response.ok) {
      let msg = 'Failed to fetch Steam data';
      try {
        const err = await response.json();
        msg = err.message || msg;
      } catch { /* ignore */ }
      showToast(msg, 'error');
      return;
    }

    const data = await response.json();

    if (data.title) document.getElementById('title').value = data.title;
    if (data.description || data.shortDescription) {
      document.getElementById('description').value = data.description || data.shortDescription;
    }
    if (data.imageUrl) document.getElementById('imageUrl').value = data.imageUrl;
    if (data.genre) document.getElementById('genre').value = data.genre;
    if (data.developer) document.getElementById('developer').value = data.developer;
    if (data.publisher) document.getElementById('publisher').value = data.publisher;
    if (data.releaseDate) document.getElementById('releaseDate').value = data.releaseDate;
    if (Array.isArray(data.genres) && data.genres.length) {
      document.getElementById('tags').value = data.genres.join(', ');
    }

    showToast('Steam data loaded!');
  } catch {
    showToast('Error fetching Steam data', 'error');
  } finally {
    dashboardLoading.classList.add('hidden');
  }
});

gameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(gameForm);
  try {
    await saveGame(formData);
    showToast('Game saved successfully');
    closeModal();
    renderRows();
  } catch (error) {
    showToast(error.message || 'Failed to save game', 'error');
  }
});

dashboardSearch.addEventListener('input', debounce(renderRows, 300));

// Status filter
statusFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeFilter = btn.getAttribute('data-filter');
    statusFilterBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-filter') === activeFilter));
    renderRows();
  });
});

// Sort buttons
sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.getAttribute('data-sort');
    if (sortState.key === key) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.key = key;
      sortState.dir = 'asc';
    }
    renderRows();
  });
});

// Select all
selectAll.addEventListener('change', () => {
  document.querySelectorAll('.row-select').forEach((cb) => {
    cb.checked = selectAll.checked;
  });
  updateBulkBar();
});

// Bulk delete
bulkDeleteBtn.addEventListener('click', async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;

  const confirmed = await confirmAction(
    `Delete ${ids.length} selected game${ids.length !== 1 ? 's' : ''}? This cannot be undone.`
  );
  if (!confirmed) return;

  let failed = 0;
  for (const id of ids) {
    try {
      const response = await fetch(`/api/admin/games/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (response.ok) {
        window.depotraStorage.deleteGame(id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  if (failed > 0) {
    showToast(`${failed} game${failed !== 1 ? 's' : ''} could not be deleted`, 'error');
  } else {
    showToast(`${ids.length} game${ids.length !== 1 ? 's' : ''} deleted`);
  }
  renderRows();
});

// Export CSV
exportCsvBtn.addEventListener('click', () => {
  const games = getGames();
  if (games.length === 0) {
    showToast('No games to export', 'error');
    return;
  }

  const headers = ['ID', 'Title', 'Genre', 'Developer', 'Publisher', 'Release Date', 'Featured', 'Download Link', 'Image URL', 'Tags', 'Created At'];
  const rows = games.map((g) =>
    [
      g.id || '',
      g.title || '',
      g.genre || '',
      g.developer || '',
      g.publisher || '',
      g.releaseDate || '',
      g.featured ? 'Yes' : 'No',
      g.downloadLink || '',
      g.imageUrl || '',
      Array.isArray(g.tags) ? g.tags.join('; ') : '',
      g.createdAt || ''
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `depotra-games-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Games exported to CSV');
});

// Table row actions (edit / delete / copy-link)
gamesTableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.getAttribute('data-action');
  const gameId = button.getAttribute('data-id');

  if (action === 'copy-link') {
    const link = button.getAttribute('data-link');
    if (!link) {
      showToast('No download link available', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast('Download link copied!');
    } catch {
      showToast('Failed to copy link', 'error');
    }
    return;
  }

  const game = window.depotraStorage.findGameById(gameId);
  if (!game) return;

  if (action === 'edit') {
    document.getElementById('modalTitle').textContent = 'Edit Game';
    fillForm(game);
    openModal();
    return;
  }

  if (action === 'delete') {
    const confirmed = await confirmAction(`Delete "${game.title || 'this game'}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/games/${encodeURIComponent(gameId)}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        showToast(err.message || `Failed to delete game (${response.status})`, 'error');
        return;
      }
    } catch {
      showToast('Failed to delete game', 'error');
      return;
    }

    window.depotraStorage.deleteGame(gameId);
    showToast('Game deleted');
    renderRows();
  }
});

// ── Create Admin Modal ────────────────────────────────────────────────────────
function openAdminModal() {
  createAdminForm.reset();
  document.getElementById('createAdminMessage').textContent = '';
  createAdminModal.classList.remove('hidden');
}

function closeAdminModal() {
  createAdminModal.classList.add('hidden');
  createAdminForm.reset();
  document.getElementById('createAdminMessage').textContent = '';
}

createAdminBtn.addEventListener('click', openAdminModal);
closeAdminModalBtn.addEventListener('click', closeAdminModal);
cancelAdminModalBtn.addEventListener('click', closeAdminModal);
createAdminModal.addEventListener('click', (e) => {
  if (e.target === createAdminModal) closeAdminModal();
});

createAdminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('newAdminUsername').value.trim();
  const password = document.getElementById('newAdminPassword').value;
  const confirmPwd = document.getElementById('newAdminConfirmPassword').value;
  const msgEl = document.getElementById('createAdminMessage');
  const submitBtn = createAdminForm.querySelector('button[type="submit"]');

  msgEl.textContent = '';
  msgEl.className = 'muted';

  if (password !== confirmPwd) {
    msgEl.textContent = 'Passwords do not match.';
    msgEl.className = 'error-text';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  try {
    const response = await fetch('/api/admin/signup', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      msgEl.textContent = data.message || 'Failed to create admin account.';
      msgEl.className = 'error-text';
      return;
    }

    msgEl.textContent = 'Admin account created successfully!';
    msgEl.className = 'success-text';
    setTimeout(() => {
      closeAdminModal();
      showToast(`Admin "${username}" created`);
    }, 1200);
  } catch {
    msgEl.textContent = 'Connection error. Please try again.';
    msgEl.className = 'error-text';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Admin';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await window.depotraStorage.refreshGamesFromApi();
  renderRows();
}

init();

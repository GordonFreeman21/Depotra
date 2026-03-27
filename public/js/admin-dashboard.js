// admin-dashboard.js

function requireAdmin() {
  const adminRaw = localStorage.getItem('vaportools_admin');
  if (!adminRaw) {
    window.location.href = 'admin-login.html';
    return null;
  }
  try {
    return JSON.parse(adminRaw);
  } catch {
    window.location.href = 'admin-login.html';
    return null;
  }
}

const currentAdmin = requireAdmin();
if (currentAdmin) {
  document.getElementById('adminUsername').textContent = currentAdmin.username;
}

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

const totalGames = document.getElementById('totalGames');
const featuredGames = document.getElementById('featuredGames');
const recentGames = document.getElementById('recentGames');
const missingImages = document.getElementById('missingImages');

let sortState = { key: 'updatedAt', dir: 'desc' };
let lastDeletedGame = null;
let lastDeletedIndex = -1;

function openModal() {
  gameModal.classList.remove('hidden');
}

function closeModal() {
  gameModal.classList.add('hidden');
  gameForm.reset();
  document.getElementById('gameId').value = '';
}

function getGames() {
  return window.vaporStorage.listGames();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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
  setTimeout(() => {
    toast.remove();
  }, 4500);
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

function saveGame(formData) {
  const id = formData.get('gameId') || crypto.randomUUID();
  const tags = String(formData.get('tags') || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

  const game = {
    id,
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
    uploadedBy: currentAdmin?.username || 'admin',
    updatedAt: new Date().toISOString()
  };

  const existing = window.vaporStorage.findGameById(id);
  if (existing) {
    game.createdAt = existing.createdAt || new Date().toISOString();
    window.vaporStorage.updateGame(id, { ...existing, ...game });
  } else {
    game.createdAt = new Date().toISOString();
    window.vaporStorage.addGame(game);
  }
}

function renderRows() {
  const term = dashboardSearch.value.trim().toLowerCase();
  const games = getGames().filter((game) => {
    if (!term) return true;
    return (game.title || '').toLowerCase().includes(term)
      || (game.genre || '').toLowerCase().includes(term);
  });

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

  totalGames.textContent = String(games.length);
  featuredGames.textContent = String(games.filter((game) => game.featured).length);
  recentGames.textContent = String(games.filter((game) => {
    const createdAt = Date.parse(game.createdAt || 0);
    return Number.isFinite(createdAt) && Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
  }).length);
  missingImages.textContent = String(games.filter((game) => !game.imageUrl).length);

  if (games.length === 0) {
    gamesTableBody.innerHTML = '';
    dashboardEmpty.classList.remove('hidden');
    return;
  }

  dashboardEmpty.classList.add('hidden');

  gamesTableBody.innerHTML = games.map((game) => `
    <tr>
      <td><img class="game-thumb" src="${game.imageUrl || ''}" alt="${escapeHtml(game.title || 'Game')}" /></td>
      <td>${escapeHtml(game.title || '')}</td>
      <td>${escapeHtml(game.genre || '')}</td>
      <td>${game.featured ? 'Yes' : 'No'}</td>
      <td>${statusChip(game)}</td>
      <td>
        <button class="btn btn-blue" data-action="edit" data-id="${game.id}">Edit</button>
        <button class="btn btn-red" data-action="delete" data-id="${game.id}">Delete</button>
      </td>
    </tr>
  `).join('');
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
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('vaportools_admin');
  window.location.href = 'admin-login.html';
});

addGameBtn.addEventListener('click', () => {
  gameForm.reset();
  document.getElementById('gameId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Game';
  openModal();
});

closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

gameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(gameForm);
  saveGame(formData);
  showToast('Game saved successfully');
  closeModal();
  renderRows();
});

dashboardSearch.addEventListener('input', renderRows);

gamesTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.getAttribute('data-action');
  const gameId = button.getAttribute('data-id');
  const game = window.vaporStorage.findGameById(gameId);
  if (!game) return;

  if (action === 'edit') {
    document.getElementById('modalTitle').textContent = 'Edit Game';
    fillForm(game);
    openModal();
    return;
  }

  if (action === 'delete') {
    const allGames = getGames();
    lastDeletedIndex = allGames.findIndex((item) => item.id === gameId);
    lastDeletedGame = window.vaporStorage.deleteGame(gameId);
    showToast('Game deleted', 'error', 'Undo', () => {
      if (!lastDeletedGame) {
        return;
      }
      const db = window.vaporStorage.getDatabase();
      db.games.splice(Math.max(0, lastDeletedIndex), 0, lastDeletedGame);
      window.vaporStorage.setDatabase(db);
      renderRows();
      showToast('Game restored');
      lastDeletedGame = null;
      lastDeletedIndex = -1;
    });
    renderRows();
  }
});

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

gameModal.addEventListener('click', (event) => {
  if (event.target === gameModal) {
    closeModal();
  }
});

async function init() {
  await window.vaporStorage.hydrateGamesFromApi();
  renderRows();
}

init();

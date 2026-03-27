// storage.js
// Utility functions for localStorage-based admin and game management

const STORAGE_KEY = 'depotra_db';

// Migrate data from old 'vaportools_*' keys to new 'depotra_*' keys
(function migrateFromVaportools() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    const oldDb = localStorage.getItem('vaportools_db');
    if (oldDb) {
      localStorage.setItem(STORAGE_KEY, oldDb);
      localStorage.removeItem('vaportools_db');
    }
  } else {
    localStorage.removeItem('vaportools_db');
  }
  if (!localStorage.getItem('depotra_seeded_games') && localStorage.getItem('vaportools_seeded_games')) {
    localStorage.setItem('depotra_seeded_games', '1');
  }
  localStorage.removeItem('vaportools_seeded_games');
  if (!localStorage.getItem('depotra_admin')) {
    const oldAdmin = localStorage.getItem('vaportools_admin');
    if (oldAdmin) {
      localStorage.setItem('depotra_admin', oldAdmin);
      localStorage.removeItem('vaportools_admin');
    }
  } else {
    localStorage.removeItem('vaportools_admin');
  }
})();

function getDatabase() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { admins: [], games: [] };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { admins: [], games: [] };
  }
}

function setDatabase(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function addAdmin(admin) {
  const db = getDatabase();
  db.admins.push(admin);
  setDatabase(db);
}

function addGame(game) {
  const db = getDatabase();
  db.games.push(game);
  setDatabase(db);
}

function listGames() {
  const db = getDatabase();
  return Array.isArray(db.games) ? db.games : [];
}

function findAdmin(username) {
  const db = getDatabase();
  return db.admins.find(a => a.username === username);
}

function findGameById(id) {
  const db = getDatabase();
  return db.games.find(g => g.id === id);
}

function updateGame(id, newGame) {
  const db = getDatabase();
  const idx = db.games.findIndex(g => g.id === id);
  if (idx !== -1) {
    db.games[idx] = newGame;
    setDatabase(db);
    return true;
  }
  return false;
}

function deleteGame(id) {
  const db = getDatabase();
  const idx = db.games.findIndex(g => g.id === id);
  if (idx !== -1) {
    const deleted = db.games.splice(idx, 1);
    setDatabase(db);
    return deleted[0];
  }
  return null;
}

// Expose functions globally for use in HTML
window.depotraStorage = {
  getDatabase,
  setDatabase,
  addAdmin,
  addGame,
  listGames,
  findAdmin,
  findGameById,
  updateGame,
  deleteGame
};

// Ensure default admin exists
(function ensureDefaultAdmin() {
  const DEFAULT_ADMIN = {
    id: 'default-admin',
    username: 'admin',
    password: 'Coolgang57', // Insecure, demo only
    createdAt: new Date().toISOString()
  };
  const db = getDatabase();
  if (!db.admins.some(a => a.username === DEFAULT_ADMIN.username)) {
    db.admins.push(DEFAULT_ADMIN);
    setDatabase(db);
  }
})();

async function hydrateGamesFromApi() {
  const seededFlag = localStorage.getItem('depotra_seeded_games');
  const db = getDatabase();
  if (seededFlag || (Array.isArray(db.games) && db.games.length > 0)) {
    return;
  }

  try {
    const response = await fetch('/api/games');
    if (!response.ok) {
      return;
    }
    const games = await response.json();
    if (!Array.isArray(games) || games.length === 0) {
      return;
    }
    db.games = games;
    setDatabase(db);
    localStorage.setItem('depotra_seeded_games', '1');
  } catch {
    // ignore seed errors; app can still work with empty local data
  }
}

window.depotraStorage.hydrateGamesFromApi = hydrateGamesFromApi;

// main.js

const searchInput = document.getElementById('searchInput');
const genreFilter = document.getElementById('genreFilter');
const gamesGrid = document.getElementById('gamesGrid');
const gamesSkeleton = document.getElementById('gamesSkeleton');
const noGamesState = document.getElementById('noGamesState');
const featuredCarousel = document.getElementById('featuredCarousel');
const heroDots = document.getElementById('heroDots');

let heroTimer = null;
let heroIndex = 0;
let heroGames = [];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getGames() {
  return window.depotraStorage.listGames();
}

function getGenres(games) {
  const set = new Set();
  games.forEach((game) => {
    const genre = (game.genre || '').split(',').map((item) => item.trim()).filter(Boolean);
    genre.forEach((item) => set.add(item));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function showSkeletons() {
  gamesSkeleton.innerHTML = Array.from({ length: 8 }).map(() => `
    <article class="game-card shimmer-box skeleton-card">
      <div class="game-card-image"></div>
      <div class="game-card-body">
        <div class="skeleton-line lg"></div>
        <div class="skeleton-line sm"></div>
        <div class="skeleton-line md"></div>
      </div>
    </article>
  `).join('');
}

function hideSkeletons() {
  gamesSkeleton.classList.add('hidden');
}

function renderGenres(games) {
  const genres = getGenres(games);
  genreFilter.innerHTML = '<option value="">All Genres</option>' + genres.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`).join('');
}

function filterGames(games) {
  const term = (searchInput.value || '').trim().toLowerCase();
  const genre = genreFilter.value;

  return games.filter((game) => {
    const matchesSearch = !term
      || (game.title || '').toLowerCase().includes(term)
      || (game.description || '').toLowerCase().includes(term)
      || (game.genre || '').toLowerCase().includes(term);

    const matchesGenre = !genre || (game.genre || '').toLowerCase().includes(genre.toLowerCase());

    return matchesSearch && matchesGenre;
  });
}

function buildHeroSlide(game) {
  return `
    <article class="hero-slide" style="background-image: linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.75)), url('${escapeHtml(game.imageUrl || '')}')">
      <div class="hero-content">
        <div>
          <h2>${escapeHtml(game.title || 'Featured Game')}</h2>
          <p>${escapeHtml(game.shortDescription || game.description || '').slice(0, 200)}</p>
        </div>
        <a class="btn btn-green" href="game.html?id=${encodeURIComponent(game.id)}">View Game</a>
      </div>
    </article>
  `;
}

function setHero(index) {
  if (!heroGames.length) {
    featuredCarousel.innerHTML = '<div class="hero-slide"><div class="hero-content"><h2>No featured game yet</h2></div></div>';
    heroDots.innerHTML = '';
    return;
  }

  heroIndex = (index + heroGames.length) % heroGames.length;
  featuredCarousel.innerHTML = buildHeroSlide(heroGames[heroIndex]);
  heroDots.innerHTML = heroGames.map((_, idx) => `<button class="hero-dot ${idx === heroIndex ? 'active' : ''}" data-hero-index="${idx}" type="button" aria-label="Slide ${idx + 1}"></button>`).join('');
}

function startHeroAutoPlay() {
  if (heroTimer) {
    clearInterval(heroTimer);
  }
  if (heroGames.length <= 1) {
    return;
  }
  heroTimer = setInterval(() => setHero(heroIndex + 1), 4500);
}

function renderFeatured(games) {
  const featured = games.filter((game) => game.featured);
  heroGames = (featured.length ? featured : games).slice(0, 3);
  setHero(0);
  startHeroAutoPlay();
}

function getReleaseYear(releaseDate) {
  const match = String(releaseDate || '').match(/(19|20)\d{2}/);
  return match ? match[0] : 'N/A';
}

function getRating(game) {
  const value = game?.steamData?.metacritic;
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  return String(value);
}

function renderGames(games) {
  if (!games.length) {
    gamesGrid.innerHTML = '';
    noGamesState.classList.remove('hidden');
    return;
  }

  noGamesState.classList.add('hidden');
  gamesGrid.innerHTML = games.map((game) => {
    const tags = Array.isArray(game.tags) ? game.tags.slice(0, 3) : [];
    return `
      <article class="game-card">
        <img class="game-card-image" src="${escapeHtml(game.imageUrl || '')}" alt="${escapeHtml(game.title || 'Game')}" />
        <div class="game-card-body">
          <h3 class="game-card-title">${escapeHtml(game.title)}</h3>
          <div class="meta-row">
            <span>${escapeHtml((game.genre || 'N/A').split(',')[0])}</span>
            <span>${escapeHtml(getReleaseYear(game.releaseDate))}</span>
            <span>★ ${escapeHtml(getRating(game))}</span>
          </div>
          <div class="tag-list">
            ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
          <a class="btn btn-blue" href="game.html?id=${encodeURIComponent(game.id)}">View Details</a>
        </div>
      </article>
    `;
  }).join('');
}

function refresh() {
  const allGames = getGames();
  renderGenres(allGames);
  renderFeatured(allGames);
  renderGames(filterGames(allGames));
}

async function init() {
  showSkeletons();
  await window.depotraStorage.hydrateGamesFromApi();
  hideSkeletons();
  refresh();

  searchInput.addEventListener('input', refresh);
  genreFilter.addEventListener('change', refresh);
  heroDots.addEventListener('click', (event) => {
    const target = event.target.closest('[data-hero-index]');
    if (!target) {
      return;
    }
    setHero(Number(target.getAttribute('data-hero-index')));
    startHeroAutoPlay();
  });
}

init();

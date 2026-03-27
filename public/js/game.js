// game.js

const params = new URLSearchParams(window.location.search);
const gameId = params.get('id');

const gameLoading = document.getElementById('gameLoading');
const gameContent = document.getElementById('gameContent');
const gameNotFound = document.getElementById('gameNotFound');
const relatedGames = document.getElementById('relatedGames');
const quickMeta = document.getElementById('quickMeta');
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const panels = Array.from(document.querySelectorAll('.tab-panel'));
const lightboxModal = document.getElementById('lightboxModal');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxClose = document.getElementById('lightboxClose');

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatSteamRichText(value) {
  const raw = String(value || '');
  if (!raw) {
    return '';
  }

  if (raw.includes('<')) {
    return raw;
  }

  let text = raw;

  text = text.replace(/\r?\n/g, 'br');
  text = text.replace(/\/strong/gi, '</strong>');
  text = text.replace(/\/ul/gi, '</ul>');
  text = text.replace(/\/li/gi, '</li>');
  text = text.replace(/\/p/gi, '</p>');
  text = text.replace(/\/b/gi, '</b>');
  text = text.replace(/\/i/gi, '</i>');
  text = text.replace(/\/em/gi, '</em>');
  text = text.replace(/ul\s+class="([^"]*)"/gi, '<ul class="$1">');
  text = text.replace(/(^|<\/li>|<ul[^>]*>|br)li/gi, '$1<li>');
  text = text.replace(/(^|<li>|br)strong/gi, '$1<strong>');
  text = text.replace(/(^|br)p(?=[A-Z<])/g, '$1<p>');
  text = text.replace(/br/gi, '<br>');
  text = text.replace(/<br><br>/g, '<br>');
  text = text.replace(/<br>(<\/li>)/gi, '$1');
  text = text.replace(/(<li>)<br>/gi, '$1');

  return text;
}

function renderNotFound() {
  gameLoading.classList.add('hidden');
  gameContent.classList.add('hidden');
  relatedGames.classList.add('hidden');
  gameNotFound.classList.remove('hidden');
}

function activateTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-tab') === tabName);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.getAttribute('data-panel') !== tabName);
  });
}

function renderRelated(currentGame) {
  const allGames = window.depotraStorage.listGames();
  const currentTags = new Set(Array.isArray(currentGame.tags) ? currentGame.tags : []);
  const related = allGames
    .filter((item) => item.id !== currentGame.id)
    .map((item) => {
      const itemTags = Array.isArray(item.tags) ? item.tags : [];
      const tagMatches = itemTags.filter((tag) => currentTags.has(tag)).length;
      const genreMatches = (item.genre || '') === (currentGame.genre || '') ? 2 : 0;
      return { ...item, _score: tagMatches + genreMatches };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);

  if (!related.length) {
    relatedGames.innerHTML = '<article class="card muted">No related games yet.</article>';
    return;
  }

  relatedGames.innerHTML = related.map((item) => `
    <article class="game-card">
      <img class="game-card-image" src="${escapeHtml(item.imageUrl || '')}" alt="${escapeHtml(item.title)}" />
      <div class="game-card-body">
        <h3 class="game-card-title">${escapeHtml(item.title)}</h3>
        <a class="btn btn-blue" href="game.html?id=${encodeURIComponent(item.id)}">Open</a>
      </div>
    </article>
  `).join('');
}

function openLightbox(src) {
  if (!src) {
    return;
  }
  lightboxImage.src = src;
  lightboxModal.classList.remove('hidden');
}

function closeLightbox() {
  lightboxModal.classList.add('hidden');
  lightboxImage.src = '';
}

function renderGame(game) {
  byId('gameHeaderImage').src = game.imageUrl || '';
  byId('gameHeaderImage').alt = game.title || 'Game Banner';
  byId('gameTitle').textContent = game.title || 'Untitled';
  byId('downloadBtn').href = game.downloadLink || '#';
  byId('gameDescription').innerHTML = formatSteamRichText(game.description) || 'No description available.';
  quickMeta.innerHTML = `
    <span class="tag">${escapeHtml(game.genre || 'Unknown')}</span>
    <span class="tag">${escapeHtml(game.releaseDate || 'Unknown date')}</span>
    <span class="tag">By ${escapeHtml(game.developer || 'Unknown')}</span>
  `;

  byId('gameDeveloper').textContent = game.developer || 'N/A';
  byId('gamePublisher').textContent = game.publisher || 'N/A';
  byId('gameReleaseDate').textContent = game.releaseDate || 'N/A';
  byId('gameGenre').textContent = game.genre || 'N/A';

  const tagList = byId('gameTags');
  const tags = Array.isArray(game.tags) ? game.tags : [];
  tagList.innerHTML = tags.length
    ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
    : '<span class="muted">None</span>';

  const steamData = game.steamData || {};
  const screenshots = Array.isArray(steamData.screenshots) ? steamData.screenshots : [];

  let screenshotIndex = 0;
  const screenshotImage = byId('screenshotImage');
  const screenshotThumbs = byId('screenshotThumbs');
  const updateScreenshot = () => {
    if (!screenshots.length) return;
    screenshotImage.src = screenshots[screenshotIndex];
    screenshotThumbs.querySelectorAll('button').forEach((button, idx) => {
      button.classList.toggle('active', idx === screenshotIndex);
    });
  };

  if (screenshots.length) {
    screenshotThumbs.innerHTML = screenshots.slice(0, 8).map((src, idx) => `
      <button class="thumb-btn ${idx === 0 ? 'active' : ''}" data-thumb-index="${idx}" type="button">
        <img src="${escapeHtml(src)}" alt="Screenshot ${idx + 1}" />
      </button>
    `).join('');

    updateScreenshot();
    byId('screenshotPrev').onclick = () => {
      screenshotIndex = (screenshotIndex - 1 + screenshots.length) % screenshots.length;
      updateScreenshot();
    };
    byId('screenshotNext').onclick = () => {
      screenshotIndex = (screenshotIndex + 1) % screenshots.length;
      updateScreenshot();
    };

    screenshotThumbs.onclick = (event) => {
      const target = event.target.closest('[data-thumb-index]');
      if (!target) {
        return;
      }
      screenshotIndex = Number(target.getAttribute('data-thumb-index'));
      updateScreenshot();
    };

    screenshotImage.onclick = () => {
      openLightbox(screenshots[screenshotIndex]);
    };
  } else {
    screenshotThumbs.innerHTML = '<p class="muted">No screenshots available.</p>';
  }

  byId('metacriticScore').textContent = steamData.metacritic ?? 'N/A';
  byId('systemRequirements').innerHTML = formatSteamRichText(steamData.systemRequirements) || 'Not provided.';

  renderRelated(game);
  activateTab('overview');

  gameLoading.classList.add('hidden');
  gameNotFound.classList.add('hidden');
  gameContent.classList.remove('hidden');
}

async function init() {
  await window.depotraStorage.hydrateGamesFromApi();

  if (!gameId) {
    renderNotFound();
    return;
  }

  const game = window.depotraStorage.findGameById(gameId);
  if (!game) {
    renderNotFound();
    return;
  }

  renderGame(game);
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activateTab(button.getAttribute('data-tab'));
  });
});

lightboxClose.addEventListener('click', closeLightbox);
lightboxModal.addEventListener('click', (event) => {
  if (event.target === lightboxModal) {
    closeLightbox();
  }
});

init();

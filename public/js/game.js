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
const MAX_IMAGE_DIMENSION_DIGITS = 4;
const MAX_MARKUP_NORMALIZATION_ITERATIONS = 8;
const IMAGE_DIMENSION_PATTERN = new RegExp(`^\\d{1,${MAX_IMAGE_DIMENSION_DIGITS}}$`);

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

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function isSafeRichTextUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeRichTextHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  const allowedTags = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'I', 'EM', 'SPAN', 'IMG', 'H2', 'H3', 'VIDEO', 'SOURCE']);
  const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);

  function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }

    if (dangerousTags.has(node.tagName)) {
      node.remove();
      return;
    }

    if (!allowedTags.has(node.tagName)) {
      const children = Array.from(node.childNodes);
      const fragment = document.createDocumentFragment();
      children.forEach((child) => fragment.appendChild(child));
      node.replaceWith(fragment);
      children.forEach(sanitizeNode);
      return;
    }

    let removedElement = false;
    Array.from(node.attributes).forEach((attribute) => {
      if (removedElement) {
        return;
      }

      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith('on')) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (node.tagName === 'IMG') {
        if (name === 'src') {
          if (!isSafeRichTextUrl(value)) {
            removedElement = true;
            node.remove();
            return;
          }
          return;
        }
        if (name === 'alt' || name === 'title' || name === 'class') {
          return;
        }
        if ((name === 'width' || name === 'height') && IMAGE_DIMENSION_PATTERN.test(value)) {
          return;
        }
        node.removeAttribute(attribute.name);
        return;
      }

      if (node.tagName === 'VIDEO') {
        if (name === 'class' || name === 'autoplay' || name === 'muted' || name === 'loop' || name === 'playsinline') {
          return;
        }
        if (name === 'poster') {
          if (!isSafeRichTextUrl(value)) {
            node.removeAttribute(attribute.name);
          }
          return;
        }
        if ((name === 'width' || name === 'height') && IMAGE_DIMENSION_PATTERN.test(value)) {
          return;
        }
        node.removeAttribute(attribute.name);
        return;
      }

      if (node.tagName === 'SOURCE') {
        if (name === 'src') {
          if (!isSafeRichTextUrl(value)) {
            removedElement = true;
            node.remove();
            return;
          }
          return;
        }
        if (name === 'type' && /^video\/[a-z0-9]+$/i.test(value)) {
          return;
        }
        node.removeAttribute(attribute.name);
        return;
      }

      if ((node.tagName === 'SPAN' || node.tagName === 'UL' || node.tagName === 'OL') && name === 'class') {
        return;
      }

      if ((node.tagName === 'H2' || node.tagName === 'H3') && name === 'class') {
        return;
      }

      node.removeAttribute(attribute.name);
    });

    if (removedElement) {
      return;
    }

    Array.from(node.childNodes).forEach(sanitizeNode);
  }

  Array.from(template.content.childNodes).forEach(sanitizeNode);

  template.content.querySelectorAll('ul, ol').forEach((list) => {
    let pendingItem = null;

    const flushPendingItem = (beforeNode = null) => {
      if (!pendingItem || !pendingItem.childNodes.length) {
        pendingItem = null;
        return;
      }
      if (beforeNode) {
        list.insertBefore(pendingItem, beforeNode);
      } else {
        list.appendChild(pendingItem);
      }
      pendingItem = null;
    };

    Array.from(list.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) {
        child.remove();
        return;
      }

      if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'LI') {
        flushPendingItem(child);
        return;
      }

      if (!pendingItem) {
        pendingItem = document.createElement('li');
      }
      pendingItem.appendChild(child);
    });

    flushPendingItem();
  });

  return template.innerHTML;
}

function normalizeBrokenSteamMarkup(value) {
  let text = String(value || '').trim();
  if (!text || /<[^>]+>/.test(text)) {
    return text;
  }

  const imageBlocks = [];
  const videoBlocks = [];

  text = text.replace(/\r?\n/g, '__BR__');
  text = text.replace(/brbr/gi, '__BR____BR__');
  text = text.replace(/\bbr\b/gi, '__BR__');
  text = text.replace(/br(?=(?:ul|ol|li|p|strong|b|i|em|span|h[23]|\/))/gi, '__BR__');
  text = text.replace(
    /span\s+class="([^"]*)"\s*video\s+class="([^"]*)"\s+autoplay\s+muted\s+loop\s+playsinline(?:\s+crossorigin="[^"]*")?\s+poster="([^"]+)"(?:\s+width=(\d+))?(?:\s+height=(\d+))?\s+source\s+src="([^"]+)"\s+type="([^"]*)"\s*\/video/gi,
    (_, spanClass, videoClass, poster, width, height, src, type) => {
      const token = `__STEAM_VIDEO_${videoBlocks.length}__`;
      const safePoster = isSafeRichTextUrl(poster) ? escapeHtmlAttribute(poster) : '';
      const safeSrc = isSafeRichTextUrl(src) ? escapeHtmlAttribute(src) : '';
      const safeWidth = width && IMAGE_DIMENSION_PATTERN.test(width) ? escapeHtmlAttribute(width) : '';
      const safeHeight = height && IMAGE_DIMENSION_PATTERN.test(height) ? escapeHtmlAttribute(height) : '';
      const mimeBase = type.split(';')[0].trim();
      const safeType = /^video\/[a-z0-9]+$/i.test(mimeBase) ? escapeHtmlAttribute(mimeBase) : 'video/webm';
      videoBlocks.push(safeSrc
        ? `<span class="${escapeHtmlAttribute(spanClass)}"><video class="${escapeHtmlAttribute(videoClass)}" autoplay muted loop playsinline${safePoster ? ` poster="${safePoster}"` : ''}${safeWidth ? ` width="${safeWidth}"` : ''}${safeHeight ? ` height="${safeHeight}"` : ''}><source src="${safeSrc}" type="${safeType}"></video></span>`
        : `<span class="${escapeHtmlAttribute(spanClass)}"></span>`);
      return token;
    }
  );
  text = text.replace(
    /span\s+class="([^"]*)"\s*img\s+class="([^"]*)"\s+src="([^"]+)"(?:\s+width=(\d+))?(?:\s+height=(\d+))?\s*\/{1,2}span/gi,
    (_, spanClass, imgClass, src, width, height) => {
      const token = `__STEAM_IMG_${imageBlocks.length}__`;
      const safeSrc = isSafeRichTextUrl(src) ? escapeHtmlAttribute(src) : '';
      const safeWidth = width && IMAGE_DIMENSION_PATTERN.test(width) ? escapeHtmlAttribute(width) : '';
      const safeHeight = height && IMAGE_DIMENSION_PATTERN.test(height) ? escapeHtmlAttribute(height) : '';
      imageBlocks.push(safeSrc
        ? `<span class="${escapeHtmlAttribute(spanClass)}"><img class="${escapeHtmlAttribute(imgClass)}" src="${safeSrc}"${safeWidth ? ` width="${safeWidth}"` : ''}${safeHeight ? ` height="${safeHeight}"` : ''} /></span>`
        : `<span class="${escapeHtmlAttribute(spanClass)}"></span>`);
      return token;
    }
  );

  text = text.replace(/(?<![a-zA-Z])br(?![a-z])/g, '__BR__');

  let previous = '';
  let iterations = 0;
  while (text !== previous && iterations < MAX_MARKUP_NORMALIZATION_ITERATIONS) {
    iterations += 1;
    previous = text;
    text = text.replace(/(^|[^<])(\/{1,2})(strong|ul|ol|li|p|b|i|em|span|h2|h3)/gi, '$1</$3>');
    text = text.replace(/(^|__BR__)(ul|ol)\s+class="([^"]*)"/gi, (_, prefix, tag, className) => `${prefix}<${tag} class="${escapeHtmlAttribute(className)}">`);
    text = text.replace(/(^|__BR__|__STEAM_VIDEO_\d+__|__STEAM_IMG_\d+__)(h[23])\s+class="([^"]*)"/gi, (_, prefix, tag, className) => `${prefix}<${tag} class="${escapeHtmlAttribute(className)}">`);
    text = text.replace(/(^|__BR__|__STEAM_VIDEO_\d+__|__STEAM_IMG_\d+__|<\/h[23]>)(h[23])(?=[A-Za-z0-9 \u2022])/gi, '$1<$2>');
    text = text.replace(/(^|__BR__|<\/li>|<\/ul>|<\/ol>|<ul[^>]*>|<ol[^>]*>)(li|p|strong|b|i|em|span)(?=[A-Za-z0-9"<])/gi, '$1<$2>');
    text = text.replace(/(^|<li>|<p>|__BR__|<\/strong>|<\/b>|<\/i>|<\/em>)(strong|b|i|em)(?=[A-Za-z0-9"<])/gi, '$1<$2>');
  }

  text = text.replace(/(__BR__){3,}/gi, '__BR____BR__');
  text = text.replace(/__BR__(<\/li>)/gi, '$1');
  text = text.replace(/(<li>)__BR__/gi, '$1');
  text = text.replace(/__BR__/gi, '<br>');
  text = text.replace(/__STEAM_IMG_(\d+)__/g, (_, index) => imageBlocks[Number(index)] || '');
  text = text.replace(/__STEAM_VIDEO_(\d+)__/g, (_, index) => videoBlocks[Number(index)] || '');

  return text;
}

function formatSteamRichText(value) {
  const raw = String(value || '');
  if (!raw) {
    return '';
  }

  return sanitizeRichTextHtml(normalizeBrokenSteamMarkup(raw));
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
      <img class="game-card-image" src="${escapeHtml(item.imageUrl || '')}" alt="${escapeHtml(item.title)}" loading="lazy" />
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
  const downloadBtn = byId('downloadBtn');

  byId('gameHeaderImage').src = game.imageUrl || '';
  byId('gameHeaderImage').alt = game.title || 'Game Banner';
  byId('gameTitle').textContent = game.title || 'Untitled';
  if (game.downloadLink) {
    downloadBtn.href = `/api/download/${encodeURIComponent(game.id)}`;
    downloadBtn.removeAttribute('aria-disabled');
    downloadBtn.removeAttribute('title');
  } else {
    downloadBtn.removeAttribute('href');
    downloadBtn.setAttribute('aria-disabled', 'true');
    downloadBtn.title = 'No download link available for this game yet.';
  }
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
        <img src="${escapeHtml(src)}" alt="Screenshot ${idx + 1}" loading="lazy" />
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

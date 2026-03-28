const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'depotra_secret_key_change_this_in_production';
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_PATH = path.join(__dirname, 'public');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'Coolgang57'
};

const PLACEHOLDER_IMAGE = 'https://placehold.co/920x430/213040/c7d5e0?text=Depotra';

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

function sanitizeString(value, maxLength = 10000) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function sanitizeRichText(value, maxLength = 20000) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLength);
}

function sanitizeUrl(value) {
  const sanitized = sanitizeString(value, 2000);
  if (!sanitized) {
    return '';
  }
  try {
    const url = new URL(sanitized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function sanitizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => sanitizeString(String(tag), 50).toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => sanitizeString(tag, 50).toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  }

  return [];
}

function mapGameRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    downloadLink: row.download_link,
    steamAppId: row.steam_app_id || '',
    steamData: row.steam_data || {},
    genre: row.genre || '',
    developer: row.developer || '',
    publisher: row.publisher || '',
    releaseDate: row.release_date || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    featured: row.featured === true,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

async function initializeDatabase() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required in .env for Neon PostgreSQL');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL,
      download_link TEXT NOT NULL,
      steam_app_id TEXT,
      steam_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      genre TEXT,
      developer TEXT,
      publisher TEXT,
      release_date TEXT,
      tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      uploaded_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_games_featured ON games(featured)');

  const existingAdmin = await pool.query('SELECT id FROM admins WHERE username = $1 LIMIT 1', [DEFAULT_ADMIN.username]);
  if (existingAdmin.rows.length === 0) {
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
    await pool.query(
      'INSERT INTO admins (id, username, password, created_at) VALUES ($1, $2, $3, NOW())',
      [uuidv4(), DEFAULT_ADMIN.username, hashedPassword]
    );
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: token missing' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized: invalid or expired token' });
  }
}

async function fetchSteamDetails(appid) {
  const appIdValue = sanitizeString(appid, 20);
  if (!appIdValue) {
    throw new Error('Invalid Steam App ID');
  }

  const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appIdValue)}&l=english&cc=US`);
  if (!response.ok) {
    throw new Error('Steam API request failed');
  }

  const data = await response.json();
  const details = data?.[appIdValue];

  if (!details || details.success !== true || !details.data) {
    throw new Error('No Steam data found for this App ID');
  }

  const steam = details.data;
  const genres = Array.isArray(steam.genres) ? steam.genres.map((g) => sanitizeString(g.description, 60)).filter(Boolean) : [];
  const developers = Array.isArray(steam.developers) ? steam.developers.map((d) => sanitizeString(d, 100)).filter(Boolean) : [];
  const publishers = Array.isArray(steam.publishers) ? steam.publishers.map((p) => sanitizeString(p, 100)).filter(Boolean) : [];
  const screenshots = Array.isArray(steam.screenshots) ? steam.screenshots.map((s) => sanitizeUrl(s.path_full)).filter(Boolean) : [];

  return {
    steamAppId: appIdValue,
    title: sanitizeString(steam.name, 200),
    shortDescription: sanitizeString(steam.short_description, 1000),
    description: sanitizeRichText(steam.detailed_description, 15000),
    imageUrl: sanitizeUrl(steam.header_image) || PLACEHOLDER_IMAGE,
    genres,
    genre: genres.join(', '),
    developer: developers.join(', '),
    publisher: publishers.join(', '),
    releaseDate: sanitizeString(steam.release_date?.date || '', 100),
    screenshots,
    metacritic: steam.metacritic?.score || null,
    systemRequirements: sanitizeRichText(steam.pc_requirements?.minimum || '', 8000),
    website: sanitizeUrl(steam.website || ''),
    categories: Array.isArray(steam.categories) ? steam.categories.map((c) => sanitizeString(c.description, 100)).filter(Boolean) : []
  };
}

function mergeGameWithSteam(body, steamData, existing = null) {
  const fallback = existing || {};

  const title = sanitizeString(body.title || fallback.title || steamData?.title || '', 200);
  const description = sanitizeRichText(body.description || fallback.description || steamData?.description || steamData?.shortDescription || '', 20000);
  const imageUrl = sanitizeUrl(body.imageUrl || fallback.imageUrl || steamData?.imageUrl || '') || PLACEHOLDER_IMAGE;
  const downloadLink = sanitizeUrl(body.downloadLink || fallback.downloadLink || '');
  const genre = sanitizeString(body.genre || fallback.genre || steamData?.genre || '', 150);
  const developer = sanitizeString(body.developer || fallback.developer || steamData?.developer || '', 200);
  const publisher = sanitizeString(body.publisher || fallback.publisher || steamData?.publisher || '', 200);
  const releaseDate = sanitizeString(body.releaseDate || fallback.releaseDate || steamData?.releaseDate || '', 100);
  const tags = sanitizeTags(body.tags ?? fallback.tags ?? steamData?.genres ?? []);
  const featured = body.featured === true || body.featured === 'true' || body.featured === 'on' || fallback.featured === true;
  const steamAppId = sanitizeString(body.steamAppId || fallback.steamAppId || steamData?.steamAppId || '', 20);

  return {
    title,
    description,
    imageUrl,
    downloadLink,
    steamAppId,
    steamData: steamData || fallback.steamData || {},
    genre,
    developer,
    publisher,
    releaseDate,
    tags,
    featured
  };
}

app.post('/api/admin/login', async (req, res) => {
  try {
    const username = sanitizeString(req.body.username, 50);
    const password = sanitizeString(req.body.password, 100);

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const adminResult = await pool.query('SELECT id, username, password FROM admins WHERE username = $1 LIMIT 1', [username]);
    const admin = adminResult.rows[0];

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    return res.status(200).json({ token, username: admin.username });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during login' });
  }
});

app.post('/api/admin/signup', authMiddleware, async (req, res) => {
  try {
    const username = sanitizeString(req.body.username, 50);
    const password = sanitizeString(req.body.password, 100);

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const existing = await pool.query('SELECT id FROM admins WHERE username = $1 LIMIT 1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO admins (id, username, password, created_at) VALUES ($1, $2, $3, NOW())',
      [uuidv4(), username, hashedPassword]
    );
    return res.status(201).json({ message: 'Admin account created successfully' });
  } catch {
    return res.status(500).json({ message: 'Server error during signup' });
  }
});

app.get('/api/admin/verify', authMiddleware, (req, res) => {
  return res.status(200).json({ valid: true, user: req.user.username });
});

app.get('/api/games', async (req, res) => {
  try {
    const search = sanitizeString(req.query.search || '', 100).toLowerCase();
    const genre = sanitizeString(req.query.genre || '', 100).toLowerCase();
    const featuredOnly = req.query.featured === 'true';

    const gameResult = await pool.query('SELECT * FROM games ORDER BY created_at DESC');
    let games = gameResult.rows.map(mapGameRow);

    if (search) {
      games = games.filter((game) => {
        const fields = [game.title, game.description, game.genre, game.developer, game.publisher, ...(game.tags || [])]
          .join(' ')
          .toLowerCase();
        return fields.includes(search);
      });
    }

    if (genre) {
      games = games.filter((game) => (game.genre || '').toLowerCase().includes(genre));
    }

    if (featuredOnly) {
      games = games.filter((game) => game.featured === true);
    }

    games.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json(games);
  } catch {
    return res.status(500).json({ message: 'Server error fetching games' });
  }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const gameId = sanitizeString(req.params.id, 100);
    const gameResult = await pool.query('SELECT * FROM games WHERE id = $1 LIMIT 1', [gameId]);
    const game = gameResult.rows[0] ? mapGameRow(gameResult.rows[0]) : null;
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    return res.status(200).json(game);
  } catch {
    return res.status(500).json({ message: 'Server error fetching game' });
  }
});

app.post('/api/admin/games', authMiddleware, async (req, res) => {
  try {
    const steamAppId = sanitizeString(req.body.steamAppId || '', 20);
    let steamData = {};

    if (steamAppId) {
      try {
        steamData = await fetchSteamDetails(steamAppId);
      } catch {
        steamData = {};
      }
    }

    const merged = mergeGameWithSteam(req.body, steamData);

    if (!merged.title || !merged.description || !merged.downloadLink) {
      return res.status(400).json({ message: 'Title, description, and direct download link are required' });
    }

    const now = new Date().toISOString();
    const game = {
      id: uuidv4(),
      ...merged,
      uploadedBy: req.user.username,
      createdAt: now,
      updatedAt: now
    };

    await pool.query(
      `
        INSERT INTO games (
          id, title, description, image_url, download_link, steam_app_id, steam_data,
          genre, developer, publisher, release_date, tags, featured, uploaded_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::text[], $13, $14, $15::timestamptz, $16::timestamptz)
      `,
      [
        game.id,
        game.title,
        game.description,
        game.imageUrl,
        game.downloadLink,
        game.steamAppId || null,
        JSON.stringify(game.steamData || {}),
        game.genre,
        game.developer,
        game.publisher,
        game.releaseDate,
        Array.isArray(game.tags) ? game.tags : [],
        game.featured === true,
        game.uploadedBy,
        game.createdAt,
        game.updatedAt
      ]
    );

    return res.status(201).json(game);
  } catch {
    return res.status(500).json({ message: 'Server error creating game' });
  }
});

app.put('/api/admin/games/:id', authMiddleware, async (req, res) => {
  try {
    const gameId = sanitizeString(req.params.id, 100);
    const existingResult = await pool.query('SELECT * FROM games WHERE id = $1 LIMIT 1', [gameId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const existing = mapGameRow(existingResult.rows[0]);
    const steamAppId = sanitizeString(req.body.steamAppId || existing.steamAppId || '', 20);

    let steamData = existing.steamData || {};
    if (steamAppId) {
      try {
        steamData = await fetchSteamDetails(steamAppId);
      } catch {
        steamData = existing.steamData || {};
      }
    }

    const merged = mergeGameWithSteam({ ...existing, ...req.body, steamAppId }, steamData, existing);

    if (!merged.title || !merged.description || !merged.downloadLink) {
      return res.status(400).json({ message: 'Title, description, and direct download link are required' });
    }

    const updatedGame = {
      ...existing,
      ...merged,
      updatedAt: new Date().toISOString()
    };

    await pool.query(
      `
        UPDATE games
        SET
          title = $2,
          description = $3,
          image_url = $4,
          download_link = $5,
          steam_app_id = $6,
          steam_data = $7::jsonb,
          genre = $8,
          developer = $9,
          publisher = $10,
          release_date = $11,
          tags = $12::text[],
          featured = $13,
          updated_at = $14::timestamptz
        WHERE id = $1
      `,
      [
        gameId,
        updatedGame.title,
        updatedGame.description,
        updatedGame.imageUrl,
        updatedGame.downloadLink,
        updatedGame.steamAppId || null,
        JSON.stringify(updatedGame.steamData || {}),
        updatedGame.genre,
        updatedGame.developer,
        updatedGame.publisher,
        updatedGame.releaseDate,
        Array.isArray(updatedGame.tags) ? updatedGame.tags : [],
        updatedGame.featured === true,
        updatedGame.updatedAt
      ]
    );

    return res.status(200).json(updatedGame);
  } catch {
    return res.status(500).json({ message: 'Server error updating game' });
  }
});

app.delete('/api/admin/games/:id', authMiddleware, async (req, res) => {
  try {
    const gameId = sanitizeString(req.params.id, 100);
    const deleteResult = await pool.query('DELETE FROM games WHERE id = $1 RETURNING *', [gameId]);
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const deleted = mapGameRow(deleteResult.rows[0]);
    return res.status(200).json({ message: 'Game deleted', game: deleted });
  } catch {
    return res.status(500).json({ message: 'Server error deleting game' });
  }
});

app.get('/api/steam/search', async (req, res) => {
  try {
    const query = sanitizeString(req.query.query || '', 100);
    if (!query) {
      return res.status(400).json({ message: 'Query parameter is required' });
    }

    const response = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`
    );

    if (!response.ok) {
      return res.status(500).json({ message: 'Steam search request failed' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: 'Server error searching Steam' });
  }
});

app.get('/api/steam/details/:appid', async (req, res) => {
  try {
    const appid = sanitizeString(req.params.appid, 20);
    if (!appid) {
      return res.status(400).json({ message: 'Invalid app ID' });
    }

    const details = await fetchSteamDetails(appid);
    return res.status(200).json(details);
  } catch (error) {
    return res.status(404).json({ message: error.message || 'Steam details not found' });
  }
});

app.get('/api/download/:id', async (req, res) => {
  try {
    const gameId = sanitizeString(req.params.id, 100);
    const gameResult = await pool.query('SELECT * FROM games WHERE id = $1 LIMIT 1', [gameId]);
    const game = gameResult.rows[0] ? mapGameRow(gameResult.rows[0]) : null;
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    if (!game.downloadLink) {
      return res.status(404).json({ message: 'No download link available' });
    }

    const fileResponse = await fetch(game.downloadLink);
    if (!fileResponse.ok) {
      return res.status(502).json({ message: 'Failed to fetch download' });
    }

    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    let ext = '';
    try {
      const urlExt = path.extname(new URL(game.downloadLink).pathname);
      if (urlExt) {
        ext = urlExt;
      }
    } catch {
      // ignore URL parse errors
    }

    const safeTitle = (game.title || 'Game').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const filename = safeTitle + ext;
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', contentType);

    const contentLength = fileResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    fileResponse.body.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ message: 'Error streaming download' });
      } else {
        res.destroy();
      }
    });
    fileResponse.body.pipe(res);
    return undefined;
  } catch (err) {
    console.error('Download proxy error:', err);
    return res.status(500).json({ message: 'Server error during download' });
  }
});

app.use(express.static(PUBLIC_PATH));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

app.use('/api', (req, res) => {
  return res.status(404).json({ message: 'API route not found' });
});

app.use((req, res) => {
  return res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>404 - Depotra</title>
        <style>
          body {
            margin: 0;
            display: flex;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            background: #1b2838;
            color: #c7d5e0;
          }
          .box {
            text-align: center;
            background: #213040;
            border: 1px solid #4a6741;
            border-radius: 10px;
            padding: 32px;
          }
          a {
            color: #66c0f4;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>404</h1>
          <p>Page not found.</p>
          <a href="/">Return to Depotra Store</a>
        </div>
      </body>
    </html>
  `);
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Depotra server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize Depotra:', error);
    process.exit(1);
  });

const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_JSON_PATH = path.join(__dirname, 'database.json');

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function ensureTables() {
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
}

async function migrate() {
  await ensureTables();

  const raw = await fs.readFile(DB_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const admins = asArray(parsed.admins);
  const games = asArray(parsed.games);

  await pool.query('BEGIN');
  try {
    for (const admin of admins) {
      await pool.query(
        `
          INSERT INTO admins (id, username, password, created_at)
          VALUES ($1, $2, $3, $4::timestamptz)
          ON CONFLICT (username)
          DO UPDATE SET
            password = EXCLUDED.password
        `,
        [
          admin.id,
          admin.username,
          admin.password,
          admin.createdAt || new Date().toISOString()
        ]
      );
    }

    for (const game of games) {
      await pool.query(
        `
          INSERT INTO games (
            id, title, description, image_url, download_link, steam_app_id, steam_data,
            genre, developer, publisher, release_date, tags, featured, uploaded_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb,
            $8, $9, $10, $11, $12::text[], $13, $14, $15::timestamptz, $16::timestamptz
          )
          ON CONFLICT (id)
          DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            download_link = EXCLUDED.download_link,
            steam_app_id = EXCLUDED.steam_app_id,
            steam_data = EXCLUDED.steam_data,
            genre = EXCLUDED.genre,
            developer = EXCLUDED.developer,
            publisher = EXCLUDED.publisher,
            release_date = EXCLUDED.release_date,
            tags = EXCLUDED.tags,
            featured = EXCLUDED.featured,
            uploaded_by = EXCLUDED.uploaded_by,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          game.id,
          game.title || '',
          game.description || '',
          game.imageUrl || '',
          game.downloadLink || '',
          game.steamAppId || null,
          JSON.stringify(asObject(game.steamData)),
          game.genre || '',
          game.developer || '',
          game.publisher || '',
          game.releaseDate || '',
          asArray(game.tags),
          game.featured === true,
          game.uploadedBy || 'admin',
          game.createdAt || new Date().toISOString(),
          game.updatedAt || game.createdAt || new Date().toISOString()
        ]
      );
    }

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  const adminCount = await pool.query('SELECT COUNT(*)::int AS count FROM admins');
  const gameCount = await pool.query('SELECT COUNT(*)::int AS count FROM games');

  console.log(`Migration complete: ${admins.length} admins, ${games.length} games processed.`);
  console.log(`Neon now has: ${adminCount.rows[0].count} admins, ${gameCount.rows[0].count} games.`);
}

migrate()
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
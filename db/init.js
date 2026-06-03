const Database = require('better-sqlite3');
const path = require('path');
const { BUILTIN_TYPES } = require('../lib/source-types');
const { mergeBuiltinIds } = require('../lib/persona-sources');

function getDbPath() {
  if (process.versions.electron) {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'digests.db');
  }
  return path.join(__dirname, 'digests.db');
}

let _db;
function getDb() {
  if (!_db) _db = new Database(getDbPath());
  return _db;
}

const DEFAULT_SOURCES = [
  // Reddit — public JSON API, no auth required
  { type: 'reddit', name: 'r/indieheads',    url: 'indieheads' },
  { type: 'reddit', name: 'r/hiphopheads',   url: 'hiphopheads' },
  { type: 'reddit', name: 'r/popheads',      url: 'popheads' },
  { type: 'reddit', name: 'r/listentothis',  url: 'listentothis' },
  { type: 'reddit', name: 'r/electronicmusic', url: 'electronicmusic' },
  { type: 'reddit', name: 'r/rnb',           url: 'rnb' },
  { type: 'reddit', name: 'r/trap',          url: 'trap' },
  { type: 'reddit', name: 'r/alternative',   url: 'alternative' },
  { type: 'reddit', name: 'r/makinghiphop',  url: 'makinghiphop' },
  { type: 'reddit', name: 'r/tiktokcharts',  url: 'tiktokcharts' },
  // RSS feeds — reliable, structured
  { type: 'rss', name: 'NME',                  url: 'https://www.nme.com/feed' },
  { type: 'rss', name: 'Stereogum',             url: 'https://www.stereogum.com/feed/' },
  { type: 'rss', name: 'Consequence of Sound',  url: 'https://consequence.net/feed/' },
  { type: 'rss', name: 'Rolling Stone Music',   url: 'https://www.rollingstone.com/music/feed/' },
  { type: 'rss', name: 'HotNewHipHop',          url: 'https://www.hotnewhiphop.com/feed/' },
  { type: 'rss', name: 'Pitchfork',             url: 'https://pitchfork.com/feed/feed-news/rss/' },
  { type: 'rss', name: 'Billboard',             url: 'https://www.billboard.com/feed/' },
  { type: 'rss', name: 'Hypebeast Music',       url: 'https://hypebeast.com/music/feed' },
  // RSS — previously HTML-scraped sites that have proper feeds
  { type: 'rss', name: 'The FADER',  url: 'https://www.thefader.com/feed/music' },
  { type: 'rss', name: 'XXL Mag',    url: 'https://www.xxlmag.com/feed/' },
  // New editorial sources (signal scoring)
  { type: 'rss', name: 'The Guardian Music', url: 'https://www.theguardian.com/music/rss' },
  { type: 'rss', name: 'Variety Music',       url: 'https://variety.com/v/music/feed/' },
  { type: 'rss', name: 'Uproxx Music',         url: 'https://uproxx.com/music/feed/' },
  // TikTok Ads API (creative_radar_api) discontinued — removed
  // Spotify Viral 50 playlist discontinued by Spotify in 2023 — removed
  // Scrapers with fixed URLs (no user config needed)
  { type: 'tiktok',   name: 'TikTok Charts', url: 'https://kworb.net/charts/tiktok/us.html' },
  { type: 'tokchart', name: 'Tokchart',           url: 'https://tokchart.com' },
  { type: 'youtube',  name: 'YouTube Trending',   url: 'https://charts.youtube.com/charts/TrendingVideos/us/RightNow' },
  // Built-in fixed-feed scrapers (toggle-only in the UI). URLs are cosmetic —
  // these scrapers ignore them, like the tokchart/youtube rows above.
  { type: 'apple-charts',   name: 'Apple Charts',  url: 'https://music.apple.com/us/charts/songs' },
  { type: 'lastfm',         name: 'Last.fm',       url: 'https://www.last.fm/charts' },
  { type: 'genius',         name: 'Genius',        url: 'https://genius.com/#top-songs' },
  { type: 'shazam',         name: 'Shazam',        url: 'https://www.shazam.com/charts/top-200/united-states' },
  { type: 'spotify-global', name: 'Spotify Global', url: 'https://charts.spotify.com/charts/view/regional-global-daily/latest' },
  { type: 'hypem',          name: 'Hype Machine',  url: 'https://hypem.com/popular' },
];

// One-time: add the built-in source IDs to every non-default persona, so
// existing personas keep receiving the now-toggleable built-in feeds. Guarded
// by a settings flag so it runs exactly once — a built-in a user later removes
// from a persona must stay removed.
function migrateBuiltinsIntoPersonas(db) {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'builtin_persona_migration_done'").get();
  if (done) return;
  const ph = BUILTIN_TYPES.map(() => '?').join(',');
  const builtinIds = db.prepare(`SELECT id FROM sources WHERE type IN (${ph})`).all(...BUILTIN_TYPES).map(r => r.id);
  const personas = db.prepare('SELECT id, source_ids FROM personas WHERE is_default = 0').all();
  const upd = db.prepare('UPDATE personas SET source_ids = ? WHERE id = ?');
  db.transaction(() => {
    for (const p of personas) {
      let cur;
      try { cur = JSON.parse(p.source_ids || '[]'); } catch { cur = []; }
      upd.run(JSON.stringify(mergeBuiltinIds(cur, builtinIds)), p.id);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('builtin_persona_migration_done', '1')").run();
  })();
}

function initDb() {
  const db = getDb();

  const NEW_TYPES = "'reddit','rss','html','tiktok','spotify-playlist','tokchart','youtube','apple-charts','lastfm','genius','shazam','spotify-global','hypem'";

  // ── Personas table — must exist before any migration that assigns persona IDs ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      source_ids  TEXT NOT NULL DEFAULT '[]',
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Migration: add include_in_email column ───────────────────────────────────
  const personasCols = db.prepare("PRAGMA table_info(personas)").all().map(c => c.name);
  if (!personasCols.includes('include_in_email')) {
    db.exec("ALTER TABLE personas ADD COLUMN include_in_email INTEGER NOT NULL DEFAULT 1");
    console.log('[db] Added include_in_email column to personas');
  }

  // ── Seed All Sources persona ──────────────────────────────────────────────────
  if (db.prepare('SELECT COUNT(*) as n FROM personas').get().n === 0) {
    db.prepare("INSERT INTO personas (name, source_ids, is_default) VALUES ('Main', '[]', 1)").run();
    console.log('[db] Seeded All Sources persona');
  }
  const allSourcesId = db.prepare('SELECT id FROM personas WHERE is_default = 1').get()?.id;

  // ── Migration: sources type constraint ───────────────────────────────────────
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sources'").get();
  const needsSourcesMigration = tableInfo && (
    !tableInfo.sql.includes("'tiktok'") || !tableInfo.sql.includes("'spotify-playlist'") || !tableInfo.sql.includes("'tokchart'") || !tableInfo.sql.includes("'youtube'") || !tableInfo.sql.includes("'apple-charts'")
  );
  if (needsSourcesMigration) {
    db.transaction(() => {
      db.exec(`ALTER TABLE sources RENAME TO _sources_old`);
      db.exec(`CREATE TABLE sources (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        type      TEXT NOT NULL CHECK(type IN (${NEW_TYPES})),
        name      TEXT NOT NULL,
        url       TEXT NOT NULL,
        selector  TEXT,
        enabled   INTEGER NOT NULL DEFAULT 1,
        added_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec(`INSERT INTO sources SELECT * FROM _sources_old`);
      db.exec(`DROP TABLE _sources_old`);
    })();
    console.log('[db] Migrated sources: updated type constraint');
  }

  // ── Migration: digests.mentioned_artists ─────────────────────────────────────
  const digestsInfoV1 = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='digests'").get();
  if (digestsInfoV1 && !digestsInfoV1.sql.includes('mentioned_artists')) {
    db.exec('ALTER TABLE digests ADD COLUMN mentioned_artists TEXT');
    console.log('[db] Migrated digests: added mentioned_artists column');
  }

  // ── Migration: digests — add persona_id, replace inline UNIQUE(date) ─────────
  // Guard checks the table DDL string (not sqlite_master index entries) because
  // the existing constraint is inline: `date TEXT UNIQUE NOT NULL`.
  const digestsInfoV2 = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='digests'").get();
  if (digestsInfoV2 && !digestsInfoV2.sql.includes('persona_id')) {
    db.transaction(() => {
      db.exec(`ALTER TABLE digests RENAME TO _digests_old`);
      db.exec(`
        CREATE TABLE digests (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          date              TEXT NOT NULL,
          persona_id        INTEGER,
          summary           TEXT,
          artists           TEXT,
          songs             TEXT,
          headlines         TEXT,
          playlist_url      TEXT,
          mentioned_artists TEXT,
          created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Existing rows get persona_id = NULL; they surface under All Sources via
      // the OR persona_id IS NULL pattern used in query filters.
      db.exec(`
        INSERT INTO digests (id, date, persona_id, summary, artists, songs, headlines, playlist_url, mentioned_artists, created_at)
        SELECT id, date, NULL, summary, artists, songs, headlines, playlist_url, mentioned_artists, created_at
        FROM _digests_old
      `);
      db.exec(`DROP TABLE _digests_old`);
    })();
    console.log('[db] Migrated digests: added persona_id, removed inline UNIQUE(date)');
  }

  // ── Migration: playlist_tracks — composite PK (track_id, persona_id) ─────────
  // The old table has `track_id TEXT PRIMARY KEY`; the new one requires
  // `PRIMARY KEY (track_id, persona_id)` so the same track can appear under
  // multiple personas without dedup collisions across personas.
  const tracksInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='playlist_tracks'").get();
  if (tracksInfo && !tracksInfo.sql.includes('persona_id')) {
    db.transaction(() => {
      db.exec(`ALTER TABLE playlist_tracks RENAME TO _playlist_tracks_old`);
      db.exec(`
        CREATE TABLE playlist_tracks (
          track_id    TEXT NOT NULL,
          persona_id  INTEGER NOT NULL,
          track_name  TEXT,
          artist_name TEXT,
          added_at    TEXT NOT NULL DEFAULT (datetime('now')),
          digest_date TEXT,
          PRIMARY KEY (track_id, persona_id)
        )
      `);
      // Existing tracks assigned to All Sources persona so dedup remains intact.
      db.prepare(`
        INSERT INTO playlist_tracks (track_id, persona_id, track_name, artist_name, added_at, digest_date)
        SELECT track_id, ?, track_name, artist_name, added_at, digest_date
        FROM _playlist_tracks_old
      `).run(allSourcesId);
      db.exec(`DROP TABLE _playlist_tracks_old`);
    })();
    console.log('[db] Migrated playlist_tracks: added persona_id (existing rows → All Sources), composite PK');
  }

  // ── Create remaining tables (no-ops for upgraded DBs) ────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT NOT NULL CHECK(type IN (${NEW_TYPES})),
      name      TEXT NOT NULL,
      url       TEXT NOT NULL,
      selector  TEXT,
      enabled   INTEGER NOT NULL DEFAULT 1,
      added_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS digests (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      date              TEXT NOT NULL,
      persona_id        INTEGER,
      summary           TEXT,
      artists           TEXT,
      songs             TEXT,
      headlines         TEXT,
      playlist_url      TEXT,
      mentioned_artists TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      track_id    TEXT NOT NULL,
      persona_id  INTEGER NOT NULL,
      track_name  TEXT,
      artist_name TEXT,
      added_at    TEXT NOT NULL DEFAULT (datetime('now')),
      digest_date TEXT,
      PRIMARY KEY (track_id, persona_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS artist_baselines (
      artist_name  TEXT PRIMARY KEY,
      listeners    INTEGER,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Unique index on (date, persona_id) — covers both fresh DBs and upgraded ones
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_digests_date_persona ON digests(date, persona_id)`);

  // ── Seed active_persona_id if not set ────────────────────────────────────────
  if (!db.prepare("SELECT value FROM settings WHERE key = 'active_persona_id'").get()) {
    const defaultId = db.prepare('SELECT id FROM personas WHERE is_default = 1').get()?.id;
    if (defaultId) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_persona_id', ?)").run(String(defaultId));
    }
  }

  // ── Seed default sources if table is empty ────────────────────────────────────
  const count = db.prepare('SELECT COUNT(*) as n FROM sources').get().n;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO sources (type, name, url, selector) VALUES (?, ?, ?, ?)'
    );
    const seedAll = db.transaction(() => {
      for (const s of DEFAULT_SOURCES) {
        insert.run(s.type, s.name, s.url, s.selector || null);
      }
    });
    seedAll();
    console.log(`[db] Seeded ${DEFAULT_SOURCES.length} default sources`);
  } else {
    // Add any new default sources that don't exist yet (by URL)
    const insertIfMissing = db.prepare(
      'INSERT OR IGNORE INTO sources (type, name, url, selector) VALUES (?, ?, ?, ?)'
    );
    // Requires a unique index on url — add it if missing
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_url ON sources(url)');
    const migrate = db.transaction(() => {
      let added = 0;
      for (const s of DEFAULT_SOURCES) {
        const result = insertIfMissing.run(s.type, s.name, s.url, s.selector || null);
        if (result.changes) added++;
      }
      return added;
    });
    const added = migrate();
    if (added > 0) console.log(`[db] Added ${added} new default source(s)`);

    // Patch: remove old TikTok placeholder sources (superseded by the proper tiktok type entry)
    for (const oldUrl of [
      'https://www.billboard.com/charts/tiktok-billboard-top-50/',
      'https://kworb.net/tiktok/',
    ]) {
      const p = db.prepare('DELETE FROM sources WHERE url = ?').run(oldUrl);
      if (p.changes) console.log(`[db] Removed obsolete source: ${oldUrl}`);
    }

    // Patch: replace broken HTML sources with RSS equivalents
    const htmlToRss = [
      { old: 'https://www.thefader.com/music', newType: 'rss', newName: 'The FADER', newUrl: 'https://www.thefader.com/feed/music' },
      { old: 'https://www.complex.com/music',  newType: 'rss', newName: 'XXL Mag',   newUrl: 'https://www.xxlmag.com/feed/' },
    ];
    for (const { old: oldUrl, newType, newName, newUrl } of htmlToRss) {
      const oldRow = db.prepare('SELECT id FROM sources WHERE url = ?').get(oldUrl);
      if (oldRow) {
        const newExists = db.prepare('SELECT id FROM sources WHERE url = ?').get(newUrl);
        if (newExists) {
          db.prepare('DELETE FROM sources WHERE url = ?').run(oldUrl);
        } else {
          db.prepare('UPDATE sources SET type = ?, name = ?, url = ?, selector = NULL WHERE url = ?')
            .run(newType, newName, newUrl, oldUrl);
        }
        console.log(`[db] Migrated ${oldUrl} → ${newUrl}`);
      }
    }
  }

  // Run after sources are seeded (both fresh-seed and add-defaults paths) so the
  // built-in IDs exist before they're merged into personas.
  migrateBuiltinsIntoPersonas(db);

  return db;
}

module.exports = { getDb, initDb };

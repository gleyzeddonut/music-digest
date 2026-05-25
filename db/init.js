const Database = require('better-sqlite3');
const path = require('path');

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
];

function initDb() {
  const db = getDb();

  const NEW_TYPES = "'reddit','rss','html','tiktok','spotify-playlist','tokchart','youtube'";

  // Migration: extend sources type constraint whenever a new type is added
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sources'").get();
  const needsMigration = tableInfo && (
    !tableInfo.sql.includes("'tiktok'") || !tableInfo.sql.includes("'spotify-playlist'") || !tableInfo.sql.includes("'tokchart'") || !tableInfo.sql.includes("'youtube'")
  );
  if (needsMigration) {
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

  // Migration: add mentioned_artists column to digests if missing
  const digestsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='digests'").get();
  if (digestsInfo && !digestsInfo.sql.includes('mentioned_artists')) {
    db.exec('ALTER TABLE digests ADD COLUMN mentioned_artists TEXT');
    console.log('[db] Migrated digests: added mentioned_artists column');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT NOT NULL CHECK(type IN ('reddit','rss','html','tiktok','spotify-playlist','tokchart','youtube')),
      name      TEXT NOT NULL,
      url       TEXT NOT NULL,
      selector  TEXT,
      enabled   INTEGER NOT NULL DEFAULT 1,
      added_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS digests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT UNIQUE NOT NULL,
      summary      TEXT,
      artists      TEXT,
      songs        TEXT,
      headlines    TEXT,
      playlist_url TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      track_id    TEXT PRIMARY KEY,
      track_name  TEXT,
      artist_name TEXT,
      added_at    TEXT NOT NULL DEFAULT (datetime('now')),
      digest_date TEXT
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

  // Seed default sources only if table is empty
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

  return db;
}

module.exports = { getDb, initDb };

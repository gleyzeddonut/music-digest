const express = require('express');
const path = require('path');
const { getDb } = require('../db/init');
const { runDigest } = require('../processor/digest');
const { getAuthUrl, handleCallback, isConnected, getPlaylistUrl } = require('../processor/spotify');
const { sendDigestEmail } = require('./email');

// config-store is only available and callable in Electron context
const configStore = process.versions.electron
  ? require('../electron/config-store')
  : { getConfig: () => null, setConfig: () => {} };

const router = express.Router();

// Persists user-supplied setup values to all three stores so the current
// session, DB scheduler, and next app launch all see the new values.
function persistSetupConfig(digestTo, claudeApiKey, userName) {
  configStore.setConfig('digest_to', digestTo);
  if (claudeApiKey) configStore.setConfig('claude_api_key', claudeApiKey);

  const set = (k, v) => getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, v);
  set('digest_to', digestTo);
  if (userName) set('user_name', userName);

  process.env.DIGEST_TO = digestTo;
}

// ── Log streaming ─────────────────────────────────────────────
const sseClients = new Set();

function broadcastLog(level, args) {
  if (sseClients.size === 0) return;
  const msg = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : String(a))).join(' ');
  const payload = JSON.stringify({ level, msg });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch (_) {}
  }
}

// ── Setup (first-run) ──────────────────────────────────────────

router.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup.html'));
});

// Route guard: redirect to /setup if digest email not yet configured
router.get('/', (req, res, next) => {
  if (process.versions.electron) {
    if (!configStore.getConfig('digest_to')) return res.redirect('/setup');
  }
  next(); // fall through to express.static which serves public/index.html
});

router.post('/api/setup', (req, res) => {
  if (!process.versions.electron) return res.status(404).json({ error: 'Not available outside Electron' });
  const { digestTo, claudeApiKey, userName } = req.body;
  if (!digestTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digestTo)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  persistSetupConfig(digestTo.trim(), claudeApiKey?.trim() || null, userName?.trim() || null);
  res.json({ ok: true });
});

// ── Electron system settings ───────────────────────────────────

router.get('/api/settings/login-item', (req, res) => {
  if (!process.versions.electron) return res.json({ isElectron: false, enabled: false });
  const { app } = require('electron');
  res.json({ isElectron: true, enabled: app.getLoginItemSettings().openAtLogin });
});

router.post('/api/settings/login-item', (req, res) => {
  if (!process.versions.electron) return res.status(404).json({ error: 'Not available outside Electron' });
  const { enabled } = req.body;
  const { app } = require('electron');
  app.setLoginItemSettings({ openAtLogin: !!enabled });
  res.json({ ok: true });
});

// Update user-configurable config values.
// Unlike persistSetupConfig (which sets all fields unconditionally), this is a
// patch-style route: only fields present in the request body are updated.
router.post('/api/settings/config', (req, res) => {
  if (!process.versions.electron) return res.status(404).json({ error: 'Not available outside Electron' });
  const { digestTo, claudeApiKey } = req.body;

  if (digestTo?.trim()) {
    configStore.setConfig('digest_to', digestTo.trim());
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('digest_to', digestTo.trim());
    process.env.DIGEST_TO = digestTo.trim();
  }
  if (claudeApiKey !== undefined) {
    configStore.setConfig('claude_api_key', claudeApiKey.trim() || null);
  }
  res.json({ ok: true });
});

// ── Spotify OAuth ─────────────────────────────────────────────

router.get('/auth/spotify', async (req, res) => {
  try {
    res.redirect(await getAuthUrl());
  } catch (err) {
    res.send(`<script>window.location='/?spotify_error=${encodeURIComponent(err.message)}'</script>`);
  }
});

router.get('/auth/spotify/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<script>window.location='/?spotify_error=${error}'</script>`);
  try {
    await handleCallback(code);
    res.send(`<script>window.location='/?spotify_connected=1'</script>`);
  } catch (err) {
    res.send(`<script>window.location='/?spotify_error=${encodeURIComponent(err.message)}'</script>`);
  }
});

// ── Digest API ────────────────────────────────────────────────

router.get('/api/digest/latest', (req, res) => {
  const db = getDb();
  const digest = db.prepare('SELECT * FROM digests ORDER BY date DESC LIMIT 1').get();
  if (!digest) return res.json(null);
  res.json(parseDigest(digest));
});

router.get('/api/digests/:date', (req, res) => {
  const digest = getDb().prepare('SELECT * FROM digests WHERE date = ?').get(req.params.date);
  if (!digest) return res.status(404).json({ error: 'Not found' });
  res.json(parseDigest(digest));
});

router.post('/api/digests/:date/resend', async (req, res) => {
  const config = require('../config');
  if (!config.SMTP_USER || !config.SMTP_PASS) {
    return res.status(400).json({ error: 'Email not configured — add SMTP credentials in settings' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM digests WHERE date = ?').get(req.params.date);
  if (!row) return res.status(404).json({ error: 'Digest not found' });

  const result = parseDigest(row);
  const added = db.prepare(
    'SELECT track_name AS title, artist_name AS artist, track_id AS id FROM playlist_tracks WHERE digest_date = ?'
  ).all(req.params.date);
  const addedTitles = new Set(added.map(a => (a.title || '').toLowerCase()));
  const unmatched = result.songs.filter(s => !addedTitles.has((s.title || '').toLowerCase()));

  try {
    const sent = await sendDigestEmail(req.params.date, result, row.playlist_url, added, unmatched);
    res.json({ ok: sent, error: sent ? null : 'Send failed — check SMTP settings' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/digests', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page || '1', 10);
  const limit = 20;
  const offset = (page - 1) * limit;
  const digests = db.prepare('SELECT * FROM digests ORDER BY date DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as n FROM digests').get().n;
  res.json({ digests: digests.map(parseDigest), total, page });
});

// ── Sources API ───────────────────────────────────────────────

router.get('/api/sources', (req, res) => {
  const sources = getDb().prepare('SELECT * FROM sources ORDER BY type, name').all();
  res.json(sources);
});

router.post('/api/sources', (req, res) => {
  const { type, name, url, selector } = req.body;
  if (!type || !name || !url) return res.status(400).json({ error: 'type, name, url required' });
  if (!['reddit', 'rss', 'html', 'tiktok', 'spotify-playlist'].includes(type)) return res.status(400).json({ error: 'type must be reddit, rss, html, tiktok, or spotify-playlist' });

  try {
    const result = getDb().prepare(
      'INSERT OR IGNORE INTO sources (type, name, url, selector) VALUES (?, ?, ?, ?)'
    ).run(type, name, url.trim(), selector || null);
    if (result.changes === 0) return res.status(409).json({ error: 'A source with that URL already exists' });
    res.json({ id: result.lastInsertRowid, type, name, url, enabled: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/api/sources/:id', (req, res) => {
  const { id } = req.params;
  const { enabled, name, selector } = req.body;
  const db = getDb();
  if (enabled !== undefined) db.prepare('UPDATE sources SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  if (name !== undefined) db.prepare('UPDATE sources SET name = ? WHERE id = ?').run(name, id);
  if (selector !== undefined) db.prepare('UPDATE sources SET selector = ? WHERE id = ?').run(selector, id);
  res.json({ ok: true });
});

router.delete('/api/sources/:id', (req, res) => {
  getDb().prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Test-scrape a single source
router.post('/api/sources/:id/test', async (req, res) => {
  const source = getDb().prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'Not found' });

  try {
    let items;
    if (source.type === 'reddit') {
      const { scrapeReddit } = require('../scraper/reddit');
      const result = await scrapeReddit([source]);
      items = result[0]?.posts || [];
    } else if (source.type === 'tiktok') {
      const { scrapeTikTok } = require('../scraper/tiktok');
      const result = await scrapeTikTok([source]);
      items = result[0]?.items || [];
    } else if (source.type === 'spotify-playlist') {
      const { scrapeSpotifyPlaylists } = require('../scraper/spotifyPlaylist');
      const result = await scrapeSpotifyPlaylists([source]);
      items = result[0]?.items || [];
    } else {
      const { scrapeWeb } = require('../scraper/web');
      const result = await scrapeWeb([source]);
      items = result[0]?.items || [];
    }
    res.json({ ok: true, count: items.length, sample: items.slice(0, 5) });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Settings API ──────────────────────────────────────────────

router.get('/api/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const dbSettings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const config = require('../config');
  const db_get = (key, fallback) => { const v = dbSettings[key]; return v != null ? v : fallback; };
  res.json({
    email:           db_get('digest_to',            config.DIGEST_TO),
    sendTime:        db_get('schedule_send_time',   config.SEND_TIME),
    frequency:       db_get('schedule_frequency',   'daily'),
    weekDay:         parseInt(db_get('schedule_week_day',   '5'),  10),
    monthDate:       parseInt(db_get('schedule_month_date', '1'),  10),
    scheduleEnabled: db_get('schedule_enabled', '1') !== '0',
    userName:        db_get('user_name', ''),
    timezone: config.TIMEZONE,
    spotify: {
      connected: isConnected(),
      playlistUrl: getPlaylistUrl(),
    },
  });
});

// ── Schedule settings ─────────────────────────────────────────

router.post('/api/settings/schedule', (req, res) => {
  const { sendTime, frequency, weekDay, monthDate, digestTo, enabled, userName } = req.body;
  if (!sendTime || !/^\d{1,2}:\d{2}$/.test(sendTime)) {
    return res.status(400).json({ error: 'sendTime must be HH:MM format' });
  }
  if (frequency && !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return res.status(400).json({ error: 'frequency must be daily, weekly, or monthly' });
  }
  const db = getDb();
  const set = (k, v) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(k, v);
  set('schedule_send_time', sendTime);
  if (enabled !== undefined) set('schedule_enabled', enabled ? '1' : '0');
  if (frequency) set('schedule_frequency', frequency);
  if (weekDay !== undefined) set('schedule_week_day', String(weekDay));
  if (monthDate !== undefined) set('schedule_month_date', String(monthDate));
  if (userName !== undefined) set('user_name', userName.trim());
  if (digestTo) {
    set('digest_to', digestTo.trim());
    // Keep config-store and process.env in sync so Electron reads the correct
    // email on next launch and the running session delivers to the right address.
    if (process.versions.electron) {
      configStore.setConfig('digest_to', digestTo.trim());
      process.env.DIGEST_TO = digestTo.trim();
    }
  }
  res.json({ ok: true });
});

// ── Manual run ────────────────────────────────────────────────

router.get('/api/run/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ level: 'ready', msg: '' })}\n\n`);
  req.on('close', () => sseClients.delete(res));
});

router.post('/api/run', async (req, res) => {
  const { force } = req.body;
  res.json({ ok: true });

  const origLog   = console.log;
  const origWarn  = console.warn;
  const origError = console.error;
  console.log   = (...a) => { origLog(...a);   broadcastLog('log',   a); };
  console.warn  = (...a) => { origWarn(...a);  broadcastLog('warn',  a); };
  console.error = (...a) => { origError(...a); broadcastLog('error', a); };

  try {
    await runDigest({ force: !!force });
  } catch (err) {
    broadcastLog('error', ['[run] Error: ' + err.message]);
  } finally {
    console.log   = origLog;
    console.warn  = origWarn;
    console.error = origError;
    const done = JSON.stringify({ level: 'done', msg: '' });
    for (const client of sseClients) {
      try { client.write(`data: ${done}\n\n`); } catch (_) {}
    }
  }
});

// ── Status ────────────────────────────────────────────────────

router.get('/api/status', (req, res) => {
  const db = getDb();
  const lastDigest = db.prepare('SELECT date, created_at FROM digests ORDER BY date DESC LIMIT 1').get();
  const config = require('../config');
  res.json({
    spotify: { connected: isConnected(), playlistUrl: getPlaylistUrl() },
    lastDigest: lastDigest || null,
    sendTime: config.SEND_TIME,
    timezone: config.TIMEZONE,
    sourcesCount: db.prepare('SELECT COUNT(*) as n FROM sources WHERE enabled = 1').get().n,
    tracksInPlaylist: db.prepare('SELECT COUNT(*) as n FROM playlist_tracks').get().n,
    userName: db.prepare("SELECT value FROM settings WHERE key = 'user_name'").get()?.value || '',
  });
});

function parseDigest(d) {
  return {
    ...d,
    artists: safeJson(d.artists, []),
    songs: safeJson(d.songs, []),
    headlines: safeJson(d.headlines, []),
  };
}

function safeJson(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

module.exports = router;

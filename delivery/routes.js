const express = require('express');
const path = require('path');
const { getDb } = require('../db/init');
const { runDigest } = require('../processor/digest');
const { getAuthUrl, handleCallback, isConnected, getPlaylistUrl, getAccessToken } = require('../processor/spotify');
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
let runLogBuffer = [];   // replayed to late-connecting panels
let runInProgress = false;

function broadcastLog(level, args) {
  const msg = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : String(a))).join(' ');
  const payload = JSON.stringify({ level, msg });
  runLogBuffer.push(payload);
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch (_) {}
  }
}

// ── Setup (first-run) ──────────────────────────────────────────

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

function callbackPage(status, message) {
  const ok = status === 'success';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #e0e0e0; }
  .box { text-align: center; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  p { margin: 0; font-size: 15px; opacity: 0.7; }
</style>
</head><body><div class="box">
  <div class="icon">${ok ? '✓' : '✕'}</div>
  <p>${message}</p>
</div>
<script>window.close();</script>
</body></html>`;
}

// Returns the Spotify auth URL as JSON so the frontend can open it externally
router.get('/auth/spotify/url', async (req, res) => {
  try {
    res.json({ url: await getAuthUrl() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auth/spotify', async (req, res) => {
  console.log('[auth] /auth/spotify hit — referer:', req.headers.referer, 'user-agent:', req.headers['user-agent']?.slice(0, 60));
  try {
    const url = await getAuthUrl();
    console.log('[auth] redirecting to:', url.slice(0, 80));
    res.redirect(url);
  } catch (err) {
    res.send(`<script>window.location='/?spotify_error=${encodeURIComponent(err.message)}'</script>`);
  }
});

router.get('/auth/spotify/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(callbackPage('error', `Spotify error: ${error}`));
  try {
    await handleCallback(code);
    res.send(callbackPage('success', 'Spotify connected! You can close this tab.'));
  } catch (err) {
    res.send(callbackPage('error', err.message));
  }
});

router.delete('/auth/spotify', (req, res) => {
  const db = getDb();
  const del = (k) => db.prepare('DELETE FROM settings WHERE key = ?').run(k);
  del('spotify_access_token');
  del('spotify_refresh_token');
  del('spotify_token_expires_at');
  del('spotify_playlist_id');
  db.prepare('DELETE FROM playlist_tracks').run();
  res.json({ ok: true });
});

// ── Spotify token (for Web Playback SDK) ──────────────────────

router.get('/api/spotify/token', async (req, res) => {
  try {
    const token = await getAccessToken();
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  const db = getDb();
  const row = db.prepare('SELECT * FROM digests WHERE date = ?').get(req.params.date);
  if (!row) return res.status(404).json({ error: 'Digest not found' });

  const to = db.prepare("SELECT value FROM settings WHERE key = 'digest_to'").get()?.value;
  if (!to) return res.status(400).json({ error: 'No recipient email configured — set one in Settings → Delivery' });

  const result = parseDigest(row);
  const added = db.prepare(
    'SELECT track_name AS title, artist_name AS artist, track_id AS id FROM playlist_tracks WHERE digest_date = ?'
  ).all(req.params.date);
  const addedTitles = new Set(added.map(a => (a.title || '').toLowerCase()));
  const unmatched = result.songs.filter(s => !addedTitles.has((s.title || '').toLowerCase()));

  try {
    const sent = await sendDigestEmail(req.params.date, result, row.playlist_url, added, unmatched);
    res.json({ ok: sent, error: sent ? null : 'Send failed — check your recipient email in Settings' });
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

router.delete('/api/digests', (req, res) => {
  const { dates } = req.body || {};
  if (!Array.isArray(dates) || dates.length === 0)
    return res.status(400).json({ error: 'dates array required' });
  try {
    const db = getDb();
    const ph = dates.map(() => '?').join(',');
    db.prepare(`DELETE FROM digests WHERE date IN (${ph})`).run(dates);
    res.json({ ok: true, deleted: dates.length });
  } catch (err) {
    console.error('[routes] DELETE /api/digests failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/monthly/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const db = getDb();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const label = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const rows = db.prepare(
    'SELECT date, artists, songs, headlines FROM digests WHERE date LIKE ? ORDER BY date ASC'
  ).all(`${prefix}-%`);

  if (rows.length === 0) {
    return res.json({ month: label, monthKey: prefix, digestCount: 0, headlineCount: 0, artists: [], songs: [] });
  }

  const artistMap = new Map();
  const songMap   = new Map();
  let headlineCount = 0;

  for (const row of rows) {
    const artists  = safeJson(row.artists,  []);
    const songs    = safeJson(row.songs,    []);
    const headlines = safeJson(row.headlines, []);
    headlineCount += headlines.length;

    for (const a of artists) {
      if (!a.name) continue;
      const key = a.name.toLowerCase();
      if (!artistMap.has(key)) artistMap.set(key, { name: a.name, count: 0, reasons: [], tier: a.tier || 'rising' });
      const e = artistMap.get(key);
      e.count++;
      if (a.reason) e.reasons.push(a.reason);
      if (a.tier === 'breaking') e.tier = 'breaking';
    }

    for (const s of songs) {
      if (!s.title) continue;
      const key = `${s.title.toLowerCase()}::${(s.artist || '').toLowerCase()}`;
      if (!songMap.has(key)) songMap.set(key, { title: s.title, artist: s.artist || '', count: 0 });
      songMap.get(key).count++;
    }
  }

  const artists = [...artistMap.values()].sort((a, b) => b.count - a.count);
  const songs   = [...songMap.values()].sort((a, b) => b.count - a.count).slice(0, 20);

  res.json({
    month: label,
    monthKey: prefix,
    digestCount: rows.length,
    headlineCount,
    artists,
    songs,
    topArtist: artists[0] || null,
    topSong:   songs[0]   || null,
  });
});

router.get('/api/playlist_tracks', (req, res) => {
  const tracks = getDb()
    .prepare('SELECT track_id AS spotify_id, track_name AS title, artist_name AS artist, added_at, digest_date FROM playlist_tracks ORDER BY added_at DESC')
    .all();
  res.json({ tracks });
});

// ── Sources API ───────────────────────────────────────────────

router.get('/api/sources', (req, res) => {
  const sources = getDb().prepare('SELECT * FROM sources ORDER BY type, name').all();
  res.json(sources);
});

router.post('/api/sources', (req, res) => {
  const { type, name, url, selector } = req.body;
  if (!type || !name || !url) return res.status(400).json({ error: 'type, name, url required' });
  if (!['reddit', 'rss', 'html', 'tiktok', 'spotify-playlist', 'tokchart'].includes(type)) return res.status(400).json({ error: 'Invalid source type' });

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
      items = result.formatted?.[0]?.items || [];
    } else if (source.type === 'spotify-playlist') {
      const { scrapeSpotifyPlaylists } = require('../scraper/spotifyPlaylist');
      const result = await scrapeSpotifyPlaylists([source]);
      items = result[0]?.items || [];
    } else if (source.type === 'tokchart') {
      const { scrapeTokchart } = require('../scraper/tokchart');
      items = await scrapeTokchart();
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
    email:           db_get('digest_to',            ''),
    sendTime:        db_get('schedule_send_time',   config.SEND_TIME),
    frequency:       db_get('schedule_frequency',   'daily'),
    weekDay:         parseInt(db_get('schedule_week_day',   '5'),  10),
    monthDate:       parseInt(db_get('schedule_month_date', '1'),  10),
    scheduleEnabled: db_get('schedule_enabled', '1') !== '0',
    userName:        db_get('user_name', ''),
    timezone:        config.TIMEZONE,
    spotify: {
      connected: isConnected(),
      playlistUrl: getPlaylistUrl(),
      playlistName: db_get('spotify_playlist_name', '🎵 Music Digest'),
    },
  });
});

router.post('/api/settings/spotify-playlist-name', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('spotify_playlist_name', name.trim());
  res.json({ ok: true });
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
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setNoDelay(true);
  res.flushHeaders();
  // Replay logs from the current run so late-opening panels catch up
  for (const entry of runLogBuffer) {
    res.write(`data: ${entry}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ level: 'ready', msg: '' })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

router.post('/api/run', async (req, res) => {
  if (runInProgress) return res.status(409).json({ error: 'Run already in progress' });
  const { force } = req.body;
  res.json({ ok: true });

  runInProgress = true;
  runLogBuffer = [];

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
    broadcastLog('done', ['']);  // routes done through buffer so late panels see it
    runLogBuffer = [];           // clear after done — panels opening between runs see nothing stale
    runInProgress = false;
  }
});

// ── Status ────────────────────────────────────────────────────

router.get('/api/status', (req, res) => {
  const db = getDb();
  const lastDigest = db.prepare('SELECT date, created_at FROM digests ORDER BY date DESC LIMIT 1').get();
  const config = require('../config');
  const digestTo = db.prepare("SELECT value FROM settings WHERE key = 'digest_to'").get()?.value || '';
  res.json({
    spotify: { connected: isConnected(), playlistUrl: getPlaylistUrl() },
    lastDigest: lastDigest || null,
    sendTime: config.SEND_TIME,
    timezone: config.TIMEZONE,
    sourcesCount: db.prepare('SELECT COUNT(*) as n FROM sources WHERE enabled = 1').get().n,
    tracksInPlaylist: db.prepare('SELECT COUNT(*) as n FROM playlist_tracks').get().n,
    userName: db.prepare("SELECT value FROM settings WHERE key = 'user_name'").get()?.value || '',
    configured: !!digestTo,
  });
});

function parseDigest(d) {
  return {
    ...d,
    artists: safeJson(d.artists, []),
    songs: safeJson(d.songs, []),
    headlines: safeJson(d.headlines, []),
    mentioned_artists: safeJson(d.mentioned_artists, []),
  };
}

function safeJson(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

module.exports = router;

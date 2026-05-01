const axios = require('axios');
const config = require('../config');
const { getDb } = require('../db/init');

const ACCOUNTS_BASE = 'https://accounts.spotify.com';
const API_BASE = 'https://api.spotify.com/v1';
const PLAYLIST_NAME = '🎵 Music Digest';
const PLAYLIST_DESC = 'Daily music discoveries. Auto-updated by Music Digest.';

// ── DB helpers ────────────────────────────────────────────────

function getSetting(key) {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── OAuth URLs ────────────────────────────────────────────────

function getAuthUrl() {
  const scopes = 'playlist-modify-public playlist-modify-private playlist-read-private';
  const params = new URLSearchParams({
    client_id: config.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: config.SPOTIFY_REDIRECT_URI,
    scope: scopes,
    state: 'music-digest',
  });
  return `${ACCOUNTS_BASE}/authorize?${params}`;
}

async function handleCallback(code) {
  const credentials = Buffer.from(
    `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const { data } = await axios.post(
    `${ACCOUNTS_BASE}/api/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.SPOTIFY_REDIRECT_URI,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  setSetting('spotify_access_token', data.access_token);
  setSetting('spotify_refresh_token', data.refresh_token);
  setSetting('spotify_token_expires_at', String(Date.now() + data.expires_in * 1000));
  console.log('[spotify] OAuth complete, tokens saved');
}

// ── Authenticated axios instance ──────────────────────────────

async function getAccessToken() {
  const accessToken = getSetting('spotify_access_token');
  const refreshToken = getSetting('spotify_refresh_token');
  const expiresAt = parseInt(getSetting('spotify_token_expires_at') || '0', 10);

  if (!accessToken || !refreshToken) return null;

  if (Date.now() > expiresAt - 60000) {
    // Refresh
    const credentials = Buffer.from(
      `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    try {
      const { data } = await axios.post(
        `${ACCOUNTS_BASE}/api/token`,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      setSetting('spotify_access_token', data.access_token);
      setSetting('spotify_token_expires_at', String(Date.now() + data.expires_in * 1000));
      console.log('[spotify] Token refreshed');
      return data.access_token;
    } catch (err) {
      console.error('[spotify] Token refresh failed:', err.response?.data || err.message);
      return null;
    }
  }

  return accessToken;
}

function spotifyApi(token) {
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Playlist management ───────────────────────────────────────

async function getOrCreatePlaylist(api) {
  const existingId = getSetting('spotify_playlist_id');

  if (existingId) {
    try {
      await api.get(`/playlists/${existingId}`);
      return existingId;
    } catch {
      // Playlist deleted — fall through to create
    }
  }

  const { data: me } = await api.get('/me');
  const { data: playlist } = await api.post(`/users/${me.id}/playlists`, {
    name: PLAYLIST_NAME,
    description: PLAYLIST_DESC,
    public: true,
  });

  setSetting('spotify_playlist_id', playlist.id);
  console.log(`[spotify] Created playlist: ${playlist.external_urls.spotify}`);
  return playlist.id;
}

async function searchTrack(api, title, artist) {
  // Exact query first
  try {
    const { data } = await api.get('/search', {
      params: { q: `track:${title} artist:${artist}`, type: 'track', limit: 3 },
    });
    if (data.tracks.items.length > 0) return data.tracks.items[0];
  } catch {}

  // Fuzzy fallback
  try {
    const { data } = await api.get('/search', {
      params: { q: `${title} ${artist}`, type: 'track', limit: 3 },
    });
    if (data.tracks.items.length > 0) return data.tracks.items[0];
  } catch {}

  return null;
}

async function appendSongsToPlaylist(songs, date) {
  const token = await getAccessToken();
  if (!token) {
    console.warn('[spotify] Not authenticated — skipping playlist update');
    return { added: [], unmatched: [] };
  }

  const api = spotifyApi(token);
  const playlistId = await getOrCreatePlaylist(api);
  const db = getDb();
  const alreadyAdded = db.prepare('SELECT track_id FROM playlist_tracks WHERE track_id = ?');
  const insertTrack = db.prepare(
    'INSERT OR IGNORE INTO playlist_tracks (track_id, track_name, artist_name, digest_date) VALUES (?, ?, ?, ?)'
  );

  const added = [];
  const unmatched = [];
  const urisToAdd = [];

  for (const song of songs) {
    await new Promise(r => setTimeout(r, 300));
    const track = await searchTrack(api, song.title, song.artist);

    if (!track) {
      console.log(`[spotify] No match: "${song.title}" by ${song.artist}`);
      unmatched.push(song);
      continue;
    }

    if (alreadyAdded.get(track.id)) {
      console.log(`[spotify] Already in playlist: "${track.name}"`);
      continue;
    }

    urisToAdd.push(track.uri);
    insertTrack.run(track.id, track.name, track.artists[0]?.name, date);
    added.push({ title: track.name, artist: track.artists[0]?.name, id: track.id });
    console.log(`[spotify] Queued: "${track.name}" by ${track.artists[0]?.name}`);
  }

  if (urisToAdd.length > 0) {
    for (let i = 0; i < urisToAdd.length; i += 100) {
      await api.post(`/playlists/${playlistId}/tracks`, { uris: urisToAdd.slice(i, i + 100) });
    }
    console.log(`[spotify] Added ${urisToAdd.length} tracks to playlist`);
  }

  const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
  return { added, unmatched, playlistUrl };
}

function isConnected() {
  return !!(getSetting('spotify_access_token') && getSetting('spotify_refresh_token'));
}

function getPlaylistUrl() {
  const id = getSetting('spotify_playlist_id');
  return id ? `https://open.spotify.com/playlist/${id}` : null;
}

// ── Read a public playlist ────────────────────────────────────

async function fetchPlaylistTracks(playlistId) {
  const token = await getAccessToken();
  if (!token) {
    console.warn('[spotify] Not authenticated — cannot read playlist');
    return [];
  }

  const api = spotifyApi(token);
  const items = [];
  let url = `/playlists/${playlistId}/tracks?limit=50&fields=next,items(added_at,track(id,name,popularity,artists(name)))`;

  while (url) {
    const { data } = await api.get(url);
    for (const { track } of data.items) {
      if (!track || !track.name) continue;
      items.push({
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        popularity: track.popularity,
      });
    }
    // next is a full URL — strip the base for the axios instance
    url = data.next ? data.next.replace(API_BASE, '') : null;
  }

  return items;
}

module.exports = { getAuthUrl, handleCallback, appendSongsToPlaylist, isConnected, getPlaylistUrl, fetchPlaylistTracks };

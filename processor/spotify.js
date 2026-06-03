const axios    = require('axios');
const supabase = require('../supabase-client');
const auth     = require('../auth-session');
const config   = require('../config');
const { getDb } = require('../db/init');

const API_BASE = 'https://api.spotify.com/v1';
const DEFAULT_PLAYLIST_NAME = '🎵 Music Digest';
const PLAYLIST_DESC = 'Daily music discoveries. Auto-updated by Music Digest.';

// ── DB helpers ────────────────────────────────────────────────

function getSetting(key) {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── OAuth (proxied through Supabase) ──────────────────────────

async function spotifyAuth(body) {
  const res = await fetch(`${supabase.url}/functions/v1/spotify-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await auth.authHeaders()) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Spotify auth proxy error ${res.status}`);
  return res.json();
}

async function getAuthUrl() {
  const { url } = await spotifyAuth({
    action: 'auth-url',
    redirect_uri: config.SPOTIFY_REDIRECT_URI,
  });
  return url;
}

async function handleCallback(code) {
  const data = await spotifyAuth({
    action: 'exchange',
    code,
    redirect_uri: config.SPOTIFY_REDIRECT_URI,
  });

  setSetting('spotify_access_token', data.access_token);
  setSetting('spotify_refresh_token', data.refresh_token);
  setSetting('spotify_token_expires_at', String(Date.now() + data.expires_in * 1000));
  // Clear all playlist IDs (global and per-persona) so they are re-created under the new account
  getDb().prepare("DELETE FROM settings WHERE key = 'spotify_playlist_id'").run();
  getDb().prepare("DELETE FROM settings WHERE key LIKE 'spotify_playlist_id_%'").run();
  console.log('[spotify] OAuth complete, tokens saved');
}

// ── Authenticated axios instance ──────────────────────────────

async function getAccessToken() {
  const accessToken = getSetting('spotify_access_token');
  const refreshToken = getSetting('spotify_refresh_token');
  const expiresAt = parseInt(getSetting('spotify_token_expires_at') || '0', 10);

  if (!accessToken || !refreshToken) return null;

  if (Date.now() > expiresAt - 60000) {
    try {
      const data = await spotifyAuth({ action: 'refresh', refresh_token: refreshToken });
      setSetting('spotify_access_token', data.access_token);
      setSetting('spotify_token_expires_at', String(Date.now() + data.expires_in * 1000));
      console.log('[spotify] Token refreshed');
      return data.access_token;
    } catch (err) {
      console.error('[spotify] Token refresh failed:', err.message);
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

async function getOrCreatePlaylist(api, personaId) {
  // Only use a per-persona playlist when the persona has a custom name set.
  // Otherwise fall back to the shared default playlist so all personas contribute
  // to the same playlist by default.
  const customName = personaId ? getSetting(`spotify_playlist_name_${personaId}`) : null;
  const useShared  = !personaId || !customName;

  const idKey  = useShared ? 'spotify_playlist_id' : `spotify_playlist_id_${personaId}`;
  const name   = useShared
    ? (getSetting('spotify_playlist_name') || DEFAULT_PLAYLIST_NAME)
    : customName;

  const existingId = getSetting(idKey);
  const { data: me } = await api.get('/me');

  if (existingId) {
    try {
      const { data: pl } = await api.get(`/playlists/${existingId}`);
      if (pl.owner?.id === me.id) {
        if (pl.name !== name) {
          await api.put(`/playlists/${existingId}`, { name });
          console.log(`[spotify] Renamed playlist to "${name}"`);
        }
        return existingId;
      }
      console.log('[spotify] Stored playlist belongs to a different account — creating new one');
    } catch {
      // Playlist deleted or inaccessible — fall through to create
    }
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(idKey);
  }

  const { data: playlist } = await api.post(`/users/${me.id}/playlists`, {
    name,
    description: PLAYLIST_DESC,
    public: true,
  });

  setSetting(idKey, playlist.id);
  // New playlist — local dedup records for this persona are now stale
  if (personaId != null) {
    getDb().prepare('DELETE FROM playlist_tracks WHERE persona_id = ?').run(personaId);
  } else {
    getDb().prepare('DELETE FROM playlist_tracks WHERE persona_id IS NULL').run();
  }
  console.log(`[spotify] Created playlist "${name}": ${playlist.external_urls.spotify}`);
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

async function appendSongsToPlaylist(songs, date, personaId) {
  const token = await getAccessToken();
  if (!token) {
    console.warn('[spotify] Not authenticated — skipping playlist update');
    return { added: [], unmatched: [] };
  }

  // Only add songs with corroborating signal: on any chart OR mentioned in 2+ sources
  const eligible = songs.filter(s => s.lfm_rank || s.genius_rank || s.shazam_rank || s.spotify_rank || s.apple_rank || s.tokchart_score || (s.sources?.length || 0) >= 2);
  const skipped  = songs.length - eligible.length;
  if (skipped > 0) console.log(`[spotify] Skipping ${skipped} low-signal song(s)`);
  songs = eligible;

  const api = spotifyApi(token);
  const playlistId = await getOrCreatePlaylist(api, personaId);
  const db = getDb();
  const alreadyAdded = db.prepare('SELECT track_id FROM playlist_tracks WHERE track_id = ? AND persona_id = ?');
  const insertTrack = db.prepare(
    'INSERT OR IGNORE INTO playlist_tracks (track_id, persona_id, track_name, artist_name, digest_date) VALUES (?, ?, ?, ?, ?)'
  );

  const added = [];
  const unmatched = [];
  const tracksToAdd = [];

  for (const song of songs) {
    await new Promise(r => setTimeout(r, 300));
    const track = await searchTrack(api, song.title, song.artist);

    if (!track) {
      console.log(`[spotify] No match: "${song.title}" by ${song.artist}`);
      unmatched.push(song);
      continue;
    }

    if (alreadyAdded.get(track.id, personaId)) {
      console.log(`[spotify] Already in playlist: "${track.name}"`);
      continue;
    }

    tracksToAdd.push({ uri: track.uri, id: track.id, name: track.name, artist: track.artists[0]?.name, preview_url: track.preview_url || null });
    console.log(`[spotify] Queued: "${track.name}" by ${track.artists[0]?.name}`);
  }

  if (tracksToAdd.length > 0) {
    const uris = tracksToAdd.map(t => t.uri);
    for (let i = 0; i < uris.length; i += 100) {
      await api.post(`/playlists/${playlistId}/tracks`, { uris: uris.slice(i, i + 100) });
    }
    // Only mark as added in local DB after Spotify confirms them
    for (const t of tracksToAdd) {
      insertTrack.run(t.id, personaId, t.name, t.artist, date);
      added.push({ title: t.name, artist: t.artist, id: t.id, preview_url: t.preview_url });
    }
    console.log(`[spotify] Added ${tracksToAdd.length} tracks to playlist`);
  }

  const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
  return { added, unmatched, playlistUrl };
}

function isConnected() {
  return !!(getSetting('spotify_access_token') && getSetting('spotify_refresh_token'));
}

function getPlaylistUrl(personaId) {
  const customName = personaId ? getSetting(`spotify_playlist_name_${personaId}`) : null;
  const id = (personaId && customName)
    ? (getSetting(`spotify_playlist_id_${personaId}`) || getSetting('spotify_playlist_id'))
    : getSetting('spotify_playlist_id');
  return id ? `https://open.spotify.com/playlist/${id}` : null;
}

// "Delete" a persona's Spotify playlist. Spotify has no hard delete, so we
// unfollow it — which removes it from the user's library. Returns true if an
// unfollow was attempted, false if the persona had no playlist.
async function deletePersonaPlaylist(personaId) {
  const playlistId = personaId ? getSetting(`spotify_playlist_id_${personaId}`) : null;
  if (!playlistId) return false;
  const token = await getAccessToken();
  if (!token) return false;
  await spotifyApi(token).delete(`/playlists/${playlistId}/followers`);
  return true;
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

module.exports = { getAuthUrl, handleCallback, appendSongsToPlaylist, isConnected, getPlaylistUrl, fetchPlaylistTracks, getAccessToken, deletePersonaPlaylist };

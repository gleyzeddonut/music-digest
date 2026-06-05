const BASE = (typeof window !== 'undefined' && window.location.port === '5173')
  ? 'http://localhost:3001'
  : '';

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  authStatus:    ()                => j('/api/auth/status'),
  login:         (email, password) => j('/api/auth/login',  { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup:        (email, password) => j('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout:        ()                => j('/api/auth/logout', { method: 'POST' }),
  spotifyLoginUrl: ()              => j('/api/auth/spotify-login/url').then(r => r.url),

  status:        ()         => j('/api/status'),
  latestDigest:  ()         => j('/api/digest/latest'),
  digestList:    (page = 1) => j(`/api/digests?page=${page}`),
  digestByDate:  (date)     => j(`/api/digests/${date}`),
  deleteDigests: (dates)    => j('/api/digests', { method: 'DELETE', body: JSON.stringify({ dates }) }),
  resendDigest:  (date)     => j(`/api/digests/${date}/resend`, { method: 'POST' }),
  runDigest:     (force, personaId) => j('/api/run', { method: 'POST', body: JSON.stringify({ force, personaId }) }),
  runStream:     ()         => new EventSource(BASE + '/api/run/stream'),

  sources:       ()         => j('/api/sources'),
  addSource:     (body)     => j('/api/sources', { method: 'POST', body: JSON.stringify(body) }),
  patchSource:   (id, body) => j(`/api/sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delSource:     (id)       => j(`/api/sources/${id}`, { method: 'DELETE' }),
  testSource:    (id)       => j(`/api/sources/${id}/test`, { method: 'POST' }),

  settings:      ()         => j('/api/settings'),
  saveSchedule:  (body)     => j('/api/settings/schedule', { method: 'POST', body: JSON.stringify(body) }),
  saveConfig:    (body)     => j('/api/settings/config',   { method: 'POST', body: JSON.stringify(body) }),
  loginItem:     ()         => j('/api/settings/login-item'),
  setLoginItem:  (enabled)  => j('/api/settings/login-item', { method: 'POST', body: JSON.stringify({ enabled }) }),

  spotifyAuthUrl:          () => `${BASE}/auth/spotify`,
  spotifyAuthUrlJson:      () => j('/auth/spotify/url').then(r => r.url),
  spotifyDisconnect:       () => j('/auth/spotify', { method: 'DELETE' }),
  spotifyToken:            () => j('/api/spotify/token'),
  saveSpotifyPlaylistName: (name) => j('/api/settings/spotify-playlist-name', { method: 'POST', body: JSON.stringify({ name }) }),
  monthly:   (year, month) => j(`/api/monthly/${year}/${month}`),

  personas:       ()         => j('/api/personas'),
  activePersona:  ()         => j('/api/personas/active'),
  setActivePersona: (id)     => j('/api/personas/active', { method: 'POST', body: JSON.stringify({ id }) }),
  createPersona:  (body)     => j('/api/personas', { method: 'POST', body: JSON.stringify(body) }),
  updatePersona:  (id, body) => j(`/api/personas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePersona:  (id)       => j(`/api/personas/${id}`, { method: 'DELETE' }),
};

export function bgFromName(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 55% 50%), hsl(${hue2} 45% 25%))`;
}

export function weekOfYear(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
}

export function msToMinSec(ms) {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function formatStreams(n) {
  if (n > 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}

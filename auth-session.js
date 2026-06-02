'use strict';

// Owns the Supabase user session for this install. The renderer logs in/out via
// the local server's /api/auth routes, which call into here. Every proxy + email
// request attaches the signed-in user's access token (via authHeaders()), which
// is what the edge functions now require. The refresh token is persisted
// encrypted (Electron safeStorage) so the app stays signed in across restarts —
// the scheduler needs a live session to send the daily digest.

const fs = require('fs');
const path = require('path');
const { url: SUPABASE_URL, anonKey: ANON_KEY } = require('./supabase-client');

const isElectron = !!process.versions.electron;

// In-memory session: { access_token, refresh_token, expires_at(ms epoch), email }
let session = null;
let refreshPromise = null;

// ── Persistence (refresh token, encrypted when possible) ──────────────────────

function authFilePath() {
  if (isElectron) {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'auth.json');
  }
  return path.join(__dirname, '.auth.json'); // dev fallback (gitignored)
}

function getSafeStorage() {
  if (!isElectron) return null;
  try {
    const { safeStorage } = require('electron');
    return safeStorage.isEncryptionAvailable() ? safeStorage : null;
  } catch {
    return null;
  }
}

function persist() {
  const p = authFilePath();
  try {
    if (!session?.refresh_token) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return;
    }
    const ss = getSafeStorage();
    const payload = ss
      ? { enc: ss.encryptString(session.refresh_token).toString('base64') }
      : { refresh_token: session.refresh_token };
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(payload), { mode: 0o600 });
  } catch (err) {
    console.warn('[auth] Could not persist session:', err.message);
  }
}

function loadPersistedRefreshToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(authFilePath(), 'utf8'));
    if (raw.enc) {
      const ss = getSafeStorage();
      return ss ? ss.decryptString(Buffer.from(raw.enc, 'base64')) : null;
    }
    return raw.refresh_token || null;
  } catch {
    return null;
  }
}

// ── Supabase Auth REST ────────────────────────────────────────────────────────

async function authFetch(pathname, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.error || `Auth error ${res.status}`);
  }
  return data;
}

function setSession(data) {
  if (!data?.access_token) return false;
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    email: data.user?.email || session?.email || null,
  };
  persist();
  return true;
}

function getStatus() {
  return { authenticated: !!session?.access_token, email: session?.email || null };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const data = await authFetch('token?grant_type=password', { email, password });
  setSession(data);
  return getStatus();
}

async function signUp(email, password) {
  const data = await authFetch('signup', { email, password });
  if (setSession(data)) return { ...getStatus(), needsConfirmation: false };
  // Email confirmation is enabled on the project — no session until confirmed.
  return { authenticated: false, email, needsConfirmation: true };
}

async function signOut() {
  if (session?.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` },
      });
    } catch { /* best-effort revoke */ }
  }
  session = null;
  persist();
  return getStatus();
}

async function refresh() {
  const rt = session?.refresh_token || loadPersistedRefreshToken();
  if (!rt) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const data = await authFetch('token?grant_type=refresh_token', { refresh_token: rt });
      return setSession(data);
    } catch (err) {
      console.warn('[auth] Refresh failed:', err.message);
      session = null;
      persist();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// Returns a valid access token, refreshing if it's expired/near-expiry, or null
// if the user isn't signed in.
async function getAccessToken() {
  if (session?.access_token && Date.now() < session.expires_at - 60_000) {
    return session.access_token;
  }
  const ok = await refresh();
  return ok ? session.access_token : null;
}

// Headers for an authenticated edge-function call. Throws if not signed in so
// callers fail loudly rather than silently hitting a 401.
async function authHeaders() {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  return { apikey: ANON_KEY, Authorization: `Bearer ${token}` };
}

// Called once on server boot: revive a persisted session so the scheduler can
// send digests without the user re-logging in.
async function restore() {
  const rt = loadPersistedRefreshToken();
  if (rt) {
    session = { access_token: null, refresh_token: rt, expires_at: 0, email: null };
    await refresh();
  }
  return getStatus();
}

module.exports = { signIn, signUp, signOut, getStatus, getAccessToken, authHeaders, restore };

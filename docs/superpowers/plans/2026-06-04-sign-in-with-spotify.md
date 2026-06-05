# Sign in with Spotify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sign in with Spotify" login option that, in one authorization, both signs the user into their Supabase account and connects their Spotify for playlist building — offered alongside the existing email login.

**Architecture:** Use Supabase Auth's native Spotify provider. The app opens `…/auth/v1/authorize?provider=spotify&redirect_to=musicdigest://auth-callback&scopes=…`; Supabase runs the OAuth dance and redirects back to the existing `musicdigest://auth-callback` deep link with both the Supabase session tokens and Spotify's `provider_token`/`provider_refresh_token`. The deep-link handler forwards all tokens to the local server, which establishes the session and persists the Spotify tokens into the local `settings` table (reusing the existing token-refresh path, since one Spotify app backs both login and playlists).

**Tech Stack:** Node/Express (local server), Electron (main process + renderer), React (renderer UI), better-sqlite3 (local `settings`), Supabase Auth, Spotify Web API.

**Spec:** `docs/superpowers/specs/2026-06-04-sign-in-with-spotify-design.md`

---

## Testing convention (read first)

This repo's tests are standalone Node scripts under `test/` using `assert` and
`console.log('✓ …')`, run directly: `node test/<file>.test.js` (exit 0 = pass).
They stub `global.fetch` and inject modules via `require.cache`. There is **no
route/Electron/React test harness** in this codebase, so Tasks 1–2 are TDD with
unit tests; Tasks 3–5 ship complete code plus explicit manual verification (the
established pattern for those layers). Task 6 is the end-to-end smoke test.

## File structure

- `processor/spotify.js` — add `connectFromProviderTokens()` (persist Spotify tokens from a sign-in grant). **Modify.**
- `auth-session.js` — extend `setSessionFromTokens()` to accept + hand off provider tokens. **Modify.**
- `delivery/routes.js` — `/api/auth/session` accepts provider tokens; add `GET /api/auth/spotify-login/url`. **Modify.**
- `electron/main.js` — `handleDeepLink` extracts provider tokens into the POST body. **Modify.**
- `src/api.js` — add `spotifyLoginUrl()`. **Modify.**
- `src/AuthScreen.jsx` — add the "Sign in with Spotify" button. **Modify.**
- `test/spotify-provider-connect.test.js` — unit test for Task 1. **Create.**
- `test/auth-session-provider.test.js` — unit test for Task 2. **Create.**
- `CHANGELOG.md` — Unreleased entry. **Modify.**

---

## Task 1: Persist Spotify tokens from a sign-in grant

**Files:**
- Modify: `processor/spotify.js` (add function near `handleCallback`, ~line 56; extend `module.exports`, line 264)
- Test: `test/spotify-provider-connect.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/spotify-provider-connect.test.js`. NOTE: `db/init`'s `better-sqlite3`
is compiled for Electron's ABI, not system Node, so it can't be loaded in a
`node test/*.js` run. Stub `db/init` with a Map-backed fake DB (mirroring the
prepared statements the function uses) instead of an in-memory better-sqlite3:

```js
const assert = require('assert');

const store = new Map();
const fakeDb = {
  prepare(sql) {
    return {
      run(...args) {
        if (sql.startsWith('INSERT OR REPLACE INTO settings')) store.set(args[0], args[1]);
        else if (sql.includes("key = 'spotify_playlist_id'")) store.delete('spotify_playlist_id');
        else if (sql.includes("key LIKE 'spotify_playlist_id_%'")) {
          for (const k of [...store.keys()]) if (k.startsWith('spotify_playlist_id_')) store.delete(k);
        }
      },
      get(...args) {
        if (sql.startsWith('SELECT value FROM settings')) {
          const v = store.get(args[0]);
          return v === undefined ? undefined : { value: v };
        }
        return undefined;
      },
    };
  },
};
require.cache[require.resolve('../db/init')] = {
  id: require.resolve('../db/init'),
  filename: require.resolve('../db/init'),
  loaded: true,
  exports: { getDb: () => fakeDb },
};

delete require.cache[require.resolve('../processor/spotify')];
const spotify = require('../processor/spotify');

const get = (k) => store.get(k);

(function run() {
  store.set('spotify_playlist_id', 'OLD');
  store.set('spotify_playlist_id_2', 'OLD2');

  const ok = spotify.connectFromProviderTokens('ACCESS_X', 'REFRESH_X', 3600);
  assert.strictEqual(ok, true, 'returns true when an access token is provided');
  assert.strictEqual(get('spotify_access_token'), 'ACCESS_X');
  assert.strictEqual(get('spotify_refresh_token'), 'REFRESH_X');
  assert.ok(Number(get('spotify_token_expires_at')) > Date.now(), 'expiry is in the future');
  assert.strictEqual(get('spotify_playlist_id'), undefined, 'stale global playlist id cleared');
  assert.strictEqual(get('spotify_playlist_id_2'), undefined, 'stale per-persona playlist id cleared');
  console.log('✓ persists tokens and clears stale playlist ids');

  const ok2 = spotify.connectFromProviderTokens('ACCESS_Y', null, 3600);
  assert.strictEqual(ok2, true);
  assert.strictEqual(get('spotify_access_token'), 'ACCESS_Y');
  assert.strictEqual(get('spotify_refresh_token'), 'REFRESH_X', 'kept existing refresh token');
  console.log('✓ missing provider_refresh_token preserves the stored one');

  assert.strictEqual(spotify.connectFromProviderTokens(null, null, 3600), false);
  console.log('✓ returns false with no access token');

  console.log('\nspotify-provider-connect test passed.');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/spotify-provider-connect.test.js`
Expected: FAIL — `TypeError: spotify.connectFromProviderTokens is not a function`

- [ ] **Step 3: Implement `connectFromProviderTokens`**

In `processor/spotify.js`, immediately after the `handleCallback` function (after line 56), add:

```js
// Connect Spotify directly from the provider tokens Supabase returns when a user
// signs in with Spotify (no separate Connect step). Mirrors handleCallback's
// token persistence. Spotify only returns a refresh token on the first grant, so
// keep the stored one when none is supplied.
function connectFromProviderTokens(accessToken, refreshToken, expiresIn) {
  if (!accessToken) return false;
  setSetting('spotify_access_token', accessToken);
  if (refreshToken) setSetting('spotify_refresh_token', refreshToken);
  setSetting('spotify_token_expires_at', String(Date.now() + (Number(expiresIn) || 3600) * 1000));
  // New account/grant — clear playlist IDs so they're re-created under it.
  getDb().prepare("DELETE FROM settings WHERE key = 'spotify_playlist_id'").run();
  getDb().prepare("DELETE FROM settings WHERE key LIKE 'spotify_playlist_id_%'").run();
  console.log('[spotify] Connected via provider tokens from Spotify sign-in');
  return true;
}
```

Then add `connectFromProviderTokens` to the `module.exports` object (line 264):

```js
module.exports = { getAuthUrl, handleCallback, connectFromProviderTokens, appendSongsToPlaylist, isConnected, getPlaylistUrl, fetchPlaylistTracks, getAccessToken };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/spotify-provider-connect.test.js`
Expected: PASS — three `✓` lines then `spotify-provider-connect test passed.`

- [ ] **Step 5: Commit**

```bash
git add processor/spotify.js test/spotify-provider-connect.test.js
git commit -m "feat(spotify): persist tokens from a Spotify sign-in grant"
```

---

## Task 2: Hand provider tokens from the session layer to Spotify

**Files:**
- Modify: `auth-session.js` (`setSessionFromTokens`, lines 188-205; `module.exports`, line 207)
- Test: `test/auth-session-provider.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/auth-session-provider.test.js`:

```js
const assert = require('assert');

// Stub the Spotify module so we can assert the handoff without a DB.
let captured = null;
require.cache[require.resolve('../processor/spotify')] = {
  id: require.resolve('../processor/spotify'),
  filename: require.resolve('../processor/spotify'),
  loaded: true,
  exports: {
    connectFromProviderTokens: (a, r, e) => { captured = { a, r, e }; return true; },
  },
};

// Stub Supabase Auth /user lookup (email resolution).
const realFetch = global.fetch;
global.fetch = async (url) => {
  if (String(url).endsWith('/auth/v1/user')) {
    return { ok: true, json: async () => ({ email: 'fan@example.com' }) };
  }
  throw new Error(`unexpected fetch: ${url}`);
};

(async () => {
  try {
    delete require.cache[require.resolve('../auth-session')];
    const auth = require('../auth-session');

    // With provider tokens: session established AND Spotify handed off.
    const status = await auth.setSessionFromTokens('ACC', 'REF', 3600, 'PACC', 'PREF');
    assert.strictEqual(status.authenticated, true, 'session established');
    assert.strictEqual(status.email, 'fan@example.com', 'email resolved');
    assert.deepStrictEqual(captured, { a: 'PACC', r: 'PREF', e: 3600 }, 'provider tokens handed to Spotify');
    console.log('✓ provider tokens are persisted via Spotify on sign-in');

    // Without provider tokens (email-confirmation deep link): no Spotify call.
    captured = null;
    await auth.signOut().catch(() => {});
    await auth.setSessionFromTokens('ACC2', 'REF2', 3600);
    assert.strictEqual(captured, null, 'no Spotify handoff when provider tokens absent');
    console.log('✓ email-confirmation deep link does not touch Spotify');

    console.log('\nauth-session-provider test passed.');
  } finally {
    global.fetch = realFetch;
    await require('../auth-session').signOut().catch(() => {});
  }
})().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/auth-session-provider.test.js`
Expected: FAIL — the `captured` assertion fails (`null`), because `setSessionFromTokens` ignores the provider-token args.

- [ ] **Step 3: Extend `setSessionFromTokens`**

In `auth-session.js`, replace the `setSessionFromTokens` function (lines 188-205) with:

```js
async function setSessionFromTokens(accessToken, refreshToken, expiresIn, providerToken, providerRefreshToken) {
  if (!accessToken || !refreshToken) return getStatus();
  let email = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) email = (await res.json())?.email || null;
  } catch { /* email stays null; the session is still valid */ }
  session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + (Number(expiresIn) || 3600) * 1000,
    email,
  };
  persist();
  // A Spotify sign-in also yields a Spotify grant — connect it for playlists.
  // Lazy require to avoid the auth-session ↔ spotify circular dependency.
  if (providerToken) {
    try {
      require('./processor/spotify').connectFromProviderTokens(providerToken, providerRefreshToken, expiresIn);
    } catch (err) {
      console.warn('[auth] could not connect Spotify from provider tokens:', err.message);
    }
  }
  return getStatus();
}
```

(`module.exports` already lists `setSessionFromTokens`; no change needed there.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/auth-session-provider.test.js`
Expected: PASS — two `✓` lines then `auth-session-provider test passed.`

- [ ] **Step 5: Run the existing auth test to confirm no regression**

Run: `node test/auth-restore-race.test.js`
Expected: PASS — `auth-restore-race test passed.`

- [ ] **Step 6: Commit**

```bash
git add auth-session.js test/auth-session-provider.test.js
git commit -m "feat(auth): connect Spotify from provider tokens on sign-in"
```

---

## Task 3: Route changes — accept provider tokens, serve the login URL

**Files:**
- Modify: `delivery/routes.js` (`/api/auth/session`, lines 143-153; add new route after it)

- [ ] **Step 1: Accept provider tokens in `/api/auth/session`**

In `delivery/routes.js`, replace the `/api/auth/session` handler (lines 143-153) with:

```js
// Establish a session from tokens delivered via the musicdigest:// deep link
// (email confirmation, password reset, or Sign in with Spotify). Called by the
// Electron main process. provider_token/provider_refresh_token are present only
// for Spotify sign-in and also connect Spotify for playlists.
router.post('/api/auth/session', async (req, res) => {
  const { access_token, refresh_token, expires_in, provider_token, provider_refresh_token } = req.body || {};
  if (!access_token || !refresh_token) return res.status(400).json({ error: 'Missing tokens' });
  try {
    const status = await authSession.setSessionFromTokens(
      access_token, refresh_token, expires_in, provider_token, provider_refresh_token,
    );
    if (status.authenticated) syncDigestRecipient(status.email);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to set session' });
  }
});
```

- [ ] **Step 2: Add the Spotify-login URL route**

Immediately after that handler, add:

```js
// Build the Supabase "Sign in with Spotify" authorize URL. Scopes match the
// spotify-proxy grant so the returned provider tokens work for playlist building.
const SPOTIFY_LOGIN_SCOPES = 'playlist-modify-public playlist-modify-private playlist-read-private streaming user-read-private user-read-email user-modify-playback-state user-read-playback-state';
router.get('/api/auth/spotify-login/url', (req, res) => {
  const { url: SUPABASE_URL } = require('../supabase-client');
  const params = new URLSearchParams({
    provider: 'spotify',
    redirect_to: 'musicdigest://auth-callback',
    scopes: SPOTIFY_LOGIN_SCOPES,
  });
  res.json({ url: `${SUPABASE_URL}/auth/v1/authorize?${params}` });
});
```

- [ ] **Step 3: Verify the route serves a well-formed URL**

Run:

```bash
node -e "
const express=require('express');
const app=express(); app.use(require('./delivery/routes'));
const srv=app.listen(0, async () => {
  const port=srv.address().port;
  const r=await fetch('http://127.0.0.1:'+port+'/api/auth/spotify-login/url');
  const { url }=await r.json();
  const u=new URL(url);
  console.assert(u.origin==='https://ghncuclxvhzjbkwncewf.supabase.co', 'origin');
  console.assert(u.pathname==='/auth/v1/authorize', 'path');
  console.assert(u.searchParams.get('provider')==='spotify', 'provider');
  console.assert(u.searchParams.get('redirect_to')==='musicdigest://auth-callback', 'redirect');
  console.assert(u.searchParams.get('scopes').includes('playlist-modify-public'), 'scopes');
  console.log('✓ spotify-login URL well-formed:', url);
  srv.close();
});
"
```

Expected: prints `✓ spotify-login URL well-formed: https://ghncuclxvhzjbkwncewf.supabase.co/auth/v1/authorize?provider=spotify&redirect_to=musicdigest%3A%2F%2Fauth-callback&scopes=…` with no assertion errors.

(If `routes.js` requires modules with side effects that prevent standalone loading, instead verify by starting the app with `npm run dev` and hitting `http://localhost:3001/api/auth/spotify-login/url` in a browser.)

- [ ] **Step 4: Commit**

```bash
git add delivery/routes.js
git commit -m "feat(auth): route to serve Spotify login URL + accept provider tokens"
```

---

## Task 4: Forward provider tokens from the deep-link handler

**Files:**
- Modify: `electron/main.js` (`handleDeepLink`, lines 46-77)

- [ ] **Step 1: Extract and forward the provider tokens**

In `electron/main.js`, inside `handleDeepLink`, after line 54 (`const expires_in = params.get('expires_in');`) add:

```js
    const provider_token = params.get('provider_token');
    const provider_refresh_token = params.get('provider_refresh_token');
```

Then change the fetch body (line 62) from:

```js
          body: JSON.stringify({ access_token, refresh_token, expires_in }),
```

to:

```js
          body: JSON.stringify({ access_token, refresh_token, expires_in, provider_token, provider_refresh_token }),
```

- [ ] **Step 2: Verify the file parses**

Run: `node -e "require('@babel/core') || 0; new Function(require('fs').readFileSync('electron/main.js','utf8'))" 2>/dev/null || node --check electron/main.js && echo "✓ electron/main.js parses"`
Expected: `✓ electron/main.js parses`

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(electron): forward Spotify provider tokens from deep link"
```

---

## Task 5: Renderer — "Sign in with Spotify" button

**Files:**
- Modify: `src/api.js` (after line 23)
- Modify: `src/AuthScreen.jsx`

- [ ] **Step 1: Add the api method**

In `src/api.js`, in the `api` object after the `logout` line (line 23), add:

```js
  spotifyLoginUrl: ()              => j('/api/auth/spotify-login/url').then(r => r.url),
```

- [ ] **Step 2: Add the handler and button in AuthScreen**

In `src/AuthScreen.jsx`, after the `submit` function (after line 44), add:

```jsx
  async function spotifyLogin() {
    if (busy) return;
    setError('');
    setNotice('');
    try {
      const url = await api.spotifyLoginUrl();
      window.open(url); // Electron opens external URLs in the default browser
    } catch (err) {
      setError(err.message || 'Could not start Spotify sign-in');
    }
  }
```

Then, in the JSX, immediately after the closing `</form>` tag (line 93), insert:

```jsx
        <div className="auth-divider"><span>or</span></div>
        <button type="button" className="auth-spotify" onClick={spotifyLogin} disabled={busy}>
          Sign in with Spotify
        </button>
```

- [ ] **Step 3: Add minimal styles**

Find the stylesheet that defines `.auth-submit` (search: `grep -rn "auth-submit" src/`). In that same CSS file, add:

```css
.auth-divider { display:flex; align-items:center; gap:12px; margin:18px 0; color:var(--muted,#6f6c63); font-size:13px; }
.auth-divider::before, .auth-divider::after { content:""; flex:1; height:1px; background:rgba(255,255,255,.12); }
.auth-spotify {
  width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
  background:#1DB954; color:#0b0b0c; font-weight:600; font-size:15px;
}
.auth-spotify:hover { background:#1ed760; }
.auth-spotify:disabled { opacity:.6; cursor:default; }
```

(If the auth styles are inline rather than in a CSS file, add the equivalent inline styles to the elements instead.)

- [ ] **Step 4: Build the renderer to verify it compiles**

Run: `npm run build:ui`
Expected: Vite build completes with no errors; `public/assets/` is regenerated.

- [ ] **Step 5: Commit**

```bash
git add src/api.js src/AuthScreen.jsx
git commit -m "feat(ui): add Sign in with Spotify button to AuthScreen"
```

---

## Task 6: Manual config + end-to-end verification + changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: One-time Spotify + Supabase config (manual, by the owner)**

1. Spotify Developer Dashboard → the existing app → Edit Settings → Redirect URIs: add `https://ghncuclxvhzjbkwncewf.supabase.co/auth/v1/callback`. Keep `http://127.0.0.1:3001/auth/spotify/callback`. Save.
2. Supabase → Authentication → Providers → Spotify: enable; paste the same Spotify Client ID and Client Secret; save.
3. Confirm Supabase → Authentication → URL Configuration → Redirect URLs contains `musicdigest://auth-callback` (already present).

- [ ] **Step 2: End-to-end smoke test (Spotify path)**

With the config done, run the app (`npm run dev`, or a packaged build). On the auth screen, click **Sign in with Spotify** → the browser opens the Spotify consent page → authorize with a **whitelisted** Spotify account → the browser redirects to `musicdigest://auth-callback` → the app focuses, lands signed in. Then click **Run Now** and confirm a playlist is created/updated (no separate "Connect Spotify" step was needed).

Expected: signed in with the Spotify account's email; playlist build succeeds.

- [ ] **Step 3: Regression smoke test (email path)**

Sign out. Sign in with an email/password account. Confirm the dashboard loads and the separate **Connect Spotify** flow still works (authorize → connected). Confirm an email-confirmation deep link still signs in (no Spotify side effects).

Expected: email login + separate Connect Spotify both work unchanged.

- [ ] **Step 4: Run the full test suite**

Run: `for f in test/*.test.js; do echo "== $f =="; node "$f" || break; done`
Expected: every test prints its `✓`/passed line; none exit non-zero.

- [ ] **Step 5: Update the changelog**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add:

```markdown
- **Sign in with Spotify** — a one-tap login option alongside name+email. Uses
  Supabase Auth's Spotify provider; the same authorization also connects the
  user's Spotify for playlists, so Spotify users skip the separate "Connect
  Spotify" step. Email users are unaffected. (Spotify Development Mode still caps
  Spotify sign-in to whitelisted accounts; non-whitelisted users use email.)
```

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for Sign in with Spotify"
```

---

## Self-review notes

- **Spec coverage:** config (Task 6.1), flow + deep link (Task 4), session+Spotify persistence (Tasks 1–2), routes incl. login URL (Task 3), UI button (Task 5), scopes match proxy (Task 3), edge cases — missing refresh token (Task 1 test), no provider tokens (Task 2 test), dev-mode fallback (Task 6 changelog/manual). All covered.
- **Type consistency:** `connectFromProviderTokens(accessToken, refreshToken, expiresIn)` defined in Task 1 and called with the same arg order in Task 2; `setSessionFromTokens(accessToken, refreshToken, expiresIn, providerToken, providerRefreshToken)` defined in Task 2 and called with matching positional args in Task 3; request body keys `provider_token`/`provider_refresh_token` consistent across Tasks 3 and 4; `spotifyLoginUrl` consistent across Tasks 5 and the route path in Task 3.
- **No placeholders:** every code step shows complete code; manual config is the only non-code work and is fully enumerated.

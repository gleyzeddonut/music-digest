# Sign in with Spotify — Design

**Date:** 2026-06-04
**Status:** Approved design, pending implementation plan

## Goal

Add "Sign in with Spotify" as a login method for the Music Digest desktop app,
**alongside** the existing name + email (Supabase email/password) login. A single
Spotify authorization both signs the user in **and** connects their Spotify
account for playlist building — eliminating the separate "Connect Spotify" step
for Spotify users.

## Background

- App identity is a Supabase Auth user. All 8 edge functions require a real user
  JWT (`verify_jwt=true` + in-code `requireUser`); the publishable key alone is
  rejected. The daily scheduler and digest delivery key off the Supabase user.
- Spotify is currently a **separate** concern: a per-device OAuth grant (via the
  `spotify-proxy` edge function) stored in the local SQLite `settings` table,
  used only by `appendSongsToPlaylist`.
- The app already registers the `musicdigest://auth-callback` deep link and has
  `auth-session.setSessionFromTokens()` to establish a session from tokens
  delivered to that callback (used today by email confirmation / reset links).
- Supabase project ref: `ghncuclxvhzjbkwncewf`.

## Constraint: Spotify Development Mode (25-user cap)

The Spotify app is in Development Mode: only up to 25 manually-whitelisted
Spotify accounts can authorize, and the extended-quota/Partner program is out of
reach (requires 250k MAU + registered business). Therefore **Spotify sign-in is
offered alongside email, never as the only way in** — non-whitelisted users
continue to join via email. Lifting the cap is a separate effort and not in
scope here.

## Approach (chosen)

**Supabase Auth's native Spotify provider.** The app opens
`…/auth/v1/authorize?provider=spotify&redirect_to=musicdigest://auth-callback&scopes=…`.
Supabase runs the entire OAuth dance and redirects back to the existing deep link
with both the Supabase session tokens **and** Spotify's `provider_token` /
`provider_refresh_token`. This reuses the deep-link handler, the session layer,
and the edge-function JWT model unchanged, and lets one Spotify app serve both
login and playlist building.

Rejected alternatives:
- **Hand-rolled OAuth + admin-API user creation** — reimplements what the
  provider gives free, adds a service-role edge function (security surface), and
  requires managing passwordless account creation.
- **Spotify token as the only identity (no Supabase user)** — breaks every edge
  function's `requireUser` and the scheduler's reliance on a Supabase user.

## One-time configuration (manual, no code)

1. **Spotify Developer Dashboard** (the existing app — same client ID/secret the
   `spotify-proxy` edge function already uses): add
   `https://ghncuclxvhzjbkwncewf.supabase.co/auth/v1/callback` to the Redirect
   URIs. Keep the existing `http://127.0.0.1:3001/auth/spotify/callback` (still
   used by email users' Connect flow).
2. **Supabase → Auth → Providers → Spotify**: enable it; paste the **same**
   Spotify client ID/secret. Using one Spotify app for both is what makes the
   unified connect work (the stored `provider_refresh_token` is then refreshable
   through the existing `spotify-proxy` `refresh` action, which uses the same
   client credentials).
3. Confirm `musicdigest://auth-callback` is in Supabase → Auth → URL
   Configuration → Redirect URLs (already present for email links).

## Flow

1. User clicks **Sign in with Spotify** on the welcome screen.
2. Renderer requests the login URL from the local server
   (`GET /api/auth/spotify-login/url`), which returns
   `${SUPABASE_URL}/auth/v1/authorize?provider=spotify&redirect_to=musicdigest://auth-callback&scopes=<scopes>`.
3. The app opens that URL in the external browser.
4. User authorizes on Spotify (must be whitelisted while in dev mode).
5. Supabase exchanges the code and redirects the browser to
   `musicdigest://auth-callback#access_token=…&refresh_token=…&expires_in=…&provider_token=…&provider_refresh_token=…`.
6. The OS hands the deep link to the app. `handleDeepLink` (extended to also read
   `provider_token` / `provider_refresh_token`) POSTs all tokens to
   `/api/auth/session`.
7. `setSessionFromTokens` establishes the Supabase session **and** (when provider
   tokens are present) persists the Spotify tokens into the local `settings`
   table, so playlists work immediately with no separate Connect step.
8. The window reloads as signed-in and Spotify-connected.

### Scopes

Request the scopes the playlist flow needs, matching the `spotify-proxy` `SCOPES`
constant: `playlist-modify-public playlist-modify-private playlist-read-private
user-read-private user-read-email` (plus any others already in `SCOPES`). The
`scopes` value is passed on the Supabase `authorize` URL.

## Code changes

All changes reuse existing seams; no new infrastructure.

- **`electron/main.js`** — `handleDeepLink`: extract `provider_token` and
  `provider_refresh_token` from the callback fragment and include them in the
  `/api/auth/session` POST body.
- **`auth-session.js`** — `setSessionFromTokens(accessToken, refreshToken,
  expiresIn, providerToken, providerRefreshToken)`: extend the signature; when
  provider tokens are present, hand them to Spotify to persist. Existing callers
  (email confirmation) pass no provider tokens and are unaffected.
- **`processor/spotify.js`** — new `connectFromProviderTokens(token,
  refreshToken, expiresIn)`: writes `spotify_access_token`,
  `spotify_refresh_token`, `spotify_token_expires_at` into `settings` (mirroring
  `handleCallback`) and clears stale playlist IDs. Only overwrite the stored
  refresh token if a new one is provided (Spotify omits it on re-auth). To avoid
  a circular dependency (`auth-session` → `spotify` → `auth-session`), `spotify`
  exposes this function and `auth-session` requires it lazily inside
  `setSessionFromTokens`.
- **`delivery/routes.js`** — `/api/auth/session` accepts the two provider tokens
  and forwards them to `setSessionFromTokens`; new
  `GET /api/auth/spotify-login/url` returns the Supabase authorize URL.
- **UI (`src/WelcomeScreen.jsx`, `src/screens.jsx`, `src/api.js`)** — add a
  "Sign in with Spotify" button beside the email form, and an `api.js` method
  that fetches the login URL and opens it externally.

## What stays the same

- Email login is untouched.
- Email users still see and use "Connect Spotify" for playlists.
- The only change email users see is one extra button on the login screen.
- The `spotify-proxy` `refresh` action and `getAccessToken()` refresh path are
  unchanged and work for provider-token-sourced refresh tokens because the same
  Spotify client is used.

## Edge cases

- **Dev-mode cap**: the Spotify button only works for whitelisted accounts while
  in Development Mode; non-whitelisted users fall back to email. Surface a clear
  error if Spotify returns an access-denied/unregistered error in the callback.
- **Same email, both methods**: Supabase auto-links an OAuth sign-in to an
  existing account when the verified email matches, so this is generally safe.
  Treated as known Supabase behavior; no custom linking is built.
- **Missing `provider_refresh_token`**: Spotify returns it only on first grant;
  if absent on a later sign-in, keep the existing stored refresh token.
- **No provider tokens in callback** (e.g. an email-confirmation deep link):
  `setSessionFromTokens` behaves exactly as today — session only, no Spotify
  write.

## Testing

- **Manual end-to-end**: click Sign in with Spotify → browser → authorize →
  app lands signed-in **and** Spotify-connected → Run Now builds a playlist.
- **Unit**: `setSessionFromTokens` persists provider tokens via
  `connectFromProviderTokens`; `/api/auth/session` parses and forwards provider
  tokens; `connectFromProviderTokens` writes the expected `settings` rows and
  preserves an existing refresh token when none is supplied.
- **Regression**: email login still works; the separate "Connect Spotify" flow
  still works; an email-confirmation deep link (no provider tokens) still signs
  in without touching Spotify settings.

## Out of scope

- Lifting the Spotify 25-user Development Mode cap (extended quota, or building
  playlists under one app-owned Spotify account).
- Changing email login or removing the separate Connect Spotify flow for email
  users.

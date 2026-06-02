# Auth + Proxy Hardening Plan

**Date:** 2026-06-02
**Goal:** Close the launch-blocking security holes found in the pre-launch review:
open email relay, open Claude proxy, SSRF/key-exfil in proxies, and the lack of
real authentication on every Supabase edge function.

## Decisions (made with owner)
- **Email + password accounts** via Supabase Auth (not magic link, not OAuth).
- **The app never emails an arbitrary address.** A signed-in user's digest goes
  only to *their own account email*, derived server-side from the verified JWT.
  The client cannot choose the recipient.
- Each desktop install authenticates as one user; the local Node server owns the
  Supabase session and attaches the user's access token to every proxy call.

## Threat model note
This is a distributed desktop app, so any secret the app ships is extractable.
Real per-user auth is what lets us (a) attribute abuse to an account, (b) ban one
user without breaking everyone, and (c) lock email to the user's own address.

## Work

### Edge functions (`supabase/functions/`)
1. `_shared/auth.ts` — `requireUser(req)`: validates the bearer token via
   `supabase.auth.getUser(token)`, returns the user or a 401 Response. Rejects the
   anon key (role `anon`). Also exports shared CORS + JSON helpers.
2. `claude-proxy` — require user; cap request body size.
3. `spotify-proxy` — require user.
4. `lastfm-proxy` — require user.
5. `youtube-proxy` — require user.
6. `genius-proxy` — require user; **path allowlist** (only `/search`) to kill the
   `@evil.com` host-override SSRF that leaked `GENIUS_API_KEY`.
7. `send-email` — require user; **`to = user.email`** (ignore any client `to`);
   validate subject/html presence and cap html size.
8. `tiktok-proxy` — **delete** (dead code; `tiktok.js` uses Kworb now).

### Node / Electron side
9. `auth-session.js` — login / signup / refresh / logout against Supabase Auth
   REST. Persist the refresh token encrypted via Electron `safeStorage`. Expose
   `getAccessToken()` (auto-refresh on expiry) and `authHeaders()`.
10. Replace `apikey: anonKey` at all 6 proxy call sites + `email.js` with
    `await authHeaders()` (apikey + `Authorization: Bearer <access_token>`).
11. `delivery/routes.js` — `/api/auth/status|login|signup|logout`.

### Renderer (`src/`)
12. `AuthScreen.jsx` — sign in / sign up form.
13. Gate `main.jsx` on auth status before onboarding/dashboard.
14. `api.js` — auth helper methods.

## Sequencing
SSRF fix (#6) and `tiktok-proxy` deletion (#8) are safe to ship alone. Auth
enforcement (#1–#5, #7) must ship together with the client login work (#9–#14),
or the app breaks (it currently sends only the anon key). **Do not deploy the
function auth changes until the client sends real user tokens.**

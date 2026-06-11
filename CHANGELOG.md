# Changelog

All notable changes to Music Digest are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each change gets an entry under `## [Unreleased]` as it's made; when a version is
cut, the Unreleased entries move under that version's heading with the date.

## [Unreleased]

### Changed
- **Sidebar reorganized**: "Daily" now holds Today, The Brief, Artists, and
  Songs (Artists/Songs jump to their section of the Today page); a new
  "Archive" group holds This Month and History; Sources sits standalone above
  all groups, right under the persona switcher. Added person and
  music-note icons for the new entries. All sidebar groups (Daily, Archive,
  Library) are now **foldable** — click the group header to collapse/expand
  (chevron appears on hover); collapsed state is remembered across sessions.
- **Slimmer Spotify status**: the bottom-left "Connected / Spotify" pill now only
  appears while disconnected and slides away on connect; once connected, the
  bottom of the sidebar is a single compact line — a small green light (hover:
  "Spotify is connected") beside the playlist-name field. The shared/custom
  persona-playlist badge moved into the field's tooltip.

## [1.7.8] — 2026-06-10

### Added
- **In-app auto-update** via `electron-updater` + GitHub Releases. The packaged
  app checks for updates on launch and every 4 hours, downloads them in the
  background (differential — only changed blocks), and prompts "Restart Now /
  Later"; "Later" still installs on next quit. Build now also produces ZIP
  targets (what Squirrel.Mac installs from; the DMG remains for first-time
  installs) and `latest-mac.yml` as the update feed. New `npm run release`
  script builds, signs, notarizes and uploads all artifacts to a GitHub release
  (`GH_TOKEN` or `gh auth token`). Users on ≤1.7.7 need one final manual
  download; from then on updates are automatic.

### Changed
- **Releases are now cut locally** with `npm run release` (signing/notarization
  credentials live only on the dev machine). Removed `.github/workflows/release.yml`:
  it built **unsigned** DMGs on every `v*` tag and published them with
  `--publish always` — for v1.7.7 those briefly overwrote the signed local
  build on the GitHub release until the signed assets were re-uploaded. With
  auto-update live, an unsigned `latest-mac.yml` winning that race would break
  updates for every installed app (Squirrel.Mac rejects unsigned builds), so
  the CI publish path is gone. The workflow's original reason (local `dmgbuild`
  failing on Python 3.14) no longer reproduces — v1.7.7 DMGs built fine locally.

## [1.7.7] — 2026-06-06

### Fixed
- **Spotify login failed in the packaged app** after the authorize screen. The
  redirect URI defaulted to port 3001 while the server defaulted to 3000, so the
  shipped app (which bundles no `.env`) told Spotify to redirect to a dead port.
  `config.js` now derives the redirect URI from a single `PORT` constant (default
  3001), so the listen port and redirect port can never diverge.

### Changed
- macOS distribution is now **code-signed (Developer ID Application) and notarized
  by Apple**. The DMG opens on a normal double-click — no right-click → Open, no
  `xattr` Terminal workaround. Removed the `Open Music Digest.command` helper and
  its README from the DMG; updated `docs/install.html` to the simplified flow.
  Added `build/entitlements.mac.plist` (hardened runtime) and notarization config
  (App Store Connect API key via `build/.apple-credentials`).

### Added
- **Sign in with Spotify** — a one-tap login option alongside name+email. A new
  `spotify-login` edge function runs the Spotify OAuth server-side and provisions
  a pre-confirmed user (service role), then mints a Supabase session — so email
  confirmation stays ON for password signups while Spotify users (whose email
  Spotify never marks "verified") are still let in. The same authorization also
  connects the user's Spotify for playlists, so Spotify users skip the separate
  "Connect Spotify" step. Email users are unaffected. (Spotify Development Mode
  still caps Spotify sign-in to whitelisted accounts; non-whitelisted users use
  email.) Requires the loopback redirect `http://127.0.0.1:3001/auth/spotify/callback`
  registered in the Spotify app.
- `docs/install.html` — self-contained download & install/onboarding page for
  the aigora.store landing (download buttons, Gatekeeper-aware install steps,
  first-launch walkthrough). Built fresh signed + notarized DMGs for distribution.
- Signup-notification trigger: on each new signup (up to the first 25), emails
  the owner the new user's email so they can be added to the Spotify dev-app
  allowlist (Spotify caps API access at 25 users). Postgres trigger on
  `auth.users` → Resend HTTP API via `pg_net`, key read from Vault
  (`resend_api_key`). Fail-safe — dormant without the key, silent past 25, and
  errors are swallowed so it can never block a signup. Migrations
  `20260603130507_enable_pg_net`, `20260603130508_notify_admin_on_signup`.

## [1.7.6] — 2026-06-03

### Changed
- Deleting a persona removes its playlist from the **app only** — it no longer
  unfollows/touches your Spotify playlist (reverting that part of 1.7.5). The
  confirmation makes clear the Spotify playlist is left alone.

## [1.7.5] — 2026-06-03

### Added
- Deleting a persona now asks whether to also remove its Spotify playlist (it
  gets unfollowed from your library); choose Cancel to keep the playlist.

### Fixed
- Clicking **Main Playlist** in the sidebar now switches back to the main persona
  and shows the shared playlist (previously you could only switch back via the
  persona dropdown).
- Persona playlist entries under Library are aligned cleanly (removed the odd
  indent).

## [1.7.4] — 2026-06-03

### Added
- Custom per-persona playlists now show up as their own entries under **Library**
  in the sidebar. Click one to switch to that persona and open its playlist.

### Changed
- The two TikTok built-in feeds are now clearly named **TikTok Charts** (US chart
  rank) and **TikTok Trending** (virality/momentum), and the shared default
  playlist is labelled **Main Playlist** in the sidebar.

## [1.7.3] — 2026-06-03

### Changed
- GitHub releases now show notes pulled automatically from this changelog, and
  the release build retries itself to ride out the occasional macOS DMG-packaging
  flake.

### Fixed
- Layout polish — serif headings no longer overlap the text beneath them when
  they wrap (most visibly the digest hero), and one-line labels, badges,
  breadcrumbs, and buttons (e.g. "Run digest", source group headers, settings
  rows, the history "picks · songs" column) no longer wrap awkwardly.

## [1.7.2] — 2026-06-03

### Added
- Sources screen split into **Custom** and **Built-in** tabs (defaults to Custom)
  so you no longer scroll past the built-in feeds to reach your own sources.
- Lean mainstream starter set for **fresh installs** — seeds ~7 mainstream custom
  sources (indieheads, hiphopheads, popheads, Pitchfork, Billboard, Rolling
  Stone, YouTube Trending) plus all built-in charts, instead of the full default
  list. Existing installs keep their curated lists untouched.

## [1.7.1] — 2026-06-03

### Added
- Sidebar **"Update available" pill** — a prominent, pulsing notification that
  appears when a newer release exists, replacing the easy-to-miss text in
  Settings. Click it to open the release download page.

## [1.7.0] — 2026-06-03

### Added
- **Add your own YouTube charts** — Top Songs, Top Artists, and Top Music Videos
  for any country, via the keyless charts.youtube.com endpoint.
- **Built-in vs Custom sources** — the six always-on scrapers (Apple Charts,
  Last.fm, Genius, Shazam, Spotify Global, Hype Machine) are now real source rows
  you can toggle on/off per persona.

### Fixed
- Phantom **"T.I."** appearing in mentioned/featured artists — the scorer now
  matches artists on whole tokens instead of raw substrings.
- **Reddit scraping** recovered — RSS fallback fixed (fetch via axios + browser
  headers) plus an app-only OAuth proxy for real upvote/comment scores.
- **No more re-login on every launch** — the auth status check now revives the
  persisted session before answering, fixing a startup race.

## [1.6.0] — 2026-06-02

### Added
- Deep-link auth — confirmation emails open the desktop app and sign you in.

## [1.5.0] — 2026-06-02

### Security
- Accounts + hardening — auth required on all edge functions, SSRF/open-relay
  fixes, and per-user rate limiting.

## [1.4.1] — 2026-06-01

### Fixed
- Scheduler, email, and scoring fixes; CI release workflow.

## [1.4.0] — 2026-05-30

### Added
- Personas — multiple named source/playlist profiles.

<!-- Older history (≤ 1.3.x) lives in the git tag annotations. -->

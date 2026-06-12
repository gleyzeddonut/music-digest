# Changelog

All notable changes to Music Digest are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each change gets an entry under `## [Unreleased]` as it's made; when a version is
cut, the Unreleased entries move under that version's heading with the date.

## [Unreleased]

## [1.7.11] — 2026-06-12

### Added
- **Artist of the day is now a real feature.** The digest call writes a daily
  mini-article (editorial title + 3–5 factual paragraphs) about the top
  artist, with linked coverage resolved from the same article indices the
  headlines use, and a signal breakdown built from the scorer's real evidence
  (sub-scores, source names, Reddit numbers). "Read feature →" on the hero
  finally opens something new: article, Coverage, The signal, and a Listen
  section (issue tracks + Spotify artist link). The hero subtitle teases the
  feature's title instead of spoiling its first sentence, and the dead
  streams-based stats row is replaced by real evidence ("6 sources · top
  Reddit post 4.2k↑"). Old digests fall back to the previous layout, and the
  hero button honestly reads "View artist →" when no feature exists. Stored
  inside the existing artists JSON — no DB migration. New
  `processor/feature.js` + `test/feature-attach.test.js`. Spec:
  `docs/superpowers/specs/2026-06-11-artist-feature-design.md`.

### Fixed
- **Brief rendered as one giant bullet** (seen in the 2026-06-11 digest):
  Claude occasionally writes the bullet separators as literal backslash-n
  text and drops the `•` marker on the first bullet. The pipeline now
  normalizes newlines before saving, and the UI adapter repairs already-saved
  digests (normalizes separators and re-marks an unmarked leading bullet so
  the brief screen doesn't silently drop it).

### Changed
- **Run digest button upgraded** (final piece of the design handoff): at rest
  it's a gradient play-pill with a soft glow; while running it inverts to a
  dark pill with animated eq bars, the live phase label, and a 5-segment track
  that fills as the real pipeline phases stream in (Scraping · Scoring ·
  Analyzing · Playlist · Saving), plus a green hairline that sweeps the bottom
  edge of the topbar. Completion flashes "Digest ready ✓" for 2 seconds. New
  `src/RunButton.jsx` (`RunButton` + `RunHairline`), swapped into the Topbar;
  old `.run-phase-text`/`.run-dots` styles removed. Respects
  `prefers-reduced-motion`.
- Persona switcher subtitle ("all sources") now truncates with an ellipsis
  instead of wrapping/clipping when space is tight (small fix from the handoff
  that was missed in the earlier polish passes).

## [1.7.10] — 2026-06-11

### Changed
- **Polish pass v2** (updated design handoff): softer "new OS" corner radii
  across every surface (sidebar, cards, menus, modals, inputs — pills and
  circles untouched), including the inline-styled inputs in Sources/Settings
  add-forms and Onboarding; Monthly hero divider softened to match the calmer
  hairline system; signal badge/tooltip radii bumped to match. Song-row corner
  rounding adjusted to the new 18px container frame.
- **Updates are now user-initiated, not automatic.** The app no longer
  downloads updates or shows a restart dialog on its own — it only checks
  availability. Clicking the sidebar "Update to vX" pill is what installs:
  it downloads in place (pill shows "Updating…") and the app restarts itself.
  New `POST /api/update/install` route bridges the pill to the updater via
  `global.__appUpdater`; outside the packaged app (or on failure) the pill
  falls back to opening the releases page. A finished download still installs
  on quit (`autoInstallOnAppQuit`) if the user quits instead of restarting.

## [1.7.9] — 2026-06-11

### Fixed
- **Scoring: deep chart ranks no longer go negative.** kworb's Shazam page lists
  200 rows (TikTok 100) but the formulas assumed top-50, so e.g. Shazam #150
  contributed −0.81 and could erase an artist's genuine Apple/Spotify signal.
  All rank formulas (artist + song scoring) now clamp at 0 outside their window.
- **Velocity signal revived.** Last.fm baselines were overwritten on every run,
  making "current vs baseline" a day-over-day (or same-day, with multiple
  personas) comparison that always read ~0%. Baselines now only refresh when
  ≥7 days old, so the delta is a true week-over-week measure.
- **Score badges no longer silently lost.** The scorer→Claude artist merge
  matched on raw lowercase names; stylistic differences ("ROSÉ & Bruno Mars" vs
  "ROSÉ") dropped the sub-score badges. The merge now keys on normalized names,
  and the scorer's pre-computed tier is enforced rather than trusted to the
  prompt.

### Changed
- **Brief generation hardened**: Claude now responds via forced tool-use with a
  JSON schema (no more "returned no JSON" failures after a full scrape), runs at
  temperature 0.3 for steadier output, and summary bullets are normalized
  server-side ("-"/"*" → "•") so format drift can't blank the brief in the UI
  or email.
- **Scoring refinements**: editorial articles decay with age (week-old RSS
  backlog no longer reads as today's news); user-added sources count at tier-3
  weight instead of zero; velocity uses strongest-signal + corroboration bonus
  instead of an average that punished breadth; common-word artist names
  ("Future", "Muse") only match editorial headlines when written as proper
  nouns (lowercase-stylized artists like "glaive" exempt); song chart matching
  by title alone now requires the artists to agree, so a song can't inherit
  ranks from a same-titled track by someone else.
- **Sidebar reorganized**: "Daily" now holds Today, The Brief, Artists, and
  Songs (Artists/Songs jump to their section of the Today page); a new
  "Archive" group holds This Month and History; Sources sits standalone above
  all groups, right under the persona switcher. Added person and
  music-note icons for the new entries. All sidebar groups (Daily, Archive,
  Library) are now **foldable** — click the group header to collapse/expand
  (chevron appears on hover); collapsed state is remembered across sessions.
- **Polish pass** (from design handoff): nav-group divider lines removed so the
  sidebar reads as one calm list; section-header underlines dropped on every
  screen; headlines grid loses its top rule and centre divider; History/Sources
  row dividers softened. Song rows swap the cryptic `cha/edi/com` chip cluster
  for a single signal glyph + count that reveals the full colour-coded list on
  hover or keyboard focus (`SignalBadge`); Monthly's `N× this month` chip is
  unchanged. Songs container corners compensated for the tooltip's
  `overflow: visible`.
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

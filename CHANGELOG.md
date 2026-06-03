# Changelog

All notable changes to Music Digest are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each change gets an entry under `## [Unreleased]` as it's made; when a version is
cut, the Unreleased entries move under that version's heading with the date.

## [Unreleased]

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

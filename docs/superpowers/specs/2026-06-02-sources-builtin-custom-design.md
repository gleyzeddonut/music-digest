# Built-in vs Custom Sources — Design

**Date:** 2026-06-02
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feat/sources-builtin-custom` (based on `feat/youtube-custom-charts`)

## Problem

The Sources screen mixes two very different kinds of source, and one kind isn't
manageable at all:

- **Six always-on scrapers** — Apple Charts, Last.fm, Genius, Shazam, Spotify
  Global, Hype Machine — run on *every* digest. They are hardcoded in
  `processor/digest.js`, are NOT rows in the `sources` table, and have **no
  on/off**. A user cannot turn them off.
- **Table sources** (reddit, rss, html, tiktok, spotify-playlist, tokchart,
  youtube) are persona-scoped and toggleable, but the screen shows them as one
  flat list with no distinction between "fixed system feeds" and "things you add
  yourself."

Goal: reorganize Sources into **Built-in** (toggle-only, can't add or delete) and
**Custom** (full add/edit/delete), and make the six always-on scrapers
individually toggleable like any other source.

## Decisions (from brainstorm)

- **Toggle model: per-persona (unified).** Built-ins become real `sources` rows
  and inherit the existing toggle + persona-scoping machinery. A one-time
  migration adds the built-in source IDs to existing personas so nothing silently
  drops.
- **Categorization (by `type`):**
  - **Custom:** `reddit`, `rss`, `html`, `spotify-playlist`, `youtube`
  - **Built-in:** `apple-charts`, `lastfm`, `genius`, `shazam`, `spotify-global`,
    `hypem`, `tiktok`, `tokchart`

## Key simplification: derive built-in from `type`, no new column

Built-in vs custom is **fully determined by `type`** — the two sets are disjoint
and exhaustive. So there is **no `builtin` column**; a shared `BUILTIN_TYPES` set
is the single source of truth. This avoids a schema-column migration and keeps the
existing `INSERT INTO sources SELECT *` table-rebuild migration column-compatible.

### Shared constant

`lib/source-types.js` (CommonJS, single source of truth):
```js
const CUSTOM_TYPES  = ['reddit', 'rss', 'html', 'spotify-playlist', 'youtube'];
const BUILTIN_TYPES = ['apple-charts', 'lastfm', 'genius', 'shazam', 'spotify-global', 'hypem', 'tiktok', 'tokchart'];
module.exports = { CUSTOM_TYPES, BUILTIN_TYPES };
```
- Server (`db/init.js`, `delivery/routes.js`, `processor/digest.js`): `require('../lib/source-types')`.
- Client (`src/screens.jsx`): `import sourceTypes from '../lib/source-types.js'; const { BUILTIN_TYPES } = sourceTypes;` (Vite exposes the CJS `module.exports` as the default export).

## Components & changes

### `db/init.js` — schema + seeding + persona migration
- **Type constraint:** add the six built-in types to `NEW_TYPES`. Extend the
  `needsSourcesMigration` guard to also trigger when the table DDL lacks
  `'apple-charts'` (so existing DBs rebuild with the widened CHECK). No column
  change — the existing `INSERT INTO sources SELECT *` rebuild stays valid.
- **Seed built-in rows:** add six entries to `DEFAULT_SOURCES`
  (`apple-charts`, `lastfm`, `genius`, `shazam`, `spotify-global`, `hypem`) with a
  descriptive `url` (cosmetic — these scrapers ignore it, like the existing
  tokchart/youtube rows). The existing "add new defaults by URL" boot path inserts
  them into already-seeded DBs. `tiktok` and `tokchart` rows already exist.
- **One-time persona migration (guarded):** after built-in rows exist, for every
  **non-default** persona, merge the built-in source IDs into its `source_ids`
  array (idempotent union). Guard with a `settings` flag
  (`builtin_persona_migration_done = '1'`) so it runs exactly once — otherwise a
  user who later removes a built-in from a persona would have it re-added on the
  next boot. The default persona uses all enabled sources, so it needs no change.

### `processor/digest.js` — gate the six always-on scrapers
Each formerly-unconditional scraper becomes gated on the persona-filtered source
list, exactly like `tokchart`/`youtube` already are:
```js
const appleEnabled        = sources.some(s => s.type === 'apple-charts');
const lastfmEnabled       = sources.some(s => s.type === 'lastfm');
const geniusEnabled       = sources.some(s => s.type === 'genius');
const shazamEnabled       = sources.some(s => s.type === 'shazam');
const spotifyGlobalEnabled= sources.some(s => s.type === 'spotify-global');
const hypemEnabled        = sources.some(s => s.type === 'hypem');
```
In the `Promise.all([...])`, wrap each call. Note return-shape preservation:
- `appleEnabled ? scrapeAppleCharts() : []`
- `lastfmEnabled ? scrapeLastfm() : { artists: [], tracks: [] }`  ← object, not array
- `geniusEnabled ? scrapeGenius() : []`
- `shazamEnabled ? scrapeKworbShazam() : []`
- `spotifyGlobalEnabled ? scrapeKworbSpotify() : []`
- `hypemEnabled ? scrapeHypem() : []`

The downstream `score(...)` and prompt builders already tolerate empty arrays, so a
disabled built-in simply contributes no signal.

### `delivery/routes.js`
- **`POST /api/sources`:** restrict creation to `CUSTOM_TYPES`. Reject a built-in
  type with `400 { error: 'That source type is built-in and cannot be added' }`.
- **`POST /api/sources/:id/test`:** add branches for the six built-in types so the
  Test button works:
  - `apple-charts` → `scrapeAppleCharts()`
  - `lastfm` → `scrapeLastfm()` then surface `.artists` (e.g. `result.artists`)
  - `genius` → `scrapeGenius()`
  - `shazam` → `scrapeKworbShazam()`
  - `spotify-global` → `scrapeKworbSpotify()`
  - `hypem` → `scrapeHypem()`
- `GET /api/sources` already returns all rows (`SELECT *`); the client derives
  built-in/custom from `type`. No change.
- **`DELETE /api/sources/:id`:** reject deletion of a built-in-type source with
  `400` (defense in depth behind the UI hiding the delete button).

### `src/screens.jsx`
- Replace the single flat list with **two sections**: **Built-in** and **Custom**,
  partitioned by `BUILTIN_TYPES.includes(s.type)`. Within each, keep the existing
  per-type grouping.
- **Built-in rows:** show the toggle (and Test), hide add/edit/delete. The toggle
  already does the right thing: global `enabled` in normal mode, per-persona
  membership in persona mode (existing logic at the toggle button).
- **Add dropdown:** offer only `CUSTOM_TYPES` (drop the current `!== 'tokchart'`
  filter in favor of `CUSTOM_TYPES.includes(v)`).
- Add `TYPE_LABELS`, `URL_LABEL`/placeholder (where relevant), and tag classes for
  the six new types (e.g. Apple Charts, Last.fm, Genius, Shazam, Spotify Global,
  Hype Machine).

## Testing

- **Migration test** (temp SQLite DB, mirroring `test/config-store.test.js`'s
  temp-dir pattern): after `initDb()`, assert the six built-in rows exist; create a
  non-default persona, run the migration, assert its `source_ids` gained the
  built-in IDs; run init again and assert the guard prevents a second merge (a
  manually-removed built-in stays removed).
- **POST rejection test:** `POST /api/sources` with `type: 'apple-charts'` returns
  400; with `type: 'rss'` succeeds. (May be exercised via a small supertest-style
  call or a direct handler unit test, matching repo conventions.)
- **Manual:** toggle a built-in off → confirm `digest.js` skips that scraper in the
  run log; confirm the Built-in/Custom grouping renders and built-in rows have no
  delete button; confirm the add dropdown lists only custom types.

## Risks / notes

- **Dependency on the YouTube PR.** This branch is based on
  `feat/youtube-custom-charts` because that PR makes `youtube` a custom,
  user-addable type and already un-fenced it in the UI. Merge order: YouTube PR
  first, then this.
- **Persona migration correctness** is the main risk — it must run exactly once and
  must not clobber a user's deliberate removals. The `settings` guard flag plus an
  idempotent union addresses this; the migration test pins it.
- **No data loss:** removing the `enabled`-gating for a built-in (turning it off)
  only skips that scrape for that run; baselines and prior digests are untouched.

## Open items for the implementation plan

- Exact descriptive `url` strings for the six seeded built-in rows.
- Whether the Test route's `lastfm` branch reports artist count or track count.
- Final display names / tag colors for the six built-in types in the UI.

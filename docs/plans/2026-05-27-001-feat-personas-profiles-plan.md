---
title: "feat: Add Personas — per-profile source sets, digest history, and Spotify playlists"
type: feat
status: active
date: 2026-05-27
origin: docs/brainstorms/personas-requirements.md
---

# feat: Add Personas — per-profile source sets, digest history, and Spotify playlists

## Overview

Adds **Personas** — named profiles (analogous to Safari profiles) that each own a distinct set of sources, a separate digest history, and a separate Spotify playlist. Switching the active persona shifts the entire app context: Today, History, This Month, Sources, and Playlist all filter to that persona's world. A built-in "All Sources" persona is always present and auto-includes every non-archived source.

---

## Problem Frame

Users want targeted briefs (indie world, hyperpop, no-mainstream) without manually toggling individual sources before every run. There is no way today to save a named source configuration and run it repeatably. (See origin: `docs/brainstorms/personas-requirements.md`)

---

## Requirements Trace

- R1. A persona has a name, a source list, and a Spotify playlist; multiple personas can coexist
- R2. "All Sources" is built-in, undeletable, and auto-includes all non-archived sources
- R3. The active persona is the sole determinant of which sources a digest run uses
- R4. Multiple digests on the same calendar date are valid — one per persona
- R5. History, This Month, and Playlist screens show data only for the active persona
- R6. Each persona's Spotify playlist is created lazily on first digest run under that persona
- R7. Spotify connection (OAuth) is shared; playlists are per-persona
- R8. Schedule, email, and SMTP settings are shared across all personas
- R9. Adding a source to the global pool auto-adds it to "All Sources" only
- R10. The per-source `enabled` flag becomes an "archived/hidden" flag — archived sources appear in no persona's source list

---

## Scope Boundaries

- Per-persona scheduled delivery (different send times per persona) — not in scope
- Per-persona AI prompt tuning or editorial voice — not in scope
- Persona sharing or export — not in scope
- Auto-switching based on time of day — not in scope

### Deferred to Follow-Up Work

- Per-persona schedule settings — separate future iteration once personas are stable

---

## Context & Research

### Relevant Code and Patterns

- `db/init.js` — DB init, migration pattern, all five table definitions
- `processor/digest.js:38` — source query (`WHERE enabled = 1`) that becomes the persona filter
- `processor/digest.js:28` — double-run guard (`WHERE date = ?`) that must scope to persona
- `processor/digest.js:149` — digest INSERT that needs `persona_id`
- `processor/spotify.js:12–18` — `getSetting`/`setSetting` helpers; all Spotify state lives in flat `settings` table
- `processor/spotify.js:89–123` — `getOrCreatePlaylist`: reads global `spotify_playlist_id` + `spotify_playlist_name`; on new playlist creation runs `DELETE FROM playlist_tracks` (must be scoped to persona)
- `processor/spotify.js:145` — `appendSongsToPlaylist(songs, date)` entry point
- `delivery/routes.js` — all API routes; source of truth for what the backend exposes
- `src/main.jsx` — App component; holds `route` state and `refreshTrigger` pattern (from commit `3f3d97c`)
- `src/components.jsx:108–143` — Sidebar component + `sidebar-bottom` Spotify pill (persona switcher lives here)
- `src/api.js` — all frontend API calls

### Institutional Learnings

- **Rename-copy-drop migration** for constraint changes: SQLite cannot alter `UNIQUE` constraints in place. Pattern from `db/init.js:64–79`: rename → create new → insert → drop. Required for the `digests` table.
- **playlist_tracks dedup must outlive digests**: rows in `playlist_tracks` are never cascade-deleted with their digest. Per-persona dedup requires a `persona_id` column scoped in all dedup reads/writes.
- **`DELETE FROM playlist_tracks` scoping**: current `getOrCreatePlaylist` nukes all dedup on playlist recreation. With multiple personas this would destroy other personas' dedup. Must become `DELETE FROM playlist_tracks WHERE persona_id = ?`.
- **`active_persona_id` belongs in the DB `settings` table** — not in `config-store.js`. config-store is for boot-time credentials; `active_persona_id` is runtime state read after `initDb()`.
- **`refreshTrigger` pattern**: after any server-side state change, React screens need an explicit signal to re-fetch. `App` holds an integer counter; incrementing it from the persona switcher causes all persona-sensitive `useEffect` hooks to refire.

### External References

No external research needed — all patterns are established in the codebase.

---

## Key Technical Decisions

- **"All Sources" persona uses a special wildcard query, not a source_ids list**: for `is_default=1`, the digest runner queries `WHERE enabled = 1` (same as today). Custom personas query `WHERE id IN (source_ids) AND enabled = 1`. This keeps "All Sources" auto-updating and avoids syncing a large ID list on every source add/remove.
- **`enabled` flag repurposed as "archived"**: rather than removing the column (a risky migration), `enabled=0` now means "archived — hidden from all persona source pickers and never run". The Sources screen toggle becomes Archive/Unarchive. This is purely a behavior change, no schema change.
- **Per-persona Spotify settings stored as namespaced keys**: `spotify_playlist_id_{personaId}` and `spotify_playlist_name_{personaId}` in the flat `settings` table, rather than a new table. This reuses existing `getSetting`/`setSetting` helpers with no schema change.
- **`active_persona_id` stored in DB `settings` table** (key: `active_persona_id`), not in `config-store.js`.
- **`runDigest` opts extend with `personaId`**: the scheduler and manual run button both pass the active persona's ID; no implicit global is threaded.
- **Persona switcher in the sidebar below the brand**, replacing or sitting above the Spotify pill.
- **Source membership UI**: checkbox list in a create/edit modal — no drag-and-drop. One checkbox per source grouped by type.

---

## Open Questions

### Resolved During Planning

- **Where does `active_persona_id` live?** DB `settings` table (R: see institutional learnings above — config-store is only for boot-time secrets).
- **Persona switcher placement?** Sidebar, below brand, above nav groups. (R: user confirmed Safari-style profile concept; sidebar is the natural home.)
- **What happens to per-source `enabled` toggle?** Repurposed as "archived/hidden" — not removed. Behavior change only, no schema change on the column itself. (R: simpler than removal; preserves data integrity.)
- **Source membership UI in editor?** Checkboxes grouped by type. (R: keeps scope bounded; drag-and-drop is a future refinement.)
- **All Sources persona: explicit ID list or wildcard?** Wildcard (`WHERE enabled = 1`). (R: auto-maintains correctness without any sync logic.)

### Deferred to Implementation

- **Exact SQL for the rename-copy-drop migration of `digests`**: verify whether the current `UNIQUE` is inline or a separate index via `sqlite_master` before writing migration code. The approach is decided; the exact DDL depends on what `sqlite_master` returns.
- **Scheduler multi-persona behavior**: for MVP, the scheduler runs only the active persona. Implementation detail — no separate dispatch loop needed now.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Data model changes

```
personas
├── id (PK)
├── name
├── source_ids (JSON array, null/empty = "all" for is_default)
├── is_default (1 = All Sources)
└── created_at

sources (unchanged schema — behavior change only)
└── enabled: 0 now means "archived", not "disabled for this run"

digests (persona_id added)
├── id (PK)
├── date
├── persona_id → personas.id   ← NEW
├── UNIQUE(date, persona_id)   ← replaces UNIQUE(date)
└── … existing columns …

playlist_tracks (composite PK change)
├── (track_id, persona_id) PK   ← replaces track_id PRIMARY KEY
├── persona_id → personas.id    ← NEW
└── … existing columns …

settings (new keys, no schema change)
  active_persona_id = "3"
  spotify_playlist_id_3 = "37i9..."
  spotify_playlist_name_3 = "Indie World · Music Digest"
```

### Persona switch flow

```
User taps persona pill
  → POST /api/personas/active  { id }
      → settings: active_persona_id = id
  → App increments refreshTrigger
      → DigestScreen re-fetches /api/digest/latest    (filtered by persona_id)
      → HistoryScreen re-fetches /api/digests          (filtered by persona_id)
      → MonthlyScreen re-fetches /api/monthly/:y/:m    (filtered by persona_id)
      → PlaylistScreen re-fetches /api/playlist_tracks (filtered by persona_id)
      → SourcesScreen re-fetches /api/sources          (filtered by persona membership)
```

---

## Implementation Units

- U1. **DB schema — personas table, digests migration, playlist_tracks column**

**Goal:** Lay the foundation: new `personas` table, `persona_id` on `digests` and `playlist_tracks`, relaxed unique constraint on digests, seed the "All Sources" default persona, and set `active_persona_id` in settings.

**Requirements:** R1, R2, R4, R10

**Dependencies:** None

**Files:**
- Modify: `db/init.js`

**Approach:**
- Add new `CREATE TABLE IF NOT EXISTS personas` DDL alongside existing tables.
- **`digests` migration** (rename-copy-drop): the current `date TEXT UNIQUE NOT NULL` column definition is an *inline* UNIQUE constraint — confirmed from `db/init.js:102`. Guard on `!digestsInfo.sql.includes('persona_id')` (check the table DDL, not `sqlite_master` index entries). Rename → create with `date TEXT NOT NULL` (no inline UNIQUE) + `persona_id INTEGER` → copy → drop → `CREATE UNIQUE INDEX ON digests(date, persona_id)`.
- **`playlist_tracks` migration** (also rename-copy-drop): the current `track_id TEXT PRIMARY KEY` must change to a composite `PRIMARY KEY (track_id, persona_id)` so the same Spotify track can exist under multiple personas. An additive `ALTER TABLE … ADD COLUMN` is not sufficient here — the PK cannot be changed in place. Guard on `!tracksInfo.sql.includes('persona_id')`. Pattern same as `digests`.
- After table creation/migration, seed the "All Sources" persona if the `personas` table is empty: `INSERT INTO personas (name, is_default) VALUES ('All Sources', 1)`.
- After seeding, if `SELECT value FROM settings WHERE key = 'active_persona_id'` returns null, insert it pointing to the "All Sources" persona ID via `SELECT id FROM personas WHERE is_default = 1` (never hardcode `1`).
- All migration steps wrapped in `db.transaction()` where multiple statements must be atomic.

**Patterns to follow:**
- Existing migration guard pattern at `db/init.js:59–79` (rename-copy-drop)
- Existing additive migration at `db/init.js:83–87` (`ALTER TABLE … ADD COLUMN`)

**Test scenarios:**
- Happy path: fresh DB — personas table exists, "All Sources" persona is seeded, `active_persona_id` in settings equals the seeded persona's ID
- Happy path: existing DB (upgrade path) — `personas` table is created, `digests` and `playlist_tracks` are migrated via rename-copy-drop, existing digest rows have `persona_id = NULL`, unique index on `(date, persona_id)` allows two rows with same date but different persona_ids, `playlist_tracks` PK is now composite
- Edge case: running `initDb()` twice is idempotent — no duplicate personas, no errors on second run
- Edge case: `digests` table already has the `persona_id` column (guard checks `!sql.includes('persona_id')`, correctly skips migration)
- Edge case: migration guard checks the table DDL string (not `sqlite_master` index entries) — verifies the inline UNIQUE is gone after migration

**Verification:**
- `SELECT * FROM personas` returns one row (All Sources, is_default=1) on a fresh DB
- Two `INSERT INTO digests (date, persona_id)` with same date but different persona_ids succeeds; same date + same persona_id fails with UNIQUE constraint error
- `SELECT value FROM settings WHERE key = 'active_persona_id'` returns the All Sources persona's ID

---

- U2. **Personas CRUD API + active persona middleware**

**Goal:** Expose REST endpoints for persona management and active persona switching; add middleware that attaches `req.activePersonaId` to every request.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Modify: `delivery/routes.js`
- Modify: `src/api.js`

**Approach:**

New endpoints:
- `GET /api/personas` — return all personas (id, name, is_default, source_ids)
- `POST /api/personas` — create persona; body: `{ name, sourceIds: [1,2,3] }`; rejects if name conflicts; rejects delete of is_default
- `PATCH /api/personas/:id` — update name or sourceIds; rejects modifications to is_default persona's name
- `DELETE /api/personas/:id` — reject if is_default; if active persona is deleted, switch active to is_default persona first; cascade-delete nothing (digest history is preserved, just orphaned from the persona — acceptable)
- `GET /api/personas/active` — return active persona full object
- `POST /api/personas/active` — body: `{ id }`; writes `active_persona_id` to settings

Middleware (add near top of routes.js, runs on all routes): read `active_persona_id` from settings; if missing or invalid, fall back to the `is_default=1` persona ID via `SELECT id FROM personas WHERE is_default = 1`. **Do not hardcode `1`** — persona IDs are autoincrement and `1` is only guaranteed on a fresh DB. This is a synchronous SQLite read (cheap). All downstream handlers use `req.activePersonaId`.

Frontend (`src/api.js`) additions:
- `api.personas()` → `GET /api/personas`
- `api.createPersona(body)` → `POST /api/personas`
- `api.updatePersona(id, body)` → `PATCH /api/personas/:id`
- `api.deletePersona(id)` → `DELETE /api/personas/:id`
- `api.activePersona()` → `GET /api/personas/active`
- `api.setActivePersona(id)` → `POST /api/personas/active`

**Patterns to follow:**
- Existing CRUD pattern for sources at `delivery/routes.js` (GET/POST/PATCH/DELETE `/api/sources`)

**Test scenarios:**
- Happy path: `GET /api/personas` returns at least the All Sources persona
- Happy path: `POST /api/personas` with valid name + sourceIds creates a persona, returned in subsequent GET
- Happy path: `POST /api/personas/active { id: N }` → `GET /api/personas/active` returns persona N
- Error path: `DELETE /api/personas/:id` on the is_default persona returns 400
- Error path: `PATCH /api/personas/:id` with a duplicate name returns 400
- Edge case: `DELETE /api/personas/:id` on the currently active persona → active switches to All Sources

**Verification:**
- All endpoints return correct HTTP status codes and JSON
- `req.activePersonaId` is set on every route handler (spot-check three unrelated handlers)

---

- U3. **Digest runner — persona source filtering and per-persona save**

**Goal:** `runDigest` uses only the active persona's source list; the saved digest is tagged with `persona_id`; the double-run guard is scoped per persona.

**Requirements:** R3, R4

**Dependencies:** U1, U2

**Files:**
- Modify: `processor/digest.js`

**Approach:**
- `runDigest(opts)` accepts a new optional `opts.personaId`. Callers that don't pass it should default to the active persona from settings (read at the top of `runDigest` using the same `getSetting`-style query).
- Double-run guard: `WHERE date = ? AND persona_id = ?` (or `WHERE date = ? AND persona_id IS NULL` for the null-persona legacy case — but only if needed; simpler to just use the resolved ID).
- Source query: if `is_default` persona, keep `WHERE enabled = 1` unchanged. If custom persona, `WHERE id IN (${sourceIds.join(',')}) AND enabled = 1`. Source IDs come from `JSON.parse(persona.source_ids)`. **Before interpolating into SQL, validate that every element is a positive integer** (`Number.isInteger(id) && id > 0`) and throw if not — this prevents SQL injection from corrupted `source_ids` data.
- The `INSERT OR REPLACE INTO digests` at line 149 gains `persona_id` column. Note: `INSERT OR REPLACE` deletes the conflicting row and re-inserts on UNIQUE collision — this is pre-existing behavior (force re-runs delete the old digest row). This is acceptable; document it as intentional.
- `appendSongsToPlaylist` call at line 130 gains `personaId` parameter (for U4).
- **Scheduler note**: `index.js` should call `runDigest({})` without a hardcoded `personaId`; `runDigest` reads `active_persona_id` from settings lazily at call time (not captured at app start). This ensures the scheduler always uses the current active persona, not the one at startup.
- Log lines include `[persona: ${personaName}]` prefix for observability.

**Patterns to follow:**
- `processor/digest.js:22–38` (existing `runDigest` header and source query)

**Test scenarios:**
- Happy path: `runDigest({ personaId: allSourcesId })` scrapes all enabled sources and saves digest with `persona_id = allSourcesId`
- Happy path: `runDigest({ personaId: customId })` where custom persona has 3 source IDs — only those 3 sources are queried
- Happy path: two calls with different `personaId` on same date both succeed (no UNIQUE violation)
- Edge case: `runDigest({ force: false, personaId: X })` where a digest for that date+personaId already exists → returns `{ skipped: true }` without re-running
- Edge case: `runDigest({ force: true, personaId: X })` re-runs even if today's digest exists for that persona
- Edge case: custom persona with empty `source_ids` — runner logs a warning and aborts gracefully rather than running with zero sources

**Verification:**
- `SELECT persona_id FROM digests ORDER BY id DESC LIMIT 1` matches the `personaId` passed to `runDigest`
- Two digest rows exist for the same date with different `persona_id` values after running two personas

---

- U4. **Spotify module — per-persona playlist and dedup scoping**

**Goal:** Each persona gets its own Spotify playlist; dedup in `playlist_tracks` is scoped to persona; `DELETE FROM playlist_tracks` on playlist recreation only affects the relevant persona.

**Requirements:** R6, R7

**Dependencies:** U1, U3

**Files:**
- Modify: `processor/spotify.js`

**Approach:**

The `appendSongsToPlaylist(songs, date)` signature extends to `appendSongsToPlaylist(songs, date, personaId)`. All downstream helpers receive `personaId`.

Playlist settings keying:
- `getOrCreatePlaylist(api, personaId)` reads `getSetting(`spotify_playlist_id_${personaId}`)` and `getSetting(`spotify_playlist_name_${personaId}`)`.
- Fallback playlist name: fetch from `db.prepare('SELECT name FROM personas WHERE id = ?').get(personaId)?.name` + ` · Music Digest` (e.g., "Indie World · Music Digest"). Falls back to `DEFAULT_PLAYLIST_NAME` if persona not found.
- On playlist creation: `setSetting(`spotify_playlist_id_${personaId}`, playlist.id)`.
- On existing playlist detection, rename uses persona-specific name from above.
- The `DELETE FROM playlist_tracks` line changes to `DELETE FROM playlist_tracks WHERE persona_id = ?` (bound to `personaId`).

Dedup scoping:
- `appendSongsToPlaylist` dedup check: `WHERE track_id = ? AND persona_id = ?`.
- After adding tracks: `INSERT INTO playlist_tracks (track_id, track_name, artist_name, added_at, digest_date, persona_id) VALUES (…)`.

`isConnected()` and `getPlaylistUrl(personaId)` helper:
- `getPlaylistUrl` reads `getSetting(`spotify_playlist_id_${personaId}`)`.
- Export `getPlaylistUrl` so routes can call it with a persona ID.

The `/auth/spotify DELETE` (disconnect) route in `delivery/routes.js` currently deletes global Spotify keys. Update it to also delete `spotify_playlist_id_{N}` and `spotify_playlist_name_{N}` for all persona IDs (query all persona IDs, loop and delete each namespaced key).

**Also update `handleCallback`** in `spotify.js`: when OAuth re-connects, it currently deletes only the legacy global `spotify_playlist_id` key (line 51). After this feature, it must also delete all per-persona `spotify_playlist_id_{N}` keys — otherwise re-connecting with a different account reuses old playlists from the previous account. Pattern: `DELETE FROM settings WHERE key LIKE 'spotify_playlist_id_%'`.

**Patterns to follow:**
- `processor/spotify.js:12–18` (getSetting/setSetting helpers)
- `processor/spotify.js:89–123` (getOrCreatePlaylist)
- `processor/spotify.js:145–` (appendSongsToPlaylist)

**Test scenarios:**
- Happy path: two different `personaId` values produce two distinct `spotify_playlist_id_{N}` settings entries after `getOrCreatePlaylist` runs twice
- Happy path: dedup check `WHERE track_id = ? AND persona_id = ?` — same track_id added to persona A does not block it from being added to persona B
- Error path: `DELETE FROM playlist_tracks WHERE persona_id = ?` on playlist recreation — only that persona's tracks are deleted, other personas' dedup rows are preserved
- Edge case: `getPlaylistUrl(personaId)` returns null for a persona that hasn't run a digest yet (no playlist created)
- Integration: `appendSongsToPlaylist(songs, date, personaId)` inserts `playlist_tracks` rows with the correct `persona_id`

**Verification:**
- `SELECT DISTINCT persona_id FROM playlist_tracks` shows separate entries per persona after each has run
- Disconnecting Spotify removes all `spotify_playlist_id_{N}` keys from settings

---

- U5. **API route filtering — history, monthly, playlist, and status by persona**

**Goal:** All read endpoints that surface per-persona data filter by `req.activePersonaId`; the "run digest" endpoint passes the persona to the digest runner.

**Requirements:** R3, R5

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `delivery/routes.js`

**Approach:**

Endpoints to update (all use `req.activePersonaId` from the middleware added in U2):

| Endpoint | Change |
|----------|--------|
| `GET /api/digest/latest` | `WHERE (persona_id = ? OR (? = allSourcesId AND persona_id IS NULL))` — All Sources persona picks up legacy NULL rows |
| `GET /api/digests` (history list) | Same NULL-aware filter as above |
| `GET /api/digests/:date` | `WHERE date = ? AND (persona_id = ? OR (? = allSourcesId AND persona_id IS NULL))` |
| `DELETE /api/digests` | `WHERE date IN (...) AND persona_id = ?` — legacy NULL rows are only deletable when active persona is All Sources (add `OR persona_id IS NULL` when is_default) |
| `GET /api/monthly/:year/:month` | NULL-aware persona filter on the digest aggregation subquery |
| `GET /api/playlist_tracks` | Add `WHERE persona_id = ?` (no NULL fallback — legacy tracks have no persona, show them only under All Sources via `OR persona_id IS NULL` when is_default) |
| `GET /api/status` | `sourcesCount` scoped to persona; expose `activePersona` object; `playlistUrl` reads `getPlaylistUrl(req.activePersonaId)` not the global key |
| `POST /api/run` | Pass `personaId: req.activePersonaId` to `runDigest(opts)` |
| `POST /api/digests/:date/resend` | Fetch digest with persona_id filter; scope the `playlist_tracks WHERE digest_date = ?` sub-query to `AND persona_id = ?` |
| `POST /api/settings/spotify-playlist-name` | Write `spotify_playlist_name_{activePersonaId}` instead of the global `spotify_playlist_name` key |
| `GET /api/settings` | Read `playlistUrl` via `getPlaylistUrl(activePersonaId)` not the global `spotify_playlist_id` key |

**NULL-aware pattern for All Sources**: where `allSourcesId` is retrieved once per request as `SELECT id FROM personas WHERE is_default = 1`, binding it as a parameter avoids hardcoding `1`. The condition `persona_id = ? OR (is_default AND persona_id IS NULL)` ensures legacy rows surface under the All Sources context without rewriting them.

The `GET /api/sources` endpoint returns sources for the current persona's context:
- For All Sources: all sources (current behavior)
- For custom persona: return all sources, but add a `inPersona: true/false` field so the UI can show membership; the endpoint does NOT filter the list — the Sources screen always shows all sources to allow editing persona membership

**Patterns to follow:**
- Existing query patterns throughout `delivery/routes.js`

**Test scenarios:**
- Happy path: after running digest A under persona 1 and digest B under persona 2, `GET /api/digest/latest` with active persona 1 returns digest A; switching active to persona 2 returns digest B
- Happy path: `GET /api/digests` returns only digests for the active persona
- Happy path: `GET /api/playlist_tracks` returns only tracks added under the active persona
- Happy path: `GET /api/settings` returns the active persona's `playlistUrl` (not null, not the global legacy key)
- Happy path: `POST /api/settings/spotify-playlist-name` with persona 3 active writes `spotify_playlist_name_3`, and the next `GET /api/settings` reflects that name
- Edge case: legacy digest rows (`persona_id = NULL`) appear in history when active persona is All Sources (the NULL-aware query returns them); they do NOT appear when a custom persona is active
- Edge case: `DELETE /api/digests` with `dates: [...]` only deletes from the active persona, leaving same-date digests under other personas intact
- Edge case: resend endpoint fetches `playlist_tracks WHERE digest_date = ? AND persona_id = ?` — tracks from another persona's same-date digest are excluded from the unmatched list
- Integration: `POST /api/run` triggers `runDigest({ personaId: req.activePersonaId })` — digest is saved under the correct persona

**Verification:**
- Switching active persona via the API and re-querying `/api/digest/latest` returns data from the new persona
- `GET /api/status` includes an `activePersona` field with the active persona's name and ID

---

- U6. **Frontend — persona switcher, state wiring, and API additions**

**Goal:** App-level persona state; a persona switcher in the sidebar; `refreshTrigger` fires on persona switch; all screens receive the active persona ID for display context.

**Requirements:** R1, R3, R5

**Dependencies:** U2, U5

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/components.jsx`
- Modify: `src/api.js`

**Approach:**

`src/api.js`: add the six persona API methods from U2 (personas, createPersona, updatePersona, deletePersona, activePersona, setActivePersona).

`src/main.jsx` (App component):
- Add `const [personas, setPersonas] = useState([])` and `const [activePersona, setActivePersona] = useState(null)`.
- On mount (alongside existing status fetch): `api.personas().then(setPersonas)` and `api.activePersona().then(setActivePersona)`.
- Add `switchPersona(id)` handler: calls `api.setActivePersona(id)`, then updates `activePersona` state and increments `refreshTrigger`. This single function is the only place that triggers a global data refresh on persona change.
- Pass `personas`, `activePersona`, and `onSwitchPersona` to `Sidebar`.
- Existing `refreshTrigger` prop already flows to screens; persona switch reuses the same mechanism.

`src/components.jsx` (Sidebar):
- Accept `personas`, `activePersona`, `onSwitchPersona` props.
- Render a persona switcher section between the brand mark and the nav groups.
- Each persona renders as a pill or compact row with its name; the active one is highlighted.
- A `+` icon opens the persona editor (calls `onNavigate('persona-editor')` or a modal — see U7).
- Keep sidebar-bottom Spotify pill unchanged.

**Patterns to follow:**
- `refreshTrigger` increment pattern in `src/main.jsx` (added in commit `3f3d97c`, used in `SettingsScreen`)
- `Sidebar` component structure in `src/components.jsx:108–143`

**Test scenarios:**
- Happy path: on app load, the sidebar shows all personas; the active one is visually distinguished
- Happy path: tapping a different persona pill calls `api.setActivePersona`, updates `activePersona` state, and increments `refreshTrigger`
- Edge case: `api.personas()` fails on load — app shows "All Sources" as fallback (no crash)
- Integration: after switching persona, DigestScreen, HistoryScreen, and PlaylistScreen all reload with the new persona's data (verify `refreshTrigger` dependency array is correctly set in each screen's `useEffect`)

**Verification:**
- Switching persona in the sidebar causes the Today screen to show the new persona's last digest (or "No digest yet" if none)
- The active persona name appears in the sidebar in a highlighted state

---

- U7. **Persona editor UI — create, edit, delete personas**

**Goal:** A persona management UI where users can create personas, name them, select their sources, and delete non-default personas.

**Requirements:** R1, R2, R9

**Dependencies:** U2, U6

**Files:**
- Modify: `src/screens.jsx` (add `PersonaEditorScreen`)
- Modify: `src/main.jsx` (add `persona-editor` route case)
- Modify: `src/api.js` (already done in U6)

**Approach:**

Add a new `PersonaEditorScreen` component in `src/screens.jsx`. It is navigated to via `onNavigate('persona-editor')` from the `+` button in the sidebar persona switcher.

The screen shows:
1. A list of existing personas (read from an `api.personas()` call on mount). Each has an edit pencil and, if not the default, a trash icon.
2. A "New persona" form: a name text input and a checkbox list of all sources grouped by type (mirrors the Sources screen grouping). On submit, calls `api.createPersona({ name, sourceIds })`.
3. Clicking the edit pencil on an existing persona opens an inline or overlay edit form pre-populated with its name and source selection. On submit, calls `api.updatePersona(id, { name, sourceIds })`.
4. Clicking trash on a persona shows a confirm dialog then calls `api.deletePersona(id)`. If the deleted persona was active, the backend already switched to All Sources (U2); the UI should refresh the switcher.
5. The "All Sources" persona row shows a lock icon instead of edit/delete controls.

Sources in the checkbox list:
- Fetched via `api.sources()` (returns all sources with `inPersona` boolean from U5)
- Grouped by type (reddit, rss, html, tiktok, spotify-playlist, tokchart, youtube) — same grouping as SourcesScreen
- Archived sources (enabled=0) are omitted from the list

**Patterns to follow:**
- `SourcesScreen` grouped-list rendering in `src/screens.jsx:476–570`
- `SettingsScreen` form patterns (inputs, save-on-blur) in `src/screens.jsx:573–`

**Test scenarios:**
- Happy path: user creates a persona named "Indie" with 3 sources checked → API call succeeds → new persona appears in sidebar switcher
- Happy path: user edits an existing persona's name → name updates in the switcher immediately
- Happy path: user deletes a non-default persona → it disappears from the list; if it was active, the switcher shows All Sources
- Error path: creating a persona with an empty name shows an inline validation message, does not call the API
- Error path: attempting to delete All Sources via the UI is blocked — the button is absent
- Edge case: "All Sources" persona edit/delete controls are not rendered (only a lock indicator)

**Verification:**
- Creating a new persona and switching to it, then running a digest, produces a digest row with the new `persona_id`
- The persona editor screen renders without JS errors for zero, one, and many personas

---

## System-Wide Impact

- **Interaction graph**: `runDigest` is called from the `POST /api/run` route and from the `setInterval` scheduler in `index.js`. Both now pass `personaId`. The scheduler defaults to `active_persona_id` from settings — the same persona the user last used.
- **Error propagation**: if `active_persona_id` in settings is stale (persona was deleted), routes fall back to the All Sources persona ID; a warning is logged. No crash.
- **State lifecycle risks**: the `DELETE FROM playlist_tracks` in `getOrCreatePlaylist` is the highest-blast-radius write in the Spotify module. Scoping it to `WHERE persona_id = ?` (U4) is load-bearing correctness.
- **API surface parity**: `GET /api/digest/latest`, `GET /api/digests`, `GET /api/monthly`, `GET /api/playlist_tracks` all gain implicit `persona_id` filtering via middleware. Any future consumer of these endpoints will receive persona-filtered data.
- **Integration coverage**: the persona-switch flow spans 5 layers (UI → API → DB → digest runner → Spotify). The most important integration test is: create persona, switch to it, run digest, verify digest saved under the correct `persona_id` and playlist track inserted with the correct `persona_id`.
- **Unchanged invariants**: Spotify OAuth flow, SMTP config, schedule timing, and the scraper modules are untouched. The Claude prompt and scoring logic are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `digests` rename-copy-drop migration (inline UNIQUE → composite index) runs on existing DB | Guard on `!sql.includes('persona_id')` in the table DDL string; wrap in transaction; log timing |
| `playlist_tracks` PK change requires rename-copy-drop — same track_id can only exist once in original schema, blocking cross-persona dedup | Confirmed in plan; U1 does both migrations in sequence |
| `DELETE FROM playlist_tracks` in `getOrCreatePlaylist` nukes cross-persona dedup | U4 scopes it to `WHERE persona_id = ?`; explicit test scenario verifies other personas' rows survive |
| `handleCallback` OAuth re-connect leaves stale per-persona playlist IDs from previous Spotify account | U4 clears all `spotify_playlist_id_%` settings keys via `DELETE FROM settings WHERE key LIKE 'spotify_playlist_id_%'` on re-connect |
| Legacy `persona_id = NULL` digest rows invisible to persona-filtered queries | U5 uses NULL-aware WHERE clause for All Sources persona on all 5 read endpoints |
| Scheduler runs with a stale/deleted `active_persona_id` | `runDigest` reads `active_persona_id` lazily (not captured at startup); falls back to `is_default=1` persona if invalid |
| `source_ids` JSON interpolated into SQL | U3 validates all IDs are positive integers before interpolation |
| Per-persona settings keys accumulate as personas are deleted | U2 delete endpoint clears `spotify_playlist_id_{id}` and `spotify_playlist_name_{id}` from settings |

---

## Documentation / Operational Notes

- Existing digests (before this migration) will appear only under "All Sources" (via the `OR persona_id IS NULL` fallback). This is expected and acceptable.
- The `enabled` toggle in SourcesScreen should be relabelled "Archive" / "Restore" to reflect its new meaning — this is a small UI copy change, not a separate unit.

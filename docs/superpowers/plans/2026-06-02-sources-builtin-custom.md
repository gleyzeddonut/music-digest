# Built-in vs Custom Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Sources screen into Built-in (toggle-only) and Custom (add/edit/delete) sections, and make the six always-on scrapers (Apple Charts, Last.fm, Genius, Shazam, Spotify Global, Hype Machine) real source rows that toggle and persona-scope like any other source.

**Architecture:** Built-in vs custom is derived from `type` via a shared `BUILTIN_TYPES`/`CUSTOM_TYPES` set (no `builtin` column). The six always-on scrapers become seeded source rows and get gated in `digest.js`. A one-time, settings-guarded migration adds built-in source IDs to existing personas. The Sources UI renders two sections by type membership.

**Tech Stack:** Node.js (CommonJS), better-sqlite3, Express, React (Vite). Tests are plain `node` scripts using `node:assert`.

**Spec:** `docs/superpowers/specs/2026-06-02-sources-builtin-custom-design.md`

**IMPORTANT — native module note:** `better-sqlite3` is built for Electron's ABI, so plain `node -e "require('./db/init.js')"` FAILS with a NODE_MODULE_VERSION error. That is NOT a code bug. For files that load sqlite (`db/init.js`, `processor/digest.js`, `delivery/routes.js`), verify syntax with `node --check <file>` (parses without running requires). Runtime DB behavior is verified manually in the app (Task 7). Pure-logic modules are unit-tested normally.

---

## File Structure

- **Create** `lib/source-types.js` — shared `CUSTOM_TYPES` / `BUILTIN_TYPES` (server source of truth).
- **Create** `lib/persona-sources.js` — pure `mergeBuiltinIds(existing, builtinIds)` helper.
- **Create** `test/source-types.test.js`, `test/persona-sources.test.js` — pure unit tests.
- **Modify** `db/init.js` — widen type CHECK, seed six built-in rows, one-time persona migration.
- **Modify** `processor/digest.js` — gate the six always-on scrapers on their source rows.
- **Modify** `delivery/routes.js` — reject adding/deleting built-in types; add Test-route branches for the six built-in types.
- **Modify** `src/screens.jsx` — two sections (Custom / Built-in), restrict the add dropdown to custom types, labels for the six new types.

Canonical type sets (used throughout):
```
CUSTOM_TYPES  = ['reddit', 'rss', 'html', 'spotify-playlist', 'youtube']
BUILTIN_TYPES = ['apple-charts', 'lastfm', 'genius', 'shazam', 'spotify-global', 'hypem', 'tiktok', 'tokchart']
```

---

## Task 1: Shared source-types module

**Files:**
- Create: `lib/source-types.js`
- Test: `test/source-types.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/source-types.test.js`:
```js
const assert = require('assert');
const { CUSTOM_TYPES, BUILTIN_TYPES } = require('../lib/source-types');

// Disjoint
for (const t of CUSTOM_TYPES) assert.ok(!BUILTIN_TYPES.includes(t), `${t} must not be in both sets`);
// Expected membership
assert.ok(CUSTOM_TYPES.includes('youtube'), 'youtube is custom');
assert.ok(CUSTOM_TYPES.includes('reddit'), 'reddit is custom');
assert.ok(BUILTIN_TYPES.includes('apple-charts'), 'apple-charts is built-in');
assert.ok(BUILTIN_TYPES.includes('tiktok') && BUILTIN_TYPES.includes('tokchart'), 'tiktok/tokchart are built-in');
// Exhaustive: union is exactly the 13 known types
const all = [...CUSTOM_TYPES, ...BUILTIN_TYPES].sort();
assert.deepStrictEqual(all, [
  'apple-charts','genius','hypem','html','lastfm','reddit','rss','shazam','spotify-global','spotify-playlist','tiktok','tokchart','youtube'
].sort());
console.log('✓ source-types');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/source-types.test.js`
Expected: FAIL — `Cannot find module '../lib/source-types'`.

- [ ] **Step 3: Create `lib/source-types.js`**

```js
'use strict';

// Single source of truth for source-type categorization.
// Custom: the user supplies a URL and can add/edit/delete.
// Built-in: fixed system feeds (charts/APIs) — toggle-only, no add/delete.
const CUSTOM_TYPES  = ['reddit', 'rss', 'html', 'spotify-playlist', 'youtube'];
const BUILTIN_TYPES = ['apple-charts', 'lastfm', 'genius', 'shazam', 'spotify-global', 'hypem', 'tiktok', 'tokchart'];

module.exports = { CUSTOM_TYPES, BUILTIN_TYPES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/source-types.test.js`
Expected: PASS — `✓ source-types`.

- [ ] **Step 5: Commit**

```bash
git add lib/source-types.js test/source-types.test.js
git commit -m "feat(sources): shared built-in/custom type sets"
```

---

## Task 2: Pure persona-merge helper

**Files:**
- Create: `lib/persona-sources.js`
- Test: `test/persona-sources.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/persona-sources.test.js`:
```js
const assert = require('assert');
const { mergeBuiltinIds } = require('../lib/persona-sources');

assert.deepStrictEqual(mergeBuiltinIds([1, 2], [3, 4]), [1, 2, 3, 4]);
assert.deepStrictEqual(mergeBuiltinIds([1, 2, 3], [3, 4]), [1, 2, 3, 4], 'no duplicates');
assert.deepStrictEqual(mergeBuiltinIds([], [5, 6]), [5, 6]);
assert.deepStrictEqual(mergeBuiltinIds(null, [5]), [5], 'tolerates non-array');
assert.deepStrictEqual(mergeBuiltinIds([7], []), [7]);
console.log('✓ persona-sources mergeBuiltinIds');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/persona-sources.test.js`
Expected: FAIL — `Cannot find module '../lib/persona-sources'`.

- [ ] **Step 3: Create `lib/persona-sources.js`**

```js
'use strict';

// Union a persona's existing source IDs with the built-in source IDs,
// preserving order and de-duplicating. Pure — no DB access.
function mergeBuiltinIds(existing, builtinIds) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out);
  for (const id of builtinIds) {
    if (!seen.has(id)) { out.push(id); seen.add(id); }
  }
  return out;
}

module.exports = { mergeBuiltinIds };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/persona-sources.test.js`
Expected: PASS — `✓ persona-sources mergeBuiltinIds`.

- [ ] **Step 5: Commit**

```bash
git add lib/persona-sources.js test/persona-sources.test.js
git commit -m "feat(sources): pure mergeBuiltinIds helper for persona migration"
```

---

## Task 3: DB — widen type CHECK, seed built-ins, persona migration

**Files:**
- Modify: `db/init.js`

No automated test (better-sqlite3 is Electron-ABI; can't load under `node`). Verify with `node --check` and manual app run (Task 7).

- [ ] **Step 1: Widen the allowed types**

In `db/init.js`, change the `NEW_TYPES` constant (currently around line 57):
```js
  const NEW_TYPES = "'reddit','rss','html','tiktok','spotify-playlist','tokchart','youtube'";
```
to:
```js
  const NEW_TYPES = "'reddit','rss','html','tiktok','spotify-playlist','tokchart','youtube','apple-charts','lastfm','genius','shazam','spotify-global','hypem'";
```

- [ ] **Step 2: Trigger the rebuild migration on existing DBs**

In the `needsSourcesMigration` guard (around line 86-88), add a check for one of the new types so existing databases rebuild with the widened CHECK. Change:
```js
  const needsSourcesMigration = tableInfo && (
    !tableInfo.sql.includes("'tiktok'") || !tableInfo.sql.includes("'spotify-playlist'") || !tableInfo.sql.includes("'tokchart'") || !tableInfo.sql.includes("'youtube'")
  );
```
to:
```js
  const needsSourcesMigration = tableInfo && (
    !tableInfo.sql.includes("'tiktok'") || !tableInfo.sql.includes("'spotify-playlist'") || !tableInfo.sql.includes("'tokchart'") || !tableInfo.sql.includes("'youtube'") || !tableInfo.sql.includes("'apple-charts'")
  );
```
(The rebuild's `INSERT INTO sources SELECT *` stays valid — no columns change.)

- [ ] **Step 3: Seed the six built-in source rows**

In `DEFAULT_SOURCES` (the array near the top of the file), add these six entries at the end of the array, before the closing `];`:
```js
  // Built-in fixed-feed scrapers (toggle-only in the UI). URLs are cosmetic —
  // these scrapers ignore them, like the tokchart/youtube rows above.
  { type: 'apple-charts',   name: 'Apple Charts',  url: 'https://music.apple.com/us/charts/songs' },
  { type: 'lastfm',         name: 'Last.fm',       url: 'https://www.last.fm/charts' },
  { type: 'genius',         name: 'Genius',        url: 'https://genius.com/#top-songs' },
  { type: 'shazam',         name: 'Shazam',        url: 'https://www.shazam.com/charts/top-200/united-states' },
  { type: 'spotify-global', name: 'Spotify Global', url: 'https://charts.spotify.com/charts/view/regional-global-daily/latest' },
  { type: 'hypem',          name: 'Hype Machine',  url: 'https://hypem.com/popular' },
```

- [ ] **Step 4: Add the persona migration require + function**

Near the top of `db/init.js`, after the existing requires (`const Database = ...`, `const path = ...`), add:
```js
const { BUILTIN_TYPES } = require('../lib/source-types');
const { mergeBuiltinIds } = require('../lib/persona-sources');
```

Then add this function definition just above `function initDb() {`:
```js
// One-time: add the built-in source IDs to every non-default persona, so
// existing personas keep receiving the now-toggleable built-in feeds. Guarded
// by a settings flag so it runs exactly once — a built-in a user later removes
// from a persona must stay removed.
function migrateBuiltinsIntoPersonas(db) {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'builtin_persona_migration_done'").get();
  if (done) return;
  const ph = BUILTIN_TYPES.map(() => '?').join(',');
  const builtinIds = db.prepare(`SELECT id FROM sources WHERE type IN (${ph})`).all(...BUILTIN_TYPES).map(r => r.id);
  const personas = db.prepare('SELECT id, source_ids FROM personas WHERE is_default = 0').all();
  const upd = db.prepare('UPDATE personas SET source_ids = ? WHERE id = ?');
  db.transaction(() => {
    for (const p of personas) {
      let cur;
      try { cur = JSON.parse(p.source_ids || '[]'); } catch { cur = []; }
      upd.run(JSON.stringify(mergeBuiltinIds(cur, builtinIds)), p.id);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('builtin_persona_migration_done', '1')").run();
  })();
}
```

- [ ] **Step 5: Call the migration at the end of `initDb`**

In `initDb`, just before the final `return db;`, add:
```js
  // Run after sources are seeded (both fresh-seed and add-defaults paths) so the
  // built-in IDs exist before they're merged into personas.
  migrateBuiltinsIntoPersonas(db);

  return db;
```

- [ ] **Step 6: Verify syntax**

Run: `node --check db/init.js`
Expected: no output (syntax OK). Do NOT use `node -e "require(...)"` here — better-sqlite3's Electron ABI makes that fail unrelated to this change.

- [ ] **Step 7: Commit**

```bash
git add db/init.js
git commit -m "feat(sources): seed built-in source rows + one-time persona migration"
```

---

## Task 4: Gate the six always-on scrapers in the digest

**Files:**
- Modify: `processor/digest.js`

- [ ] **Step 1: Add enabled flags**

In `processor/digest.js`, just after the line:
```js
  const youtubeSources   = sources.filter(s => s.type === 'youtube');
```
add:
```js
  const appleEnabled         = sources.some(s => s.type === 'apple-charts');
  const lastfmEnabled        = sources.some(s => s.type === 'lastfm');
  const geniusEnabled        = sources.some(s => s.type === 'genius');
  const shazamEnabled        = sources.some(s => s.type === 'shazam');
  const spotifyGlobalEnabled = sources.some(s => s.type === 'spotify-global');
  const hypemEnabled         = sources.some(s => s.type === 'hypem');
```

- [ ] **Step 2: Gate the scrape calls**

In the `Promise.all([...])`, replace these five lines:
```js
    scrapeAppleCharts(),
    scrapeLastfm(),
    scrapeGenius(),
    scrapeKworbShazam(),
    scrapeKworbSpotify(),
```
with:
```js
    appleEnabled ? scrapeAppleCharts() : [],
    lastfmEnabled ? scrapeLastfm() : { artists: [], tracks: [] },
    geniusEnabled ? scrapeGenius() : [],
    shazamEnabled ? scrapeKworbShazam() : [],
    spotifyGlobalEnabled ? scrapeKworbSpotify() : [],
```
and replace the line:
```js
    scrapeHypem(),
```
with:
```js
    hypemEnabled ? scrapeHypem() : [],
```
(Note: `lastfm` returns an object `{ artists, tracks }`, so its disabled fallback is `{ artists: [], tracks: [] }`, not `[]`.)

- [ ] **Step 3: Verify syntax**

Run: `node --check processor/digest.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add processor/digest.js
git commit -m "feat(sources): gate always-on scrapers on their built-in source rows"
```

---

## Task 5: API — reject built-in add/delete, add Test branches

**Files:**
- Modify: `delivery/routes.js`

- [ ] **Step 1: Import the type sets**

Near the top of `delivery/routes.js` (with the other requires), add:
```js
const { CUSTOM_TYPES, BUILTIN_TYPES } = require('../lib/source-types');
```

- [ ] **Step 2: Restrict `POST /api/sources` to custom types**

In the `POST /api/sources` handler, replace:
```js
  if (!['reddit', 'rss', 'html', 'tiktok', 'spotify-playlist', 'tokchart', 'youtube'].includes(type)) return res.status(400).json({ error: 'Invalid source type' });
```
with:
```js
  if (!CUSTOM_TYPES.includes(type)) return res.status(400).json({ error: 'That source type is built-in or invalid and cannot be added' });
```

- [ ] **Step 3: Reject deleting a built-in source**

Replace the `DELETE /api/sources/:id` handler:
```js
router.delete('/api/sources/:id', (req, res) => {
  getDb().prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
```
with:
```js
router.delete('/api/sources/:id', (req, res) => {
  const db = getDb();
  const src = db.prepare('SELECT type FROM sources WHERE id = ?').get(req.params.id);
  if (src && BUILTIN_TYPES.includes(src.type)) {
    return res.status(400).json({ error: 'Built-in sources cannot be deleted' });
  }
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Add Test-route branches for the six built-in types**

In the `POST /api/sources/:id/test` handler, insert these branches immediately before the `} else if (source.type === 'tokchart') {` branch:
```js
    } else if (source.type === 'apple-charts') {
      const { scrapeAppleCharts } = require('../scraper/appleCharts');
      items = await scrapeAppleCharts();
    } else if (source.type === 'lastfm') {
      const { scrapeLastfm } = require('../scraper/lastfm');
      const r = await scrapeLastfm();
      items = r.artists || [];
    } else if (source.type === 'genius') {
      const { scrapeGenius } = require('../scraper/genius');
      items = await scrapeGenius();
    } else if (source.type === 'shazam') {
      const { scrapeKworbShazam } = require('../scraper/kworb');
      items = await scrapeKworbShazam();
    } else if (source.type === 'spotify-global') {
      const { scrapeKworbSpotify } = require('../scraper/kworb');
      items = await scrapeKworbSpotify();
    } else if (source.type === 'hypem') {
      const { scrapeHypem } = require('../scraper/hypem');
      items = await scrapeHypem();
```

- [ ] **Step 5: Verify syntax**

Run: `node --check delivery/routes.js`
Expected: no output (syntax OK).

- [ ] **Step 6: Commit**

```bash
git add delivery/routes.js
git commit -m "feat(sources): reject built-in add/delete; test-scrape built-in sources"
```

---

## Task 6: UI — Built-in / Custom sections

**Files:**
- Modify: `src/screens.jsx`

- [ ] **Step 1: Add labels for the six new types**

In `src/screens.jsx`, find `TYPE_LABELS` (around line 432):
```js
  const TYPE_LABELS = { reddit: 'Reddit', rss: 'RSS', html: 'HTML', tiktok: 'TikTok', 'spotify-playlist': 'Spotify', tokchart: 'Tokchart', youtube: 'YouTube' };
```
Replace with:
```js
  const TYPE_LABELS = { reddit: 'Reddit', rss: 'RSS', html: 'HTML', tiktok: 'TikTok', 'spotify-playlist': 'Spotify', tokchart: 'Tokchart', youtube: 'YouTube', 'apple-charts': 'Apple Charts', lastfm: 'Last.fm', genius: 'Genius', shazam: 'Shazam', 'spotify-global': 'Spotify Global', hypem: 'Hype Machine' };
  // Keep in sync with lib/source-types.js
  const BUILTIN_TYPES = ['apple-charts', 'lastfm', 'genius', 'shazam', 'spotify-global', 'hypem', 'tiktok', 'tokchart'];
  const CUSTOM_TYPES  = ['reddit', 'rss', 'html', 'spotify-playlist', 'youtube'];
```

- [ ] **Step 2: Restrict the add dropdown to custom types**

Find (around line 525):
```jsx
          {Object.entries(TYPE_LABELS).filter(([v]) => v !== 'tokchart').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
```
Replace with:
```jsx
          {Object.entries(TYPE_LABELS).filter(([v]) => CUSTOM_TYPES.includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
```

- [ ] **Step 3: Build all type buckets**

Find (around line 499):
```js
  const grouped = { reddit: [], rss: [], html: [], tiktok: [], 'spotify-playlist': [], tokchart: [], youtube: [] };
  for (const s of (sources || [])) {
    if (grouped[s.type] !== undefined) grouped[s.type].push(s);
    else grouped.html.push(s);
  }
```
Replace with:
```js
  const ALL_TYPES = [...CUSTOM_TYPES, ...BUILTIN_TYPES];
  const grouped = Object.fromEntries(ALL_TYPES.map(t => [t, []]));
  for (const s of (sources || [])) {
    if (grouped[s.type] !== undefined) grouped[s.type].push(s);
    else grouped.html.push(s);
  }
```

- [ ] **Step 4: Hide delete for built-in rows**

Find (around line 581):
```jsx
                  {s.type !== 'tokchart' && (
```
Replace with:
```jsx
                  {!BUILTIN_TYPES.includes(s.type) && (
```

- [ ] **Step 5: Render two sections**

Find the render block (around line 554) that begins:
```jsx
      {sources === null ? <LoadingShell /> : Object.entries(grouped).map(([type, items]) => {
        if (!items.length) return null;
        return (
          <div key={type} className="src-group">
```
Replace the opening `{sources === null ? <LoadingShell /> : Object.entries(grouped).map(([type, items]) => {` line with a `renderGroup` helper and two ordered sections. Change that single line to:
```jsx
      {sources === null ? <LoadingShell /> : (() => {
        const renderGroup = (type) => {
          const items = grouped[type] || [];
          if (!items.length) return null;
          return (
          <div key={type} className="src-group">
```
Then, locate the END of that `.map(...)` callback — the lines:
```jsx
          </div>
        );
      })}
```
(the `</div>` closing `src-group`, then `);`, then `})}` closing the map). Replace those three closing lines with:
```jsx
          </div>
          );
        };
        const sectionStyle = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-2)', margin: '18px 2px 8px' };
        return (
          <>
            <div style={sectionStyle}>Custom</div>
            {CUSTOM_TYPES.map(renderGroup)}
            <div style={sectionStyle}>Built-in</div>
            {BUILTIN_TYPES.map(renderGroup)}
          </>
        );
      })()}
```

NOTE: the body of the original `.map` callback (the entire `<div className="src-group">…</div>` JSX rendering the group header and rows) is unchanged — only the wrapper that was `Object.entries(grouped).map(([type, items]) => { … })` becomes a `renderGroup(type)` helper called once per type within two sections. `items` is now derived inside `renderGroup` from `grouped[type]`.

- [ ] **Step 6: Build the UI**

Run: `npm run build:ui`
Expected: Vite build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens.jsx public/
git commit -m "feat(sources): split Sources into Built-in and Custom sections"
```

---

## Task 7: Full suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the pure unit tests**

Run: `node test/source-types.test.js && node test/persona-sources.test.js && node test/config-store.test.js && node test/youtube-charts.test.js`
Expected: every file prints its `✓` lines, no failures.

- [ ] **Step 2: Syntax-check the sqlite-touching files**

Run: `node --check db/init.js && node --check processor/digest.js && node --check delivery/routes.js && echo "syntax OK"`
Expected: prints `syntax OK`.

- [ ] **Step 3: Manual app verification**

Start the app (`npm run dev`, or the packaged build). In **Sources**:
- Confirm two sections render: **Custom** (Reddit/RSS/HTML/Spotify/YouTube groups) and **Built-in** (Apple Charts, Last.fm, Genius, Shazam, Spotify Global, Hype Machine, TikTok, Tokchart).
- Confirm built-in rows have a working toggle and a **Test** button, but **no delete** button.
- Confirm the add dropdown lists only custom types (no Apple Charts / Last.fm / etc.).
- Toggle a built-in (e.g. Hype Machine) **off**, run a digest, and confirm the run log does **not** show that scraper running (no `[hypem]` line).
- Click **Test** on a built-in (e.g. Apple Charts) and confirm a non-zero sample count.

- [ ] **Step 4: Final commit (if verification required tweaks)**

```bash
git add -A
git commit -m "test(sources): verify built-in/custom suite + manual checks" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Do not** use `node -e "require('./db/init.js')"` (or digest/routes) to verify — `better-sqlite3` is built for Electron's ABI and will throw NODE_MODULE_VERSION. Use `node --check <file>` for syntax and the manual app run for behavior.
- The default persona uses *all enabled* sources, so it automatically picks up built-ins — only non-default personas need the migration (Task 3).
- `tiktok` and `tokchart` are categorized built-in but are already source-driven in `digest.js`; do not add new gating for them.
- New personas created via `POST /api/personas` take an explicit `sourceIds` list from the UI, so they include whatever built-ins the user selects — no special handling needed beyond the existing flow.
```

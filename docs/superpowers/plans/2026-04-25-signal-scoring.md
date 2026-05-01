# Signal Scoring & Two-Tier Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a pre-scoring layer between scraping and Claude that produces Breaking/Rising tiers from chart, editorial, community, and velocity signals.

**Architecture:** Three new scrapers (Apple Charts, Last.fm, Genius) run in parallel with existing scrapers; `processor/scorer.js` aggregates all data into a scored mention map and assigns tiers; Claude receives pre-ranked structured input and writes narrative only; the UI renders two distinct artist sections with signal badges.

**Tech Stack:** Node.js, axios (already installed), better-sqlite3 (already installed), Last.fm REST API (free key), Genius REST API (free key), Apple Music public JSON feed (no key).

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `config.js` | Modify | Add LASTFM_API_KEY, GENIUS_API_KEY |
| `.env.example` | Modify | Document new keys |
| `db/init.js` | Modify | Add `artist_baselines` table + 4 new RSS sources |
| `scraper/appleCharts.js` | Create | Fetch Apple Music Top 100 JSON feed |
| `scraper/lastfm.js` | Create | Fetch Last.fm top artists + tracks, store baselines |
| `scraper/genius.js` | Create | Fetch Genius trending songs |
| `processor/scorer.js` | Create | Entity extraction, 4 sub-scores, tier assignment |
| `processor/digest.js` | Modify | Wire new scrapers + scorer into pipeline |
| `processor/claude.js` | Modify | New prompt format (pre-scored tiers), updated JSON schema |
| `public/index.html` | Modify | Two-tier artist sections, signal badges, tier labels on songs |

---

## Task 1: Config + .env.example

**Files:**
- Modify: `config.js`
- Modify: `.env.example`

- [ ] **Step 1: Add keys to config.js**

Open `config.js`. After the `TIKTOK_CLIENT_SECRET` line, add:

```js
  LASTFM_API_KEY: process.env.LASTFM_API_KEY || '',
  GENIUS_API_KEY: process.env.GENIUS_API_KEY || '',
```

The full relevant section becomes:
```js
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY || '',
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET || '',
  LASTFM_API_KEY: process.env.LASTFM_API_KEY || '',
  GENIUS_API_KEY: process.env.GENIUS_API_KEY || '',
```

- [ ] **Step 2: Document keys in .env.example**

Append to `.env.example`:
```
# Last.fm API — register at https://www.last.fm/api/account/create
LASTFM_API_KEY=

# Genius API — register at https://genius.com/api-clients
GENIUS_API_KEY=
```

- [ ] **Step 3: Verify config loads**

```bash
node -e "const c = require('./config'); console.log('lastfm:', c.LASTFM_API_KEY || '(empty ok)', 'genius:', c.GENIUS_API_KEY || '(empty ok)')"
```

Expected: prints `lastfm: (empty ok) genius: (empty ok)` with no throw.

- [ ] **Step 4: Commit**

```bash
git add config.js .env.example
git commit -m "feat: add LASTFM_API_KEY and GENIUS_API_KEY config"
```

---

## Task 2: DB — artist_baselines table + new RSS sources

**Files:**
- Modify: `db/init.js`

- [ ] **Step 1: Add artist_baselines to the CREATE TABLE block**

In `db/init.js`, inside the `db.exec(...)` call (the big template literal starting at line 64), append after the `settings` table definition:

```js
    CREATE TABLE IF NOT EXISTS artist_baselines (
      artist_name  TEXT PRIMARY KEY,
      listeners    INTEGER,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

The full exec block should end with that table before the closing backtick.

- [ ] **Step 2: Add 4 new RSS sources to DEFAULT_SOURCES**

In `DEFAULT_SOURCES`, after the `XXL Mag` entry, add:

```js
  // New editorial sources (signal scoring)
  { type: 'rss', name: 'The Guardian Music', url: 'https://www.theguardian.com/music/rss' },
  { type: 'rss', name: 'Variety Music',       url: 'https://variety.com/v/music/feed/' },
  { type: 'rss', name: 'Complex Music',        url: 'https://www.complex.com/music/rss' },
  { type: 'rss', name: 'Uproxx Music',         url: 'https://uproxx.com/music/feed/' },
```

- [ ] **Step 3: Verify DB migration**

```bash
node -e "
const { initDb, getDb } = require('./db/init');
initDb();
const db = getDb();
const tbl = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='artist_baselines'\").get();
console.log('artist_baselines table:', tbl ? 'EXISTS' : 'MISSING');
const sources = db.prepare('SELECT name FROM sources WHERE name LIKE ? OR name LIKE ? OR name LIKE ? OR name LIKE ?').all('%Guardian%', '%Variety%', '%Complex Music%', '%Uproxx%');
console.log('new sources:', sources.map(s => s.name));
"
```

Expected: `artist_baselines table: EXISTS` and 4 source names printed.

- [ ] **Step 4: Commit**

```bash
git add db/init.js
git commit -m "feat: add artist_baselines table and 4 editorial RSS sources"
```

---

## Task 3: Apple Charts scraper

**Files:**
- Create: `scraper/appleCharts.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const axios = require('axios');

const FEED_URL = 'https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json';

async function scrapeAppleCharts() {
  try {
    const { data } = await axios.get(FEED_URL, { timeout: 10000 });
    const results = (data?.feed?.results || []).map((item, i) => ({
      rank:   i + 1,
      title:  item.name,
      artist: item.artistName,
    }));
    console.log(`[apple] Top 100: ${results.length} tracks`);
    return results;
  } catch (err) {
    console.warn(`[apple] Failed to fetch charts: ${err.message}`);
    return [];
  }
}

module.exports = { scrapeAppleCharts };
```

- [ ] **Step 2: Smoke test**

```bash
node -e "
const { scrapeAppleCharts } = require('./scraper/appleCharts');
scrapeAppleCharts().then(r => {
  console.log('count:', r.length);
  console.log('first:', r[0]);
  console.log('last:', r[r.length - 1]);
});
"
```

Expected: `count: 100`, first entry shows rank 1 with title and artist strings.

- [ ] **Step 3: Commit**

```bash
git add scraper/appleCharts.js
git commit -m "feat: add Apple Music Top 100 scraper"
```

---

## Task 4: Last.fm scraper

**Files:**
- Create: `scraper/lastfm.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const axios = require('axios');
const config = require('../config');

const BASE = 'https://ws.audioscrobbler.com/2.0/';

async function lastfmGet(method, extra = {}) {
  const key = config.LASTFM_API_KEY;
  if (!key) {
    console.warn('[lastfm] LASTFM_API_KEY not set — skipping');
    return null;
  }
  try {
    const { data } = await axios.get(BASE, {
      timeout: 10000,
      params: { method, api_key: key, format: 'json', limit: 50, ...extra },
    });
    return data;
  } catch (err) {
    console.warn(`[lastfm] ${method} failed: ${err.message}`);
    return null;
  }
}

async function scrapeLastfm() {
  const [artistsData, tracksData] = await Promise.all([
    lastfmGet('chart.getTopArtists'),
    lastfmGet('chart.getTopTracks'),
  ]);

  const artists = (artistsData?.artists?.artist || []).map((a, i) => ({
    name:      a.name,
    rank:      i + 1,
    listeners: parseInt(a.listeners || '0', 10),
  }));

  const tracks = (tracksData?.tracks?.track || []).map((t, i) => ({
    title:    t.name,
    artist:   t.artist?.name || '',
    rank:     i + 1,
    listeners: parseInt(t.listeners || '0', 10),
  }));

  console.log(`[lastfm] Top artists: ${artists.length}, top tracks: ${tracks.length}`);
  return { artists, tracks };
}

module.exports = { scrapeLastfm };
```

- [ ] **Step 2: Smoke test (no key)**

```bash
node -e "
const { scrapeLastfm } = require('./scraper/lastfm');
scrapeLastfm().then(r => console.log('artists:', r.artists.length, 'tracks:', r.tracks.length));
"
```

Expected without a key: prints `[lastfm] LASTFM_API_KEY not set — skipping` twice, then `artists: 0 tracks: 0`.

- [ ] **Step 3: (When you have a key) Test with real data**

Add `LASTFM_API_KEY=yourkey` to `.env`, then re-run the smoke test above.
Expected: `artists: 50 tracks: 50` with no warnings.

- [ ] **Step 4: Commit**

```bash
git add scraper/lastfm.js
git commit -m "feat: add Last.fm chart scraper"
```

---

## Task 5: Genius scraper

**Files:**
- Create: `scraper/genius.js`

- [ ] **Step 1: Create the file**

```js
'use strict';

const axios = require('axios');
const config = require('../config');

const BASE = 'https://api.genius.com';

async function scrapeGenius() {
  const key = config.GENIUS_API_KEY;
  if (!key) {
    console.warn('[genius] GENIUS_API_KEY not set — skipping');
    return [];
  }

  try {
    const { data } = await axios.get(`${BASE}/songs`, {
      timeout: 10000,
      params: { sort: 'popularity', per_page: 50, page: 1 },
      headers: { Authorization: `Bearer ${key}` },
    });

    const songs = (data?.response?.songs || []).map((s, i) => ({
      rank:      i + 1,
      title:     s.title_with_featured || s.title,
      artist:    s.primary_artist?.name || '',
      pageViews: s.stats?.pageviews || 0,
    }));

    console.log(`[genius] Trending: ${songs.length} songs`);
    return songs;
  } catch (err) {
    console.warn(`[genius] Failed: ${err.message}`);
    return [];
  }
}

module.exports = { scrapeGenius };
```

- [ ] **Step 2: Smoke test (no key)**

```bash
node -e "
const { scrapeGenius } = require('./scraper/genius');
scrapeGenius().then(r => console.log('count:', r.length));
"
```

Expected without a key: `[genius] GENIUS_API_KEY not set — skipping` then `count: 0`.

- [ ] **Step 3: (When you have a key) Test with real data**

Add `GENIUS_API_KEY=yourtoken` to `.env`, re-run the smoke test.
Expected: `count: 50` (or fewer if Genius returns less), first item shows title, artist, rank, pageViews.

- [ ] **Step 4: Commit**

```bash
git add scraper/genius.js
git commit -m "feat: add Genius trending songs scraper"
```

---

## Task 6: Scorer module

**Files:**
- Create: `processor/scorer.js`

This is the largest task. Write it in two passes: (1) data structures + helpers, (2) main scoring logic.

- [ ] **Step 1: Create processor/scorer.js with constants and helpers**

```js
'use strict';

const { getDb } = require('../db/init');

// ── Tuning constants (adjust these after seeing real output) ─────────────────
const WEIGHTS = {
  chart:     0.30,
  editorial: 0.25,
  community: 0.25,
  velocity:  0.20,
};

const THRESHOLDS = {
  breaking_chart: 0.40,
  breaking_total: 0.55,
  rising_total:   0.35,
};

const EDITORIAL_TIERS = {
  1: ['Rolling Stone Music', 'Pitchfork', 'Billboard', 'The Guardian Music', 'Variety Music'],
  2: ['NME', 'Consequence of Sound', 'The FADER', 'Complex Music'],
  3: ['HotNewHipHop', 'Hypebeast Music', 'XXL Mag', 'Uproxx Music', 'Stereogum'],
};

const EDITORIAL_WEIGHTS = { 1: 0.35, 2: 0.20, 3: 0.10 };

// sourceName → prestige weight
const SOURCE_WEIGHT = {};
for (const [tier, names] of Object.entries(EDITORIAL_TIERS)) {
  for (const name of names) SOURCE_WEIGHT[name] = EDITORIAL_WEIGHTS[Number(tier)];
}

// ── Name normalization ───────────────────────────────────────────────────────
// Strips featured artists and normalizes for map keying.
function normalizeArtist(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+(feat\.?|ft\.?|featuring|with|×)\s+.*/i, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

// ── Extract artist name from editorial headline ───────────────────────────────
const MUSIC_VERBS = /\b(releases?|drops?|announces?|shares?|debuts?|performs?|covers?|remixes?|reveals?|signs?|joins?|leaves?|cancels?|postpones?|collaborates?|features?|previews?|interviews?|reviews?|tours?|albums?|singles?|videos?|eps?|mixtapes?)\b/i;

function extractArtistFromTitle(title) {
  const m = title.match(new RegExp(`^(.{3,40})\\s+${MUSIC_VERBS.source}`, 'i'));
  return m ? m[1].replace(/['"]/g, '').trim() : null;
}
```

- [ ] **Step 2: Add buildMentionMap function**

Continue in the same file (append after the helpers):

```js
// ── Build unified mention map ────────────────────────────────────────────────
function buildMentionMap(redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmBaselines) {
  const map = new Map(); // normalizedName → entity object

  function getOrCreate(rawName) {
    const key = normalizeArtist(rawName);
    if (!key || key.length < 2) return null;
    if (!map.has(key)) {
      map.set(key, {
        name:              rawName,
        normalizedName:    key,
        redditPosts:       [],
        editorialArticles: [],
        chartPositions:    {},
        geniusTrending:    null,
        lastfmListeners:   null,
      });
    }
    return map.get(key);
  }

  // Chart sources — explicit artist names
  for (const { artist, rank } of appleCharts) {
    const e = getOrCreate(artist);
    if (e) e.chartPositions.apple = rank;
  }

  for (const { name, rank, listeners } of lastfmArtists) {
    const e = getOrCreate(name);
    if (e) {
      e.chartPositions.lastfm = rank;
      const baseline = lastfmBaselines[normalizeArtist(name)];
      if (baseline) e.lastfmListeners = { current: listeners, baseline };
    }
  }

  for (const { artist, rank, pageViews } of geniusTrending) {
    const e = getOrCreate(artist);
    if (e) e.geniusTrending = { rank, pageViews };
  }

  // Match editorial articles against all known artists by title scan
  for (const { source, items } of webData) {
    for (const item of items) {
      const titleLower = (item.title || '').toLowerCase();

      // Try headline-pattern extraction first (discovers non-chart artists)
      const extracted = extractArtistFromTitle(item.title || '');
      if (extracted) {
        const key = normalizeArtist(extracted);
        // Require: 1–3 words, min 3 chars. Avoids generic phrases.
        if (key && extracted.trim().split(/\s+/).length <= 3) {
          const e = getOrCreate(extracted);
          if (e && !e.editorialArticles.some(a => a.title === item.title)) {
            e.editorialArticles.push({ source, title: item.title, published: item.published });
          }
        }
      }

      // Also scan all known chart artists in the title
      for (const [key, entity] of map.entries()) {
        if (key.length >= 3 && titleLower.includes(key) &&
            !entity.editorialArticles.some(a => a.title === item.title)) {
          entity.editorialArticles.push({ source, title: item.title, published: item.published });
        }
      }
    }
  }

  // Match Reddit posts against known artists in title
  for (const { source, posts } of redditData) {
    for (const post of posts) {
      const titleLower = (post.title || '').toLowerCase();
      for (const [key, entity] of map.entries()) {
        if (key.length >= 3 && titleLower.includes(key)) {
          entity.redditPosts.push({ source, ...post });
        }
      }
    }
  }

  return map;
}
```

- [ ] **Step 3: Add sub-score functions**

Append to `processor/scorer.js`:

```js
// ── Sub-score functions ──────────────────────────────────────────────────────

function calcChartScore(entity) {
  let score = 0;
  if (entity.chartPositions.apple != null) {
    score += 1 - (entity.chartPositions.apple - 1) / 99;
  }
  if (entity.chartPositions.lastfm != null) {
    const rank = entity.chartPositions.lastfm;
    score += 0.3 + 0.4 * (1 - (rank - 1) / 49);
  }
  return Math.min(1, score);
}

function calcEditorialScore(entity) {
  const seen = new Set();
  let score = 0;
  for (const article of entity.editorialArticles) {
    if (!seen.has(article.source) && SOURCE_WEIGHT[article.source] != null) {
      score += SOURCE_WEIGHT[article.source];
      seen.add(article.source);
    }
  }
  return Math.min(1, score);
}

function calcCommunityRaw(entity) {
  let raw = 0;
  const subreddits = new Set();
  for (const post of entity.redditPosts) {
    raw += Math.log(post.score + 1) * Math.log(post.comments + 1);
    subreddits.add(post.source);
  }
  const multiplier = subreddits.size >= 3 ? 1.5 : subreddits.size === 2 ? 1.2 : 1.0;
  return raw * multiplier;
}

function calcVelocityScore(entity) {
  const signals = [];

  if (entity.lastfmListeners?.baseline > 0) {
    const { current, baseline } = entity.lastfmListeners;
    signals.push(Math.max(0, Math.min(1, (current - baseline) / baseline)));
  }

  if (entity.geniusTrending?.rank >= 1 && entity.geniusTrending.rank <= 50) {
    signals.push(1 - (entity.geniusTrending.rank - 1) / 49);
  }

  const now = Date.now();
  const oneDay = 86_400_000;
  let bestRecency = 0;
  for (const article of entity.editorialArticles) {
    if (!article.published) continue;
    const ageDays = (now - new Date(article.published).getTime()) / oneDay;
    const recency = ageDays <= 0 ? 1.0 : ageDays <= 1 ? 0.7 : ageDays <= 2 ? 0.4 : 0.1;
    if (recency > bestRecency) bestRecency = recency;
  }
  if (bestRecency > 0) signals.push(bestRecency);

  return signals.length > 0
    ? signals.reduce((a, b) => a + b, 0) / signals.length
    : 0;
}
```

- [ ] **Step 4: Add baseline updater and main score() export**

Append to `processor/scorer.js`:

```js
// ── Persist Last.fm baselines ────────────────────────────────────────────────
function updateBaselines(lastfmArtists) {
  if (!lastfmArtists.length) return;
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO artist_baselines (artist_name, listeners, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(artist_name) DO UPDATE
      SET listeners  = excluded.listeners,
          updated_at = excluded.updated_at
  `);
  const run = db.transaction(() => {
    for (const { name, listeners } of lastfmArtists) {
      upsert.run(normalizeArtist(name), listeners);
    }
  });
  run();
  console.log(`[scorer] Updated ${lastfmArtists.length} Last.fm baselines`);
}

// ── Main entry point ─────────────────────────────────────────────────────────
function score(redditData, webData, appleCharts, lastfmArtists, geniusTrending) {
  const db = getDb();
  const rows = db.prepare('SELECT artist_name, listeners FROM artist_baselines').all();
  const lastfmBaselines = Object.fromEntries(rows.map(r => [r.artist_name, r.listeners]));

  const mentionMap = buildMentionMap(
    redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmBaselines
  );

  // Raw community scores — needed for normalization across all artists
  const rawCommunity = new Map();
  for (const [key, entity] of mentionMap.entries()) {
    rawCommunity.set(key, calcCommunityRaw(entity));
  }
  const maxCommunity = Math.max(...rawCommunity.values(), 1);

  const scored = [];
  for (const [key, entity] of mentionMap.entries()) {
    const chart     = calcChartScore(entity);
    const editorial = calcEditorialScore(entity);
    const community = rawCommunity.get(key) / maxCommunity;
    const velocity  = calcVelocityScore(entity);
    const total = chart * WEIGHTS.chart + editorial * WEIGHTS.editorial
      + community * WEIGHTS.community + velocity * WEIGHTS.velocity;

    scored.push({ entity, chart, editorial, community, velocity, total });
  }

  const breaking = scored
    .filter(s => s.chart >= THRESHOLDS.breaking_chart && s.total >= THRESHOLDS.breaking_total)
    .sort((a, b) => b.total - a.total);

  const rising = scored
    .filter(s => s.total >= THRESHOLDS.rising_total && s.chart < THRESHOLDS.breaking_chart)
    .sort((a, b) => b.total - a.total);

  console.log(`[scorer] ${breaking.length} breaking, ${rising.length} rising`);

  updateBaselines(lastfmArtists);

  return { breaking, rising };
}

module.exports = { score, normalizeArtist };
```

- [ ] **Step 5: Smoke test the scorer with dummy data**

```bash
node -e "
const { initDb } = require('./db/init');
initDb();
const { score } = require('./processor/scorer');

const redditData = [
  { source: 'r/hiphopheads', posts: [
    { title: 'Kendrick Lamar new album drops', score: 3200, comments: 450, url: 'x' },
    { title: 'Kendrick Lamar chart performance', score: 800, comments: 120, url: 'x' },
  ]},
];
const webData = [
  { source: 'Rolling Stone Music', items: [
    { title: 'Kendrick Lamar Announces World Tour', published: new Date().toISOString() },
  ]},
];
const appleCharts = [
  { rank: 3, title: 'Not Like Us', artist: 'Kendrick Lamar' },
];
const lastfmArtists = [
  { name: 'Kendrick Lamar', rank: 5, listeners: 2500000 },
];
const geniusTrending = [];

const result = score(redditData, webData, appleCharts, lastfmArtists, geniusTrending);
console.log('breaking:', result.breaking.map(s => ({ name: s.entity.name, total: s.total.toFixed(2), chart: s.chart.toFixed(2) })));
console.log('rising:', result.rising.map(s => ({ name: s.entity.name, total: s.total.toFixed(2) })));
"
```

Expected: Kendrick Lamar appears in `breaking` with chart ~0.98 and total well above 0.55.

- [ ] **Step 6: Commit**

```bash
git add processor/scorer.js
git commit -m "feat: add signal scorer with 4 sub-scores and tier assignment"
```

---

## Task 7: Wire digest pipeline

**Files:**
- Modify: `processor/digest.js`

- [ ] **Step 1: Add imports at top of digest.js**

After the existing requires, add:

```js
const { scrapeAppleCharts } = require('../scraper/appleCharts');
const { scrapeLastfm } = require('../scraper/lastfm');
const { scrapeGenius } = require('../scraper/genius');
const { score } = require('./scorer');
```

- [ ] **Step 2: Add chart source counts to the log line**

Replace the existing `console.log('[digest] ${redditSources.length} subreddits...')` line with:

```js
console.log(`[digest] ${redditSources.length} subreddits · ${webSources.length} web · ${tiktokSources.length} TikTok · ${playlistSources.length} Spotify playlists`);
```

(This line already exists; verify it's correct and move on.)

- [ ] **Step 3: Expand the parallel scrape to include new sources**

Replace the existing `Promise.all` block:

```js
  const [redditData, webData, tiktokData, playlistData] = await Promise.all([
    scrapeReddit(redditSources),
    scrapeWeb(webSources),
    scrapeTikTok(tiktokSources),
    scrapeSpotifyPlaylists(playlistSources),
  ]);
```

With:

```js
  const [redditData, webData, tiktokData, playlistData, appleCharts, lastfmData, geniusTrending] = await Promise.all([
    scrapeReddit(redditSources),
    scrapeWeb(webSources),
    scrapeTikTok(tiktokSources),
    scrapeSpotifyPlaylists(playlistSources),
    scrapeAppleCharts(),
    scrapeLastfm(),
    scrapeGenius(),
  ]);
```

- [ ] **Step 4: Add scoring phase between scraping and Claude**

After the `totalItems` check (the `if (totalItems === 0)` block) and before `console.log('[PHASE] Claude')`, insert:

```js
  console.log('[PHASE] Scoring');
  const scoredData = score(redditData, webData, appleCharts, lastfmData.artists, geniusTrending);
```

- [ ] **Step 5: Pass scoredData to processWithClaude**

Replace:

```js
  const result = await processWithClaude(date, redditData, webData, tiktokData, playlistData);
```

With:

```js
  const result = await processWithClaude(date, redditData, webData, tiktokData, playlistData, scoredData);
```

- [ ] **Step 6: Annotate Claude's artist output with scorer sub-scores**

After the `result.headlines = ...` block (headline resolution), add:

```js
  // Merge scorer sub-scores into Claude's artist output for UI badge rendering
  const scorerIndex = {};
  for (const s of [...scoredData.breaking, ...scoredData.rising]) {
    scorerIndex[s.entity.name.toLowerCase()] = s;
  }
  result.artists = (result.artists || []).map(a => {
    const s = scorerIndex[a.name?.toLowerCase()];
    if (!s) return a;
    return { ...a, chart_score: s.chart, editorial_score: s.editorial, community_score: s.community, velocity_score: s.velocity };
  });
```

- [ ] **Step 7: Commit**

```bash
git add processor/digest.js
git commit -m "feat: wire Apple Charts, Last.fm, Genius, and scorer into digest pipeline"
```

---

## Task 8: Update Claude integration

**Files:**
- Modify: `processor/claude.js`

- [ ] **Step 1: Update buildPrompt signature to accept scoredData**

Replace the function signature line:

```js
function buildPrompt(date, redditData, webData, tiktokData = [], playlistData = []) {
```

With:

```js
function buildPrompt(date, redditData, webData, tiktokData = [], playlistData = [], scoredData = null) {
```

- [ ] **Step 2: Insert pre-scored tiers block at the top of buildPrompt**

After `const lines = [\`TODAY'S DATE: ${date}\n\`];` and before the Reddit section, add:

```js
  if (scoredData && (scoredData.breaking.length > 0 || scoredData.rising.length > 0)) {
    lines.push('=== SIGNAL SCORES (pre-computed — preserve tiers, write narrative only) ===\n');

    function formatTier(label, artists) {
      if (!artists.length) return;
      lines.push(`=== ${label} ===\n`);
      for (const s of artists) {
        const { entity: e } = s;
        lines.push(`[total: ${s.total.toFixed(2)} | chart: ${s.chart.toFixed(2)} | editorial: ${s.editorial.toFixed(2)} | community: ${s.community.toFixed(2)} | velocity: ${s.velocity.toFixed(2)}]`);
        lines.push(e.name);

        const chartParts = [];
        if (e.chartPositions.apple)  chartParts.push(`Apple Music #${e.chartPositions.apple}`);
        if (e.chartPositions.lastfm) chartParts.push(`Last.fm Top Artists #${e.chartPositions.lastfm}`);
        if (chartParts.length) lines.push(`  Charts: ${chartParts.join(', ')}`);

        const editSources = [...new Set(e.editorialArticles.map(a => a.source))];
        if (editSources.length) lines.push(`  Editorial: ${editSources.join(', ')}`);

        if (e.redditPosts.length) {
          const top = [...e.redditPosts].sort((a, b) => b.score - a.score).slice(0, 3);
          lines.push(`  Community: ${top.map(p => `${p.source} ${p.score}↑ ${p.comments}💬`).join(', ')}`);
        }

        const velParts = [];
        if (e.lastfmListeners?.baseline > 0) {
          const pct = Math.round((e.lastfmListeners.current - e.lastfmListeners.baseline) / e.lastfmListeners.baseline * 100);
          velParts.push(`Last.fm ${pct >= 0 ? '+' : ''}${pct}% WoW`);
        }
        if (e.geniusTrending) velParts.push(`Genius trending #${e.geniusTrending.rank}`);
        if (velParts.length) lines.push(`  Velocity: ${velParts.join(', ')}`);

        lines.push('');
      }
    }

    formatTier('BREAKING (chart-confirmed)', scoredData.breaking);
    formatTier('RISING (emerging signal)',   scoredData.rising);
  }
```

- [ ] **Step 3: Update processWithClaude signature to accept scoredData**

Replace:

```js
async function processWithClaude(date, redditData, webData, tiktokData = [], playlistData = []) {
```

With:

```js
async function processWithClaude(date, redditData, webData, tiktokData = [], playlistData = [], scoredData = null) {
```

And update the `buildPrompt` call inside it:

```js
  const rawContent = buildPrompt(date, redditData, webData, tiktokData, playlistData, scoredData);
```

- [ ] **Step 4: Update the system prompt**

Replace the existing `const systemPrompt = \`...\`` with the following (the JSON schema section gains `tier` on artists and songs; the instructions gain tier preservation rules):

```js
  const systemPrompt = `You are a music industry analyst creating a daily briefing. Your job is to surface what is genuinely generating buzz today, stated plainly.

Rules:
- Focus on mainstream genres: hip-hop, pop, R&B, indie, electronic, rock, alt
- Ignore jazz, classical, ambient, experimental, niche genres
- When SIGNAL SCORES are provided: the tiers (BREAKING / RISING) are pre-computed from hard data — you MUST preserve them and MUST NOT reassign an artist to a different tier
- Write narrative that reflects the signal breakdown — cite the specific evidence (charts, publications, Reddit numbers, velocity %)
- Rising tier is the main story; breaking provides chart context
- Weight cross-source mentions heavily — an artist in 3+ sources = high signal
- Weight Reddit engagement: high upvotes + comments = real buzz
- Only include artists/songs with genuine multi-source signal OR exceptional single-source signal
- Be variable in count — surface exactly as many as the data actually supports, no filler
- Songs list: only songs you're confident exist as actual tracks (mentioned by title in sources)
- For each song, populate "sources" with the exact source names (e.g. "r/indieheads", "Pitchfork") that mentioned it
- For headline_indices: return the index numbers (e.g. [0, 3, 7]) of the 6-10 most newsworthy articles from the music news section

Writing style for the summary:
- Direct and factual — state what is happening, not how exciting it is
- No flowery language, superlatives, or hype ("electrifying", "dominating", "explosive", etc.)
- Cite specifics: names, numbers, release titles, platform data where available
- 5-8 bullet points, each covering a distinct story or trend

Respond with valid JSON only, no markdown, no explanation:
{
  "summary": "5-8 bullet points, each a single sentence. Start each with '• '. Direct, factual tone. One distinct story or data point per bullet — no hype.",
  "artists": [
    {"name": "string", "tier": "breaking|rising", "reason": "1-2 sentences: what specifically is driving attention, cite sources/numbers"}
  ],
  "songs": [
    {"title": "string", "artist": "string", "tier": "breaking|rising", "reason": "why this track is getting attention", "sources": ["source name 1", "source name 2"]}
  ],
  "headline_indices": [0, 4, 7]
}`;
```

- [ ] **Step 5: Verify the prompt builds without throwing**

```bash
node -e "
const { initDb } = require('./db/init');
initDb();
const { processWithClaude } = require('./processor/claude');
// Verify module loads and exports correctly
console.log('processWithClaude:', typeof processWithClaude);
"
```

Expected: `processWithClaude: function`

- [ ] **Step 6: Commit**

```bash
git add processor/claude.js
git commit -m "feat: update Claude prompt for pre-scored tiers and add tier to JSON schema"
```

---

## Task 9: UI — two-tier artist sections, signal badges, tier labels on songs

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add CSS for tier headers and signal badges**

Find this existing CSS block in `index.html`:

```css
    .artist-reason {
```

Immediately **before** it (before the `.artist-reason` rule), insert:

```css
    .tier-section { margin-bottom: var(--s4); }
    .tier-header {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--coral);
      display: flex;
      align-items: center;
      gap: var(--s2);
      margin-bottom: var(--s2);
    }
    .tier-header::after { content: ''; flex: 1; height: 1px; background: var(--dim); }
    .tier-header.tier-rising { color: var(--gold); }
    .signal-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .signal-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-chart     { background: rgba(231,111,81,0.15);  color: var(--coral); }
    .badge-editorial { background: rgba(244,162,97,0.15);  color: var(--peach); }
    .badge-community { background: rgba(42,157,143,0.15);  color: var(--teal);  }
    .badge-velocity  { background: rgba(233,196,106,0.15); color: var(--gold);  }
    .tier-label {
      font-family: var(--font-mono);
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 2px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      vertical-align: middle;
      margin-left: 6px;
    }
    .tier-label-breaking { background: rgba(231,111,81,0.15);  color: var(--coral); }
    .tier-label-rising   { background: rgba(233,196,106,0.15); color: var(--gold); }
```

- [ ] **Step 2: Replace the artistsHtml block with a tier-aware version**

Find this block in the JS section:

```js
  const artistsHtml = digest.artists.map((a, i) => `
    <div class="artist-card">
      <div class="artist-ordinal">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <div class="artist-name">${esc(a.name)}</div>
        <div class="artist-reason">${esc(a.reason)}</div>
      </div>
    </div>`).join('');
```

Replace it with:

```js
  function renderArtistSection(label, artists, tiercss) {
    if (!artists.length) return '';
    const cards = artists.map((a, i) => {
      const badges = [];
      if ((a.chart_score     ?? 0) > 0.3) badges.push('<span class="signal-badge badge-chart">chart</span>');
      if ((a.editorial_score ?? 0) > 0.3) badges.push('<span class="signal-badge badge-editorial">editorial</span>');
      if ((a.community_score ?? 0) > 0.3) badges.push('<span class="signal-badge badge-community">community</span>');
      if ((a.velocity_score  ?? 0) > 0.3) badges.push('<span class="signal-badge badge-velocity">velocity</span>');
      return `
      <div class="artist-card">
        <div class="artist-ordinal">${String(i + 1).padStart(2, '0')}</div>
        <div>
          <div class="artist-name">${esc(a.name)}</div>
          <div class="artist-reason">${esc(a.reason)}</div>
          ${badges.length ? `<div class="signal-badges">${badges.join('')}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="tier-section">
      <div class="tier-header ${tiercss}">◈ ${label}</div>
      <div class="artists-list">${cards}</div>
    </div>`;
  }

  const breakingArtists = (digest.artists || []).filter(a => a.tier === 'breaking');
  const risingArtists   = (digest.artists || []).filter(a => a.tier === 'rising');
  // Fallback: if no tiers (old digests), show all artists as one unlabelled section
  const hasThieredArtists = breakingArtists.length > 0 || risingArtists.length > 0;

  const artistsHtml = hasThieredArtists
    ? renderArtistSection('Breaking', breakingArtists, '') +
      renderArtistSection('Rising',   risingArtists,   'tier-rising')
    : `<div class="artists-list">${(digest.artists || []).map((a, i) => `
      <div class="artist-card">
        <div class="artist-ordinal">${String(i + 1).padStart(2, '0')}</div>
        <div>
          <div class="artist-name">${esc(a.name)}</div>
          <div class="artist-reason">${esc(a.reason)}</div>
        </div>
      </div>`).join('')}</div>`;
```

- [ ] **Step 3: Update songsHtml to show tier labels**

Find:

```js
    return `
    <tr>
      <td class="song-num">${String(i + 1).padStart(2, '0')}</td>
      <td class="song-title">${esc(s.title)}${sourceLine}</td>
      <td class="song-artist">${esc(s.artist)}</td>
    </tr>`;
```

Replace with:

```js
    const tierLabel = s.tier === 'breaking'
      ? '<span class="tier-label tier-label-breaking">breaking</span>'
      : s.tier === 'rising'
        ? '<span class="tier-label tier-label-rising">rising</span>'
        : '';
    return `
    <tr>
      <td class="song-num">${String(i + 1).padStart(2, '0')}${tierLabel}</td>
      <td class="song-title">${esc(s.title)}${sourceLine}</td>
      <td class="song-artist">${esc(s.artist)}</td>
    </tr>`;
```

- [ ] **Step 4: Update the digest section label**

Find:

```html
      ${digest.artists.length ? `
      <div class="section-label">Buzzing Artists</div>
      <div class="artists-list">${artistsHtml}</div>` : ''}
```

Replace with:

```html
      ${digest.artists.length ? `
      <div class="section-label">Artists</div>
      ${artistsHtml}` : ''}
```

(The tier headers inside `artistsHtml` now provide the labelling; the outer `artists-list` wrapper is no longer needed here.)

- [ ] **Step 5: Start the dev server and verify visually**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser.

Check with an existing digest:
- If it has no `tier` field on artists → all artists render in the plain fallback (backwards compatible)
- If you run a new digest → artists appear in ◈ BREAKING / ◈ RISING sections with signal badges

Click "Run Now", watch the log panel, then reload the digest page to see the two-tier layout.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: two-tier artist UI with signal badges and song tier labels"
```

---

## Task 10: End-to-end smoke test + API key reminder

- [ ] **Step 1: Confirm the pipeline runs without keys (graceful degradation)**

```bash
node -e "
const { initDb } = require('./db/init');
initDb();
const { runDigest } = require('./processor/digest');
// Don't actually run (no CLAUDE_API_KEY in test), just check it loads
console.log('runDigest:', typeof runDigest);
"
```

Expected: `runDigest: function` with no crash.

- [ ] **Step 2: Register API keys (when ready)**

1. Last.fm: https://www.last.fm/api/account/create — free, instant
2. Genius: https://genius.com/api-clients → create a client → copy the **Client Access Token**

Add to `.env`:
```
LASTFM_API_KEY=your_key_here
GENIUS_API_KEY=your_access_token_here
```

- [ ] **Step 3: Run a full digest and review scorer output in log panel**

Start the server (`npm run dev`), open `http://localhost:3000`, click **Run Now**.

In the log panel, verify you see:
- `[apple] Top 100: 100 tracks`
- `[lastfm] Top artists: 50, top tracks: 50`
- `[genius] Trending: 50 songs`
- `[scorer] X breaking, Y rising`
- `[scorer] Updated 50 Last.fm baselines`

Then check the digest page for ◈ BREAKING and ◈ RISING sections with signal badges.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: signal scoring complete — Apple Charts, Last.fm, Genius, scorer, two-tier UI"
```

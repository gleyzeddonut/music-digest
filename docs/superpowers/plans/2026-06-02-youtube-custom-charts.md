# YouTube Custom Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add their own YouTube charts (Top Songs / Top Artists / Top Music Videos, any country) while keeping the existing official "Trending Music Videos" list as its own option.

**Architecture:** A `youtube` source's URL drives the fetch. `charts.youtube.com/charts/{TopSongs|TopArtists|TopMusicVideos}/{cc}/weekly` URLs hit the keyless charts.youtube.com InnerTube endpoint directly from Node; `charts.youtube.com/charts/TrendingVideos/{cc}/RightNow` keeps using the official YouTube Data API via the existing `youtube-proxy`. `digest.js` iterates all enabled youtube sources and concatenates their rows into the `youtubeData` array the scorer already consumes.

**Tech Stack:** Node.js (CommonJS), `node:assert` tests run directly with `node`, Supabase Deno edge function, React (`src/screens.jsx`).

**Spec:** `docs/superpowers/specs/2026-06-02-youtube-custom-charts-design.md`

---

## File Structure

- **Modify** `scraper/youtube.js` — replace the single hardcoded `scrapeYoutube()` with a URL-driven module: `parseYoutubeChartUrl`, `parseChartRows`, `fetchChartsInnertube`, `fetchOfficialTrending`, `scrapeYoutubeSource`, `scrapeYoutubeSources`. One responsibility: turn youtube source rows into normalized chart rows.
- **Create** `test/fixtures/yt-tracks.json`, `test/fixtures/yt-artists.json`, `test/fixtures/yt-videos.json` — minimal InnerTube response fixtures mirroring the real nesting.
- **Create** `test/youtube-charts.test.js` — unit tests for the URL parser, row parser, and fetch dispatch.
- **Modify** `processor/digest.js` — iterate youtube sources, concatenate rows.
- **Modify** `supabase/functions/youtube-proxy/index.ts` — honor an optional `regionCode`.
- **Modify** `delivery/routes.js` — add a `youtube` branch to the source Test route.
- **Modify** `src/screens.jsx` — make `youtube` selectable in the add dropdown and deletable.
- **Modify** `processor/claude.js` — rename the prompt chart label "YouTube Trending" → "YouTube".

Normalized row shape returned by all fetch paths:
```js
{ rank: Number, title: String|null, artist: String, views: Number|null, signals: [String], source: 'youtube' }
```

---

## Task 1: URL parser

**Files:**
- Modify: `scraper/youtube.js`
- Test: `test/youtube-charts.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/youtube-charts.test.js`:

```js
const assert = require('assert');
const { parseYoutubeChartUrl } = require('../scraper/youtube');

// Custom charts → InnerTube descriptor
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TopSongs/us/weekly'),
  { mode: 'charts', chartType: 'TRACKS', country: 'us', label: 'YouTube Top Songs' });
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TopArtists/gb/weekly'),
  { mode: 'charts', chartType: 'ARTISTS', country: 'gb', label: 'YouTube Top Artists' });
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TopMusicVideos/jp/weekly'),
  { mode: 'charts', chartType: 'VIDEOS', country: 'jp', label: 'YouTube Top Videos' });

// Trending → official Data API descriptor
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TrendingVideos/us/RightNow'),
  { mode: 'official', country: 'us', label: 'YouTube Trending' });

// Case-insensitive chart name + period ignored for charts mode
assert.strictEqual(parseYoutubeChartUrl('https://charts.youtube.com/charts/topsongs/US/daily').chartType, 'TRACKS');

// Rejections
assert.throws(() => parseYoutubeChartUrl('https://charts.youtube.com/charts/TopSongs/global/weekly'), /country/i);
assert.throws(() => parseYoutubeChartUrl('https://charts.youtube.com/charts/TopGenres/us/weekly'), /Unsupported chart/i);
assert.throws(() => parseYoutubeChartUrl('https://example.com/charts/TopSongs/us/weekly'), /YouTube/i);
assert.throws(() => parseYoutubeChartUrl('not a url'), /Invalid URL/i);
console.log('✓ parseYoutubeChartUrl');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/youtube-charts.test.js`
Expected: FAIL — `parseYoutubeChartUrl is not a function`.

- [ ] **Step 3: Add the parser to `scraper/youtube.js` (keep the existing `scrapeYoutube`)**

Do NOT replace the file — `processor/digest.js` still imports the legacy
`scrapeYoutube` until Task 4. Insert the constants + parser immediately after the
`const auth = require('../auth-session');` line at the top:

```js
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // public charts.youtube.com web key

// charts.youtube.com path name → InnerTube chart_type + display label
const CHART_TYPES = {
  topsongs:       { chartType: 'TRACKS',  label: 'YouTube Top Songs' },
  topartists:     { chartType: 'ARTISTS', label: 'YouTube Top Artists' },
  topmusicvideos: { chartType: 'VIDEOS',  label: 'YouTube Top Videos' },
};

// Parse a charts.youtube.com URL into a fetch descriptor, or throw a
// user-facing error (surfaced via the source Test button).
function parseYoutubeChartUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { throw new Error('Invalid URL'); }
  if (u.hostname.toLowerCase() !== 'charts.youtube.com') {
    throw new Error('Not a YouTube charts URL (expected charts.youtube.com)');
  }
  const parts = u.pathname.split('/').filter(Boolean); // ['charts','TopSongs','us','weekly']
  if (parts[0] !== 'charts' || parts.length < 3) {
    throw new Error('Unrecognized YouTube charts URL');
  }
  const name = parts[1].toLowerCase();
  const country = (parts[2] || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) {
    throw new Error(`Unsupported country code "${parts[2]}" (use a 2-letter code like us, gb, jp)`);
  }
  if (name === 'trendingvideos') {
    return { mode: 'official', country, label: 'YouTube Trending' };
  }
  const t = CHART_TYPES[name];
  if (!t) {
    throw new Error(`Unsupported chart "${parts[1]}". Supported: TopSongs, TopArtists, TopMusicVideos, TrendingVideos`);
  }
  return { mode: 'charts', chartType: t.chartType, country, label: t.label };
}
```

Then change the existing `module.exports` line at the bottom of the file to also
export the parser (keep `scrapeYoutube`):

```js
module.exports = { scrapeYoutube, parseYoutubeChartUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/youtube-charts.test.js`
Expected: PASS — prints `✓ parseYoutubeChartUrl`.

- [ ] **Step 5: Commit**

```bash
git add scraper/youtube.js test/youtube-charts.test.js
git commit -m "feat(youtube): parse charts.youtube.com URLs into fetch descriptors"
```

---

## Task 2: Row parser + fixtures

**Files:**
- Create: `test/fixtures/yt-tracks.json`, `test/fixtures/yt-artists.json`, `test/fixtures/yt-videos.json`
- Modify: `scraper/youtube.js`
- Test: `test/youtube-charts.test.js`

- [ ] **Step 1: Create the fixtures**

`test/fixtures/yt-tracks.json`:
```json
{ "contents": { "sectionListRenderer": { "contents": [ { "musicAnalyticsSectionRenderer": { "content": { "trackTypes": [ { "trackViews": [
  { "name": "Choosin' Texas", "viewCount": "6525533", "artists": [ { "name": "Ella Langley" } ], "chartEntryMetadata": { "currentPosition": 1, "previousPosition": 2 } },
  { "name": "Second Song", "viewCount": "100", "artists": [ { "name": "Artist Two" }, { "name": "Guest" } ], "chartEntryMetadata": { "currentPosition": 2 } }
] } ] } } } ] } } }
```

`test/fixtures/yt-videos.json`:
```json
{ "contents": { "sectionListRenderer": { "contents": [ { "musicAnalyticsSectionRenderer": { "content": { "videos": [
  { "title": "Some Video", "viewCount": "999", "artists": [ { "name": "Drake" } ], "chartEntryMetadata": { "currentPosition": 1 } }
] } } } ] } } }
```

`test/fixtures/yt-artists.json`:
```json
{ "contents": { "sectionListRenderer": { "contents": [ { "musicAnalyticsSectionRenderer": { "content": { "artists": [
  { "name": "Drake", "viewCount": "1000000", "chartEntryMetadata": { "currentPosition": 1 } }
] } } } ] } } }
```

- [ ] **Step 2: Write the failing test**

Append to `test/youtube-charts.test.js`:

```js
const { parseChartRows } = require('../scraper/youtube');

const tracks = parseChartRows(require('./fixtures/yt-tracks.json'), 'TRACKS', 'YouTube Top Songs');
assert.strictEqual(tracks.length, 2);
assert.deepStrictEqual(tracks[0], { rank: 1, title: "Choosin' Texas", artist: 'Ella Langley', views: 6525533, signals: ['YouTube Top Songs'], source: 'youtube' });
assert.strictEqual(tracks[1].artist, 'Artist Two, Guest'); // multiple artists joined

const videos = parseChartRows(require('./fixtures/yt-videos.json'), 'VIDEOS', 'YouTube Top Videos');
assert.deepStrictEqual(videos[0], { rank: 1, title: 'Some Video', artist: 'Drake', views: 999, signals: ['YouTube Top Videos'], source: 'youtube' });

const artists = parseChartRows(require('./fixtures/yt-artists.json'), 'ARTISTS', 'YouTube Top Artists');
assert.deepStrictEqual(artists[0], { rank: 1, title: null, artist: 'Drake', views: 1000000, signals: ['YouTube Top Artists'], source: 'youtube' });

// Missing/garbage data → empty array, never throws
assert.deepStrictEqual(parseChartRows({}, 'TRACKS', 'x'), []);
console.log('✓ parseChartRows');
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/youtube-charts.test.js`
Expected: FAIL — `parseChartRows is not a function`.

- [ ] **Step 4: Add `parseChartRows` (and `findFirst`) to `scraper/youtube.js`**

Insert these functions above the `module.exports` line:

```js
// Depth-first search for the first occurrence of a key (the InnerTube response
// nests the chart section deep under contents.sectionListRenderer…).
function findFirst(obj, target) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    if (k === target) return obj[k];
    const found = findFirst(obj[k], target);
    if (found) return found;
  }
  return null;
}

// Map an InnerTube charts response to normalized rows for the given chartType.
// Returns [] on any structural surprise (never throws).
function parseChartRows(data, chartType, label) {
  const section = findFirst(data, 'musicAnalyticsSectionRenderer');
  const content = section && section.content;
  if (!content) return [];

  let rows;
  if (chartType === 'TRACKS') rows = content.trackTypes && content.trackTypes[0] && content.trackTypes[0].trackViews;
  else if (chartType === 'VIDEOS') rows = content.videos;
  else if (chartType === 'ARTISTS') rows = content.artists;
  rows = rows || [];

  return rows.map((r) => {
    const rank = r.chartEntryMetadata && r.chartEntryMetadata.currentPosition;
    const artist = chartType === 'ARTISTS'
      ? r.name
      : (r.artists || []).map((a) => a.name).filter(Boolean).join(', ');
    let title = null;
    if (chartType === 'TRACKS') title = r.name || null;
    else if (chartType === 'VIDEOS') title = r.title || null;
    const views = Number(r.viewCount);
    return { rank, title, artist, views: Number.isFinite(views) ? views : null, signals: [label], source: 'youtube' };
  }).filter((r) => r.rank != null && r.artist);
}
```

Update the exports line (keep `scrapeYoutube`):
```js
module.exports = { scrapeYoutube, parseYoutubeChartUrl, parseChartRows };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/youtube-charts.test.js`
Expected: PASS — prints `✓ parseChartRows`.

- [ ] **Step 6: Commit**

```bash
git add scraper/youtube.js test/youtube-charts.test.js test/fixtures/
git commit -m "feat(youtube): parse InnerTube chart rows for tracks/videos/artists"
```

---

## Task 3: Fetch paths + per-source dispatch

**Files:**
- Modify: `scraper/youtube.js`
- Test: `test/youtube-charts.test.js`

- [ ] **Step 1: Write the failing test (fetch stubbed)**

Append to `test/youtube-charts.test.js`:

```js
const { scrapeYoutubeSource } = require('../scraper/youtube');

(async () => {
  // Charts mode hits charts.youtube.com directly; stub global.fetch to return a fixture.
  const realFetch = global.fetch;
  let calledUrl = null;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return { ok: true, json: async () => require('./fixtures/yt-tracks.json') };
  };
  try {
    const rows = await scrapeYoutubeSource({ url: 'https://charts.youtube.com/charts/TopSongs/us/weekly', name: 'Top Songs US' });
    assert.ok(calledUrl.startsWith('https://charts.youtube.com/youtubei/v1/browse'), 'calls InnerTube endpoint');
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].artist, 'Ella Langley');
  } finally {
    global.fetch = realFetch;
  }

  // A bad URL throws (so the Test button can surface the message).
  await assert.rejects(scrapeYoutubeSource({ url: 'https://charts.youtube.com/charts/TopGenres/us/weekly', name: 'x' }), /Unsupported chart/i);
  console.log('✓ scrapeYoutubeSource (charts mode + error surfacing)');
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/youtube-charts.test.js`
Expected: FAIL — `scrapeYoutubeSource is not a function`.

- [ ] **Step 3: Add the fetch functions to `scraper/youtube.js`**

Insert above `module.exports`:

```js
// Fetch a charts.youtube.com chart via the keyless InnerTube browse endpoint.
async function fetchChartsInnertube({ chartType, country, label }) {
  const body = {
    context: { client: { clientName: 'WEB_MUSIC_ANALYTICS', clientVersion: '2.0', hl: 'en', gl: country.toUpperCase(), theme: 'MUSIC' }, capabilities: {}, request: { internalExperimentFlags: [] } },
    browseId: 'FEmusic_analytics_charts_home',
    query: `perspective=CHART_DETAILS&chart_params_country_code=${country}&chart_params_chart_type=${chartType}&chart_params_period_type=WEEKLY`,
  };
  const res = await fetch(`https://charts.youtube.com/youtubei/v1/browse?alt=json&key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://charts.youtube.com', Referer: 'https://charts.youtube.com/', 'User-Agent': BROWSER_UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) { console.warn(`[youtube] charts ${chartType}/${country} HTTP ${res.status}`); return []; }
  return parseChartRows(await res.json(), chartType, label);
}

// Fetch the official "Trending Music Videos" list via the Supabase proxy
// (needs the secret YouTube Data API key, so it stays server-side).
async function fetchOfficialTrending({ country, label }) {
  const res = await fetch(`${supabase.url}/functions/v1/youtube-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await auth.authHeaders()) },
    body: JSON.stringify({ regionCode: country.toUpperCase() }),
  });
  if (!res.ok) { console.warn(`[youtube] proxy error ${res.status}`); return []; }
  const data = await res.json();
  return (data && data.items ? data.items : []).map((item, i) => {
    const rawTitle = item.snippet.title;
    const channelName = item.snippet.channelTitle.replace(/\s*-\s*Topic$/i, '').trim();
    let artist, song;
    const dashIdx = rawTitle.indexOf(' - ');
    if (dashIdx !== -1) {
      artist = rawTitle.slice(0, dashIdx).trim();
      song = rawTitle.slice(dashIdx + 3).replace(/\s*[\[(][^\])]*(Official|Video|Audio|Lyrics|ft\.|feat\.)[^\])]*[\])]/gi, '').trim();
    } else {
      artist = channelName;
      song = rawTitle.replace(/\s*[\[(][^\])]*(Official|Video|Audio|Lyrics)[^\])]*[\])]/gi, '').trim();
    }
    return { rank: i + 1, title: song, artist, views: parseInt(item.statistics?.viewCount || 0, 10) || null, signals: [label], source: 'youtube' };
  });
}

// Resolve one youtube source row to normalized chart rows. Throws on an
// unparseable URL (callers decide whether to surface or swallow).
async function scrapeYoutubeSource(source) {
  const d = parseYoutubeChartUrl(source.url);
  return d.mode === 'charts' ? fetchChartsInnertube(d) : fetchOfficialTrending(d);
}

// Scrape every enabled youtube source, swallowing per-source failures, and
// concatenate into one flat array (the scorer dedupes by best rank per artist).
async function scrapeYoutubeSources(sources) {
  const results = await Promise.all((sources || []).map((s) =>
    scrapeYoutubeSource(s).catch((e) => { console.warn(`[youtube] ${s.name} failed: ${e.message}`); return []; })
  ));
  const rows = results.flat();
  console.log(`[youtube] ${(sources || []).length} charts → ${rows.length} rows`);
  return rows;
}
```

Update the exports line (legacy `scrapeYoutube` is removed in Task 4):
```js
module.exports = { scrapeYoutube, parseYoutubeChartUrl, parseChartRows, scrapeYoutubeSource, scrapeYoutubeSources };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/youtube-charts.test.js`
Expected: PASS — prints `✓ scrapeYoutubeSource (charts mode + error surfacing)`.

- [ ] **Step 5: Commit**

```bash
git add scraper/youtube.js test/youtube-charts.test.js
git commit -m "feat(youtube): dispatch sources to InnerTube charts or official proxy"
```

---

## Task 4: Wire into the digest pipeline

**Files:**
- Modify: `processor/digest.js` (import line ~12; youtube logic ~82, ~88-101)

- [ ] **Step 1: Update the import**

In `processor/digest.js`, change:
```js
const { scrapeYoutube }  = require('../scraper/youtube');
```
to:
```js
const { scrapeYoutubeSources } = require('../scraper/youtube');
```

- [ ] **Step 2: Replace the boolean with a source list**

Change (around line 82):
```js
  const youtubeEnabled   = sources.some(s => s.type === 'youtube');
```
to:
```js
  const youtubeSources   = sources.filter(s => s.type === 'youtube');
```

- [ ] **Step 3: Replace the scrape call**

In the `Promise.all([...])` (around line 100), change:
```js
    youtubeEnabled  ? scrapeYoutube().catch(e => { console.warn('[youtube] failed:', e.message); return []; }) : [],
```
to:
```js
    scrapeYoutubeSources(youtubeSources).catch(e => { console.warn('[youtube] failed:', e.message); return []; }),
```

- [ ] **Step 4: Remove the now-unused legacy `scrapeYoutube`**

Nothing imports `scrapeYoutube` anymore. In `scraper/youtube.js`, delete the
entire legacy `async function scrapeYoutube() { ... }` (the original ~50-line
function that called the proxy with an empty body) and drop it from the exports:

```js
module.exports = { parseYoutubeChartUrl, parseChartRows, scrapeYoutubeSource, scrapeYoutubeSources };
```

- [ ] **Step 5: Verify the modules still load and nothing references the old name**

Run: `node -e "require('./processor/digest.js'); require('./scraper/youtube.js'); console.log('OK')"`
Expected: prints `OK`.

Run: `grep -rn "scrapeYoutube\b" processor/ delivery/ scraper/ | grep -v scrapeYoutubeSource`
Expected: no output (no stale references to the removed `scrapeYoutube`).

Run: `node test/youtube-charts.test.js`
Expected: PASS (still green — the tests use the new exports).

- [ ] **Step 6: Commit**

```bash
git add processor/digest.js scraper/youtube.js
git commit -m "feat(youtube): iterate youtube sources in the digest pipeline"
```

---

## Task 5: Honor regionCode in the official proxy

**Files:**
- Modify: `supabase/functions/youtube-proxy/index.ts`

- [ ] **Step 1: Read an optional regionCode from the request body**

Replace the `try { ... }` block body in `supabase/functions/youtube-proxy/index.ts` so it reads and validates `regionCode`:

```ts
  try {
    const params = await req.json().catch(() => ({}))
    const rc = typeof params?.regionCode === 'string' && /^[A-Za-z]{2}$/.test(params.regionCode)
      ? params.regionCode.toUpperCase()
      : 'US'

    const key = Deno.env.get('YOUTUBE_API_KEY') ?? ''
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet,statistics')
    url.searchParams.set('chart', 'mostPopular')
    url.searchParams.set('videoCategoryId', '10')
    url.searchParams.set('regionCode', rc)
    url.searchParams.set('maxResults', '50')
    url.searchParams.set('key', key)

    const res = await fetch(url.toString())
    const data = await res.json()
    return json(data, res.status)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
```

- [ ] **Step 2: Type-check the function compiles**

Run: `deno check supabase/functions/youtube-proxy/index.ts`
Expected: no errors. (If `deno` is not installed, skip — the change is a minimal, isolated edit.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/youtube-proxy/index.ts
git commit -m "feat(youtube-proxy): honor optional regionCode (default US)"
```

> NOTE: This function must be redeployed for the regionCode to take effect:
> `supabase functions deploy youtube-proxy --project-ref ghncuclxvhzjbkwncewf`.
> Backward compatible — an empty body still returns US trending.

---

## Task 6: Add a youtube branch to the source Test route

**Files:**
- Modify: `delivery/routes.js` (the `POST /api/sources/:id/test` handler, ~line 548)

- [ ] **Step 1: Add the youtube branch**

In `delivery/routes.js`, in the test handler, insert a `youtube` branch before the `tokchart` branch (around line 548):

```js
    } else if (source.type === 'youtube') {
      const { scrapeYoutubeSource } = require('../scraper/youtube');
      items = await scrapeYoutubeSource(source);
    } else if (source.type === 'tokchart') {
```

(The surrounding `try/catch` already returns `{ ok: false, error: err.message }`, so a bad URL shows its parse error in the Test button.)

- [ ] **Step 2: Verify routes still load**

Run: `node -e "require('./delivery/routes.js'); console.log('routes.js loads OK')"`
Expected: prints `routes.js loads OK`.

- [ ] **Step 3: Commit**

```bash
git add delivery/routes.js
git commit -m "feat(youtube): test-scrape youtube sources via the Test button"
```

---

## Task 7: Make youtube addable and deletable in the UI

**Files:**
- Modify: `src/screens.jsx` (add-dropdown filter ~line 525; delete guard ~line 581)

- [ ] **Step 1: Allow selecting `youtube` in the add dropdown**

In `src/screens.jsx`, change (line ~525):
```jsx
          {Object.entries(TYPE_LABELS).filter(([v]) => v !== 'tokchart' && v !== 'youtube').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
```
to:
```jsx
          {Object.entries(TYPE_LABELS).filter(([v]) => v !== 'tokchart').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
```

- [ ] **Step 2: Allow deleting youtube sources**

In `src/screens.jsx`, change (line ~581):
```jsx
                  {s.type !== 'tokchart' && s.type !== 'youtube' && (
```
to:
```jsx
                  {s.type !== 'tokchart' && (
```

- [ ] **Step 3: Build the UI to verify no syntax errors**

Run: `npm run build:ui`
Expected: Vite build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens.jsx
git commit -m "feat(youtube): make youtube sources addable and deletable in Sources UI"
```

---

## Task 8: Rename the prompt chart label

**Files:**
- Modify: `processor/claude.js` (line ~23)

- [ ] **Step 1: Generalize the label**

In `processor/claude.js`, change (line ~23):
```js
    if (e.chartPositions.youtube)      chartParts.push(`YouTube Trending #${e.chartPositions.youtube}`);
```
to:
```js
    if (e.chartPositions.youtube)      chartParts.push(`YouTube #${e.chartPositions.youtube}`);
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "require('./processor/claude.js'); console.log('claude.js loads OK')"`
Expected: prints `claude.js loads OK`.

- [ ] **Step 3: Commit**

```bash
git add processor/claude.js
git commit -m "feat(youtube): generalize prompt chart label to 'YouTube #N'"
```

---

## Task 9: Full suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `for f in test/*.test.js; do echo "== $f =="; node "$f" || break; done`
Expected: every file prints its `✓` lines and no failures.

- [ ] **Step 2: Live smoke test of the InnerTube fetch (network)**

Run:
```bash
node -e "require('./scraper/youtube').scrapeYoutubeSource({ url:'https://charts.youtube.com/charts/TopSongs/us/weekly', name:'Top Songs US' }).then(r => console.log(r.length, 'rows; #1:', r[0]))"
```
Expected: ~100 rows, `#1` is a real `{ rank: 1, title, artist, views }`. (If YouTube ever changes the endpoint and this returns 0 rows, the digest still runs on its other sources — fix the parser/key and re-run.)

- [ ] **Step 3: Manual UI check (optional, requires running app)**

Start the app (`npm run dev` or the packaged app). In Sources: select **YouTube** in the add dropdown, paste `https://charts.youtube.com/charts/TopArtists/us/weekly`, give it a name, click **Add**, then **Test** — expect a non-zero count with sample artist rows. Confirm the new source has a working delete (trash) button.

- [ ] **Step 4: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "test(youtube): verify full suite and live chart fetch" || echo "nothing to commit"
```

---

## Notes for the implementer

- **CommonJS + plain `node` tests** — this repo has no test runner; tests are scripts run directly with `node`. Use `node:assert`. Match the existing style in `test/config-store.test.js`.
- **`AbortSignal.timeout`** is used elsewhere (`scraper/lastfm.js`, `scraper/reddit.js`) and is available on the project's Node version.
- **Default seeded source** (`TrendingVideos/us/RightNow`) is unchanged — it now routes through `fetchOfficialTrending` with `regionCode=US`, identical behavior to before. Deleting it via the UI is allowed; like other default sources it may be re-seeded by `db/init.js` on next boot (pre-existing behavior, out of scope).
- **`scoreSongs`** already accepts `youtubeData` and matches by title/artist — the normalized row shape is compatible; ARTISTS rows have `title: null` and simply won't match a song (artist-level signal only). No change needed there.
```

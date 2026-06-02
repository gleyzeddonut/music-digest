# YouTube Custom Charts — Design

**Date:** 2026-06-02
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `feat/youtube-custom-charts`

## Problem

The app ships a single YouTube source ("YouTube Trending") that users cannot
customize. The source row's URL is cosmetic — the scraper ignores it and always
fetches a hardcoded list (US trending music videos) from the official YouTube
Data API. The `youtube` type is also filtered out of the "add source" dropdown
(`src/screens.jsx`), so there is no way to add your own YouTube chart.

We want users to add their own YouTube charts (e.g. Top Songs UK, Top Artists
Japan), while keeping the existing real-time "Trending Music Videos" list
available as its own option.

## Scope

**In scope (this spec):** make `youtube` a normal, user-addable source type whose
**URL drives the fetch**, supporting both the official trending-videos list and
custom charts.youtube.com charts.

**Out of scope (separate later spec):** reorganizing the Sources screen into
"Built-in" vs "Custom" sections and making the always-on scrapers (Apple,
Last.fm, Genius, Shazam, Spotify Global, Hype Machine) individually toggleable.

## Key finding: two different YouTube data sources

| Source | Auth | What it returns | Knobs |
|---|---|---|---|
| Official **YouTube Data API** (`videos.list`, `chart=mostPopular`, category 10) | secret API key (server-side proxy) | Real-time trending **music videos**, one region | region only |
| **charts.youtube.com** InnerTube (`/youtubei/v1/browse`) | **none** (public web key) | Weekly **Top Songs / Top Artists / Top Music Videos** per country, with rank movement | chart type, country |

The InnerTube charts endpoint needs **no secret**, so the scraper — which runs on
the user's own machine — calls it **directly from Node**, with no Supabase proxy
and no edge-function deploy. The official Data API still needs its key, so that
path stays behind the existing `youtube-proxy`.

### Verified InnerTube call

```
POST https://charts.youtube.com/youtubei/v1/browse?alt=json&key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8
Content-Type: application/json
{
  "context": { "client": { "clientName": "WEB_MUSIC_ANALYTICS", "clientVersion": "2.0", "hl": "en", "gl": "<CC>", "theme": "MUSIC" }, "capabilities": {}, "request": { "internalExperimentFlags": [] } },
  "browseId": "FEmusic_analytics_charts_home",
  "query": "perspective=CHART_DETAILS&chart_params_country_code=<cc>&chart_params_chart_type=<TYPE>&chart_params_period_type=WEEKLY"
}
```

Confirmed working: `TRACKS`, `ARTISTS`, `VIDEOS` for `WEEKLY`, multiple countries
(us, gb). `DAILY` returns HTTP 400 for these charts (they are weekly).
`country_code=global` returns HTTP 400 (real global code unknown — unsupported
for v1).

### Response shapes (verified)

| chartType | List path | Title | Artist | Rank |
|---|---|---|---|---|
| `TRACKS` | `contents…musicAnalyticsSectionRenderer.content.trackTypes[0].trackViews` | `row.name` | `row.artists[].name` | `row.chartEntryMetadata.currentPosition` |
| `VIDEOS` | `…content.videos` | `row.title` | `row.artists[].name` | same |
| `ARTISTS` | `…content.artists` | — (none) | `row.name` | same |

Every row also carries `chartEntryMetadata.previousPosition`,
`.percentViewsChange`, and `.periodsOnChart` (future velocity signal — captured
but not consumed in v1).

## URL → behavior mapping

A `youtube` source's URL decides which path runs:

| URL pattern | Path | `chart_params_chart_type` |
|---|---|---|
| `charts.youtube.com/charts/TopSongs/{cc}/weekly` | InnerTube (direct) | `TRACKS` |
| `charts.youtube.com/charts/TopArtists/{cc}/weekly` | InnerTube (direct) | `ARTISTS` |
| `charts.youtube.com/charts/TopMusicVideos/{cc}/weekly` | InnerTube (direct) | `VIDEOS` |
| `charts.youtube.com/charts/TrendingVideos/{cc}/RightNow` | official Data API (`youtube-proxy`) | — (region = `cc`) |

`{cc}` is a 2-letter ISO country code. Period is normalized to `weekly` for the
three InnerTube charts (the only period they support); `TrendingVideos` keeps
`RightNow`. The default seeded source (`TrendingVideos/us/RightNow`) is unchanged
in behavior, so existing installs see no regression.

This is how "keep both as separate options" is realized without the Built-in/
Custom UI: the trending list is just the `TrendingVideos` URL (official API), and
the new charts are the other URLs (InnerTube).

## Components & changes

### `scraper/youtube.js`
- `parseYoutubeChartUrl(url)` → `{ mode: 'charts'|'official', chartType?, country }` or
  throws a descriptive error for unsupported URLs.
- `fetchChartsInnertube({ chartType, country })` → POSTs the InnerTube browse
  call directly; walks to the chart list by `chartType`; maps each row to the
  normalized shape below. Hardcodes the public web key; returns `[]` on any
  network/parse failure (matches other scrapers).
- `fetchOfficialTrending({ country })` → existing proxy call, now passing
  `regionCode`.
- Normalized row shape (all chart types):
  `{ rank, title, artist, views, signals: ['YouTube <Label>'], source: 'youtube' }`
  where ARTISTS rows have `title: null`.
- Export `scrapeYoutubeSource(source)` for one source; keep a thin
  `scrapeYoutube()` only if still referenced.

### `processor/digest.js`
- Replace `youtubeEnabled = sources.some(... 'youtube')` + single `scrapeYoutube()`
  with iteration over `sources.filter(s => s.type === 'youtube')`, fetching each
  in parallel.
- **Merge** all youtube rows into the single `youtubeData` array the scorer and
  `scoreSongs` already consume, **deduping by artist keeping the best (lowest)
  rank** — mirroring how shazam/spotify/tiktok ranks are merged in
  `buildMentionMap`.
- Logging line updated to report number of youtube charts + total rows.

### `youtube-proxy` (edge function)
- Accept optional `regionCode` in the request body (validated `^[A-Za-z]{2}$`,
  default `US`); use it instead of the hardcoded `US`. Backward compatible: an
  empty body still returns US trending. Requires a redeploy of this one function.

### `src/screens.jsx`
- Remove `youtube` from the add-dropdown exclusion filter (line ~525) so it is
  selectable. (`tokchart` stays excluded.) The `URL_LABEL.youtube = 'Chart URL'`
  and placeholder already exist.
- Allow editing/deleting user-added youtube sources (revisit the
  `s.type !== 'youtube'` guard at line ~581). The default seeded trending source
  may remain non-deletable; finalize in the implementation plan.

### `processor/scorer.js`
- Generalize the prompt chart label from `YouTube Trending #N` to `YouTube #N`
  (cosmetic — the chart is no longer always "trending").

## Validation & errors

- `parseYoutubeChartUrl` recognizes only the four supported patterns
  (case-insensitive chart name). Anything else → thrown error with the message
  surfaced via the existing `POST /api/sources/:id/test` endpoint.
- Country must match `^[a-z]{2}$` (lowercased).
- `global` and other unsupported charts → clear "unsupported chart" error.
- The `POST /api/sources` route already validates `type` ∈ allowed set; no schema
  change needed (URL is stored as-is in `sources.url`).

## Testing

- **`parseYoutubeChartUrl`** unit tests: each of the four supported patterns maps
  correctly; `global`, daily-only mismatches, non-chart URLs, and junk are
  rejected with errors.
- **Row parser** unit tests against **saved fixtures** (trimmed InnerTube JSON for
  TRACKS / ARTISTS / VIDEOS committed under `test/fixtures/`) asserting
  `{ rank, title, artist }` extraction — no network in CI.
- **Merge** unit test: two youtube sources with the same artist at different
  ranks collapse to the best rank in `youtubeData`.

## Risks

- **Unofficial endpoint.** charts.youtube.com InnerTube is not a supported API;
  the public key or `WEB_MUSIC_ANALYTICS` contract could change. Mitigation:
  fetch failures degrade to `[]` (the digest still runs on its other sources),
  and the parser is fixture-tested so breakage is caught quickly. The official
  trending path is unaffected.
- **IP blocking.** The call runs from the user's residential IP (their machine),
  not a datacenter, so the Reddit-style 403s should not apply. Verified working
  from a normal connection.

## Open items for the implementation plan

- Whether the default seeded trending source stays non-deletable (and how that is
  enforced before the Built-in/Custom reorg lands).
- Exact label text per chart type in `signals` (e.g. "YouTube Top Songs").
- How `scoreSongs` should treat ARTISTS-chart rows (no title) — likely ignored
  for song matching, artist-level only.

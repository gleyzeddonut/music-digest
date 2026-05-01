# Signal Scoring & Two-Tier Digest Design

**Date:** 2026-04-25  
**Status:** Approved  

## Problem

The current digest scrapes Reddit and RSS feeds, then sends raw text to Claude to decide who's buzzing. This produces unreliable results — a single enthusiastic Reddit post can surface an artist with no real traction. There's no distinction between an artist who charted vs. one a few people posted about.

## Goal

Surface artists and songs with **meaningful, multi-dimensional signal** by pre-scoring all mentions before Claude sees them. Produce two tiers in every digest:

- **Breaking** — chart-confirmed, cross-platform buzz
- **Rising** — emerging signal: credible press + community momentum + velocity, not yet charted

Emphasis is on the Rising tier — catching artists before they fully break.

## Architecture

```
scrape (existing + new) → scorer.js → Claude (pre-ranked) → digest (two-tier UI)
```

`scorer.js` is inserted between scraping and Claude. Claude's job shifts from deciding who's buzzing to writing narrative about what the data already shows.

## New Data Sources

### RSS (no key required)
Added to `db/init.js` DEFAULT_SOURCES:

| Name | URL | Signal type |
|---|---|---|
| The Guardian Music | `https://www.theguardian.com/music/rss` | Editorial (Tier 1) |
| Variety Music | `https://variety.com/v/music/feed/` | Editorial (Tier 1) |
| Complex Music | `https://www.complex.com/music/rss` | Editorial (Tier 2) |
| Uproxx Music | `https://uproxx.com/music/feed/` | Editorial (Tier 3) |

### New Scrapers (API keys required)

**`scraper/appleCharts.js`**  
Fetches Apple Music Top 100 via Apple's free public JSON feed. No key required.  
Endpoint: `https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json`  
Returns: `[{ rank, title, artist }]`

**`scraper/lastfm.js`**  
Calls Last.fm `chart.getTopArtists` and `chart.getTopTracks`.  
Key: `LASTFM_API_KEY` — register at `https://www.last.fm/api/account/create`  
Returns: `[{ name, listeners, rank }]` for artists and tracks.  
Also stores baseline listener counts in DB for week-over-week velocity.

**`scraper/genius.js`**  
Calls Genius API trending songs endpoint.  
Key: `GENIUS_API_KEY` — register at `https://genius.com/api-clients`  
Returns: `[{ title, artist, rank, pageViews }]`

## Scoring System (`processor/scorer.js`)

Takes all scraped data and returns `{ breaking: Artist[], rising: Artist[] }`.

### Entity Extraction

Before scoring, extract a unified list of artist/song mentions across all sources. Normalize names (case-insensitive, strip features). Build a mention map:

```js
{
  "Doechii": {
    redditPosts: [...],
    editorialArticles: [...],
    chartPositions: { apple: 14, lastfm: 8 },
    geniusTrending: { rank: 2, pageViews: 84000 },
    lastfmListeners: { current: 420000, baseline: 123000 }
  }
}
```

### Sub-scores

**`chart_score` (0–1)**
- Apple Music Top 100: `1 - (rank - 1) / 99` (rank 1 = 1.0, rank 100 ≈ 0.0)
- Last.fm Top Artists: presence = 0.3 base, position adds up to 0.4
- Capped at 1.0; presence on both charts adds scores together before cap

**`editorial_score` (0–1)**
Source prestige tiers:
- Tier 1 (0.35 each): Rolling Stone, Pitchfork, Billboard, The Guardian, Variety
- Tier 2 (0.20 each): NME, Consequence of Sound, The FADER, Complex
- Tier 3 (0.10 each): HotNewHipHop, Hypebeast, XXL, Uproxx, Stereogum
- Score = sum of weights for all sources that mention the artist, capped at 1.0

**`community_score` (0–1)**
- Per Reddit post: `log(upvotes + 1) × log(comments + 1)`, normalized across all posts
- Cross-subreddit multiplier: mentioned in 3+ subs = 1.5×, 2 subs = 1.2×, 1 sub = 1.0×
- Final score normalized to 0–1 across all artists in the run

**`velocity_score` (0–1)**
- Last.fm WoW growth: `(current - baseline) / baseline`, clamped to 0–1, scaled
- Genius trending rank: `1 - (rank - 1) / 49` for top 50 (not present = 0)
- Editorial recency: articles today = 1.0, yesterday = 0.7, 2 days ago = 0.4, older = 0.1
- velocity = average of available signals (missing signals excluded from average)

### Weighted Total
```
total = (chart × 0.30) + (editorial × 0.25) + (community × 0.25) + (velocity × 0.20)
```

### Tier Thresholds
- **breaking**: `chart_score >= 0.4` AND `total >= 0.55`
- **rising**: `total >= 0.35` AND `chart_score < 0.4`
- Below threshold: filtered out (noise floor)

### Tuning Constants
All weights and thresholds are named constants at the top of `scorer.js` for easy adjustment after seeing real output.

## Claude Integration (`processor/claude.js`)

### New Prompt Structure

`buildPrompt()` receives `scoredData` alongside raw data. Scored artists are listed first, structured:

```
=== BREAKING (chart-confirmed) ===

[total: 0.85 | chart: 0.90 | editorial: 0.80 | community: 0.60 | velocity: 0.75]
Kendrick Lamar
  Charts: Apple Music #3, Last.fm Top Artists #8
  Editorial: Rolling Stone, Pitchfork, Billboard
  Community: r/hiphopheads 312↑ 89💬, r/indieheads 198↑
  Velocity: Last.fm +18% WoW, Genius trending #4

=== RISING (emerging signal) ===

[total: 0.62 | chart: 0.10 | editorial: 0.70 | velocity: 0.95]
Doechii
  Editorial: The Guardian, Variety, Complex
  Community: r/popheads 189↑, r/rnb 94↑
  Velocity: Last.fm +340% WoW, Genius trending #2
```

Raw headlines still passed separately for the headlines section (unchanged).

### Updated System Prompt

Claude is told:
- Tiers are pre-computed from hard data — preserve them, do not reassign
- Write narrative that reflects the signal breakdown
- Rising tier is the main story; breaking provides chart context
- Same tone rules as before (direct, no hype)

### Updated JSON Response Schema
```json
{
  "summary": "...",
  "artists": [
    { "name": "string", "tier": "breaking|rising", "reason": "string" }
  ],
  "songs": [
    { "title": "string", "artist": "string", "tier": "breaking|rising",
      "reason": "string", "sources": ["string"] }
  ],
  "headline_indices": [0, 4, 7]
}
```

## Database Changes

New table `artist_baselines` for Last.fm velocity tracking:
```sql
CREATE TABLE IF NOT EXISTS artist_baselines (
  artist_name  TEXT PRIMARY KEY,
  listeners    INTEGER,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Updated at the end of each successful scorer run. Used to compute WoW growth on the next run.

## UI Changes (`public/index.html`)

### Two-tier artist section

Replace single "Buzzing Artists" section with two sections:

- **Breaking** — coral accent header (`◈ BREAKING`)
- **Rising** — gold accent header (`◈ RISING`)

Each artist card gets signal badges showing which dimensions contributed (only shown if sub-score > 0.3):

| Badge | Color | Meaning |
|---|---|---|
| `chart` | coral | On Apple Music / Last.fm charts |
| `editorial` | peach | Covered by credible press |
| `community` | teal | Reddit engagement |
| `velocity` | gold | Moving fast (WoW growth / Genius) |

### Songs table

Each song shows its tier (`BREAKING` / `RISING`) as a small label next to the track number. Source attribution (already implemented) unchanged.

## Config Changes

`.env` additions:
```
LASTFM_API_KEY=
GENIUS_API_KEY=
```

`config.js` additions:
```js
LASTFM_API_KEY: process.env.LASTFM_API_KEY || '',
GENIUS_API_KEY: process.env.GENIUS_API_KEY || '',
```

## File Summary

| File | Change |
|---|---|
| `db/init.js` | Add 4 RSS sources to DEFAULT_SOURCES; add `artist_baselines` table |
| `scraper/appleCharts.js` | New — Apple Music Top 100 fetcher |
| `scraper/lastfm.js` | New — Last.fm chart + baseline tracker |
| `scraper/genius.js` | New — Genius trending fetcher |
| `processor/scorer.js` | New — entity extraction + 4 sub-scores + tier assignment |
| `processor/digest.js` | Call scorer after scraping, pass scored data to Claude |
| `processor/claude.js` | New prompt structure, tier in JSON schema |
| `public/index.html` | Two-tier artist sections, signal badges, tier labels on songs |
| `config.js` | LASTFM_API_KEY, GENIUS_API_KEY |
| `.env.example` | Document new keys |

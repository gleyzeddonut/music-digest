# Artist of the Day — Real Daily Feature

**Date:** 2026-06-11
**Status:** Approved by Dan (design review in session)

## Problem

The Today screen's hero presents `artists[0]` as a featured artist with a
"Read feature →" button, but the button opens `ArtistScreen`, whose main
content — "Why they're featured" — is the same 1–2 sentence `reason` the hero
subtitle already shows. The layout was designed for an editorial artist
profile, but the pipeline never generates one:

- `hero.sub` is `long_summary || reason`, but `long_summary` and `headline`
  do not exist in the `submit_digest` schema — they are phantom fields.
- `mention_count` and `streams` are read by the UI (hero stats row, brief
  pull-quotes) but never produced by the pipeline, so those elements never
  render.
- `ArtistScreen`'s songs section filters by exact artist-name match and is
  often empty for a news-driven hero artist.

## Decision

Develop the hero into a real daily feature (vs. replacing or demoting it).
The full written feature is generated for the **hero artist only**
(`artists[0]`); other artists keep their current detail screen plus free
upgrades derived from existing data.

Generation happens **inside the existing digest Claude call** (Approach A),
not a second dedicated call, because:

1. The digest call already pays for the full scraped corpus as input; the
   feature costs only ~500–800 extra output tokens.
2. The same call that picks the #1 artist writes the article — ranking and
   narrative cannot drift apart.
3. No new network call, latency, or mid-pipeline failure mode; forced
   tool-use already guarantees schema-shaped output.
4. Reuses proven machinery (headline-index resolution, scorer merge) instead
   of duplicating it.

A future "generate feature on demand for any artist" capability is not
precluded; the feature prompt/schema would transfer to a dedicated call.

## Feature contents (user-selected)

1. Written mini-article (3–5 paragraphs)
2. Linked source headlines ("Coverage")
3. Signal breakdown (real numbers)
4. Listen section (tracks in this issue + Spotify artist link)

## Design

### 1 · Digest call — `processor/claude.js`

Extend the `submit_digest` tool schema with a required `feature` object:

| Field | Type | Description |
|---|---|---|
| `artist` | string | Must match the first artist listed in `artists` |
| `title` | string | Editorial headline for the feature — the "why today" in one line, not the artist's name |
| `body` | string | 3–5 short paragraphs separated by `\n\n`; same writing rules as the summary (factual, no hype, cite sources/numbers) |
| `related_headline_indices` | integer[] | 2–5 index numbers into the music-news list (same index mechanism as `headline_indices`) |

The system prompt gains a short section describing the feature and pinning it
to the first-listed artist. `feature` is in the schema's `required` list;
prompt guidance covers the no-artists edge case (empty digests don't reach
this path in practice — the artists array drives the hero).

### 2 · Pipeline merge — `processor/digest.js`

After the existing headline resolution step:

1. Resolve `feature.related_headline_indices` against the same article index
   list → `coverage: [{ source, title, url, published }]`. Out-of-range
   indices are silently dropped.
2. Look up the feature artist in the existing `scorerIndex` (normalized
   name). From the scorer entity, build
   `evidence: { sources: string[], reddit: { posts, topUps, topComments }, mention_count }`
   — `sources` = unique editorial source names; `mention_count` = unique
   source count across editorial + Reddit + charts.
3. Attach to the matching artist object:
   `artist.feature = { title, body, coverage, evidence }` and set
   `artist.mention_count` (fixes the phantom field the brief's "Strongest
   signal" pull-quote reads).
4. Artist matching rule: attach to whichever artist in `result.artists`
   matches `feature.artist` by `normalizeArtist`; if none match, attach to
   `artists[0]` with a `console.warn`.

Storage: inside the existing `digests.artists` JSON column. **No DB
migration.**

### 3 · Adapter — `src/main.jsx`

- `hero.sub` = `feature.title` when present (the hero teases the article),
  falling back to `reason` for old digests.
- Replace the dead `streams`-based stats row with real evidence when
  available, e.g. "6 sources · top Reddit post 4.2k↑" from
  `feature.evidence`. When absent, the stats row hides (as it effectively
  does today).

### 4 · Feature screen — `src/screens.jsx` (`ArtistScreen`)

Branch on `artist.feature`:

**With feature:** current detail-hero stays, then:
1. Feature `title` (serif, editorial)
2. `body` paragraphs
3. **Coverage** — linked headlines, reusing the digest headline row styling
4. **The signal** — quiet stat block: the four persisted sub-scores
   (chart / editorial / community / velocity), source names, Reddit numbers
5. **Listen** — existing tracks-in-this-issue section + "Open artist on
   Spotify" link (artist search URL; no new API dependency)

**Without feature** (old digests, non-hero artists): current layout plus the
free upgrades — signal stat block when sub-scores exist, Spotify artist link.
Empty sections hide themselves.

Hero button label: "Read feature →" only when `artists[0].feature` exists;
otherwise "View artist →".

### 5 · Edge cases

- Empty `coverage` → section hidden.
- No songs by the artist → tracks hidden, Spotify link stays.
- Old digests (no `feature`) render exactly as today plus free upgrades.
- Feature-artist name mismatch → normalized-name match, fallback `artists[0]`.

## Out of scope

- Today screen layout beyond the hero subtitle/stats (hero remains the focal
  point; everything else is untouched).
- Features for non-hero artists (on-demand generation is a possible future).
- Any DB schema change.

## Verification

- Unit test for the resolution/attach step (index resolution, evidence
  assembly, name-mismatch fallback) following existing `test/` conventions.
- Fixture check: adapter + `ArtistScreen` fall back cleanly on a pre-feature
  digest.
- CHANGELOG entry per project convention.
- **No local production builds** (hook-enforced after the 2026-06-11 OOM
  crash) — Dan builds and verifies visually.

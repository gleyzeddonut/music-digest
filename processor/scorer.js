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
  breaking_total: 0.45,  // lowered: allows chart-dominant acts with limited press
  rising_total:   0.28,  // lowered: catches chart-only emerging acts
};

// Fixed ceiling for community normalization — prevents viral outliers from
// collapsing all other artists' relative community scores.
// ~3 cross-subreddit posts each with ~3k upvotes + 500 comments ≈ 200
const COMMUNITY_CEILING = 200;

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
function normalizeArtist(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+(feat\.?|ft\.?|featuring|with|×)\s+.*/i, '')
    .replace(/\$/g, 's')       // A$AP → asap, $uicideboy$ → suicideboys
    .replace(/[^\w\s]/g, ' ')  // collapse remaining special chars to space (not nothing)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTrack(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\s*[\(\[](?:feat\.?|ft\.?|featuring|prod\.?|with|remix|edit|version|remaster)[^\)\]]*[\)\]]/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenize free text (post/headline titles) for whole-token artist matching.
// Mirrors normalizeArtist's punctuation handling but does NOT strip feat/with
// clauses, so collaborators named in a title remain matchable.
function matchTokens(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

// True only when an artist key's tokens appear as a contiguous run of COMPLETE
// tokens in the text. Replaces raw substring matching, which let a degenerate
// key like "t i" (from "T.I.") match inside unrelated words ("got it", "that
// intro") and let "drake" match "drakeo". Accepts either raw text or a
// pre-tokenized array (callers tokenize once per title for efficiency).
function titleMentionsArtist(text, key) {
  const needle = key.split(' ').filter(Boolean);
  if (!needle.length) return false;
  const hay = Array.isArray(text) ? text : matchTokens(text);
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

// Normalized tokens that look like proper nouns in the ORIGINAL text — i.e.
// not written as a plain all-lowercase word. "Future" and "MGK" qualify;
// "future" mid-sentence does not. Used to stop single-token artists whose name
// is a common English word (Future, Muse, War…) from matching every headline
// that merely contains that word.
function properNounTokens(text) {
  const out = new Set();
  for (const raw of String(text || '').split(/\s+/)) {
    const core = raw.replace(/^[^\w$]+|[^\w$]+$/g, '');
    if (!core || /^[a-z0-9_]+$/.test(core)) continue; // plain lowercase word → skip
    const norm = core.toLowerCase().replace(/\$/g, 's').replace(/[^\w]/g, '');
    if (norm) out.add(norm);
  }
  return out;
}

// Single-token keys need the proper-noun check in publication headlines —
// unless the artist's canonical name is itself lowercase-stylized ("glaive"),
// where a lowercase appearance is the expected form. Multi-token keys are
// already unambiguous enough. Reddit titles are exempt: casual all-lowercase
// writing is normal there and the guard would cost more real signal than the
// noise it removes.
function passesProperNounGuard(key, entity, properToks) {
  if (key.includes(' ')) return true;
  const canonical = (entity.name || '').trim();
  const firstAlpha = canonical.match(/[a-zA-Z]/);
  if (firstAlpha && firstAlpha[0] === firstAlpha[0].toLowerCase()) return true;
  return properToks.has(key);
}

// ── Extract artist name from editorial headline ───────────────────────────────
const MUSIC_VERBS = /\b(releases?|drops?|announces?|shares?|debuts?|performs?|covers?|remixes?|reveals?|signs?|joins?|leaves?|cancels?|postpones?|collaborates?|features?|previews?|interviews?|reviews?|tours?|albums?|singles?|videos?|eps?|mixtapes?)\b/i;

function extractArtistFromTitle(title) {
  const m = title.match(new RegExp(`^(.{3,40})\\s+${MUSIC_VERBS.source}`, 'i'));
  return m ? m[1].replace(/['"]/g, '').trim() : null;
}

// ── Build unified mention map ────────────────────────────────────────────────
function buildMentionMap(redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmBaselines, lastfmTracks, shazamChart, spotifyChart, hypemData, tiktokChart, youtubeData = []) {
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
        hypemSignal:       null,
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

  // Last.fm top tracks — add track chart position to the artist's entity
  for (const { title, artist, rank } of (lastfmTracks || [])) {
    const e = getOrCreate(artist);
    if (e) {
      const prev = e.chartPositions.lastfm_track;
      if (prev == null || rank < prev) e.chartPositions.lastfm_track = rank;
    }
  }

  for (const { artist, rank, pageViews } of geniusTrending) {
    const e = getOrCreate(artist);
    if (e) e.geniusTrending = { rank, pageViews };
  }

  // Shazam Viral Chart — strongest leading indicator (growth rate, not volume)
  for (const { artist, rank } of (shazamChart || [])) {
    const e = getOrCreate(artist);
    if (e) {
      const prev = e.chartPositions.shazam;
      if (prev == null || rank < prev) e.chartPositions.shazam = rank;
    }
  }

  // Spotify Global daily — broad mainstream signal
  for (const { artist, rank } of (spotifyChart || [])) {
    const e = getOrCreate(artist);
    if (e) {
      const prev = e.chartPositions.spotify;
      if (prev == null || rank < prev) e.chartPositions.spotify = rank;
    }
  }

  // Hype Machine — indie blog editorial signal (pre-chart discovery)
  for (const { artist, blogs, loved } of (hypemData || [])) {
    const e = getOrCreate(artist);
    if (e) e.hypemSignal = { blogs, loved };
  }

  // TikTok US chart — strong virality/discovery signal
  for (const { artist, rank } of (tiktokChart || [])) {
    const e = getOrCreate(artist);
    if (e) {
      const prev = e.chartPositions.tiktok;
      if (prev == null || rank < prev) e.chartPositions.tiktok = rank;
    }
  }

  // YouTube Trending Music — mainstream video consumption signal
  for (const { artist, rank } of (youtubeData || [])) {
    const e = getOrCreate(artist);
    if (e) {
      const prev = e.chartPositions.youtube;
      if (prev == null || rank < prev) e.chartPositions.youtube = rank;
    }
  }

  // Match editorial articles against all known artists by title scan
  for (const { source, items } of webData) {
    for (const item of items) {
      const titleToks = matchTokens(item.title || '');
      const properToks = properNounTokens(item.title || '');

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

      // Also scan all known chart artists in the title (whole-token match)
      for (const [key, entity] of map.entries()) {
        if (key.length >= 3 && titleMentionsArtist(titleToks, key) &&
            passesProperNounGuard(key, entity, properToks) &&
            !entity.editorialArticles.some(a => a.title === item.title)) {
          entity.editorialArticles.push({ source, title: item.title, published: item.published });
        }
      }
    }
  }

  // Match Reddit posts against known artists in title
  for (const { source, posts } of redditData) {
    for (const post of posts) {
      const titleToks = matchTokens(post.title || '');
      for (const [key, entity] of map.entries()) {
        if (key.length >= 3 && titleMentionsArtist(titleToks, key)) {
          entity.redditPosts.push({ source, ...post });
        }
      }
    }
  }

  return map;
}

// ── Sub-score functions ──────────────────────────────────────────────────────

// Rank → 0..1 within the top `window` positions, 0 beyond. Scrapers return
// however many rows the source page lists (kworb Shazam = 200, TikTok = 100),
// so without the clamp a deep rank goes NEGATIVE and erases real signal from
// other charts.
function rankScore(rank, window) {
  return Math.max(0, 1 - (rank - 1) / (window - 1));
}

function calcChartScore(entity) {
  const pos = entity.chartPositions;
  let score = 0;
  // Shazam Viral: highest weight — measures growth rate, not volume
  if (pos.shazam       != null) score += 0.40 * rankScore(pos.shazam, 50);
  // TikTok US: strong virality/discovery signal
  if (pos.tiktok       != null) score += 0.20 * rankScore(pos.tiktok, 50);
  if (pos.apple        != null) score += 0.20 * rankScore(pos.apple, 100);
  if (pos.lastfm       != null) score += 0.20 * rankScore(pos.lastfm, 50);
  if (pos.lastfm_track != null) score += 0.15 * rankScore(pos.lastfm_track, 50);
  if (pos.spotify      != null) score += 0.10 * rankScore(pos.spotify, 200);
  // YouTube Trending Music — mainstream video consumption signal
  if (pos.youtube      != null) score += 0.12 * rankScore(pos.youtube, 50);
  return Math.min(1, score);
}

// Articles decay with age so week-old RSS backlog doesn't read as today's buzz.
// Unknown publish date gets a middling factor rather than full credit.
function editorialAgeFactor(published, now = Date.now()) {
  if (!published) return 0.7;
  const ageDays = (now - new Date(published).getTime()) / 86_400_000;
  if (Number.isNaN(ageDays)) return 0.7;
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 2) return 0.85;
  if (ageDays <= 4) return 0.6;
  if (ageDays <= 7) return 0.35;
  return 0.15;
}

// Sources outside the prestige tiers (user-added RSS feeds) count at tier-3
// weight instead of zero — otherwise custom sources contribute no editorial
// signal at all.
const DEFAULT_SOURCE_WEIGHT = EDITORIAL_WEIGHTS[3];

function calcEditorialScore(entity, now = Date.now()) {
  // Best (weight × recency) article per source; one credit per source so a
  // single feed spamming an artist can't stack.
  const bestPerSource = new Map();
  for (const article of entity.editorialArticles) {
    const weight = SOURCE_WEIGHT[article.source] ?? DEFAULT_SOURCE_WEIGHT;
    const value = weight * editorialAgeFactor(article.published, now);
    if (value > (bestPerSource.get(article.source) || 0)) {
      bestPerSource.set(article.source, value);
    }
  }
  let score = 0;
  for (const value of bestPerSource.values()) score += value;
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

  if (entity.geniusTrending?.rank != null && entity.geniusTrending.rank <= 50) {
    signals.push(1 - (entity.geniusTrending.rank - 1) / 49);
  }

  // Hype Machine blog coverage — pre-chart editorial signal
  if (entity.hypemSignal) {
    const blogScore = Math.min(1, (entity.hypemSignal.blogs - 1) / 9);
    const lovedScore = Math.min(1, entity.hypemSignal.loved / 50);
    signals.push(Math.max(blogScore, lovedScore));
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

  // Strongest signal + a small bonus per corroborating signal. A plain average
  // punished breadth: one 1.0 signal beat 1.0 + 0.5, which is backwards.
  if (signals.length === 0) return 0;
  const best = Math.max(...signals);
  const corroboration = Math.min(0.2, (signals.length - 1) * 0.1);
  return Math.min(1, best + corroboration);
}

// ── Persist Last.fm baselines ────────────────────────────────────────────────
// A baseline is only refreshed once it's ≥7 days old, so "current vs baseline"
// is a real week-over-week delta. The old behavior overwrote baselines on every
// run, which made the comparison day-over-day at best — and ~zero when several
// personas ran the same day — killing the velocity signal entirely.
function updateBaselines(lastfmArtists) {
  if (!lastfmArtists.length) return;
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO artist_baselines (artist_name, listeners, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(artist_name) DO UPDATE
      SET listeners  = excluded.listeners,
          updated_at = excluded.updated_at
      WHERE artist_baselines.updated_at <= datetime('now', '-7 days')
  `);
  let refreshed = 0;
  const run = db.transaction(() => {
    for (const { name, listeners } of lastfmArtists) {
      const info = upsert.run(normalizeArtist(name), listeners);
      refreshed += info.changes;
    }
  });
  run();
  console.log(`[scorer] Baselines: ${refreshed}/${lastfmArtists.length} refreshed (≥7 days old or new)`);
}

// ── Main entry point ─────────────────────────────────────────────────────────
function score(redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmTracks = [], shazamChart = [], spotifyChart = [], hypemData = [], tiktokChart = [], youtubeData = []) {
  const db = getDb();
  const rows = db.prepare('SELECT artist_name, listeners FROM artist_baselines').all();
  const lastfmBaselines = Object.fromEntries(rows.map(r => [r.artist_name, r.listeners]));

  const mentionMap = buildMentionMap(
    redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmBaselines, lastfmTracks,
    shazamChart, spotifyChart, hypemData, tiktokChart, youtubeData
  );

  const scored = [];
  for (const [key, entity] of mentionMap.entries()) {
    const chart     = calcChartScore(entity);
    const editorial = calcEditorialScore(entity);
    // Fixed ceiling normalization — prevents one viral outlier from collapsing
    // all other artists' community scores on a given day.
    const community = Math.min(calcCommunityRaw(entity) / COMMUNITY_CEILING, 1);
    const velocity  = calcVelocityScore(entity);
    const total = chart * WEIGHTS.chart + editorial * WEIGHTS.editorial
      + community * WEIGHTS.community + velocity * WEIGHTS.velocity;

    scored.push({ entity, chart, editorial, community, velocity, total });
  }

  const breaking = scored
    .filter(s => s.chart >= THRESHOLDS.breaking_chart && s.total >= THRESHOLDS.breaking_total)
    .sort((a, b) => b.total - a.total);

  // Exclude breaking artists from rising so chart-dominant acts with limited press
  // still appear rather than falling through both filters.
  const breakingKeys = new Set(breaking.map(s => s.entity.normalizedName));
  const rising = scored
    .filter(s => !breakingKeys.has(s.entity.normalizedName) && s.total >= THRESHOLDS.rising_total)
    .sort((a, b) => b.total - a.total);

  console.log(`[scorer] ${breaking.length} breaking, ${rising.length} rising`);

  updateBaselines(lastfmArtists);

  return { breaking, rising };
}

module.exports = {
  score, normalizeArtist, normalizeTrack, matchTokens, titleMentionsArtist,
  // exported for tests
  rankScore, calcChartScore, calcEditorialScore, calcVelocityScore,
  editorialAgeFactor, properNounTokens, passesProperNounGuard,
};

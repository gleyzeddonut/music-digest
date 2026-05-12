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

// ── Extract artist name from editorial headline ───────────────────────────────
const MUSIC_VERBS = /\b(releases?|drops?|announces?|shares?|debuts?|performs?|covers?|remixes?|reveals?|signs?|joins?|leaves?|cancels?|postpones?|collaborates?|features?|previews?|interviews?|reviews?|tours?|albums?|singles?|videos?|eps?|mixtapes?)\b/i;

function extractArtistFromTitle(title) {
  const m = title.match(new RegExp(`^(.{3,40})\\s+${MUSIC_VERBS.source}`, 'i'));
  return m ? m[1].replace(/['"]/g, '').trim() : null;
}

// ── Build unified mention map ────────────────────────────────────────────────
function buildMentionMap(redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmBaselines, lastfmTracks, shazamChart, spotifyChart, hypemData, tiktokChart) {
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

// ── Sub-score functions ──────────────────────────────────────────────────────

function calcChartScore(entity) {
  let score = 0;
  // Shazam Viral: highest weight — measures growth rate, not volume
  if (entity.chartPositions.shazam != null) {
    score += 0.40 * (1 - (entity.chartPositions.shazam - 1) / 49);
  }
  // TikTok US: strong virality/discovery signal
  if (entity.chartPositions.tiktok != null) {
    score += 0.20 * (1 - (entity.chartPositions.tiktok - 1) / 49);
  }
  if (entity.chartPositions.apple != null) {
    score += 0.20 * (1 - (entity.chartPositions.apple - 1) / 99);
  }
  // Removed additive constants — any rank now scores proportionally (0 at bottom)
  if (entity.chartPositions.lastfm != null) {
    score += 0.20 * (1 - (entity.chartPositions.lastfm - 1) / 49);
  }
  if (entity.chartPositions.lastfm_track != null) {
    score += 0.15 * (1 - (entity.chartPositions.lastfm_track - 1) / 49);
  }
  if (entity.chartPositions.spotify != null) {
    score += 0.10 * (1 - (entity.chartPositions.spotify - 1) / 199);
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

  return signals.length > 0
    ? signals.reduce((a, b) => a + b, 0) / signals.length
    : 0;
}

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
function score(redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmTracks = [], shazamChart = [], spotifyChart = [], hypemData = [], tiktokChart = []) {
  const db = getDb();
  const rows = db.prepare('SELECT artist_name, listeners FROM artist_baselines').all();
  const lastfmBaselines = Object.fromEntries(rows.map(r => [r.artist_name, r.listeners]));

  const mentionMap = buildMentionMap(
    redditData, webData, appleCharts, lastfmArtists, geniusTrending, lastfmBaselines, lastfmTracks,
    shazamChart, spotifyChart, hypemData, tiktokChart
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

module.exports = { score, normalizeArtist, normalizeTrack };

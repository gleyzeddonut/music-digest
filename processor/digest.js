const { getDb } = require('../db/init');
const { scrapeReddit } = require('../scraper/reddit');
const { scrapeWeb } = require('../scraper/web');
const { scrapeTikTok } = require('../scraper/tiktok');
const { scrapeSpotifyPlaylists } = require('../scraper/spotifyPlaylist');
const { scrapeAppleCharts } = require('../scraper/appleCharts');
const { scrapeLastfm } = require('../scraper/lastfm');
const { scrapeGenius } = require('../scraper/genius');
const { scrapeKworbShazam, scrapeKworbSpotify } = require('../scraper/kworb');
const { scrapeHypem } = require('../scraper/hypem');
const { scrapeTokchart } = require('../scraper/tokchart');
const { scrapeYoutubeSources } = require('../scraper/youtube');
const { score, normalizeArtist, normalizeTrack, rankScore } = require('./scorer');
const { processWithClaude } = require('./claude');
const { appendSongsToPlaylist } = require('./spotify');
const { sendDigestEmail } = require('../delivery/email');

function today() {
  return new Date().toISOString().split('T')[0];
}

async function runDigest(opts = {}) {
  const date = opts.date || today();
  const db = getDb();

  // Resolve personaId — from opts, or fall back to active persona in settings
  let personaId = (opts.personaId != null) ? opts.personaId : null;
  if (!personaId) {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'active_persona_id'").get()?.value;
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) personaId = parsed;
    }
  }
  let persona = personaId
    ? db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId)
    : db.prepare('SELECT * FROM personas WHERE is_default = 1').get();
  // Fall back to default if the requested persona doesn't exist
  if (!persona) {
    const defaultPersona = db.prepare('SELECT * FROM personas WHERE is_default = 1').get();
    if (!defaultPersona) return { error: 'No personas configured', date };
    persona = defaultPersona;
    personaId = defaultPersona.id;
  } else {
    personaId = persona.id;
  }

  // Prevent double-run on the same day + persona unless forced
  if (!opts.force) {
    const existing = db.prepare('SELECT id FROM digests WHERE date = ? AND persona_id = ?').get(date, personaId);
    if (existing) {
      console.log(`[digest] Already ran for ${date} (persona ${personaId}), skipping (pass force:true to override)`);
      return { skipped: true, date };
    }
  }

  console.log(`[digest] Starting run for ${date} (persona ${personaId})...`);

  // 1. Load sources for this persona
  let sources;
  if (persona && persona.is_default) {
    sources = db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
  } else {
    const rawIds = (() => { try { return JSON.parse(persona?.source_ids || '[]'); } catch { return []; } })();
    const validIds = rawIds.filter(n => Number.isInteger(n) && n > 0);
    if (validIds.length === 0) {
      console.warn('[digest] Persona has no sources — aborting run');
      return { error: 'Persona has no sources', date };
    }
    const ph = validIds.map(() => '?').join(',');
    sources = db.prepare(`SELECT * FROM sources WHERE id IN (${ph}) AND enabled = 1`).all(...validIds);
  }
  if (sources.length === 0) {
    console.warn('[digest] No enabled sources for this persona — aborting run');
    return { error: 'No enabled sources for this persona', date };
  }
  const redditSources    = sources.filter(s => s.type === 'reddit');
  const webSources       = sources.filter(s => s.type === 'rss' || s.type === 'html');
  const tiktokSources    = sources.filter(s => s.type === 'tiktok');
  const playlistSources  = sources.filter(s => s.type === 'spotify-playlist');
  const tokchartEnabled  = sources.some(s => s.type === 'tokchart');
  const youtubeSources   = sources.filter(s => s.type === 'youtube');
  const appleEnabled         = sources.some(s => s.type === 'apple-charts');
  const lastfmEnabled        = sources.some(s => s.type === 'lastfm');
  const geniusEnabled        = sources.some(s => s.type === 'genius');
  const shazamEnabled        = sources.some(s => s.type === 'shazam');
  const spotifyGlobalEnabled = sources.some(s => s.type === 'spotify-global');
  const hypemEnabled         = sources.some(s => s.type === 'hypem');

  console.log('[PHASE] Scraping');
  console.log(`[digest] ${redditSources.length} subreddits · ${webSources.length} web sources · ${tiktokSources.length} TikTok · ${playlistSources.length} Spotify playlists`);

  // 2. Scrape in parallel
  const [redditData, webData, tiktokResult, playlistData, appleCharts, lastfmData, geniusTrending, shazamChart, spotifyChart, tokchartData, hypemData, youtubeData] = await Promise.all([
    scrapeReddit(redditSources),
    scrapeWeb(webSources),
    scrapeTikTok(tiktokSources),
    scrapeSpotifyPlaylists(playlistSources),
    appleEnabled ? scrapeAppleCharts() : [],
    lastfmEnabled ? scrapeLastfm() : { artists: [], tracks: [] },
    geniusEnabled ? scrapeGenius() : [],
    shazamEnabled ? scrapeKworbShazam() : [],
    spotifyGlobalEnabled ? scrapeKworbSpotify() : [],
    tokchartEnabled ? scrapeTokchart().catch(e => { console.warn('[tokchart] failed:', e.message); return []; }) : [],
    hypemEnabled ? scrapeHypem() : [],
    scrapeYoutubeSources(youtubeSources).catch(e => { console.warn('[youtube] failed:', e.message); return []; }),
  ]);

  // tiktokResult splits into formatted (for Claude prompt) and raw (for scorer)
  const tiktokData    = tiktokResult.formatted;
  const tiktokRaw     = tiktokResult.raw;

  console.log(`[digest] Shazam: ${shazamChart.length} · Spotify global: ${spotifyChart.length} · Hype Machine: ${hypemData.length} · TikTok: ${tiktokData.reduce((n,t)=>n+t.items.length,0)} · Tokchart: ${tokchartData.length} · YouTube: ${youtubeData.length}`);

  const totalItems = redditData.reduce((n, r) => n + r.posts.length, 0)
    + webData.reduce((n, w) => n + w.items.length, 0)
    + tiktokData.reduce((n, t) => n + t.items.length, 0)
    + playlistData.reduce((n, p) => n + p.items.length, 0);

  if (totalItems === 0) {
    console.warn('[digest] No data scraped — aborting run');
    return { error: 'No data scraped', date };
  }

  console.log('[PHASE] Scoring');
  const scoredData = score(redditData, webData, appleCharts, lastfmData.artists, geniusTrending, lastfmData.tracks, shazamChart, spotifyChart, hypemData, tiktokRaw, youtubeData);

  console.log('[PHASE] Claude');
  console.log(`[digest] Scraped ${totalItems} total items. Sending to Claude...`);

  // 3. Build flat indexed array of all web items (mirrors the numbering in the Claude prompt)
  const webIndex = [];
  for (const { source, items } of webData) {
    for (const item of items.slice(0, 8)) {
      webIndex.push({ ...item, source });
    }
  }

  // 4. Claude summarization
  const result = await processWithClaude(date, redditData, webData, tiktokData, playlistData, scoredData, tokchartData);
  console.log(`[digest] Claude found ${result.artists?.length || 0} artists, ${result.songs?.length || 0} songs`);

  // Resolve headlines from indices — guaranteed correct URLs, no title matching
  result.headlines = (result.headline_indices || [])
    .map(i => webIndex[i])
    .filter(Boolean)
    .map(item => ({ title: item.title, source: item.source, url: item.url }));

  const matched = result.headlines.filter(h => h.url).length;
  console.log(`[digest] Headlines resolved: ${matched}/${result.headlines.length} with URLs`);

  // Score songs against chart data and sort by signal strength
  result.songs = scoreSongs(result.songs || [], lastfmData.tracks, geniusTrending, shazamChart, spotifyChart, appleCharts, tokchartData, youtubeData);
  console.log(`[digest] Song scores: ${result.songs.map(s => `${s.title}(${s.song_score.toFixed(2)})`).join(', ')}`);

  // Merge scorer sub-scores into Claude's artist output for UI badge rendering.
  // Keyed by normalizeArtist (not raw toLowerCase) so stylistic differences in
  // how Claude writes the name ("ROSÉ & Bruno Mars" vs "ROSÉ") still match.
  // The scorer's tier is authoritative — the prompt asks Claude to preserve
  // tiers, but this enforces it; Claude's own tier survives only for artists
  // the scorer didn't rank.
  const scorerIndex = {};
  for (const s of scoredData.rising)   scorerIndex[normalizeArtist(s.entity.name)] = { ...s, tier: 'rising' };
  for (const s of scoredData.breaking) scorerIndex[normalizeArtist(s.entity.name)] = { ...s, tier: 'breaking' };
  result.artists = (result.artists || []).map(a => {
    const s = scorerIndex[normalizeArtist(a.name)];
    if (!s) return a;
    if (a.tier !== s.tier) console.warn(`[digest] Tier corrected for ${a.name}: ${a.tier} → ${s.tier}`);
    return { ...a, tier: s.tier, chart_score: s.chart, editorial_score: s.editorial, community_score: s.community, velocity_score: s.velocity };
  });

  // 5. Spotify playlist
  let playlistUrl = null;
  let spotifyAdded = [];
  let spotifyUnmatched = [];
  if (result.songs?.length > 0) {
    console.log('[PHASE] Spotify');
    try {
      const spotifyResult = await appendSongsToPlaylist(result.songs, date, personaId);
      playlistUrl = spotifyResult.playlistUrl;
      spotifyAdded = spotifyResult.added;
      spotifyUnmatched = spotifyResult.unmatched;

      // Attach Spotify track IDs to songs so the UI can link directly to tracks
      const addedByTitle = {};
      for (const a of spotifyAdded) addedByTitle[(a.title || '').toLowerCase()] = a;
      result.songs = (result.songs || []).map(s => {
        const match = addedByTitle[(s.title || '').toLowerCase()];
        return match ? { ...s, spotify_id: match.id, preview_url: match.preview_url || null } : s;
      });
    } catch (err) {
      console.warn(`[digest] Spotify step failed (${err.message}) — continuing without playlist update`);
    }
  }

  // 6. Save to DB
  console.log('[PHASE] Saving');
  db.prepare(`
    INSERT OR REPLACE INTO digests (date, persona_id, summary, artists, songs, headlines, playlist_url, mentioned_artists)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date,
    personaId,
    result.summary,
    JSON.stringify(result.artists || []),
    JSON.stringify(result.songs || []),
    JSON.stringify(result.headlines || []),
    playlistUrl,
    JSON.stringify(result.mentioned_artists || []),
  );

  console.log(`[digest] Saved digest for ${date}`);

  // 7. Send email (only when explicitly requested — not on manual Run Now)
  let emailSent = false;
  if (opts.sendEmail) {
    emailSent = await sendDigestEmail(date, result, playlistUrl, spotifyAdded, spotifyUnmatched);
  }

  return {
    date,
    summary: result.summary,
    artists: result.artists,
    songs: result.songs,
    headlines: result.headlines,
    playlistUrl,
    spotifyAdded,
    spotifyUnmatched,
    emailSent,
  };
}

function buildChartMap(tracks, valueKey = 'rank') {
  const map = new Map();
  for (const t of tracks) {
    const full  = normalizeTrack(t.title) + '|' + normalizeArtist(t.artist);
    const title = normalizeTrack(t.title);
    const entry = { value: t[valueKey], artist: normalizeArtist(t.artist) };
    if (!map.has(full))  map.set(full,  entry);
    if (!map.has(title)) map.set(title, entry);
  }
  return map;
}

// Two normalized artist strings "agree" when they share a meaningful token —
// tolerates "feat." variants and collab orderings without exact equality.
function artistsOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const bTokens = new Set(b.split(' '));
  return a.split(' ').some(tok => tok.length > 1 && bTokens.has(tok));
}

// Full title|artist key first; title-only fallback ONLY when the chart entry's
// artist overlaps. The old unconditional fallback let a song called "Forever"
// inherit chart ranks from any "Forever" by anyone.
function lookupChart(map, fullKey, titleNorm, artistNorm) {
  const exact = map.get(fullKey);
  if (exact) return exact.value;
  const byTitle = map.get(titleNorm);
  if (byTitle && artistsOverlap(byTitle.artist, artistNorm)) return byTitle.value;
  return null;
}

function scoreSongs(songs, lastfmTracks = [], geniusTrending = [], shazamChart = [], spotifyChart = [], appleCharts = [], tokchartData = [], youtubeData = []) {
  const lfmMap      = buildChartMap(lastfmTracks);
  const geniusMap   = buildChartMap(geniusTrending);
  const shazamMap   = buildChartMap(shazamChart);
  const spotifyMap  = buildChartMap(spotifyChart);
  const appleMap    = buildChartMap(appleCharts);
  const youtubeMap  = buildChartMap(youtubeData);
  // Tokchart carries a score (1–1000) instead of a rank
  const tokMap      = buildChartMap(tokchartData, 'score');

  return songs.map(s => {
    const titleNorm  = normalizeTrack(s.title);
    const artistNorm = normalizeArtist(s.artist);
    const fullKey    = titleNorm + '|' + artistNorm;

    const lfmRank     = lookupChart(lfmMap,     fullKey, titleNorm, artistNorm);
    const geniusRank  = lookupChart(geniusMap,  fullKey, titleNorm, artistNorm);
    const shazamRank  = lookupChart(shazamMap,  fullKey, titleNorm, artistNorm);
    const spotifyRank = lookupChart(spotifyMap, fullKey, titleNorm, artistNorm);
    const appleRank   = lookupChart(appleMap,   fullKey, titleNorm, artistNorm);
    const youtubeRank = lookupChart(youtubeMap, fullKey, titleNorm, artistNorm);
    const tokScore    = lookupChart(tokMap,     fullKey, titleNorm, artistNorm);
    const sourceCount = s.sources?.length || 0;

    // Shazam weighted highest (leading indicator); Apple/YouTube for mainstream
    // confirmation. rankScore clamps at 0 — kworb charts list up to 200 rows,
    // and an unclamped deep rank would subtract from the score.
    let song_score = 0;
    if (shazamRank)   song_score += 0.28 * rankScore(shazamRank, 50);
    if (geniusRank)   song_score += 0.20 * rankScore(geniusRank, 50);
    if (lfmRank)      song_score += 0.17 * rankScore(lfmRank, 50);
    if (appleRank)    song_score += 0.13 * rankScore(appleRank, 100);
    if (spotifyRank)  song_score += 0.09 * rankScore(spotifyRank, 200);
    if (youtubeRank)  song_score += 0.11 * rankScore(youtubeRank, 50);
    if (tokScore)     song_score += 0.12 * (tokScore / 1000);
    song_score += Math.min(0.05, sourceCount * 0.02);

    return {
      ...s,
      lfm_rank: lfmRank, genius_rank: geniusRank,
      shazam_rank: shazamRank, spotify_rank: spotifyRank, apple_rank: appleRank,
      youtube_rank: youtubeRank, tokchart_score: tokScore,
      song_score: Math.round(song_score * 100) / 100,
    };
  }).sort((a, b) => b.song_score - a.song_score);
}

module.exports = { runDigest, scoreSongs, artistsOverlap, lookupChart, buildChartMap };

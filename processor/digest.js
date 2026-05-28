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
const { scrapeYoutube }  = require('../scraper/youtube');
const { score, normalizeArtist, normalizeTrack } = require('./scorer');
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
  const persona = personaId
    ? db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId)
    : db.prepare('SELECT * FROM personas WHERE is_default = 1').get();
  // Fall back to default if the requested persona doesn't exist
  if (!persona) {
    const defaultPersona = db.prepare('SELECT * FROM personas WHERE is_default = 1').get();
    if (!defaultPersona) return { error: 'No personas configured', date };
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
  const youtubeEnabled   = sources.some(s => s.type === 'youtube');

  console.log('[PHASE] Scraping');
  console.log(`[digest] ${redditSources.length} subreddits · ${webSources.length} web sources · ${tiktokSources.length} TikTok · ${playlistSources.length} Spotify playlists`);

  // 2. Scrape in parallel
  const [redditData, webData, tiktokResult, playlistData, appleCharts, lastfmData, geniusTrending, shazamChart, spotifyChart, tokchartData, hypemData, youtubeData] = await Promise.all([
    scrapeReddit(redditSources),
    scrapeWeb(webSources),
    scrapeTikTok(tiktokSources),
    scrapeSpotifyPlaylists(playlistSources),
    scrapeAppleCharts(),
    scrapeLastfm(),
    scrapeGenius(),
    scrapeKworbShazam(),
    scrapeKworbSpotify(),
    tokchartEnabled ? scrapeTokchart().catch(e => { console.warn('[tokchart] failed:', e.message); return []; }) : [],
    scrapeHypem(),
    youtubeEnabled  ? scrapeYoutube().catch(e => { console.warn('[youtube] failed:', e.message); return []; }) : [],
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

function buildChartMap(tracks) {
  const map = new Map();
  for (const t of tracks) {
    const full  = normalizeTrack(t.title) + '|' + normalizeArtist(t.artist);
    const title = normalizeTrack(t.title);
    if (!map.has(full))  map.set(full,  t.rank);
    if (!map.has(title)) map.set(title, t.rank);
  }
  return map;
}

function scoreSongs(songs, lastfmTracks = [], geniusTrending = [], shazamChart = [], spotifyChart = [], appleCharts = [], tokchartData = [], youtubeData = []) {
  const lfmMap      = buildChartMap(lastfmTracks);
  const geniusMap   = buildChartMap(geniusTrending);
  const shazamMap   = buildChartMap(shazamChart);
  const spotifyMap  = buildChartMap(spotifyChart);
  const appleMap    = buildChartMap(appleCharts);
  const youtubeMap  = buildChartMap(youtubeData);
  // Tokchart: normalise score (1–1000) to a rank-like index for map building
  const tokMap = new Map();
  for (const t of tokchartData) {
    const key = normalizeTrack(t.title) + '|' + normalizeArtist(t.artist);
    tokMap.set(key, t.score);
    tokMap.set(normalizeTrack(t.title), t.score);
  }

  return songs.map(s => {
    const titleNorm  = normalizeTrack(s.title);
    const artistNorm = normalizeArtist(s.artist);
    const fullKey    = titleNorm + '|' + artistNorm;

    const lfmRank     = lfmMap.get(fullKey)     ?? lfmMap.get(titleNorm)     ?? null;
    const geniusRank  = geniusMap.get(fullKey)  ?? geniusMap.get(titleNorm)  ?? null;
    const shazamRank  = shazamMap.get(fullKey)  ?? shazamMap.get(titleNorm)  ?? null;
    const spotifyRank = spotifyMap.get(fullKey) ?? spotifyMap.get(titleNorm) ?? null;
    const appleRank   = appleMap.get(fullKey)   ?? appleMap.get(titleNorm)   ?? null;
    const youtubeRank = youtubeMap.get(fullKey) ?? youtubeMap.get(titleNorm) ?? null;
    const tokScore    = tokMap.get(fullKey)     ?? tokMap.get(titleNorm)     ?? null;
    const sourceCount = s.sources?.length || 0;

    // Shazam weighted highest (leading indicator); Apple/YouTube for mainstream confirmation
    let song_score = 0;
    if (shazamRank)   song_score += 0.28 * (1 - (shazamRank  - 1) / 49);
    if (geniusRank)   song_score += 0.20 * (1 - (geniusRank  - 1) / 49);
    if (lfmRank)      song_score += 0.17 * (1 - (lfmRank      - 1) / 49);
    if (appleRank)    song_score += 0.13 * (1 - (appleRank    - 1) / 99);
    if (spotifyRank)  song_score += 0.09 * (1 - (spotifyRank  - 1) / 199);
    if (youtubeRank)  song_score += 0.11 * (1 - (youtubeRank  - 1) / 49);
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

module.exports = { runDigest };

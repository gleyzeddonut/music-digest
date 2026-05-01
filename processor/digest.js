const { getDb } = require('../db/init');
const { scrapeReddit } = require('../scraper/reddit');
const { scrapeWeb } = require('../scraper/web');
const { scrapeTikTok } = require('../scraper/tiktok');
const { scrapeSpotifyPlaylists } = require('../scraper/spotifyPlaylist');
const { scrapeAppleCharts } = require('../scraper/appleCharts');
const { scrapeLastfm } = require('../scraper/lastfm');
const { scrapeGenius } = require('../scraper/genius');
const { score } = require('./scorer');
const { processWithClaude } = require('./claude');
const { appendSongsToPlaylist } = require('./spotify');
const { sendDigestEmail } = require('../delivery/email');

function today() {
  return new Date().toISOString().split('T')[0];
}

async function runDigest(opts = {}) {
  const date = opts.date || today();
  const db = getDb();

  // Prevent double-run on the same day unless forced
  if (!opts.force) {
    const existing = db.prepare('SELECT id FROM digests WHERE date = ?').get(date);
    if (existing) {
      console.log(`[digest] Already ran for ${date}, skipping (pass force:true to override)`);
      return { skipped: true, date };
    }
  }

  console.log(`[digest] Starting run for ${date}...`);

  // 1. Load enabled sources
  const sources = db.prepare('SELECT * FROM sources WHERE enabled = 1').all();
  const redditSources   = sources.filter(s => s.type === 'reddit');
  const webSources      = sources.filter(s => s.type === 'rss' || s.type === 'html');
  const tiktokSources   = sources.filter(s => s.type === 'tiktok');
  const playlistSources = sources.filter(s => s.type === 'spotify-playlist');

  console.log('[PHASE] Scraping');
  console.log(`[digest] ${redditSources.length} subreddits · ${webSources.length} web sources · ${tiktokSources.length} TikTok · ${playlistSources.length} Spotify playlists`);

  // 2. Scrape in parallel
  const [redditData, webData, tiktokData, playlistData, appleCharts, lastfmData, geniusTrending] = await Promise.all([
    scrapeReddit(redditSources),
    scrapeWeb(webSources),
    scrapeTikTok(tiktokSources),
    scrapeSpotifyPlaylists(playlistSources),
    scrapeAppleCharts(),
    scrapeLastfm(),
    scrapeGenius(),
  ]);

  const totalItems = redditData.reduce((n, r) => n + r.posts.length, 0)
    + webData.reduce((n, w) => n + w.items.length, 0)
    + tiktokData.reduce((n, t) => n + t.items.length, 0)
    + playlistData.reduce((n, p) => n + p.items.length, 0);

  if (totalItems === 0) {
    console.warn('[digest] No data scraped — aborting run');
    return { error: 'No data scraped', date };
  }

  console.log('[PHASE] Scoring');
  const scoredData = score(redditData, webData, appleCharts, lastfmData.artists, geniusTrending);

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
  const result = await processWithClaude(date, redditData, webData, tiktokData, playlistData, scoredData);
  console.log(`[digest] Claude found ${result.artists?.length || 0} artists, ${result.songs?.length || 0} songs`);

  // Resolve headlines from indices — guaranteed correct URLs, no title matching
  result.headlines = (result.headline_indices || [])
    .map(i => webIndex[i])
    .filter(Boolean)
    .map(item => ({ title: item.title, source: item.source, url: item.url }));

  const matched = result.headlines.filter(h => h.url).length;
  console.log(`[digest] Headlines resolved: ${matched}/${result.headlines.length} with URLs`);

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
    const spotifyResult = await appendSongsToPlaylist(result.songs, date);
    playlistUrl = spotifyResult.playlistUrl;
    spotifyAdded = spotifyResult.added;
    spotifyUnmatched = spotifyResult.unmatched;
  }

  // 6. Save to DB
  console.log('[PHASE] Saving');
  db.prepare(`
    INSERT OR REPLACE INTO digests (date, summary, artists, songs, headlines, playlist_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    date,
    result.summary,
    JSON.stringify(result.artists || []),
    JSON.stringify(result.songs || []),
    JSON.stringify(result.headlines || []),
    playlistUrl,
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

module.exports = { runDigest };

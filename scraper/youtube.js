'use strict';

const supabase = require('../supabase-client');
const auth = require('../auth-session');

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

module.exports = { parseYoutubeChartUrl, parseChartRows, scrapeYoutubeSource, scrapeYoutubeSources };

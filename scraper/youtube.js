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

async function scrapeYoutube() {
  const res = await fetch(`${supabase.url}/functions/v1/youtube-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await auth.authHeaders()) },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    console.warn(`[youtube] Edge function error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const results = [];

  for (let i = 0; i < (data?.items || []).length; i++) {
    const item        = data.items[i];
    const rawTitle    = item.snippet.title;
    const channelName = item.snippet.channelTitle
      .replace(/\s*-\s*Topic$/i, '')
      .trim();

    let artist, song;
    const dashIdx = rawTitle.indexOf(' - ');
    if (dashIdx !== -1) {
      artist = rawTitle.slice(0, dashIdx).trim();
      song   = rawTitle.slice(dashIdx + 3)
        .replace(/\s*[\[(][^\])]*(Official|Video|Audio|Lyrics|ft\.|feat\.)[^\])]*[\])]/gi, '')
        .trim();
    } else {
      artist = channelName;
      song   = rawTitle
        .replace(/\s*[\[(][^\])]*(Official|Video|Audio|Lyrics)[^\])]*[\])]/gi, '')
        .trim();
    }

    results.push({
      rank:    i + 1,
      title:   song,
      artist,
      views:   parseInt(item.statistics?.viewCount || 0, 10),
      videoId: item.id,
      signals: ['YouTube Trending'],
      source:  'youtube',
    });
  }

  console.log(`[youtube] ${results.length} trending music videos`);
  return results;
}

module.exports = { scrapeYoutube, parseYoutubeChartUrl };

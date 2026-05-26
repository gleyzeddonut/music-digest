'use strict';

const supabase = require('../supabase-client');

async function scrapeYoutube() {
  const res = await fetch(`${supabase.url}/functions/v1/youtube-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabase.anonKey },
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

module.exports = { scrapeYoutube };

'use strict';

const supabase = require('../supabase-client');

async function lastfmGet(method, extra = {}) {
  try {
    const res = await fetch(`${supabase.url}/functions/v1/lastfm-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabase.anonKey },
      body: JSON.stringify({ method, limit: 50, ...extra }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? res.json() : null;
  } catch (err) {
    console.warn(`[lastfm] ${method} failed: ${err.message}`);
    return null;
  }
}

async function scrapeLastfm() {
  const [artistsData, tracksData] = await Promise.all([
    lastfmGet('chart.getTopArtists'),
    lastfmGet('chart.getTopTracks'),
  ]);

  const artists = (artistsData?.artists?.artist || []).map((a, i) => ({
    name:      a.name,
    rank:      i + 1,
    listeners: parseInt(a.listeners || '0', 10),
  }));

  const tracks = (tracksData?.tracks?.track || []).map((t, i) => ({
    title:    t.name,
    artist:   t.artist?.name || '',
    rank:     i + 1,
    listeners: parseInt(t.listeners || '0', 10),
  }));

  console.log(`[lastfm] Top artists: ${artists.length}, top tracks: ${tracks.length}`);
  return { artists, tracks };
}

module.exports = { scrapeLastfm };

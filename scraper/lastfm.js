'use strict';

const axios = require('axios');
const config = require('../config');

const BASE = 'https://ws.audioscrobbler.com/2.0/';

async function lastfmGet(method, extra = {}) {
  const key = config.LASTFM_API_KEY;
  if (!key) {
    console.warn('[lastfm] LASTFM_API_KEY not set — skipping');
    return null;
  }
  try {
    const { data } = await axios.get(BASE, {
      timeout: 10000,
      params: { method, api_key: key, format: 'json', limit: 50, ...extra },
    });
    return data;
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

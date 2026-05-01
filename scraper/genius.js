'use strict';

const axios = require('axios');
const config = require('../config');

const BASE = 'https://api.genius.com';

// Genius charts/songs endpoints require elevated API access.
// Instead, search across popular genre terms and rank by page views.
const QUERIES = ['hip hop', 'pop', 'rap', 'r&b', 'indie', 'electronic'];

async function scrapeGenius() {
  const key = config.GENIUS_API_KEY;
  if (!key) {
    console.warn('[genius] GENIUS_API_KEY not set — skipping');
    return [];
  }

  const seen = new Set();
  const songs = [];

  for (const q of QUERIES) {
    try {
      const { data } = await axios.get(`${BASE}/search`, {
        timeout: 10000,
        params: { q, per_page: 20 },
        headers: { Authorization: `Bearer ${key}` },
      });
      for (const hit of (data?.response?.hits || [])) {
        const s = hit.result;
        if (!s || seen.has(s.id)) continue;
        seen.add(s.id);
        songs.push({
          title:     s.title_with_featured || s.title,
          artist:    s.primary_artist?.name || '',
          pageViews: s.stats?.pageviews || 0,
        });
      }
    } catch (err) {
      console.warn(`[genius] Search "${q}" failed: ${err.message}`);
    }
  }

  const ranked = songs
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 50)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  console.log(`[genius] ${ranked.length} songs via search`);
  return ranked;
}

module.exports = { scrapeGenius };

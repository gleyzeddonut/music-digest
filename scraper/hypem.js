'use strict';

const axios = require('axios');

// Hype Machine aggregates indie music blogs — tracks showing up here are
// getting editorial attention before they appear on mainstream charts.
// "popular_3day" sorts by blog post count + engagement over the past 3 days.
const API_URL = 'https://api.hypem.com/v2/tracks';

async function scrapeHypem() {
  try {
    const { data } = await axios.get(API_URL, {
      timeout: 10000,
      params: { filter: 'popular_3day', key: 'obj', count: 50 },
    });

    if (!Array.isArray(data)) throw new Error('unexpected response shape');

    // Only keep tracks with meaningful multi-blog signal
    const results = data
      .filter(t => t.artist && t.title && (t.posted_count >= 2 || t.loved_count >= 5))
      .map((t, i) => ({
        rank:        i + 1,
        title:       t.title,
        artist:      t.artist,
        blogs:       t.posted_count || 0,
        loved:       t.loved_count  || 0,
        siteName:    t.sitename     || '',
      }));

    console.log(`[hypem] ${results.length} tracks (of ${data.length} total with multi-source filter)`);
    return results;
  } catch (err) {
    console.warn(`[hypem] Failed: ${err.message}`);
    return [];
  }
}

module.exports = { scrapeHypem };

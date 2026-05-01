'use strict';

const axios = require('axios');

const FEED_URL = 'https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json';

async function scrapeAppleCharts() {
  try {
    const { data } = await axios.get(FEED_URL, { timeout: 10000 });
    const results = (data?.feed?.results || []).map((item, i) => ({
      rank:   i + 1,
      title:  item.name,
      artist: item.artistName,
    }));
    console.log(`[apple] Top 100: ${results.length} tracks`);
    return results;
  } catch (err) {
    console.warn(`[apple] Failed to fetch charts: ${err.message}`);
    return [];
  }
}

module.exports = { scrapeAppleCharts };

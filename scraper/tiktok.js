'use strict';

// The TikTok creative_radar_api endpoint was discontinued in 2024.
// Kworb mirrors the TikTok US chart from official data — same signal, no auth.
const { scrapeKworbTikTok } = require('./kworb');

async function scrapeTikTok(sources) {
  if (!sources.length) return [];

  const tracks = await scrapeKworbTikTok();
  if (!tracks.length) return [{ source: 'TikTok Charts', items: [] }];

  const items = tracks.map(t => ({
    title:       `${t.artist} — ${t.title}`,
    description: `TikTok US rank #${t.rank}`,
    url:         'https://kworb.net/charts/tiktok/us.html',
  }));

  console.log(`[tiktok] ${items.length} items from Kworb`);
  return [{ source: 'TikTok Charts', items }];
}

module.exports = { scrapeTikTok };

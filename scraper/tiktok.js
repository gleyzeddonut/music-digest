'use strict';

// The TikTok creative_radar_api endpoint was discontinued in 2024.
// Kworb mirrors the TikTok US chart from official data — same signal, no auth.
const { scrapeKworbTikTok } = require('./kworb');

// Returns { formatted, raw }:
//   formatted — [{source, items[]}] shape for the Claude prompt
//   raw       — [{rank, artist, title}] shape for the signal scorer
async function scrapeTikTok(sources) {
  if (!sources.length) return { formatted: [], raw: [] };

  const tracks = await scrapeKworbTikTok();
  if (!tracks.length) return { formatted: [{ source: 'TikTok Charts', items: [] }], raw: [] };

  const items = tracks.map(t => ({
    title:       `${t.artist} — ${t.title}`,
    description: `TikTok US rank #${t.rank}`,
    url:         'https://kworb.net/charts/tiktok/us.html',
  }));

  console.log(`[tiktok] ${items.length} items from Kworb`);
  return {
    formatted: [{ source: 'TikTok Charts', items }],
    raw:       tracks,  // [{rank, artist, title}] — fed directly to scorer
  };
}

module.exports = { scrapeTikTok };

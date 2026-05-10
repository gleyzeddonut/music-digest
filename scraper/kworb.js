'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer':    'https://kworb.net/',
};

// Shazam and TikTok pages share the same table structure:
//   <tr><td>1</td><td>+1</td><td class="mp text"><div>Artist - Title</div></td></tr>
async function scrapeSimpleChart(url, label) {
  const { data } = await axios.get(url, { timeout: 15000, headers: HEADERS });
  const $ = cheerio.load(data);
  const results = [];

  $('#simpletable tbody tr').each((i, row) => {
    const cells  = $(row).find('td');
    const rank   = parseInt($(cells.eq(0)).text().trim(), 10);
    const text   = $(cells.eq(2)).find('div').text().trim();
    if (!rank || !text) return;

    // "Artist - Title"  —  split on first " - "
    const sep = text.indexOf(' - ');
    if (sep === -1) return;
    const artist = text.slice(0, sep).trim();
    const title  = text.slice(sep + 3).trim();
    if (artist && title) results.push({ rank, artist, title });
  });

  console.log(`[kworb] ${label}: ${results.length} tracks`);
  return results;
}

// Spotify global daily page has a richer table with anchor tags:
//   <td class="text mp"><div><a>Artist</a> - <a>Title</a> ...</div></td>
async function scrapeKworbSpotify() {
  try {
    const url  = 'https://kworb.net/spotify/country/global_daily.html';
    const { data } = await axios.get(url, { timeout: 15000, headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];

    $('table tbody tr').each((i, row) => {
      const cells  = $(row).find('td');
      const rank   = parseInt($(cells.eq(0)).text().trim(), 10);
      const cell   = cells.filter((_, c) => /\bmp\b/.test($(c).attr('class') || '') && /\btext\b/.test($(c).attr('class') || '')).first();
      const links  = cell.find('a');
      if (!rank || links.length < 2) return;

      const artist = $(links.eq(0)).text().trim();
      const title  = $(links.eq(1)).text().trim();
      if (artist && title) results.push({ rank, artist, title });
    });

    console.log(`[kworb] Spotify global: ${results.length} tracks`);
    return results;
  } catch (err) {
    console.warn(`[kworb] Spotify global failed: ${err.message}`);
    return [];
  }
}

async function scrapeKworbShazam() {
  try {
    return await scrapeSimpleChart('https://kworb.net/charts/shazam/us.html', 'Shazam US');
  } catch (err) {
    console.warn(`[kworb] Shazam failed: ${err.message}`);
    return [];
  }
}

async function scrapeKworbTikTok() {
  try {
    return await scrapeSimpleChart('https://kworb.net/charts/tiktok/us.html', 'TikTok US');
  } catch (err) {
    console.warn(`[kworb] TikTok failed: ${err.message}`);
    return [];
  }
}

module.exports = { scrapeKworbShazam, scrapeKworbTikTok, scrapeKworbSpotify };

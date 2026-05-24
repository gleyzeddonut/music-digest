'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');

const URL     = 'https://tokchart.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml',
  'Referer':    'https://tokchart.com/',
};

// Tokchart exposes the top 5 rows without login. Each row has:
//   TD0: trending score (1–1000)
//   TD1: TikTok creator + sound link (href contains /tiktok-sound/{id})
//   TD2: song title (.font-medium), artist (next div), album art (img[alt="Album cover"])
//   TD3: video count,  TD5: total plays,  TD7: top country,  TD9: age
async function scrapeTokchart() {
  const { data } = await axios.get(URL, { timeout: 20000, headers: HEADERS });
  const $ = cheerio.load(data);
  const results = [];

  $('tr').each((i, row) => {
    if (i === 0) return; // header

    const tds = $(row).find('td');
    if (tds.length < 3) return;

    // Skip paywalled rows — they have no sound link
    const soundHref = tds.eq(1).find('a[href*="tiktok-sound"]').first().attr('href') || '';
    if (!soundHref) return;

    const score = parseInt(tds.eq(0).find('.text-center').text().trim(), 10) || 0;

    // TD2: song info (only present for UGC/commercial tracks with identified audio)
    const td2     = tds.eq(2);
    const title   = td2.find('.font-medium').first().text().trim();
    const artist  = td2.find('.flex.gap-x-1').first().text().trim();
    const artwork = td2.find('img[alt="Album cover"]').attr('src') || '';

    // Stats
    const videoText  = tds.eq(3).text().trim().split(/\s/)[0] || '';
    const playsText  = tds.eq(5).text().trim().split(/\s/)[0] || '';
    const country    = tds.eq(7).text().trim().replace(/[^A-Z\s]/gu, '').trim() || '';
    const soundId    = soundHref.split('/').pop();

    if (!title || !artist) return; // no identified audio — skip

    results.push({
      rank:       i,         // position on the page (1-based after header)
      score,
      title,
      artist,
      artwork,
      videoCount:  videoText,
      plays:       playsText,
      topCountry:  country,
      tiktokSoundId: soundId,
      signals:    ['TikTok Trending'],
      source:     'tokchart',
    });
  });

  console.log(`[tokchart] ${results.length} trending tracks`);
  return results;
}

module.exports = { scrapeTokchart };

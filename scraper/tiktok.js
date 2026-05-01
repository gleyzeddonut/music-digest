const axios = require('axios');
const config = require('../config');

let _tokenCache = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (!config.TIKTOK_CLIENT_KEY || !config.TIKTOK_CLIENT_SECRET) return null;
  if (_tokenCache && Date.now() < _tokenExpiry) return _tokenCache;

  const res = await axios.post(
    'https://open.tiktokapis.com/v2/oauth/token/',
    new URLSearchParams({
      client_key: config.TIKTOK_CLIENT_KEY,
      client_secret: config.TIKTOK_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  );

  _tokenCache = res.data.access_token;
  _tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return _tokenCache;
}

async function scrapeTikTok(sources) {
  let token = null;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[tiktok] Could not get access token:', err.message);
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const results = [];

  for (const source of sources) {
    // selector field repurposed as period in days: 7, 30, 120 (default 7)
    const period = parseInt(source.selector || '7', 10) || 7;

    try {
      const res = await axios.get(
        'https://ads.tiktok.com/creative_radar_api/v1/top_song/list',
        {
          params: { period, page: 1, limit: 30, country_code: 'US' },
          headers,
          timeout: 12000,
        }
      );

      const list = res.data?.data?.list || [];
      const items = list
        .map((entry, i) => ({
          title: `${entry.music_info?.title} — ${entry.music_info?.author}`,
          description: `TikTok rank #${entry.rank ?? i + 1}, ${period}-day trending`,
          url: entry.link || 'https://www.tiktok.com/music/',
        }))
        .filter(item => item.title && item.title.length > 5);

      console.log(`[tiktok] ${source.name}: ${items.length} items`);
      if (items.length) results.push({ source: source.name, items });
    } catch (err) {
      console.warn(`[tiktok] Failed ${source.name}: ${err.message}`);
      results.push({ source: source.name, items: [] });
    }
  }

  return results;
}

module.exports = { scrapeTikTok };

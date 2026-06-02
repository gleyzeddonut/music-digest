'use strict';

const axios    = require('axios');
const supabase = require('../supabase-client');
const auth     = require('../auth-session');

const CHART_URL = 'https://genius.com/api/songs/chart';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer':    'https://genius.com/',
  'Accept':     'application/json',
};

async function scrapeGenius() {
  try {
    const { data } = await axios.get(CHART_URL, {
      timeout: 12000,
      params:  { time_period: 'day', per_page: 50 },
      headers: HEADERS,
    });

    const items = data?.response?.chart_items;
    if (!Array.isArray(items) || items.length === 0) throw new Error('empty chart_items');

    const ranked = items
      .filter(ci => ci.type === 'song' && ci.item)
      .map((ci, i) => ({
        title:     ci.item.title_with_featured || ci.item.full_title?.split(' by ')[0] || ci.item.title,
        artist:    ci.item.primary_artist_names || ci.item.artist_names || '',
        rank:      i + 1,
        pageViews: ci.item.stats?.pageviews || 0,
      }));

    console.log(`[genius] ${ranked.length} songs from daily chart`);
    return ranked;
  } catch (err) {
    console.warn(`[genius] Chart failed (${err.message}) — falling back to search`);
    return fallbackSearch();
  }
}

const QUERIES = ['hip hop', 'pop', 'rap', 'r&b', 'indie', 'electronic'];

async function fallbackSearch() {
  const seen  = new Set();
  const songs = [];

  // Parallel queries — previously sequential, worst case ~60s; now completes in ~10s
  const headers = { 'Content-Type': 'application/json', ...(await auth.authHeaders()) };
  const results = await Promise.allSettled(
    QUERIES.map(q =>
      fetch(`${supabase.url}/functions/v1/genius-proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: '/search', params: { q, per_page: 20 } }),
        signal: AbortSignal.timeout(10000),
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
    )
  );

  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.warn(`[genius] fallback query "${QUERIES[i]}" failed: ${result.reason?.message}`);
      continue;
    }
    for (const hit of (result.value?.response?.hits || [])) {
      const s = hit.result;
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      songs.push({
        title:     s.title_with_featured || s.title,
        artist:    s.primary_artist?.name || '',
        pageViews: s.stats?.pageviews || 0,
      });
    }
  }

  const ranked = songs
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 50)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  console.log(`[genius] ${ranked.length} songs via search fallback`);
  return ranked;
}

module.exports = { scrapeGenius };

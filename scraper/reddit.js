const axios = require('axios');
const Parser = require('rss-parser');

const LIMIT = 25;
const VALID_SORTS = ['hot', 'rising', 'new', 'top-day', 'top-week', 'top-month'];
const DEFAULT_SORT = 'hot';

// Headers that mimic a browser — Reddit's JSON endpoint blocks simple bots.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function buildJsonUrl(base, slug, sort) {
  if (sort && sort.startsWith('top-')) {
    const t = sort.split('-')[1];
    return `${base}/r/${slug}/top.json?limit=${LIMIT}&t=${t}`;
  }
  const s = VALID_SORTS.includes(sort) ? sort : DEFAULT_SORT;
  return `${base}/r/${slug}/${s}.json?limit=${LIMIT}`;
}

function buildRssUrl(slug, sort) {
  if (sort && sort.startsWith('top-')) {
    const t = sort.split('-')[1];
    return `https://www.reddit.com/r/${slug}/top.rss?limit=${LIMIT}&t=${t}`;
  }
  const s = VALID_SORTS.includes(sort) ? sort : DEFAULT_SORT;
  return `https://www.reddit.com/r/${slug}/${s}.rss?limit=${LIMIT}`;
}

async function tryJson(base, slug, sort) {
  const url = buildJsonUrl(base, slug, sort);
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  const posts = data?.data?.children || [];
  return posts
    .filter(p => !p.data.stickied)
    .map(p => ({
      title: p.data.title,
      score: p.data.score,
      comments: p.data.num_comments,
      url: `https://www.reddit.com${p.data.permalink}`,
      flair: p.data.link_flair_text || null,
    }));
}

async function tryRss(slug, sort) {
  const url = buildRssUrl(slug, sort);
  const parser = new Parser({ timeout: 10000 });
  const feed = await parser.parseURL(url);
  return (feed.items || []).map(item => ({
    title: item.title || '',
    score: null,
    comments: null,
    url: item.link || '',
    flair: null,
  }));
}

async function scrapeSubreddit(slug, sort = DEFAULT_SORT) {
  // 1. Try old.reddit.com JSON (less aggressively blocked than www)
  for (const base of ['https://old.reddit.com', 'https://www.reddit.com']) {
    try {
      const posts = await tryJson(base, slug, sort);
      if (posts.length > 0) return posts;
    } catch (err) {
      if (err.response?.status !== 403 && err.response?.status !== 429) {
        console.warn(`[reddit] r/${slug} JSON failed (${base}): ${err.message}`);
      }
    }
  }
  // 2. Fall back to RSS — no vote scores but titles still feed Claude
  try {
    const posts = await tryRss(slug, sort);
    if (posts.length > 0) {
      console.log(`[reddit] r/${slug}: using RSS fallback (${posts.length} posts, no scores)`);
      return posts;
    }
  } catch (rssErr) {
    // swallow — final warn below
  }
  console.warn(`[reddit] Failed to scrape r/${slug}: all methods returned no data`);
  return [];
}

// Scrape all enabled reddit sources and return combined results.
// For reddit sources, source.selector stores the sort order (defaults to 'hot').
async function scrapeReddit(sources) {
  // Staggered parallel — 400ms offset per subreddit cuts wall time from ~16s to ~5s
  // while still being respectful to the public JSON API.
  const tasks = sources.map((source, i) => {
    const sort = source.selector || DEFAULT_SORT;
    return new Promise(r => setTimeout(r, i * 400))
      .then(() => scrapeSubreddit(source.url, sort))
      .then(posts => {
        if (!posts.length) return null;
        console.log(`[reddit] r/${source.url} (${sort}): ${posts.length} posts`);
        return { source: source.name, posts, sort };
      });
  });
  const results = await Promise.all(tasks);
  return results.filter(Boolean);
}

module.exports = { scrapeReddit };

const axios = require('axios');

const REDDIT_BASE = 'https://www.reddit.com/r';
const LIMIT = 25;

// Valid sort options. 'selector' column stores this value for reddit sources.
// Format: 'hot' | 'rising' | 'new' | 'top-day' | 'top-week' | 'top-month'
const VALID_SORTS = ['hot', 'rising', 'new', 'top-day', 'top-week', 'top-month'];
const DEFAULT_SORT = 'hot';

function buildUrl(slug, sort) {
  if (sort && sort.startsWith('top-')) {
    const t = sort.split('-')[1]; // day | week | month
    return `${REDDIT_BASE}/${slug}/top.json?limit=${LIMIT}&t=${t}`;
  }
  const s = VALID_SORTS.includes(sort) ? sort : DEFAULT_SORT;
  return `${REDDIT_BASE}/${slug}/${s}.json?limit=${LIMIT}`;
}

// Uses Reddit's public JSON API — no auth required.
// Swap this file for snoowrap when you get API credentials.
async function scrapeSubreddit(slug, sort = DEFAULT_SORT) {
  const url = buildUrl(slug, sort);
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'MusicDigest/1.0 (personal digest tool)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

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
  } catch (err) {
    console.warn(`[reddit] Failed to scrape r/${slug}: ${err.message}`);
    return [];
  }
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

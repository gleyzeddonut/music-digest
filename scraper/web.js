const axios = require('axios');
const cheerio = require('cheerio');
const RSSParser = require('rss-parser');

const parser = new RSSParser({
  timeout: 10000,
  headers: { 'User-Agent': 'MusicDigest/1.0 (personal digest tool)' },
});

const AXIOS_OPTS = {
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
  },
};

async function scrapeRss(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || []).slice(0, 15).map(item => ({
      title: item.title?.trim(),
      description: (item.contentSnippet || item.summary || '').slice(0, 220).trim(),
      url: item.link,
      published: item.pubDate,
    })).filter(i => i.title);

    console.log(`[rss] ${source.name}: ${items.length} items`);
    return { source: source.name, items };
  } catch (err) {
    console.warn(`[rss] Failed ${source.name}: ${err.message}`);
    return { source: source.name, items: [] };
  }
}

async function scrapeHtml(source) {
  try {
    const { data: html } = await axios.get(source.url, AXIOS_OPTS);
    const $ = cheerio.load(html);

    const selector = source.selector || 'h2 a, h3 a, article a, .post-title a';
    const seen = new Set();
    const items = [];

    $(selector).each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr('href');
      if (!title || title.length < 10 || seen.has(title)) return;
      seen.add(title);
      items.push({
        title,
        description: '',
        url: href?.startsWith('http') ? href : href ? `${new URL(source.url).origin}${href}` : source.url,
      });
    });

    const limited = items.slice(0, 10);
    console.log(`[html] ${source.name}: ${limited.length} items`);
    return { source: source.name, items: limited };
  } catch (err) {
    console.warn(`[html] Failed ${source.name}: ${err.message}`);
    return { source: source.name, items: [] };
  }
}

async function scrapeWeb(sources) {
  const results = [];
  for (const source of sources) {
    await new Promise(r => setTimeout(r, 500));
    const result = source.type === 'rss'
      ? await scrapeRss(source)
      : await scrapeHtml(source);
    if (result.items.length > 0) results.push(result);
  }
  return results;
}

module.exports = { scrapeWeb };

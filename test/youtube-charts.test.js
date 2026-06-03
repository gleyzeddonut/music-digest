const assert = require('assert');
const { parseYoutubeChartUrl } = require('../scraper/youtube');

// Custom charts → InnerTube descriptor
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TopSongs/us/weekly'),
  { mode: 'charts', chartType: 'TRACKS', country: 'us', label: 'YouTube Top Songs' });
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TopArtists/gb/weekly'),
  { mode: 'charts', chartType: 'ARTISTS', country: 'gb', label: 'YouTube Top Artists' });
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TopMusicVideos/jp/weekly'),
  { mode: 'charts', chartType: 'VIDEOS', country: 'jp', label: 'YouTube Top Videos' });

// Trending → official Data API descriptor
assert.deepStrictEqual(
  parseYoutubeChartUrl('https://charts.youtube.com/charts/TrendingVideos/us/RightNow'),
  { mode: 'official', country: 'us', label: 'YouTube Trending' });

// Case-insensitive chart name + period ignored for charts mode
assert.strictEqual(parseYoutubeChartUrl('https://charts.youtube.com/charts/topsongs/US/daily').chartType, 'TRACKS');

// Rejections
assert.throws(() => parseYoutubeChartUrl('https://charts.youtube.com/charts/TopSongs/global/weekly'), /country/i);
assert.throws(() => parseYoutubeChartUrl('https://charts.youtube.com/charts/TopGenres/us/weekly'), /Unsupported chart/i);
assert.throws(() => parseYoutubeChartUrl('https://example.com/charts/TopSongs/us/weekly'), /YouTube/i);
assert.throws(() => parseYoutubeChartUrl('not a url'), /Invalid URL/i);
console.log('✓ parseYoutubeChartUrl');

const { parseChartRows } = require('../scraper/youtube');

const tracks = parseChartRows(require('./fixtures/yt-tracks.json'), 'TRACKS', 'YouTube Top Songs');
assert.strictEqual(tracks.length, 2);
assert.deepStrictEqual(tracks[0], { rank: 1, title: "Choosin' Texas", artist: 'Ella Langley', views: 6525533, signals: ['YouTube Top Songs'], source: 'youtube' });
assert.strictEqual(tracks[1].artist, 'Artist Two, Guest'); // multiple artists joined

const videos = parseChartRows(require('./fixtures/yt-videos.json'), 'VIDEOS', 'YouTube Top Videos');
assert.deepStrictEqual(videos[0], { rank: 1, title: 'Some Video', artist: 'Drake', views: 999, signals: ['YouTube Top Videos'], source: 'youtube' });

const artists = parseChartRows(require('./fixtures/yt-artists.json'), 'ARTISTS', 'YouTube Top Artists');
assert.deepStrictEqual(artists[0], { rank: 1, title: null, artist: 'Drake', views: 1000000, signals: ['YouTube Top Artists'], source: 'youtube' });

// Missing/garbage data → empty array, never throws
assert.deepStrictEqual(parseChartRows({}, 'TRACKS', 'x'), []);
console.log('✓ parseChartRows');

const { scrapeYoutubeSource } = require('../scraper/youtube');

(async () => {
  // Charts mode hits charts.youtube.com directly; stub global.fetch to return a fixture.
  const realFetch = global.fetch;
  let calledUrl = null;
  global.fetch = async (url) => {
    calledUrl = String(url);
    return { ok: true, json: async () => require('./fixtures/yt-tracks.json') };
  };
  try {
    const rows = await scrapeYoutubeSource({ url: 'https://charts.youtube.com/charts/TopSongs/us/weekly', name: 'Top Songs US' });
    assert.ok(calledUrl.startsWith('https://charts.youtube.com/youtubei/v1/browse'), 'calls InnerTube endpoint');
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].artist, 'Ella Langley');
  } finally {
    global.fetch = realFetch;
  }

  // A bad URL throws (so the Test button can surface the message).
  await assert.rejects(scrapeYoutubeSource({ url: 'https://charts.youtube.com/charts/TopGenres/us/weekly', name: 'x' }), /Unsupported chart/i);
  console.log('✓ scrapeYoutubeSource (charts mode + error surfacing)');
})().catch((e) => { console.error(e); process.exit(1); });

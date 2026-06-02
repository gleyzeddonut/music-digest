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

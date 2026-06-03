const assert = require('assert');
const { CUSTOM_TYPES, BUILTIN_TYPES } = require('../lib/source-types');

// Disjoint
for (const t of CUSTOM_TYPES) assert.ok(!BUILTIN_TYPES.includes(t), `${t} must not be in both sets`);
// Expected membership
assert.ok(CUSTOM_TYPES.includes('youtube'), 'youtube is custom');
assert.ok(CUSTOM_TYPES.includes('reddit'), 'reddit is custom');
assert.ok(BUILTIN_TYPES.includes('apple-charts'), 'apple-charts is built-in');
assert.ok(BUILTIN_TYPES.includes('tiktok') && BUILTIN_TYPES.includes('tokchart'), 'tiktok/tokchart are built-in');
// Exhaustive: union is exactly the 13 known types
const all = [...CUSTOM_TYPES, ...BUILTIN_TYPES].sort();
assert.deepStrictEqual(all, [
  'apple-charts','genius','hypem','html','lastfm','reddit','rss','shazam','spotify-global','spotify-playlist','tiktok','tokchart','youtube'
].sort());
console.log('✓ source-types');

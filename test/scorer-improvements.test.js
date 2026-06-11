const assert = require('assert');
const {
  rankScore, calcVelocityScore, calcEditorialScore, editorialAgeFactor,
  properNounTokens, passesProperNounGuard,
} = require('../processor/scorer');
const { normalizeSummaryBullets } = require('../processor/claude');
const { artistsOverlap, lookupChart, buildChartMap } = require('../processor/digest');

// ── Rank clamping ─────────────────────────────────────────────────────────────
// kworb's Shazam page lists 200 rows against a top-50 scoring window; an
// unclamped rank went negative and erased real signal from other charts.
assert.strictEqual(rankScore(1, 50), 1, 'rank 1 scores full');
assert.strictEqual(rankScore(50, 50), 0, 'last rank in window scores 0');
assert.strictEqual(rankScore(150, 50), 0, 'rank beyond the window must clamp to 0, not go negative');
assert.ok(rankScore(25, 50) > 0 && rankScore(25, 50) < 1);
console.log('✓ rankScore clamps deep ranks at 0');

// ── Velocity: max + corroboration, not mean ──────────────────────────────────
const oneStrong = calcVelocityScore({ geniusTrending: { rank: 1 }, editorialArticles: [] });
const strongPlusMedium = calcVelocityScore({
  geniusTrending: { rank: 1 },
  hypemSignal: { blogs: 5, loved: 20 },
  editorialArticles: [],
});
assert.ok(strongPlusMedium >= oneStrong,
  'adding a corroborating signal must never lower the velocity score');
console.log('✓ velocity rewards corroborating signals instead of averaging them away');

// ── Editorial: age decay + unknown sources count ─────────────────────────────
assert.strictEqual(editorialAgeFactor(new Date().toISOString()), 1.0, 'fresh article full weight');
assert.ok(editorialAgeFactor(new Date(Date.now() - 10 * 86_400_000).toISOString()) <= 0.15,
  'week-old backlog must decay');
assert.strictEqual(editorialAgeFactor(undefined), 0.7, 'unknown date gets middling factor');

const customSourceEntity = {
  editorialArticles: [{ source: 'My Custom Blog', title: 'X drops album', published: new Date().toISOString() }],
};
assert.ok(calcEditorialScore(customSourceEntity) > 0,
  'user-added sources must contribute editorial signal (tier-3 default), not zero');

const freshTier1 = calcEditorialScore({
  editorialArticles: [{ source: 'Pitchfork', title: 'a', published: new Date().toISOString() }],
});
const staleTier1 = calcEditorialScore({
  editorialArticles: [{ source: 'Pitchfork', title: 'a', published: new Date(Date.now() - 10 * 86_400_000).toISOString() }],
});
assert.ok(freshTier1 > staleTier1, 'fresh coverage must outweigh stale coverage from the same source');
console.log('✓ editorial decays with age and credits custom sources');

// ── Proper-noun guard for common-word artist names ───────────────────────────
const toks = properNounTokens('The future of streaming royalties, says Future');
assert.ok(toks.has('future'), 'capitalized "Future" registers as proper noun');
assert.ok(!toks.has('of'), 'lowercase words are not proper nouns');
assert.ok(!toks.has('streaming'), 'lowercase words are not proper nouns');

const futureEntity = { name: 'Future' };
assert.strictEqual(
  passesProperNounGuard('future', futureEntity, properNounTokens('The future of streaming royalties')),
  false, 'lowercase "future" mid-sentence must NOT match the artist Future');
assert.strictEqual(
  passesProperNounGuard('future', futureEntity, properNounTokens('Future announces new mixtape')),
  true, 'capitalized Future must still match');
assert.strictEqual(
  passesProperNounGuard('glaive', { name: 'glaive' }, properNounTokens('glaive shares new single')),
  true, 'lowercase-stylized artists are exempt from the guard');
assert.strictEqual(
  passesProperNounGuard('kendrick lamar', { name: 'Kendrick Lamar' }, new Set()),
  true, 'multi-token names bypass the guard');
console.log('✓ proper-noun guard blocks common-word false positives, keeps stylized names');

// ── Song chart lookup: title-only fallback needs artist agreement ────────────
const chart = buildChartMap([{ title: 'Forever', artist: 'Drake', rank: 3 }]);
assert.strictEqual(
  lookupChart(chart, 'forever|drake', 'forever', 'drake'), 3, 'exact match works');
assert.strictEqual(
  lookupChart(chart, 'forever|noah kahan', 'forever', 'noah kahan'), null,
  'different artist with same title must NOT inherit the chart rank');
assert.strictEqual(
  lookupChart(chart, 'forever|drake ft lil baby', 'forever', 'drake ft lil baby'), 3,
  'collab variants still match via token overlap');
assert.strictEqual(artistsOverlap('drake', 'drake'), true);
assert.strictEqual(artistsOverlap('noah kahan', 'drake'), false);
console.log('✓ title-only chart fallback requires artist agreement');

// ── Summary bullet normalization ─────────────────────────────────────────────
assert.strictEqual(
  normalizeSummaryBullets('- First story\n* Second story\n• Third story'),
  '• First story\n• Second story\n• Third story',
  'dash/asterisk bullets normalize to •');
assert.strictEqual(
  normalizeSummaryBullets('Plain line without a bullet'),
  '• Plain line without a bullet',
  'bulletless lines get a bullet so the UI never renders an empty brief');
console.log('✓ summary bullets normalize to the format the UI/email expect');

console.log('\nAll scorer/digest improvement tests passed');

const assert = require('assert');
const { attachFeature, buildEvidence } = require('../processor/feature');
const { normalizeArtist } = require('../processor/scorer');

function scorerEntry(name) {
  return {
    entity: {
      name,
      editorialArticles: [
        { source: 'Pitchfork', title: 'A review', published: '2026-06-10' },
        { source: 'Stereogum', title: 'News item', published: '2026-06-11' },
        { source: 'Pitchfork', title: 'Another piece', published: '2026-06-11' },
      ],
      redditPosts: [
        { source: 'r/indieheads', title: 'thread', score: 4200, comments: 310 },
        { source: 'r/Music', title: 'thread2', score: 90, comments: 12 },
      ],
      chartPositions: { shazam: 4 },
    },
  };
}

const webIndex = [
  { source: 'Pitchfork', title: 'A review', url: 'https://p4k.example/a', published: '2026-06-10' },
  { source: 'Stereogum', title: 'News item', url: 'https://gum.example/b', published: '2026-06-11' },
];

function makeResult(featureArtist) {
  return {
    artists: [
      { name: 'Mk.gee', tier: 'rising', reason: 'r1' },
      { name: 'Drake', tier: 'breaking', reason: 'r2' },
    ],
    feature: {
      artist: featureArtist,
      title: 'The story in one line',
      body: 'Para one.\\n\\nPara two.',
      related_headline_indices: [0, 1, 99],
    },
  };
}

try {
  // 1 — coverage resolves by index, drops out-of-range, body \n is normalized
  let r = makeResult('Mk.gee');
  attachFeature(r, webIndex, { [normalizeArtist('Mk.gee')]: scorerEntry('Mk.gee') });
  const f = r.artists[0].feature;
  assert.ok(f, 'feature attached to artists[0]');
  assert.strictEqual(f.coverage.length, 2, 'out-of-range index dropped');
  assert.strictEqual(f.coverage[0].url, 'https://p4k.example/a');
  assert.strictEqual(f.body, 'Para one.\n\nPara two.', 'literal \\n normalized');
  assert.strictEqual(r.feature, undefined, 'raw feature blob removed from result');

  // 2 — evidence assembled from scorer entity
  assert.deepStrictEqual(f.evidence.sources, ['Pitchfork', 'Stereogum']);
  assert.strictEqual(f.evidence.reddit.posts, 2);
  assert.strictEqual(f.evidence.reddit.topUps, 4200);
  assert.strictEqual(f.evidence.reddit.topComments, 310);
  // 2 editorial sources + 2 reddit subs + 1 (charted)
  assert.strictEqual(f.evidence.mention_count, 5);
  assert.strictEqual(r.artists[0].mention_count, 5, 'mention_count set on artist');

  // 3 — name mismatch falls back to artists[0]
  r = makeResult('Someone Else');
  attachFeature(r, webIndex, {});
  assert.ok(r.artists[0].feature, 'fallback to artists[0]');
  assert.strictEqual(r.artists[0].feature.evidence, null, 'no scorer entry -> null evidence');

  // 4 — name match attaches to the matching artist, not [0]
  r = makeResult('Drake');
  attachFeature(r, webIndex, {});
  assert.ok(!r.artists[0].feature && r.artists[1].feature, 'attached to named artist');

  // 5 — missing/empty feature or artists is a no-op
  r = { artists: [{ name: 'A' }] };
  attachFeature(r, webIndex, {});
  assert.ok(!r.artists[0].feature);
  r = { artists: [], feature: { artist: 'A', title: 't', body: 'b', related_headline_indices: [] } };
  attachFeature(r, webIndex, {});
  assert.strictEqual(r.feature, undefined);

  // 6 — buildEvidence handles missing entry
  assert.strictEqual(buildEvidence(undefined), null);

  console.log('feature-attach: all tests passed');
} catch (err) {
  console.error('feature-attach: FAIL —', err.message);
  process.exit(1);
}

// Manual integration harness — NOT part of the *.test.js sweep (does live
// network scraping). Runs the real pipeline end-to-end against the dev DB
// (db/digests.db): live scrape, real scorer, real attachFeature, real DB
// save. Only the Claude network call and the Spotify playlist append are
// stubbed (same require.cache pattern as the unit tests) — the Claude stub
// shapes its response from the REAL scored data, including the failure modes
// seen in the 2026-06-11 digest (literal \n separators, missing • on the
// first bullet) so the normalization fixes are exercised end-to-end.
//
// Run: node test/manual-feature-run.js

const assert = require('assert');

let capturedPrompt = null;

require.cache[require.resolve('../processor/claude')] = {
  id: require.resolve('../processor/claude'),
  filename: require.resolve('../processor/claude'),
  loaded: true,
  exports: {
    processWithClaude: async (date, redditData, webData, tiktokData, playlistData, scoredData) => {
      // Build a realistic response from the real scored entities
      const ranked = [...(scoredData?.rising || []), ...(scoredData?.breaking || [])];
      assert.ok(ranked.length > 0, 'scorer produced no ranked artists — cannot shape a realistic response');
      const top = ranked[0].entity.name;
      const second = ranked[1]?.entity.name || top;
      capturedPrompt = { webCount: webData.reduce((n, w) => n + w.items.length, 0) };
      return {
        // literal backslash-n separators + missing • on the first bullet —
        // exactly the 2026-06-11 failure shape
        summary: `${top} is generating cross-source buzz today.\\n• ${second} appears across multiple charts.\\n• A third storyline rounds out the day.`,
        artists: [
          { name: top, tier: ranked[0].tier || 'rising', reason: `${top} shows multi-source signal.` },
          { name: second, tier: 'breaking', reason: `${second} charted this week.` },
        ],
        songs: [],
        headline_indices: [0, 1, 2, 3],
        mentioned_artists: [top, second],
        feature: {
          artist: top,
          title: `${top} is everywhere at once`,
          body: `Para one about ${top}, citing real sources.\\n\\nPara two with numbers.\\n\\nPara three, the outlook.`,
          related_headline_indices: [0, 2, 999],
        },
      };
    },
  },
};

require.cache[require.resolve('../processor/spotify')] = {
  id: require.resolve('../processor/spotify'),
  filename: require.resolve('../processor/spotify'),
  loaded: true,
  exports: {
    appendSongsToPlaylist: async () => ({ playlistUrl: null, added: [], unmatched: [] }),
  },
};

(async () => {
  try {
    const { initDb } = require('../db/init');
    initDb(); // same boot step the server performs (creates/migrates tables, seeds personas+sources)
    const { runDigest } = require('../processor/digest');
    const result = await runDigest({ force: true });
    assert.ok(!result.error, `run failed: ${result.error}`);
    assert.ok(!result.skipped, 'run was skipped despite force:true');

    // Re-read what was actually persisted
    const { getDb } = require('../db/init');
    const row = getDb().prepare('SELECT * FROM digests WHERE date = ? ORDER BY id DESC').get(result.date || new Date().toISOString().split('T')[0]);
    assert.ok(row, 'digest row saved');
    const artists = JSON.parse(row.artists);
    const summary = row.summary;

    // 1 — summary newlines normalized at the source
    assert.ok(!summary.includes('\\n'), 'summary contains no literal backslash-n');
    assert.ok(summary.includes('\n'), 'summary has real newlines');

    // 2 — feature attached to an artist, raw blob not persisted at top level
    const featured = artists.find(a => a.feature);
    assert.ok(featured, 'an artist carries the feature');
    assert.strictEqual(featured.name, artists[0].name, 'feature is on artists[0]');
    const f = featured.feature;
    assert.ok(f.title && f.body, 'feature has title and body');
    assert.ok(!f.body.includes('\\n'), 'feature body newlines normalized');

    // 3 — coverage resolved from real webIndex with URLs; bad index dropped
    assert.ok(Array.isArray(f.coverage), 'coverage is an array');
    assert.ok(f.coverage.length <= 2, 'out-of-range index (999) dropped');
    for (const c of f.coverage) {
      assert.ok(c.source && c.title, 'coverage rows have source+title');
    }

    // 4 — evidence from the real scorer entity
    assert.ok(f.evidence, 'evidence present (artist came from scorer)');
    assert.ok(typeof f.evidence.mention_count === 'number' && f.evidence.mention_count >= 1, 'real mention_count');
    assert.strictEqual(featured.mention_count, f.evidence.mention_count, 'mention_count mirrored on artist');

    console.log('\n── manual feature run: ALL CHECKS PASSED ──');
    console.log(`   artist:    ${featured.name}`);
    console.log(`   title:     ${f.title}`);
    console.log(`   coverage:  ${f.coverage.length} linked (${f.coverage.map(c => c.source).join(', ') || 'none'})`);
    console.log(`   evidence:  ${f.evidence.mention_count} mentions · sources: ${f.evidence.sources.join(', ') || '—'}${f.evidence.reddit ? ` · reddit top ${f.evidence.reddit.topUps}↑` : ''}`);
    console.log(`   summary:   ${summary.split('\n').length} lines, no literal \\n`);
    console.log(`   prompt:    ${capturedPrompt.webCount} web items scraped live`);
    process.exit(0);
  } catch (err) {
    console.error('manual feature run: FAIL —', err.message);
    process.exit(1);
  }
})();

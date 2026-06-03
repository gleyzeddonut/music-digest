const assert = require('assert');
const { titleMentionsArtist } = require('../processor/scorer');

// The original bug: "T.I." normalizes to the key "t i", which as a raw
// substring appears inside tons of unrelated titles ("got it", "that intro"),
// falsely inflating his signal until he surfaces in Featured / Mentioned.
assert.strictEqual(titleMentionsArtist('Got it on repeat all week', 't i'), false,
  '"t i" must NOT match the substring inside "got it"');
assert.strictEqual(titleMentionsArtist('That intro though', 't i'), false,
  '"t i" must NOT match the substring inside "that intro"');
assert.strictEqual(titleMentionsArtist('But it really grew on me', 't i'), false,
  '"t i" must NOT match the substring inside "but it"');
console.log('✓ degenerate "t i" key does not match unrelated titles');

// ...but T.I. should still match when a title genuinely references him.
assert.strictEqual(titleMentionsArtist('T.I. announces new album', 't i'), true,
  'T.I. should match a headline that is actually about him');
console.log('✓ "t i" still matches a real T.I. reference');

// Substring matching also wrongly matched distinct artists; token matching fixes it.
assert.strictEqual(titleMentionsArtist('Drakeo the Ruler shares new single', 'drake'), false,
  '"drake" must NOT match "drakeo"');
assert.strictEqual(titleMentionsArtist('Drake drops surprise album tonight', 'drake'), true,
  '"drake" should match a real Drake headline');
console.log('✓ whole-token matching distinguishes "drake" from "drakeo"');

// Multi-word names and punctuation-symmetric matching still work.
assert.strictEqual(titleMentionsArtist('Kendrick Lamar tops Apple charts', 'kendrick lamar'), true);
assert.strictEqual(titleMentionsArtist('Tyler, the Creator drops album', 'tyler the creator'), true);
console.log('✓ multi-word artist names match across punctuation');

console.log('\nAll scorer-match tests passed.');

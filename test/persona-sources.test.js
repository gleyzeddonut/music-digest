const assert = require('assert');
const { mergeBuiltinIds } = require('../lib/persona-sources');

assert.deepStrictEqual(mergeBuiltinIds([1, 2], [3, 4]), [1, 2, 3, 4]);
assert.deepStrictEqual(mergeBuiltinIds([1, 2, 3], [3, 4]), [1, 2, 3, 4], 'no duplicates');
assert.deepStrictEqual(mergeBuiltinIds([], [5, 6]), [5, 6]);
assert.deepStrictEqual(mergeBuiltinIds(null, [5]), [5], 'tolerates non-array');
assert.deepStrictEqual(mergeBuiltinIds([7], []), [7]);
console.log('✓ persona-sources mergeBuiltinIds');

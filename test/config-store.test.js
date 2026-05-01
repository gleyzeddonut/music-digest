const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Set up a temp directory so we don't need a real Electron environment
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-config-test-'));
const tmpConfig = path.join(tmpDir, 'config.json');

const { getConfig, setConfig, _setConfigPath } = require('../electron/config-store');
_setConfigPath(tmpConfig);

// Test 1: missing key returns null
assert.strictEqual(getConfig('digest_to'), null, 'missing key should return null');
console.log('✓ getConfig returns null for missing key');

// Test 2: setConfig then getConfig roundtrip
setConfig('digest_to', 'test@example.com');
assert.strictEqual(getConfig('digest_to'), 'test@example.com', 'should return stored value');
console.log('✓ setConfig/getConfig roundtrip works');

// Test 3: second getConfig reads from disk (not memory)
delete require.cache[require.resolve('../electron/config-store')];
const { getConfig: gc2, _setConfigPath: scp2 } = require('../electron/config-store');
scp2(tmpConfig);
assert.strictEqual(gc2('digest_to'), 'test@example.com', 'value should persist on disk');
console.log('✓ value persists across module reloads');

// Test 4: setConfig with null removes the key
const { setConfig: sc2, getConfig: gc3, _setConfigPath: scp3 } = (() => {
  delete require.cache[require.resolve('../electron/config-store')];
  const m = require('../electron/config-store');
  m._setConfigPath(tmpConfig);
  return m;
})();
sc2('digest_to', null);
assert.strictEqual(gc3('digest_to'), null, 'null value should remove key');
console.log('✓ setConfig(key, null) removes key');

// Cleanup
fs.rmSync(tmpDir, { recursive: true });
console.log('\nAll config-store tests passed ✓');

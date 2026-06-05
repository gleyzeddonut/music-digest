const assert = require('assert');

// db/init's better-sqlite3 is built for Electron's ABI, not system Node, so we
// stub db/init with a Map-backed fake DB (mirroring the prepared statements
// connectFromProviderTokens uses) BEFORE requiring spotify.js. This also keeps
// the test free of the native module entirely.
const store = new Map();
const fakeDb = {
  prepare(sql) {
    return {
      run(...args) {
        if (sql.startsWith('INSERT OR REPLACE INTO settings')) store.set(args[0], args[1]);
        else if (sql.includes("key = 'spotify_playlist_id'")) store.delete('spotify_playlist_id');
        else if (sql.includes("key LIKE 'spotify_playlist_id_%'")) {
          for (const k of [...store.keys()]) if (k.startsWith('spotify_playlist_id_')) store.delete(k);
        }
      },
      get(...args) {
        if (sql.startsWith('SELECT value FROM settings')) {
          const v = store.get(args[0]);
          return v === undefined ? undefined : { value: v };
        }
        return undefined;
      },
    };
  },
};
require.cache[require.resolve('../db/init')] = {
  id: require.resolve('../db/init'),
  filename: require.resolve('../db/init'),
  loaded: true,
  exports: { getDb: () => fakeDb },
};

delete require.cache[require.resolve('../processor/spotify')];
const spotify = require('../processor/spotify');

const get = (k) => store.get(k);

(function run() {
  // A stale playlist id from a previous account must be cleared on connect.
  store.set('spotify_playlist_id', 'OLD');
  store.set('spotify_playlist_id_2', 'OLD2');

  const ok = spotify.connectFromProviderTokens('ACCESS_X', 'REFRESH_X', 3600);
  assert.strictEqual(ok, true, 'returns true when an access token is provided');
  assert.strictEqual(get('spotify_access_token'), 'ACCESS_X');
  assert.strictEqual(get('spotify_refresh_token'), 'REFRESH_X');
  assert.ok(Number(get('spotify_token_expires_at')) > Date.now(), 'expiry is in the future');
  assert.strictEqual(get('spotify_playlist_id'), undefined, 'stale global playlist id cleared');
  assert.strictEqual(get('spotify_playlist_id_2'), undefined, 'stale per-persona playlist id cleared');
  console.log('✓ persists tokens and clears stale playlist ids');

  // Spotify omits the refresh token on re-auth — keep the stored one.
  const ok2 = spotify.connectFromProviderTokens('ACCESS_Y', null, 3600);
  assert.strictEqual(ok2, true);
  assert.strictEqual(get('spotify_access_token'), 'ACCESS_Y');
  assert.strictEqual(get('spotify_refresh_token'), 'REFRESH_X', 'kept existing refresh token');
  console.log('✓ missing provider_refresh_token preserves the stored one');

  // No access token → no-op, returns false.
  assert.strictEqual(spotify.connectFromProviderTokens(null, null, 3600), false);
  console.log('✓ returns false with no access token');

  console.log('\nspotify-provider-connect test passed.');
})();

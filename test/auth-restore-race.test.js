const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Reproduces the "re-login every launch" race: on boot, restore() refreshes the
// persisted token asynchronously. The /api/auth/status route must revive the
// session (via getAccessToken) before reporting status, or the renderer's first
// check wins the race and wrongly shows the login screen.

const AUTH_FILE = path.join(__dirname, '..', '.auth.json'); // non-electron dev fallback
let created = false;

// Stub Supabase Auth: a refresh_token grant returns a fresh, valid session.
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('token?grant_type=refresh_token')) {
    return {
      ok: true,
      json: async () => ({
        access_token: 'ACCESS_NEW',
        refresh_token: 'REFRESH_NEW',
        expires_in: 3600,
        user: { email: 'fan@example.com' },
      }),
    };
  }
  throw new Error(`unexpected fetch: ${url}`);
};

(async () => {
  try {
    // A previous launch left a persisted refresh token on disk.
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ refresh_token: 'REFRESH_OLD' }));
    created = true;

    delete require.cache[require.resolve('../auth-session')];
    const auth = require('../auth-session');

    // Simulate boot: restore() kicks off the async refresh but is NOT awaited,
    // exactly as index.js does on server start.
    const restorePromise = auth.restore();

    // The old synchronous status check could observe this mid-refresh and return
    // authenticated:false — the bug. The fixed route awaits getAccessToken first:
    await auth.getAccessToken();
    const status = auth.getStatus();

    assert.strictEqual(status.authenticated, true,
      'status must report authenticated after reviving the persisted session');
    assert.strictEqual(status.email, 'fan@example.com',
      'revived session should carry the user email');
    console.log('✓ status check revives a persisted session despite the boot race');

    await restorePromise; // let the in-flight restore settle
    console.log('\nauth-restore-race test passed.');
  } finally {
    global.fetch = realFetch;
    if (created) fs.unlinkSync(AUTH_FILE);
  }
})().catch((err) => { console.error(err); process.exit(1); });

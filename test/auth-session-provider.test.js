const assert = require('assert');

// Stub the Spotify module so we can assert the handoff without a DB / native module.
let captured = null;
require.cache[require.resolve('../processor/spotify')] = {
  id: require.resolve('../processor/spotify'),
  filename: require.resolve('../processor/spotify'),
  loaded: true,
  exports: {
    connectFromProviderTokens: (a, r, e) => { captured = { a, r, e }; return true; },
  },
};

// Stub Supabase Auth /user lookup (email resolution).
const realFetch = global.fetch;
global.fetch = async (url) => {
  if (String(url).endsWith('/auth/v1/user')) {
    return { ok: true, json: async () => ({ email: 'fan@example.com' }) };
  }
  throw new Error(`unexpected fetch: ${url}`);
};

(async () => {
  try {
    delete require.cache[require.resolve('../auth-session')];
    const auth = require('../auth-session');

    // With provider tokens: session established AND Spotify handed off.
    const status = await auth.setSessionFromTokens('ACC', 'REF', 3600, 'PACC', 'PREF');
    assert.strictEqual(status.authenticated, true, 'session established');
    assert.strictEqual(status.email, 'fan@example.com', 'email resolved');
    assert.deepStrictEqual(captured, { a: 'PACC', r: 'PREF', e: 3600 }, 'provider tokens handed to Spotify');
    console.log('✓ provider tokens are persisted via Spotify on sign-in');

    // Without provider tokens (email-confirmation deep link): no Spotify call.
    captured = null;
    await auth.signOut().catch(() => {});
    await auth.setSessionFromTokens('ACC2', 'REF2', 3600);
    assert.strictEqual(captured, null, 'no Spotify handoff when provider tokens absent');
    console.log('✓ email-confirmation deep link does not touch Spotify');

    console.log('\nauth-session-provider test passed.');
  } finally {
    global.fetch = realFetch;
    await require('../auth-session').signOut().catch(() => {});
  }
})().catch((err) => { console.error(err); process.exit(1); });

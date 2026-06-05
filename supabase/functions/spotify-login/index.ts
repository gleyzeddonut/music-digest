// "Sign in with Spotify" — server-side, so we can keep email/password
// confirmation ON while still letting Spotify users in. Supabase's built-in
// Spotify provider hard-rejects Spotify accounts because Spotify never returns
// an `email_verified` flag. Instead we run the OAuth ourselves and create the
// user as PRE-CONFIRMED via the service role, then mint a Supabase session.
//
// Unauthenticated by design (there is no session yet at login) — deploy with
// verify_jwt = false. The real gate is the single-use Spotify authorization
// code, which requires completing Spotify OAuth (a whitelisted account while the
// Spotify app is in Development Mode).

// CORS + json inlined (rather than importing ../_shared/auth.ts) so this
// function deploys as a single self-contained file.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTH_URL  = 'https://accounts.spotify.com/authorize'
const ME_URL    = 'https://api.spotify.com/v1/me'
const SCOPES    = 'playlist-modify-public playlist-modify-private playlist-read-private streaming user-read-private user-read-email user-modify-playback-state user-read-playback-state'

function spotifyCreds() {
  return btoa(`${Deno.env.get('SPOTIFY_CLIENT_ID')}:${Deno.env.get('SPOTIFY_CLIENT_SECRET')}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  try {
    const { action, code, redirect_uri } = await req.json()

    // 1) Build the Spotify authorize URL (state=login distinguishes this from
    //    the playlist-connect flow, which shares the same loopback callback).
    if (action === 'auth-url') {
      const params = new URLSearchParams({
        client_id:     Deno.env.get('SPOTIFY_CLIENT_ID') ?? '',
        response_type: 'code',
        redirect_uri:  redirect_uri ?? '',
        scope:         SCOPES,
        state:         'login',
      })
      return json({ url: `${AUTH_URL}?${params}` })
    }

    // 2) Exchange the code, provision a confirmed user, and mint a session.
    if (action === 'exchange') {
      if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server misconfigured' }, 500)

      // a. Spotify authorization code → Spotify tokens
      const tokRes = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { Authorization: `Basic ${spotifyCreds()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri }),
      })
      if (!tokRes.ok) return json({ error: `Spotify token exchange failed (${tokRes.status})` }, 400)
      const tok = await tokRes.json()

      // b. Spotify profile → email (the identity we key the account on)
      const meRes = await fetch(ME_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } })
      if (!meRes.ok) return json({ error: 'Could not read Spotify profile' }, 400)
      const me = await meRes.json()
      const email = String(me.email ?? '').trim().toLowerCase()
      if (!email) return json({ error: 'Your Spotify account has no email on file.' }, 400)

      const adminHeaders = {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json',
      }

      // c. Create the user as already-confirmed. 422 = already exists → fine.
      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method:  'POST',
        headers: adminHeaders,
        body:    JSON.stringify({ email, email_confirm: true }),
      })
      if (!createRes.ok && createRes.status !== 422) {
        return json({ error: `Could not provision user: ${await createRes.text()}` }, 500)
      }

      // d. Mint a real session: admin magiclink → verify the hashed token.
      const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method:  'POST',
        headers: adminHeaders,
        body:    JSON.stringify({ type: 'magiclink', email }),
      })
      if (!linkRes.ok) return json({ error: `Could not generate session link: ${await linkRes.text()}` }, 500)
      const link = await linkRes.json()
      const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token
      if (!tokenHash) return json({ error: 'No token hash from generate_link' }, 500)

      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method:  'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
      })
      if (!verifyRes.ok) return json({ error: `Could not establish session: ${await verifyRes.text()}` }, 500)
      const session = await verifyRes.json()
      if (!session?.access_token || !session?.refresh_token) {
        return json({ error: 'Session minting returned no tokens' }, 500)
      }

      return json({
        access_token:           session.access_token,
        refresh_token:          session.refresh_token,
        expires_in:             session.expires_in,
        provider_token:         tok.access_token,
        provider_refresh_token: tok.refresh_token ?? null,
        provider_expires_in:    tok.expires_in ?? null,
        email,
      })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

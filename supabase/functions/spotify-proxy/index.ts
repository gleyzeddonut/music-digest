const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTH_URL  = 'https://accounts.spotify.com/authorize'
const SCOPES    = 'playlist-modify-public playlist-modify-private playlist-read-private'

function creds() {
  return btoa(`${Deno.env.get('SPOTIFY_CLIENT_ID')}:${Deno.env.get('SPOTIFY_CLIENT_SECRET')}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { action, code, refresh_token, redirect_uri } = await req.json()

    if (action === 'auth-url') {
      const params = new URLSearchParams({
        client_id:     Deno.env.get('SPOTIFY_CLIENT_ID') ?? '',
        response_type: 'code',
        redirect_uri:  redirect_uri ?? '',
        scope:         SCOPES,
        state:         'music-digest',
      })
      return new Response(JSON.stringify({ url: `${AUTH_URL}?${params}` }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'exchange') {
      const res = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { Authorization: `Basic ${creds()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri }),
      })
      const text = await res.text()
      return new Response(text, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (action === 'refresh') {
      const res = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { Authorization: `Basic ${creds()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({ grant_type: 'refresh_token', refresh_token }),
      })
      const text = await res.text()
      return new Response(text, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

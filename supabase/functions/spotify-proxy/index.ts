import { CORS, json, requireUser } from '../_shared/auth.ts'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTH_URL  = 'https://accounts.spotify.com/authorize'
const SCOPES    = 'playlist-modify-public playlist-modify-private playlist-read-private streaming user-read-private user-read-email user-modify-playback-state user-read-playback-state'

function creds() {
  return btoa(`${Deno.env.get('SPOTIFY_CLIENT_ID')}:${Deno.env.get('SPOTIFY_CLIENT_SECRET')}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

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
      return json({ url: `${AUTH_URL}?${params}` })
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

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

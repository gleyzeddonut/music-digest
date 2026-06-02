import { CORS, json, requireUser } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  try {
    const params = await req.json()  // pass through all Last.fm API params
    const url = new URL('https://ws.audioscrobbler.com/2.0/')
    url.searchParams.set('api_key', Deno.env.get('LASTFM_API_KEY') ?? '')
    url.searchParams.set('format', 'json')
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    }

    const res = await fetch(url.toString())
    const data = await res.json()
    return json(data, res.status)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

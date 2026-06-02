import { CORS, json, requireUser, enforceRateLimit } from '../_shared/auth.ts'

// Only the endpoints the app actually uses. The previous version concatenated a
// caller-supplied `path` straight into the URL, so `path: "@evil.com/"` rewrote
// the host and exfiltrated GENIUS_API_KEY (sent in the Authorization header) to
// an attacker. Allowlisting the path kills that SSRF.
const ALLOWED_PATHS = new Set(['/search'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const limited = await enforceRateLimit(auth.user.id, 'genius', 120, 3600)
  if (limited) return limited

  try {
    const { path, params } = await req.json()  // e.g. { path: '/search', params: { q: 'artist' } }
    if (typeof path !== 'string' || !ALLOWED_PATHS.has(path)) {
      return json({ error: 'Unsupported path' }, 400)
    }

    // Build from a fixed base so the host can never be overridden.
    const url = new URL(`https://api.genius.com${path}`)
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${Deno.env.get('GENIUS_API_KEY')}` },
    })
    const data = await res.json()
    return json(data, res.status)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

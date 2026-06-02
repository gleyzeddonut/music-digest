import { CORS, json, requireUser, enforceRateLimit } from '../_shared/auth.ts'

const MAX_BODY = 1_000_000 // 1 MB — generous for a digest prompt, blocks abuse

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const limited = await enforceRateLimit(auth.user.id, 'claude', 30, 3600)
  if (limited) return limited

  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY) return json({ error: 'Request too large' }, 413)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: raw,
    })
    const data = await res.json()
    return json(data, res.status)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

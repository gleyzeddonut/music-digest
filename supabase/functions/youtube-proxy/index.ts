import { CORS, json, requireUser } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  try {
    const key = Deno.env.get('YOUTUBE_API_KEY') ?? ''
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet,statistics')
    url.searchParams.set('chart', 'mostPopular')
    url.searchParams.set('videoCategoryId', '10')
    url.searchParams.set('regionCode', 'US')
    url.searchParams.set('maxResults', '50')
    url.searchParams.set('key', key)

    const res = await fetch(url.toString())
    const data = await res.json()
    return json(data, res.status)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

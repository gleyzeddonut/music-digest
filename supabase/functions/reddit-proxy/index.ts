import { CORS, json, requireUser, enforceRateLimit } from '../_shared/auth.ts'

// Reddit blocks unauthenticated .json/.rss requests from datacenter IPs with 403.
// This proxy uses app-only OAuth (client_credentials) so listings come back with
// real upvote/comment counts, which the signal scorer needs. Secrets live here,
// never in the client. Set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET from a
// "script"-type app at https://www.reddit.com/prefs/apps.

const VALID_SORTS = new Set(['hot', 'rising', 'new', 'top-day', 'top-week', 'top-month'])
const USER_AGENT = 'web:music-digest:1.6.0 (by /u/musicdigest)'
const LIMIT = 25

// Module-scope token cache, reused across warm invocations to avoid a token
// round-trip per subreddit. Reddit app tokens last ~1h.
let cachedToken: { value: string; expires: number } | null = null

async function getAppToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken && cachedToken.expires > Date.now() + 60_000) {
    return cachedToken.value
  }
  const id = Deno.env.get('REDDIT_CLIENT_ID')
  const secret = Deno.env.get('REDDIT_CLIENT_SECRET')
  if (!id || !secret) return null

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  if (!data?.access_token) return null

  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

function listingPath(slug: string, sort: string): string {
  if (sort.startsWith('top-')) {
    const t = sort.split('-')[1]
    return `/r/${slug}/top?limit=${LIMIT}&t=${t}&raw_json=1`
  }
  return `/r/${slug}/${sort}?limit=${LIMIT}&raw_json=1`
}

async function fetchListing(slug: string, sort: string): Promise<Response> {
  let token = await getAppToken()
  if (!token) return json({ error: 'Reddit not configured' }, 503)

  let res = await fetch(`https://oauth.reddit.com${listingPath(slug, sort)}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
  })
  // Token expired/revoked mid-cache — refresh once and retry.
  if (res.status === 401) {
    token = await getAppToken(true)
    if (!token) return json({ error: 'Reddit not configured' }, 503)
    res = await fetch(`https://oauth.reddit.com${listingPath(slug, sort)}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
    })
  }
  if (!res.ok) return json({ error: `Reddit ${res.status}` }, res.status)
  return json(await res.json(), 200)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const limited = await enforceRateLimit(auth.user.id, 'reddit', 240, 3600)
  if (limited) return limited

  try {
    const { slug, sort = 'hot' } = await req.json()

    // SSRF / input hardening: only well-formed subreddit names and known sorts.
    // The slug is interpolated into a fixed oauth.reddit.com path; this regex
    // forbids slashes, dots, and query characters that could redirect the fetch.
    if (typeof slug !== 'string' || !/^[A-Za-z0-9_]{2,40}$/.test(slug)) {
      return json({ error: 'Invalid subreddit' }, 400)
    }
    const safeSort = VALID_SORTS.has(sort) ? sort : 'hot'

    return await fetchListing(slug, safeSort)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

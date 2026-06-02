// Shared helpers for all edge functions: CORS, JSON responses, and — most
// importantly — requireUser(), which rejects any request that isn't from a
// real signed-in Supabase user. The public anon/publishable key is NOT a user,
// so it fails this check; that's what stops the open-relay / open-proxy abuse.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Returns the authenticated user, or a 401 Response to return immediately.
// Verifies the bearer token against Supabase Auth (GET /auth/v1/user). A real
// user access token resolves to a user with role "authenticated"; the anon key
// resolves to no user (401). Usage:
//   const auth = await requireUser(req)
//   if (auth instanceof Response) return auth
//   const { user } = auth
export async function requireUser(req: Request): Promise<{ user: any } | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url) return json({ error: 'Server misconfigured' }, 500)

  let res: Response
  try {
    res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    })
  } catch {
    return json({ error: 'Unauthorized' }, 401)
  }
  if (!res.ok) return json({ error: 'Unauthorized' }, 401)

  const user = await res.json().catch(() => null)
  if (!user?.id || !user?.email || user?.role === 'anon') {
    return json({ error: 'Unauthorized' }, 401)
  }
  return { user }
}

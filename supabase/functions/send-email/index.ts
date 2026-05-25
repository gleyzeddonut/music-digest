import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { to, subject, html } = await req.json()
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing to/subject/html' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const client = new SmtpClient()
    await client.connectTLS({
      hostname: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
      port: Number(Deno.env.get('SMTP_PORT') ?? 465),
      username: Deno.env.get('SMTP_USER') ?? '',
      password: Deno.env.get('SMTP_PASS') ?? '',
    })

    await client.send({
      from: Deno.env.get('SMTP_FROM') ?? Deno.env.get('SMTP_USER') ?? '',
      to,
      subject,
      content: 'This digest requires an HTML-capable email client.',
      html,
    })

    await client.close()
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

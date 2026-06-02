import nodemailer from 'npm:nodemailer@6.9.16'
import { CORS, json, requireUser } from '../_shared/auth.ts'

const MAX_HTML = 1_000_000 // 1 MB

// Sends a digest email via SMTP (Gmail by default). Credentials live only in
// this function's Supabase secrets — never in the shipped client app.
//   SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465),
//   SMTP_USER, SMTP_PASS (Gmail App Password), SMTP_FROM (defaults to SMTP_USER)
//
// SECURITY: the recipient is ALWAYS the signed-in user's own account email,
// taken from the verified auth token. Any `to` in the request body is ignored,
// so this can never be used as an open relay to mail arbitrary addresses.
//
// Uses npm:nodemailer because the deno.land SMTP libs are incompatible with the
// Supabase edge runtime: smtp@0.7.0 calls the removed `Deno.writeAll`, and
// denomailer crashes the worker at boot.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const to = auth.user.email // recipient is the authenticated user, never client-chosen

  try {
    const { subject, html } = await req.json()
    if (!subject || !html) return json({ error: 'Missing subject/html' }, 400)
    if (typeof html !== 'string' || html.length > MAX_HTML) {
      return json({ error: 'Invalid or oversized html' }, 413)
    }

    const user = Deno.env.get('SMTP_USER') ?? ''
    const port = Number(Deno.env.get('SMTP_PORT') ?? 465)

    const transporter = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
      port,
      secure: port === 465, // implicit TLS on 465, STARTTLS on 587
      auth: { user, pass: Deno.env.get('SMTP_PASS') ?? '' },
    })

    await transporter.sendMail({
      from: Deno.env.get('SMTP_FROM') || user,
      to,
      subject: String(subject),
      html,
    })

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

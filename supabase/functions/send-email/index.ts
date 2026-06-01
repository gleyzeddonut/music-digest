import nodemailer from 'npm:nodemailer@6.9.16'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sends a digest email via SMTP (Gmail by default). Credentials live only in
// this function's Supabase secrets — never in the shipped client app.
//   SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465),
//   SMTP_USER, SMTP_PASS (Gmail App Password), SMTP_FROM (defaults to SMTP_USER)
//
// Uses npm:nodemailer because the deno.land SMTP libs are incompatible with the
// Supabase edge runtime: smtp@0.7.0 calls the removed `Deno.writeAll`, and
// denomailer crashes the worker at boot.
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
      subject,
      html,
    })

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

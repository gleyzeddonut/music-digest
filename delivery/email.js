const nodemailer = require('nodemailer');
const config = require('../config');
const { getDb } = require('../db/init');
const { url: supabaseUrl, anonKey } = require('../supabase-client');

function getDigestTo() {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get('digest_to')?.value || '';
}

function getSmtpConfig() {
  const db = getDb();
  const dbGet = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  const port = parseInt(dbGet('smtp_port') || config.SMTP_PORT, 10);
  return {
    host: dbGet('smtp_host') || config.SMTP_HOST,
    port,
    user: dbGet('smtp_user') || config.SMTP_USER,
    pass: dbGet('smtp_pass') || config.SMTP_PASS,
  };
}

function createTransport() {
  const { host, port, user, pass } = getSmtpConfig();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildHtml(date, result, playlistUrl, added, unmatched) {
  const { summary, artists = [], songs = [], headlines = [] } = result;

  const artistsHtml = artists.map(a => `
    <div style="border-left: 3px solid #e76f51; padding: 8px 14px; margin: 10px 0; background: #f9f6f3;">
      <strong style="color: #111; font-size: 15px;">${escHtml(a.name)}</strong>
      <p style="color: #555; margin: 4px 0 0; font-size: 13px;">${escHtml(a.reason)}</p>
    </div>`).join('');

  const songsHtml = songs.map((s, i) => {
    const wasAdded = added.find(a => a.title?.toLowerCase() === s.title?.toLowerCase());
    const badge = wasAdded
      ? `<span style="background:#1DB954;color:#000;font-size:10px;padding:2px 6px;border-radius:3px;margin-left:8px;">ADDED</span>`
      : unmatched.find(u => u.title === s.title)
        ? `<span style="background:#555;color:#ccc;font-size:10px;padding:2px 6px;border-radius:3px;margin-left:8px;">NOT FOUND</span>`
        : '';
    return `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px 12px; color: #999; font-size: 13px;">${i + 1}</td>
      <td style="padding: 8px 4px; color: #111; font-size: 14px;">${escHtml(s.title)}${badge}</td>
      <td style="padding: 8px 12px; color: #555; font-size: 13px;">${escHtml(s.artist)}</td>
    </tr>`;
  }).join('');

  const headlinesHtml = headlines.slice(0, 8).map(h => {
    const link = h.url
      ? `<a href="${escHtml(h.url)}" style="color:#e76f51;text-decoration:none;">${escHtml(h.title)}</a>`
      : escHtml(h.title);
    return `<li style="margin:6px 0;color:#222;font-size:13px;">${link} <span style="color:#888;font-size:11px;">[${escHtml(h.source)}]</span></li>`;
  }).join('');

  const spotifySection = playlistUrl
    ? `<div style="text-align:center;margin:30px 0;">
        <a href="${escHtml(playlistUrl)}" style="background:#1DB954;color:#000;font-weight:bold;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px;">
          Open on Spotify →
        </a>
        <p style="color:#888;font-size:11px;margin-top:8px;">${added.length} track${added.length !== 1 ? 's' : ''} added today</p>
      </div>`
    : '';

  const summaryParagraphs = (summary || '').split('\n\n').map(p =>
    `<p style="color:#333;line-height:1.7;margin:0 0 14px;">${escHtml(p)}</p>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <div style="border-bottom:2px solid #e76f51;padding-bottom:20px;margin-bottom:30px;">
      <div style="font-size:11px;color:#e76f51;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Daily Digest</div>
      <h1 style="color:#111;font-size:28px;font-weight:900;margin:0;line-height:1.2;">Music Digest</h1>
      <div style="color:#888;font-size:13px;margin-top:6px;">${formatDate(date)}</div>
    </div>

    <div style="margin-bottom:32px;">
      ${summaryParagraphs}
    </div>

    ${artists.length > 0 ? `
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;color:#e76f51;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;">Artists</div>
      ${artistsHtml}
    </div>` : ''}

    ${songs.length > 0 ? `
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;color:#e76f51;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;">Songs to Check</div>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;">
        <tbody>${songsHtml}</tbody>
      </table>
    </div>` : ''}

    ${spotifySection}

    ${headlines.length > 0 ? `
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;color:#e76f51;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;">Headlines</div>
      <ul style="padding-left:18px;margin:0;">${headlinesHtml}</ul>
    </div>` : ''}

    <div style="border-top:1px solid #eee;padding-top:20px;text-align:center;">
      <span style="color:#ccc;font-size:11px;">Music Digest</span>
    </div>

  </div>
</body>
</html>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendViaSupabase(to, subject, html) {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase send-email ${res.status}: ${body}`);
  }
}

async function sendDigestEmail(date, result, playlistUrl, added = [], unmatched = []) {
  const to = getDigestTo();
  if (!to) {
    console.warn('[email] No recipient configured — skipping email');
    return false;
  }

  const artistNames = (result.artists || []).slice(0, 3).map(a => a.name).join(', ');
  const extra = (result.artists?.length || 0) > 3 ? ` + ${result.artists.length - 3} more` : '';
  const subject = `Music Digest — ${formatDate(date)}${artistNames ? `: ${artistNames}${extra}` : ''}`;
  const html = buildHtml(date, result, playlistUrl, added, unmatched);

  // Try centralized Supabase sender first (production path)
  try {
    await sendViaSupabase(to, subject, html);
    console.log(`[email] Digest sent to ${to} via Supabase`);
    return true;
  } catch (err) {
    console.warn('[email] Supabase send failed, trying local SMTP:', err.message);
  }

  // Fall back to local SMTP (dev / self-hosted path)
  const smtp = getSmtpConfig();
  if (!smtp.user || !smtp.pass) {
    console.warn('[email] No local SMTP credentials — email not sent');
    return false;
  }
  try {
    const transport = createTransport();
    await transport.sendMail({
      from: config.DIGEST_FROM || smtp.user,
      to,
      subject,
      html,
    });
    console.log(`[email] Digest sent to ${to} via local SMTP`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err.message, err.code || '', err.response || '');
    return false;
  }
}

async function verifySmtp() {
  const smtp = getSmtpConfig();
  if (!smtp.user || !smtp.pass) return;
  try {
    await createTransport().verify();
    console.log(`[email] SMTP ready — ${config.SMTP_USER}`);
  } catch (err) {
    console.warn(`[email] SMTP check failed: ${err.message}`);
  }
}

// Sends one email combining all persona digests that ran today.
// entries: [{ persona, result: { artists, songs, headlines, summary }, playlistUrl, added, unmatched }]
async function sendCombinedDigestEmail(entries) {
  const to = getDigestTo();
  if (!to) { console.warn('[email] No recipient configured — skipping email'); return false; }
  if (!entries.length) return false;

  const date = entries[0].result.date || new Date().toISOString().slice(0, 10);
  const isMulti = entries.length > 1;

  // Subject: top artists across all personas
  const allArtists = entries.flatMap(e => (e.result.artists || []).slice(0, 2).map(a => a.name));
  const uniqueArtists = [...new Set(allArtists)].slice(0, 3);
  const extra = allArtists.length > 3 ? ` + more` : '';
  const subject = `Music Digest — ${formatDate(date)}${uniqueArtists.length ? `: ${uniqueArtists.join(', ')}${extra}` : ''}`;

  let html;
  if (!isMulti) {
    const { result, playlistUrl, added = [], unmatched = [] } = entries[0];
    html = buildHtml(date, result, playlistUrl, added, unmatched);
  } else {
    // Build a section per persona, separated by a divider
    const sections = entries.map(({ persona, result, playlistUrl, added = [], unmatched = [] }) => {
      const inner = buildHtml(date, result, playlistUrl, added, unmatched);
      // Extract body content (between <body> tags if present, else use full html)
      const bodyMatch = inner.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const content = bodyMatch ? bodyMatch[1] : inner;
      return `
        <div style="margin-bottom:40px">
          <div style="max-width:600px;margin:0 auto;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#e76f51;padding:0 20px 8px;border-bottom:1px solid #eee">${escHtml(persona.name)}</div>
          ${content}
        </div>`;
    }).join('<div style="max-width:600px;margin:0 auto;height:1px;background:#eee"></div>');

    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#ffffff;color:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;padding:24px 0;margin:0">${sections}</body></html>`;
  }

  try {
    await sendViaSupabase(to, subject, html);
    console.log(`[email] Combined digest sent to ${to} via Supabase`);
    return true;
  } catch (err) {
    console.warn('[email] Supabase send failed, trying local SMTP:', err.message);
  }

  const smtp = getSmtpConfig();
  if (!smtp.user || !smtp.pass) { console.warn('[email] No local SMTP credentials — email not sent'); return false; }
  try {
    await createTransport().sendMail({ from: config.DIGEST_FROM || smtp.user, to, subject, html });
    console.log(`[email] Combined digest sent to ${to} via local SMTP`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return false;
  }
}

module.exports = { sendDigestEmail, sendCombinedDigestEmail, verifySmtp };

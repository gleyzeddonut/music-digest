const nodemailer = require('nodemailer');
const config = require('../config');
const { getDb } = require('../db/init');

function getDigestTo() {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get('digest_to')?.value || config.DIGEST_TO;
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

  const summaryParagraphs = summary.split('\n\n').map(p =>
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

async function sendDigestEmail(date, result, playlistUrl, added = [], unmatched = []) {
  if (!config.SMTP_USER || !config.SMTP_PASS) {
    console.warn('[email] SMTP credentials not set — skipping email');
    return false;
  }

  const artistNames = (result.artists || []).slice(0, 3).map(a => a.name).join(', ');
  const extra = (result.artists?.length || 0) > 3 ? ` + ${result.artists.length - 3} more` : '';
  const subject = `Music Digest — ${formatDate(date)}${artistNames ? `: ${artistNames}${extra}` : ''}`;

  const html = buildHtml(date, result, playlistUrl, added, unmatched);

  try {
    const transport = createTransport();
    await transport.sendMail({
      from: config.DIGEST_FROM,
      to: getDigestTo(),
      subject,
      html,
    });
    console.log(`[email] Digest sent to ${getDigestTo()}`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err.message, err.code || '', err.response || '');
    return false;
  }
}

async function verifySmtp() {
  if (!config.SMTP_USER || !config.SMTP_PASS) return;
  try {
    await createTransport().verify();
    console.log(`[email] SMTP ready — ${config.SMTP_USER}`);
  } catch (err) {
    console.warn(`[email] SMTP check failed: ${err.message}`);
  }
}

module.exports = { sendDigestEmail, verifySmtp };

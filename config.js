require('dotenv').config();

if (process.versions.electron) {
  try {
    const { getConfig } = require('./electron/config-store');
    const digestTo = getConfig('digest_to');
    if (digestTo) process.env.DIGEST_TO = digestTo;
  } catch (_) {}
}

// Single source of truth for the port. The Spotify redirect URI MUST point at
// the same port the server listens on — otherwise Spotify redirects to a dead
// port after the user authorizes (e.g. the packaged app, which bundles no .env).
// 3001 is the port registered in the Spotify developer dashboard.
const PORT = parseInt(process.env.PORT || '3001', 10);

module.exports = {
  PORT,
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${PORT}/auth/spotify/callback`,
  SMTP_HOST:   process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT:   parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER:   process.env.SMTP_USER || '',
  SMTP_PASS:   process.env.SMTP_PASS || '',
  DIGEST_TO:   process.env.DIGEST_TO || '',
  DIGEST_FROM: process.env.DIGEST_FROM || '',
  SEND_TIME:   process.env.SEND_TIME || '08:00',
  TIMEZONE:    process.env.TIMEZONE || 'America/New_York',
};

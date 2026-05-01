require('dotenv').config();

// In Electron context, user-configurable values come from the config store.
// This runs after main.js has already loaded the bundled .env, so process.env
// already has SMTP, Spotify, and other shared credentials set.
if (process.versions.electron) {
  try {
    const { getConfig } = require('./electron/config-store');
    const digestTo = getConfig('digest_to');
    const claudeKey = getConfig('claude_api_key');
    if (digestTo) process.env.DIGEST_TO = digestTo;
    if (claudeKey) process.env.CLAUDE_API_KEY = claudeKey;
  } catch (_) {}
}

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

module.exports = {
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY || '',
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET || '',
  LASTFM_API_KEY: process.env.LASTFM_API_KEY || '',
  GENIUS_API_KEY: process.env.GENIUS_API_KEY || '',
  // In Electron, SPOTIFY credentials come from the bundled .env loaded by main.js.
  // In plain node mode, they must be in the local .env.
  SPOTIFY_CLIENT_ID: process.versions.electron ? (process.env.SPOTIFY_CLIENT_ID || '') : required('SPOTIFY_CLIENT_ID'),
  SPOTIFY_CLIENT_SECRET: process.versions.electron ? (process.env.SPOTIFY_CLIENT_SECRET || '') : required('SPOTIFY_CLIENT_SECRET'),
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/auth/spotify/callback',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.mail.yahoo.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  DIGEST_TO: process.env.DIGEST_TO || '',
  DIGEST_FROM: process.env.DIGEST_FROM || '',
  SEND_TIME: process.env.SEND_TIME || '08:00',
  TIMEZONE: process.env.TIMEZONE || 'America/New_York',
  PORT: parseInt(process.env.PORT || '3000', 10),
};

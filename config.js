require('dotenv').config();

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
  SPOTIFY_CLIENT_ID: required('SPOTIFY_CLIENT_ID'),
  SPOTIFY_CLIENT_SECRET: required('SPOTIFY_CLIENT_SECRET'),
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/auth/spotify/callback',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.mail.yahoo.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  DIGEST_TO: process.env.DIGEST_TO || 'dan.gleyzer@ymail.com',
  DIGEST_FROM: process.env.DIGEST_FROM || 'Music Digest <dan.gleyzer@ymail.com>',
  SEND_TIME: process.env.SEND_TIME || '08:00',
  TIMEZONE: process.env.TIMEZONE || 'America/New_York',
  PORT: parseInt(process.env.PORT || '3000', 10),
};

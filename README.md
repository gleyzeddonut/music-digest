# Music Digest

A daily music intelligence briefing for your inbox — scrapes Reddit, music publications, and charts, summarizes with AI, builds a Spotify playlist, and emails you every morning.

## Install

1. Download the latest `.dmg` from [Releases](../../releases)
2. Open it, drag **Music Digest** to your Applications folder
3. Double-click to launch

That's it. The app walks you through the rest.

## First launch

The setup wizard asks for:
- **Your name** — used in the email greeting
- **Your email** — where your daily digest gets sent

Everything else (AI, Spotify credentials, email delivery) is handled centrally — no API keys to manage.

After setup, hit **Connect Spotify** to link your account and auto-build playlists, then click **▶ Run Now** to generate your first digest.

## Features

- **Daily brief** — AI-written summary of what's moving in music today
- **Scored artists** — breaking vs. rising, ranked by cross-platform signal
- **Smart playlist** — top songs added to a Spotify playlist automatically
- **Monthly recap** — at the end of each month, a full rollup: top artist, top song, every trend
- **Archive** — every past digest, browsable

## For developers

```bash
git clone <repo>
cd "Music Digest"
cp .env.example .env   # fill in CLAUDE_API_KEY, Spotify credentials, SMTP
npm install
npm run dev            # starts Vite + Express + Electron in dev mode
npm run dist           # builds the distributable .dmg
```

The architecture is designed to scale: Supabase handles shared config and secrets, so adding multi-user support later is a config change, not a rewrite.

```
Music Digest/
├── electron/          Desktop app shell
├── processor/         AI summarization, Spotify, scoring
├── scraper/           Reddit, charts, publications, YouTube
├── delivery/          Email, Express API routes
├── db/                SQLite schema
├── supabase/          Edge functions (Spotify OAuth proxy, YouTube proxy)
└── src/               React UI (Vite)
```

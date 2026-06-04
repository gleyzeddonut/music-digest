# Music Digest v1.7.6

Your daily music-intelligence briefing. Every morning it scrapes Reddit, the
charts, and the music press, has AI write you a tight brief on the breaking &
rising artists, builds a Spotify playlist of the day's top tracks, and emails it
to you.

---

## Download

Pick the build for your Mac:

- **Apple Silicon (M1/M2/M3/M4)** → `Music Digest-1.7.6-arm64.dmg`
- **Intel** → `Music Digest-1.7.6.dmg`

Not sure? Apple menu  → **About This Mac**. "Apple M…" = Apple Silicon; "Intel" = Intel.

## Install (about a minute)

1. Open the `.dmg` and drag **Music Digest** onto the **Applications** folder.
2. In the same window, **double-click "Open Music Digest."** Because this app
   isn't from the App Store, macOS blocks it on first launch — this helper clears
   that and opens the app for you. One double-click, done.
3. From then on, launch it normally from Applications or Spotlight.

> **If macOS still says it "can't be opened" or "is damaged,"** open **Terminal**
> and paste this, then press Return:
> ```
> xattr -dr com.apple.quarantine "/Applications/Music Digest.app"
> ```

## First launch

1. Enter your **name & email** (where the digest gets delivered — no API keys, no payment).
2. Click **Connect Spotify** to auto-build your daily playlist.
3. Hit **▶ Run Now** for your first digest. After that it runs every morning on its own.

---

## What's in this build

- Smarter **personas** — custom per-persona playlists appear under Library; the
  shared one is the **Main Playlist**.
- **Built-in vs Custom sources** — toggle the always-on charts (Apple, Last.fm,
  Genius, Shazam, Spotify Global, Hype Machine) per persona, and add your own
  Reddit, YouTube, and publication feeds.
- **"Update available" pill** in the sidebar so you never miss a new release.
- Deleting a persona now leaves your Spotify playlist untouched (removes it from
  the app only).
- Reddit scraping, scheduler, and email reliability fixes throughout the 1.7.x line.

---

*macOS 11+. Free for early testers. Trouble installing? Email dmgleyzer@gmail.com.*

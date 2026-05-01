# Music Digest

Daily music buzz digest — scrapes Reddit + music publications, summarizes with Claude AI, builds a Spotify playlist, emails you every morning.

## Setup (one-time)

### 1. Install dependencies
```bash
cd "Music Digest"
npm install
```

### 2. Add your Claude API key
Edit `.env` and fill in:
```
CLAUDE_API_KEY=sk-ant-...
```
Get one at: https://console.anthropic.com

### 3. Set up email (Yahoo App Password — free)
1. Go to https://login.yahoo.com → Account Security
2. Enable **2-step verification** if not already on
3. Scroll to **Generate app password** → select "Other app" → enter "Music Digest"
4. Copy the 16-character password
5. Edit `.env`:
   ```
   SMTP_USER=dan.gleyzer@ymail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx
   ```

### 4. Add Spotify redirect URI
1. Go to https://developer.spotify.com/dashboard
2. Open your app → **Edit Settings**
3. Add to **Redirect URIs**: `http://localhost:3000/auth/spotify/callback`
4. Save

### 5. Start the app
```bash
npm start
```

### 6. Connect Spotify
Visit http://localhost:3000/auth/spotify — approve, and you're done.

### 7. Test it
Hit **▶ Run Now** on the dashboard at http://localhost:3000

---

## Running automatically on Mac startup

To keep the app running in the background permanently:

```bash
# Create a launchd plist
cat > ~/Library/LaunchAgents/com.musicdigest.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.musicdigest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOUR_USERNAME/Library/Mobile Documents/com~apple~CloudDocs/Documents/CLAUDE/Music Digest/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USERNAME/Library/Mobile Documents/com~apple~CloudDocs/Documents/CLAUDE/Music Digest</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/musicdigest.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/musicdigest.err</string>
</dict>
</plist>
EOF

# Replace YOUR_USERNAME and load it
launchctl load ~/Library/LaunchAgents/com.musicdigest.plist
```

---

## File structure

```
Music Digest/
├── index.js              Entry point, Express + cron
├── config.js             Loads .env
├── .env                  Your credentials (never share)
├── db/
│   ├── init.js           SQLite schema + default source seeding
│   └── digests.db        Created on first run
├── scraper/
│   ├── reddit.js         Reddit public JSON API (no auth)
│   └── web.js            RSS + HTML scraping
├── processor/
│   ├── claude.js         AI summarization
│   ├── spotify.js        OAuth + playlist management
│   └── digest.js         Daily orchestrator
├── delivery/
│   ├── email.js          Nodemailer email
│   └── routes.js         Express API + OAuth routes
└── public/
    └── index.html        Dashboard UI
```

## Swapping to Reddit API (when ready)

When you get Reddit API credentials, replace `scraper/reddit.js` with the snoowrap version. Everything else stays the same. The `sources` table stores subreddit slugs — no other changes needed.

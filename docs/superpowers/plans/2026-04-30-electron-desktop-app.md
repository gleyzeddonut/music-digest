# Music Digest — Electron Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing Music Digest Node.js/Express app in Electron to produce a native macOS menu bar application distributed as a `.dmg`, with a first-run setup screen replacing manual `.env` editing.

**Architecture:** Electron main process loads a bundled `.env` (for shared credentials), then starts the existing Express server via an exported `startServer()`. A `config-store.js` module persists user-configurable values (digest email, optional Claude API key) to a JSON file in `~/Library/Application Support/Music Digest/`. A Tray icon keeps the app running in the background; a BrowserWindow serves the existing dashboard. On first launch, the app redirects to a setup screen instead of the dashboard.

**Tech Stack:** Electron 33, electron-builder 25, existing Node.js/Express/SQLite/Anthropic stack.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `electron/main.js` | Create | Electron entry: Tray, BrowserWindow, app lifecycle |
| `electron/config-store.js` | Create | JSON config file wrapper (userData path) |
| `public/setup.html` | Create | First-run setup screen |
| `electron-builder.yml` | Create | macOS DMG packaging config |
| `assets/iconTemplate.png` | Create | 22×22 menu bar tray icon (template) |
| `assets/icon.icns` | Create | Full macOS app icon |
| `config.js` | Modify | Inject electron-store values for DIGEST_TO + CLAUDE_API_KEY; soften SPOTIFY required() in Electron |
| `processor/claude.js` | Modify | Read CLAUDE_API_KEY from config-store dynamically when in Electron |
| `index.js` | Modify | Export `startServer()` returning Promise; move `app.use('/', routes)` before static |
| `db/init.js` | Modify | Use `app.getPath('userData')` for DB path when in Electron |
| `delivery/routes.js` | Modify | Add GET /setup, GET / guard, POST /api/setup, GET+POST /api/settings/login-item, POST /api/settings/config |
| `public/index.html` | Modify | Add "Launch at Login" toggle + "API Keys" section to Settings panel |
| `package.json` | Modify | Add electron, electron-builder devDeps; update `main`; add `electron` + `dist` scripts |

---

## Task 1: Initialize git and install Electron dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Initialize git repository**

```bash
cd "/Users/dangleyzer/Library/Mobile Documents/com~apple~CloudDocs/Documents/CLAUDE/Music Digest"
git init
```

Expected: `Initialized empty Git repository in .../Music Digest/.git/`

- [ ] **Step 2: Create .gitignore**

Create `.gitignore` with this content:
```
node_modules/
.env
dist/
.DS_Store
*.db
assets/icon.iconset/
```

- [ ] **Step 3: Install Electron dependencies**

```bash
npm install --save-dev electron@^33 electron-builder@^25
```

Expected: packages added without errors. `node_modules/electron/` exists.

- [ ] **Step 4: Update package.json**

Make three targeted edits to `package.json` — do NOT change the `dependencies` block:

**Change `main`** from `"index.js"` to `"electron/main.js"`.

**Replace `scripts`** block with:
```json
"scripts": {
  "start": "node index.js",
  "dev": "node --watch index.js",
  "electron": "electron .",
  "dist": "electron-builder --mac"
}
```

**Add `devDependencies`** block (after the closing `}` of `dependencies`):
```json
"devDependencies": {
  "electron": "^33.0.0",
  "electron-builder": "^25.0.0"
}
```

- [ ] **Step 5: Verify Electron works**

```bash
npx electron --version
```

Expected: prints a version like `v33.x.x`

- [ ] **Step 6: Initial commit**

```bash
git add -A
git commit -m "chore: initial commit with electron + electron-builder deps"
```

---

## Task 2: Create electron/config-store.js

This module persists user-configurable values to `~/Library/Application Support/Music Digest/config.json`. It uses plain `fs` + JSON — no external library — so there are no CJS/ESM compatibility issues.

**Files:**
- Create: `electron/config-store.js`
- Create: `test/config-store.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/config-store.test.js`:
```js
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Set up a temp directory so we don't need a real Electron environment
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-config-test-'));
const tmpConfig = path.join(tmpDir, 'config.json');

const { getConfig, setConfig, _setConfigPath } = require('../electron/config-store');
_setConfigPath(tmpConfig);

// Test 1: missing key returns null
assert.strictEqual(getConfig('digest_to'), null, 'missing key should return null');
console.log('✓ getConfig returns null for missing key');

// Test 2: setConfig then getConfig roundtrip
setConfig('digest_to', 'test@example.com');
assert.strictEqual(getConfig('digest_to'), 'test@example.com', 'should return stored value');
console.log('✓ setConfig/getConfig roundtrip works');

// Test 3: second getConfig reads from disk (not memory)
delete require.cache[require.resolve('../electron/config-store')];
const { getConfig: gc2, _setConfigPath: scp2 } = require('../electron/config-store');
scp2(tmpConfig);
assert.strictEqual(gc2('digest_to'), 'test@example.com', 'value should persist on disk');
console.log('✓ value persists across module reloads');

// Test 4: setConfig with null removes the key
const { setConfig: sc2, getConfig: gc3, _setConfigPath: scp3 } = (() => {
  delete require.cache[require.resolve('../electron/config-store')];
  const m = require('../electron/config-store');
  m._setConfigPath(tmpConfig);
  return m;
})();
sc2('digest_to', null);
assert.strictEqual(gc3('digest_to'), null, 'null value should remove key');
console.log('✓ setConfig(key, null) removes key');

// Cleanup
fs.rmSync(tmpDir, { recursive: true });
console.log('\nAll config-store tests passed ✓');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node test/config-store.test.js
```

Expected: `Error: Cannot find module '../electron/config-store'`

- [ ] **Step 3: Create electron/ directory and implement config-store.js**

Create `electron/config-store.js`:
```js
const path = require('path');
const fs = require('fs');

// _configPath is null in production (uses Electron userData).
// Tests override it via _setConfigPath().
let _configPath = null;

function getConfigPath() {
  if (_configPath) return _configPath;
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'config.json');
}

function _setConfigPath(p) {
  _configPath = p;
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

function getConfig(key) {
  const val = readAll()[key];
  return val !== undefined ? val : null;
}

function setConfig(key, value) {
  const p = getConfigPath();
  const data = readAll();
  if (value === null || value === undefined) {
    delete data[key];
  } else {
    data[key] = value;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

module.exports = { getConfig, setConfig, _setConfigPath };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node test/config-store.test.js
```

Expected:
```
✓ getConfig returns null for missing key
✓ setConfig/getConfig roundtrip works
✓ value persists across module reloads
✓ setConfig(key, null) removes key

All config-store tests passed ✓
```

- [ ] **Step 5: Commit**

```bash
git add electron/config-store.js test/config-store.test.js
git commit -m "feat: add electron/config-store.js with JSON persistence"
```

---

## Task 3: Update config.js for Electron context

When running inside Electron, config.js overrides `DIGEST_TO` and `CLAUDE_API_KEY` from the config store (user-set values). It also removes the hard throw for `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` since those come from the bundled `.env` loaded by `main.js` before Express starts.

**Files:**
- Modify: `config.js`

- [ ] **Step 1: Replace config.js**

The complete new `config.js`:
```js
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
```

- [ ] **Step 2: Verify plain node mode still works**

```bash
node -e "const c = require('./config'); console.log('PORT:', c.PORT, 'OK')"
```

Expected: `PORT: 3000 OK` (or whatever your .env has)

- [ ] **Step 3: Commit**

```bash
git add config.js
git commit -m "feat: config.js injects electron-store values in Electron context"
```

---

## Task 4: Update claude.js to read API key dynamically

`config.CLAUDE_API_KEY` is set at module load time. If the user sets their key via the setup screen after the module is already loaded, the value won't update. Read it from the store at call time when in Electron.

**Files:**
- Modify: `processor/claude.js` (lines 80-130)

- [ ] **Step 1: Update processWithClaude to read key dynamically**

In `processor/claude.js`, change the `processWithClaude` function's client creation (currently around line 84-85). Replace:
```js
  const client = new Anthropic({ apiKey: config.CLAUDE_API_KEY });
```

With:
```js
  let apiKey = config.CLAUDE_API_KEY;
  if (process.versions.electron) {
    try {
      const { getConfig } = require('../electron/config-store');
      apiKey = getConfig('claude_api_key') || apiKey;
    } catch (_) {}
  }
  const client = new Anthropic({ apiKey });
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "require('./processor/claude')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add processor/claude.js
git commit -m "feat: read Claude API key from config-store at call time in Electron"
```

---

## Task 5: Refactor index.js to export startServer()

Electron needs to call `startServer()` as a function and await the server being ready. The existing `start()` function runs immediately on require — this must change. Also move `app.use('/', routes)` before static middleware so the `GET /` guard (added in Task 7) can intercept before static serves `index.html`.

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Replace index.js**

Complete new `index.js`:
```js
require('dotenv').config();
const express = require('express');
const path = require('path');

const { initDb, getDb } = require('./db/init');
const routes = require('./delivery/routes');
const { runDigest } = require('./processor/digest');
const config = require('./config');

const app = express();
app.use(express.json());
// Routes BEFORE static — allows GET / guard in routes.js to redirect before
// express.static serves public/index.html
app.use('/', routes);
app.use(express.static(path.join(__dirname, 'public')));

function getSetting(key, fallback) {
  const val = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  return val != null ? val : fallback;
}

function parseSendTime(timeStr) {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  return { hour: h || 8, minute: m || 0 };
}

function shouldSendToday(now) {
  const frequency = getSetting('schedule_frequency', 'daily');
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const target = parseInt(getSetting('schedule_week_day', '5'), 10);
    return now.getDay() === target;
  }
  if (frequency === 'monthly') {
    const target = parseInt(getSetting('schedule_month_date', '1'), 10);
    return now.getDate() === target;
  }
  return true;
}

function startServer() {
  return new Promise((resolve) => {
    initDb();

    let lastScheduledRun = null;

    setInterval(async () => {
      const sendTime = getSetting('schedule_send_time', config.SEND_TIME);
      const { hour, minute } = parseSendTime(sendTime);
      const now = new Date();
      const todayKey = now.toISOString().split('T')[0];

      if (now.getHours() === hour && now.getMinutes() === minute && lastScheduledRun !== todayKey) {
        if (!shouldSendToday(now)) return;
        lastScheduledRun = todayKey;
        console.log(`\n[${now.toISOString()}] ── Scheduled digest run starting ──`);
        try {
          const result = await runDigest({ sendEmail: true });
          if (result.skipped) {
            console.log(`[digest] Already ran today, skipped`);
          } else {
            console.log(`[digest] Done. Artists: ${result.artists?.length}, Songs: ${result.songs?.length}, Email: ${result.emailSent}`);
          }
        } catch (err) {
          console.error(`[digest] Run failed:`, err.message);
        }
      }
    }, 60_000);

    app.listen(config.PORT, () => {
      const sendTime = getSetting('schedule_send_time', config.SEND_TIME);
      console.log(`
╔══════════════════════════════════════════╗
║           MUSIC DIGEST RUNNING           ║
╠══════════════════════════════════════════╣
║  Dashboard  →  http://localhost:${config.PORT}    ║
║  Schedule   →  ${sendTime} ${config.TIMEZONE.padEnd(20)}║
╚══════════════════════════════════════════╝
`);
      resolve();
    });
  });
}

// Export for Electron's main.js
module.exports = { startServer };

// Run directly when invoked as a plain node server
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Verify plain node mode still works**

```bash
npm start &
sleep 2
curl -s http://localhost:3000/api/status | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const j=JSON.parse(d); console.log('server OK, sources:', j.sourcesCount); })"
kill %1
```

Expected: `server OK, sources: <number>`

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: export startServer() from index.js for Electron; routes before static"
```

---

## Task 6: Update db/init.js for userData path

When running in Electron, the SQLite database must live in `~/Library/Application Support/Music Digest/` so it persists across app updates (which replace the app bundle).

**Files:**
- Modify: `db/init.js` (lines 1-5)

- [ ] **Step 1: Replace the DB_PATH constant**

In `db/init.js`, replace lines 1–5:
```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'digests.db');
```

With:
```js
const Database = require('better-sqlite3');
const path = require('path');

function getDbPath() {
  if (process.versions.electron) {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'digests.db');
  }
  return path.join(__dirname, 'digests.db');
}

const DB_PATH = getDbPath();
```

- [ ] **Step 2: Verify plain node mode DB path unchanged**

```bash
node -e "
process.versions.electron = undefined;
const { getDb } = require('./db/init');
const db = getDb();
console.log('DB path:', db.name);
"
```

Expected: path ends in `.../db/digests.db` (not a userData path)

- [ ] **Step 3: Commit**

```bash
git add db/init.js
git commit -m "feat: use Electron userData path for SQLite DB when running in Electron"
```

---

## Task 7: Create electron/main.js

The Electron entry point. Loads the bundled `.env`, starts Express, creates the Tray icon and BrowserWindow.

**Files:**
- Create: `electron/main.js`

- [ ] **Step 1: Create electron/main.js**

```js
const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

// ── Helpers ───────────────────────────────────────────────────

function getSendTime() {
  try {
    const { getDb } = require('../db/init');
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'schedule_send_time'").get();
    if (row?.value) return row.value;
  } catch {}
  return process.env.SEND_TIME || '08:00';
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: showWindow },
    { type: 'separator' },
    { label: `Next digest: ${getSendTime()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit Music Digest', click: () => app.quit() },
  ]);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── Tray ──────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Music Digest');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
}

// ── Window ────────────────────────────────────────────────────

function createWindow(setupNeeded) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Music Digest',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:3000${setupNeeded ? '/setup' : ''}`);

  // Hide instead of close so the scheduler keeps running
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  // Open external links in the default browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── App lifecycle ─────────────────────────────────────────────

// Enforce single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    // Load credentials: bundled .env in packaged app, local .env in dev
    const envPath = app.isPackaged
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '..', '.env');
    require('dotenv').config({ path: envPath });

    // Start Express server
    const { startServer } = require('../index');
    await startServer();

    // Check if first-run setup is needed
    const { getConfig } = require('./config-store');
    const setupNeeded = !getConfig('digest_to');

    createWindow(setupNeeded);
    createTray();
  });

  // Clicking the Dock icon re-shows the window
  app.on('activate', () => {
    if (mainWindow) showWindow();
  });
}
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
// Just check it parses without errors (won't run — needs Electron)
const src = require('fs').readFileSync('./electron/main.js', 'utf8');
new Function(src);
console.log('syntax OK');
" 2>&1 | head -5
```

Expected: `syntax OK` (or an expected Electron-context error like `electron is not defined` which is fine — we just want no parse errors)

Note: Full manual verification happens in Task 10 when you run `npm run electron`.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: add electron/main.js — Tray, BrowserWindow, single-instance"
```

---

## Task 8: Add setup.html and setup routes

First-run setup screen served at `/setup`. Route guard on `GET /` redirects there if `digest_to` not configured. `POST /api/setup` saves config and seeds the DB settings table.

**Files:**
- Create: `public/setup.html`
- Modify: `delivery/routes.js`

- [ ] **Step 1: Create public/setup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Music Digest — Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .card {
      background: #fff;
      border-radius: 8px;
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    }
    .logo {
      font-size: 11px;
      color: #e76f51;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 26px;
      font-weight: 900;
      color: #111;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #888;
      font-size: 14px;
      margin-bottom: 36px;
      line-height: 1.5;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #444;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px 12px;
      font-size: 14px;
      color: #111;
      outline: none;
      margin-bottom: 22px;
      transition: border-color 0.15s;
    }
    input:focus { border-color: #e76f51; }
    .hint {
      font-size: 12px;
      color: #999;
      margin-top: -18px;
      margin-bottom: 22px;
      line-height: 1.4;
    }
    button {
      width: 100%;
      background: #e76f51;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #d45f40; }
    button:disabled { background: #ccc; cursor: default; }
    .error {
      color: #c0392b;
      font-size: 13px;
      margin-top: 12px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Music Digest</div>
    <h1>Welcome</h1>
    <p class="subtitle">Enter your email address to start receiving your daily music briefing.</p>

    <label for="email">Your email address</label>
    <input type="email" id="email" placeholder="you@example.com" autocomplete="email">

    <label for="apiKey">Claude API key <span style="font-weight:400;color:#aaa;">(optional)</span></label>
    <input type="password" id="apiKey" placeholder="Leave blank to use the shared key">
    <p class="hint">Only needed if you want to use your own Anthropic account.</p>

    <button id="btn" onclick="submit()">Get started</button>
    <div class="error" id="err"></div>
  </div>

  <script>
    async function submit() {
      const email = document.getElementById('email').value.trim();
      const apiKey = document.getElementById('apiKey').value.trim();
      const btn = document.getElementById('btn');
      const err = document.getElementById('err');

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.textContent = 'Please enter a valid email address.';
        err.style.display = 'block';
        return;
      }

      err.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Saving…';

      try {
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digestTo: email, claudeApiKey: apiKey }),
        });
        if (!res.ok) {
          const j = await res.json();
          throw new Error(j.error || 'Setup failed');
        }
        window.location.href = '/';
      } catch (e) {
        err.textContent = e.message;
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Get started';
      }
    }

    document.getElementById('email').addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Add routes to delivery/routes.js**

At the top of `delivery/routes.js`, add `path` require (after the existing requires):
```js
const path = require('path');
```

Then add these routes BEFORE the existing `router.get('/auth/spotify', ...)` block:

```js
// ── Setup (first-run) ──────────────────────────────────────────

router.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setup.html'));
});

// Route guard: redirect to /setup if digest email not yet configured
router.get('/', (req, res, next) => {
  if (process.versions.electron) {
    const { getConfig } = require('../electron/config-store');
    if (!getConfig('digest_to')) return res.redirect('/setup');
  }
  next(); // fall through to express.static which serves public/index.html
});

router.post('/api/setup', (req, res) => {
  if (!process.versions.electron) return res.status(404).json({ error: 'Not available outside Electron' });
  const { digestTo, claudeApiKey } = req.body;
  if (!digestTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digestTo)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  const { setConfig } = require('../electron/config-store');
  setConfig('digest_to', digestTo.trim());
  if (claudeApiKey?.trim()) setConfig('claude_api_key', claudeApiKey.trim());

  // Also write to the DB settings table so email.js picks it up without restart
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('digest_to', digestTo.trim());

  // Update process.env so config.DIGEST_TO reflects the new value this session
  process.env.DIGEST_TO = digestTo.trim();
  if (claudeApiKey?.trim()) process.env.CLAUDE_API_KEY = claudeApiKey.trim();

  res.json({ ok: true });
});
```

- [ ] **Step 3: Verify routes.js parses without errors**

```bash
node -e "require('./delivery/routes')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Test the setup route manually**

Start the server and verify:
```bash
npm start &
sleep 2
# Setup page should return HTML
curl -s http://localhost:3000/setup | grep -c "Welcome"
# POST validation should reject missing email
curl -s -X POST http://localhost:3000/api/setup \
  -H "Content-Type: application/json" \
  -d '{"digestTo":"notanemail"}' | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).error))"
kill %1
```

Expected:
```
1
Valid email address required
```

- [ ] **Step 5: Commit**

```bash
git add public/setup.html delivery/routes.js
git commit -m "feat: add setup.html, GET /setup, GET / guard, POST /api/setup"
```

---

## Task 9: Add login-item and config API routes + Settings UI

Adds "Launch at Login" toggle and "API Keys" section to the existing Settings panel in `public/index.html`. Backs them with two new API routes.

**Files:**
- Modify: `delivery/routes.js`
- Modify: `public/index.html`

- [ ] **Step 1: Add the three new routes to delivery/routes.js**

Add these routes inside `delivery/routes.js`, after the `POST /api/setup` block added in Task 8:

```js
// ── Electron system settings ───────────────────────────────────

router.get('/api/settings/login-item', (req, res) => {
  if (!process.versions.electron) return res.json({ enabled: false });
  const { app } = require('electron');
  res.json({ enabled: app.getLoginItemSettings().openAtLogin });
});

router.post('/api/settings/login-item', (req, res) => {
  if (!process.versions.electron) return res.status(404).json({ error: 'Not available outside Electron' });
  const { enabled } = req.body;
  const { app } = require('electron');
  app.setLoginItemSettings({ openAtLogin: !!enabled });
  res.json({ ok: true });
});

// Update user-configurable config values
router.post('/api/settings/config', (req, res) => {
  if (!process.versions.electron) return res.status(404).json({ error: 'Not available outside Electron' });
  const { digestTo, claudeApiKey } = req.body;
  const { setConfig } = require('../electron/config-store');
  const db = getDb();

  if (digestTo?.trim()) {
    setConfig('digest_to', digestTo.trim());
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('digest_to', digestTo.trim());
    process.env.DIGEST_TO = digestTo.trim();
  }
  if (claudeApiKey !== undefined) {
    if (claudeApiKey.trim()) {
      setConfig('claude_api_key', claudeApiKey.trim());
      process.env.CLAUDE_API_KEY = claudeApiKey.trim();
    } else {
      setConfig('claude_api_key', null);
    }
  }
  res.json({ ok: true });
});
```

- [ ] **Step 2: Add "Launch at Login" toggle and "API Keys" section to public/index.html**

In `public/index.html`, find the Settings section. It contains a form with fields for email, send time, and frequency. Add the following two blocks **after** the existing Spotify connect section and **before** the closing `</div>` of the settings panel.

First, add the "Launch at Login" row. Find this pattern in the settings HTML (look for the Spotify section or the save button), and add after the Spotify block:

```html
<!-- Launch at Login (Electron only) -->
<div id="login-item-section" style="display:none; margin-top:24px;">
  <div style="font-size:11px;color:#e76f51;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;">System</div>
  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:#333;">
    <input type="checkbox" id="launch-at-login" onchange="setLaunchAtLogin(this.checked)"
      style="width:16px;height:16px;accent-color:#e76f51;cursor:pointer;">
    Launch Music Digest at login
  </label>
</div>

<!-- API Keys (Electron only) -->
<div id="api-keys-section" style="display:none; margin-top:28px;">
  <div style="font-size:11px;color:#e76f51;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;">Account</div>
  <div style="margin-bottom:14px;">
    <label style="font-size:12px;font-weight:600;color:#666;display:block;margin-bottom:4px;">Digest email</label>
    <div style="display:flex;gap:8px;">
      <input id="setting-digest-to" type="email" placeholder="you@example.com"
        style="flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:4px;font-size:14px;">
      <button onclick="saveConfigSettings()" style="background:#e76f51;color:#fff;border:none;border-radius:4px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">Save</button>
    </div>
  </div>
  <div>
    <label style="font-size:12px;font-weight:600;color:#666;display:block;margin-bottom:4px;">Claude API key <span style="font-weight:400;color:#aaa;">(optional)</span></label>
    <input id="setting-claude-key" type="password" placeholder="Leave blank to use shared key"
      style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:4px;font-size:14px;">
    <div style="font-size:11px;color:#aaa;margin-top:4px;">Only needed if you want to use your own Anthropic account.</div>
  </div>
</div>
```

- [ ] **Step 3: Add JS functions to public/index.html**

In the `<script>` section of `public/index.html`, add these functions:

```js
async function loadElectronSettings() {
  // Only show Electron-specific UI if running inside the desktop app
  try {
    const r = await fetch('/api/settings/login-item');
    if (!r.ok) return; // not Electron
    const { enabled } = await r.json();
    document.getElementById('launch-at-login').checked = enabled;
    document.getElementById('login-item-section').style.display = 'block';
    document.getElementById('api-keys-section').style.display = 'block';
    // Pre-fill digest email from current settings
    const s = await api('/api/settings');
    if (s.email) document.getElementById('setting-digest-to').value = s.email;
  } catch {}
}

async function setLaunchAtLogin(enabled) {
  await api('/api/settings/login-item', 'POST', { enabled });
  toast(enabled ? 'Will launch at login' : 'Login launch disabled');
}

async function saveConfigSettings() {
  const digestTo = document.getElementById('setting-digest-to').value.trim();
  const claudeApiKey = document.getElementById('setting-claude-key').value.trim();
  if (digestTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digestTo)) {
    toast('Invalid email address'); return;
  }
  await api('/api/settings/config', 'POST', { digestTo: digestTo || undefined, claudeApiKey });
  toast('Saved');
  document.getElementById('setting-claude-key').value = '';
}
```

Then find the page initialisation block in `public/index.html`. It contains calls like `loadDigest()`, `loadStatus()`, `loadSources()`. Add `loadElectronSettings()` on its own line alongside those existing calls:

```js
// Before (find this pattern):
loadDigest();
loadStatus();
loadSources();

// After (add the new call):
loadDigest();
loadStatus();
loadSources();
loadElectronSettings();
```

- [ ] **Step 4: Verify routes parse without errors**

```bash
node -e "require('./delivery/routes')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add delivery/routes.js public/index.html
git commit -m "feat: launch-at-login toggle and API keys section in settings"
```

---

## Task 10: Create app icon assets

Convert the existing `visuals/logo.png` to the formats Electron needs: a `.icns` file for the app icon and a small PNG for the menu bar Tray.

**Files:**
- Create: `assets/` directory
- Create: `assets/icon.icns`
- Create: `assets/iconTemplate.png`

- [ ] **Step 1: Create assets directory and generate icons**

Run these commands (uses macOS built-in `sips` and `iconutil`):

```bash
mkdir -p assets/icon.iconset

sips -z 16   16   "visuals/logo.png" --out assets/icon.iconset/icon_16x16.png
sips -z 32   32   "visuals/logo.png" --out assets/icon.iconset/icon_16x16@2x.png
sips -z 32   32   "visuals/logo.png" --out assets/icon.iconset/icon_32x32.png
sips -z 64   64   "visuals/logo.png" --out assets/icon.iconset/icon_32x32@2x.png
sips -z 128  128  "visuals/logo.png" --out assets/icon.iconset/icon_128x128.png
sips -z 256  256  "visuals/logo.png" --out assets/icon.iconset/icon_128x128@2x.png
sips -z 256  256  "visuals/logo.png" --out assets/icon.iconset/icon_256x256.png
sips -z 512  512  "visuals/logo.png" --out assets/icon.iconset/icon_256x256@2x.png
sips -z 512  512  "visuals/logo.png" --out assets/icon.iconset/icon_512x512.png
sips -z 1024 1024 "visuals/logo.png" --out assets/icon.iconset/icon_512x512@2x.png

iconutil -c icns assets/icon.iconset -o assets/icon.icns

# Tray icon: small template image (macOS auto-adapts to light/dark menu bar)
sips -z 22 22 "visuals/logo.png" --out assets/iconTemplate.png
```

- [ ] **Step 2: Verify files exist**

```bash
ls -lh assets/icon.icns assets/iconTemplate.png
```

Expected: both files exist and are non-zero.

- [ ] **Step 3: Commit**

```bash
git add assets/
git commit -m "feat: add macOS app icon (icns) and menu bar tray icon"
```

---

## Task 11: electron-builder config and production build

Create the packaging config and produce a `.dmg`. Verify the full Electron app runs in development first, then build for distribution.

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Create electron-builder.yml**

```yaml
appId: com.musicdigest.app
productName: Music Digest
copyright: Copyright © 2026

directories:
  output: dist

mac:
  category: public.app-category.music
  icon: assets/icon.icns
  target:
    - target: dmg
      arch: [x64, arm64]

dmg:
  title: Music Digest
  contents:
    - x: 130
      y: 220
      type: file
    - x: 410
      y: 220
      type: link
      path: /Applications

# Bundle the .env so Electron can load shared credentials at runtime.
# This file is in .gitignore — you must have it locally to build.
extraResources:
  - from: ".env"
    to: ".env"

files:
  - "**/*"
  - "!docs/**"
  - "!test/**"
  - "!.env*"
  - "!.firecrawl/**"
  - "!visuals/**"
  - "!assets/icon.iconset/**"
  - "!*.md"
```

- [ ] **Step 2: Verify the app runs in development (unpackaged Electron)**

```bash
npm run electron
```

Expected:
- App launches, menu bar icon appears in the top-right menu bar
- Dashboard window opens (or setup screen if no `digest_to` configured in the store)
- Closing the window hides it but the menu bar icon remains
- Clicking the menu bar icon re-opens the window
- "Quit Music Digest" from the menu bar context menu closes the app

If the setup screen appears: enter your email, click "Get started", verify it redirects to the main dashboard.

- [ ] **Step 3: Build the .dmg**

```bash
npm run dist
```

Expected: `dist/Music Digest-1.0.0.dmg` (and arm64 variant) is produced. Build completes without errors.

- [ ] **Step 4: Test the built .dmg**

```bash
open "dist/Music Digest-1.0.0.dmg"
```

Expected:
- DMG window opens with a drag-to-Applications prompt
- Drag the app to Applications
- Right-click → Open (required on first launch for unsigned apps)
- App opens, menu bar icon appears, setup screen (or dashboard) loads
- Setup: enter email → dashboard loads → "Run Now" → digest runs → email arrives

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: add electron-builder config; produces signed-ready macOS DMG"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Section 1 (what changes): all files covered in tasks 1–11
- ✅ Section 2 (architecture / app lifecycle): tasks 7 + 11
- ✅ Section 3 (config store): task 2
- ✅ Section 4 (main process / Tray / BrowserWindow): task 7
- ✅ Section 5 (setup screen): task 8
- ✅ Section 6 (settings additions): task 9
- ✅ Section 7 (IPC bridge — login-item routes): task 9
- ✅ Section 8 (packaging): task 11
- ✅ Section 9 (package.json): task 1
- ✅ Section 10 (out of scope): nothing added beyond spec

**Type / naming consistency across tasks:**
- `startServer()` defined in task 5, called in task 7 ✓
- `getConfig` / `setConfig` / `_setConfigPath` defined in task 2, used in tasks 3, 4, 7, 8, 9 ✓
- `getDb()` used in tasks 8 + 9 — already imported in routes.js ✓
- Route paths: `/setup`, `/api/setup`, `/api/settings/login-item`, `/api/settings/config` consistent ✓

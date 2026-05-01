# Music Digest — Electron Desktop App Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the existing Music Digest Node.js/Express web app into a native macOS desktop application using Electron, distributed as a `.dmg`.

**Architecture:** Electron wraps the existing Express server and HTML dashboard with no changes to backend logic. A new config store replaces `.env`. A minimal first-run setup screen collects the user's digest email address (and optionally their Claude API key) before the dashboard loads.

**Tech Stack:** Electron, electron-store, electron-builder, existing Node.js/Express/SQLite stack.

---

## 1. What Changes vs. What Stays the Same

### Unchanged
- All scrapers (`scraper/`)
- All processors (`processor/`)
- Scheduler
- Delivery (`delivery/`)
- SQLite schema

### Changed
- `index.js` — wraps server start in an exported `startServer()` function so Electron can require it without it running immediately
- `config.js` — reads from electron-store instead of `process.env`
- `db/init.js` — DB path moves to macOS userData directory
- `public/index.html` — Settings page gains "Launch at Login" toggle and "API Keys" section
- `delivery/routes.js` — adds `GET /setup`, `POST /api/setup`, `GET /api/settings/login-item`, `POST /api/settings/login-item`, `POST /api/settings/config` routes
- `package.json` — adds Electron deps, updates `main` field, adds `electron` and `dist` scripts

### Added
- `electron/main.js` — Electron entry point
- `electron/config-store.js` — electron-store wrapper
- `public/setup.html` — first-run setup screen
- `electron-builder.yml` — packaging config
- `assets/icon.icns` — app icon (derived from `visuals/logo.png`)

---

## 2. Architecture

### App Lifecycle

1. Electron launches (`electron/main.js`)
2. Config store is checked for required keys (`digest_to` email address)
3. Express server starts on a fixed local port (3000)
4. If config is incomplete → open BrowserWindow to `http://localhost:3000/setup`
5. If config is complete → open BrowserWindow to `http://localhost:3000`
6. Menu bar (Tray) icon is created

### Process Model

- **Main process** (`electron/main.js`): manages Tray, BrowserWindow, app lifecycle
- **Express server**: runs inside the main process (not a separate child process) — same as today
- **Renderer**: the existing HTML/JS dashboard loaded in BrowserWindow via `localhost`

### Data Persistence

All user data lives in the macOS userData directory:
- Config: `~/Library/Application Support/Music Digest/config.json`
- Database: `~/Library/Application Support/Music Digest/digests.db`

This ensures data survives app updates (which replace the app bundle but not userData).

---

## 3. Config Store

**File:** `electron/config-store.js`

Wraps `electron-store` to provide the same interface `config.js` currently gets from `process.env`. Keys stored:

| Key | Description | Required |
|---|---|---|
| `digest_to` | Email address to receive digests | Yes |
| `claude_api_key` | User's own Claude API key | No (falls back to bundled default) |

All other config (SMTP credentials, from address, Spotify app credentials, timezone, send time) is hardcoded in `config.js` — invisible to the user.

**Security note:** SMTP credentials and the default Claude API key are baked into the app bundle. Acceptable for a small trusted distribution group; revisit if distribution widens.

`config.js` is updated to call `getStore()` from `config-store.js` instead of reading `process.env`, with fallbacks to hardcoded defaults for all non-user-configurable values.

---

## 4. Electron Main Process

**File:** `electron/main.js`

### Startup sequence
1. `app.whenReady()` fires
2. Load config store
3. Start Express server — call `startServer()` exported from `index.js`, which returns a Promise that resolves when `app.listen()` fires
4. Await that Promise before opening the BrowserWindow
5. Create Tray icon
6. Open BrowserWindow

### BrowserWindow
- Size: 1100×800, resizable, minimum 800×600
- Loads `http://localhost:3000/setup` if `digest_to` is not configured, else `http://localhost:3000`
- `windowShouldClose`: intercepts close event, hides window instead of quitting
- Title bar: standard macOS (traffic lights visible)
- `webPreferences.nodeIntegration: false` — renderer is treated as a web page

### Tray
- Icon: 16×16 or 22×22 `assets/icon.png` (template image so macOS auto-adapts to light/dark menu bar)
- Click → show/focus BrowserWindow
- Context menu:
  - "Open Dashboard" — show/focus BrowserWindow
  - Separator
  - Status line: "Next digest: 7:00 AM" or "Running now…" (updated by calling a function in `main.js` directly — Express and the scheduler run in the same main process)
  - Separator
  - "Quit Music Digest" — `app.quit()`

### App behavior
- `app.dock.show()` — app appears in Dock normally
- `app.setActivationPolicy('regular')` — standard macOS app behavior
- Auto-launch toggle in Settings calls `app.setLoginItemSettings({ openAtLogin: bool })`; current state read via `app.getLoginItemSettings().openAtLogin`

---

## 5. First-Run Setup Screen

**File:** `public/setup.html` (served by Express at `GET /setup`)

### Layout
Clean centered card, consistent with the existing dashboard style (same font, same orange accent color `#e76f51`).

### Fields
| Field | Type | Required | Note |
|---|---|---|---|
| Email address for digest | email input | Yes | Where to send daily digest |
| Claude API key | password input | No | Placeholder: "Leave blank to use shared key" |

### Behavior
- "Get started" button submits to `POST /api/setup`
- `POST /api/setup` writes values to config store, returns `{ ok: true }`
- On success: `window.location = '/'` — redirects to main dashboard
- Validation: email field must be a valid email format before submit

### Route guard
`GET /` checks if `digest_to` is configured. If not, redirects to `/setup`. This prevents users from reaching the dashboard with incomplete config.

---

## 6. Settings Page Additions

The existing Settings page gains two new items:

**"Launch at Login" toggle** — checkbox that calls `GET /api/settings/login-item` to read current state and `POST /api/settings/login-item` with `{ enabled: bool }` to set it. The route calls `app.setLoginItemSettings()` via an IPC bridge or direct Electron API access from the main process.

**"API Keys" section** — allows updating `digest_to` email and Claude API key after initial setup. Calls `POST /api/settings/config` which writes to the config store.

---

## 7. IPC Bridge

A minimal IPC bridge allows the Express server (main process) to communicate with Electron APIs that aren't accessible from a plain Node.js context:

- `electron:getLoginItem` → returns `app.getLoginItemSettings().openAtLogin`
- `electron:setLoginItem` → calls `app.setLoginItemSettings({ openAtLogin: bool })`
- `electron:getVersion` → returns `app.getVersion()` (shown in Settings)

These are exposed as Express routes (`/api/electron/*`) that internally call the Electron API. No `contextBridge` or preload script needed since the renderer communicates via HTTP to localhost, not directly via IPC.

---

## 8. Packaging & Distribution

**File:** `electron-builder.yml`

```yaml
appId: com.musicdigest.app
productName: Music Digest
directories:
  output: dist
mac:
  category: public.app-category.music
  icon: assets/icon.icns
  target: dmg
dmg:
  title: Music Digest
  background: assets/dmg-background.png  # optional, can be omitted
  contents:
    - x: 130, y: 220, type: file
    - x: 410, y: 220, type: link, path: /Applications
files:
  - "**/*"
  - "!docs/**"
  - "!.env*"
  - "!.firecrawl/**"
  - "!visuals/**"
```

**Build command:** `npm run dist` → produces `dist/Music Digest-{version}.dmg`

**App icon:** `visuals/logo.png` converted to `assets/icon.icns` using `electron-icon-builder` or manually via Preview.app (export as `.icns`).

**Gatekeeper:** App is not code-signed (no Apple Developer account required). Recipients right-click → Open → Open on first launch. This should be noted in any distribution message.

**Updates:** Manual for now — build a new `.dmg` and reshare. `electron-updater` can be added later if a distribution server is set up.

---

## 9. package.json Changes

New dependencies:
- `electron` (devDependency)
- `electron-store`
- `electron-builder` (devDependency)

New scripts:
```json
"electron": "electron .",
"dist": "electron-builder --mac"
```

`main` field in `package.json` updated to point to `electron/main.js`.

The existing `start` script (`node index.js`) continues to work for running the app as a plain web server without Electron — useful during development.

---

## 10. Out of Scope

- Windows/Linux packaging
- Code signing / notarization
- Auto-update server
- Multi-user accounts or shared instances
- Admin panel
- Electron auto-updater

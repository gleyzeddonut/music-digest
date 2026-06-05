const { app, BrowserWindow, Tray, Menu, nativeImage, shell, globalShortcut, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let appReady = false;
let pendingDeepLink = null;

// ── Helpers ───────────────────────────────────────────────────

function getSendTime() {
  try {
    const { getDb } = require('../db/init');
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'schedule_send_time'").get();
    if (row?.value) return row.value;
  } catch (err) {
    console.warn('[tray] Could not read send time from DB:', err.message);
  }
  return process.env.SEND_TIME || '08:00';
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: showWindow },
    { type: 'separator' },
    { label: `Next digest: ${getSendTime()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit Music Digest', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Exposed so the in-process server (the Spotify-login loopback callback) can pull
// the desktop app to the foreground OVER the browser once the session is set —
// app.focus({steal}) is what raises us above the active browser on macOS. This
// avoids the flaky browser→app deep-link prompt for refocus.
global.__focusApp = function () {
  showWindow();
  try { app.focus({ steal: true }); } catch (_) { /* best effort */ }
};

// ── Deep links (musicdigest://) ───────────────────────────────
// Confirmation / password-reset emails redirect to
//   musicdigest://auth-callback#access_token=…&refresh_token=…
// The OS hands that URL to us; we establish the session via the local server
// (so the user lands signed-in), then focus the window.
async function handleDeepLink(url) {
  try {
    if (!url || !url.toLowerCase().startsWith('musicdigest://')) return;
    const parsed = new URL(url);
    const frag = (parsed.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(frag || parsed.search);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const expires_in = params.get('expires_in');
    const provider_token = params.get('provider_token');
    const provider_refresh_token = params.get('provider_refresh_token');

    if (access_token && refresh_token) {
      try {
        const port = require('../config').PORT;
        await fetch(`http://localhost:${port}/api/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token, refresh_token, expires_in, provider_token, provider_refresh_token }),
        });
        if (mainWindow) mainWindow.webContents.reload(); // re-render as signed-in
      } catch (err) {
        console.warn('[deeplink] could not establish session:', err.message);
      }
    } else {
      const errDesc = params.get('error_description') || params.get('error');
      if (errDesc) {
        console.warn('[deeplink] auth error in callback:', errDesc);
      } else if (mainWindow) {
        // No tokens, no error → "Sign in with Spotify": the session was already
        // established on the local server via the loopback callback. Reload so
        // the renderer re-renders as signed in.
        mainWindow.webContents.reload();
      }
    }
    showWindow();
  } catch (err) {
    console.warn('[deeplink] failed to handle url:', err.message);
    showWindow();
  }
}

// ── App menu ──────────────────────────────────────────────────
// Override the default Quit menu item so isQuitting is set synchronously
// before app.quit() fires close events — fixes Cmd+Q and Dock → Quit.
function buildAppMenu() {
  const quit = new MenuItem({
    label: 'Quit Music Digest',
    accelerator: 'CmdOrCtrl+Q',
    click: () => { isQuitting = true; app.quit(); },
  });
  const template = Menu.getApplicationMenu()?.items.map(item => {
    if (item.role === 'appmenu' || item.label === app.name) {
      return new MenuItem({
        label: item.label,
        submenu: [...(item.submenu?.items.filter(i => i.role !== 'quit') ?? []), quit],
      });
    }
    return item;
  }) ?? [{ label: app.name, submenu: [quit] }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Tray ──────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '..', 'visuals', 'menuitemTemplate.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
  tray = new Tray(icon);
  tray.setToolTip('Music Digest');
  // Menu is built once; send time label reflects value at launch, not live updates
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
}

// ── Window ────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 780,
    minHeight: 600,
    title: 'Music Digest',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(`http://localhost:${require('../config').PORT}`);
  }

  // Hide instead of close so the scheduler keeps running
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  // Open external links in the default browser, not in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[electron] setWindowOpenHandler url:', url);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept any navigation away from localhost and open it externally instead
  mainWindow.webContents.on('will-navigate', (event, url) => {
    console.log('[electron] will-navigate url:', url);
    if (!url.startsWith('http://localhost:')) {
      console.log('[electron] blocking navigation, opening externally:', url);
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Catch server-side 302 redirects (e.g. /auth/spotify → accounts.spotify.com)
  mainWindow.webContents.on('will-redirect', (event, url) => {
    console.log('[electron] will-redirect url:', url);
    if (!url.startsWith('http://localhost:')) {
      console.log('[electron] blocking redirect, opening externally:', url);
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────

// Enforce single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Register the musicdigest:// scheme so confirmation-email links open the app.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('musicdigest', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('musicdigest');
  }

  // macOS delivers deep links via open-url (can fire before the app is ready).
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (appReady) handleDeepLink(url);
    else pendingDeepLink = url;
  });

  // Windows/Linux deliver the link as an argv on the second launch.
  app.on('second-instance', (event, argv) => {
    const link = (argv || []).find(a => a.startsWith('musicdigest://'));
    if (link) handleDeepLink(link);
    else showWindow();
  });

  app.whenReady().then(async () => {
    // Load credentials: bundled .env in packaged app, local .env in dev
    const envPath = app.isPackaged
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '..', '.env');
    require('dotenv').config({ path: envPath });

    // Start Express server
    const { startServer } = require('../index');
    try {
      await startServer();
    } catch (err) {
      const { dialog } = require('electron');
      if (err.code === 'EADDRINUSE') {
        dialog.showErrorBox('Music Digest', 'Music Digest is already running.\n\nCheck the menu bar icon (top-right of your screen).');
      } else {
        dialog.showErrorBox('Music Digest — Startup Error', err.message);
      }
      app.quit();
      return;
    }

    buildAppMenu();
    createWindow();
    createTray();

    // Dev shortcuts (unpackaged only)
    if (!app.isPackaged) {
      globalShortcut.register('CommandOrControl+Option+I', () => {
        mainWindow?.webContents.toggleDevTools();
      });
      globalShortcut.register('CommandOrControl+R', () => {
        mainWindow?.webContents.reload();
      });
    }

    appReady = true;
    // Handle a deep link that cold-started the app (buffered open-url on macOS,
    // or passed as argv on Windows/Linux).
    const launchLink = pendingDeepLink || process.argv.find(a => a.startsWith('musicdigest://'));
    if (launchLink) { pendingDeepLink = null; handleDeepLink(launchLink); }
  });

  // Clicking the Dock icon re-shows the window
  app.on('activate', () => {
    if (mainWindow) showWindow();
  });

  // Cmd+Q (and Dock → Quit) must set the flag so the close handler doesn't intercept
  app.on('before-quit', () => {
    isQuitting = true;
  });
}

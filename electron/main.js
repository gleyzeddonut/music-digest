const { app, BrowserWindow, Tray, Menu, nativeImage, shell, globalShortcut, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

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
    mainWindow.loadURL('http://localhost:3000');
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
  app.on('second-instance', showWindow);

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

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, globalShortcut } = require('electron');
const path = require('path');

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
    if (isQuitting) return;
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

    // Check if first-run setup is needed
    const { getConfig } = require('./config-store');
    const setupNeeded = !getConfig('digest_to');

    createWindow(setupNeeded);
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
}

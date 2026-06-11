// Update via GitHub Releases (electron-updater) — MANUAL install only. The app
// never downloads or installs on its own: the sidebar "Update to vX" pill is
// the sole trigger. Clicking it POSTs /api/update/install, which calls
// global.__appUpdater.installUpdate() below: check → download → restart.
// (Squirrel.Mac installs from the ZIP target; the DMG stays for first installs.)
const { app } = require('electron');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function initAutoUpdater({ onBeforeRestart } = {}) {
  // Dev builds are unsigned and have no update feed — Squirrel.Mac would error
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;          // user clicks the pill to update
  autoUpdater.autoInstallOnAppQuit = true;   // a finished download still applies if they quit instead

  autoUpdater.on('error', (err) => {
    // Offline or GitHub hiccup — never bother the user, the next check retries
    console.warn('[updater] update check failed:', err?.message || err);
  });

  // Passive availability checks (no download) keep logs informative; the
  // renderer's own GitHub poll drives the pill UI.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);

  let installing = false;
  // Reached over HTTP by the update pill (same pattern as global.__focusApp —
  // the express server runs in this process).
  global.__appUpdater = {
    async installUpdate() {
      if (installing) return { status: 'installing' };
      installing = true;
      try {
        const check = await autoUpdater.checkForUpdates();
        const available = check?.isUpdateAvailable
          ?? (check?.updateInfo?.version && check.updateInfo.version !== app.getVersion());
        if (!available) {
          installing = false;
          return { status: 'up-to-date', version: app.getVersion() };
        }
        console.log(`[updater] downloading ${check.updateInfo.version}…`);
        await autoUpdater.downloadUpdate();
        console.log('[updater] download complete — restarting to install');
        // Set isQuitting in main.js first, or the hide-on-close handler would
        // intercept the window close and the install would stall
        onBeforeRestart?.();
        autoUpdater.quitAndInstall();
        return { status: 'installing' };
      } catch (err) {
        installing = false;
        console.warn('[updater] install failed:', err?.message || err);
        throw err;
      }
    },
  };
}

module.exports = { initAutoUpdater };

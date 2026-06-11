// Auto-update via GitHub Releases (electron-updater). The update feed is the
// latest-mac.yml that `npm run release` publishes alongside the DMG/ZIPs;
// Squirrel.Mac installs from the ZIP target. Updates download in the
// background, then the user is prompted to restart.
const { app, dialog } = require('electron');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function initAutoUpdater({ onBeforeRestart } = {}) {
  // Dev builds are unsigned and have no update feed — Squirrel.Mac would error
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  // "Later" still applies the update on next quit
  autoUpdater.autoInstallOnAppQuit = true;

  let prompted = false;
  autoUpdater.on('update-downloaded', async (info) => {
    if (prompted) return; // periodic re-checks shouldn't re-prompt
    prompted = true;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `Music Digest ${info.version} has been downloaded.`,
      detail: 'Restart now to apply the update, or keep working — it will install the next time you quit.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      // Set isQuitting in main.js first, or the hide-on-close handler would
      // intercept the window close and the install would stall
      onBeforeRestart?.();
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    // Offline or GitHub hiccup — never bother the user, the next check retries
    console.warn('[updater] update check failed:', err?.message || err);
  });

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);
}

module.exports = { initAutoUpdater };

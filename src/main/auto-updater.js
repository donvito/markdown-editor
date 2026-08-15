const { autoUpdater } = require('electron-updater');
const { ipcMain, app, dialog } = require('electron');

let mainWindow = null;
let isManualCheck = false;
let beforeInstall = null;

function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

function installDownloadedUpdate() {
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 500);
}

function initAutoUpdater(window, options = {}) {
  mainWindow = window;
  beforeInstall = typeof options.beforeInstall === 'function' ? options.beforeInstall : null;

  // --- IPC handlers (available in dev and packaged builds) ---

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { success: false, error: 'Updates are only available in packaged builds' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater:install', async () => {
    if (!app.isPackaged) {
      return { success: false, error: 'Updates are only available in packaged builds' };
    }

    if (beforeInstall) {
      const result = await beforeInstall();
      if (result?.cancelled) {
        return { success: false, cancelled: true };
      }
      if (result?.saving) {
        // Renderer is saving first; installDownloadedUpdate() runs from all-saved-close
        return { success: true, saving: true };
      }
      if (result && result.proceed === false) {
        return { success: false };
      }
    }

    installDownloadedUpdate();
    return { success: true };
  });

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion();
  });

  // electron-updater only works against published GitHub releases
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // --- Event handlers ---

  autoUpdater.on('checking-for-update', () => {
    safeSend('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    if (isManualCheck) {
      isManualCheck = false;
    }
    safeSend('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    if (isManualCheck) {
      isManualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates Available',
        message: 'You\'re on the latest version',
        detail: `Markdown Editor v${app.getVersion()} is up to date.`,
        buttons: ['OK']
      });
    }
    safeSend('updater:not-available', {
      version: info.version
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    safeSend('updater:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    safeSend('updater:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  });

  autoUpdater.on('error', (error) => {
    if (isManualCheck) {
      isManualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates',
        detail: error ? error.message : 'An unknown error occurred. Please try again later.',
        buttons: ['OK']
      });
    }
    safeSend('updater:error', {
      message: error ? error.message : 'Unknown update error'
    });
  });

  // Check for updates after a short delay so startup is not blocked
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail — user might be offline
    });
  }, 5000);
}

/**
 * Trigger a manual update check with dialog feedback.
 */
function checkForUpdatesManual() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates are only available in the packaged app',
      detail: `You're running a development build of Markdown Editor v${app.getVersion()}.`,
      buttons: ['OK']
    });
    return;
  }

  isManualCheck = true;
  autoUpdater.checkForUpdates().catch((error) => {
    isManualCheck = false;
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates',
      detail: error ? error.message : 'An unknown error occurred. Please try again later.',
      buttons: ['OK']
    });
  });
}

module.exports = { initAutoUpdater, checkForUpdatesManual, installDownloadedUpdate };

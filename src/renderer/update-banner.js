/**
 * Update Banner — shows download progress and install prompt for auto-updates.
 *
 * Only shows when an update is actively being downloaded or ready to install.
 * Manual "Check for Updates" uses native dialogs (handled in main process).
 */
(function () {
  'use strict';

  const banner = document.getElementById('update-banner');
  const message = document.getElementById('update-message');
  const progressBar = document.getElementById('update-progress-bar');
  const progressFill = document.getElementById('update-progress-fill');
  const actionBtn = document.getElementById('update-action-btn');
  const dismissBtn = document.getElementById('update-dismiss-btn');

  if (!banner || !window.updaterAPI) return;

  let updateVersion = '';
  let appVersion = '';
  let dismissed = false;

  // Fetch and display current app version
  const versionLabel = document.getElementById('sidebar-version');
  const headerVersion = document.getElementById('app-version');
  window.updaterAPI.getVersion().then((version) => {
    appVersion = version;
    if (versionLabel) versionLabel.textContent = `v${version}`;
    if (headerVersion) headerVersion.textContent = `v${version}`;
  });

  // --- Helpers ---

  function show() {
    if (dismissed) return;
    banner.style.display = '';
    banner.classList.remove('hidden');
    // Trigger reflow for slide-in animation
    banner.offsetHeight;
    banner.classList.add('visible');
  }

  function hide() {
    banner.classList.remove('visible');
    // Wait for slide-out transition, then fully hide
    setTimeout(() => {
      banner.classList.add('hidden');
      banner.style.display = 'none';
    }, 400);
  }

  function setProgress(percent) {
    progressBar.classList.remove('hidden');
    progressFill.style.width = `${percent}%`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // --- Event listeners ---

  window.updaterAPI.onUpdateAvailable((data) => {
    updateVersion = data.version;
    dismissed = false;
    banner.className = 'update-banner downloading';
    message.textContent = `Downloading update v${data.version}...`;
    progressBar.classList.remove('hidden');
    progressFill.style.width = '0%';
    actionBtn.classList.add('hidden');
    show();
  });

  window.updaterAPI.onDownloadProgress((data) => {
    const transferred = formatBytes(data.transferred);
    const total = formatBytes(data.total);
    message.textContent = `Downloading v${updateVersion}  —  ${transferred} / ${total}`;
    setProgress(data.percent);
  });

  window.updaterAPI.onUpdateDownloaded((data) => {
    updateVersion = data.version;
    banner.className = 'update-banner ready';
    message.textContent = `Update v${data.version} is ready to install`;
    progressBar.classList.add('hidden');
    actionBtn.classList.remove('hidden');
    actionBtn.textContent = 'Restart & Update';
    actionBtn.disabled = false;
    show();
  });

  window.updaterAPI.onError(() => {
    // Only show error if the banner was already visible (mid-download failure)
    if (banner.classList.contains('visible')) {
      banner.className = 'update-banner error';
      message.textContent = 'Update failed — will retry later';
      progressBar.classList.add('hidden');
      actionBtn.classList.add('hidden');
      setTimeout(hide, 5000);
    }
  });

  // --- Button handlers ---

  actionBtn.addEventListener('click', async () => {
    actionBtn.textContent = 'Restarting...';
    actionBtn.disabled = true;
    const result = await window.updaterAPI.installUpdate();
    if (result && (result.cancelled || result.success === false)) {
      actionBtn.textContent = 'Restart & Update';
      actionBtn.disabled = false;
    }
  });

  dismissBtn.addEventListener('click', () => {
    dismissed = true;
    hide();
  });
})();

const fs = require('fs');
const path = require('path');

const { listMarkdownFiles } = require('./folder-scanner');

const DEBOUNCE_MS = 200;
const POLL_MS = 2000;

let activeSession = null;
let nextSessionId = 0;

function listingHasSamePaths(previous, next) {
  if (previous.length !== next.length) return false;

  // Preserve casing so external case-only renames also refresh display names
  // on case-insensitive filesystems such as Windows.
  const previousPaths = new Set(previous.map((file) => file.path));
  if (previousPaths.size !== next.length) return false;

  return next.every((file) => previousPaths.has(file.path));
}

function rootIdentity(folderPath) {
  try {
    const stat = fs.statSync(folderPath);
    return `${stat.dev}:${stat.ino}`;
  } catch {
    return null;
  }
}

function isActive(session) {
  return activeSession === session;
}

function closeNativeWatcher(session) {
  if (!session.watcher) return;

  try {
    session.watcher.close();
  } catch {
    // The watcher may already have closed after an error.
  }
  session.watcher = null;
}

function attachNativeWatcher(session) {
  if (!isActive(session) || session.watcher) return;

  try {
    const watcher = fs.watch(
      session.folderPath,
      { recursive: true, encoding: 'utf8' },
      () => scheduleScan(session)
    );

    session.watcher = watcher;
    watcher.on('error', () => {
      if (!isActive(session) || session.watcher !== watcher) return;
      closeNativeWatcher(session);
    });
  } catch {
    // Recursive fs.watch is unavailable on some platforms and can fail while
    // the folder is temporarily missing. The polling reconciliation remains
    // active in both cases.
  }
}

function scanAndNotify(session) {
  if (!isActive(session)) return;

  const files = listMarkdownFiles(session.folderPath);
  if (!isActive(session)) return;
  if (listingHasSamePaths(session.files, files)) return;

  session.files = files;
  session.callback(files);
}

function scheduleScan(session) {
  if (!isActive(session)) return;

  if (session.debounceTimer) {
    clearTimeout(session.debounceTimer);
  }

  session.debounceTimer = setTimeout(() => {
    session.debounceTimer = null;
    scanAndNotify(session);
  }, DEBOUNCE_MS);
}

function reconcile(session) {
  if (!isActive(session)) return;

  const identity = rootIdentity(session.folderPath);
  if (identity !== session.rootIdentity) {
    session.rootIdentity = identity;
    closeNativeWatcher(session);
    attachNativeWatcher(session);
  }

  // Polling is both a fallback for platforms without recursive fs.watch and
  // a reconciliation pass for events missed during atomic replacements.
  scanAndNotify(session);
}

function watch(folderPath, callback) {
  close();

  const session = {
    id: ++nextSessionId,
    folderPath: path.resolve(folderPath),
    callback,
    files: [],
    rootIdentity: null,
    watcher: null,
    debounceTimer: null,
    pollTimer: null
  };

  activeSession = session;
  session.rootIdentity = rootIdentity(session.folderPath);
  session.files = listMarkdownFiles(session.folderPath);

  attachNativeWatcher(session);

  session.pollTimer = setInterval(() => reconcile(session), POLL_MS);
  // A folder watcher should not keep the main process alive on its own.
  if (typeof session.pollTimer.unref === 'function') {
    session.pollTimer.unref();
  }
}

function close() {
  const session = activeSession;
  if (!session) return;

  activeSession = null;
  if (session.debounceTimer) clearTimeout(session.debounceTimer);
  if (session.pollTimer) clearInterval(session.pollTimer);
  session.debounceTimer = null;
  session.pollTimer = null;
  closeNativeWatcher(session);
}

module.exports = { watch, close };

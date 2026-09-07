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

function fileIdentity(filePath) {
  try {
    const stat = fs.statSync(filePath);
    // Zero inode/device values are not useful for identifying a rename.
    if (!stat.ino) return null;
    return `${stat.dev}:${stat.ino}`;
  } catch {
    return null;
  }
}

function snapshotIdentities(files) {
  const snapshot = new Map();
  files.forEach((file) => {
    const identity = fileIdentity(file.path);
    if (identity) snapshot.set(file.path, identity);
  });
  return snapshot;
}

function confirmedRenames(previousSnapshot, nextSnapshot, previousFiles, nextFiles) {
  const removedByIdentity = new Map();
  const addedByIdentity = new Map();
  const previousCounts = new Map();
  const nextCounts = new Map();
  previousSnapshot.forEach((identity) => previousCounts.set(identity, (previousCounts.get(identity) || 0) + 1));
  nextSnapshot.forEach((identity) => nextCounts.set(identity, (nextCounts.get(identity) || 0) + 1));
  const nextPaths = new Set(nextFiles.map((file) => file.path));
  const previousPaths = new Set(previousFiles.map((file) => file.path));

  previousSnapshot.forEach((identity, filePath) => {
    if (!nextPaths.has(filePath)) {
      if (!removedByIdentity.has(identity)) removedByIdentity.set(identity, []);
      removedByIdentity.get(identity).push(filePath);
    }
  });
  nextSnapshot.forEach((identity, filePath) => {
    if (!previousPaths.has(filePath)) {
      if (!addedByIdentity.has(identity)) addedByIdentity.set(identity, []);
      addedByIdentity.get(identity).push(filePath);
    }
  });

  const renames = [];
  removedByIdentity.forEach((oldPaths, identity) => {
    const newPaths = addedByIdentity.get(identity) || [];
    // Require a one-to-one identity match. This avoids guessing when hard
    // links or duplicate scanner entries make an identity ambiguous.
    if (oldPaths.length === 1 && newPaths.length === 1 &&
        previousCounts.get(identity) === 1 && nextCounts.get(identity) === 1) {
      renames.push({ oldPath: oldPaths[0], newPath: newPaths[0] });
    }
  });
  return renames;
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
  const nextIdentities = snapshotIdentities(files);
  if (listingHasSamePaths(session.files, files)) {
    session.identities = nextIdentities;
    return;
  }
  const renames = confirmedRenames(session.identities, nextIdentities, session.files, files);
  session.files = files;
  session.identities = nextIdentities;
  session.callback(files, renames.length ? { renames } : undefined);
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
    identities: new Map(),
    rootIdentity: null,
    watcher: null,
    debounceTimer: null,
    pollTimer: null
  };

  activeSession = session;
  session.rootIdentity = rootIdentity(session.folderPath);
  session.files = listMarkdownFiles(session.folderPath);
  session.identities = snapshotIdentities(session.files);

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

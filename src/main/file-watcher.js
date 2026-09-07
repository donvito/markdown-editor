const fs = require('fs');
const path = require('path');

// Directory watch + debounce: watching the file itself breaks on Windows
// (and many editors) when the file is replaced atomically (write temp + rename).
const DEBOUNCE_MS = 200;
const IGNORE_MS = 700;
const READ_RETRIES = 4;
const READ_RETRY_MS = 60;

const dirWatchers = new Map(); // dir -> { watcher, files: Map<nameKey, Set<fullPath>>, timers }
const ignoreUntil = new Map(); // path -> timestamp
const recreateCount = new Map(); // dir -> number of watcher restarts
let onChange = null;

function isWindows() {
  return process.platform === 'win32';
}

function nameKey(name) {
  return isWindows() ? String(name).toLowerCase() : String(name);
}

function canonicalize(filePath) {
  if (!filePath || String(filePath).startsWith('untitled:')) {
    return filePath;
  }
  const normalized = path.normalize(filePath);
  try {
    return fs.realpathSync.native(normalized);
  } catch {
    return normalized;
  }
}

function samePath(a, b) {
  if (!a || !b) return false;
  const na = path.normalize(a);
  const nb = path.normalize(b);
  return isWindows() ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function setOnChange(cb) {
  onChange = cb;
}

function ignore(filePath) {
  if (!filePath || String(filePath).startsWith('untitled:')) return;
  const until = Date.now() + IGNORE_MS;
  ignoreUntil.set(path.normalize(filePath), until);
  ignoreUntil.set(canonicalize(filePath), until);
}

function isIgnored(filePath) {
  const now = Date.now();
  const keys = [filePath, path.normalize(filePath), canonicalize(filePath)];
  return keys.some((key) => {
    const until = ignoreUntil.get(key);
    return until && now < until;
  });
}

function watch(filePath) {
  if (!filePath || String(filePath).startsWith('untitled:')) return;

  const canonical = canonicalize(filePath);
  const dir = path.dirname(canonical);
  const key = nameKey(path.basename(canonical));

  let entry = dirWatchers.get(dir);
  if (!entry) {
    entry = { watcher: null, files: new Map(), timers: new Map() };
    try {
      entry.watcher = fs.watch(dir, { persistent: true, encoding: 'utf8' }, (_eventType, filename) => {
        handleDirEvent(dir, filename);
      });
      entry.watcher.on('error', () => {
        // Watcher can die on Windows if the directory is replaced or becomes unavailable.
        const paths = [];
        for (const set of entry.files.values()) {
          paths.push(...set);
        }
        const attempts = (recreateCount.get(dir) || 0) + 1;
        recreateCount.set(dir, attempts);
        closeDirWatcher(dir);
        if (attempts > 3) return;
        setTimeout(() => {
          paths.forEach(watch);
        }, 250);
      });
    } catch {
      return;
    }
    recreateCount.delete(dir);
    dirWatchers.set(dir, entry);
  }

  if (!entry.files.has(key)) {
    entry.files.set(key, new Set());
  }
  entry.files.get(key).add(canonical);
}

function unwatch(filePath) {
  if (!filePath || String(filePath).startsWith('untitled:')) return;

  const candidates = [canonicalize(filePath), path.normalize(filePath)];

  for (const [dir, entry] of dirWatchers) {
    for (const [key, set] of entry.files) {
      for (const watchedPath of [...set]) {
        if (candidates.some((candidate) => samePath(watchedPath, candidate))) {
          set.delete(watchedPath);
          const timer = entry.timers.get(watchedPath);
          if (timer) {
            clearTimeout(timer);
            entry.timers.delete(watchedPath);
          }
        }
      }
      if (set.size === 0) {
        entry.files.delete(key);
      }
    }

    if (entry.files.size === 0) {
      closeDirWatcher(dir);
    }
  }
}

function moveWatch(oldPath, newPath) {
  const watched = [];
  let destinationWatched = false;
  for (const entry of dirWatchers.values()) {
    for (const set of entry.files.values()) {
      for (const watchedPath of set) {
        if (samePath(watchedPath, oldPath)) watched.push(watchedPath);
        if (samePath(watchedPath, newPath) && !samePath(watchedPath, oldPath)) {
          destinationWatched = true;
        }
      }
    }
  }
  if (watched.length === 0 || destinationWatched) return false;
  unwatch(oldPath);
  const canonicalNew = canonicalize(newPath);
  watch(canonicalNew);
  // A rename can be followed immediately by an external write. Re-read the
  // new path after moving the watcher so clean tabs do not retain stale data.
  scheduleRead(path.dirname(canonicalNew), canonicalNew);
  return true;
}

function closeDirWatcher(dir) {
  const entry = dirWatchers.get(dir);
  if (!entry) return;
  for (const timer of entry.timers.values()) {
    clearTimeout(timer);
  }
  try {
    entry.watcher?.close();
  } catch {
    // ignore
  }
  dirWatchers.delete(dir);
}

function closeAll() {
  for (const dir of [...dirWatchers.keys()]) {
    closeDirWatcher(dir);
  }
  ignoreUntil.clear();
  recreateCount.clear();
}

function handleDirEvent(dir, filename) {
  const entry = dirWatchers.get(dir);
  if (!entry) return;

  const candidates = [];
  if (filename) {
    const set = entry.files.get(nameKey(filename));
    if (set) {
      candidates.push(...set);
    }
  } else {
    // Linux can omit filename; fall back to every watched file in this folder
    for (const set of entry.files.values()) {
      candidates.push(...set);
    }
  }

  for (const filePath of candidates) {
    scheduleRead(dir, filePath);
  }
}

function scheduleRead(dir, filePath) {
  const entry = dirWatchers.get(dir);
  if (!entry) return;
  const existing = entry.timers.get(filePath);
  if (existing) {
    clearTimeout(existing);
  }
  entry.timers.set(filePath, setTimeout(() => {
    entry.timers.delete(filePath);
    readAndNotify(filePath);
  }, DEBOUNCE_MS));
}

function readAndNotify(filePath) {
  if (isIgnored(filePath)) return;
  readWithRetry(filePath, 0);
}

function readWithRetry(filePath, attempt) {
  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) {
      const retryable = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOENT';
      if (attempt < READ_RETRIES && retryable) {
        setTimeout(() => readWithRetry(filePath, attempt + 1), READ_RETRY_MS);
      }
      return;
    }
    if (isIgnored(filePath)) return;
    if (typeof onChange === 'function') {
      onChange(filePath, content);
    }
  });
}

module.exports = {
  canonicalize,
  setOnChange,
  watch,
  unwatch,
  moveWatch,
  ignore,
  closeAll
};

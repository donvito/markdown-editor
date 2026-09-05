const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folderWatcher = require('../src/main/folder-watcher');

const POLL_WAIT_MS = 6000;

function waitFor(predicate, timeout = POLL_WAIT_MS) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      let result;
      try {
        result = predicate();
      } catch (error) {
        reject(error);
        return;
      }
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - started >= timeout) {
        reject(new Error(`Timed out after ${timeout}ms`));
        return;
      }
      setTimeout(check, 50);
    }
    check();
  });
}

function paths(files) {
  return files.map((file) => file.relativePath).sort();
}

test.afterEach(() => {
  folderWatcher.close();
});

test('reports markdown files copied into the root and a nested directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-'));
  const source = path.join(root, '..', `${path.basename(root)}-source.md`);
  fs.writeFileSync(source, '# copied');
  fs.mkdirSync(path.join(root, 'nested'));

  const changes = [];
  folderWatcher.watch(root, (files) => changes.push(paths(files)));

  fs.copyFileSync(source, path.join(root, 'copied.md'));
  fs.copyFileSync(source, path.join(root, 'nested', 'deep.markdown'));

  await waitFor(() => changes.some((listing) =>
    listing.includes('copied.md') && listing.includes(path.join('nested', 'deep.markdown'))
  ));

  const changeCount = changes.length;
  fs.writeFileSync(path.join(root, 'copied.md'), '# edited content');
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(changes.length, changeCount);

  fs.rmSync(source, { force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

test('reports rename and delete operations', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-'));
  fs.writeFileSync(path.join(root, 'before.md'), 'before');
  fs.writeFileSync(path.join(root, 'remove.txt'), 'remove');

  const changes = [];
  folderWatcher.watch(root, (files) => changes.push(paths(files)));

  fs.renameSync(path.join(root, 'before.md'), path.join(root, 'after.md'));
  fs.unlinkSync(path.join(root, 'remove.txt'));

  await waitFor(() => changes.some((listing) =>
    listing.includes('after.md') && !listing.includes('before.md')
  ));

  fs.rmSync(root, { recursive: true, force: true });
});

test('reports a case-only rename as a path change', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-case-rename-'));
  fs.writeFileSync(path.join(root, 'lower.md'), 'before');

  const changes = [];
  folderWatcher.watch(root, (files) => changes.push(paths(files)));

  try {
    fs.renameSync(path.join(root, 'lower.md'), path.join(root, 'LOWER.md'));

    await waitFor(() => changes.some((listing) =>
      listing.includes('LOWER.md') && !listing.includes('lower.md')
    ));
  } finally {
    folderWatcher.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('switching folders and closing suppress stale callbacks', async () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-first-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-second-'));
  fs.writeFileSync(path.join(first, 'first.md'), 'first');
  fs.writeFileSync(path.join(second, 'second.md'), 'second');

  const firstChanges = [];
  const secondChanges = [];
  folderWatcher.watch(first, (files) => firstChanges.push(paths(files)));
  folderWatcher.watch(second, (files) => secondChanges.push(paths(files)));

  fs.writeFileSync(path.join(first, 'stale.md'), 'stale');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(firstChanges.length, 0);

  fs.writeFileSync(path.join(second, 'current.md'), 'current');
  await waitFor(() => secondChanges.some((listing) => listing.includes('current.md')));

  folderWatcher.close();
  const countAfterClose = secondChanges.length;
  fs.writeFileSync(path.join(second, 'closed.md'), 'closed');
  await new Promise((resolve) => setTimeout(resolve, 2300));
  assert.equal(secondChanges.length, countAfterClose);

  fs.rmSync(first, { recursive: true, force: true });
  fs.rmSync(second, { recursive: true, force: true });
});

test('falls back to polling when fs.watch cannot be attached', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-fallback-'));
  const source = path.join(root, '..', `${path.basename(root)}-source.md`);
  fs.writeFileSync(source, '# copied');

  const changes = [];
  const nativeWatch = fs.watch;
  let watchAttempts = 0;
  try {
    fs.watch = () => {
      watchAttempts += 1;
      throw new Error('recursive watching is unavailable');
    };
    folderWatcher.watch(root, (files) => changes.push(paths(files)));
  } finally {
    fs.watch = nativeWatch;
  }

  try {
    assert.equal(watchAttempts, 1);
    fs.copyFileSync(source, path.join(root, 'polled.md'));

    await waitFor(() => changes.some((listing) => listing.includes('polled.md')));
  } finally {
    folderWatcher.close();
    fs.rmSync(source, { force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports markdown files in a nested directory created after watching starts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-new-nested-'));
  const source = path.join(root, '..', `${path.basename(root)}-source.md`);
  fs.writeFileSync(source, '# copied');

  const changes = [];
  folderWatcher.watch(root, (files) => changes.push(paths(files)));

  try {
    const nested = path.join(root, 'new-nested');
    fs.mkdirSync(nested);
    fs.copyFileSync(source, path.join(nested, 'deep.md'));

    await waitFor(() => changes.some((listing) =>
      listing.includes(path.join('new-nested', 'deep.md'))
    ));
  } finally {
    folderWatcher.close();
    fs.rmSync(source, { force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reconnects when the watched root is deleted and recreated', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-watcher-recreated-'));

  const changes = [];
  folderWatcher.watch(root, (files) => changes.push(paths(files)));

  try {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'recreated.md'), '# recreated');

    await waitFor(() => changes.some((listing) => listing.includes('recreated.md')));
  } finally {
    folderWatcher.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

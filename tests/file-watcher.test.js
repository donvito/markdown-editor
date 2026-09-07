const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const watcher = require('../src/main/file-watcher');

function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  return new Promise((resolve, reject) => {
    function check() {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for destination content'));
      setTimeout(check, 25);
    }
    check();
  });
}

test('moving a watched file reads edits made before the destination watcher attached', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'file-rename-')));
  const before = path.join(root, 'before.md');
  const after = path.join(root, 'after.md');
  const changes = [];
  try {
    fs.writeFileSync(before, 'original');
    watcher.setOnChange((filePath, content) => changes.push({ filePath, content }));
    watcher.watch(before);
    fs.renameSync(before, after);
    fs.writeFileSync(after, 'edited during rename');
    assert.equal(watcher.moveWatch(before, after), true);
    await waitFor(() => changes.some((change) => change.filePath === after && change.content === 'edited during rename'));
  } finally {
    watcher.closeAll();
    watcher.setOnChange(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('moving a file preserves a separately watched destination', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'file-collision-')));
  const before = path.join(root, 'before.md');
  const after = path.join(root, 'after.md');
  try {
    fs.writeFileSync(before, 'source');
    fs.writeFileSync(after, 'destination');
    watcher.watch(before);
    watcher.watch(after);
    assert.equal(watcher.moveWatch(before, after), false);
    assert.equal(watcher.moveWatch(path.join(root, 'unopened.md'), after), false);
  } finally {
    watcher.closeAll();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

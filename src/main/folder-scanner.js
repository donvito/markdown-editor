const fs = require('fs');
const path = require('path');

const MARKDOWN_EXTS = new Set(['.md', '.markdown', '.txt']);
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.jj',
  'dist',
  'build',
  'out',
  '.next',
  '.cache',
  'vendor',
  '__pycache__',
  '.idea',
  '.vscode',
  'coverage',
  '.turbo',
  '.output'
]);

const MAX_FILES = 2000;
const MAX_DEPTH = 10;

function isMarkdownFile(name) {
  return MARKDOWN_EXTS.has(path.extname(name).toLowerCase());
}

function listMarkdownFiles(rootDir) {
  const results = [];
  const root = path.resolve(rootDir);

  function walk(dir, depth) {
    if (results.length >= MAX_FILES || depth > MAX_DEPTH) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;

      const name = entry.name;
      if (name === '.' || name === '..') continue;

      const full = path.join(dir, name);
      let stat = entry;
      try {
        if (entry.isSymbolicLink()) {
          continue;
        }
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (name.startsWith('.') || IGNORE_DIRS.has(name)) continue;
        walk(full, depth + 1);
        continue;
      }

      if (stat.isFile() && isMarkdownFile(name)) {
        results.push({
          path: full,
          name,
          relativePath: path.relative(root, full)
        });
      }
    }
  }

  walk(root, 0);
  results.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })
  );
  return results;
}

module.exports = { listMarkdownFiles, isMarkdownFile };

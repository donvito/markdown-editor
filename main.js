const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const pluginManager = require('./src/main/plugin-manager');
const { makeAIRequest, makeAIRequestStream } = require('./src/main/ai-service');
const { initAutoUpdater, checkForUpdatesManual, installDownloadedUpdate } = require('./src/main/auto-updater');
const fileWatcher = require('./src/main/file-watcher');
const folderWatcher = require('./src/main/folder-watcher');
const { listMarkdownFiles } = require('./src/main/folder-scanner');

let streamIdCounter = 0;
const activeStreams = new Map();

// Configure marked with syntax highlighting
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      // Skip highlighting for mermaid blocks — they'll be rendered as diagrams
      if (lang === 'mermaid') {
        return code;
      }
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    }
  })
);

marked.setOptions({
  gfm: true,
  breaks: true
});

let mainWindow;
let unsavedFiles = new Map(); // Track unsaved files in main process
let isQuitting = false;
let pendingUpdateInstall = false;

function handleClose() {
  if (unsavedFiles.size === 0) {
    return true; // Allow close
  }

  const fileNames = Array.from(unsavedFiles.values()).join(', ');
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'You have unsaved changes',
    detail: `The following files have unsaved changes:\n${fileNames}\n\nDo you want to save before closing?`
  });

  if (result === 0) {
    // Save - tell renderer to save all, then close
    mainWindow.webContents.send('save-all-and-close');
    return false; // Don't close yet, wait for save
  } else if (result === 1) {
    // Don't Save - clear unsaved and close
    unsavedFiles.clear();
    return true; // Allow close
  }
  // Cancel
  return false;
}

function sameFilePath(a, b) {
  const left = path.normalize(a);
  const right = path.normalize(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function moveTrackedFile(oldPath, newPath) {
  const moved = fileWatcher.moveWatch(oldPath, newPath);
  if (!moved) return;
  const trackedPath = [...unsavedFiles.keys()].find((candidate) => sameFilePath(candidate, oldPath));
  if (trackedPath) {
    unsavedFiles.delete(trackedPath);
    unsavedFiles.set(newPath, path.basename(newPath));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show until ready
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  // Show window maximized once ready (avoids animation)
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Handle window close with unsaved changes check
  mainWindow.on('close', (e) => {
    if (!isQuitting && unsavedFiles.size > 0) {
      e.preventDefault();
      if (handleClose()) {
        isQuitting = true;
        mainWindow.close();
      }
    }
  });

  // Clean up active streams when window closes
  mainWindow.on('closed', () => {
    activeStreams.forEach((abort) => {
      if (typeof abort === 'function') abort();
    });
    activeStreams.clear();
    fileWatcher.closeAll();
    folderWatcher.close();
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-file')
        },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: openFile
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: openFolder
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('trigger-save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('trigger-save-as')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => mainWindow.close()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Preview',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow.webContents.send('set-view-mode', 'preview')
        },
        {
          label: 'Editor',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow.webContents.send('set-view-mode', 'edit')
        },
        {
          label: 'Split',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow.webContents.send('set-view-mode', 'split')
        },
        { type: 'separator' },
        {
          label: 'Wide Markdown Width',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => mainWindow.webContents.send('toggle-wide-view')
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('open-settings')
        },
        {
          label: 'AI Settings...',
          click: () => mainWindow.webContents.send('open-ai-settings')
        },
        {
          label: 'Check for Updates...',
          click: () => checkForUpdatesManual()
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Markdown Editor',
              message: 'Markdown Editor',
              detail: `Version ${app.getVersion()}\n\nA simple and lightweight Markdown editor.\n\nAuthor: Melvin Vivas\nWebsite: donvitocodes.com`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ]);

  Menu.setApplicationMenu(menu);
}

function emitFolderOpened(folderPath) {
  const canonical = fileWatcher.canonicalize(folderPath);
  folderWatcher.watch(canonical, (files, change) => {
    (change?.renames || []).forEach(({ oldPath, newPath }) => {
      moveTrackedFile(oldPath, newPath);
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('folder-changed', {
        folderPath: canonical,
        files,
        renames: change?.renames || []
      });
    }
  });
  const files = listMarkdownFiles(canonical);
  const payload = {
    folderPath: canonical,
    folderName: path.basename(canonical),
    files
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('folder-opened', payload);
  }
  return { success: true, ...payload };
}

async function openFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths[0]) {
    return { success: false, canceled: true };
  }

  try {
    return emitFolderOpened(result.filePaths[0]);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function emitFileOpened(filePath) {
  const canonical = fileWatcher.canonicalize(filePath);
  const content = fs.readFileSync(canonical, 'utf-8');
  fileWatcher.watch(canonical);
  mainWindow.webContents.send('file-opened', { filePath: canonical, content });
  return canonical;
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    emitFileOpened(result.filePaths[0]);
  }
}

// IPC Handlers
ipcMain.handle('open-file-dialog', openFile);
ipcMain.handle('open-folder-dialog', openFolder);
ipcMain.on('close-folder', () => folderWatcher.close());

ipcMain.handle('open-folder-path', (event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return { success: false, error: 'Not a folder' };
    }
    return emitFolderOpened(folderPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-folder-markdown', (event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return { success: false, error: 'Folder not found' };
    }
    return emitFolderOpened(folderPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('show-item-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
  try {
    // Check if destination file already exists
    // Allow case-only renames on case-insensitive filesystems by checking if paths point to the same file
    if (fs.existsSync(newPath)) {
      const oldStats = fs.statSync(oldPath);
      const newStats = fs.statSync(newPath);
      const isSameFile = oldStats.ino === newStats.ino && oldStats.dev === newStats.dev;
      if (!isSameFile) {
        return { success: false, error: 'A file with that name already exists' };
      }
    }
    fileWatcher.unwatch(oldPath);
    fs.renameSync(oldPath, newPath);
    const canonicalNew = fileWatcher.canonicalize(newPath);
    fileWatcher.ignore(canonicalNew);
    fileWatcher.watch(canonicalNew);

    // Update unsaved files tracking if the old path was tracked
    if (unsavedFiles.has(oldPath)) {
      const fileName = canonicalNew.split(/[/\\]/).pop();
      unsavedFiles.delete(oldPath);
      unsavedFiles.set(canonicalNew, fileName);
    }

    return { success: true, newPath: canonicalNew };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('parse-markdown', (event, content) => {
  return marked.parse(content);
});

ipcMain.handle('save-file', (event, filePath, content) => {
  try {
    fileWatcher.ignore(filePath);
    fs.writeFileSync(filePath, content, 'utf-8');
    mainWindow.webContents.send('file-saved');
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file-as', async (event, content, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'untitled.md',
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    const canonical = fileWatcher.canonicalize(result.filePath);
    fileWatcher.ignore(canonical);
    fileWatcher.watch(canonical);
    return { success: true, filePath: canonical };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file-path', (event, filePath) => {
  try {
    emitFileOpened(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Show confirm dialog for closing unsaved file
ipcMain.handle('confirm-close-file', (event, fileName) => {
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: `"${fileName}" has unsaved changes`,
    detail: 'Do you want to save before closing?'
  });
  return result; // 0 = Save, 1 = Don't Save, 2 = Cancel
});

// Track unsaved file state
ipcMain.on('file-unsaved', (event, filePath, fileName) => {
  unsavedFiles.set(filePath, fileName);
});

ipcMain.on('file-saved-state', (event, filePath) => {
  unsavedFiles.delete(filePath);
});

ipcMain.on('file-closed', (event, filePath) => {
  unsavedFiles.delete(filePath);
  fileWatcher.unwatch(filePath);
});

ipcMain.on('all-saved-close', () => {
  unsavedFiles.clear();
  isQuitting = true;
  if (pendingUpdateInstall) {
    pendingUpdateInstall = false;
    installDownloadedUpdate();
    return;
  }
  mainWindow.close();
});

// Plugin IPC Handlers
ipcMain.handle('plugin:list', () => {
  return pluginManager.getPlugins();
});

ipcMain.handle('plugin:get-manifest', (event, pluginId) => {
  return pluginManager.getManifest(pluginId);
});

ipcMain.handle('plugin:enable', (event, pluginId) => {
  return pluginManager.enablePlugin(pluginId);
});

ipcMain.handle('plugin:disable', (event, pluginId) => {
  return pluginManager.disablePlugin(pluginId);
});

ipcMain.handle('plugin:get-setting', (event, pluginId, key) => {
  return pluginManager.getSetting(pluginId, key);
});

ipcMain.handle('plugin:set-setting', (event, pluginId, key, value, isSecure) => {
  pluginManager.setSetting(pluginId, key, value, isSecure);
  return { success: true };
});

ipcMain.handle('plugin:register-context-menu', (event, pluginId, items) => {
  // TODO: Plugin context menu items registration - not yet implemented
  // Items are registered but not currently displayed in context menus
  return { success: true };
});

ipcMain.handle('plugin:ai-request', async (event, pluginId, endpoint, payload) => {
  try {
    const result = await makeAIRequest(pluginId, endpoint, payload);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper to safely send IPC messages (window may be closed)
function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// Streaming AI request handler
ipcMain.handle('plugin:ai-request-stream', (event, pluginId, endpoint, payload) => {
  const streamId = `stream-${++streamIdCounter}`;

  const abort = makeAIRequestStream(
    pluginId,
    endpoint,
    payload,
    (chunk) => {
      // Send chunk to renderer
      safeSend('plugin:ai-stream-chunk', { streamId, chunk });
    },
    () => {
      // Stream complete
      safeSend('plugin:ai-stream-done', { streamId });
      activeStreams.delete(streamId);
    },
    (error) => {
      // Stream error
      safeSend('plugin:ai-stream-error', { streamId, error: error.message });
      activeStreams.delete(streamId);
    }
  );

  // Only track stream if it actually started (abort function returned)
  if (abort) {
    activeStreams.set(streamId, abort);
  }
  return { streamId };
});

// Abort streaming request
ipcMain.handle('plugin:ai-request-abort', (event, streamId) => {
  const abort = activeStreams.get(streamId);
  if (abort) {
    abort();
    activeStreams.delete(streamId);
  }
});

// Context menu handler
ipcMain.handle('show-context-menu', (event, selectionData) => {
  const { selectedText, selectionStart, selectionEnd, canUseAI = true } = selectionData;
  const hasSelection = Boolean(selectedText && selectedText.length > 0);

  const menuItems = [
    {
      label: 'Cut',
      accelerator: 'CmdOrCtrl+X',
      click: () => {
        mainWindow.webContents.send('editor:cut', { selectedText, selectionStart, selectionEnd });
      }
    },
    {
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      click: () => {
        mainWindow.webContents.send('editor:copy', { selectedText, selectionStart, selectionEnd });
      }
    },
    {
      label: 'Paste',
      accelerator: 'CmdOrCtrl+V',
      click: () => {
        mainWindow.webContents.send('editor:paste');
      }
    }
  ];

  // "Edit with AI" works with or without a selection (no selection generates
  // from the prompt alone), so it is always listed — greyed out when the AI
  // plugin is off or the editor is not the visible pane.
  menuItems.push({ type: 'separator' });
  menuItems.push({
    label: 'Edit with AI...',
    accelerator: 'CmdOrCtrl+K',
    enabled: canUseAI,
    click: () => {
      mainWindow.webContents.send('ai:action', { actionId: 'generate', selectedText, selectionStart, selectionEnd });
    }
  });

  // The rewrite actions transform existing text, so they need a selection.
  if (canUseAI && hasSelection) {
    menuItems.push({
      label: 'Make Shorter',
      click: () => {
        mainWindow.webContents.send('ai:action', { actionId: 'shorter', selectedText, selectionStart, selectionEnd });
      }
    });
    menuItems.push({
      label: 'Make Longer',
      click: () => {
        mainWindow.webContents.send('ai:action', { actionId: 'longer', selectedText, selectionStart, selectionEnd });
      }
    });
    menuItems.push({
      label: 'More Formal',
      click: () => {
        mainWindow.webContents.send('ai:action', { actionId: 'formal', selectedText, selectionStart, selectionEnd });
      }
    });
    menuItems.push({
      label: 'More Casual',
      click: () => {
        mainWindow.webContents.send('ai:action', { actionId: 'casual', selectedText, selectionStart, selectionEnd });
      }
    });
    menuItems.push({
      label: 'Fix Grammar & Spelling',
      click: () => {
        mainWindow.webContents.send('ai:action', { actionId: 'fix-grammar', selectedText, selectionStart, selectionEnd });
      }
    });
  }

  const menu = Menu.buildFromTemplate(menuItems);
  menu.popup({ window: mainWindow });
});

app.whenReady().then(() => {
  // Initialize plugin manager
  pluginManager.initialize(__dirname);
  createWindow();

  fileWatcher.setOnChange((filePath, content) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-changed', { filePath, content });
    }
  });

  // Initialize auto-updater (checks GitHub releases for new versions)
  initAutoUpdater(mainWindow, {
    beforeInstall: () => {
      if (unsavedFiles.size === 0) {
        isQuitting = true;
        return { proceed: true };
      }

      const fileNames = Array.from(unsavedFiles.values()).join(', ');
      const result = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: `You have unsaved changes in: ${fileNames}`,
        detail: 'Save before restarting to install the update?'
      });

      if (result === 2) {
        return { proceed: false, cancelled: true };
      }

      if (result === 1) {
        unsavedFiles.clear();
        isQuitting = true;
        return { proceed: true };
      }

      // Save first; all-saved-close will call installDownloadedUpdate()
      pendingUpdateInstall = true;
      isQuitting = true;
      mainWindow.webContents.send('save-all-and-close');
      return { proceed: false, saving: true };
    }
  });
});

// Handle app quit with unsaved changes check
app.on('before-quit', (e) => {
  if (!isQuitting && unsavedFiles.size > 0) {
    e.preventDefault();
    if (handleClose()) {
      isQuitting = true;
      app.quit();
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

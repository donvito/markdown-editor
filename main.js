const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const pluginManager = require('./src/main/plugin-manager');
const { makeAIRequest, makeAIRequestStream } = require('./src/main/ai-service');

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
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Markdown Editor',
              message: 'Markdown Editor',
              detail: 'Version 1.0.1\n\nA simple and lightweight Markdown editor.\n\nAuthor: Melvin Vivas\nWebsite: donvitocodes.com',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ]);

  Menu.setApplicationMenu(menu);
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
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file-opened', { filePath, content });
  }
}

// IPC Handlers
ipcMain.handle('open-file-dialog', openFile);

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
    fs.renameSync(oldPath, newPath);

    // Update unsaved files tracking if the old path was tracked
    if (unsavedFiles.has(oldPath)) {
      const fileName = newPath.split(/[/\\]/).pop();
      unsavedFiles.delete(oldPath);
      unsavedFiles.set(newPath, fileName);
    }

    return { success: true, newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('parse-markdown', (event, content) => {
  return marked.parse(content);
});

ipcMain.handle('save-file', (event, filePath, content) => {
  try {
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
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file-path', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file-opened', { filePath, content });
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
});

ipcMain.on('all-saved-close', () => {
  unsavedFiles.clear();
  isQuitting = true;
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
  const { selectedText, selectionStart, selectionEnd } = selectionData;

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

  // Add AI options only when text is selected
  if (selectedText && selectedText.length > 0) {
    menuItems.push({ type: 'separator' });
    menuItems.push({
      label: 'Edit with AI...',
      accelerator: 'CmdOrCtrl+K',
      click: () => {
        mainWindow.webContents.send('ai:action', { actionId: 'generate', selectedText, selectionStart, selectionEnd });
      }
    });
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

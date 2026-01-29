const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');

// Configure marked with syntax highlighting
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
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
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

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
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
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

app.whenReady().then(createWindow);

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

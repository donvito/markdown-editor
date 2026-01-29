const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file-dialog'),
  openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  saveFileAs: (content, defaultName) => ipcRenderer.invoke('save-file-as', content, defaultName),
  parseMarkdown: (content) => ipcRenderer.invoke('parse-markdown', content),
  confirmCloseFile: (fileName) => ipcRenderer.invoke('confirm-close-file', fileName),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  onFileSaved: (callback) => ipcRenderer.on('file-saved', () => callback()),
  onTriggerSave: (callback) => ipcRenderer.on('trigger-save', () => callback()),
  onTriggerSaveAs: (callback) => ipcRenderer.on('trigger-save-as', () => callback()),
  onNewFile: (callback) => ipcRenderer.on('new-file', () => callback()),
  onSaveAllAndClose: (callback) => ipcRenderer.on('save-all-and-close', () => callback()),
  sendAllSavedClose: () => ipcRenderer.send('all-saved-close'),
  notifyFileUnsaved: (filePath, fileName) => ipcRenderer.send('file-unsaved', filePath, fileName),
  notifyFileSaved: (filePath) => ipcRenderer.send('file-saved-state', filePath),
  notifyFileClosed: (filePath) => ipcRenderer.send('file-closed', filePath)
});

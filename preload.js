const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file-dialog'),
  openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  parseMarkdown: (content) => ipcRenderer.invoke('parse-markdown', content),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  onFileSaved: (callback) => ipcRenderer.on('file-saved', () => callback()),
  onTriggerSave: (callback) => ipcRenderer.on('trigger-save', () => callback())
});

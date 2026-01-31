const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
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
  notifyFileClosed: (filePath) => ipcRenderer.send('file-closed', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  showContextMenu: (data) => ipcRenderer.invoke('show-context-menu', data),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
  onEditorCut: (callback) => ipcRenderer.on('editor:cut', (event, data) => callback(data)),
  onEditorCopy: (callback) => ipcRenderer.on('editor:copy', (event, data) => callback(data)),
  onEditorPaste: (callback) => ipcRenderer.on('editor:paste', () => callback()),
  onAIAction: (callback) => ipcRenderer.on('ai:action', (event, data) => callback(data))
});

// Plugin API for plugin system
contextBridge.exposeInMainWorld('pluginAPI', {
  // Plugin lifecycle
  getPlugins: () => ipcRenderer.invoke('plugin:list'),
  getManifest: (pluginId) => ipcRenderer.invoke('plugin:get-manifest', pluginId),
  enablePlugin: (pluginId) => ipcRenderer.invoke('plugin:enable', pluginId),
  disablePlugin: (pluginId) => ipcRenderer.invoke('plugin:disable', pluginId),

  // Settings
  getSetting: (pluginId, key) => ipcRenderer.invoke('plugin:get-setting', pluginId, key),
  setSetting: (pluginId, key, value, isSecure) =>
    ipcRenderer.invoke('plugin:set-setting', pluginId, key, value, isSecure),

  // Context menu
  registerContextMenuItems: (pluginId, items) =>
    ipcRenderer.invoke('plugin:register-context-menu', pluginId, items),
  onContextMenuAction: (callback) =>
    ipcRenderer.on('plugin:context-menu-action', (event, data) => callback(data)),

  // AI requests (proxied through main process for security)
  makeAIRequest: (pluginId, endpoint, payload) =>
    ipcRenderer.invoke('plugin:ai-request', pluginId, endpoint, payload),

  // Streaming AI requests
  makeAIRequestStream: (pluginId, endpoint, payload) =>
    ipcRenderer.invoke('plugin:ai-request-stream', pluginId, endpoint, payload),
  abortAIRequestStream: (streamId) =>
    ipcRenderer.invoke('plugin:ai-request-abort', streamId),
  onAIStreamChunk: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('plugin:ai-stream-chunk', handler);
    return handler;
  },
  onAIStreamDone: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('plugin:ai-stream-done', handler);
    return handler;
  },
  onAIStreamError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('plugin:ai-stream-error', handler);
    return handler;
  },
  removeAIStreamListener: (channel, handler) => {
    ipcRenderer.removeListener(`plugin:ai-stream-${channel}`, handler);
  }
});

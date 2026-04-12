const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beacon', {
  // Existing methods
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  isElectron: true,

  // Claude Code methods
  checkClaude: () => ipcRenderer.invoke('check-claude'),
  runClaude: (prompt) => ipcRenderer.invoke('run-claude', prompt),
  startClaudeStream: (prompt) => ipcRenderer.send('run-claude-stream', prompt),
  onClaudeStreamChunk: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('claude-stream-chunk', handler);
    return () => ipcRenderer.removeListener('claude-stream-chunk', handler);
  },
  onClaudeStreamDone: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('claude-stream-done', handler);
    return () => ipcRenderer.removeListener('claude-stream-done', handler);
  },
  onClaudeStreamError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('claude-stream-error', handler);
    return () => ipcRenderer.removeListener('claude-stream-error', handler);
  },
});

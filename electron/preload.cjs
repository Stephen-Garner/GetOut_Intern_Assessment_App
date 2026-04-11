const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beacon', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  isElectron: true,
});

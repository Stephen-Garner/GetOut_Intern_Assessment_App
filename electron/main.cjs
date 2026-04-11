const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWindow = null;
let serverUrl = '';

// User data lives in ~/Documents/Beacon
const DOCUMENTS_DIR = path.join(app.getPath('documents'), 'Beacon');
const DATA_DIR = path.join(DOCUMENTS_DIR, 'data');
const WORKSPACES_DIR = path.join(DOCUMENTS_DIR, 'workspaces');

// Ensure directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

// Find an available port
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// Start the Express server
async function startServer() {
  const port = await getFreePort();

  // Dynamic import for ESM server module (file:// URL required for ESM from CJS)
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  const { createServer } = await import(`file://${serverPath}`);

  const { app: expressApp } = createServer({
    port,
    dataDir: DATA_DIR,
    workspacesDir: WORKSPACES_DIR,
    staticDir: path.join(__dirname, '..', 'dist'),
  });

  return new Promise((resolve) => {
    expressApp.listen(port, () => {
      serverUrl = `http://localhost:${port}`;
      console.log(`Beacon server running at ${serverUrl}`);
      resolve(serverUrl);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Beacon',
    backgroundColor: '#0A0A0F',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(serverUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers for preload bridge
ipcMain.handle('get-server-url', () => serverUrl);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-data-dir', () => DATA_DIR);

// Auto-updater configuration
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Beacon v${info.version} has been downloaded. It will be installed when you restart the app.`,
        buttons: ['Restart Now', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  // Check for updates after a short delay so the window loads first
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('Update check skipped:', err.message);
    });
  }, 3000);
}

// App lifecycle
app.whenReady().then(async () => {
  await startServer();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

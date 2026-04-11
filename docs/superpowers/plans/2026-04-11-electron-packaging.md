# Electron Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the Beacon Vite+Express app in Electron so it ships as a native desktop app with auto-updates from GitHub Releases, for Mac, Windows, and Linux.

**Architecture:** Electron's main process starts the Express server on a dynamic port, then opens a BrowserWindow loading the Vite-built frontend. All user data (CSVs, SQLite databases, workspace configs) lives in `~/Documents/Beacon/`. The app uses `electron-updater` to check GitHub Releases for new versions on launch. `electron-builder` produces `.dmg` (Mac), `.exe`/NSIS (Windows), and `.AppImage` (Linux).

**Tech Stack:** Electron 33+, electron-builder, electron-updater, better-sqlite3 (rebuilt for Electron via @electron/rebuild)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `electron/main.js` | Electron main process: starts Express, creates window, handles lifecycle and auto-updates |
| Create | `electron/preload.js` | Secure context bridge: exposes user data path + app version to renderer |
| Modify | `server/index.js` | Export Express app as a function (accept port + data dir args) instead of hardcoding port 3001 |
| Modify | `server/db/connection.js` | Accept configurable root path instead of deriving from `__dirname` |
| Modify | `server/routes/workspaces.js` | Accept configurable data/workspace dirs instead of deriving from `__dirname` |
| Modify | `server/routes/data.js` | Accept configurable workspace dir instead of deriving from `__dirname` |
| Modify | `src/utils/api.js` | Support dynamic base URL (port varies in Electron) via env var or preload |
| Modify | `vite.config.js` | Add `base: './'` for Electron file:// loading, keep dev proxy working |
| Modify | `package.json` | Add electron deps, build config, new scripts |
| Modify | `index.html` | Add CSP meta tag for Electron security |
| Create | `electron-builder.yml` | Build/publish configuration for all three platforms |
| Create | `scripts/build-electron.js` | Build script: runs Vite build then electron-builder |
| Create | `assets/icon.png` | 1024x1024 PNG icon for electron-builder (it generates platform-specific formats) |

---

### Task 1: Install Electron Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Electron and build tooling**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
npm install --save-dev electron@^33.0.0 electron-builder@^25.0.0 @electron/rebuild@^3.7.0
npm install electron-updater@^6.3.0
```

- [ ] **Step 2: Add scripts to package.json**

Add these scripts to the `"scripts"` section in `package.json`:

```json
"electron:dev": "npm run build && electron .",
"dist": "npm run build && electron-builder --publish never",
"dist:mac": "npm run build && electron-builder --mac --publish never",
"dist:win": "npm run build && electron-builder --win --publish never",
"dist:linux": "npm run build && electron-builder --linux --publish never",
"dist:publish": "npm run build && electron-builder --publish always"
```

Also add the `"main"` field pointing to `"electron/main.js"`.

- [ ] **Step 3: Rebuild better-sqlite3 for Electron**

```bash
npx @electron/rebuild -m . -o better-sqlite3
```

Verify it completes without errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Electron and build dependencies"
```

---

### Task 2: Make Server Paths Configurable

The server currently derives all paths from `__dirname` relative to the project root. In Electron, user data lives in `~/Documents/Beacon/`, not in the app bundle. We need to make the data directory, workspace directory, and database root configurable so the same server code works in both dev mode and Electron mode.

**Files:**
- Modify: `server/index.js`
- Modify: `server/db/connection.js`
- Modify: `server/routes/workspaces.js`
- Modify: `server/routes/data.js`

- [ ] **Step 1: Modify `server/db/connection.js` to accept a configurable root**

Replace the hardcoded `ROOT` with a settable base path:

```javascript
import Database from 'better-sqlite3';
import path from 'path';

let rootDir = process.cwd();

export function setDbRoot(dir) {
  rootDir = dir;
}

const connections = new Map();

export function getDb(dbFile) {
  const dbPath = path.resolve(rootDir, dbFile);

  if (connections.has(dbPath)) {
    return connections.get(dbPath);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  connections.set(dbPath, db);
  return db;
}

export function closeDb(dbFile) {
  const dbPath = path.resolve(rootDir, dbFile);
  const db = connections.get(dbPath);
  if (db) {
    db.close();
    connections.delete(dbPath);
  }
}

export function closeAll() {
  for (const db of connections.values()) {
    db.close();
  }
  connections.clear();
}
```

- [ ] **Step 2: Modify `server/routes/workspaces.js` to accept configurable dirs**

Replace the hardcoded `ROOT`, `WORKSPACES_DIR`, and `DATA_DIR` with settable values. At the top of the file, replace the path derivation with:

```javascript
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';
import { createTableFromCsv } from '../db/schema.js';
import { closeDb } from '../db/connection.js';

let ROOT = process.cwd();
let WORKSPACES_DIR = path.join(ROOT, 'server', 'workspaces');
let DATA_DIR = path.join(ROOT, 'data');

export function configurePaths({ root, workspacesDir, dataDir }) {
  ROOT = root;
  WORKSPACES_DIR = workspacesDir;
  DATA_DIR = dataDir;
}
```

Remove the `__dirname` and `fileURLToPath` imports. The rest of the file stays the same.

- [ ] **Step 3: Modify `server/routes/data.js` to accept configurable dirs**

Same pattern. Replace the path derivation at the top:

```javascript
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/connection.js';
import { getTableInfo } from '../db/schema.js';

let WORKSPACES_DIR = path.join(process.cwd(), 'server', 'workspaces');

export function configureDataPaths({ workspacesDir }) {
  WORKSPACES_DIR = workspacesDir;
}
```

Remove the `__dirname` and `fileURLToPath` imports. The rest stays the same.

- [ ] **Step 4: Modify `server/index.js` to export a configurable `createServer` function**

The server needs to work two ways: (1) standalone via `node server/index.js` for dev, and (2) imported by Electron's main process. Rewrite it to export a factory function while keeping the standalone behavior:

```javascript
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setDbRoot } from './db/connection.js';
import { configurePaths } from './routes/workspaces.js';
import { configureDataPaths } from './routes/data.js';
import workspacesRouter from './routes/workspaces.js';
import dataRouter from './routes/data.js';
import chatRouter from './routes/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer(options = {}) {
  const {
    port = 3001,
    dataDir = path.resolve(__dirname, '..', 'data'),
    workspacesDir = path.resolve(__dirname, 'workspaces'),
    staticDir = null,
  } = options;

  // The root for DB file resolution is the parent of dataDir
  // because workspace configs store dbFile as "data/uuid.sqlite"
  const rootDir = path.resolve(dataDir, '..');

  // Configure all modules to use the provided paths
  setDbRoot(rootDir);
  configurePaths({ root: rootDir, workspacesDir, dataDir });
  configureDataPaths({ workspacesDir });

  // Ensure directories exist
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspacesDir, { recursive: true });

  const app = express();
  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/chat', chatRouter);

  // List files in data/ directory
  app.get('/api/files', (req, res) => {
    try {
      const files = fs.readdirSync(dataDir).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.csv', '.tsv', '.txt'].includes(ext);
      });
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Import endpoint (alias for workspace creation)
  app.post('/api/import', (req, res) => {
    res.redirect(307, '/api/workspaces');
  });

  // Serve static frontend in production/Electron mode
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return { app, port };
}

// Standalone mode: run directly with `node server/index.js`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__dirname, 'index.js');
if (isMain) {
  const { app, port } = createServer();
  app.listen(port, () => {
    console.log(`Beacon API server running on http://localhost:${port}`);
  });
}
```

- [ ] **Step 5: Verify dev mode still works**

```bash
npm run beacon
```

Open http://localhost:5173, navigate to Settings, confirm the file list loads and workspace creation works. Kill the process.

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "refactor: make server paths configurable for Electron"
```

---

### Task 3: Update Frontend for Dynamic API Base URL

In dev mode, Vite proxies `/api` to `localhost:3001`. In Electron, the Express server runs on a random port, and the frontend is loaded from `file://` via the built `dist/`. The frontend needs to know the server's actual URL.

**Files:**
- Modify: `src/utils/api.js`
- Modify: `vite.config.js`
- Create: `electron/preload.js`

- [ ] **Step 1: Create `electron/preload.js`**

This script runs in a privileged context and exposes safe values to the renderer:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beacon', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  isElectron: true,
});
```

Note: preload scripts must use CommonJS (`require`), not ESM.

- [ ] **Step 2: Modify `src/utils/api.js` to support dynamic base URL**

```javascript
let BASE = '/api';
let baseResolved = false;

async function resolveBase() {
  if (baseResolved) return;
  if (window.beacon?.isElectron) {
    const serverUrl = await window.beacon.getServerUrl();
    BASE = `${serverUrl}/api`;
  }
  baseResolved = true;
}

async function request(path, options = {}) {
  await resolveBase();
  const url = `${BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
```

- [ ] **Step 3: Modify `vite.config.js` to use relative base path**

Add `base: './'` so the built HTML uses relative paths (required for Electron `file://` loading):

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add electron/preload.js src/utils/api.js vite.config.js
git commit -m "feat: support dynamic API base URL for Electron"
```

---

### Task 4: Create Electron Main Process

This is the core of the Electron integration. It starts the Express server, creates the browser window, and handles auto-updates.

**Files:**
- Create: `electron/main.js`

- [ ] **Step 1: Create `electron/main.js`**

```javascript
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

  // Dynamic import for ESM server module
  const { createServer } = await import(
    path.join(__dirname, '..', 'server', 'index.js')
  );

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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0A0A0F',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
```

Note: `electron/main.js` uses CommonJS (`require`) because Electron's main process does not support ESM entry points natively. The server is loaded via dynamic `import()` since it's ESM.

- [ ] **Step 2: Verify the file was created correctly**

```bash
node -c electron/main.js
```

Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: add Electron main process with auto-updater"
```

---

### Task 5: Add App Icon and Build Configuration

**Files:**
- Create: `assets/icon.png`
- Create: `electron-builder.yml`
- Modify: `package.json`

- [ ] **Step 1: Copy the existing icon as the build source**

electron-builder needs a 1024x1024 PNG and generates all platform-specific formats from it.

```bash
mkdir -p assets
sips -z 1024 1024 /tmp/beacon_icon_v2.svg.png --out assets/icon.png
```

If the temp file is gone, render from the SVG in `public/favicon.svg`:

```bash
qlmanage -t -s 1024 -o /tmp/ public/favicon.svg 2>/dev/null
sips -z 1024 1024 /tmp/favicon.svg.png --out assets/icon.png
```

- [ ] **Step 2: Create `electron-builder.yml`**

```yaml
appId: com.getout.beacon
productName: Beacon
copyright: Copyright © 2026 GetOut

directories:
  output: release
  buildResources: assets

files:
  - dist/**/*
  - server/**/*
  - electron/**/*
  - node_modules/**/*
  - package.json

mac:
  category: public.app-category.business
  icon: assets/icon.png
  target:
    - target: dmg
      arch:
        - universal

dmg:
  artifactName: Beacon-${version}-mac.${ext}

win:
  icon: assets/icon.png
  target:
    - target: nsis
      arch:
        - x64

nsis:
  oneClick: true
  perMachine: false
  artifactName: Beacon-${version}-win-setup.${ext}

linux:
  icon: assets/icon.png
  category: Office
  target:
    - target: AppImage
      arch:
        - x64

appImage:
  artifactName: Beacon-${version}-linux.${ext}

publish:
  provider: github
  owner: Stephen-Garner
  repo: GetOut_Intern_Assessment_App
```

- [ ] **Step 3: Add `"main"` field to `package.json`**

Add right after the `"type": "module"` line:

```json
"main": "electron/main.js",
```

Also add the `"build"` field at the top level (electron-builder uses this for the app version):

```json
"author": "GetOut",
"license": "MIT",
```

- [ ] **Step 4: Commit**

```bash
git add assets/ electron-builder.yml package.json
git commit -m "feat: add Electron build config for Mac, Windows, Linux"
```

---

### Task 6: Handle Native Module Rebuilding

`better-sqlite3` is a native C++ addon that must be compiled for Electron's version of Node. electron-builder handles this automatically during `npm run dist`, but we need to make sure the config is right.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add rebuild config to package.json**

Add this to the top level of `package.json`:

```json
"build": {
  "npmRebuild": true,
  "nodeGypRebuild": false
}
```

Note: This is NOT the electron-builder.yml config, this goes in package.json so electron-builder knows to rebuild native modules.

Actually, electron-builder handles native module rebuilding automatically when it finds them. The `electron-builder.yml` `files` field already includes `node_modules/**/*`. electron-builder will detect `better-sqlite3` and rebuild it for the target platform.

No code changes needed for this step. Verify by checking electron-builder docs:

```bash
npx electron-builder --help
```

- [ ] **Step 2: Verify local Electron dev mode works**

```bash
npm run build && npx electron .
```

The app should launch as a native window, showing the Beacon dashboard. Check the DevTools console (Cmd+Shift+I or Ctrl+Shift+I) for errors.

Expected: the app loads, no `better-sqlite3` errors in the console.

- [ ] **Step 3: Commit any changes**

```bash
git add -A
git commit -m "chore: verify Electron dev mode works"
```

---

### Task 7: Build Installers and Test

**Files:**
- No new files, just running build commands

- [ ] **Step 1: Build for macOS**

```bash
npm run dist:mac
```

Expected output in `release/` directory:
- `Beacon-1.0.0-mac.dmg`

This takes a few minutes. Verify the `.dmg` was created:

```bash
ls -lh release/*.dmg
```

- [ ] **Step 2: Test the macOS installer**

Open the `.dmg`, drag Beacon to Applications, launch it. Verify:
- App opens with the Beacon icon
- Dashboard loads
- Navigate to Settings, confirm the data directory path shows `~/Documents/Beacon/data`
- Drop a CSV into `~/Documents/Beacon/data/`, refresh Settings, confirm the file appears
- Create a workspace, verify it works

- [ ] **Step 3: Build for Windows (if on Mac, this creates a cross-platform build)**

```bash
npm run dist:win
```

Note: Cross-compiling for Windows from Mac may require Wine. If it fails, that's fine. Windows builds can be done from a Windows machine or via GitHub Actions (Task 8).

- [ ] **Step 4: Build for Linux**

```bash
npm run dist:linux
```

- [ ] **Step 5: Commit the release artifacts are in .gitignore**

Add `release/` to `.gitignore` so build artifacts don't get committed:

```bash
echo "release/" >> .gitignore
echo "*.sqlite" >> .gitignore
git add .gitignore
git commit -m "chore: add release/ and sqlite files to gitignore"
```

---

### Task 8: Push to GitHub and Create First Release

**Files:**
- No new files

- [ ] **Step 1: Initialize git repo and push all code**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git init
git add -A
git commit -m "feat: Beacon v1.0.0 - GetOut Activation Command Center with Electron desktop app"
git remote add origin https://github.com/Stephen-Garner/GetOut_Intern_Assessment_App.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: Create GitHub Release with installer files**

```bash
gh release create v1.0.0 \
  --title "Beacon v1.0.0" \
  --notes "Initial release of the GetOut Activation Command Center.

## Downloads
- **Mac**: Download the .dmg file, open it, drag Beacon to Applications
- **Windows**: Download the .exe installer, run it
- **Linux**: Download the .AppImage, make it executable with chmod +x, then run it

## First Launch
1. Open Beacon
2. Go to Settings
3. Place your CSV files in ~/Documents/Beacon/data/
4. Create a workspace and start analyzing" \
  release/Beacon-*.dmg release/Beacon-*-setup.exe release/Beacon-*-linux.AppImage 2>/dev/null

```

Only include the files that were successfully built. If Windows/Linux builds failed on Mac, note that in Step 3.

- [ ] **Step 3: If cross-platform builds failed, set up GitHub Actions**

If the Windows or Linux builds failed locally, create `.github/workflows/build.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Build Electron
        run: npx electron-builder --publish never
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.os }}
          path: release/*

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true
      - uses: softprops/action-gh-release@v2
        with:
          files: artifacts/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

With this workflow, the release process becomes:
1. Make changes
2. Bump version in `package.json`
3. Commit, tag (`git tag v1.1.0`), push with tags (`git push --tags`)
4. GitHub Actions builds for all three platforms and attaches installers to the release

```bash
mkdir -p .github/workflows
# (write the file above)
git add .github/
git commit -m "ci: add GitHub Actions build workflow for multi-platform releases"
git push
```

- [ ] **Step 4: Test auto-update flow**

After the release is published:
1. Increment version in `package.json` to `"1.0.1"`
2. Build and publish: `npm run dist:publish` (requires `GH_TOKEN` env var)
3. Open the v1.0.0 app, wait 3 seconds
4. The app should detect the update and show a "Beacon v1.0.1 has been downloaded" dialog

---

### Task 9: Update README and Clean Up

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with download instructions**

Replace the current README content with:

```markdown
# Beacon — GetOut Activation Command Center

An internal analytics dashboard for monitoring member activation,
identifying churn risk, and managing retention interventions.

## Download

Go to the [latest release](https://github.com/Stephen-Garner/GetOut_Intern_Assessment_App/releases/latest) and download the installer for your platform:

- **Mac**: `Beacon-x.x.x-mac.dmg`
- **Windows**: `Beacon-x.x.x-win-setup.exe`
- **Linux**: `Beacon-x.x.x-linux.AppImage`

The app updates automatically when new versions are published.

## First Launch

1. Open Beacon
2. Go to Settings
3. Place your CSV files in the data folder:
   - Mac/Linux: `~/Documents/Beacon/data/`
   - Windows: `Documents\Beacon\data\`
4. Create a workspace from your CSV
5. Start analyzing

## Development

If you want to run from source:

```bash
git clone https://github.com/Stephen-Garner/GetOut_Intern_Assessment_App.git
cd GetOut_Intern_Assessment_App
npm install
npm run beacon        # Dev mode (browser)
npm run electron:dev  # Dev mode (Electron window)
npm run dist          # Build installer for your platform
```

## Requirements (for development only)

- Node.js 18+
- npm 9+
```

- [ ] **Step 2: Remove the old Beacon.app and Beacon.command files**

These were for the pre-Electron approach and are no longer needed:

```bash
rm -rf Beacon.app Beacon.command
git add -A
git commit -m "docs: update README for Electron distribution, remove old launchers"
git push
```

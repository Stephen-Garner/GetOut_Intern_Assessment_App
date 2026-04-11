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

  const rootDir = path.resolve(dataDir, '..');

  setDbRoot(rootDir);
  configurePaths({ root: rootDir, workspacesDir, dataDir });
  configureDataPaths({ workspacesDir });

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspacesDir, { recursive: true });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/chat', chatRouter);

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

  app.post('/api/import', (req, res) => {
    res.redirect(307, '/api/workspaces');
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return { app, port };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__dirname, 'index.js');
if (isMain) {
  const { app, port } = createServer();
  app.listen(port, () => {
    console.log(`Beacon API server running on http://localhost:${port}`);
  });
}

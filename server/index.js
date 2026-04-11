import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import workspacesRouter from './routes/workspaces.js';
import dataRouter from './routes/data.js';
import chatRouter from './routes/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT, 'data');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/workspaces', workspacesRouter);
app.use('/api/data', dataRouter);
app.use('/api/chat', chatRouter);

// List files in data/ directory
app.get('/api/files', (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const files = fs.readdirSync(DATA_DIR).filter((f) => {
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

app.listen(PORT, () => {
  console.log(`Beacon API server running on http://localhost:${PORT}`);
});

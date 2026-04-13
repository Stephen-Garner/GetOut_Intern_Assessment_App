import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { setDbRoot } from './db/connection.js';
import { configurePaths } from './routes/workspaces.js';
import { configureDataPaths } from './routes/data.js';
import workspacesRouter from './routes/workspaces.js';
import dataRouter from './routes/data.js';
import chatRouter from './routes/chat.js';
import playgroundRouter, { configurePlaygroundPaths, sweepPlaygroundThreads } from './routes/playground.js';
import widgetsRouter, { configureWidgetPaths } from './routes/widgets.js';
import { CANONICAL_FIELDS, autoMapColumns } from './mapping.js';
import { spawnClaude, claudeAvailable } from './claude-runner.js';

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
  configurePlaygroundPaths({ dataDir, workspacesDir });

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspacesDir, { recursive: true });
  sweepPlaygroundThreads();

  const app = express();
  app.use(cors());
  app.use(express.json());

  configureWidgetPaths({ dataDir });

  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/playground', playgroundRouter);
  app.use('/api/widgets', widgetsRouter);

  // Helper: run Claude and collect full stdout as a Promise
  function runClaudeSync(args) {
    return new Promise((resolve, reject) => {
      const proc = spawnClaude(args);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
    });
  }

  // Mapping API routes
  app.get('/api/mapping/fields', (req, res) => {
    res.json(Object.keys(CANONICAL_FIELDS));
  });

  app.post('/api/mapping/auto', (req, res) => {
    const { headers } = req.body;
    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({ error: 'headers array is required' });
    }
    const result = autoMapColumns(headers);
    res.json(result);
  });

  app.post('/api/mapping/suggest', async (req, res) => {
    const { columns, canonicalFields } = req.body;
    if (!columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'columns array required' });
    }

    // If Claude is not available, return empty suggestions
    if (!claudeAvailable) {
      return res.json({ suggestions: columns.map(c => ({ column: c.name, suggestedField: null, confidence: 0, reasoning: 'Claude Code not available' })) });
    }

    const prompt = `I have CSV columns that need to be mapped to canonical field names. For each column, suggest the best match from the canonical fields list, or null if no match.

Columns to map:
${columns.map(c => `- "${c.name}" with sample values: ${JSON.stringify(c.sampleValues?.slice(0, 5))}`).join('\n')}

Canonical fields: ${(canonicalFields || []).join(', ')}

Respond with ONLY a JSON array like: [{"column": "col_name", "suggestedField": "canonical_name_or_null", "confidence": 0.0-1.0, "reasoning": "brief reason"}]`;

    try {
      const result = await runClaudeSync(['-p', prompt, '--output-format', 'text']);

      // Try to parse JSON from the response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        return res.json({ suggestions });
      }

      res.json({ suggestions: [], raw: result });
    } catch (err) {
      res.json({ suggestions: columns.map(c => ({ column: c.name, suggestedField: null, confidence: 0, reasoning: 'AI mapping failed' })) });
    }
  });

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

  // File upload
  const upload = multer({ dest: path.join(dataDir, '.uploads') });

  app.post('/api/upload', upload.array('files', 10), (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results = [];
      for (const file of req.files) {
        // Move file from temp to dataDir with original name
        const destPath = path.join(dataDir, file.originalname);
        fs.renameSync(file.path, destPath);
        results.push({
          filename: file.originalname,
          size: file.size,
          path: destPath
        });
      }

      res.json({ files: results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // CSV file preview (headers + row count + auto-detect type)
  app.get('/api/files/preview', (req, res) => {
    try {
      const filename = req.query.file;
      if (!filename) return res.status(400).json({ error: 'filename required' });

      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

      // Read first line to get headers
      const content = fs.readFileSync(filePath, 'utf-8');
      const firstLine = content.split('\n')[0];
      const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      // Count rows (subtract 1 for header)
      const rowCount = content.split('\n').filter(line => line.trim()).length - 1;

      // Auto-detect file type
      const headersLower = headers.map(h => h.toLowerCase());
      let detectedType = 'unknown';
      if (headersLower.some(h => h.includes('visit_id') || h.includes('visit_date')) && headersLower.some(h => h.includes('venue'))) {
        detectedType = 'visits';
      } else if (headersLower.some(h => h.includes('venue_id') && h.includes('popularity'))) {
        detectedType = 'venues';
      } else if (headersLower.some(h => h.includes('snapshot_date'))) {
        detectedType = 'snapshots';
      } else if (headersLower.some(h => h.includes('member_id') || h.includes('purchase_date') || h.includes('total_visits'))) {
        detectedType = 'members';
      }

      res.json({ filename, headers, rowCount, detectedType });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get column mapping for a workspace
  app.get('/api/mapping', (req, res) => {
    const wsId = req.query.workspace;
    if (!wsId) return res.status(400).json({ error: 'workspace required' });

    const wsFile = path.join(workspacesDir, `${wsId}.json`);
    if (!fs.existsSync(wsFile)) return res.status(404).json({ error: 'Workspace not found' });

    const ws = JSON.parse(fs.readFileSync(wsFile, 'utf-8'));
    const mapping = ws.columnMapping || {};

    // Convert to array format for the frontend
    const result = Object.entries(mapping).map(([canonical, csvCol]) => ({
      csv_column: csvCol,
      canonical_field: canonical,
      auto_matched: true
    }));

    res.json(result);
  });

  // Update column mapping for a workspace
  app.put('/api/mapping', (req, res) => {
    const wsId = req.query.workspace;
    if (!wsId) return res.status(400).json({ error: 'workspace required' });

    const wsFile = path.join(workspacesDir, `${wsId}.json`);
    if (!fs.existsSync(wsFile)) return res.status(404).json({ error: 'Workspace not found' });

    const ws = JSON.parse(fs.readFileSync(wsFile, 'utf-8'));
    const { mapping } = req.body;

    if (Array.isArray(mapping)) {
      // Convert array format back to object
      ws.columnMapping = {};
      for (const entry of mapping) {
        if (entry.canonical_field && entry.canonical_field !== 'skip' && entry.csv_column) {
          ws.columnMapping[entry.canonical_field] = entry.csv_column;
        }
      }
    } else if (typeof mapping === 'object') {
      ws.columnMapping = mapping;
    }

    fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2));
    res.json({ ok: true });
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

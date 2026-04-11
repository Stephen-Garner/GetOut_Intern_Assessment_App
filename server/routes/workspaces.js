import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';
import { createTableFromCsv } from '../db/schema.js';
import { closeDb, getDb } from '../db/connection.js';
import { autoMapColumns } from '../mapping.js';
import { runSegmentation, DEFAULT_THRESHOLDS } from '../segmentation.js';

let ROOT = process.cwd();
let WORKSPACES_DIR = path.join(ROOT, 'server', 'workspaces');
let DATA_DIR = path.join(ROOT, 'data');

export function configurePaths({ root, workspacesDir, dataDir }) {
  ROOT = root;
  WORKSPACES_DIR = workspacesDir;
  DATA_DIR = dataDir;
}

const router = Router();

function getWorkspaceFile(id) {
  return path.join(WORKSPACES_DIR, `${id}.json`);
}

function readWorkspace(id) {
  const file = getWorkspaceFile(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeWorkspace(config) {
  fs.writeFileSync(getWorkspaceFile(config.id), JSON.stringify(config, null, 2));
}

function listWorkspaces() {
  if (!fs.existsSync(WORKSPACES_DIR)) return [];
  return fs
    .readdirSync(WORKSPACES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(WORKSPACES_DIR, f), 'utf-8')))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// List all workspaces
router.get('/', (req, res) => {
  res.json(listWorkspaces());
});

// Create workspace
router.post('/', (req, res) => {
  try {
    const { name, files } = req.body;
    if (!name || !files || files.length === 0) {
      return res.status(400).json({ error: 'Name and files are required' });
    }

    const id = randomUUID();
    const dbFile = `data/${id}.sqlite`;

    // Read and parse each CSV, combine all rows
    let allHeaders = null;
    let allRows = [];

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: `File not found: ${file}` });
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const records = parse(content, { relax_column_count: true });

      if (records.length < 2) {
        return res.status(400).json({ error: `File ${file} has no data rows` });
      }

      const headers = records[0];
      const rows = records.slice(1);

      if (!allHeaders) {
        allHeaders = headers;
      }
      allRows = allRows.concat(rows);
    }

    // Create SQLite database with the CSV data
    const result = createTableFromCsv(dbFile, allHeaders, allRows);

    // Auto-map columns to canonical field names
    const { mapping, unmapped, missing } = autoMapColumns(result.columns);

    // Run segmentation with default thresholds
    const db = getDb(dbFile);
    const thresholds = { ...DEFAULT_THRESHOLDS };
    const segResult = runSegmentation(db, mapping, thresholds);

    const config = {
      id,
      name,
      createdAt: new Date().toISOString(),
      dataSource: {
        type: 'csv',
        files,
        lastImported: new Date().toISOString(),
      },
      dbFile,
      columnMapping: mapping,
      unmappedColumns: unmapped,
      missingRequiredFields: missing,
      thresholds,
      segmentation: segResult,
      customWidgets: [],
      dashboardLayout: [],
      activeFilters: {},
      importResult: { rowCount: result.rowCount, columns: result.columns },
    };

    writeWorkspace(config);
    res.status(201).json(config);
  } catch (err) {
    console.error('Workspace creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get workspace
router.get('/:id', (req, res) => {
  const ws = readWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  res.json(ws);
});

// Update workspace
router.put('/:id', (req, res) => {
  const ws = readWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  const updated = { ...ws, ...req.body, id: ws.id };
  writeWorkspace(updated);
  res.json(updated);
});

// Update column mapping and re-run segmentation
router.put('/:id/mapping', (req, res) => {
  try {
    const ws = readWorkspace(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found' });

    const { mapping, thresholds } = req.body;
    if (!mapping) return res.status(400).json({ error: 'mapping is required' });

    const db = getDb(ws.dbFile);
    const useThresholds = thresholds || ws.thresholds || DEFAULT_THRESHOLDS;
    const segResult = runSegmentation(db, mapping, useThresholds);

    ws.columnMapping = mapping;
    ws.thresholds = useThresholds;
    ws.segmentation = segResult;

    writeWorkspace(ws);
    res.json({ mapping, segmentation: segResult });
  } catch (err) {
    console.error('Mapping update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete workspace
router.delete('/:id', (req, res) => {
  const ws = readWorkspace(req.params.id);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });

  // Clean up database file
  if (ws.dbFile) {
    closeDb(ws.dbFile);
    const dbPath = path.resolve(ROOT, ws.dbFile);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }

  // Remove config
  const configFile = getWorkspaceFile(ws.id);
  if (fs.existsSync(configFile)) fs.unlinkSync(configFile);

  res.json({ ok: true });
});

export default router;

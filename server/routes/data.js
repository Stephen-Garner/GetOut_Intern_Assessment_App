import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/connection.js';
import { getTableInfo } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const WORKSPACES_DIR = path.resolve(__dirname, '../workspaces');

const router = Router();

function resolveWorkspace(workspaceId) {
  if (!workspaceId) return null;
  const file = path.join(WORKSPACES_DIR, `${workspaceId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// Summary stats
router.get('/summary', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json({ totalMembers: 0, columns: [], segments: {} });

  try {
    const info = getTableInfo(ws.dbFile);
    const db = getDb(ws.dbFile);

    let segments = {};
    if (info.columns.includes('segment')) {
      const rows = db.prepare('SELECT segment, COUNT(*) as count FROM members GROUP BY segment').all();
      segments = Object.fromEntries(rows.map((r) => [r.segment, r.count]));
    }

    res.json({ totalMembers: info.rowCount, columns: info.columns, segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paginated member list
router.get('/members', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json({ members: [], total: 0, page: 1, pageSize: 50 });

  try {
    const db = getDb(ws.dbFile);
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
    const offset = (page - 1) * pageSize;

    const total = db.prepare('SELECT COUNT(*) as count FROM members').get().count;
    const members = db.prepare(`SELECT * FROM members LIMIT ? OFFSET ?`).all(pageSize, offset);

    res.json({ members, total, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Individual member
router.get('/members/:id', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.status(404).json({ error: 'No active workspace' });

  try {
    const db = getDb(ws.dbFile);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Segment distribution
router.get('/segments', (req, res) => {
  const ws = resolveWorkspace(req.query.workspace);
  if (!ws) return res.json([]);

  try {
    const db = getDb(ws.dbFile);
    const info = getTableInfo(ws.dbFile);

    if (!info.columns.includes('segment')) {
      return res.json([]);
    }

    const rows = db.prepare('SELECT segment, COUNT(*) as count FROM members GROUP BY segment ORDER BY count DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Segment migration (stub for Phase 2)
router.get('/migration', (req, res) => {
  res.json({ message: 'Migration data available in Phase 2', data: [] });
});

// Time-series metrics (stub for Phase 2)
router.get('/metrics', (req, res) => {
  res.json({ message: 'Metrics available in Phase 2', data: [] });
});

export default router;

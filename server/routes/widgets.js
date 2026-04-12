import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const router = Router();

let widgetsBaseDir = process.cwd();

export function configureWidgetPaths({ dataDir }) {
  widgetsBaseDir = dataDir;
}

function getRegistryPath(workspaceId) {
  const dir = path.join(widgetsBaseDir, 'widgets', workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'registry.json');
}

function readRegistry(workspaceId) {
  const registryPath = getRegistryPath(workspaceId);
  if (!fs.existsSync(registryPath)) return [];
  return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
}

function writeRegistry(workspaceId, widgets) {
  const registryPath = getRegistryPath(workspaceId);
  fs.writeFileSync(registryPath, JSON.stringify(widgets, null, 2));
}

// List widgets
router.get('/', (req, res) => {
  const wsId = req.query.workspace;
  if (!wsId) return res.json([]);
  res.json(readRegistry(wsId));
});

// Save new widget
router.post('/', (req, res) => {
  const wsId = req.query.workspace;
  if (!wsId) return res.status(400).json({ error: 'workspace required' });

  const { title, description, code, position } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  const widget = {
    id: randomUUID(),
    title: title || 'Custom Widget',
    description: description || '',
    code,
    createdAt: new Date().toISOString(),
    starred: false,
    position: position || { row: 'end', col: 'full' },
  };

  const widgets = readRegistry(wsId);
  widgets.push(widget);
  writeRegistry(wsId, widgets);

  res.status(201).json(widget);
});

// Update widget
router.put('/:id', (req, res) => {
  const wsId = req.query.workspace;
  if (!wsId) return res.status(400).json({ error: 'workspace required' });

  const widgets = readRegistry(wsId);
  const idx = widgets.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Widget not found' });

  widgets[idx] = { ...widgets[idx], ...req.body, id: widgets[idx].id };
  writeRegistry(wsId, widgets);
  res.json(widgets[idx]);
});

// Delete widget
router.delete('/:id', (req, res) => {
  const wsId = req.query.workspace;
  if (!wsId) return res.status(400).json({ error: 'workspace required' });

  let widgets = readRegistry(wsId);
  widgets = widgets.filter(w => w.id !== req.params.id);
  writeRegistry(wsId, widgets);
  res.json({ ok: true });
});

export default router;

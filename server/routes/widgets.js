import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { claudeAvailable, spawnClaude } from '../claude-runner.js';

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

// AI-assisted widget edit — streams SSE, returns revised JSX code
router.post('/:id/ai-edit', (req, res) => {
  const wsId = req.query.workspace;
  if (!wsId) return res.status(400).json({ error: 'workspace required' });

  const widgets = readRegistry(wsId);
  const widget = widgets.find((w) => w.id === req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  if (!claudeAvailable) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ error: 'Claude Code is not available.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();
  }

  const editPrompt = [
    'You are editing a React visualization widget for the Beacon analytics dashboard.',
    'The widget uses Recharts, Tailwind CSS utility classes, and optional Lucide icons.',
    'It fetches data from /api/data/* endpoints using the active workspace ID.',
    '',
    'CURRENT WIDGET CODE:',
    '```jsx',
    widget.code,
    '```',
    '',
    `REQUESTED CHANGE: ${prompt.trim()}`,
    '',
    'Return ONLY the complete updated React component inside a single ```jsx code block.',
    'Do not include any explanation outside the code block.',
    'Preserve all existing functionality unless the change requires removing it.',
    'Keep the same export default function signature.',
  ].join('\n');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const proc = spawnClaude(['-p', editPrompt, '--output-format', 'text']);

  proc.stdout.on('data', (chunk) => {
    res.write(`data: ${JSON.stringify({ text: chunk.toString() })}\n\n`);
  });

  proc.stderr.on('data', (chunk) => {
    console.error('Widget edit Claude stderr:', chunk.toString());
  });

  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      res.write(`data: ${JSON.stringify({ error: `Claude exited with code ${code}` })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  proc.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  res.on('close', () => proc.kill());
});

export default router;

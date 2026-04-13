import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { claudeAvailable, spawnClaude } from '../claude-runner.js';

const router = Router();

let DATA_DIR = path.resolve(process.cwd(), 'data');
let WORKSPACES_DIR = path.resolve(process.cwd(), 'server', 'workspaces');
let PLAYGROUND_DIR = path.join(DATA_DIR, '.playground');

const STALE_THREAD_MS = 7 * 24 * 60 * 60 * 1000;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readWorkspace(workspaceId) {
  if (!workspaceId) return null;
  const filePath = path.join(WORKSPACES_DIR, `${workspaceId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getThreadDir(workspaceId, threadId) {
  return path.join(PLAYGROUND_DIR, workspaceId, threadId);
}

function getAttachmentsDir(workspaceId, threadId) {
  return path.join(getThreadDir(workspaceId, threadId), 'attachments');
}

function cleanFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getWorkspaceContextPath(workspaceId, threadId) {
  return path.join(getThreadDir(workspaceId, threadId), 'workspace-context.md');
}

function getAttachmentManifestPath(workspaceId, threadId) {
  return path.join(getThreadDir(workspaceId, threadId), 'attachment-manifest.json');
}

function touchThreadDir(workspaceId, threadId) {
  const threadDir = ensureDir(getThreadDir(workspaceId, threadId));
  const attachmentsDir = ensureDir(getAttachmentsDir(workspaceId, threadId));
  const now = new Date();
  fs.utimesSync(threadDir, now, now);
  fs.utimesSync(attachmentsDir, now, now);
  return { threadDir, attachmentsDir };
}

function serializeObjectLines(objectValue) {
  return Object.entries(objectValue || {})
    .map(([key, value]) => `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n');
}

function writeWorkspaceContextFile(workspace, workspaceId, threadId) {
  const threadDir = ensureDir(getThreadDir(workspaceId, threadId));
  const workspaceConfigPath = path.join(WORKSPACES_DIR, `${workspaceId}.json`);
  const workspaceRoot = path.resolve(DATA_DIR, '..');
  const dataFiles = (workspace.dataSource?.files || []).map((fileName) => ({
    fileName,
    absolutePath: path.join(DATA_DIR, fileName),
  }));
  const dbAbsolutePath = workspace.dbFile ? path.resolve(workspaceRoot, workspace.dbFile) : null;

  const content = [
    '# Beacon Workspace Context',
    '',
    `- Workspace name: ${workspace.name}`,
    `- Workspace id: ${workspace.id}`,
    `- Workspace config path: ${workspaceConfigPath}`,
    `- SQLite database path: ${dbAbsolutePath || 'N/A'}`,
    '',
    '## Data Source Files',
    ...(dataFiles.length > 0
      ? dataFiles.map((file) => `- ${file.fileName}: ${file.absolutePath}`)
      : ['- None']),
    '',
    '## Import Result',
    `- Row count: ${workspace.importResult?.rowCount ?? 0}`,
    `- Columns: ${JSON.stringify(workspace.importResult?.columns || [])}`,
    '',
    '## Canonical Mapping',
    serializeObjectLines(workspace.columnMapping || {}),
    '',
    '## Missing Required Fields',
    ...(workspace.missingRequiredFields?.length
      ? workspace.missingRequiredFields.map((field) => `- ${field}`)
      : ['- None']),
    '',
    '## Unmapped Columns',
    ...(workspace.unmappedColumns?.length
      ? workspace.unmappedColumns.map((field) => `- ${field}`)
      : ['- None']),
    '',
    '## Segmentation Summary',
    serializeObjectLines(workspace.segmentation || {}),
    '',
    '## Beacon Data APIs',
    `- Summary: /api/data/summary?workspace=${workspace.id}`,
    `- Segments: /api/data/segments?workspace=${workspace.id}`,
    `- Members: /api/data/members?workspace=${workspace.id}`,
    '',
    'Use this file as the starting map of the workspace before reading raw files or querying the database.',
  ].join('\n');

  const outputPath = getWorkspaceContextPath(workspaceId, threadId);
  fs.writeFileSync(outputPath, content);
  return outputPath;
}

function writeAttachmentManifest(workspaceId, threadId, attachments) {
  const outputPath = getAttachmentManifestPath(workspaceId, threadId);
  fs.writeFileSync(outputPath, JSON.stringify({ attachments }, null, 2));
  return outputPath;
}

function buildSystemPrompt(mode) {
  const shared = [
    'You are the AI engine for Beacon, an internal analytics app for GetOut.',
    'Beacon focuses on member activation, retention, churn risk, and dashboard visualizations.',
    'You have directory access to the active workspace files, workspace config, SQLite database path, and any chat-scoped attachments.',
    'Prefer grounding your answers in the provided workspace context and referenced files.',
    'Be concise, concrete, and analytical.',
  ];

  if (mode === 'build') {
    shared.push(
      'You are in BUILD mode. Prioritize producing new visualizations or concrete implementation guidance for a visualization.',
      'When the user asks for a visualization, return ONLY a single ```jsx code block containing one default-exported React component and nothing outside the code block.',
      'The component must use React, Recharts, Tailwind utility classes, and optional Lucide icons only.',
      'Prefer the same data access pattern as Beacon core widgets: import useAppStore from "../../stores/useAppStore.js" and import { api } from "../../utils/api.js", then read activeWorkspaceId from the store before fetching data.',
      'Match Beacon aesthetics with semantic Tailwind colors like bg-surface-secondary, bg-surface-tertiary, text-content-primary, text-content-muted, border-border-subtle, and accent blue sparingly.',
      'Handle loading, empty, and error states in the component.',
      'Use Beacon-compatible data sources only: /api/data/summary, /api/data/segments, /api/data/members, and /api/data/metrics endpoints with the active workspace query parameter.',
      'Export a single self-contained component with export default function ... and no external imports beyond react, recharts, and lucide-react.',
      'Do not emit explanations around the code block when you are returning a visualization component.'
    );
  } else {
    shared.push(
      'You are in PLAN mode. Focus on hypotheses, questions, available data, possible analyses, risks, caveats, and recommended next steps.',
      'Do not output React visualization code unless the user explicitly asks to switch to Build mode.'
    );
  }

  return shared.join('\n');
}

function buildUserPrompt({ workspace, workspaceContextPath, attachmentManifestPath, message, mode, conversationHistory, attachments }) {
  const lines = [
    `Beacon Playground mode: ${mode.toUpperCase()}`,
    `Active workspace: ${workspace.name} (${workspace.id})`,
    `Workspace context file: ${workspaceContextPath}`,
    `Attachment manifest file: ${attachmentManifestPath}`,
    '',
    'You can inspect the workspace context file, workspace config, source data files, and any uploaded attachments from the allowed directories.',
  ];

  if (attachments?.length) {
    lines.push('', 'Attachments available in this thread:');
    for (const attachment of attachments) {
      lines.push(`- ${attachment.name}: ${attachment.absolutePath}`);
    }
  }

  if (conversationHistory?.length) {
    lines.push('', 'Recent conversation history:');
    for (const item of conversationHistory.slice(-10)) {
      lines.push(`${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`);
    }
  }

  lines.push('', 'Latest user request:', message);

  return lines.join('\n');
}

export function configurePlaygroundPaths({ dataDir, workspacesDir }) {
  DATA_DIR = dataDir;
  WORKSPACES_DIR = workspacesDir;
  PLAYGROUND_DIR = path.join(DATA_DIR, '.playground');
  ensureDir(PLAYGROUND_DIR);
  ensureDir(path.join(PLAYGROUND_DIR, '.uploads'));
}

export function sweepPlaygroundThreads() {
  if (!fs.existsSync(PLAYGROUND_DIR)) return;

  const cutoff = Date.now() - STALE_THREAD_MS;
  const workspaceDirs = fs.readdirSync(PLAYGROUND_DIR, { withFileTypes: true });

  for (const workspaceEntry of workspaceDirs) {
    if (!workspaceEntry.isDirectory() || workspaceEntry.name.startsWith('.')) continue;
    const workspacePath = path.join(PLAYGROUND_DIR, workspaceEntry.name);
    const threadDirs = fs.readdirSync(workspacePath, { withFileTypes: true });

    for (const threadEntry of threadDirs) {
      if (!threadEntry.isDirectory()) continue;
      const threadPath = path.join(workspacePath, threadEntry.name);
      const stats = fs.statSync(threadPath);
      if (stats.mtimeMs < cutoff) {
        fs.rmSync(threadPath, { recursive: true, force: true });
      }
    }
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, ensureDir(path.join(PLAYGROUND_DIR, '.uploads')));
    },
    filename: (_req, file, callback) => {
      callback(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${cleanFileName(file.originalname)}`);
    },
  }),
});

router.post('/attachments', upload.array('files', 10), (req, res) => {
  try {
    const { workspaceId, threadId } = req.body;
    if (!workspaceId || !threadId) {
      return res.status(400).json({ error: 'workspaceId and threadId are required' });
    }

    const workspace = readWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    if (!req.files?.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { attachmentsDir } = touchThreadDir(workspaceId, threadId);
    const uploadedFiles = req.files.map((file) => {
      const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${cleanFileName(file.originalname)}`;
      const destinationPath = path.join(attachmentsDir, storedName);
      fs.renameSync(file.path, destinationPath);

      return {
        id: randomUUID(),
        name: file.originalname,
        storedName,
        size: file.size,
        mimeType: file.mimetype,
        absolutePath: destinationPath,
      };
    });

    const existingAttachments = fs.existsSync(getAttachmentManifestPath(workspaceId, threadId))
      ? JSON.parse(fs.readFileSync(getAttachmentManifestPath(workspaceId, threadId), 'utf-8')).attachments || []
      : [];

    writeAttachmentManifest(workspaceId, threadId, [...existingAttachments, ...uploadedFiles]);
    res.json({ files: uploadedFiles });
  } catch (error) {
    console.error('Playground attachment upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/thread/:threadId', (req, res) => {
  try {
    const { workspace } = req.query;
    const { threadId } = req.params;
    if (!workspace || !threadId) {
      return res.status(400).json({ error: 'workspace and threadId are required' });
    }

    const threadDir = getThreadDir(workspace, threadId);
    if (fs.existsSync(threadDir)) {
      fs.rmSync(threadDir, { recursive: true, force: true });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Playground thread delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/chat', (req, res) => {
  const { workspaceId, threadId, mode = 'plan', message, conversationHistory = [], attachments = [] } = req.body;

  if (!workspaceId || !threadId || !message) {
    return res.status(400).json({ error: 'workspaceId, threadId, and message are required' });
  }

  if (!claudeAvailable) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ error: 'Claude Code is not available. Make sure it is installed and run `claude login` in a terminal.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();
  }

  const workspace = readWorkspace(workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const { threadDir, attachmentsDir } = touchThreadDir(workspaceId, threadId);
  const workspaceContextPath = writeWorkspaceContextFile(workspace, workspaceId, threadId);
  const attachmentManifestPath = writeAttachmentManifest(workspaceId, threadId, attachments);
  const prompt = buildUserPrompt({
    workspace,
    workspaceContextPath,
    attachmentManifestPath,
    message,
    mode,
    conversationHistory,
    attachments,
  });
  const systemPrompt = buildSystemPrompt(mode);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const args = [
    '-p',
    prompt,
    '--output-format',
    'text',
    '--append-system-prompt',
    systemPrompt,
    '--add-dir',
    DATA_DIR,
    '--add-dir',
    WORKSPACES_DIR,
    '--add-dir',
    attachmentsDir,
  ];

  const proc = spawnClaude(args, { cwd: threadDir });

  proc.stdout.on('data', (chunk) => {
    res.write(`data: ${JSON.stringify({ text: chunk.toString() })}\n\n`);
  });

  proc.stderr.on('data', (chunk) => {
    console.error('Playground Claude stderr:', chunk.toString());
  });

  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      res.write(`data: ${JSON.stringify({ error: `Claude exited with code ${code}` })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  proc.on('error', (error) => {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    proc.kill();
  });
});

export default router;

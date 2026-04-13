# Beacon Claude Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix playground Claude connection, refocus AI Panel on data insights only, add three-dot widget menus with AI-edit capability, and ensure all visualizations persist across app restarts.

**Architecture:** Extract a shared `claude-runner.js` module so both `chat.js` and `playground.js` use the same resolved binary and shell environment. The playground bug is a single line — it hardcodes `spawn('claude', ...)` instead of using the resolved binary. Widget persistence already works via `data/widgets/{workspaceId}/registry.json`; we add AI-edit on top of it. Three-dot menus replace the current icon row on custom widget cards.

**Tech Stack:** Express.js (ESM), React 18 + Zustand, Tailwind CSS, Lucide React, sucrase (JSX runtime), Claude Code CLI subprocess (SSE streaming)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `server/claude-runner.js` | Binary resolution, shell env sourcing, `spawnClaude()` helper — single source of truth |
| **Modify** | `server/routes/chat.js` | Import from claude-runner, remove widget-building capability |
| **Modify** | `server/routes/playground.js` | Import from claude-runner, replace hardcoded `spawn('claude', ...)` |
| **Modify** | `server/routes/widgets.js` | Add `POST /api/widgets/:id/ai-edit` SSE endpoint |
| **Create** | `src/components/WidgetMenu.jsx` | Three-dot dropdown (View Code, Edit with AI, Star, Delete) |
| **Create** | `src/components/WidgetEditModal.jsx` | AI-edit modal: shows code, chat input, streams Claude response, saves |
| **Modify** | `src/pages/Dashboard.jsx` | Use WidgetMenu + WidgetEditModal, remove inline icon row |

---

## Task 1: Create Shared Claude Runner

**Why:** `playground.js` calls `spawn('claude', ...)` with a hardcoded name and `process.env` only. The server process (especially in Electron) inherits a minimal PATH with no `~/.local/bin`. The binary never resolves, so every playground request silently fails before streaming starts. Extracting the resolution logic from `chat.js` into a shared module fixes playground and keeps both routes in sync.

**Files:**
- Create: `server/claude-runner.js`

- [ ] **Step 1: Create the shared runner module**

```js
// server/claude-runner.js
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Binary resolution ────────────────────────────────────────────────────────

const CLAUDE_CANDIDATES = [
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
];

let claudeAvailable = false;
let claudeVersion = '';
let claudeBin = 'claude';

for (const candidate of CLAUDE_CANDIDATES) {
  try {
    if (fs.existsSync(candidate)) {
      const result = execSync(`"${candidate}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (result) {
        claudeBin = candidate;
        claudeAvailable = true;
        claudeVersion = result;
        break;
      }
    }
  } catch { /* try next */ }
}

if (!claudeAvailable) {
  try {
    const result = execSync('claude --version', { encoding: 'utf-8', timeout: 5000, shell: true }).trim();
    if (result && !result.includes('not found')) {
      claudeAvailable = true;
      claudeVersion = result;
      try {
        const resolved = execSync('which claude', { encoding: 'utf-8', timeout: 5000, shell: true }).trim();
        if (resolved) claudeBin = resolved;
      } catch { /* keep 'claude' */ }
    }
  } catch { /* unavailable */ }
}

// ── Shell environment sourcing ───────────────────────────────────────────────

let shellEnv = { ...process.env };
try {
  const userShell = process.env.SHELL || '/bin/zsh';
  const envOutput = execSync(`${userShell} -l -c env 2>/dev/null`, {
    encoding: 'utf-8',
    timeout: 8000,
  });
  const parsed = {};
  for (const line of envOutput.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) parsed[line.slice(0, eq)] = line.slice(eq + 1);
  }
  shellEnv = { ...parsed, ...process.env };
  console.log('[claude-runner] Shell environment sourced.');
  if (shellEnv.ANTHROPIC_API_KEY) {
    console.log('[claude-runner] ANTHROPIC_API_KEY found in shell environment.');
  }
} catch (err) {
  console.warn('[claude-runner] Could not source shell environment:', err.message);
}

// ── Spawn helper ─────────────────────────────────────────────────────────────

/**
 * Spawn the Claude CLI and return the child process.
 * @param {string[]} args - CLI arguments (e.g. ['-p', prompt, '--output-format', 'text'])
 * @param {{ cwd?: string, timeout?: number }} [options]
 */
function spawnClaude(args, options = {}) {
  return spawn(claudeBin, args, {
    timeout: options.timeout ?? 120000,
    cwd: options.cwd,
    env: { ...shellEnv, HOME: os.homedir() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export { claudeAvailable, claudeVersion, claudeBin, shellEnv, spawnClaude };
```

- [ ] **Step 2: Verify the module loads without errors**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
node --input-type=module <<'EOF'
import { claudeAvailable, claudeVersion, claudeBin } from './server/claude-runner.js';
console.log({ claudeAvailable, claudeVersion, claudeBin });
EOF
```

Expected output: `{ claudeAvailable: true, claudeVersion: '...', claudeBin: '/Users/.../.local/bin/claude' }` (or similar resolved path)

- [ ] **Step 3: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add server/claude-runner.js
git commit -m "feat: extract shared Claude binary resolver and spawn helper"
```

---

## Task 2: Fix Playground Route (the core bug)

**Why:** `playground.js` line 337 does `spawn('claude', args, { env: { ...process.env } })`. Two problems: hardcoded binary name fails on Electron's minimal PATH, and `process.env` lacks `ANTHROPIC_API_KEY`. Fixing this is why playground AI has never worked.

**Files:**
- Modify: `server/routes/playground.js`

- [ ] **Step 1: Replace the import block at the top of playground.js**

Find the current import block:
```js
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
```

Replace with:
```js
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { claudeAvailable, spawnClaude } from '../claude-runner.js';
```

- [ ] **Step 2: Replace the hardcoded spawn call in the `/chat` route**

Find (around line 322-342):
```js
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

  const proc = spawn('claude', args, {
    cwd: threadDir,
    timeout: 120000,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
```

Replace with:
```js
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
```

- [ ] **Step 3: Add a claudeAvailable guard at the top of the `/chat` route handler**

Find the line at the start of `router.post('/chat', ...)`:
```js
router.post('/chat', (req, res) => {
  const { workspaceId, threadId, mode = 'plan', message, conversationHistory = [], attachments = [] } = req.body;

  if (!workspaceId || !threadId || !message) {
    return res.status(400).json({ error: 'workspaceId, threadId, and message are required' });
  }
```

Replace with:
```js
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
    res.write(`data: ${JSON.stringify({ text: 'Claude Code is not available. Make sure it is installed and run `claude login` in a terminal.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();
  }
```

- [ ] **Step 4: Start the dev server and verify playground sends/receives a message**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
npm run dev
```

Open the app, go to Dashboard > Playground tab, select a workspace, type "What segments are in this workspace?" and send. You should see the three-dot bouncing "Thinking..." animation followed by a real Claude response.

- [ ] **Step 5: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add server/routes/playground.js
git commit -m "fix: playground Claude connection - use shared runner with resolved binary and shell env"
```

---

## Task 3: Refocus AI Panel on Data Insights Only

**Why:** The AI Panel currently detects widget-building requests and injects visualization instructions. The playground is the right place for that. The AI Panel should be strictly for data analysis, retention insights, and member-level Q&A.

**Files:**
- Modify: `server/routes/chat.js`

- [ ] **Step 1: Replace the import in chat.js to use the shared runner**

Find the current top of `chat.js`:
```js
import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();
```

Replace with:
```js
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { claudeAvailable, claudeVersion, spawnClaude } from '../claude-runner.js';

const router = Router();
```

- [ ] **Step 2: Remove all binary resolution and shell env code from chat.js**

Delete everything from line 40 through line 106 (the `claudeAvailable`, `claudeVersion`, `claudeBin`, `CLAUDE_CANDIDATES` declarations, the resolution loop, and the shell env sourcing block). They are now in `claude-runner.js`.

The file should jump from the router declaration directly to the TEXT_EXTENSIONS and other constants.

- [ ] **Step 3: Update buildContext() to remove widget-building capability**

Find:
```js
  parts.push('\nCAPABILITIES:');
  parts.push('- Answer questions about member data and retention');
  parts.push('- Provide strategic insights about activation and churn');
  parts.push('- Draft intervention emails and campaign copy');
  parts.push('- Help interpret trends and anomalies');
  parts.push('- Build custom dashboard widgets (React + Recharts + Tailwind)');
  parts.push('\nRespond concisely. Reference actual numbers when relevant.');
```

Replace with:
```js
  parts.push('\nCAPABILITIES:');
  parts.push('- Answer questions about member data and health scores');
  parts.push('- Provide strategic insights about activation, churn, and retention');
  parts.push('- Analyze segment trends and surface anomalies');
  parts.push('- Draft intervention emails and campaign copy');
  parts.push('- Interpret specific member or cohort behavior on request');
  parts.push('\nFocus on numerical insights and data analysis. To build dashboard visualizations, direct the user to the Playground tab.');
  parts.push('Respond concisely. Reference actual numbers when relevant.');
```

- [ ] **Step 4: Remove isWidgetRequest and getWidgetInstructions entirely**

Delete the `isWidgetRequest()` function (lines 178-182) and the `getWidgetInstructions()` function (lines 184-207).

- [ ] **Step 5: Remove the widget detection call in the POST / handler**

Find:
```js
  if (isWidgetRequest(normalizedMessage || '')) {
    fullPrompt += '\n\n' + getWidgetInstructions();
  }
```

Delete those three lines.

- [ ] **Step 6: Replace the spawn call in the POST / handler to use spawnClaude**

Find:
```js
    const proc = spawn(claudeBin, ['-p', fullPrompt, '--output-format', 'text'], {
      timeout: 120000,
      env: { ...shellEnv, HOME: os.homedir() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
```

Replace with:
```js
    const proc = spawnClaude(['-p', fullPrompt, '--output-format', 'text']);
```

- [ ] **Step 7: Update the /debug endpoint to use spawnClaude**

Find:
```js
  const proc = spawn(claudeBin, ['-p', 'Reply with exactly the word: PONG', '--output-format', 'text'], {
    timeout: 30000,
    env: { ...shellEnv, HOME: os.homedir() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
```

Replace with:
```js
  const proc = spawnClaude(['-p', 'Reply with exactly the word: PONG', '--output-format', 'text'], { timeout: 30000 });
```

Also update the debug response to remove `hasApiKey: !!shellEnv.ANTHROPIC_API_KEY` since `shellEnv` is no longer in scope — replace with `hasApiKey: false` or remove that field.

- [ ] **Step 8: Test AI Panel still works**

Start `npm run dev`, open the AI Panel (the side panel), and ask: "What percentage of members are ghosts?" Verify you get a data-focused response and no widget code.

- [ ] **Step 9: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add server/routes/chat.js
git commit -m "refactor: AI panel focused on data insights only, delegates visualization to playground"
```

---

## Task 4: Three-Dot Widget Menu Component

**Why:** The current custom widget card has small icon buttons in the top-right corner. The user wants a three-dot (`MoreVertical`) dropdown that reveals: View Code, Edit with AI, Star/Unstar, Delete. This is a self-contained UI component.

**Files:**
- Create: `src/components/WidgetMenu.jsx`

- [ ] **Step 1: Create the WidgetMenu component**

```jsx
// src/components/WidgetMenu.jsx
import { useEffect, useRef, useState } from 'react';
import { Code, MoreVertical, Pencil, Star, Trash2 } from 'lucide-react';

export default function WidgetMenu({ widget, onViewCode, onEditWithAI, onToggleStar, onDelete }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleItem(fn) {
    setOpen(false);
    fn();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
        title="Widget options"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border-subtle bg-surface-primary shadow-lg py-1 text-sm">
          <button
            onClick={() => handleItem(onViewCode)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <Code size={13} />
            View Code
          </button>
          <button
            onClick={() => handleItem(onEditWithAI)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <Pencil size={13} />
            Edit with AI
          </button>
          <button
            onClick={() => handleItem(onToggleStar)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-secondary transition-colors ${
              widget.starred ? 'text-yellow-500' : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            <Star size={13} fill={widget.starred ? 'currentColor' : 'none'} />
            {widget.starred ? 'Unstar' : 'Star'}
          </button>
          <div className="my-1 border-t border-border-subtle" />
          <button
            onClick={() => handleItem(onDelete)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-surface-secondary transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add src/components/WidgetMenu.jsx
git commit -m "feat: WidgetMenu three-dot dropdown component"
```

---

## Task 5: AI Widget Edit — Backend Endpoint

**Why:** The "Edit with AI" menu option needs a backend that takes the current widget code + a change description, calls Claude to produce revised code, and streams it back as SSE. This is added to the existing widgets route.

**Files:**
- Modify: `server/routes/widgets.js`

- [ ] **Step 1: Add claude-runner import to widgets.js**

Find the top of `server/routes/widgets.js`:
```js
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
```

Replace with:
```js
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { claudeAvailable, spawnClaude } from '../claude-runner.js';
```

- [ ] **Step 2: Add the AI edit endpoint before `export default router`**

Add this entire block just before the final `export default router;` line:

```js
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
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add server/routes/widgets.js
git commit -m "feat: add AI-assisted widget edit streaming endpoint"
```

---

## Task 6: AI Widget Edit — Frontend Modal

**Why:** "Edit with AI" needs a modal UI that shows current code, accepts a change description, streams the Claude response, extracts revised code, and saves it on confirmation.

**Files:**
- Create: `src/components/WidgetEditModal.jsx`

- [ ] **Step 1: Create the modal component**

```jsx
// src/components/WidgetEditModal.jsx
import { useRef, useState } from 'react';
import { CheckCircle2, Send, X } from 'lucide-react';
import { api } from '../utils/api.js';
import { extractVisualizationArtifact } from '../utils/playground.js';

export default function WidgetEditModal({ widget, workspaceId, onSave, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [revisedCode, setRevisedCode] = useState(null);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  async function handleGenerate() {
    if (!prompt.trim() || streaming) return;

    setStreaming(true);
    setStreamedContent('');
    setRevisedCode(null);
    setError('');

    try {
      const response = await fetch(
        `/api/widgets/${widget.id}/ai-edit?workspace=${workspaceId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Edit request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (!reader) throw new Error('No response stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullContent += data.text;
              setStreamedContent(fullContent);
            }
            if (data.error) {
              setError(data.error);
              setStreaming(false);
              return;
            }
            if (data.done) {
              const artifact = extractVisualizationArtifact(fullContent);
              if (artifact?.code) {
                setRevisedCode(artifact.code);
              } else {
                setError('Claude did not return valid JSX code. Try rephrasing your request.');
              }
              setStreaming(false);
              return;
            }
          } catch { /* skip malformed */ }
        }
      }
      setStreaming(false);
    } catch (err) {
      setError(err.message);
      setStreaming(false);
    }
  }

  async function handleSave() {
    if (!revisedCode) return;
    try {
      await api.put(`/widgets/${widget.id}?workspace=${workspaceId}`, { code: revisedCode });
      onSave({ ...widget, code: revisedCode });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-primary border border-border-subtle shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-semibold text-content-primary">Edit with AI: {widget.title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Current code */}
        <div className="px-5 py-3 border-b border-border-subtle shrink-0">
          <p className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">Current Code</p>
          <pre className="text-xs text-content-secondary bg-surface-secondary rounded-lg p-3 overflow-x-auto max-h-36 overflow-y-auto">
            {widget.code}
          </pre>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Prompt input */}
          <div>
            <label className="block text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
              Describe the change
            </label>
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                rows={2}
                placeholder="e.g. Change the bar chart to a line chart and add a 30-day moving average"
                className="flex-1 bg-surface-secondary border border-border-subtle rounded-xl px-3 py-2 text-sm text-content-primary placeholder:text-content-muted resize-none outline-none focus:border-accent/50 transition-colors"
                disabled={streaming}
              />
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || streaming}
                className="shrink-0 p-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
              >
                <Send size={15} />
              </button>
            </div>
          </div>

          {/* Streaming / thinking state */}
          {streaming && !streamedContent && (
            <div className="flex items-center gap-2 text-content-muted text-sm py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs">Thinking...</span>
            </div>
          )}

          {/* Revised code preview */}
          {(streamedContent || revisedCode) && (
            <div>
              <p className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
                {revisedCode ? 'Revised Code' : 'Generating...'}
              </p>
              <pre className="text-xs text-content-secondary bg-surface-secondary rounded-lg p-3 overflow-x-auto max-h-56 overflow-y-auto">
                {revisedCode ?? streamedContent}
                {streaming && (
                  <span className="inline-block w-1.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-subtle shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!revisedCode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 size={14} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add src/components/WidgetEditModal.jsx
git commit -m "feat: WidgetEditModal for AI-assisted widget editing with streaming preview"
```

---

## Task 7: Wire Dashboard — Three-Dot Menu + Edit Modal

**Why:** Connect the new `WidgetMenu` and `WidgetEditModal` components into `Dashboard.jsx`, replacing the existing inline icon row on custom widgets and adding the edit flow.

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Update the import block at the top of Dashboard.jsx**

Find:
```js
import {
  ArrowRight,
  Code,
  LayoutDashboard,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
```

Replace with:
```js
import { ArrowRight, LayoutDashboard, Sparkles } from 'lucide-react';
import WidgetMenu from '../components/WidgetMenu.jsx';
import WidgetEditModal from '../components/WidgetEditModal.jsx';
```

- [ ] **Step 2: Add editingWidget state to the Dashboard component**

Find:
```js
  const [customWidgets, setCustomWidgets] = useState([]);
  const [previewWidget, setPreviewWidget] = useState(null);
  const [showCode, setShowCode] = useState(null);
```

Replace with:
```js
  const [customWidgets, setCustomWidgets] = useState([]);
  const [previewWidget, setPreviewWidget] = useState(null);
  const [showCode, setShowCode] = useState(null);
  const [editingWidget, setEditingWidget] = useState(null);
```

- [ ] **Step 3: Add handleWidgetSaved handler after the toggleStar function**

Find (after the `toggleStar` function):
```js
  return (
    <div className="h-full flex flex-col overflow-hidden">
```

Insert before that `return`:
```js
  function handleWidgetSaved(updatedWidget) {
    setCustomWidgets((current) =>
      current.map((w) => (w.id === updatedWidget.id ? updatedWidget : w))
    );
    setEditingWidget(null);
  }
```

- [ ] **Step 4: Replace the custom widget card actions in DashboardMainContent**

Inside `DashboardMainContent`, find the entire `div.absolute.top-3.right-3` block:
```jsx
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
                <button
                  onClick={() => onToggleStar(widget)}
                  className={`p-1 rounded ${
                    widget.starred ? 'text-yellow-500' : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  <Star size={14} fill={widget.starred ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => onToggleCode(widget.id)}
                  className="p-1 text-content-muted hover:text-content-secondary"
                >
                  <Code size={14} />
                </button>
                <button
                  onClick={() => onDeleteWidget(widget.id)}
                  className="p-1 text-content-muted hover:text-[var(--danger)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
```

Replace with:
```jsx
              <div className="absolute top-3 right-3 z-10">
                <WidgetMenu
                  widget={widget}
                  onViewCode={() => onToggleCode(widget.id)}
                  onEditWithAI={() => onEditWidget(widget)}
                  onToggleStar={() => onToggleStar(widget)}
                  onDelete={() => onDeleteWidget(widget.id)}
                />
              </div>
```

- [ ] **Step 5: Add onEditWidget to DashboardMainContent props**

Find the DashboardMainContent function signature:
```js
function DashboardMainContent({
  activeWorkspace,
  customWidgets,
  previewWidget,
  showCode,
  onAddWidget,
  onDeleteWidget,
  onToggleStar,
  onToggleCode,
  onDiscardPreview,
  onRevisePreview,
  onGoToSettings,
}) {
```

Replace with:
```js
function DashboardMainContent({
  activeWorkspace,
  customWidgets,
  previewWidget,
  showCode,
  onAddWidget,
  onDeleteWidget,
  onToggleStar,
  onToggleCode,
  onEditWidget,
  onDiscardPreview,
  onRevisePreview,
  onGoToSettings,
}) {
```

- [ ] **Step 6: Pass onEditWidget into DashboardMainContent from Dashboard**

Find the `<DashboardMainContent` JSX block and add the new prop. Find:
```jsx
        <DashboardMainContent
          activeWorkspace={activeWorkspace}
          customWidgets={customWidgets}
          previewWidget={previewWidget}
          showCode={showCode}
          onAddWidget={addWidget}
          onDeleteWidget={deleteWidget}
          onToggleStar={toggleStar}
          onToggleCode={(id) => setShowCode((current) => (current === id ? null : id))}
          onDiscardPreview={() => setPreviewWidget(null)}
          onRevisePreview={() => {
            toggleAIPanel();
            setPreviewWidget(null);
          }}
          onGoToSettings={() => setActivePage('settings')}
        />
```

Replace with:
```jsx
        <DashboardMainContent
          activeWorkspace={activeWorkspace}
          customWidgets={customWidgets}
          previewWidget={previewWidget}
          showCode={showCode}
          onAddWidget={addWidget}
          onDeleteWidget={deleteWidget}
          onToggleStar={toggleStar}
          onToggleCode={(id) => setShowCode((current) => (current === id ? null : id))}
          onEditWidget={setEditingWidget}
          onDiscardPreview={() => setPreviewWidget(null)}
          onRevisePreview={() => {
            toggleAIPanel();
            setPreviewWidget(null);
          }}
          onGoToSettings={() => setActivePage('settings')}
        />
```

- [ ] **Step 7: Render WidgetEditModal at the bottom of the Dashboard return**

Find the closing `</div>` of the Dashboard's root div:
```jsx
    </div>
  );
}
```

Replace with:
```jsx
      {editingWidget && (
        <WidgetEditModal
          widget={editingWidget}
          workspaceId={activeWorkspace?.id}
          onSave={handleWidgetSaved}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: End-to-end test**

Start `npm run dev`. On the Dashboard main tab, add a custom widget via Playground. Then:
1. Click the three-dot `...` on the custom widget — the dropdown should show View Code, Edit with AI, Star, Delete.
2. Click "View Code" — code panel toggles below the widget.
3. Click "Edit with AI" — modal opens showing current code and a prompt input.
4. Type "Change the chart colors to use orange instead of blue" and send.
5. Thinking animation appears, then revised code streams in.
6. Click "Save Changes" — modal closes, widget re-renders with new code.
7. Refresh the page — widget is still there (persisted in `data/widgets/{id}/registry.json`).

- [ ] **Step 9: Commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add src/pages/Dashboard.jsx
git commit -m "feat: three-dot widget menu with AI-edit modal wired into dashboard"
```

---

## Task 8: Verify Full E2E Flow

- [ ] **Step 1: Test playground plan mode**

In the Playground tab, with a workspace selected, switch to PLAN mode and type: "What are the key activation risks we should investigate?" Verify:
- Thinking animation (bouncing dots) appears immediately
- Claude responds with analysis, not code

- [ ] **Step 2: Test playground build mode**

Switch to BUILD mode and type: "Build a bar chart showing member count by acquisition channel." Verify:
- Thinking animation appears
- Claude returns JSX code block
- A visualization artifact card appears below the response with an "Add to Dashboard" button
- Clicking "Add to Dashboard" saves it and it appears on the main tab

- [ ] **Step 3: Verify persistence across restart**

Stop the server (`Ctrl+C`). Restart with `npm run dev`. Navigate to Dashboard. Verify the custom widget you added is still present.

- [ ] **Step 4: Test AI Panel stays on data insights**

Open the AI Panel. Type "build me a chart showing health scores." Verify Claude responds with analysis or a redirect message, not JSX code.

- [ ] **Step 5: Final commit**

```bash
cd "/Users/stephengarner/dev/GetOut Assessment App/beacon"
git add -A
git commit -m "chore: beacon claude overhaul complete - shared runner, playground fix, widget AI-edit"
```

---

## Self-Review

### Spec Coverage

| Requirement | Covered By |
|-------------|-----------|
| Connect to Claude Code CLI without API key | Task 1 (uses existing OAuth-authenticated CLI) |
| No TOS violation | Already compliant: uses your own authenticated `claude` session |
| AI Panel for numerical insights only | Task 3 |
| Playground for plan + build visualizations | Task 2 (bug fix) |
| Visualizations saved locally and persist on reopen | Already working via widgets route; verified in Task 8 |
| Three-dot menu on every visualization | Task 4 + 7 |
| View code from three-dot menu | Task 7 (onViewCode handler) |
| Edit with AI from three-dot menu | Task 5 + 6 + 7 |
| Save edited widget | Task 6 (`handleSave` calls PUT /widgets/:id) |
| Playground thinking animation | Already in PlaygroundPanel code; appears once bug is fixed in Task 2 |
| Playground AI doesn't work at all | Fixed in Task 2 |

### Placeholder Scan

No TBDs, TODOs, or vague steps found. Every step contains actual code.

### Type Consistency

- `widget` object shape `{ id, title, code, starred, ... }` is consistent across Tasks 4, 6, and 7
- `extractVisualizationArtifact` is imported from `../utils/playground.js` in both PlaygroundPanel and WidgetEditModal
- `api.put` is the same utility used throughout the codebase
- `spawnClaude(args, options?)` signature is consistent across all three usages (Tasks 1, 2, 3, 5)

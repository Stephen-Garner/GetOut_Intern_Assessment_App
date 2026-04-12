import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();

// Check if Claude Code CLI is available
let claudeAvailable = false;
let claudeVersion = '';

try {
  const result = execSync('claude --version 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5000 }).trim();
  if (result && !result.includes('not found')) {
    claudeAvailable = true;
    claudeVersion = result;
  }
} catch {
  claudeAvailable = false;
}

// Availability check endpoint
router.get('/status', (req, res) => {
  res.json({ available: claudeAvailable, version: claudeVersion });
});

// Build context from workspace data
function buildContext(context) {
  const parts = ['You are an AI assistant embedded in Beacon, a member activation analytics dashboard for GetOut, a family entertainment membership company.'];

  if (context?.workspaceName) parts.push(`\nCURRENT WORKSPACE: ${context.workspaceName}`);

  if (context?.summary) {
    parts.push(`\nDATA SUMMARY:`);
    parts.push(`- Total members: ${context.summary.totalMembers || 0}`);
    if (context.summary.segmentCounts) parts.push(`- Segments: ${JSON.stringify(context.summary.segmentCounts)}`);
    if (context.summary.avgHealthScore != null) parts.push(`- Average health score: ${context.summary.avgHealthScore}`);
    if (context.summary.ghostPercentage != null) parts.push(`- Ghost percentage: ${context.summary.ghostPercentage}%`);
    if (context.summary.firstUseRate != null) parts.push(`- First-use rate (14-day): ${context.summary.firstUseRate}%`);
  }

  parts.push(`\nCAPABILITIES:`);
  parts.push(`- Answer questions about member data and retention`);
  parts.push(`- Provide strategic insights about activation and churn`);
  parts.push(`- Draft intervention emails and campaign copy`);
  parts.push(`- Help interpret trends and anomalies`);
  parts.push(`- Build custom dashboard widgets (React + Recharts + Tailwind)`);
  parts.push(`\nRespond concisely. Reference actual numbers when relevant.`);

  return parts.join('\n');
}

// Check if message is a widget creation request
function isWidgetRequest(message) {
  const triggers = ['build a chart', 'create a widget', 'show me a visualization', 'add a graph', 'make a table', 'build a widget', 'create a chart', 'build me a', 'make a chart', 'visualize', 'create a visualization'];
  const lower = message.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

function getWidgetInstructions() {
  return `
WIDGET CREATION INSTRUCTIONS:

Generate a COMPLETE, self-contained React component that:
1. Uses Recharts for charts (BarChart, LineChart, PieChart, AreaChart, etc.)
2. Uses Tailwind CSS classes for styling
3. Uses Lucide React icons if needed
4. Fetches data from the app's API:
   - GET /api/data/members?workspace=WORKSPACE_ID&limit=1000
   - GET /api/data/segments?workspace=WORKSPACE_ID
   - GET /api/data/metrics?type=channel_breakdown&workspace=WORKSPACE_ID
   - GET /api/data/metrics?type=market_comparison&workspace=WORKSPACE_ID
   - GET /api/data/metrics?type=activity_timeline&workspace=WORKSPACE_ID
   - GET /api/data/summary?workspace=WORKSPACE_ID
5. Handles loading, empty, and error states
6. Uses CSS variables for theme: var(--text-primary), var(--bg-secondary), etc.
7. Exports as default: export default function MyWidget() { ... }
8. Uses optional chaining (?.) on all data access
9. MUST be a single component in a single code block

CRITICAL: Output ONLY the React component code inside a single \`\`\`jsx code block. No explanation outside the code block.
`;
}

// Main chat endpoint with SSE streaming
router.post('/', async (req, res) => {
  const { message, conversationHistory, context } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!claudeAvailable) {
    return res.json({
      role: 'assistant',
      content: 'Claude Code is not installed on this system. Install it from https://docs.anthropic.com/en/docs/claude-code to enable AI features.',
      timestamp: new Date().toISOString(),
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Build prompt
  const systemContext = buildContext(context);
  let fullPrompt = systemContext;

  // Add conversation history (last 10 messages)
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-10);
    fullPrompt += '\n\nConversation so far:\n';
    for (const msg of recent) {
      fullPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    }
  }

  // Add widget instructions if needed
  if (isWidgetRequest(message)) {
    fullPrompt += '\n\n' + getWidgetInstructions();
  }

  fullPrompt += `\n\nUser: ${message}`;

  try {
    const proc = spawn('claude', ['-p', fullPrompt, '--output-format', 'text'], {
      timeout: 120000,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    proc.stderr.on('data', (data) => {
      console.error('Claude stderr:', data.toString());
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

    // Handle client disconnect
    req.on('close', () => {
      proc.kill();
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;

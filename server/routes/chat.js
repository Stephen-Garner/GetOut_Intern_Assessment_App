import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { claudeAvailable, claudeVersion, claudeBin, spawnClaude } from '../claude-runner.js';

const router = Router();

const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.tsv',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_TYPES = new Set([
  'application/csv',
  'application/javascript',
  'application/json',
  'application/sql',
  'application/typescript',
  'application/xml',
  'image/svg+xml',
]);
const INLINE_FILE_CHAR_LIMIT = 12000;
const INLINE_TOTAL_CHAR_LIMIT = 24000;


router.get('/status', (req, res) => {
  res.json({ available: claudeAvailable, version: claudeVersion });
});

// Debug endpoint: runs a trivial Claude query and reports stdout, stderr, and exit code.
// Visit /api/chat/debug in the browser to diagnose connection issues.
router.get('/debug', (req, res) => {
  if (!claudeAvailable) {
    return res.json({ ok: false, error: 'Claude binary not found', bin: claudeBin });
  }

  const proc = spawnClaude(['-p', 'Reply with exactly the word: PONG', '--output-format', 'text'], { timeout: 30000 });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (d) => { stdout += d.toString(); });
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  proc.on('close', (code) => {
    res.json({
      ok: code === 0 && stdout.trim().length > 0,
      bin: claudeBin,
      version: claudeVersion,
      exitCode: code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      hint: code === 0 && !stdout.trim()
        ? 'Claude ran but produced no output. Run "claude login" in a terminal to re-authenticate.'
        : code !== 0
        ? `Claude exited with code ${code}. Check stderr for details.`
        : 'OK',
    });
  });

  proc.on('error', (err) => {
    res.json({ ok: false, bin: claudeBin, error: err.message });
  });
});

function buildContext(context) {
  const parts = ['You are an AI assistant embedded in Beacon, a member activation analytics dashboard for GetOut, a family entertainment membership company.'];

  if (context?.workspaceName) parts.push(`\nCURRENT WORKSPACE: ${context.workspaceName}`);

  if (context?.summary) {
    parts.push('\nDATA SUMMARY:');
    parts.push(`- Total members: ${context.summary.totalMembers || 0}`);
    if (context.summary.segmentCounts) parts.push(`- Segments: ${JSON.stringify(context.summary.segmentCounts)}`);
    if (context.summary.avgHealthScore != null) parts.push(`- Average health score: ${context.summary.avgHealthScore}`);
    if (context.summary.ghostPercentage != null) parts.push(`- Ghost percentage: ${context.summary.ghostPercentage}%`);
    if (context.summary.firstUseRate != null) parts.push(`- First-use rate (14-day): ${context.summary.firstUseRate}%`);
  }

  parts.push('\nCAPABILITIES:');
  parts.push('- Answer questions about member data and health scores');
  parts.push('- Provide strategic insights about activation, churn, and retention');
  parts.push('- Analyze segment trends and surface anomalies');
  parts.push('- Draft intervention emails and campaign copy');
  parts.push('- Interpret specific member or cohort behavior on request');
  parts.push('\nFocus on numerical insights and data analysis. To build dashboard visualizations, direct the user to the Playground tab.');
  parts.push('Respond concisely. Reference actual numbers when relevant.');

  return parts.join('\n');
}


function isTextLikeAttachment(attachment) {
  const extension = path.extname(attachment.originalName || attachment.filename || '').toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return true;
  if (TEXT_MIME_TYPES.has(attachment.mimeType)) return true;
  return TEXT_MIME_PREFIXES.some(prefix => (attachment.mimeType || '').startsWith(prefix));
}

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;

  const filename = typeof attachment.filename === 'string' ? attachment.filename : '';
  const filePath = typeof attachment.path === 'string' ? attachment.path : '';
  if (!filename && !filePath) return null;

  const resolvedPath = path.resolve(filePath || filename);
  return {
    filename,
    originalName: attachment.originalName || filename || path.basename(resolvedPath),
    mimeType: attachment.mimeType || 'application/octet-stream',
    size: attachment.size,
    path: resolvedPath,
  };
}

function buildAttachmentContext(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';

  let remainingChars = INLINE_TOTAL_CHAR_LIMIT;
  const parts = ['\nATTACHMENTS:'];

  for (const rawAttachment of attachments) {
    const attachment = normalizeAttachment(rawAttachment);
    if (!attachment) continue;

    const descriptor = `- ${attachment.originalName} (${attachment.mimeType || 'unknown type'}${attachment.size != null ? `, ${attachment.size} bytes` : ''})`;

    if (!fs.existsSync(attachment.path)) {
      parts.push(`${descriptor}\n  File could not be found on disk when the request was processed.`);
      continue;
    }

    if (!isTextLikeAttachment(attachment)) {
      parts.push(`${descriptor}\n  Binary or image attachment received. Raw binary/image analysis is not enabled in this flow, so only metadata is available.`);
      continue;
    }

    if (remainingChars <= 0) {
      parts.push(`${descriptor}\n  Text content omitted because the total attachment context budget was exhausted.`);
      continue;
    }

    try {
      const fileText = fs.readFileSync(attachment.path, 'utf-8');
      const trimmedText = fileText.trim();

      if (!trimmedText) {
        parts.push(`${descriptor}\n  Text file was empty.`);
        continue;
      }

      const sliceLength = Math.min(trimmedText.length, INLINE_FILE_CHAR_LIMIT, remainingChars);
      const snippet = trimmedText.slice(0, sliceLength);
      remainingChars -= sliceLength;
      const truncationNote = trimmedText.length > sliceLength
        ? `\n  File content was truncated to the first ${sliceLength} characters.`
        : '';

      parts.push(`${descriptor}\n  Begin file contents:\n${snippet}\n  End file contents.${truncationNote}`);
    } catch (err) {
      parts.push(`${descriptor}\n  Text content could not be read: ${err.message}`);
    }
  }

  return parts.join('\n');
}

router.post('/', (req, res) => {
  const { message, conversationHistory, context, attachments } = req.body;
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (!normalizedMessage && !hasAttachments) {
    return res.status(400).json({ error: 'message or attachments are required' });
  }

  if (!claudeAvailable) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ text: 'Claude Code is not available on this system. Make sure it is installed and accessible (expected at ~/.local/bin/claude or /usr/local/bin/claude).' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const systemContext = buildContext(context);
  let fullPrompt = systemContext;

  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-10);
    fullPrompt += '\n\nConversation so far:\n';
    for (const msg of recent) {
      fullPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    }
  }

  const attachmentContext = buildAttachmentContext(attachments);
  if (attachmentContext) {
    fullPrompt += `\n\n${attachmentContext}`;
  }

  fullPrompt += `\n\nUser: ${normalizedMessage || 'Please review the attached files and respond based on them.'}`;

  try {
    const proc = spawnClaude(['-p', fullPrompt, '--output-format', 'text']);

    let stdoutReceived = false;
    let stderrContent = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) stdoutReceived = true;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderrContent += chunk;
      console.error('Claude stderr:', chunk);
    });

    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        const stderrHint = stderrContent.trim();
        const errorMsg = stderrHint
          ? `Claude exited with code ${code}: ${stderrHint}`
          : `Claude exited with code ${code}. Try running \`claude --version\` in your terminal to verify it is working.`;
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      } else if (!stdoutReceived) {
        // Claude ran successfully but produced no output. This usually means
        // authentication has expired or a permission prompt was shown in a
        // non-interactive context where it could not be answered.
        const stderrHint = stderrContent.trim();
        const errorMsg = stderrHint
          ? `Claude returned no response: ${stderrHint}`
          : 'Claude returned an empty response. This usually means it needs to be re-authenticated. Open a terminal and run: claude login';
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    });

    proc.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    });

    res.on('close', () => {
      proc.kill();
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;

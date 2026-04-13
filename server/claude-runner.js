// server/claude-runner.js
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Binary resolution

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

// Shell environment sourcing

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

// Spawn helper

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

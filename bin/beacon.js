#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Always run from the project directory
process.chdir(PROJECT_ROOT);

// Check if node_modules exists, install if not
if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules'))) {
  console.log('First run detected, installing dependencies...');
  execSync('npm install', { stdio: 'inherit', cwd: PROJECT_ROOT });
  console.log('');
}

console.log('Starting Beacon...\n');

const child = spawn('npm', ['run', 'beacon'], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code);
});

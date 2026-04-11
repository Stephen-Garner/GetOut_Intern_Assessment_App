#!/bin/bash
# Double-click this file to launch Beacon

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ ! -d "node_modules" ]; then
  echo "First run, installing dependencies..."
  npm install
  echo ""
fi

echo "Starting Beacon..."
echo ""
npm run beacon

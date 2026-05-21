#!/bin/bash
# ── Mantram AI — Clean Backend Starter ──────────────────────────────────────
# Kills all zombie node backend processes, then starts a fresh one.
# Usage: ./start.sh

echo "🔪 Killing all existing backend processes..."
pkill -9 -f "node.*index.js" 2>/dev/null
pkill -9 -f "node --watch" 2>/dev/null
pkill -9 -f "node backend" 2>/dev/null
sleep 2

# Verify port is free
if lsof -i -n -P 2>/dev/null | grep -q "3001.*LISTEN"; then
  echo "❌ Port 3001 still in use. Try: sudo pkill -9 -f node"
  exit 1
fi

echo "✅ Port 3001 free. Starting backend..."
cd "$(dirname "$0")/backend" && node index.js

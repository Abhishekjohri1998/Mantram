#!/bin/bash
# Mantram Deploy Script
# Usage: bash /home/ec2-user/Mantram/deploy.sh

set -e

echo "🚀 Starting Mantram deployment..."

# Pull latest code
cd /home/ec2-user/Mantram
git pull origin main

# Find latest deployment folder
LATEST=$(ls /home/ec2-user/deployments/ | sort | tail -1)
BACKEND_PATH="/home/ec2-user/deployments/${LATEST}/backend"

echo "📁 Latest deployment: ${LATEST}"
echo "📂 Backend path: ${BACKEND_PATH}"

# Start or restart PM2 — always pass --update-env to pick up any .env changes
if pm2 describe mantram-server > /dev/null 2>&1; then
    echo "🔄 Process found — restarting with updated env..."
    pm2 restart mantram-server --update-env
else
    echo "▶️  No process found — starting fresh..."
    pm2 start "${BACKEND_PATH}/index.js" --name mantram-server
fi

pm2 save
echo "✅ Deploy complete! Server is running."
pm2 list

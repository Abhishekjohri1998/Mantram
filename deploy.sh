#!/bin/bash
# Mantram Deploy Script
# Usage: bash /home/ec2-user/Mantram/deploy.sh
# Or full one-liner: cd /home/ec2-user/Mantram && git pull origin main && bash deploy.sh

set -e

APP_DIR="/home/ec2-user/Mantram/backend"

echo "🚀 Starting Mantram deployment..."

# Pull latest code
cd /home/ec2-user/Mantram
git pull origin main

# Install any new dependencies
echo "📦 Installing dependencies..."
cd "$APP_DIR"
npm install --omit=dev

cd /home/ec2-user/Mantram

# ── Restore GCP credentials after every deploy ──
echo "🔑 Restoring GCP credentials..."
mkdir -p "$APP_DIR/secrets"
cp /home/ec2-user/secrets/gcp-service-account.json "$APP_DIR/secrets/gcp-service-account.json"
sed -i 's|GOOGLE_APPLICATION_CREDENTIALS=.*|GOOGLE_APPLICATION_CREDENTIALS=/home/ec2-user/secrets/gcp-service-account.json|g' "$APP_DIR/.env"
echo "✅ GCP credentials restored"

# Start or restart PM2 — always pointing at Mantram/backend directly
if pm2 describe mantram-server > /dev/null 2>&1; then
    echo "🔄 Restarting with updated env..."
    pm2 restart mantram-server --update-env
else
    echo "▶️  Starting fresh..."
    pm2 start "$APP_DIR/index.js" --name mantram-server -i max --max-memory-restart 512M --update-env
fi

pm2 save
echo "✅ Deploy complete!"
pm2 list

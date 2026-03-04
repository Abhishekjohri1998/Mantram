#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Mantram AI — Rollback Script
# Usage:
#   ./rollback.sh              → Rollback to previous release
#   ./rollback.sh list         → List all available releases
#   ./rollback.sh <release>    → Rollback to specific release
# ══════════════════════════════════════════════════════════════

set -e

APP_DIR=/var/www/mantram
CURRENT_LINK=$APP_DIR/current
PREVIOUS_LINK=$APP_DIR/previous

current_release() {
  if [ -L "$CURRENT_LINK" ]; then
    basename "$(readlink -f "$CURRENT_LINK")"
  else
    echo "none"
  fi
}

# ── List releases ──
if [ "$1" = "list" ]; then
  echo "═══════════════════════════════════════════"
  echo "📦 Available Releases"
  echo "═══════════════════════════════════════════"
  CURRENT=$(current_release)
  PREV=""
  if [ -L "$PREVIOUS_LINK" ]; then
    PREV=$(basename "$(readlink -f "$PREVIOUS_LINK")")
  fi
  for dir in $(ls -dt $APP_DIR/releases/*/); do
    NAME=$(basename "$dir")
    MARKER=""
    if [ "$NAME" = "$CURRENT" ]; then
      MARKER=" ← CURRENT"
    elif [ "$NAME" = "$PREV" ]; then
      MARKER=" ← PREVIOUS"
    fi
    echo "  $NAME$MARKER"
  done
  echo ""
  echo "Usage: ./rollback.sh <release_name>"
  exit 0
fi

echo "═══════════════════════════════════════════"
echo "🔄 Mantram AI — Rollback"
echo "═══════════════════════════════════════════"
echo "Current: $(current_release)"

# ── Determine target ──
if [ -n "$1" ]; then
  # Specific release
  TARGET_DIR="$APP_DIR/releases/$1"
  if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Release not found: $1"
    echo "Run './rollback.sh list' to see available releases"
    exit 1
  fi
  echo "Target:  $1"
else
  # Previous release
  if [ ! -L "$PREVIOUS_LINK" ]; then
    echo "❌ No previous release found"
    echo "Run './rollback.sh list' to see available releases"
    exit 1
  fi
  TARGET_DIR=$(readlink -f "$PREVIOUS_LINK")
  echo "Target:  $(basename $TARGET_DIR) (previous)"
fi

echo ""
read -p "⚠️  Proceed with rollback? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Cancelled."
  exit 0
fi

# ── Execute rollback ──
echo "🔄 Switching symlink..."
ln -sfn "$TARGET_DIR" "$CURRENT_LINK"

echo "🔄 Reloading PM2..."
pm2 startOrReload $APP_DIR/shared/ecosystem.config.cjs --update-env
pm2 save

echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

# ── Health check ──
echo "🏥 Running health check..."
sleep 3
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
  echo "✅ Health check passed"
else
  echo "⚠️  Health check failed — server may still be starting"
  echo "   Check: pm2 logs mantram-server"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "✅ ROLLBACK COMPLETE"
echo "📁 Now running: $(current_release)"
echo "═══════════════════════════════════════════"

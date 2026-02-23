#!/bin/bash
# AutoSplit — Start script
# Launches the FastAPI backend (port 8001) and React frontend (port 5173).
# Run from anywhere: bash /path/to/autosplit/start.sh

set -e

# Resolve absolute path to this script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ⚡ AutoSplit — Starting up..."
echo "  Root: $SCRIPT_DIR"
echo ""

# ── Node.js PATH (Homebrew) ──────────────────────────────────────────────────
# Add node to PATH — required since it's not in zsh PATH by default
if [ -d "/opt/homebrew/Cellar/node" ]; then
  NODE_VERSION=$(ls /opt/homebrew/Cellar/node/ | sort -V | tail -1)
  export PATH="/opt/homebrew/Cellar/node/${NODE_VERSION}/bin:$PATH"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ── Kill any existing AutoSplit backends ─────────────────────────────────────
pkill -f "uvicorn main:app.*8001" 2>/dev/null || true
sleep 1

# ── Backend ──────────────────────────────────────────────────────────────────
echo "  [1/2] Starting FastAPI backend on http://localhost:8001"
cd "$SCRIPT_DIR/backend"
python3 -m pip install -r requirements.txt -q 2>/dev/null || true
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload > /tmp/autosplit-backend.log 2>&1 &
BACKEND_PID=$!
echo "        PID: $BACKEND_PID  |  Logs: /tmp/autosplit-backend.log"

# Wait for backend to be ready (max 20s)
echo "        Waiting for backend to start..."
for i in $(seq 1 40); do
  if curl -s http://localhost:8001/api/health | grep -q '"status"' 2>/dev/null; then
    echo "        ✓ Backend ready!"
    break
  fi
  sleep 0.5
done

# ── Seed data (only if DB is empty) ─────────────────────────────────────────
DB_FILE="$SCRIPT_DIR/backend/autosplit.db"
if [ ! -f "$DB_FILE" ] || [ "$(python3 -c "import sqlite3; conn=sqlite3.connect('$DB_FILE'); print(conn.execute('SELECT COUNT(*) FROM groups').fetchone()[0])" 2>/dev/null)" = "0" ]; then
  echo ""
  echo "  [seed] Populating sample data (Alice, Bob, Charlie roommates)..."
  cd "$SCRIPT_DIR/backend"
  python3 seed.py 2>/dev/null || echo "  [seed] Skipped (may already have data)"
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "  [2/2] Starting React frontend on http://localhost:5173"
cd "$SCRIPT_DIR/frontend"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "        Installing npm dependencies..."
  npm install 2>/dev/null
fi

npm run dev > /tmp/autosplit-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "        PID: $FRONTEND_PID  |  Logs: /tmp/autosplit-frontend.log"
sleep 3

echo ""
echo "  ══════════════════════════════════════════"
echo "  ✅ AutoSplit is running!"
echo ""
echo "     App:      http://localhost:5173"
echo "     API docs: http://localhost:8001/docs"
echo ""
echo "  DEMO: Open the app → click 'The Apartment'"
echo "        → Settlement → pick Alice → Compute"
echo ""
echo "  Stop: kill $BACKEND_PID $FRONTEND_PID"
echo "  ══════════════════════════════════════════"
echo ""

# Open the browser
open http://localhost:5173 2>/dev/null || true

# Keep alive
wait $FRONTEND_PID

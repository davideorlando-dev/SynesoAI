#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Avvio Syneso (Cloud AI)..."

cleanup() {
  echo ""
  echo "🛑 Chiusura Syneso in corso..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "🐍 Avvio Backend (http://localhost:8000)..."
(cd "$ROOT_DIR/backend" && uv run uvicorn app.main:app --reload) &
BACKEND_PID=$!

echo "⚛️  Avvio Frontend (http://localhost:3000)..."
(cd "$ROOT_DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

sleep 4
echo "🌐 Apro http://localhost:3000..."
open "http://localhost:3000" 2>/dev/null || true

echo "✅ Syneso è attivo! Premi Ctrl+C qui per chiudere tutto."
wait

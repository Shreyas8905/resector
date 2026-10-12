#!/bin/bash
set -Eeuo pipefail

echo "=== Starting Resector App ==="

mkdir -p /app/data/chroma /app/logs
CHROMA_PID=""
BACKEND_PID=""
FRONTEND_PID=""

# Start ChromaDB
echo "Starting ChromaDB..."
chroma run --host 127.0.0.1 --port 5000 --path /app/data/chroma \
  > /app/logs/chromadb.log 2>&1 &
CHROMA_PID=$!

cleanup() {
    echo "Shutting down..."
    for pid in "$FRONTEND_PID" "$BACKEND_PID" "$CHROMA_PID"; do
        if [ -n "$pid" ]; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
}
trap cleanup EXIT INT TERM

wait_for_process() {
    local pid="$1"
    local name="$2"
    for _ in {1..30}; do
        kill -0 "$pid" 2>/dev/null && return 0
        sleep 1
    done
    echo "$name failed to start"
    return 1
}

wait_for_http() {
    local url="$1"
    local name="$2"
    for _ in {1..30}; do
        if curl --fail --silent "$url" >/dev/null; then
            return 0
        fi
        sleep 1
    done
    echo "$name failed its health check: $url"
    return 1
}

wait_for_database() {
    for _ in {1..30}; do
        if python -c '
import os
import socket
from sqlalchemy.engine import make_url

url = make_url(os.environ["DATABASE_URL"])
with socket.create_connection((url.host, url.port), timeout=2):
    pass
' 2>/dev/null; then
            return 0
        fi
        sleep 1
    done
    echo "PostgreSQL is not reachable using DATABASE_URL"
    return 1
}

wait_for_process "$CHROMA_PID" "ChromaDB"
echo "ChromaDB is ready!"

# Start Backend
echo "Starting Backend..."
cd /app
wait_for_database
uvicorn backend.main:app --host 0.0.0.0 --port 8000 \
  > /app/logs/backend.log 2>&1 &
BACKEND_PID=$!
wait_for_http "http://127.0.0.1:8000/health" "Backend"

# Start Frontend
echo "Starting Frontend..."
cd /app/frontend
npm start > /app/logs/frontend.log 2>&1 &
FRONTEND_PID=$!

echo "=== Services Started ==="
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:8000"

# Exit if any service stops so Compose can restart the container.
wait -n "$CHROMA_PID" "$BACKEND_PID" "$FRONTEND_PID"
exit $?

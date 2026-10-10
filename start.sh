#!/bin/bash
set -e

echo "=== Starting Resector ==="

# Start PostgreSQL
echo "Starting PostgreSQL..."
sudo -u postgres /usr/lib/postgresql/15/bin/pg_ctl -D /app/data/postgres -l /var/log/supervisor/postgresql.log start

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until sudo -u postgres pg_isready -q; do
    echo "PostgreSQL not ready yet..."
    sleep 1
done
echo "PostgreSQL is ready!"

# Start ChromaDB
echo "Starting ChromaDB..."
chroma run --host 127.0.0.1 --port 5000 --path /app/data/chroma > /var/log/supervisor/chromadb.log 2>&1 &
CHROMA_PID=$!

# Wait for ChromaDB
echo "Waiting for ChromaDB..."
sleep 5

# Start Backend
echo "Starting Backend..."
export DATABASE_URL="postgresql://resector:resector@127.0.0.1:5432/resector"
export CHROMA_HOST="127.0.0.1"
export CHROMA_PORT="5000"
cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 > /var/log/supervisor/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for Backend
echo "Waiting for Backend..."
sleep 5

# Start Frontend
echo "Starting Frontend..."
cd /app/frontend
export NODE_ENV=production
export NEXT_PUBLIC_API_URL="http://localhost:8000"
npm start > /var/log/supervisor/frontend.log 2>&1 &
FRONTEND_PID=$!

echo "=== All services started ==="
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8000"

# Handle graceful shutdown
cleanup() {
    echo "Shutting down..."
    kill $FRONTEND_PID 2>/dev/null || true
    kill $BACKEND_PID 2>/dev/null || true
    kill $CHROMA_PID 2>/dev/null || true
    sudo -u postgres /usr/lib/postgresql/15/bin/pg_ctl -D /app/data/postgres stop 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Keep the container running and show logs
wait

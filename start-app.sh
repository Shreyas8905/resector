#!/bin/bash
set -e

echo "=== Starting Resector App ==="

# Start ChromaDB
echo "Starting ChromaDB..."
chroma run --host 127.0.0.1 --port 5000 --path /app/data/chroma &
sleep 5

# Start Backend
echo "Starting Backend..."
cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
sleep 5

# Start Frontend
echo "Starting Frontend..."
cd /app/frontend
npm start &

echo "=== Services Started ==="
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:8000"

# Keep container running
wait

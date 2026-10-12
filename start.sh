#!/bin/bash
set -Eeuo pipefail

DATA_DIR=/app/data
POSTGRES_DIR="$DATA_DIR/postgres"
LOG_DIR=/var/log/supervisor

mkdir -p "$POSTGRES_DIR" "$DATA_DIR/chroma" "$LOG_DIR"
chown -R postgres:postgres "$POSTGRES_DIR"

if [ ! -f "$POSTGRES_DIR/PG_VERSION" ]; then
    sudo -u postgres /usr/lib/postgresql/15/bin/initdb \
        -D "$POSTGRES_DIR" --auth-host=scram-sha-256
fi

sudo -u postgres /usr/lib/postgresql/15/bin/pg_ctl \
    -D "$POSTGRES_DIR" \
    -l "$LOG_DIR/postgresql.log" start

cleanup() {
    kill "$FRONTEND_PID" "$BACKEND_PID" "$CHROMA_PID" 2>/dev/null || true
    sudo -u postgres /usr/lib/postgresql/15/bin/pg_ctl \
        -D "$POSTGRES_DIR" stop -m fast 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..30}; do
    if sudo -u postgres pg_isready -q -h 127.0.0.1; then
        break
    fi
    sleep 1
done

if ! sudo -u postgres pg_isready -q -h 127.0.0.1; then
    echo "PostgreSQL failed to become ready"
    exit 1
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='resector'" |
    grep -q 1 || sudo -u postgres psql -c \
    "CREATE USER resector WITH PASSWORD 'resector';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='resector'" |
    grep -q 1 || sudo -u postgres createdb -O resector resector

chroma run --host 127.0.0.1 --port 5000 --path "$DATA_DIR/chroma" \
    > "$LOG_DIR/chromadb.log" 2>&1 &
CHROMA_PID=$!

cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 \
    > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

for _ in {1..60}; do
    if curl --fail --silent http://127.0.0.1:8000/health >/dev/null; then
        break
    fi
    sleep 1
done

if ! curl --fail --silent http://127.0.0.1:8000/health >/dev/null; then
    cat "$LOG_DIR/backend.log"
    exit 1
fi

cd /app/frontend
NODE_ENV=production npm start > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

wait -n "$CHROMA_PID" "$BACKEND_PID" "$FRONTEND_PID"

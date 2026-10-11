FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Install Node dependencies
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --production=false

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build frontend
RUN cd frontend && npm run build

# Create data directories
RUN mkdir -p /app/data/chroma /app/uploads

EXPOSE 3000 8000

# Start script
COPY start-app.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]

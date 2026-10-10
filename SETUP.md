# Setup Guide: Resector

This guide provides comprehensive instructions for deploying and running the Resector research environment.

## Prerequisites

Ensure you have the following installed on your system:
- **Docker Deployment**: Docker and Docker Compose
- **Local Development**: Python 3.10+, Node.js 18+, npm, PostgreSQL, ChromaDB

---

## Option A: Docker Deployment (Recommended)

Resector ships as a **single all-in-one container** that bundles PostgreSQL, ChromaDB, the FastAPI backend, and the Next.js frontend. One command starts everything.

### 1. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL=postgresql://resector:resector@127.0.0.1:5432/resector
CHROMA_HOST=127.0.0.1
CHROMA_PORT=5000
TAVILY_API_KEY=your_tavily_key_here
```

### 2. Launch
Run the following command from the root directory:
```bash
docker-compose up --build
```

The application will be available at:
- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:8000`

### 3. Stop
```bash
docker-compose down
```

### 4. Clean Up (Remove Data)
```bash
docker-compose down -v
```

### How It Works
- **`Dockerfile.all-in-one`**: Builds a single image containing PostgreSQL 15, ChromaDB, Python 3.11 (backend), and Node.js (frontend).
- **`supervisord.conf`**: Manages all four processes inside the container, starting them in the correct dependency order.
- **`docker-compose.yml`**: Defines a single service with volume persistence for database and ChromaDB data.

Data persists across restarts via Docker volumes (`resector_data` and `postgres_data`).

---

## Option B: Local Development (Without Docker)

Use this method if you need to debug the backend/frontend code in real-time or prefer not to use Docker.

### 1. Infrastructure Setup

#### PostgreSQL
Ensure PostgreSQL is running and a database named `resector` exists.
- **Default connection**: `postgresql://postgres:postgres@localhost:5432/resector`
- Create the database if needed: `CREATE DATABASE resector;`

#### ChromaDB
Run ChromaDB in a separate terminal:
```bash
chroma run --host localhost --port 5000 --path ./chromadb
```
*Note: The backend connects to ChromaDB on port 5000 by default.*

### 2. Backend Configuration and Execution

1. **Navigate to backend**:
   ```bash
   cd backend
   ```
2. **Environment Setup**:
   Create a `.env` file in the `backend/` folder:
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/resector
   CHROMA_HOST=localhost
   CHROMA_PORT=5000
   TAVILY_API_KEY=your_tavily_key_here
   ```
3. **Dependency Installation**:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Linux/Mac:
   source venv/bin/activate
   pip install -r requirements.txt
   ```
4. **Start Server**:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

### 3. Frontend Configuration and Execution

1. **Navigate to frontend**:
   ```bash
   cd frontend
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   The UI will be available at `http://localhost:3000`.

---

## Troubleshooting

### Database Connection Errors
If you encounter a `password authentication failed` error:
1. Verify that the `DATABASE_URL` in `backend/.env` matches your local PostgreSQL credentials.
2. Ensure the `resector` database has been created: `CREATE DATABASE resector;`

### API Key Validation
If the agent fails to respond:
1. Open the **Settings** drawer in the frontend.
2. Enter your LLM API key (Groq, OpenAI, etc.).
3. Use the **Test** button to ensure the connection is active.
4. If you see "Please configure your API key in Settings", your key is missing or empty.

### Docker Issues
- **Port conflicts**: Ensure ports 3000 and 8000 are not in use by other services.
- **View logs**: `docker-compose logs -f` to see output from all services.
- **Rebuild after code changes**: `docker-compose up --build`

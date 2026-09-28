# Setup Guide: Resector

This guide provides comprehensive instructions for deploying and running the Resector research environment.

## Prerequisites

Ensure you have the following installed on your system:
- Docker and Docker Compose
- Python 3.10+
- Node.js 18+ and npm
- A PostgreSQL instance (if running manually)

---

## Option A: Docker Deployment (Recommended)

The fastest way to launch the complete Resector ecosystem is via Docker. This method orchestrates the frontend, backend, PostgreSQL, and ChromaDB into a single network.

### 1. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/resector
CHROMA_HOST=chromadb
CHROMA_PORT=8000
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

---

## Option B: Manual Local Development

Use this method if you need to debug the backend/frontend code in real-time or prefer not to use Docker.

### 1. Infrastructure Setup

#### PostgreSQL
Ensure PostgreSQL is running and a database named `resector` exists.
- **Default connection**: `postgresql://postgres:postgres@localhost:5432/resector`

#### ChromaDB
Run ChromaDB in a separate terminal:
```bash
docker run -p 5000:8000 chromadb/chroma
```
*Note: The backend is configured to connect to port 5000 by default.*

### 2. Backend Configuration and Execution

1. **Navigate to backend**:
   ```bash
   cd backend
   ```
2. **Environment Setup**:
   Create a `.env` file in the `backend/` folder with your actual credentials:
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
   uvicorn main:app --reload --port 8000
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
3. Use the **Validate Key** button to ensure the connection is active.

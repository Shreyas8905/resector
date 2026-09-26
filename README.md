# Resector 🔬
**Your Local-First, Agentic Research Companion**

Resector is a high-performance research utility designed for academics, scientists, and independent researchers. It combines advanced AI agent loops with local data sovereignty to help you sift through literature, stress-test hypotheses, and simplify complex jargon—all while maintaining total privacy.

---

## ✨ Core Features

### 1. PDF Abstract & Methodology Sifter
Transforms dense abstracts into structured insights.
- **What it does**: Extracts Core Research Questions, Methodology/Sample Size, Key Findings, and Fatal Flaws.
- **Agent Power**: Uses real-time web search to check if findings have been superseded or if the methodology is standard in the field.

### 2. Counter-Argument & Gap Finder
A brutal peer-review simulator to stress-test your research.
- **Persona Spectrum**: Choose from 5 personas, from a **Supportive Peer** to the infamous **Brutal Reviewer #2** or **The Devil's Advocate**.
- **Agent Power**: Actively searches the web for competing theories and counter-arguments to expose logical gaps in your hypothesis.

### 3. Jargon-to-Plain-English Research Log
Translates "Academic-speak" into intuitive understanding.
- **What it does**: Breaks down complex terminology into plain English and provides a vivid real-world analogy.
- **Agent Power**: Searches for the best analogies used in science communication to make the concept stick.

### 4. Research Archive & Semantic Search
Your research history is not just a list—it's a vector space.
- **Local Vector DB**: Every result is embedded into ChromaDB.
- **Semantic Retrieval**: Search your history using natural language (e.g., "that paper about transformer attention") to find relevant past insights.

---

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, `react-markdown`.
- **Backend**: FastAPI (Python), LangChain, LangGraph.
- **Agent Engine**: ReAct agent loop with **Tavily Search API** for real-time web access.
- **Database**: 
  - **PostgreSQL**: Relational history and session logs.
  - **ChromaDB**: Local vector storage for semantic search.

---

## 🚀 Getting Started

### Option A: Docker (The Easy Way)
```bash
docker-compose up --build
```
*This spins up PostgreSQL, ChromaDB, the FastAPI backend, and the Next.js frontend automatically.*

### Option B: Local Development (The Manual Way)

#### 1. Infrastructure Setup
You must have **PostgreSQL** and **ChromaDB** running locally.

**Spin up ChromaDB**:
```bash
# If using Docker for just the DB
docker run -p 5000:8000 chromadb/chroma
```

#### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🔑 Configuration

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/resector_db
CHROMA_HOST=localhost
CHROMA_PORT=5000
TAVILY_API_KEY=your_tavily_key_here
```

*Note: You can also set and validate your LLM and Tavily keys directly in the app's **Settings** drawer.*

---

## 🛡 Privacy & Integrity
Resector is built with a **Local-First** philosophy. Your research logs, API keys, and vector embeddings never leave your machine (unless sent to the LLM provider of your choice).

# Resector Frontend

Next.js 15+ / React 19 frontend for the Resector academic research workspace.

## Getting Started

### Development
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Production Build
```bash
npm run build
npm start
```

### Environment Variables

Create a `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Architecture

The frontend is a single-page workspace with a sidebar tool switcher:

- **Paper Chat** — Immersive PDF-grounded conversation with RAG agent
- **Citation Graph** — Interactive 50-paper network with D3 physics and Louvain clustering
- **Sift Research** — Methodology extraction from abstracts
- **Stress Test** — Adversarial hypothesis critique with persona spectrum
- **Simplify Text** — Jargon-to-plain-English translation
- **Research Archive** — Semantic search across past research outputs

### Key Components

| Component | Purpose |
|---|---|
| `SettingsDrawer` | API key management for LLM providers, Tavily, Semantic Scholar |
| `PaperGraphView` | ForceGraph2D canvas with D3 physics, community clusters, GEXF export |
| `ThemeToggle` | Dark/light mode with SSR-safe mounting |

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19, Tailwind CSS 4, Lucide icons
- **Visualization**: react-force-graph-2d
- **Markdown**: react-markdown + remark-gfm

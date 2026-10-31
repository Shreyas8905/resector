<div align="center">
  <img src="frontend/public/logos/logo-dark.png" alt="ReSector" width="220" />

  <h1 style="border-bottom: none;">ReSector</h1>

  <p><strong>Read less. Understand more. Trust every claim.</strong><br/>
  An AI research workstation that lives on your computer and shows its sources.</p>

  <p>
    <a href="https://github.com/Shreyas8905/resector/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Shreyas8905/resector?label=latest%20version&color=2563eb" /></a>
    <a href="https://github.com/Shreyas8905/resector/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/Shreyas8905/resector/total?color=16a34a" /></a>
    <a href="https://github.com/Shreyas8905/resector/releases/latest"><img alt="Windows" src="https://img.shields.io/badge/Windows-installer-0078d4" /></a>
    <img alt="Local first" src="https://img.shields.io/badge/your%20papers-stay%20on%20your%20computer-7c3aed" />
  </p>

  <p>
    <a href="https://github.com/Shreyas8905/resector/releases/latest"><strong>Download the latest version</strong></a> ·
    <a href="./SETUP.md">Setup guide</a> ·
    <a href="./TECHNICAL_DOCUMENTATION.md">Technical documentation</a> ·
    <a href="https://github.com/Shreyas8905/resector/releases">All releases and changelogs</a>
  </p>
</div>

---

## The problem

A literature review is mostly *remembering and connecting*: which paper said what, on which page, and how it fits with the other forty. Reading is slow, notes scatter across tools, and general-purpose chatbots will happily invent a citation.

## What ReSector does about it

You drop in your PDFs. ReSector lets you read them, question them, and arrange them on a visual canvas, while the AI shows exactly which passage every claim comes from. Click a citation and the PDF opens at that spot, highlighted. If the AI cannot find support in your papers, it says so instead of guessing.

Your papers, notes and index stay on your computer. Only the snippets needed for a question go to the AI service you choose.

---

## Features

### Research Dashboards: a canvas for one research question
Put papers, quotes, figures, your own ideas and notes on an infinite board and draw the relationships between them.

| | |
| :-- | :-- |
| **Read and capture** | Open any PDF beside the canvas. Highlight a quote or drag a box around a figure and it becomes a card that remembers its paper and page. |
| **Ask with receipts** | Ask across every paper, a few you pick, or only the passages you saved. Answers carry numbered citations that jump to the source. Pin good answers onto the canvas. |
| **Summarize and compare** | One-click summaries, and a comparison table (method, data, results, limitations...) filled in across many papers, each cell cited. |
| **Find the connections** | An assistant proposes where papers support, contradict, extend or share methods with each other, with a quote from **both** sides. Nothing is added until you accept it. A matrix view shows every pair at a glance. |
| **Check your own claims** | Write what you believe your research shows. ReSector tells you which claims your papers back, which they contradict, and what to search for next. |
| **Stay in control of cost** | A running token meter and a pre-run estimate for bigger actions, so there are no surprise bills. |
| **Think in peace** | Comments, undo/redo, find-on-canvas, Markdown export, and one-click hiding of panels and toolbars when you need the whole canvas. |

### Paper Chat
Talk to your PDFs. An agent searches your library (and, optionally, the live web) and answers with inline references. It can read charts and figures too, and show the relevant figure next to the answer.

### Research tools
- **Methodology Sifter**: pulls out research questions, sample sizes, setups and weaknesses.
- **Adversarial Critique**: stress-test an idea against five reviewers, from friendly peer to hostile Reviewer 2.
- **Jargon Simplifier**: layered explanations and analogies for unfamiliar terms.
- **Citation graph**: map how papers cite each other and see the research clusters.
- **Research Archive**: a searchable history of everything you have run.

---

## Why researchers use it

- **Faster first pass.** Triage a pile of papers in an afternoon instead of a week.
- **Defensible answers.** Every claim is traceable to a page, so you can verify before you cite.
- **Spot gaps early.** See where your argument is thin or contradicted before a reviewer does.
- **Works in any field.** It reads PDFs, not code or datasets. Humanities, medicine, social science and engineering all work.
- **Private by design.** No account, no upload of your library to a ReSector server.
- **Your choice of AI.** Use Groq or Google Gemini (free tiers available), OpenAI or Anthropic Claude. Switch any time.

---

## Get started in five minutes

1. **Download** the installer from the **[latest release](https://github.com/Shreyas8905/resector/releases/latest)** and run it. ReSector updates itself from then on.
2. **Get a free API key** (Groq or Google Gemini take about a minute). Step-by-step instructions are in the [setup guide](./SETUP.md#2-get-your-api-keys).
3. **Open ReSector > Settings**, paste the key, and press *Save and start*.
4. **Create a dashboard** and drop in a few PDFs.

Prefer to run it from source or in Docker? See the [setup guide](./SETUP.md).

> The version badge at the top and the release page always show the newest version. Release notes for each version are on the [Releases](https://github.com/Shreyas8905/resector/releases) page.

---

## For developers

How it is built (architecture diagram, data model, grounding, token budgeting, desktop shell and updater) is in **[TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md)**. Build and release instructions are in [SETUP.md](./SETUP.md#6-building-and-releasing-the-desktop-app).

Embedding model credit: sentence-transformers/all-MiniLM-L6-v2.

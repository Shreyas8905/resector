"""Markdown export of a dashboard (pure function, tested without a database)."""
from __future__ import annotations


def _q(text: str) -> str:
    return "\n".join("> " + ln for ln in (text or "").splitlines() or [""])


def build_markdown(d: dict) -> str:
    nodes = {n["id"]: n for n in d.get("nodes", [])}
    docs = {x["id"]: x for x in d.get("documents", [])}
    excerpts = {x["id"]: x for x in d.get("excerpts", [])}
    comments = d.get("comments", [])

    def title(n: dict) -> str:
        data, t = n.get("data", {}), n.get("type")
        if t == "paper":
            return (docs.get(data.get("document_id"), {}).get("filename") or data.get("filename") or "Paper")
        if t == "excerpt":
            ex = excerpts.get(data.get("excerpt_id"), {})
            return f"Excerpt p.{ex.get('page', '?')}"
        if t == "claim":
            return "Claim: " + (data.get("text") or "")[:60]
        if t == "frame":
            return data.get("title") or "Group"
        return data.get("title") or (data.get("text") or "Note")[:60]

    out = [f"# {d.get('title', 'Dashboard')}"]
    if d.get("project"):
        out.append(f"*Project: {d['project']}*")

    claims = [n for n in nodes.values() if n["type"] == "claim"]
    if claims:
        out += ["", "## My research"]
        for c in claims:
            data = c.get("data", {})
            status = f" _({data['status']})_" if data.get("status") else ""
            out.append(f"- {data.get('text', '').strip()}{status}")

    papers = [n for n in nodes.values() if n["type"] == "paper"]
    if papers:
        out += ["", "## Papers"]
        for p in papers:
            did = p.get("data", {}).get("document_id")
            out += ["", f"### {title(p)}"]
            if p.get("data", {}).get("note"):
                out.append(p["data"]["note"].strip())
            for e in [e for e in excerpts.values() if e["document_id"] == did]:
                out += ["", _q(e.get("quote") or "(area selection)"), f"— p.{e['page']}"]

    notes = [n for n in nodes.values() if n["type"] == "note"]
    if notes:
        out += ["", "## Notes"]
        for n in notes:
            data = n.get("data", {})
            out += ["", f"**{data.get('title') or 'Note'}**", (data.get("text") or "").strip()]

    edges = d.get("edges", [])
    if edges:
        out += ["", "## Links"]
        for e in edges:
            a, b = nodes.get(e["source"]), nodes.get(e["target"])
            if not a or not b:
                continue
            data = e.get("data", {})
            label = f" ({data['label']})" if data.get("label") else ""
            out.append(f"- {title(a)} —{data.get('kind', 'related')}→ {title(b)}{label}")

    open_c = [c for c in comments if not c.get("resolved")]
    if open_c:
        out += ["", "## Open comments"]
        for c in open_c:
            n = nodes.get(c.get("node_id"))
            where = f" on {title(n)}" if n else ""
            out.append(f"- **{c['author']}**{where}: {c['text']}")
    return "\n".join(out).rstrip() + "\n"

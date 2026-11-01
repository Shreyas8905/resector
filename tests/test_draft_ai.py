import asyncio, dataclasses, importlib.util, json, sys, types, enum
root = "/home/claude/proj/Resector - Copy/backend/"
def pkg(n, path=None):
    m = types.ModuleType(n); m.__path__ = [path] if path else []; sys.modules[n] = m; return m
pkg("bk", root); pkg("bk.services", root + "services")
lcm = types.ModuleType("langchain_core.messages")
@dataclasses.dataclass
class _M:
    content: str
    tool_calls: list = dataclasses.field(default_factory=list)
    def model_copy(self, update): return dataclasses.replace(self, **update)
for n, t in (("HumanMessage", "human"), ("AIMessage", "ai"), ("SystemMessage", "system")):
    setattr(lcm, n, type(n, (_M,), {"type": t}))
sys.modules["langchain_core"] = types.ModuleType("langchain_core"); sys.modules["langchain_core.messages"] = lcm

class Row:
    def __init__(self, **kw): self.__dict__.update(kw)
DB = {"AgentRun": [], "Excerpt": [], "CanvasNode": [], "CanvasEdge": [], "Draft": [], "AiUsage": []}
class Q:
    def __init__(self, rows): self.rows = rows
    def filter(self, *a): return self
    def first(self): return self.rows[-1] if self.rows else None
    def all(self): return list(self.rows)
class Sess:
    def query(self, model): return Q(DB[model.__name__])
    def add(self, o): DB.setdefault(type(o).__name__, []).append(o)
    def commit(self): pass
    def rollback(self): pass
    def close(self): pass
db_ = types.ModuleType("bk.database")
def mk(name):
    def init(self, **kw): self.__dict__.update(kw)
    class Meta(type):
        def __getattr__(cls, a):
            if a.startswith("__"): raise AttributeError(a)
            return types.SimpleNamespace(__eq__=lambda *x: True, in_=lambda *x: True)
    return Meta(name, (), {"__init__": init})
for n in ("AgentRun", "AiUsage", "CanvasNode", "CanvasEdge", "Dashboard", "WireSuggestion", "ChatMessage", "Document", "Excerpt", "Draft"): setattr(db_, n, mk(n))
class DocStatus(enum.Enum): COMPLETED = "completed"
class MessageRole(enum.Enum): USER = "user"; ASSISTANT = "assistant"
db_.DocStatus, db_.MessageRole = DocStatus, MessageRole
db_.SessionLocal = lambda: Sess()
class Coll:
    def get(self, where, limit): return {"documents": ["opening"]}
    def query(self, query_texts, n_results, where):
        did = where["$and"][1]["document_id"]
        return {"documents": [[f"passage {i} of doc {did} says sleep improves memory consolidation" for i in range(n_results)]], "distances": [[0.1] * n_results]}
db_.get_vector_collection = lambda: Coll()
sys.modules["bk.database"] = db_
cfg = types.ModuleType("bk.config"); cfg.RateLimitError = type("RateLimitError", (Exception,), {}); cfg.settings = types.SimpleNamespace(TOOL_MAX_PARTS=3)
sys.modules["bk.config"] = cfg
pf = types.ModuleType("bk.provider_factory")
class PC:
    def __init__(self, provider, api_key="k", model_name=None): self.provider, self.api_key, self.model_name = provider, api_key, model_name
CALLS = []
class LLM:
    fn = None
    async def ainvoke(self, msgs):
        CALLS.append(msgs)
        return types.SimpleNamespace(content=LLM.fn(msgs), usage_metadata={"input_tokens": 50, "output_tokens": 10})
pf.ProviderConfig = PC; pf.ProviderFactory = types.SimpleNamespace(get_llm=lambda c: LLM())
sys.modules["bk.provider_factory"] = pf

def load(n):
    s = importlib.util.spec_from_file_location(f"bk.services.{n}", root + f"services/{n}.py"); m = importlib.util.module_from_spec(s); sys.modules[f"bk.services.{n}"] = m; s.loader.exec_module(m); return m
for n in ("token_budget", "grounding", "wiring", "drafts"): load(n)
ai = load("dashboard_ai")
docs = {i: types.SimpleNamespace(id=i, filename=f"p{i}.pdf", file_path="/nonexistent.pdf") for i in (1, 2)}
ai.completed_docs = lambda db, sid, only=None: {k: v for k, v in docs.items() if not only or k in only}
ai.attach_pages = lambda d, ps: [p.__setitem__("page", 4) for p in ps]
ai.get_pages = lambda path: ["page one text " * 5, "page two text about sleep and memory " * 5]
wa = load("wire_ai")
da = load("draft_ai")
da.get_pages = ai.get_pages
da.attach_pages = ai.attach_pages
da.os.path.exists = lambda p: True      # pretend the PDFs exist

runner = lambda: ai.LLMRunner(PC("groq"))

async def main():
    # ---- describe_links
    nodes = [{"node_id": "a", "type": "paper", "data": {"document_id": 1}}, {"node_id": "b", "type": "claim", "data": {"text": "Sleep helps memory a lot in older adults"}},
             {"node_id": "c", "type": "note", "data": {"title": "Todo"}}]
    edges = [{"source": "a", "target": "b", "kind": "supports", "label": "same effect"}, {"source": "a", "target": "zzz", "kind": "x", "label": ""}, {"source": "c", "target": "a", "kind": None, "label": ""}]
    ln = da.describe_links(nodes, edges, {1: "p1.pdf"})
    assert ln == ['"p1.pdf" supports "my claim: Sleep helps memory a lot in older adults" (same effect)', '"Todo" related "p1.pdf"'], ln

    # ---- suggest_sources: excerpts that overlap come first, retrieval fills the rest, no model call
    DB["Excerpt"][:] = [Row(id=7, document_id=1, page=2, quote="Sleep improves memory consolidation in adults", rects="[]"),
                        Row(id=8, document_id=2, page=1, quote="Unrelated chemistry of zeolites", rects="[]"),
                        Row(id=9, document_id=1, page=1, quote="", rects="[]")]
    out = da.suggest_sources(Sess(), "s", 1, "Does sleep improve memory consolidation?", None, 5)
    assert out[0]["marker"] == "[@e7]" and out[0]["kind"] == "excerpt", out
    assert all(o["marker"] != "[@e8]" for o in out) and len(out) <= 5 and any(o["kind"] == "passage" and o["marker"] == "[@d1:p4]" for o in out), out
    assert da.suggest_sources(Sess(), "s", 1, "   ", None) == [] and not CALLS

    # ---- outline
    LLM.fn = lambda m: '{"sections":[{"heading":"Background","goal":"Set scene"},{"heading":"Evidence","goal":"What papers show"}]}'
    DB["CanvasNode"][:] = [Row(node_id="b", type="claim", data=json.dumps({"text": "Sleep helps memory a lot in older adults"})), Row(node_id="a", type="paper", data=json.dumps({"document_id": 1}))]
    DB["CanvasEdge"][:] = [Row(source="a", target="b", kind="supports", label="")]
    r = runner()
    secs = await da.make_outline(Sess(), r, "s", 1, "A short review", None)
    assert [s["heading"] for s in secs] == ["Background", "Evidence"]
    sent = CALLS[-1][-1].content
    assert "AUTHOR'S CLAIMS" in sent and "LINKS THE AUTHOR DREW" in sent and "p1.pdf" in sent and "A short review" in sent
    LLM.fn = lambda m: "not json"
    try: await da.make_outline(Sess(), runner(), "s", 1, "", None); assert False
    except ValueError as e: assert "outline" in str(e)

    # ---- write_section: citations become markers; excerpts keep their exact marker; invalid numbers dropped
    def sect(msgs):
        body = msgs[-1].content
        assert "PASSAGES" in body and "AUTHOR'S POSITION" in body and "SECTION: Evidence" in body and "GOAL: What papers show" in body
        assert "DRAFT SO FAR" in body and "[@" not in body            # earlier markers are stripped from the prompt
        return "Sleep improves consolidation [1]. Another point [2][9]. Third [1]."
    LLM.fn = sect
    res = await da.write_section(Sess(), runner(), "s", 1, "Evidence", "What papers show", "sleep memory consolidation adults", None, "Earlier text [@e7] here.", 200)
    assert res["text"].count("[@e7]") == 2 and "[9]" not in res["text"] and "[@d" in res["text"], res["text"]
    assert [c["marker"] for c in res["cites"]][0] == "[@e7]" and res["uncited"] is False and res["usage"]["calls"] == 1
    LLM.fn = lambda m: "Plain text without any citation."
    res = await da.write_section(Sess(), runner(), "s", 1, "Evidence", "", "", None, "", 200)
    assert res["uncited"] is True and res["cites"] == []
    docs_backup = dict(docs); docs.clear()
    try: await da.write_section(Sess(), runner(), "s", 1, "X", "", "", None, "", 200); assert False
    except ValueError: pass
    docs.update(docs_backup)

    # ---- estimates
    e = da.estimate_check("A cited claim of 30% growth was seen [@e7]. Second cited one with 5% here [@d1:p2]. Uncited: studies show a 40% rise in all cases.")
    assert e["items"] == 3 and e["calls"] == 1 and e["tokens_in"] > 0
    assert da.estimate_check("") == {"items": 0, "skipped": 0, "calls": 0, "tokens_in": 0, "tokens_out": 0}
    a = da.estimate_autopilot(5, 4000)
    assert a["tokens_in"] > 4 * 3000 and a["tokens_out"] > 5 * 300

    # ---- run_check
    content = ("# Results\n\nSleep improves memory consolidation in adults [@e7]. The effect is 90% larger in children [@d2:p2]. "
               "Studies show a 40% rise in recall across all ages. We propose a new idea for later. Gone source here is cited [@e99].")
    DB["Draft"][:] = [Row(id=3, dashboard_id=1, content=content)]
    DB["AgentRun"][:] = [Row(id=50, dashboard_id=1, kind="check", status="running", total=0, done=0, found=0, result=None, message="", tokens_in=0, tokens_out=0)]
    wa.RUNS[50] = {"cancel": False}
    def checker(msgs):
        body = msgs[-1].content
        items = []
        import re
        for m in re.finditer(r"ITEM (\d+)\nSentence: (.*)", body):
            i, sent = int(m.group(1)), m.group(2)
            if "Sleep improves" in sent: items.append({"id": i, "verdict": "supported", "source": 1, "reason": "Stated directly."})
            elif "90% larger" in sent: items.append({"id": i, "verdict": "contradicted", "reason": "Passage says smaller."})
            elif "Studies show" in sent: items.append({"id": i, "verdict": "supported", "source": 2, "reason": "Second passage says it."})
        return json.dumps({"items": items})
    LLM.fn = checker
    CALLS.clear()
    r = runner()
    await da.run_check(50, 1, "s", 3, r)
    run = DB["AgentRun"][0]
    res = json.loads(run.result)
    assert run.status == "done", (run.status, run.message)
    f = {x["idx"]: x for x in res["findings"]}
    byv = {x["sentence"][:13]: x for x in res["findings"]}
    assert len(res["findings"]) == 4, [x["sentence"] for x in res["findings"]]
    assert byv["Sleep improve"]["verdict"] == "supported" and byv["Sleep improve"]["cited"] and byv["Sleep improve"]["suggest"] is None
    assert byv["The effect is"]["verdict"] == "contradicted" and byv["The effect is"]["sources"][0]["page"] == 2
    st = byv["Studies show "]
    assert st["verdict"] == "supported" and not st["cited"] and st["suggest"] == st["sources"][1]["marker"], st
    gone = byv["Gone source h"]
    assert gone["verdict"] == "unchecked" and "deleted" in gone["reason"]
    assert "We propose" not in json.dumps(res["findings"]) and res["counts"]["supported"] == 2 and res["hash"]
    assert run.found == 1 and run.total == 4 and run.done == 4
    print(len(CALLS), len(DB["AiUsage"]), wa.RUNS.get(50)); assert wa.RUNS.get(50) is None and len(CALLS) == 1 and len(DB["AiUsage"]) == 1
    # raw slices let the UI insert a citation at the right place
    assert all(x["raw"] in content for x in res["findings"])

    # ---- cancel keeps what was found so far
    DB["AgentRun"][:] = [Row(id=51, dashboard_id=1, kind="check", status="running", total=0, done=0, found=0, result=None, message="", tokens_in=0, tokens_out=0)]
    wa.RUNS[51] = {"cancel": True}
    await da.run_check(51, 1, "s", 3, runner())
    assert DB["AgentRun"][0].status == "cancelled"

    # ---- missing draft / empty draft
    DB["Draft"][:] = []
    DB["AgentRun"][:] = [Row(id=52, dashboard_id=1, kind="check", status="running", total=0, done=0, found=0, result=None, message="", tokens_in=0, tokens_out=0)]
    wa.RUNS[52] = {"cancel": False}
    await da.run_check(52, 1, "s", 3, runner())
    assert DB["AgentRun"][0].status == "failed"
    DB["Draft"][:] = [Row(id=3, dashboard_id=1, content="# Just a heading\n\nWe propose things.")]
    DB["AgentRun"][:] = [Row(id=53, dashboard_id=1, kind="check", status="running", total=0, done=0, found=0, result=None, message="", tokens_in=0, tokens_out=0)]
    wa.RUNS[53] = {"cancel": False}
    await da.run_check(53, 1, "s", 3, runner())
    assert DB["AgentRun"][0].status == "done" and json.loads(DB["AgentRun"][0].result)["findings"] == []
    print("draft_ai OK")
asyncio.run(main())

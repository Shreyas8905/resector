import importlib.util, sys, types, json
root = "/home/claude/proj/Resector - Copy/backend/"
def pkg(n, path):
    m = types.ModuleType(n); m.__path__ = [path]; sys.modules[n] = m
pkg("bk", root); pkg("bk.services", root + "services")
def load(n):
    s = importlib.util.spec_from_file_location(f"bk.services.{n}", root + f"services/{n}.py"); m = importlib.util.module_from_spec(s); sys.modules[f"bk.services.{n}"] = m; s.loader.exec_module(m); return m
load("token_budget"); load("grounding"); d = load("drafts")

# ---- markers
assert d.excerpt_marker(12) == "[@e12]" and d.doc_marker(5, 3) == "[@d5:p3]" and d.doc_marker(5) == "[@d5]"
assert d.parse_key("e12") == {"kind": "excerpt", "id": 12, "page": None}
assert d.parse_key("d5:p3") == {"kind": "doc", "id": 5, "page": 3}
assert d.parse_key("d5")["page"] is None and d.parse_key("x9") is None and d.parse_key("d5:p") is None
assert [m["key"] for m in d.find_markers("a [@e1] b [@d2:p3][@d2]")] == ["e1", "d2:p3", "d2"]
assert d.strip_markers("Rates rose [@e1].") == "Rates rose ."
assert d.word_count("Hello [@e1] world, it's fine") == 4

# ---- numbering
src = {"e1": {"filename": "a.pdf", "page": 2, "quote": "quoted text"}, "d2:p3": {"filename": "b.pdf", "page": 3, "quote": ""}}
text, sources, missing = d.number_citations("One [@e1][@d2:p3]. Two [@d2:p3] and [@e1] and [@e99] gone.", src.get)
assert text == "One [1][2]. Two [2] and [1] and  gone.", text
assert [s["n"] for s in sources] == [1, 2] and missing == ["e99"]
md, miss = d.build_markdown("My Draft", "Intro [@e1].", src.get)
assert md.startswith("# My Draft") and "## References" in md and '1. a.pdf, p.2 — "quoted text"' in md and miss == []
md2, _ = d.build_markdown("T", "# Own title\n\ntext [@e1]", src.get)
assert md2.count("# ") >= 1 and not md2.startswith("# T")
md3, _ = d.build_markdown("T", "x [@e1]", src.get, include_quotes=False)
assert "quoted" not in md3
h, _ = d.build_html("A <b>", "## Head\n\nText with **bold** and [@e1] <script>.\n\n- item\n- two\n\n> quote", src.get)
assert "<h2>Head</h2>" in h and "<strong>bold</strong>" in h and "&lt;script&gt;" in h and "<script>" not in h
assert 'href="#ref-1"' in h and "<li>item</li>" in h and "<blockquote>quote</blockquote>" in h and "A &lt;b&gt;" in h and 'id="ref-1"' in h

# ---- sentences
c = """# Intro

Sleep matters for memory [@e1]. Studies by Smith et al. show a 20% gain.[@d2:p3] See Fig. 2 for details.

- A bullet point with a claim of 30% growth [@e4].
```
code. not prose.
```
| a | b |
> quoted line.
We propose a new method here.
"""
ss = d.split_sentences(c)
texts = [s["text"] for s in ss]
assert texts[0] == "Sleep matters for memory ." or texts[0].startswith("Sleep matters for memory"), texts
assert any(t.startswith("Studies by Smith et al. show") for t in texts), texts          # "et al." is not a boundary
assert any(t.startswith("See Fig. 2 for details") for t in texts), texts
assert not any("code" in t for t in texts) and not any(t.startswith("a |") for t in texts) and not any("quoted line" in t for t in texts)
for s in ss:
    assert c[s["start"]:s["end"]] == s["raw"], (s, c[s["start"]:s["end"]])
smith = next(s for s in ss if s["text"].startswith("Studies"))
assert smith["keys"] == ["d2:p3"] and smith["section"] == "Intro"
bullet = next(s for s in ss if "bullet" in s["text"])
assert bullet["keys"] == ["e4"] and not bullet["raw"].startswith("-")
assert d.split_sentences("") == [] and d.split_sentences("# Only heading") == []
# cite after period vs before period both attach to their sentence
two = d.split_sentences("First claim here is long enough [@e1]. Second one follows right after.[@e2] Third without.")
assert [s["keys"] for s in two] == [["e1"], ["e2"], []], two

# ---- check planning
assert d.is_claim_like("Participants who slept more showed a 15% improvement in recall.")
assert not d.is_claim_like("We propose a new method for measuring memory in sleeping adults.")
assert not d.is_claim_like("Short claim 5%.") and not d.is_claim_like("Does sleep improve memory in older adults overall?")
assert not d.is_claim_like("The sky above the quiet harbour looked rather calm today.")
sents = [{"idx": i, "keys": ["e1"] if i % 3 == 0 else [], "text": f"Participants showed a 15 percent improvement in recall number {i}."} for i in range(40)]
items, skipped = d.plan_check(sents, max_items=10)
assert len(items) == 10 and skipped == 40 - 10 and all(i["keys"] for i in items[:10])   # cited first (14 cited, cap 10)
assert [i["idx"] for i in items] == sorted(i["idx"] for i in items)

# ---- parse_check
raw = 'Sure:\n```json\n{"items":[{"id":1,"verdict":"Supported","source":2,"reason":"States it."},{"id":2,"verdict":"partially","reason":"x"},{"id":3,"verdict":"nonsense"},{"id":9,"verdict":"supported"},{"id":1,"verdict":"unsupported"},{"id":4,"verdict":"contradicts","source":7}]}\n```'
p = d.parse_check(raw, [1, 2, 3, 4], {1: 2, 2: 1, 3: 1, 4: 2})
assert p[1] == {"verdict": "supported", "reason": "States it.", "source": 2}
assert p[2]["verdict"] == "partial" and p[2]["source"] is None
assert 3 not in p and 9 not in p and p[4]["verdict"] == "contradicted" and p[4]["source"] is None
assert d.parse_check("garbage", [1], {1: 1}) == {} and d.parse_check('{"items":"x"}', [1], {1: 1}) == {}

# ---- windows / overlap
page = ("filler " * 300) + "the intervention reduced anxiety scores by twelve percent in adults " + ("more filler " * 300)
w = d.best_window(page, "intervention reduced anxiety scores in adults", 400)
assert "intervention reduced anxiety" in w and len(w) <= 400
assert d.best_window("short", "x", 900) == "short"
assert d.overlap_score("sleep improves memory consolidation", "memory consolidation during sleep improves") > 0.5
assert d.overlap_score("alpha beta", "") == 0

# ---- outline
o = d.parse_outline('{"sections":[{"heading":"## Background","goal":"Set the scene"},"Methods",{"title":"Results"},{"goal":"no heading"},5]}')
assert [s["heading"] for s in o] == ["Background", "Methods", "Results"] and o[0]["goal"] == "Set the scene"
assert d.parse_outline("nope") == [] and len(d.parse_outline(json.dumps({"sections": [{"heading": f"S{i}"} for i in range(30)]}))) == d.MAX_SECTIONS

# ---- to_markers
inc = [{"n": 1, "document_id": 5, "page": 3, "text": "a"}, {"n": 2, "document_id": 6, "page": None, "text": "b"},
       {"n": 3, "document_id": 5, "page": 3, "text": "c", "excerpt_id": 11}]
t, used = d.to_markers("Claim A [1][3]. Claim B [2, 3] and bogus [9] and [p.4].", inc)
assert t == "Claim A [@d5:p3][@e11]. Claim B [@d6][@e11] and bogus  and .", t
assert used == ["@d5:p3".join(["[", "]"]), "[@e11]", "[@d6]"], used

# ---- versions
assert d.change_size("hello world", "hello world") == 0 and d.change_size("abc", "abXc") == 1 and d.change_size("", "abc") == 3
assert d.should_auto_snapshot("x" * 100, "x" * 100 + "y" * 50, 700) is True
assert d.should_auto_snapshot("x" * 100, "x" * 100 + "y" * 50, 100) is False          # too soon
assert d.should_auto_snapshot("x" * 100, "x" * 110, 700) is False                     # tiny edit
assert d.should_auto_snapshot("", "x" * 500, 9999) is False                           # nothing to keep
vs = [{"id": i, "kind": "auto" if i % 2 else "manual"} for i in range(1, 11)]
assert d.versions_to_prune(vs, keep=20) == []
pr = d.versions_to_prune(vs, keep=7)
assert pr == [1, 3, 5] and all(vs[i - 1]["kind"] == "auto" for i in pr)
assert d.versions_to_prune([{"id": i, "kind": "manual"} for i in range(1, 6)], keep=3) == [1, 2]
assert d.content_hash("a") == d.content_hash("a") != d.content_hash("b")
print("drafts OK")

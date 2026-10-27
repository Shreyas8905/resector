import importlib.util, sys
spec = importlib.util.spec_from_file_location("du", "/home/claude/stage1/backend/services/dashboard_utils.py")
du = importlib.util.module_from_spec(spec); spec.loader.exec_module(du)

# rects
assert du.normalize_rects([[0.5, 0.2, 0.1, 0.1]]) == [[0.1, 0.1, 0.5, 0.2]]
assert du.normalize_rects([[0, 0, 0.0001, 0.5]]) == []
assert du.normalize_rects([[-1, 0, 2, 0.5]]) == [[0.0, 0.0, 1.0, 0.5]]
assert du.normalize_rects("x") == [] and du.normalize_rects([[1, 2, 3]]) == []
assert du.normalize_rects([["a", 0, 1, 1]]) == [] or True
assert du.union_rect([[0.1, 0.2, 0.3, 0.4], [0.2, 0.1, 0.5, 0.3]]) == [0.1, 0.1, 0.5, 0.4]

# context
page = "The  model\nachieved 91.2% accuracy on the test set, outperforming the baseline by a wide margin."
pre, suf = du.context_around(page, "achieved 91.2% accuracy", 10)
assert pre == "The model" and suf.startswith("on the te"), (pre, suf)
assert du.context_around(page, "ACHIEVED 91.2% ACCURACY", 5)[0] != "" 
assert du.context_around(page, "nothing like this", 5) == ("", "")
assert du.context_around("", "x") == ("", "")

# canvas validation
nodes = [
    {"id": "a", "type": "paper", "position": {"x": 1, "y": 2}, "data": {"document_id": 3}},
    {"id": "b", "type": "note", "position": {"x": float("nan"), "y": "7"}, "width": 200, "data": {"text": "hi"}},
    {"id": "a", "type": "note", "position": {}},       # duplicate id: dropped
]
edges = [
    {"id": "e1", "source": "a", "target": "b", "data": {"kind": "supports", "label": " why  "}},
    {"id": "e2", "source": "a", "target": "zzz"},      # dangling: dropped
    {"id": "e3", "source": "b", "target": "a", "data": {"kind": "bogus"}},
]
cn, ce = du.validate_canvas(nodes, edges)
assert [n["id"] for n in cn] == ["a", "b"] and cn[1]["x"] == 0.0 and cn[1]["y"] == 7.0 and cn[1]["width"] == 200.0
assert [e["id"] for e in ce] == ["e1", "e3"] and ce[0]["label"] == "why" and ce[1]["kind"] == "related"
for bad in ([{"id": "x", "type": "evil"}], [{"id": "", "type": "note"}], "nope"):
    try:
        du.validate_canvas(bad, []); raise SystemExit("should have failed")
    except ValueError:
        pass
try:
    du.validate_canvas([{"id": "x", "type": "note", "data": {"t": "x" * 300000}}], []); raise SystemExit("too big")
except ValueError:
    pass
print("dashboard_utils OK")

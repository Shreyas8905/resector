import importlib.util, sys
spec = importlib.util.spec_from_file_location("ex", "/home/claude/proj/Resector - Copy/backend/services/dashboard_export.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
d = {"title":"T","project":"P",
 "nodes":[{"id":"a","type":"paper","data":{"document_id":1}},{"id":"b","type":"claim","data":{"text":"X holds","status":"draft"}},
          {"id":"c","type":"note","data":{"title":"N","text":"body"}},{"id":"e1","type":"excerpt","data":{"excerpt_id":9}}],
 "edges":[{"id":"1","source":"b","target":"a","data":{"kind":"supports","label":"table 2"}},{"id":"2","source":"b","target":"gone","data":{}}],
 "documents":[{"id":1,"filename":"smith.pdf"}],
 "excerpts":[{"id":9,"document_id":1,"page":4,"quote":"line1\nline2"}],
 "comments":[{"node_id":"a","author":"You","text":"check","resolved":False},{"node_id":None,"author":"You","text":"done","resolved":True}]}
md = m.build_markdown(d)
for s in ["# T","## My research","X holds _(draft)_","### smith.pdf","> line1\n> line2","— p.4","Claim: X holds —supports→ smith.pdf (table 2)","on smith.pdf: check"]:
    assert s in md, s
assert "done" not in md and "gone" not in md
print(md); print("export OK")

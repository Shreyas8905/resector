import importlib.util, dataclasses
spec = importlib.util.spec_from_file_location("tb", "/home/claude/proj/Resector - Copy/backend/services/token_budget.py")
tb = importlib.util.module_from_spec(spec); spec.loader.exec_module(tb)

@dataclasses.dataclass
class M:
    type: str
    content: str
    tool_calls: list = dataclasses.field(default_factory=list)
    def model_copy(self, update): return dataclasses.replace(self, **update)

big = "word " * 6000                       # ~30k chars ~ 9.4k tokens
msgs = [M("system", "You are helpful. " * 40)]
for i in range(6):
    msgs += [M("human", f"question {i} " + big[:3000]), M("ai", f"answer {i} " + big[:3000])]
msgs += [M("human", "What is the main result?"), M("ai", "", [{"name": "paper_retrieval", "args": {"query": "result"}}]), M("tool", big)]
B = 4000
out = tb.fit_messages(msgs, B, overhead=600)
assert tb.total_tokens(out, 600) <= B, tb.total_tokens(out, 600)
assert out[0].type == "system" and out[-1].type == "tool" and out[-2].type == "ai" and out[-3].type == "human"
assert out[-3].content == "What is the main result?"
assert len(out) < len(msgs)
# no change when already small
small = [M("system", "s"), M("human", "hi")]
assert tb.fit_messages(small, 4000) == small
# huge question is truncated but kept
huge = [M("system", "s"), M("human", big * 5)]
o = tb.fit_messages(huge, 3000)
assert tb.total_tokens(o) <= 3000 and o[1].content.startswith("word") and "trimmed" in o[1].content
# the real error from the user's log
err = "Error code: 413 - Request too large for model `openai/gpt-oss-120b` ... tokens per minute (TPM): Limit 8000, Requested 8090, please reduce"
assert tb.is_too_large_error(err) and tb.parse_limit(err) == 8000
assert not tb.is_too_large_error("Rate limit reached ... Limit 8000, Used 6000, Requested 3000. Please try again in 7.5s")
assert tb.retry_after_seconds("Please try again in 7.5s") == 8.5 and tb.retry_after_seconds("try again in 1m2.5s") > 60
assert tb.is_too_large_error("This model's maximum context length is 128000 tokens")
assert tb.parse_limit("prompt is too long: 250000 tokens > 200000 maximum") == 200000
# budgets and learning
tb.reset_learned()
assert tb.request_limit("groq", "openai/gpt-oss-120b") == 8000
b0 = tb.input_budget("groq", "openai/gpt-oss-120b")
assert 5000 < b0 < 6500, b0
tb.learn_from_error("groq", "some-new-model", "Limit 5000, Requested 6000")
assert tb.request_limit("groq", "some-new-model") == 5000
assert tb.input_budget("openai", "gpt-4o") > 15000
# splitting
text = "\n\n".join(f"Paragraph {i}. " + "x" * 500 for i in range(40))
ps = tb.split_for_condense(text, 1000)
assert all(len(p) <= 1000 * 3.2 + 50 for p in ps) and len(ps) > 3
assert "".join(ps).count("Paragraph") == 40
assert tb.split_for_condense("short", 1000) == ["short"]
print("token_budget OK")

# newest tool result is preserved better than older ones when squeezing
msgs = [M("system", "s"), M("human", "q")]
for i in range(4):
    msgs += [M("ai", "", [{"name": "t", "args": {"query": f"q{i}"}}]), M("tool", f"R{i} " + "data " * 1500)]
o = tb.fit_messages(msgs, 3000, overhead=500)
assert tb.total_tokens(o, 500) <= 3000
tools = [m for m in o if m.type == "tool"]
assert len(tools) == 4 and len(tools[-1].content) > len(tools[0].content), [len(t.content) for t in tools]
print("squeeze order OK")

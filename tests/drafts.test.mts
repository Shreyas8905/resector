import assert from "node:assert/strict";
import {
  addCitationAfter, appendBlock, citesToMarkers, diffLines, diffSummary, docMarker, excerptMarker, insertAt,
  keyOfMarker, numberMarkers, resolveKey, sectionBlock, textForSuggestion, wordCount,
} from "/home/claude/newfe/frontend/src/lib/drafts.ts";

const docs = [{ id: 1, filename: "a.pdf" }, { id: 2, filename: "b.pdf" }];
const ex = [{ id: 7, document_id: 1, page: 3, quote: "Sleep helps.", rects: [[0, 0, 1, 1]] }];

assert.equal(excerptMarker(7), "[@e7]"); assert.equal(docMarker(2, 5), "[@d2:p5]"); assert.equal(docMarker(2), "[@d2]");
assert.equal(keyOfMarker("[@d2:p5]"), "d2:p5"); assert.equal(keyOfMarker("[@x]"), null);
assert.equal(resolveKey("e7", docs, ex)?.filename, "a.pdf"); assert.equal(resolveKey("e7", docs, ex)?.page, 3);
assert.equal(resolveKey("d2:p5", docs, ex)?.page, 5); assert.equal(resolveKey("d9", docs, ex), null); assert.equal(resolveKey("e8", docs, ex), null);

const n = numberMarkers("A [@e7][@d2:p5]. B [@d2:p5] [@e7] [@d9].", docs, ex);
assert.equal(n.text, "A [1][2]. B [2] [1] ."); assert.deepEqual(n.missing, ["d9"]); assert.equal(n.sources.length, 2);

assert.equal(citesToMarkers("Yes [1][2] and [5] [p.3].", [{ n: 1, document_id: 1, page: 3 }, { n: 2, document_id: 2, page: null }]), "Yes [@d1:p3][@d2] and  .");
assert.equal(citesToMarkers("Same [1][1]", [{ n: 1, document_id: 1, page: 3 }]), "Same [@d1:p3]");

assert.deepEqual(insertAt("hello world", 5, " big"), { content: "hello big world", caret: 9 });
assert.deepEqual(insertAt("abc", 99, "X"), { content: "abcX", caret: 4 });
assert.equal(addCitationAfter("One. Two is here.", "Two is here.", "[@e7]"), "One. Two is here.[@e7]");
assert.equal(addCitationAfter("One.", "missing", "[@e7]"), null);

const doc = "# Title\n\nFirst sentence here. Second one [@e7] is longer. Third.\n- list item sentence.";
const at = (s: string) => doc.indexOf(s);
assert.equal(textForSuggestion(doc, at("Second") + 3, at("Second") + 3), "Second one is longer.");
assert.equal(textForSuggestion(doc, at("First") + 1, at("First") + 1), "First sentence here.");
assert.equal(textForSuggestion(doc, at("Third") + 2, at("Third") + 2), "Third.");
assert.equal(textForSuggestion(doc, at("list") + 1, at("list") + 1), "list item sentence.");
assert.equal(textForSuggestion(doc, 0, 7), "# Title");
assert.equal(textForSuggestion(doc, at("Second"), at("Second") + 10), "Second one");

const d = diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne");
assert.deepEqual(d.map((o) => o.type + ":" + o.text), ["same:a", "del:b", "add:B", "same:c", "same:d", "add:e"]);
assert.deepEqual(diffSummary(d), { added: 2, removed: 1 });
assert.deepEqual(diffLines("x", "x").map((o) => o.type), ["same"]);
assert.deepEqual(diffSummary(diffLines("", "a\nb")), { added: 2, removed: 1 });   // "" is one empty line

assert.equal(wordCount("Hello [@e7] world, it's fine"), 4); assert.equal(wordCount(""), 0);
assert.equal(sectionBlock(" Intro ", "\nText.\n"), "## Intro\n\nText.\n");
assert.equal(appendBlock("Existing\n\n", "## A\n\nB\n"), "Existing\n\n## A\n\nB\n"); assert.equal(appendBlock("", "  X"), "X");
console.log("drafts.test OK");

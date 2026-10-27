import { mergeLineRects, toPageFractions } from "/home/claude/proj/Resector - Copy/frontend/src/lib/rects.ts";
const m = mergeLineRects([[0.1,0.1,0.2,0.12],[0.205,0.1,0.3,0.12],[0.1,0.2,0.2,0.22],[0.6,0.1,0.7,0.12]]);
if (m.length !== 3) throw new Error("merge count " + m.length);
if (Math.abs(m[0][2] - 0.3) > 1e-9) throw new Error("merged width");
const f = toPageFractions([{left:50,top:50,right:150,bottom:70},{left:-20,top:0,right:-10,bottom:5}], { left:0, top:0, width:200, height:100 } as DOMRect);
if (f.length !== 1 || f[0][2] !== 0.75 || f[0][3] !== 0.7) throw new Error("fractions " + JSON.stringify(f));
console.log("rects OK");

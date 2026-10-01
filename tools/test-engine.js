const assert = require('assert');
const LC = require('./load.js'), solve = require('./solver.js');
const T = LC.trees(), C = LC.SCENE.conductors;
const tA = T[0];
// pick a scaffold with laterals for unit checks
const b = tA.branches[20];
const ir = LC.idealRemoval(tA, b);
const cut = (o) => LC.analyseCut(tA, Object.assign({ t: 0, b: 20, s: ir.sStar, a: Math.round(ir.theta), m: 3 }, o));
let a = cut({});
assert.equal(a.type, 'removal'); assert.ok(a.score > 95, 'ideal removal ~100: ' + a.score);
a = cut({ s: ir.sStar - 0.06 }); assert.ok(a.parts.position < 0.01 && /flush/.test(a.notes.join()), 'flush detected');
a = cut({ s: ir.sStar + 0.25 }); assert.ok(a.parts.position < 0.3 && /stub/.test(a.notes.join()), 'stub detected');
a = cut({ a: Math.round(ir.theta) + 30 }); assert.ok(a.parts.angle < 0.3, 'bad angle penalised');
a = cut({ m: 1 }); assert.ok(a.parts.technique === 0 && a.D > 0.075, 'heavy single cut penalised');
// heading cut in the middle of a long internode
let best = null;
tA.branches.forEach((br) => { for (let i = 1; i < br.pts.length; i++) { const s = (br.cum[i - 1] + br.cum[i]) / 2; const r = LC.analyseCut(tA, { t: 0, b: br.id, s, a: 0, m: 1 }); if (r.type === 'heading') { best = r; return; } } });
assert.ok(best && best.parts.position < 0.01, 'heading cut scores 0 position');
// reduction ratio rule
const stem = tA.branches[44], kid = tA.branches[stem.kids[stem.kids.length - 1]];
const id = LC.idealReduction(tA, stem, kid);
a = LC.analyseCut(tA, { t: 0, b: 44, s: id.sStar, a: Math.round(id.theta), m: 1 });
assert.equal(a.type, 'reduction');
console.log('reduction check', a.score.toFixed(0), a.notes);

// whole game
const none = LC.scoreAll([]); assert.equal(none.total, 0, 'no cuts = 0');
const eA = solve(0, (x, y, r) => x + r > C[0].x - 4.6);
const tB = T[1], e0 = tB.initial.extents;
const eB = solve(1, (x, y, r) => { if (Math.min(...C.map(c => Math.hypot(x - c.x, y - c.y))) - r < 3.1) return true; const c = tB.centroid; let g = Math.atan2(y - c.y, x - c.x) * 180 / Math.PI; if (g < -90) g += 360; const k = Math.round((g + 45) / 30); if (k < 0 || k > 9) return false; return Math.hypot(x - c.x, y - c.y) + r > e0[k] - 0.6; });
const expert = LC.scoreAll(eA.concat(eB));
console.log('expert', expert.total, expert.trees.map(t => Math.round(t.points.total)));
assert.ok(expert.total > 800);
// one-sided tree B (line side only) should lose evenness
const oneSided = solve(1, (x, y, r) => Math.min(...C.map(c => Math.hypot(x - c.x, y - c.y))) - r < 3.1);
const os = LC.scoreTree(tB, oneSided);
console.log('tree B one-sided: even', os.crown.even.toFixed(2), 'crown pts', Math.round(os.points.crown), 'vs balanced', Math.round(expert.trees[1].points.crown));
assert.ok(os.crown.even < expert.trees[1].crown.even);
// naive "hedge trimmer": heading cuts exactly at the corridor line on tree A
const naive = [];
const keep = LC.retainedLengths(tA, []);
tA.branches.forEach((br) => {
  const pr = br.p >= 0 ? tA.branches[br.p] : null;
  for (let i = 1; i < br.pts.length; i++) if (br.pts[i][0] > C[0].x - 4.5 - 0.45) { naive.push({ t: 0, b: br.id, s: Math.max(0.05, br.cum[i] - 0.4), a: 0, m: 1 }); break; }
});
const nv = LC.scoreAll(naive.concat(eB));
console.log('naive tree A', Math.round(nv.trees[0].points.total), 'cutQ', nv.trees[0].cutScore.toFixed(2), 'clear', nv.trees[0].clearance.d.toFixed(2));
assert.ok(nv.trees[0].points.total < expert.trees[0].points.total - 60);
console.log('ALL ENGINE TESTS PASSED');

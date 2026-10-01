// "Expert" reference solver used for testing and tuning (not shipped).
const LC = require('./load.js');
function solve(treeIdx, offends, opts = {}) {
  const tree = LC.trees()[treeIdx];
  const cuts = [];
  for (let it = 0; it < 200; it++) {
    const keep = LC.retainedLengths(tree, cuts);
    let target = null;
    for (const b of tree.branches) {
      const L = keep[b.id]; if (L < 0) continue;
      let sOff = Infinity;
      b.lf.forEach(f => { if (f.s <= L && offends(f.x, f.y, f.r)) sOff = Math.min(sOff, f.s); });
      for (let k = 1; k < b.pts.length; k++) if (b.cum[k] <= L && offends(b.pts[k][0], b.pts[k][1], 0)) { sOff = Math.min(sOff, b.cum[k]); break; }
      if (sOff < Infinity && (!target || b.depth < target.b.depth)) target = { b, sOff };
    }
    if (!target) break;
    const { b, sOff } = target;
    // best reduction point before offence: latest lateral that is >= 1/3 stem, else any lateral, else removal
    let cut = null;
    const kids = b.kids.map(i => tree.branches[i]).filter(k => k.ps < sOff - 0.05 && keep[k.id] >= 0).reverse();
    for (const pass of [0.34, 0.2, 0]) {
      for (const k of kids) {
        const id = LC.idealReduction(tree, b, k);
        if (id.sStar + 0.03 >= sOff) continue;
        if (k.d[0] / LC.diamAt(tree, b, id.sStar) < pass) continue;
        cut = { t: treeIdx, b: b.id, s: id.sStar + 0.01, a: Math.round(id.theta), m: 1 }; break;
      }
      if (cut) break;
    }
    if (!cut) {
      if (b.p < 0) { cut = { t: treeIdx, b: b.id, s: Math.max(1, sOff - 0.3), a: 0, m: 3 }; }
      else { const ir = LC.idealRemoval(tree, b); cut = { t: treeIdx, b: b.id, s: Math.min(ir.sStar + 0.01, sOff - 0.01), a: Math.round(ir.theta), m: 1 }; }
    }
    cut.m = LC.diamAt(tree, b, cut.s) > LC.K.heavy ? 3 : 1;
    cuts.push(cut);
  }
  return cuts;
}
module.exports = solve;
if (require.main === module) {
  const S = LC.SCENE, C = S.conductors;
  const T = LC.trees();
  const mA = +(process.argv[2] || 0.1), mB = +(process.argv[3] || 0.1);
  const cutsA = solve(0, (x, y, r) => x + r > C[0].x - 4.5 - mA);
  const tB = T[1], e0 = tB.initial.extents;
  const R = +(process.argv[4] || 1.2);
  const cutsB = solve(1, (x, y, r) => {
    if (Math.min(...C.map(c => Math.hypot(x - c.x, y - c.y))) - r < 3.0 + mB) return true;
    const c = tB.centroid; let ang = Math.atan2(y - c.y, x - c.x) * 180 / Math.PI; if (ang < -90) ang += 360;
    const k = Math.round((ang + 45) / 30); if (k < 0 || k > 9) return false;
    return Math.hypot(x - c.x, y - c.y) + r > e0[k] - R;
  });
  const res = LC.scoreAll(cutsA.concat(cutsB));
  console.log('TOTAL', res.total);
  for (const t of res.trees) {
    console.log(t.id, 'cuts', t.cuts.length, 'clear', t.clearance.d.toFixed(2), 'pts', JSON.stringify(Object.fromEntries(Object.entries(t.points).map(([k, v]) => [k, Math.round(v)]))), 'leafRemoved', (t.crown.leafRemoved * 100).toFixed(0) + '%', t.crown.even != null ? 'even ' + t.crown.even.toFixed(2) + ' mean ' + t.crown.meanReduction.toFixed(2) + ' sd ' + t.crown.spread.toFixed(2) : '');
    for (const c of t.cuts) console.log('   ', c.type.padEnd(9), Math.round(c.score).toString().padStart(3), (c.D * 1000).toFixed(0) + 'mm', c.notes.join(' | '));
  }
}

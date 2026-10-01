// Generates the fixed tree geometry for "Line Clear" (Oct 2026).
// Output: games/2026-10-line-clear/trees-data.js  (shared by the game and the Apps Script backend)
// Run: node tools/gen-trees.js
const fs = require('fs');
const path = require('path');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DEG = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;

function makeTree(spec) {
  const R = mulberry32(spec.seed);
  const rand = (a, b) => a + (b - a) * R();
  const E = spec.crown;
  // normalised envelope value: <1 inside the crown envelope
  function env(x, y) {
    const dx = x - E.cx, dy = y - E.cy;
    const rx = dx < 0 ? E.rxL : E.rxR;
    const ry = dy > 0 ? E.ryUp : E.ryDown;
    return Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  }
  const branches = [];
  const STEP = 0.4;

  function grow(start, angle, opts) {
    // angle: radians, direction of growth (0 = +x, 90deg = up)
    const pts = [start.slice()];
    let a = angle, x = start[0], y = start[1], len = 0;
    const up = Math.PI / 2;
    while (len < opts.maxLen) {
      const step = Math.min(STEP, opts.maxLen - len);
      x += Math.cos(a) * step; y += Math.sin(a) * step; len += step;
      pts.push([x, y]);
      if (len > 0.3 && env(x, y) > opts.limit) break;
      // bend toward vertical (phototropism) + noise
      let diff = up - a; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      a += Math.sign(diff) * Math.min(Math.abs(diff), opts.curve * step) + rand(-1, 1) * opts.wobble * step;
      if (y < 1.2) a += 0.2; // avoid dipping to the ground
    }
    return { pts, len };
  }

  function addBranch(parent, ps, pts, depth, tipD) {
    const b = { id: branches.length, p: parent, ps, pts, depth, tipD, kids: [] };
    branches.push(b);
    if (parent >= 0) branches[parent].kids.push(b.id);
    return b;
  }

  function pointAt(pts, s) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      const L = Math.hypot(dx, dy);
      if (acc + L >= s || i === pts.length - 1) {
        const t = L > 0 ? Math.min(1, (s - acc) / L) : 0;
        return { x: pts[i - 1][0] + dx * t, y: pts[i - 1][1] + dy * t, a: Math.atan2(dy, dx) };
      }
      acc += L;
    }
  }
  const lenOf = (pts) => pts.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

  function addLaterals(b, depth, cfg) {
    const L = lenOf(b.pts);
    let s = cfg.first * rand(0.8, 1.2);
    let side = R() < 0.5 ? 1 : -1;
    while (s < L - cfg.endGap) {
      const P = pointAt(b.pts, s);
      const ang = P.a + side * rand(cfg.angMin, cfg.angMax) * DEG;
      const dir = [Math.cos(ang), Math.sin(ang)];
      const outward = (dir[0] * (P.x - E.cx) + dir[1] * (P.y - E.cy)) >= 0;
      let maxLen = rand(cfg.lenMin, cfg.lenMax) * (outward ? 1 : 0.55) * (1 - 0.35 * (s / L));
      if (dir[1] < -0.55) maxLen *= 0.5; // strongly downward shoots stay short
      const g = grow([P.x, P.y], ang, { maxLen, limit: cfg.limit * rand(0.94, 1.02), curve: cfg.curve, wobble: cfg.wobble });
      if (g.len > 0.25) {
        const c = addBranch(b.id, s, g.pts, depth, cfg.tipD);
        if (cfg.next) addLaterals(c, depth + 1, cfg.next);
      }
      s += rand(cfg.stepMin, cfg.stepMax);
      side = -side;
      if (R() < 0.18) side = -side; // occasional same-side pair
    }
  }

  const tert = { first: 0.35, endGap: 0.15, angMin: 28, angMax: 50, lenMin: 0.35, lenMax: 0.95, stepMin: 0.3, stepMax: 0.55, limit: 1.04, curve: 0.2, wobble: 0.25, tipD: 0.011 };
  const sec = { first: 0.55, endGap: 0.25, angMin: 30, angMax: 55, lenMin: 0.9, lenMax: 2.4, stepMin: 0.45, stepMax: 0.8, limit: 1.0, curve: 0.25, wobble: 0.2, tipD: 0.014, next: tert };

  // trunk / leader
  const trunkPts = [[spec.x0, 0]];
  {
    let x = spec.x0, y = 0;
    const lean = spec.lean * DEG;
    while (y < spec.H) {
      const st = Math.min(0.5, spec.H - y);
      x += Math.sin(lean) * st + rand(-0.03, 0.03); y += Math.cos(lean) * st;
      trunkPts.push([x, y]);
    }
  }
  const trunk = addBranch(-1, 0, trunkPts, 0, 0.03);
  const TL = lenOf(trunkPts);

  // scaffold limbs
  const n = spec.scaffolds;
  let side = spec.firstSide;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const s = spec.h0 + t * (TL - 1.6 - spec.h0) + rand(-0.15, 0.15);
    const P = pointAt(trunkPts, s);
    const fromVert = (70 - 45 * t + rand(-8, 8)) * DEG;
    const ang = Math.PI / 2 - side * fromVert;
    const g = grow([P.x, P.y], ang, { maxLen: 9, limit: rand(0.9, 1.0), curve: 0.1, wobble: 0.12 });
    const b = addBranch(trunk.id, s, g.pts, 1, 0.02);
    addLaterals(b, 2, sec);
    side = -side;
    if (R() < 0.2) side = -side;
  }
  // leader laterals above the top scaffold
  addLaterals(trunk, 2, Object.assign({}, sec, { first: TL - 1.4, endGap: 0.2, lenMin: 0.8, lenMax: 1.6 }));

  // pipe-model diameters
  function baseD(b) {
    let sum = b.tipD ** 2;
    for (const k of b.kids) sum += baseD(branches[k]) ** 2;
    b.baseD = Math.sqrt(sum);
    return b.baseD;
  }
  baseD(trunk);
  const TF = 1.35; // trunk flare factor (trunk only)
  const scale = spec.trunkD / (TF * trunk.baseD); // calibrate so the trunk base = trunkD
  // diameters at each node
  for (const b of branches) {
    const cum = [0];
    for (let i = 1; i < b.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(b.pts[i][0] - b.pts[i - 1][0], b.pts[i][1] - b.pts[i - 1][1]));
    b.d = cum.map((sk) => {
      let sum = b.tipD ** 2;
      for (const k of b.kids) if (branches[k].ps >= sk) sum += branches[k].baseD ** 2;
      return Math.sqrt(sum) * scale * (b.depth === 0 ? TF : 1);
    });
    b.cum = cum;
  }
  // foliage
  for (const b of branches) {
    b.lf = [];
    if (b.depth === 0) continue;
    const L = b.cum[b.cum.length - 1];
    for (let i = 1; i < b.pts.length; i++) {
      const sk = b.cum[i];
      if (b.depth === 1 && sk < 0.55 * L) continue;
      if (b.depth === 2 && sk < 0.3) continue;
      b.lf.push([b.pts[i][0] + rand(-0.08, 0.08), b.pts[i][1] + rand(-0.08, 0.08), rand(0.34, 0.46), sk]);
    }
  }
  return branches.map((b) => ({
    p: b.p, ps: r3(b.ps), t: Math.round(b.tipD * scale * 10000) / 10000, tf: b.depth === 0 ? TF : 1,
    pts: b.pts.flatMap((q) => [r3(q[0]), r3(q[1])]),
    d: b.d.map(r3),
    lf: b.lf.flatMap((f) => [r3(f[0]), r3(f[1]), r3(f[2]), r3(f[3])]),
  }));
}

const specA = { seed: 20261001, x0: -9.2, H: 12.6, lean: 3, h0: 2.8, scaffolds: 11, firstSide: 1, trunkD: 0.46,
  crown: { cx: -8.7, cy: 8.2, rxL: 4.3, rxR: 4.6, ryUp: 4.6, ryDown: 4.6 } };
const specB = { seed: 20261017, x0: 7.3, H: 12.1, lean: -2, h0: 3.0, scaffolds: 10, firstSide: -1, trunkD: 0.42,
  crown: { cx: 7.0, cy: 8.1, rxL: 4.0, rxR: 3.9, ryUp: 4.1, ryDown: 4.1 } };

const trees = [
  { id: 'A', name: 'Tree A — Sycamore', x0: specA.x0, rule: 'side', target: 4.5, branches: makeTree(specA) },
  { id: 'B', name: 'Tree B — Oak', x0: specB.x0, rule: 'radial', target: 3.0, branches: makeTree(specB) },
];

const out = '// AUTO-GENERATED by tools/gen-trees.js — do not edit by hand.\n' +
  'var LC_TREES = ' + JSON.stringify(trees) + ';\n' +
  'if (typeof module !== "undefined") module.exports = LC_TREES;\n';
fs.writeFileSync(path.join(__dirname, '..', 'games', '2026-10-line-clear', 'trees-data.js'), out);
for (const t of trees) {
  const leaves = t.branches.reduce((a, b) => a + b.lf.length / 4, 0);
  const sc = t.branches.filter(b=>b.p===0).map(b=>Math.round(b.d[0]*1000)); console.log('scaffold mm', sc.join(','));
  console.log(t.id, 'branches', t.branches.length, 'leaves', leaves, 'trunk base d', t.branches[0].d[0]);
}
console.log('bytes', out.length);

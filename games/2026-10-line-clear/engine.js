/* Line Clear — scoring engine (Oakwick Games, October 2026)
 * Shared by the browser game and the Google Apps Script backend, so the server
 * can re-score every submission from the raw cuts. Plain ES5-compatible JS, no DOM.
 * Requires LC_TREES (trees-data.js) to be loaded first.
 */
var LineClear = (function () {
  var VERSION = '2026-10.1';
  var DEG = Math.PI / 180;

  var SCENE = {
    conductors: [{ x: -0.7, y: 9.0 }, { x: 0, y: 9.0 }, { x: 0.7, y: 9.0 }],
    pole: { x: 0, top: 9.7, arm: 9.0, armHalf: 0.95 },
    view: { x0: -16, x1: 14, y0: -0.6, y1: 15 },
    voltage: '11kV'
  };

  // Scoring constants (see RULES text in the game for the plain-English version)
  var K = {
    bandLow: 0.01,        // m: full marks from this far inside the ideal point...
    bandHigh: 0.03,       // m: ...to this far outside it
    intoZero: 0.05,       // m past bandLow into collar/ridge -> 0
    stubZero: 0.28,       // m of stub beyond band -> 0
    candidateReach: 0.5,  // m beyond ideal point still treated as a removal/reduction (stub) attempt
    angleFull: 8,         // deg error for full angle marks
    angleZero: 35,        // deg error for zero angle marks
    woundFull: 0.100,     // m diameter
    woundZero: 0.180,
    heavy: 0.075,         // m: over this, use the three-cut method
    leafLimit: 0.30,      // max proportion of leaf-bearing material removed
    leafZero: 0.60,
    clearOverZero: 1.5,   // m over-clearance -> 0 clearance marks
    clearUnderZero: 0.5   // m short of clearance -> 0 clearance marks
  };
  var W = { clearance: 200, cuts: 200, crown: 100 }; // per tree, max 500

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp01(v, full, zero) { // 1 at <=full, 0 at >=zero
    if (zero > full) return clamp(1 - (v - full) / (zero - full), 0, 1);
    return clamp(1 - (full - v) / (full - zero), 0, 1);
  }
  function lineAngle(a) { a = a % 180; if (a < 0) a += 180; return a; } // undirected line angle, deg
  function signedLineDiff(from, to) { var d = lineAngle(to) - lineAngle(from); if (d > 90) d -= 180; if (d <= -90) d += 180; return d; }

  // ---------- geometry prep ----------
  function prepare(raw, index) {
    var br = raw.branches.map(function (b, i) {
      var pts = [], cum = [0];
      for (var k = 0; k < b.pts.length; k += 2) pts.push([b.pts[k], b.pts[k + 1]]);
      for (k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      var lf = [];
      for (k = 0; k < b.lf.length; k += 4) lf.push({ x: b.lf[k], y: b.lf[k + 1], r: b.lf[k + 2], s: b.lf[k + 3] });
      return { id: i, p: b.p, ps: b.ps, t: b.t, tf: b.tf, pts: pts, cum: cum, len: cum[cum.length - 1], d: b.d, lf: lf, kids: [], depth: 0 };
    });
    br.forEach(function (b) { if (b.p >= 0) { br[b.p].kids.push(b.id); b.depth = br[b.p].depth + 1; } });
    br.forEach(function (b) { b.kids.sort(function (a, c) { return br[a].ps - br[c].ps; }); });
    var leafTotal = 0, cx = 0, cy = 0;
    br.forEach(function (b) { b.lf.forEach(function (f) { var a = f.r * f.r; leafTotal += a; cx += f.x * a; cy += f.y * a; }); });
    var tree = { index: index, id: raw.id, name: raw.name, x0: raw.x0, rule: raw.rule, target: raw.target, branches: br, leafTotal: leafTotal, centroid: { x: cx / leafTotal, y: cy / leafTotal } };
    tree.initial = { clearance: clearance(tree, retainedLengths(tree, [])), extents: extents(tree, retainedLengths(tree, [])) };
    return tree;
  }

  function pointAt(b, s) {
    s = clamp(s, 0, b.len);
    for (var i = 1; i < b.pts.length; i++) {
      if (b.cum[i] >= s || i === b.pts.length - 1) {
        var L = b.cum[i] - b.cum[i - 1], t = L > 0 ? (s - b.cum[i - 1]) / L : 0;
        var dx = b.pts[i][0] - b.pts[i - 1][0], dy = b.pts[i][1] - b.pts[i - 1][1], n = Math.hypot(dx, dy) || 1;
        return { x: b.pts[i - 1][0] + dx * t, y: b.pts[i - 1][1] + dy * t, ux: dx / n, uy: dy / n };
      }
    }
    return { x: b.pts[0][0], y: b.pts[0][1], ux: 0, uy: 1 };
  }
  function diamAt(tree, b, s) {
    var sum = b.t * b.t;
    for (var i = 0; i < b.kids.length; i++) { var k = tree.branches[b.kids[i]]; if (k.ps > s) sum += k.d[0] * k.d[0]; }
    return Math.sqrt(sum) * b.tf;
  }
  // distance along the branch from 'a' (param) to where line (through E along dir d) crosses axis
  function edgeLine(P, D, nx, ny, dirDeg) { // returns axis-crossing shift given an edge point on side n
    var dx = Math.cos(dirDeg * DEG), dy = Math.sin(dirDeg * DEG);
    var dn = dx * nx + dy * ny; if (Math.abs(dn) < 0.2) dn = dn < 0 ? -0.2 : 0.2;
    var lam = -(D / 2) / dn;
    return { lam: lam, du: lam * (dx * P.ux + dy * P.uy) };
  }
  function intersect(p, r, q, s) { // lines p + t r, q + u s -> t
    var den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
    return ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
  }

  // Ideal final cut for REMOVAL of branch b at its union with its parent (natural target pruning):
  // from just outside the branch bark ridge (crotch side) to just outside the branch collar (underside).
  function idealRemoval(tree, b) {
    var par = tree.branches[b.p];
    var O = pointAt(b, 0), Pp = pointAt(par, b.ps);
    var u = [O.ux, O.uy], w = [Pp.ux, Pp.uy];
    var Db = diamAt(tree, b, 0.001), Dp = diamAt(tree, par, b.ps - 0.001);
    var n = [-u[1], u[0]]; if (n[0] * w[0] + n[1] * w[1] < 0) n = [-n[0], -n[1]]; // crotch side
    var k = [-w[1], w[0]]; if (k[0] * u[0] + k[1] * u[1] < 0) k = [-k[0], -k[1]];  // parent edge facing branch
    var PE = [Pp.x + k[0] * Dp / 2, Pp.y + k[1] * Dp / 2];
    var tC = intersect([O.x + n[0] * Db / 2, O.y + n[1] * Db / 2], u, PE, w);
    var tS = intersect([O.x - n[0] * Db / 2, O.y - n[1] * Db / 2], u, PE, w);
    var sC = tC == null ? Dp / 2 : clamp(tC, 0, b.len);
    var sS = tS == null ? Dp / 2 : clamp(tS, 0, b.len);
    var collar = clamp(0.35 * Db, 0.02, 0.06);
    var sTop = sC + 0.012, sBot = sS + collar;
    // line from top point (n side) to bottom point (-n side)
    var dx = u[0] * (sBot - sTop) - n[0] * Db, dy = u[1] * (sBot - sTop) - n[1] * Db;
    var perp = Math.atan2(u[1], u[0]) / DEG + 90;
    var theta = clamp(signedLineDiff(perp, Math.atan2(dy, dx) / DEG), -60, 60);
    var sStar = clamp((sTop + sBot) / 2, 0.02, b.len);
    return { type: 'removal', sStar: sStar, theta: theta, sCrotch: sC, sSurface: sS, collar: collar, n: n, parentD: Dp, branchD: Db, junctionAngle: Math.abs(signedLineDiff(Math.atan2(u[1], u[0]) / DEG, Math.atan2(w[1], w[0]) / DEG)) };
  }
  // Ideal final cut for REDUCTION of stem b to the lateral kid (retained).
  function idealReduction(tree, b, kid) {
    var O = pointAt(b, kid.ps), V = pointAt(kid, 0);
    var u = [O.ux, O.uy], v = [V.ux, V.uy];
    var D = diamAt(tree, b, kid.ps + 0.001), dL = kid.d[0];
    var n = [-u[1], u[0]]; if (n[0] * v[0] + n[1] * v[1] < 0) n = [-n[0], -n[1]]; // lateral side of stem
    var m = [-v[1], v[0]]; if (m[0] * u[0] + m[1] * u[1] < 0) m = [-m[0], -m[1]]; // lateral edge facing stem continuation
    var tC = intersect([O.x + n[0] * D / 2, O.y + n[1] * D / 2], u, [V.x + m[0] * dL / 2, V.y + m[1] * dL / 2], v);
    var sC = tC == null ? D : clamp(tC, 0, 1.0);
    var perp = Math.atan2(u[1], u[0]) / DEG + 90;
    var theta = signedLineDiff(perp, Math.atan2(v[1], v[0]) / DEG) / 2;
    var sE = kid.ps + sC + 0.012;
    var sh = edgeLine(O, D, n[0], n[1], perp + theta);
    var sStar = clamp(sE + sh.du, kid.ps + 0.01, b.len);
    return { type: 'reduction', sStar: sStar, theta: theta, sCrotch: kid.ps + sC, n: n, stemD: D, lateralD: dL, lateral: kid.id, junctionAngle: Math.abs(signedLineDiff(Math.atan2(u[1], u[0]) / DEG, Math.atan2(v[1], v[0]) / DEG)) };
  }

  function positionScore(s, sStar) {
    var lo = sStar - K.bandLow, hi = sStar + K.bandHigh;
    if (s >= lo && s <= hi) return { v: 1, off: 0 };
    if (s < lo) return { v: lerp01(lo - s, 0, K.intoZero), off: s - sStar, into: true };
    return { v: lerp01(s - hi, 0, K.stubZero), off: s - sStar, stub: true };
  }

  // ---------- one cut ----------
  function analyseCut(tree, cut) {
    var b = tree.branches[cut.b];
    var s = clamp(cut.s, 0, b.len);
    var D = diamAt(tree, b, s);
    var P = pointAt(b, s);
    var best = null;
    // candidate: removal at the collar (not for the main stem)
    if (b.p >= 0) {
      var ir = idealRemoval(tree, b);
      if (s <= ir.sStar + K.candidateReach) {
        var pr = positionScore(s, ir.sStar);
        best = { ideal: ir, pos: pr };
      }
    }
    // candidates: reduction to a lateral below the cut
    for (var i = b.kids.length - 1; i >= 0; i--) {
      var kid = tree.branches[b.kids[i]];
      if (kid.ps >= s) continue;
      var id = idealReduction(tree, b, kid);
      if (s > id.sStar + K.candidateReach) break; // further laterals are even further away
      var pp = positionScore(s, id.sStar);
      if (!best || pp.v > best.pos.v) best = { ideal: id, pos: pp };
    }
    var notes = [], sc = {};
    var type, ideal = best && best.ideal;
    if (!best) {
      type = 'heading';
      sc.position = 0;
      notes.push('Internodal (heading) cut — no growth point to cut back to, leaves a stub that will die back.');
      ideal = { theta: 0 };
    } else {
      type = ideal.type;
      sc.position = best.pos.v;
      if (best.pos.into) notes.push(type === 'removal' ? 'Too close — cuts into the branch collar (flush cut).' : 'Too close — cuts into the branch bark ridge of the retained lateral.');
      else if (best.pos.stub && best.pos.off > K.bandHigh + 0.04) notes.push('Leaves a stub of ~' + Math.round((best.pos.off - K.bandHigh) * 100) + ' cm.');
    }
    // angle
    var aErr = Math.abs((cut.a || 0) - ideal.theta);
    sc.angle = lerp01(aErr, K.angleFull, K.angleZero);
    if (type !== 'heading' && aErr > K.angleFull) notes.push('Cut angle off by ' + Math.round(aErr) + '° from the optimum for this union.');
    // proportion
    if (type === 'removal') {
      var r = ideal.branchD / ideal.parentD;
      sc.ratio = ideal.branchD <= 0.04 ? 1 : lerp01(r, 1 / 3, 0.6);
      if (sc.ratio < 1) notes.push('Removed branch is ' + Math.round(r * 100) + '% of the parent stem diameter (aim ≤ 33%).');
    } else if (type === 'reduction') {
      var q = ideal.lateralD / D;
      sc.ratio = lerp01(q, 1 / 3, 0.15);
      if (q < 1 / 3) notes.push('Retained lateral is only ' + Math.round(q * 100) + '% of the removed stem — too small to take over (aim ≥ 33%).');
    } else sc.ratio = 0;
    // wound size
    sc.wound = lerp01(D, K.woundFull, K.woundZero);
    if (D > K.woundFull) notes.push('Large wound: ' + Math.round(D * 1000) + ' mm diameter (aim ≤ 100 mm).');
    // technique
    if (D > K.heavy) {
      sc.technique = cut.m === 3 ? 1 : 0;
      if (cut.m !== 3) notes.push('Heavy limb cut in one go — risk of bark tearing. Use the three-cut method.');
    } else sc.technique = 1;

    var pts = 45 * sc.position + 20 * sc.angle + 15 * sc.ratio + 10 * sc.wound + 10 * sc.technique;
    return { type: type, score: pts, parts: sc, notes: notes, D: D, x: P.x, y: P.y, ideal: ideal, s: s };
  }

  // ---------- cut application ----------
  function retainedLengths(tree, cuts) {
    var br = tree.branches, keep = new Array(br.length), own = {};
    cuts.forEach(function (c) { if (own[c.b] == null || c.s < own[c.b]) own[c.b] = c.s; });
    for (var i = 0; i < br.length; i++) { // parents always precede children
      var b = br[i];
      var lim = own[i] != null ? clamp(own[i], 0, b.len) : b.len;
      if (b.p >= 0) { var pk = keep[b.p]; if (pk < 0 || b.ps > pk) lim = -1; }
      keep[i] = lim;
    }
    return keep;
  }
  function isRedundant(tree, cuts, idx) {
    var c = cuts[idx], others = cuts.filter(function (_, j) { return j !== idx; });
    var keep = retainedLengths(tree, others);
    return keep[c.b] < 0 || keep[c.b] < c.s;
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = clamp(t, 0, 1); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  // Nearest vegetation to the line, per the tree's rule. Returns {d, x, y}
  function clearance(tree, keep) {
    var best = { d: Infinity, x: 0, y: 0 }, C = SCENE.conductors;
    var xNear = C[0].x; // nearest conductor on the left-hand side for the side rule
    function test(x, y, r) {
      var d;
      if (tree.rule === 'side') d = (xNear - x) - r;
      else { d = Infinity; for (var i = 0; i < C.length; i++) d = Math.min(d, Math.hypot(x - C[i].x, y - C[i].y) - r); }
      if (d < best.d) best = { d: d, x: x, y: y };
    }
    tree.branches.forEach(function (b, i) {
      var L = keep[i]; if (L < 0) return;
      var end = pointAt(b, L);
      for (var k = 0; k < b.pts.length; k++) { if (b.cum[k] > L) break; test(b.pts[k][0], b.pts[k][1], 0); }
      test(end.x, end.y, 0);
      if (tree.rule === 'radial') { // wood segments against conductors (fine check)
        for (k = 1; k < b.pts.length && b.cum[k - 1] < L; k++) {
          var q = b.cum[k] > L ? [end.x, end.y] : b.pts[k];
          for (var j = 0; j < C.length; j++) { var dd = segDist(C[j].x, C[j].y, b.pts[k - 1][0], b.pts[k - 1][1], q[0], q[1]); if (dd < best.d) best = { d: dd, x: C[j].x, y: C[j].y }; }
        }
      }
      b.lf.forEach(function (f) { if (f.s <= L) test(f.x, f.y, f.r); });
    });
    return best;
  }
  function leafRetained(tree, keep) {
    var a = 0;
    tree.branches.forEach(function (b, i) { if (keep[i] < 0) return; b.lf.forEach(function (f) { if (f.s <= keep[i]) a += f.r * f.r; }); });
    return a;
  }
  // crown extent in 12 sectors around the original crown centroid (upper/side sectors only)
  var SECTORS = [];
  for (var sa = -45; sa <= 225; sa += 30) SECTORS.push(sa); // 10 sectors, excludes the downward-facing ones
  function extents(tree, keep) {
    var c = tree.centroid, ext = SECTORS.map(function () { return 0; });
    tree.branches.forEach(function (b, i) {
      if (keep[i] < 0) return;
      b.lf.forEach(function (f) {
        if (f.s > keep[i]) return;
        var ang = Math.atan2(f.y - c.y, f.x - c.x) / DEG; if (ang < -90) ang += 360;
        for (var k = 0; k < SECTORS.length; k++) if (Math.abs(ang - SECTORS[k]) <= 15) { var e = Math.hypot(f.x - c.x, f.y - c.y) + f.r; if (e > ext[k]) ext[k] = e; }
      });
    });
    return ext;
  }

  // ---------- whole tree ----------
  function scoreTree(tree, cutsAll) {
    var cuts = cutsAll.filter(function (c) { return c.t === tree.index; });
    var active = cuts.filter(function (_, i) { return !isRedundant(tree, cuts, i); });
    var keep = retainedLengths(tree, active);
    var cl = clearance(tree, keep);
    var T = tree.target, d = cl.d, clearScore;
    if (d >= T) clearScore = lerp01(d - T, 0, K.clearOverZero);
    else clearScore = 0.5 * lerp01(T - d, 0, K.clearUnderZero);
    var leafFrac = 1 - leafRetained(tree, keep) / tree.leafTotal;
    var volScore = lerp01(leafFrac, K.leafLimit, K.leafZero);
    var crown = { leafRemoved: leafFrac, volume: volScore };
    var crownScore = volScore;
    if (tree.rule === 'radial') {
      var e0 = tree.initial.extents, e1 = extents(tree, keep), red = [];
      for (var k = 0; k < e0.length; k++) if (e0[k] > 0) red.push(Math.max(0, e0[k] - e1[k]));
      var mean = red.reduce(function (a, v) { return a + v; }, 0) / red.length;
      var sd = Math.sqrt(red.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / red.length);
      var even = mean < 0.15 ? 0 : lerp01(sd, 0.25, 0.9);
      crown.meanReduction = mean; crown.spread = sd; crown.even = even; crown.sectors = red;
      crownScore = 0.6 * even + 0.4 * volScore;
    }
    if (!active.length) crownScore = 0;            // no work done -> no crown marks
    else if (d < T - 0.05) crownScore *= 0.5;       // clearance not achieved
    crown.score = crownScore;
    // cut quality: diameter-weighted mean
    var list = [], wsum = 0, qsum = 0;
    active.forEach(function (c) {
      var a = analyseCut(tree, c);
      if (tree.rule === 'side') {
        // was the material this cut removes anywhere near the corridor?
        var only = retainedLengths(tree, [c]), gone = false, xLim = SCENE.conductors[0].x - T - 1.0;
        tree.branches.forEach(function (b, i) {
          if (gone) return;
          var L = only[i];
          b.lf.forEach(function (f) { if (!gone && (L < 0 || f.s > L) && f.x + f.r > xLim) gone = true; });
          if (!gone) for (var k2 = 0; k2 < b.pts.length; k2++) if ((L < 0 || b.cum[k2] > L) && b.pts[k2][0] > xLim) { gone = true; break; }
        });
        if (!gone) { a.score *= 0.5; a.notes.push('Unnecessary — this cut doesn\'t affect the line clearance (no more than necessary).'); a.unneeded = true; }
      }
      var w = Math.max(a.D, 0.03);
      wsum += w; qsum += w * a.score;
      a.cut = c; list.push(a);
    });
    var cutScore = active.length ? qsum / wsum / 100 : 0;
    var pts = { clearance: W.clearance * clearScore, cuts: W.cuts * cutScore, crown: W.crown * crownScore };
    pts.total = pts.clearance + pts.cuts + pts.crown;
    return { id: tree.id, name: tree.name, rule: tree.rule, target: T, clearance: cl, initialClearance: tree.initial.clearance.d, clearScore: clearScore, cutScore: cutScore, crown: crown, cuts: list, redundant: cuts.length - active.length, points: pts, keep: keep };
  }

  var TREES = null;
  function trees() { if (!TREES) TREES = LC_TREES.map(prepare); return TREES; }

  function sanitise(cuts) {
    if (!Array.isArray(cuts)) return [];
    var T = trees();
    return cuts.slice(0, 80).map(function (c) {
      var t = c && T[c.t | 0]; if (!t) return null;
      var b = t.branches[c.b | 0]; if (!b || (c.b | 0) !== c.b) return null;
      var s = Number(c.s); if (!isFinite(s)) return null;
      var a = Number(c.a); if (!isFinite(a)) a = 0;
      return { t: t.index, b: b.id, s: Math.round(clamp(s, 0, b.len) * 1000) / 1000, a: Math.round(clamp(a, -60, 60)), m: c.m === 3 ? 3 : 1 };
    }).filter(Boolean);
  }

  function scoreAll(rawCuts) {
    var cuts = sanitise(rawCuts);
    var res = trees().map(function (t) { return scoreTree(t, cuts); });
    var total = res.reduce(function (a, r) { return a + r.points.total; }, 0);
    return { version: VERSION, total: Math.round(total), trees: res, cuts: cuts };
  }

  // Nearest branch to a world point (UI helper). Prefers the thinnest branch among near-equal hits.
  function pick(tree, keep, x, y, tol) {
    var best = null;
    tree.branches.forEach(function (b, i) {
      var L = keep ? keep[i] : b.len; if (L < 0) return;
      for (var k = 1; k < b.pts.length && b.cum[k - 1] < L; k++) {
        var a = b.pts[k - 1], q = b.pts[k];
        var dx = q[0] - a[0], dy = q[1] - a[1], LL = dx * dx + dy * dy;
        var t = LL ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / LL, 0, 1) : 0;
        var s = b.cum[k - 1] + t * (b.cum[k] - b.cum[k - 1]);
        if (s > L) continue;
        var dd = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)) - diamAt(tree, b, s) / 2;
        if (dd < tol && (!best || dd < best.dist - 0.02)) best = { b: i, s: s, dist: dd };
      }
    });
    return best;
  }

  return {
    VERSION: VERSION, SCENE: SCENE, K: K, W: W, trees: trees, pointAt: pointAt, diamAt: diamAt,
    idealRemoval: idealRemoval, idealReduction: idealReduction, analyseCut: analyseCut,
    retainedLengths: retainedLengths, isRedundant: isRedundant, clearance: clearance,
    scoreTree: scoreTree, scoreAll: scoreAll, sanitise: sanitise, pick: pick
  };
})();
if (typeof module !== 'undefined') module.exports = LineClear;

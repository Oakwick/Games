/* Fungi Detective — builds the tree scene for one tree in one of three views:
 *   'find'  a close look at the tree (no labels) — tap the fungus
 *   'elev'  stepped back: the whole tree, the line and a scale bar — for the category and action
 *   'close' the close-up of the fungus for naming it
 * Returns { svg, view, hits, box }. Units are metres; SVG y = minus height. */
var FungiScene = (function () {
  'use strict';
  var A = FungiArt, q = A.q, q1 = A.q1, clamp = A.clamp, lerp = A.lerp, smooth = A.smooth, blob = A.blob, rr = A.rr;
  var FS = 1.4; // fungi are drawn a little larger than life so they can be found
  // Overhead lines by voltage. Each conductor is [across, height] in metres, measured across from the conductor
  // nearest the tree. `post` is how far the pole or tower centre sits beyond that conductor.
  var LINES = {
    11: { kind: 'pole', top: 10.2, post: 0.8, arm: 1.0, cond: [[0, 9], [0.8, 9], [1.6, 9]] },
    33: { kind: 'pole', top: 11.9, post: 1.2, arm: 1.45, cond: [[0, 10.5], [1.2, 10.5], [2.4, 10.5]] },
    132: { kind: 'tower', top: 26.5, post: 4.8, arm: 5.4, cond: [[0.6, 12.2], [0, 16.2], [1.2, 20.2], [9, 12.2], [9.6, 16.2], [8.4, 20.2]] },
    // low voltage: four open wires, one above the other, on the tree side of the pole
    LV: { kind: 'lv', label: 'LV', top: 8.6, post: 0.3, arm: 0.35, cond: [[0, 7.9], [0, 7.6], [0, 7.3], [0, 7.0]] }
  };
  function lineGeo(kv, dist) {
    var L = LINES[kv] ? LINES[kv] : LINES[11], low = 1e9;
    var cond = L.cond.map(function (c) { if (c[1] < low) low = c[1]; return [dist + c[0], c[1]]; });
    var k = !LINES[kv] ? 11 : isNaN(+kv) ? kv : +kv;
    return { kv: k, label: L.label || k + 'kV', kind: L.kind, top: L.top, x: dist + L.post, arm: L.arm, cond: cond, low: low };
  }
  // half-width of the crown at height y (side > 0 is the line side)
  function crownHalf(t, y, side) {
    var u = (y - t.base) / (t.height - t.base), f = u < 0 || u > 1 ? 0 : u < 0.12 ? 0.72 + u / 0.12 * 0.28 : u < 0.5 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) / 0.5, 2)));
    return (side > 0 ? t.spread : t.back) * f;
  }

  function geo(t) {
    var g = { r0: t.dbh / 2, H: t.height, b: t.base, sp: t.spread, bk: t.back };
    g.line = lineGeo(t.kv, t.dist == null ? 500 : t.dist); g.pole = g.line.x;
    g.stemTop = -Math.min(t.base + (t.height - t.base) * 0.4, t.height * 0.7);
    if (t.limb) {
      var x0 = g.r0 * 0.7, y0 = -t.limb.from, x1 = t.limb.x, y1 = -t.limb.y;
      g.limb = { x0: x0, y0: y0, x1: x1, y1: y1, cx: lerp(x0, x1, 0.45), cy: Math.min(y0, y1) - 0.4 };
    }
    return g;
  }
  function limbAt(L, u) { var a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; return [a * L.x0 + b * L.cx + c * L.x1, a * L.y0 + b * L.cy + c * L.y1]; }

  // where the fungus sits (metres); the first entry is the one the close-up looks at
  function places(t, g) {
    var r0 = g.r0;
    switch (t.art) {
      case 'rosette': return [{ x: 0.04, y: 0.02, s: 1 }];
      case 'crust': return [{ x: r0 * 0.6, y: -0.05, s: 1 }];
      case 'tiers': return [{ x: r0 * 0.15, y: -3, s: 1 }];
      case 'shelf': return [{ x: r0 * 0.25, y: -0.04, s: 1.1 }];
      case 'tongue': return [{ x: r0 * 0.25, y: -0.85, s: 1.15 }];
      case 'tufts': return [{ x: 0, y: 0.03, s: 1 }];
      case 'hairy': return [{ x: r0 * 0.75, y: -t.limb.from + 0.32, s: 1 }];
      case 'scaly': var p = limbAt(g.limb, 0.42); return [{ x: p[0], y: p[1] + 0.16, s: 1 }];
      case 'hoof': return [{ x: r0 * 0.7, y: -3.2, s: 1 }, { x: -r0 * 0.7, y: -2.2, s: 0.85, flip: true }, { x: r0 * 0.7, y: -4.3, s: 0.75 }];
      case 'ears': return [{ x: 0.85, y: -1.66, s: 1.2 }];
    }
    return [{ x: 0, y: -1, s: 1 }];
  }
  function fungusBox(t, pl) {
    var R = A.rng(1), c = new A.Ctx('tmp', 100), b = A.FUNGUS[t.art](c, R).box, k = 0.01 * FS * pl.s;
    var x0 = b[0], x1 = b[2]; if (pl.flip) { x0 = -b[2]; x1 = -b[0]; }
    return { x0: pl.x + x0 * k, y0: pl.y + b[1] * k, x1: pl.x + x1 * k, y1: pl.y + b[3] * k };
  }

  // Where the tree comes closest to a conductor: { p: point on the tree, c: conductor, d: metres between them }
  function nearest(t, g) {
    var pts = [[0, t.height]], y, best = { d: 1e9 };
    for (y = t.base; y <= t.height; y += 0.1) pts.push([crownHalf(t, y, 1), y], [-crownHalf(t, y, -1), y]);
    if (g.limb) for (var a = 0; a < 6.3; a += 0.3) pts.push([t.limb.x + Math.cos(a) * 0.7, t.limb.y + 0.4 + Math.sin(a) * 0.7], [t.limb.x, t.limb.y]);
    g.line.cond.forEach(function (c) { pts.forEach(function (p) { var d = Math.sqrt(Math.pow(p[0] - c[0], 2) + Math.pow(p[1] - c[1], 2)); if (d < best.d) best = { p: p, c: c, d: d }; }); });
    return best;
  }

  // ---------------- views ----------------
  function findView(t, g, fb) {
    var Hf = Math.min(t.spot === 'base' ? 2.9 : 4.0, t.height + 1.2), w = Hf * 1.5, yc = -(fb.y0 + fb.y1) / 2;
    var low = yc - 0.4 * Hf < 2.2 ? -0.45 : yc - 0.45 * Hf;
    var x0 = t.spot === 'limb' || t.spot === 'high' ? (fb.x0 + fb.x1) / 2 - 0.45 * w : -0.47 * w;
    if (fb.x1 + 0.5 > x0 + w) x0 = fb.x1 + 0.5 - w;
    if (fb.x0 - 0.5 < x0) x0 = fb.x0 - 0.5;
    if (-fb.y0 + 0.3 > low + Hf) low = -fb.y0 + 0.3 - Hf;
    return { x: x0, y: -(low + Hf), w: w, h: Hf };
  }
  function elevView(t, g, pxw) {
    var L = g.line, reach = Math.max(g.sp, g.limb ? g.limb.x1 : 0);
    var left = g.bk + 2.2, right = Math.max(g.pole + L.arm + 2.4, reach + 1.5), top = Math.max(g.H, L.top + 0.3) + 1.2, bottom = 3.4, w, h;
    function fit() { w = left + right; h = top + bottom; if (w / h < 1.5) { var nw = h * 1.5; left += (nw - w) * 0.45; right += (nw - w) * 0.55; w = nw; } else { h = w / 1.5; top = h - bottom; } }
    // leave room for the labels at the sides and underneath, whatever the zoom
    for (var k = 0; k < 4; k++) {
      fit();
      var fs = labelSize(w, pxw), needL = g.bk + 1.1 + fs * 4.4, needR = g.pole + L.arm + 0.5 + fs * 5.2, needB = fs * 3.6, changed = false;
      if (left < needL) { left = needL; changed = true; }
      if (right < needR) { right = needR; changed = true; }
      if (bottom < needB) { bottom = needB; changed = true; }
      if (!changed) break;
    }
    fit();
    return { x: -left, y: -top, w: w, h: h };
  }
  // a closer look at the gap between the tree and the line, with a finer scale bar
  function zoomView(t, g) {
    var n = nearest(t, g), far = n.d > 9, cx = far ? n.c[0] - 3 : (n.p[0] + n.c[0]) / 2, cy = far ? n.c[1] : (n.p[1] + n.c[1]) / 2;
    var w = t.zoomW || clamp(n.d * 2.6, 13, 17), h = w / 1.5;
    return { x: cx - w / 2, y: -cy - h * 0.52, w: w, h: h };
  }
  // the whole tree on its own (no line, no labels), with room on the right for something to judge it against
  function plainView(t, g) {
    var left = g.bk + 1.6, right = g.sp + 4.4, top = g.H + 1.2, bottom = 2.4, w = left + right, h = top + bottom;
    if (w / h < 1.5) { var nw = h * 1.5; left += (nw - w) * 0.5; right += (nw - w) * 0.5; w = nw; } else { h = w / 1.5; top = h - bottom; }
    return { x: -left, y: -top, w: w, h: h };
  }
  function closeView(fb) {
    var w = Math.max((fb.x1 - fb.x0) * 1.55, (fb.y1 - fb.y0) * 1.7 * 1.92, 0.42), h = w / 1.92;
    return { x: (fb.x0 + fb.x1) / 2 - w / 2, y: (fb.y0 + fb.y1) / 2 - h / 2, w: w, h: h };
  }

  // ---------------- pieces ----------------
  function backdrop(c, R, V) {
    var h = '', hz = -1.1, x0 = V.x - 5, x1 = V.x + V.w + 5;
    h += '<rect x="' + q(x0) + '" y="' + q(V.y - 5) + '" width="' + q(x1 - x0) + '" height="' + q(hz - V.y + 5.1) + '" fill="' + c.linear([[0, 'var(--sky-top)'], [1, 'var(--sky-bottom)']], 0, -30, 0, hz) + '"/>';
    // far hills and tree line, hazy
    var P = [[x0, hz]]; for (var x = x0; x <= x1 + 4; x += 4) P.push([x, hz - 3.5 - 2.5 * Math.sin(x * 0.11) - 1.5 * Math.sin(x * 0.37 + 1)]); P.push([x1 + 4, hz]);
    h += '<path d="' + smooth(P, true) + '" fill="var(--hill)" opacity=".75"/>';
    var tl = '';
    for (x = x0; x <= x1; x += 1.6 + R() * 1.5) { var hh = 2.5 + R() * 4.5; tl += '<ellipse cx="' + q(x) + '" cy="' + q(hz - hh * 0.55) + '" rx="' + q(1.5 + R() * 1.6) + '" ry="' + q(hh * 0.55) + '" fill="' + A.pick(R, ['#6b7450', '#77734a', '#847247', '#626f4b', '#8a7650']) + '"/>'; }
    h += '<g filter="' + c.f('haze') + '" opacity=".7">' + tl + '</g>';
    // hedge along the field edge
    var hg = '';
    for (x = x0; x <= x1; x += 0.5 + R() * 0.5) hg += '<ellipse cx="' + q(x) + '" cy="' + q(hz - 0.6 - R() * 0.4) + '" rx="' + q(0.6 + R() * 0.5) + '" ry="' + q(0.7 + R() * 0.4) + '" fill="' + A.pick(R, ['#56653a', '#62703e', '#70703f', '#525d38', '#7d6c3c']) + '"/>';
    h += '<g filter="' + c.f('leafy') + '">' + hg + '</g>';
    // field and foreground ground
    h += '<rect x="' + q(x0) + '" y="' + q(hz) + '" width="' + q(x1 - x0) + '" height="' + q(-hz) + '" fill="' + c.linear([[0, '#8c9c62'], [1, '#748846']], 0, hz, 0, 0) + '"/>';
    h += '<rect x="' + q(x0) + '" y="0" width="' + q(x1 - x0) + '" height="' + q(Math.max(6, V.y + V.h + 2)) + '" fill="' + c.linear([[0, '#637a3c'], [0.3, '#566d34'], [1, '#42562b']], 0, 0, 0, 3) + '"/>';
    return h;
  }
  function grass(c, R, V, near) {
    var h = '', n = Math.min(900, Math.round(V.w * (near ? 60 : 22))), cols = ['#56703a', '#6a8442', '#7d9049', '#49602f', '#8f9f55'];
    for (var i = 0; i < n; i++) {
      var x = V.x + R() * V.w, y = R() * 0.5, ht = (0.06 + R() * 0.22) * (near ? 1 : 1.3), lean = (R() - 0.5) * ht * 0.8;
      h += '<path d="M' + q(x - 0.008) + ' ' + q(y) + ' Q' + q(x + lean * 0.3) + ' ' + q(y - ht * 0.6) + ' ' + q(x + lean) + ' ' + q(y - ht) + ' Q' + q(x + lean * 0.3 + 0.01) + ' ' + q(y - ht * 0.6) + ' ' + q(x + 0.008) + ' ' + q(y) + 'Z" fill="' + A.pick(R, cols) + '"/>';
    }
    return h;
  }
  // fallen leaves: a pointed oval, lit on one side, with a midrib (the same treatment as the ivy)
  function fallenLeaf(R, x, y, s, col) {
    var rot = Math.round(R() * 360), k = 0.38 + R() * 0.2;
    return '<g transform="translate(' + q(x) + ' ' + q(y) + ') rotate(' + rot + ') scale(' + q(s) + ' ' + q(s * k) + ')"><path d="M-1 0 Q0 -1.15 1 0 Q0 1.15 -1 0Z" fill="' + col + '"/><path d="M-1 0 Q0 -1.15 1 0Z" fill="#fff" opacity=".16"/><path d="M-0.95 0 L0.95 0" stroke="#3a2a18" stroke-width="0.09" opacity=".45"/></g>';
  }
  function litter(c, R, t, g, V) {
    var h = '', pal = A.LEAF[t.shape].concat(['#6d4a24', '#8a5a2a']), n = 140;
    for (var i = 0; i < n; i++) {
      var x = rr(R, -g.bk * 0.9, g.sp * 0.9), y = 0.03 + Math.pow(R(), 1.6) * 1.4, s = 0.05 + R() * 0.05;
      if (x < V.x - 1 || x > V.x + V.w + 1) continue;
      h += fallenLeaf(R, x, y, s, A.pick(R, pal));
    }
    return '<g filter="' + c.f('cast') + '">' + h + '</g>';
  }
  function taper(x0, y0, x1, y1, w0, w1, bx, by) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    var mx = (x0 + x1) / 2 + (bx || 0), my = (y0 + y1) / 2 + (by || 0), wm = (w0 + w1) / 2;
    return 'M' + q(x0 + nx * w0 / 2) + ' ' + q(y0 + ny * w0 / 2) + ' Q' + q(mx + nx * wm / 2) + ' ' + q(my + ny * wm / 2) + ' ' + q(x1 + nx * w1 / 2) + ' ' + q(y1 + ny * w1 / 2) +
      ' L' + q(x1 - nx * w1 / 2) + ' ' + q(y1 - ny * w1 / 2) + ' Q' + q(mx - nx * wm / 2) + ' ' + q(my - ny * wm / 2) + ' ' + q(x0 - nx * w0 / 2) + ' ' + q(y0 - ny * w0 / 2) + 'Z';
  }
  // Drawn bark for each species, between the bottom and top of what's in view.
  function barkStrokes(R, t, g, V) {
    var r0 = g.r0, h = '', sh = t.shape, yTop = Math.max(g.stemTop, V.y - 0.5), yBot = Math.min(0.05, V.y + V.h + 0.5);
    if (yBot <= yTop) return '';
    var k = clamp(V.w / 5, 1, 6), x, y, n, i;      // coarser when stepped back
    var dark = sh === 'birch' ? '#3a352f' : sh === 'cherry' ? '#2c1611' : sh === 'beech' || sh === 'ash' ? '#3f4440' : '#2f251c';
    var light = sh === 'cherry' ? '#c08d72' : sh === 'beech' || sh === 'ash' ? '#c4c8be' : '#b9a58c';
    function wavy(x0, y0, len, amp) { var P = [], m = 4; for (var j = 0; j <= m; j++) P.push([x0 + (R() - 0.5) * amp, y0 - len * j / m]); return smooth(P, false); }
    if (sh === 'oak' || sh === 'elder' || sh === 'sycamore' && false) {
      var step = (sh === 'elder' ? 0.022 : 0.045) * k, seg = sh === 'elder' ? 0.22 : 0.55;
      for (x = -r0 * 1.6; x <= r0 * 1.6; x += step * (0.7 + R() * 0.6)) for (y = yBot + R() * seg; y > yTop; ) {
        var len = seg * (0.5 + R()), wd = step * (0.18 + R() * 0.32), d = wavy(x, y, len, step * 0.7);
        h += '<path d="' + d + '" stroke="' + dark + '" stroke-width="' + q(wd) + '" fill="none" stroke-linecap="round" opacity="' + q(0.35 + R() * 0.3) + '"/>';
        h += '<path d="' + d + '" stroke="' + light + '" stroke-width="' + q(wd * 0.5) + '" fill="none" stroke-linecap="round" opacity=".22" transform="translate(' + q(-wd * 0.9) + ' 0)"/>';
        y -= len + seg * (0.15 + R() * 0.5);
      }
    } else if (sh === 'ash') {
      var sx = 0.05 * k, sy = 0.15 * k, row = 0;
      for (y = yBot; y > yTop; y -= sy * 0.5, row++) for (x = -r0 * 1.3 + (row % 2) * sx * 0.5; x <= r0 * 1.3; x += sx) {
        var cx = x + (R() - 0.5) * sx * 0.3, cy = y + (R() - 0.5) * sy * 0.2, hw = sx * 0.22, hh = sy * 0.42;
        h += '<path d="M' + q(cx) + ' ' + q(cy - hh) + ' Q' + q(cx + hw) + ' ' + q(cy) + ' ' + q(cx) + ' ' + q(cy + hh) + ' Q' + q(cx - hw) + ' ' + q(cy) + ' ' + q(cx) + ' ' + q(cy - hh) + 'Z" fill="' + dark + '" opacity="' + q(0.3 + R() * 0.2) + '"/>';
      }
    } else if (sh === 'sycamore') {
      n = Math.round((yBot - yTop) * r0 * 2 * 130 / (k * k));
      for (i = 0; i < n; i++) { var px = (R() - 0.5) * r0 * 2.4, py = yTop + R() * (yBot - yTop), pr = (0.025 + R() * 0.035) * k; h += '<path d="' + smooth(blob(R, px, py, pr, pr * (0.7 + R() * 0.5), 7, 0.25), true) + '" fill="' + (R() < 0.5 ? light : dark) + '" fill-opacity=".16" stroke="' + dark + '" stroke-width="' + q(0.004 * k) + '" stroke-opacity=".45"/>'; }
    } else {
      // beech, cherry and birch: smooth bark with fine horizontal wrinkles and lenticels
      var gap = (sh === 'beech' ? 0.11 : 0.05) * k;
      for (y = yBot; y > yTop; y -= gap * (0.5 + R())) {
        var wl = r0 * (sh === 'beech' ? 0.2 + R() * 0.7 : 0.15 + R() * 0.45), wx = (R() - 0.5) * r0 * 2;
        h += '<path d="M' + q(wx) + ' ' + q(y) + ' q' + q(wl * 0.5) + ' ' + q((R() - 0.5) * 0.02) + ' ' + q(wl) + ' 0" stroke="' + (sh === 'cherry' && R() < 0.5 ? light : dark) + '" stroke-width="' + q((sh === 'cherry' ? 0.012 : 0.006) * k) + '" fill="none" stroke-linecap="round" opacity="' + q(sh === 'birch' ? 0.6 : 0.3 + R() * 0.2) + '"/>';
      }
    }
    return h;
  }
  function trunk(c, R, t, g, V) {
    var B = A.BARK[t.shape].col, r0 = g.r0, h = '', paths = [], limbs = [];
    var grad = c.linear([[0, B[0]], [0.22, B[1]], [0.42, B[2]], [0.78, B[3]], [1, B[0]]], -r0 * 1.05, 0, r0 * 1.05, 0);
    if (t.shape === 'elder') {
      [[-0.18, -0.9, -1.2], [-0.05, -0.3, -0.1], [0.08, 0.5, 0.7], [0.16, 1.1, 1.3], [0, 0.1, 0.4]].forEach(function (s, i) {
        paths.push(taper(s[0], 0.02, s[1] * 0.6, -t.height * 0.75, 0.11 - i * 0.008, 0.035, s[2] * 0.25, 0));
      });
      // dead branch for the jelly ear
      paths.push(taper(0.05, -1.45, 1.35, -1.78, 0.075, 0.03, 0, -0.08));
    } else {
      var L = [], Rt = [], top = g.stemTop, fl = r0 * (t.shape === 'birch' ? 0.25 : 0.5);
      L.push([-r0 - fl, 0.04], [-r0 - fl * 0.45, -0.12]); Rt.push([r0 + fl, 0.04], [r0 + fl * 0.45, -0.12]);
      for (var i = 0; i <= 8; i++) {
        var u = i / 8, y = lerp(-0.45, top, u), w = r0 * (1.02 - (t.shape === 'birch' ? 0.45 : 0.25) * u);
        L.push([-w + (R() - 0.5) * r0 * 0.06, y]); Rt.push([w + (R() - 0.5) * r0 * 0.06, y]);
      }
      paths.push(smooth(L.concat(Rt.reverse()), true));
      // root buttresses
      for (var k = 0; k < 4; k++) { var side = k % 2 ? 1 : -1, rx = side * (r0 + fl * (0.6 + R() * 0.8)); paths.push(smooth(blob(R, rx, 0.02, fl * (0.5 + R() * 0.4), 0.09, 8, 0.15), true)); }
      if (t.shape === 'birch') paths.push(taper(0, top + 0.1, 0.1, -t.height + 0.6, r0 * 1.0, 0.03, 0.1, 0));
      // main limbs into the crown
      var b = t.base, H = t.height;
      [[g.sp * 0.6, b + (H - b) * 0.42, 0.75], [-g.bk * 0.6, b + (H - b) * 0.48, 0.75], [g.sp * 0.15, b + (H - b) * 0.85, 0.6], [-g.bk * 0.25, b + (H - b) * 0.75, 0.55]].forEach(function (m) {
        var dx = m[0], dy = -m[1] - (top + r0 * 0.3), ln = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / ln, ny = dx / ln, w = r0 * 0.7 * m[2], mx = dx * 0.3, my = top + r0 * 0.3 + dy * 0.3;
        limbs.push('<path d="' + taper(0, top + r0 * 0.3, m[0], -m[1], r0 * 1.3 * m[2], 0.05, 0, -(m[1] - b) * 0.08) + '" fill="' + c.linear([[0, B[3]], [0.5, B[1]], [1, B[0]]], mx + nx * w, my + ny * w, mx - nx * w, my - ny * w) + '"/>');
      });
    }
    h += '<ellipse cx="0" cy="0.08" rx="' + q(r0 * 2.8 + 0.4) + '" ry="0.16" fill="#000" opacity=".35" filter="' + c.f('soft') + '"/>';
    h += limbs.join('') + paths.map(function (d) { return '<path d="' + d + '" fill="' + grad + '"/>'; }).join('');
    // the bark is drawn with strokes, like the moss, grass and leaf veins, and clipped to the stem
    var clipId = c.uid('tc');
    c.defs.push('<clipPath id="' + clipId + '">' + paths.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</clipPath>');
    h += '<g clip-path="url(#' + clipId + ')">' + barkStrokes(A.rng(A.hash(t.id + 'bark')), t, g, V) + '</g>';
    // species marks
    var mk = '';
    if (t.shape === 'birch') {
      for (var j = 0; j < 140; j++) { var yy = -0.3 - R() * (t.height * 0.85), ww = r0 * (1 - 0.4 * (-yy / t.height)); mk += '<rect x="' + q((R() - 0.5) * ww * 1.6) + '" y="' + q(yy) + '" width="' + q(0.03 + R() * 0.06) + '" height="' + q(0.008 + R() * 0.008) + '" fill="#2b2826" opacity=".75"/>'; }
      mk += '<path d="' + smooth(blob(R, 0, -0.35, r0 * 1.05, 0.42, 12, 0.18), true) + '" fill="#2f2a25" opacity=".75"/>';
      [-2.7, -3.9, -5.2].forEach(function (yv) { mk += '<path d="M' + q(-r0 * 0.5) + ' ' + q(yv) + ' l' + q(r0 * 0.35) + ' -0.12 l' + q(r0 * 0.35) + ' 0.12 l' + q(-r0 * 0.35) + ' 0.12Z" fill="#25211e" opacity=".8"/>'; });
    }
    if (t.shape === 'cherry') for (var j2 = 0; j2 < 90; j2++) { var y2 = -0.4 - R() * 3.8; mk += '<rect x="' + q((R() - 0.5) * r0 * 1.7) + '" y="' + q(y2) + '" width="' + q(0.04 + R() * 0.07) + '" height="0.012" fill="#c79a7a" opacity=".55"/>'; }
    if (t.shape === 'beech') for (var bm = 0; bm < 9; bm++) mk += '<path d="' + smooth(blob(R, (R() - 0.5) * r0 * 1.4, -0.4 - R() * 3.2, r0 * (0.12 + R() * 0.15), 0.12 + R() * 0.25, 9, 0.3), true) + '" fill="' + (R() < 0.5 ? '#4d5452' : '#b0b4ac') + '" opacity=".14" filter="' + c.f('fuzz') + '"/>';
    if (t.shape === 'beech') mk += '<path d="' + smooth(blob(R, -r0 * 0.55, -1.6, r0 * 0.35, 1.4, 10, 0.2), true) + '" fill="#6f8a3c" opacity=".28" filter="' + c.f('fuzz') + '"/>';
    if (t.id === 'T5') mk += '<path d="' + smooth(blob(R, r0 * 0.15, -0.22, r0 * 0.3, 0.12, 10, 0.2), true) + '" fill="#c9b48e" opacity=".9"/><path d="' + smooth(blob(R, r0 * 0.15, -0.22, r0 * 0.22, 0.07, 10, 0.2), true) + '" fill="#8e7652" opacity=".8"/>';
    return h + mk;
  }
  function limbSvg(c, t, g) {
    if (!g.limb) return '';
    var B = A.BARK[t.shape].col, L = g.limb, r0 = g.r0, R = A.rng(A.hash(t.id + 'limb'));
    var m = limbAt(L, 0.3), e = limbAt(L, 0.35), dx = e[0] - m[0], dy = e[1] - m[1], len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
    var d = taper(L.x0 - r0 * 0.4, L.y0 + r0 * 0.5, L.x1, L.y1, r0 * 1.0, 0.08, L.cx - (L.x0 + L.x1) / 2, L.cy - (L.y0 + L.y1) / 2), id = c.uid('lc'), st = '';
    c.defs.push('<clipPath id="' + id + '"><path d="' + d + '"/></clipPath>');
    // the limb curves, so it's shaded with strokes that follow it: shadow underneath, light along the top
    var mid = 'M' + q(L.x0 - r0 * 0.4) + ' ' + q(L.y0 + r0 * 0.5) + ' Q' + q(L.cx) + ' ' + q(L.cy) + ' ' + q(L.x1) + ' ' + q(L.y1), W = r0 * 1.1;
    st += '<path d="' + mid + '" stroke="' + B[1] + '" stroke-width="' + q(W * 0.75) + '" fill="none" transform="translate(' + q(-nx * W * 0.14) + ' ' + q(-ny * W * 0.14) + ')"/>';
    st += '<path d="' + mid + '" stroke="' + B[2] + '" stroke-width="' + q(W * 0.3) + '" fill="none" transform="translate(' + q(-nx * W * 0.24) + ' ' + q(-ny * W * 0.24) + ')" opacity=".9"/>';
    for (var i = 0; i < 60; i++) {
      var u = R() * 0.9, p = limbAt(L, u), p2 = limbAt(L, Math.min(1, u + 0.04 + R() * 0.06)), off = (R() - 0.5) * r0 * 0.8 * (1 - u * 0.8);
      st += '<path d="M' + q(p[0] + nx * off) + ' ' + q(p[1] + ny * off) + ' L' + q(p2[0] + nx * off) + ' ' + q(p2[1] + ny * off) + '" stroke="' + (t.shape === 'ash' || t.shape === 'beech' ? '#3f4440' : '#2f251c') + '" stroke-width="' + q(0.008 + R() * 0.012) + '" opacity="' + q(0.25 + R() * 0.25) + '" stroke-linecap="round"/>';
    }
    return '<path d="' + d + '" fill="' + B[0] + '"/><g clip-path="url(#' + id + ')">' + st + '</g>';
  }
  // A bare winter crown: limbs that fork again and again inside the crown's outline, then a twig out to every
  // tip on the outline itself (so the outline is exactly where the category is judged from).
  var TWIG = { beech: '#4b4744', oak: '#3b332b', sycamore: '#4d4840', ash: '#55574e', cherry: '#4a2c26', birch: '#4a3536', elder: '#5e5240' };
  var HABIT = {   // lean: how upright the limbs start (0 = flat, 1 = straight up); fork: spread of each fork; kink: crookedness
    beech: { lean: 0.62, fork: 0.42, kink: 0.1 }, oak: { lean: 0.38, fork: 0.6, kink: 0.3 }, sycamore: { lean: 0.5, fork: 0.5, kink: 0.16 },
    ash: { lean: 0.6, fork: 0.45, kink: 0.14 }, cherry: { lean: 0.6, fork: 0.45, kink: 0.1 }, birch: { lean: 0.72, fork: 0.36, kink: 0.1 }, elder: { lean: 0.5, fork: 0.6, kink: 0.3 }
  };
  function winterCrown(c, R, t, g, V, fine) {
    var b = t.base, H = t.height, B = A.BARK[t.shape].col, r0 = g.r0, sh = t.shape, tw = TWIG[sh] || '#453c34', hb = HABIT[sh] || HABIT.sycamore, h = '', i, y;
    function half(yy, side) { return crownHalf(t, yy, side); }
    function inside(x, yy, k) { return yy >= b * 0.9 && yy <= H && Math.abs(x) <= half(yy, x) * (k || 0.97); }
    var top = -g.stemTop, size = Math.min((g.sp + g.bk) / 2, (H - b) / 2), lean = (g.sp - g.bk) * 0.06;
    var pts = [], thick = '', thin = '', px = 1 / (c.ppm || 20);   // px: one screen pixel in metres, so twigs never get too fine to see
    // one limb or branch: a tapered curve from (x, y), heading `ang` from straight up, that forks at its end
    function grow(x, yy, ang, len, w, depth) {
      var ex = x + Math.sin(ang) * len, ey = yy + Math.cos(ang) * len, tries = 0;
      while (!inside(ex, ey) && tries++ < 7) { len *= 0.8; ex = x + Math.sin(ang) * len; ey = yy + Math.cos(ang) * len; }
      if (len < 0.25) return;
      var w1 = Math.max(0.02, px * 1.3, w * 0.6), k = (R() - 0.5) * hb.kink * len, bx = Math.cos(ang) * k, by = -Math.sin(ang) * k - len * 0.03;
      var d = taper(x, -yy, ex, -ey, w, w1, bx, -by);
      if (w > 0.07) thick += '<path d="' + d + '" fill="' + (w > 0.16 ? B[depth % 2 ? 3 : 1] : B[0]) + '"/>'; else thin += '<path d="' + d + '" fill="' + tw + '"/>';
      for (var j = 1; j <= 4; j++) { var u = j / 4; pts.push([lerp(x, ex, u) + bx * 2 * u * (1 - u), lerp(yy, ey, u) + by * 2 * u * (1 - u), lerp(w, w1, u)]); }
      if (w1 < 0.03 || depth > 5) return;
      var n = R() < 0.3 ? 3 : 2;
      for (j = 0; j < n; j++) {
        var da = (j === 0 ? -1 : j === 1 ? 1 : 0) * rr(R, hb.fork * 0.5, hb.fork) + (R() - 0.5) * 0.2;
        // each fork reaches a little more upwards, towards the light
        grow(ex, ey, (ang + da) * (0.86 + R() * 0.1), len * rr(R, 0.62, 0.85), w1 * (j === 2 ? 0.7 : 0.95), depth + 1);
      }
    }
    // a soft haze of fine twigs, so the extent of the crown reads at a glance
    var O = [];
    for (y = b; y <= H; y += (H - b) / 16) O.push([half(y, 1), -y]);
    O.push([0, -H]);
    for (y = H; y >= b; y -= (H - b) / 16) O.push([-half(y, -1), -y]);
    h += '<path d="' + smooth(O, true) + '" fill="' + tw + '" opacity=".1" filter="' + c.f('leafy') + '"/>';
    // the leader carries on up from the stem; the main limbs leave it at uneven heights, lower ones flatter
    var nl = Math.round(clamp((H - b) / 2.2, 4, 9)), ly = Math.max(b * 0.95, 1.1), lw = r0 * 1.5, segs = 5, lpx = 0, lpy = top - r0 * 0.4, lead = '';
    for (i = 1; i <= segs; i++) {
      var u2 = i / segs, nx2 = lean * u2 + (i < segs ? (R() - 0.5) * size * 0.08 : 0), ny2 = lerp(top - r0 * 0.4, H - 0.3, u2), wa = lerp(lw, 0.05, (i - 1) / segs), wb = lerp(lw, 0.05, u2);
      lead += '<path d="' + taper(lpx, -lpy, nx2, -ny2, wa, wb, 0, 0) + '" fill="' + B[1] + '"/>';
      for (var j2 = 1; j2 <= 4; j2++) pts.push([lerp(lpx, nx2, j2 / 4), lerp(lpy, ny2, j2 / 4), lerp(wa, wb, j2 / 4)]);
      lpx = nx2; lpy = ny2;
    }
    for (i = 0; i < nl; i++) {
      var u = (i + R() * 0.7) / nl, side = (i % 2 ? 1 : -1) * (R() < 0.12 ? -1 : 1), ys = lerp(ly, H * 0.8, Math.pow(u, 1.15));
      var ang = side * lerp(1.45 - hb.lean * 1.05, 0.3, u) * rr(R, 0.85, 1.15), reach = half(Math.min(H - 0.5, ys + (H - ys) * 0.35), side);
      grow(lean * ys / H, ys, ang, Math.max(1, reach * rr(R, 0.6, 0.85)), clamp(r0 * lerp(0.95, 0.3, u), 0.06, 0.6), 0);
    }
    // a low limb each side, reaching out under the widest part of the crown
    [1, -1].forEach(function (sd) { var y0 = Math.max(b * 0.95, 1.1) + rr(R, 0, (H - b) * 0.06); grow(0, y0, sd * rr(R, 1.15, 1.35), half(b + (H - b) * 0.2, sd) * rr(R, 0.7, 0.85), clamp(r0 * 0.7, 0.06, 0.45), 1); });
    // a twig out to every tip on the outline, and more inside the crown
    var step = clamp(size * (fine ? 0.06 : 0.085), 0.2, 0.7), tips = [];
    for (y = b + step; y < H; y += step * rr(R, 0.7, 1.3)) [1, -1].forEach(function (sd) { var hw = half(y, sd); if (hw > 0.3) tips.push([sd * hw, y, 1]); });
    tips.push([lean, H, 1]);
    var nIn = Math.round((g.sp + g.bk) * (H - b) / (step * step * (fine ? 5 : 9)));
    for (i = 0; i < nIn; i++) { var yy2 = lerp(b + step, H - step, R()), sd2 = R() < 0.5 ? 1 : -1; tips.push([sd2 * half(yy2, sd2) * Math.sqrt(R()) * 0.95, yy2, 0]); }
    var drop = '', sw = q(Math.max(fine ? 0.016 : 0.024, px * 1.1));
    tips.forEach(function (tp) {
      var best = null, bd = 1e9;
      pts.forEach(function (p) { var up = p[1] > tp[1] ? 2.2 : 0.8, d = Math.pow(p[0] - tp[0], 2) + Math.pow(p[1] - tp[1], 2) * up; if (d < bd) { bd = d; best = p; } });
      if (!best) return;
      var dx = tp[0] - best[0], dy = tp[1] - best[1], ln = Math.sqrt(dx * dx + dy * dy) || 1, w0 = Math.max(px * 1.6, clamp(Math.min(best[2] * 0.7, ln * 0.03), 0.02, 0.09));
      var bend = [-dy * rr(R, -0.14, 0.14), dx * rr(R, -0.14, 0.14) - ln * 0.05];
      thin += '<path d="' + taper(best[0], -best[1], tp[0], -tp[1], w0, Math.max(0.012, px * 0.9), bend[0], -bend[1]) + '" fill="' + tw + '"/>';
      for (var k = 0; k < 3; k++) {
        var f = rr(R, 0.35, 0.95), qx = lerp(best[0], tp[0], f) + bend[0] * 2 * f * (1 - f), qy = lerp(best[1], tp[1], f) + bend[1] * 2 * f * (1 - f);
        var an = Math.atan2(dx, dy) + (R() < 0.5 ? -1 : 1) * rr(R, 0.4, 1), tl = Math.min(ln * 0.5, rr(R, 0.3, 0.8) * clamp(size / 4, 0.6, 1.5));
        var ex = qx + Math.sin(an) * tl, ey = Math.min(H, qy + Math.cos(an) * tl);
        if (ey < b) continue;
        var lim = half(ey, ex) * 0.99; if (Math.abs(ex) > lim) ex = (ex < 0 ? -1 : 1) * lim;
        thin += '<path d="M' + q(qx) + ' ' + q(-qy) + ' L' + q(ex) + ' ' + q(-ey) + '" stroke="' + tw + '" stroke-width="' + sw + '" stroke-linecap="round" fill="none"/>';
        if (sh === 'birch' && R() < 0.8) drop += '<path d="M' + q(ex) + ' ' + q(-ey) + ' q' + q((R() - 0.5) * 0.25) + ' 0.35 ' + q((R() - 0.5) * 0.2) + ' ' + q(Math.max(0.2, Math.min(ey - b * 0.85, rr(R, 0.5, 1.3)))) + '" stroke="' + tw + '" stroke-width="' + q(Math.max(0.014, px * 0.8)) + '" fill="none" opacity=".75"/>';
      }
    });
    h += thin + drop + thick + lead;
    // beech and oak hold on to some of last year's leaves
    if (sh === 'beech' || sh === 'oak') for (i = 0; i < 30; i++) { var p2 = tips[Math.floor(R() * tips.length)]; h += fallenLeaf(R, p2[0] * rr(R, 0.4, 0.92), -lerp(b + 0.5, p2[1], rr(R, 0.3, 0.9)), 0.07, A.pick(R, ['#8a5a2a', '#9a6a33', '#7a4a22'])); }
    return h;
  }
  function crown(c, R, t, g, V, fine, fb) {
    if (t.winter) return winterCrown(c, R, t, g, V, fine);
    var b = t.base, H = t.height, sp = g.sp, bk = g.bk, pal = A.LEAF[t.shape], sparse = A.SPARSE[t.shape] || 0;
    function half(y, side) { return crownHalf(t, y, side); }
    var Rm = clamp(0.3 * Math.min((sp + bk) / 2, (H - b) / 2), 0.5, 3.2), M = [], y, x;
    // branch masses round the outline (inset so the leaves end at the crown edge), then inside
    for (y = b + Rm * 0.8; y <= H - Rm * 0.6; y += Rm * 0.9) [1, -1].forEach(function (side) { var hw = half(y, side); if (hw > Rm * 1.05) M.push([side * (hw - Rm * 1.1), -y, Rm * rr(R, 0.92, 1.05), 1]); });
    M.push([(sp - bk) * 0.1, -(H - Rm * 1.05), Rm, 1]);
    for (y = b + Rm * 1.2; y <= H - Rm * 1.2; y += Rm * 1.15) for (x = -bk; x <= sp; x += Rm * 1.15) {
      var xx = x + (R() - 0.5) * Rm * 0.6, yy = y + (R() - 0.5) * Rm * 0.6;
      if (Math.abs(xx) <= half(yy, xx) - Rm * 1.15) M.push([xx, -yy, Rm * rr(R, 0.85, 1.1), 0]);
    }
    if (g.limb) for (var k = 0; k < 3; k++) { var p = limbAt(g.limb, 0.8 + k * 0.1); M.push([p[0] - 0.2 + k * 0.15, p[1] - 0.45, (t.id === 'T4' ? 0.7 : 0.6), 1]); }
    if (sparse) M = M.filter(function (m) { return R() > sparse * (m[3] ? 0.55 : 0.9); });
    if (fb) { var gx0 = fb.x0 - 0.7, gx1 = fb.x1 + 0.7, gy0 = fb.y0 - 0.7, gy1 = fb.y1 + 0.7; M = M.filter(function (m) { var nx = clamp(m[0], gx0, gx1), ny = clamp(m[1], gy0, gy1); return Math.hypot(m[0] - nx, m[1] - ny) > m[2] * 0.75; }); }
    M = M.filter(function (m) { return m[0] + m[2] > V.x - 1 && m[0] - m[2] < V.x + V.w + 1 && m[1] + m[2] > V.y - 1 && m[1] - m[2] < V.y + V.h + 1; });
    M.sort(function (a, b2) { return a[3] - b2[3] || R() - 0.5; });
    var h = '', np = pal.length;
    M.forEach(function (m) {
      var r = m[2], n = (sparse ? 14 : 24) * (fine ? 3 : 1), base = '', mid = '', hi = '';
      base += '<circle cx="' + q(m[0] + r * 0.06) + '" cy="' + q(m[1] + r * 0.1) + '" r="' + q(r * 0.8) + '" fill="' + pal[0] + '" opacity=".8"/>';
      for (var i = 0; i < n; i++) {
        var a = R() * 6.283, d = Math.sqrt(R()) * r * 0.72, cx = m[0] + Math.cos(a) * d, cy = m[1] + Math.sin(a) * d * 0.9, rc = r * (fine ? rr(R, 0.09, 0.17) : rr(R, 0.2, 0.34));
        var lit = (-Math.cos(a) * 0.45 - Math.sin(a) * 0.9) * (d / (r * 0.72));
        var ti = clamp(Math.round(1 + (lit + 1) * 0.5 * (np - 2) + (R() - 0.5)), 1, np - 1);
        mid += '<circle cx="' + q(cx) + '" cy="' + q(cy) + '" r="' + q(rc) + '" fill="' + (lit < -0.45 ? pal[0] : pal[Math.min(ti, np - 2)]) + '"/>';
        if (lit > 0.25) hi += '<circle cx="' + q(cx - rc * 0.25) + '" cy="' + q(cy - rc * 0.3) + '" r="' + q(rc * 0.55) + '" fill="' + pal[np - 1] + '" opacity=".75"/>';
      }
      h += base + mid + hi;
    });
    h = '<g filter="' + c.f(fine ? 'leafyf' : 'leafy') + '">' + h + '</g>';
    // individual leaves for texture, mostly round the edges
    var vis = 0; M.forEach(function (m) { vis += m[2] * m[2]; }); var n2 = Math.round(clamp(vis * 3.2 * clamp(60 / (V.w * V.h), 1, 3.5) * (fine ? 2 : 1), 60, 3500)), lv = '';
    for (var i2 = 0; i2 < n2; i2++) {
      var mm = M[Math.floor(R() * M.length)]; if (!mm) break;
      var a2 = R() * 6.283, d2 = Math.pow(R(), 0.5) * mm[2] * 0.98, lx = mm[0] + Math.cos(a2) * d2, ly = mm[1] + Math.sin(a2) * d2, s = 0.055 + R() * 0.05;
      lv += '<ellipse cx="' + q(lx) + '" cy="' + q(ly) + '" rx="' + q(s) + '" ry="' + q(s * 0.55) + '" transform="rotate(' + Math.round(R() * 180) + ' ' + q(lx) + ' ' + q(ly) + ')" fill="' + pal[1 + Math.floor(R() * (np - 1))] + '"/>';
    }
    h += lv;
    // bare twig tips (dieback) and drooping birch twigs
    var B = A.BARK[t.shape].col[0];
    if (sparse) {
      var tw = '';
      for (var j = 0; j < 30; j++) {
        var yy2 = lerp(b + (H - b) * 0.3, H - 0.3, R()), side = R() < 0.5 ? -1 : 1, x0 = side * half(yy2, side) * 0.8, ang = side > 0 ? -0.5 - R() * 0.8 : -Math.PI + 0.5 + R() * 0.8, len = 0.8 + R() * 1.1;
        if (yy2 > H - 1.5) ang = -Math.PI / 2 + (R() - 0.5) * 1.3;
        var x1 = x0 + Math.cos(ang) * len, y1 = -yy2 + Math.sin(ang) * len;
        tw += '<path d="M' + q(x0) + ' ' + q(-yy2) + ' L' + q(x1) + ' ' + q(y1) + ' M' + q(lerp(x0, x1, 0.55)) + ' ' + q(lerp(-yy2, y1, 0.55)) + ' l' + q(Math.cos(ang + 0.5) * len * 0.4) + ' ' + q(Math.sin(ang + 0.5) * len * 0.4) + ' M' + q(lerp(x0, x1, 0.4)) + ' ' + q(lerp(-yy2, y1, 0.4)) + ' l' + q(Math.cos(ang - 0.5) * len * 0.35) + ' ' + q(Math.sin(ang - 0.5) * len * 0.35) + '" stroke="' + B + '" stroke-width="0.035" fill="none" stroke-linecap="round"/>';
      }
      if (t.shape === 'birch') for (j = 0; j < 26; j++) { var pp2 = M[Math.floor(R() * M.length)]; if (!pp2) break; var hx = pp2[0] + (R() - 0.5) * pp2[2] * 1.6, hy = pp2[1] + (R() - 0.3) * pp2[2]; tw += '<path d="M' + q(hx) + ' ' + q(hy) + ' q' + q((R() - 0.5) * 0.3) + ' 0.4 ' + q((R() - 0.5) * 0.2) + ' ' + q(0.35 + R() * 0.4) + '" stroke="#6b5646" stroke-width="0.014" fill="none" opacity=".7"/>'; }
      h += tw;
    }
    return h;
  }
  function line(c, R, t, g) {
    var L = g.line, x = L.x, h = '';
    if (L.kind === 'lv') {
      h += '<rect x="' + q(x - 0.12) + '" y="' + q(-L.top) + '" width="0.24" height="' + q(L.top + 0.05) + '" fill="' + c.linear([[0, '#4a3523'], [0.35, '#8a6a48'], [1, '#3e2c1d']], x - 0.12, 0, x + 0.12, 0) + '"/>';
      L.cond.forEach(function (cd) {
        var cx = cd[0], cy = -cd[1];
        h += '<path d="M' + q(x - 0.12) + ' ' + q(cy - 0.07) + ' L' + q(cx + 0.02) + ' ' + q(cy - 0.07) + ' L' + q(cx + 0.02) + ' ' + q(cy + 0.07) + ' L' + q(x - 0.12) + ' ' + q(cy + 0.07) + '" stroke="#5a5f61" stroke-width="0.03" fill="none"/>';
        h += '<rect x="' + q(cx - 0.045) + '" y="' + q(cy - 0.055) + '" width="0.09" height="0.11" rx="0.03" fill="#e9e6da" stroke="#8d8a7e" stroke-width="0.012"/>';
        h += '<circle cx="' + q(cx - 0.06) + '" cy="' + q(cy) + '" r="0.045" fill="#1f2326" stroke="#c9d1d6" stroke-width="0.012"/>';
      });
      return h;
    }
    if (L.kind === 'pole') {
      var big = L.kv >= 33, wd = big ? 0.34 : 0.28, armY = -L.low + 0.3, hw = L.arm;
      h += '<rect x="' + q(x - wd / 2) + '" y="' + q(-L.top) + '" width="' + q(wd) + '" height="' + q(L.top + 0.05) + '" fill="' + c.linear([[0, '#4a3523'], [0.35, '#8a6a48'], [1, '#3e2c1d']], x - wd / 2, 0, x + wd / 2, 0) + '"/>';
      h += '<rect x="' + q(x - hw) + '" y="' + q(armY) + '" width="' + q(hw * 2) + '" height="' + (big ? 0.15 : 0.12) + '" fill="#5a5f61"/>';
      h += '<path d="M' + q(x - hw * 0.8) + ' ' + q(armY + 0.12) + ' L' + q(x) + ' ' + q(armY + (big ? 1.0 : 0.75)) + ' L' + q(x + hw * 0.8) + ' ' + q(armY + 0.12) + '" stroke="#5a5f61" stroke-width="0.05" fill="none"/>';
      L.cond.forEach(function (cd) {
        var cx = cd[0], cy = -cd[1], n = big ? 5 : 3, st = big ? 0.42 : 0.24;
        h += '<rect x="' + q(cx - 0.05) + '" y="' + q(cy + 0.06) + '" width="0.1" height="' + q(st) + '" rx="0.03" fill="#7d8f84"/>';
        for (var k = 0; k < n; k++) h += '<ellipse cx="' + q(cx) + '" cy="' + q(cy + 0.08 + k * (st - 0.04) / n) + '" rx="' + (big ? 0.11 : 0.085) + '" ry="0.025" fill="#93a79a"/>';
        h += '<circle cx="' + q(cx) + '" cy="' + q(cy) + '" r="0.075" fill="#1f2326" stroke="#c9d1d6" stroke-width="0.02"/>';
      });
      return h;
    }
    // 132kV lattice tower, seen end-on: three crossarms a side, suspension insulators, earth wire at the peak
    var st2 = '#7f888c', dk = '#5d666a', sw = 0.14, waist = 13, bw = 3.3, tw = 0.95, body = 23.2;
    function leg(sgn) { return 'M' + q(x + sgn * bw) + ' 0.05 L' + q(x + sgn * tw) + ' ' + q(-waist) + ' L' + q(x + sgn * tw * 0.9) + ' ' + q(-body) + ' L' + q(x) + ' ' + q(-L.top); }
    h += '<path d="' + leg(-1) + ' ' + leg(1) + '" stroke="' + st2 + '" stroke-width="' + sw + '" fill="none" stroke-linejoin="round"/>';
    // bracing: Xs up the legs and the body
    var lv = [0, 3.4, 6.6, 9.6, 13, 15.2, 17.4, 19.4, 21.4, 23.2], br = '';
    function halfW(y) { return y <= waist ? lerp(bw, tw, y / waist) : lerp(tw, tw * 0.9, (y - waist) / (body - waist)); }
    for (var i = 0; i < lv.length - 1; i++) {
      var a = lv[i], b = lv[i + 1], wa = halfW(a), wb = halfW(b);
      br += 'M' + q(x - wa) + ' ' + q(-a) + ' L' + q(x + wb) + ' ' + q(-b) + ' M' + q(x + wa) + ' ' + q(-a) + ' L' + q(x - wb) + ' ' + q(-b) + ' M' + q(x - wb) + ' ' + q(-b) + ' L' + q(x + wb) + ' ' + q(-b) + ' ';
    }
    h += '<path d="' + br + '" stroke="' + dk + '" stroke-width="0.07" fill="none"/>';
    // crossarms and insulator strings
    [[14, 4.2], [18, 4.8], [22, 3.6]].forEach(function (arm) {
      [-1, 1].forEach(function (sgn) {
        var tipX = x + sgn * arm[1], y = -arm[0], bx = x + sgn * halfW(arm[0]);
        h += '<path d="M' + q(bx) + ' ' + q(y - 0.9) + ' L' + q(tipX) + ' ' + q(y) + ' L' + q(bx) + ' ' + q(y + 0.55) + ' M' + q(lerp(bx, tipX, 0.5)) + ' ' + q(y - 0.45) + ' L' + q(lerp(bx, tipX, 0.5)) + ' ' + q(y + 0.28) + '" stroke="' + st2 + '" stroke-width="0.1" fill="none" stroke-linejoin="round"/>';
        for (var k = 0; k < 9; k++) h += '<ellipse cx="' + q(tipX) + '" cy="' + q(y + 0.2 + k * 0.17) + '" rx="0.14" ry="0.05" fill="#8fa59a"/>';
        h += '<line x1="' + q(tipX) + '" y1="' + q(y) + '" x2="' + q(tipX) + '" y2="' + q(y + 1.72) + '" stroke="#6f7f78" stroke-width="0.04"/>';
        h += '<circle cx="' + q(tipX) + '" cy="' + q(y + 1.8) + '" r="0.11" fill="#1f2326" stroke="#c9d1d6" stroke-width="0.025"/>';
      });
    });
    h += '<circle cx="' + q(x) + '" cy="' + q(-L.top) + '" r="0.07" fill="#1f2326"/>';
    // concrete feet
    h += '<rect x="' + q(x - bw - 0.3) + '" y="-0.12" width="0.6" height="0.2" fill="#9a9a94"/><rect x="' + q(x + bw - 0.3) + '" y="-0.12" width="0.6" height="0.2" fill="#9a9a94"/>';
    return h;
  }
  // ---------------- decoys ----------------
  var IVY = [[0, 0.05], [-0.12, 0.02], [-0.45, 0.05], [-0.55, -0.15], [-0.32, -0.25], [-0.45, -0.5], [-0.2, -0.55], [0, -0.95], [0.2, -0.55], [0.45, -0.5], [0.32, -0.25], [0.55, -0.15], [0.45, 0.05], [0.12, 0.02]];
  var IVYD = smooth(IVY, true);
  // right-hand half of the leaf, used to shade one side
  var IVYH = smooth(IVY.slice(7).concat([[0, 0.05]]), true);
  function ivyLeaf(R, x, y, s, rot) {
    var col = A.pick(R, ['#34482a', '#3d5330', '#2e4126', '#46603a', '#3a4f2c']), sx = s * (0.85 + R() * 0.3);
    return '<g transform="translate(' + q(x) + ' ' + q(y) + ') rotate(' + Math.round(rot) + ') scale(' + q(sx) + ' ' + q(s) + ')"><path d="' + IVYD + '" fill="' + col + '"/><path d="' + IVYH + '" fill="#0d1a0c" opacity=".28"/><path d="M0 0 L0 -0.85 M0 -0.1 L-0.45 -0.42 M0 -0.1 L0.45 -0.42" stroke="#9aae7c" stroke-width="0.03" fill="none" opacity=".4"/></g>';
  }
  function decoys(c, R, t, g, low, high, fb) {
    var r0 = g.r0, out = { svg: '', hits: [] }, h = '';
    function inBand(y) { return -y > low + 0.3 && -y < high - 0.3; }
    (t.decoys || []).forEach(function (k) {
      var mid = (low + high) / 2;
      if (k === 'ivy') {
        var top = Math.min(high - 0.3, Math.max(3.5, t.height * 0.55)), vines = t.shape === 'birch' || t.shape === 'elder' ? 1 : 3;
        function clear(x, y) { return !fb || x < fb.x0 - 0.12 || x > fb.x1 + 0.12 || y < fb.y0 - 0.12 || y > fb.y1 + 0.12; }
        for (var v = 0; v < vines; v++) {
          var P = [], y = 0.02, x = -r0 * (0.85 - v * 0.45), vt = top * (1 - v * 0.18);
          while (-y < vt) { P.push([x, y]); y -= 0.4 + R() * 0.2; x = clamp(x + (R() - 0.5) * r0 * 0.9, -r0 * 0.98, r0 * (0.15 + v * 0.3)); }
          h += '<path d="' + smooth(P, false) + '" stroke="#4a3a2a" stroke-width="0.03" fill="none" stroke-linecap="round"/>';
          for (var i = 1; i < P.length; i++) for (var j = 0; j < 18; j++) { var u = R(), lx = lerp(P[i - 1][0], P[i][0], u) + (R() - 0.5) * Math.max(0.3, r0 * 0.8), ly = lerp(P[i - 1][1], P[i][1], u) + (R() - 0.5) * 0.12; if (clear(lx, ly) && Math.abs(lx) < r0 * 1.15) h += ivyLeaf(R, lx, ly, 0.06 + R() * 0.06, (R() - 0.5) * 120); }
          for (i = 0; i < P.length; i += 2) if (inBand(P[i][1])) out.hits.push({ k: k, cx: P[i][0], cy: P[i][1], r: 0.36 });
        }
        for (j = 0; j < 90; j++) { var gx = -r0 * 1.15 + (R() - 0.5) * 1.1, gy = -R() * 0.32; if (clear(gx, gy)) h += ivyLeaf(R, gx, gy, 0.06 + R() * 0.05, (R() - 0.5) * 140); }
        if (low < 0.5) out.hits.push({ k: k, cx: -r0 * 1.15, cy: -0.15, r: 0.45 });
      } else if (k === 'moss') {
        var my = low < 0.5 ? 0.25 : mid - 0.6, mx = -r0 * 0.75;
        var cushions = low < 0.5 ? [[-r0 - 0.15, -0.08, 0.32, 0.12], [-r0 * 0.7, -0.22, 0.24, 0.16], [-r0 * 0.82, -0.6, 0.14, 0.36], [-r0 * 0.78, -1.25, 0.1, 0.42], [-r0 * 0.72, -1.95, 0.07, 0.3], [r0 * 1.05, -0.06, 0.2, 0.08]] : [[mx, -my, 0.14, 0.4], [mx + 0.08, -my - 0.7, 0.1, 0.35], [mx - 0.03, -my + 0.5, 0.12, 0.25]];
        cushions.forEach(function (m) {
          var d = smooth(blob(R, m[0], m[1], m[2], m[3], 14, 0.3), true), area = m[2] * m[3];
          h += '<path d="' + d + '" fill="#2f3f1f" opacity=".9" filter="' + c.f('fuzz') + '"/>';
          h += '<path d="' + d + '" fill="' + c.radial([[0, '#7d9049'], [0.7, '#58703a'], [1, '#3f5530', 0.6]], m[0] - m[2] * 0.3, m[1] - m[3] * 0.3, Math.max(m[2], m[3]) * 1.1) + '" filter="' + c.f('fuzz') + '" opacity=".85"/>';
          var sp = '', n = Math.min(340, Math.round(area * 12000));
          for (var s2 = 0; s2 < n; s2++) {
            var a = R() * 6.28, rr2 = Math.sqrt(R()), x = m[0] + Math.cos(a) * rr2 * m[2], y = m[1] + Math.sin(a) * rr2 * m[3], L = 0.004 + R() * 0.008, an = -Math.PI / 2 + (R() - 0.5) * 2.2;
            sp += '<line x1="' + q(x) + '" y1="' + q(y) + '" x2="' + q(x + Math.cos(an) * L) + '" y2="' + q(y + Math.sin(an) * L) + '" stroke="' + A.pick(R, ['#8a9f4a', '#a3b060', '#6f8a3a', '#58703a']) + '" stroke-width="0.0035" stroke-linecap="round"/>';
          }
          h += sp;
        });
        var hc = cushions[1]; out.hits.push({ k: k, cx: hc[0], cy: hc[1], r: 0.42 });
        if (low < 0.5) out.hits.push({ k: k, cx: -r0 - 0.12, cy: -0.1, r: 0.35 });
      } else if (k === 'lichen') {
        var ly2 = clamp(mid - 0.8, low + 0.8, high - 0.8);
        if (t.art === 'ears') ly2 = 0.9;
        for (var n = 0; n < 16; n++) {
          var cx = (R() - 0.6) * r0 * 1.3, cy = -ly2 + (R() - 0.5) * 0.9, rr2 = 0.012 + R() * 0.022, yel = R() < 0.3;
          if (t.shape === 'elder') cx = -0.12 + (R() - 0.5) * 0.08;
          var lp = smooth(blob(R, cx, cy, rr2, rr2 * 0.85, 11, 0.35), true);
          h += '<path d="' + lp + '" fill="' + (yel ? '#c2a047' : '#a3ad92') + '" opacity=".8"/>';
          for (var ap = 0; ap < 3; ap++) h += '<circle cx="' + q(cx + (R() - 0.5) * rr2) + '" cy="' + q(cy + (R() - 0.5) * rr2) + '" r="' + q(rr2 * 0.07) + '" fill="' + (yel ? '#a8742a' : '#7d8870') + '" opacity=".8"/>';
        }
        out.hits.push({ k: k, cx: t.shape === 'elder' ? -0.12 : 0, cy: -ly2, r: 0.45 });
      } else if (k === 'birdbox') {
        var by = -clamp(mid + 0.3, low + 1, high - 1), bx = -r0 * 0.45;
        h += '<rect x="' + q(bx - 0.03) + '" y="' + q(by - 0.22) + '" width="0.06" height="0.5" fill="#5b4329"/>';
        h += '<rect x="' + q(bx - 0.1) + '" y="' + q(by - 0.12) + '" width="0.2" height="0.27" fill="' + c.linear([[0, '#7a5a38'], [0.5, '#a07a4e'], [1, '#6a4c2f']], bx - 0.1, 0, bx + 0.1, 0) + '"/>';
        h += '<path d="M' + q(bx - 0.13) + ' ' + q(by - 0.1) + ' L' + q(bx) + ' ' + q(by - 0.2) + ' L' + q(bx + 0.13) + ' ' + q(by - 0.1) + 'Z" fill="#5b4329"/>';
        h += '<circle cx="' + q(bx) + '" cy="' + q(by - 0.01) + '" r="0.017" fill="#140f0b"/><rect x="' + q(bx - 0.1) + '" y="' + q(by + 0.13) + '" width="0.2" height="0.02" fill="#000" opacity=".25"/>';
        out.hits.push({ k: k, cx: bx, cy: by, r: 0.32 });
      } else if (k === 'woodpecker') {
        var wy = -clamp(high - 1.1, low + 1, high - 0.6), wx = r0 * (t.shape === 'birch' ? 0 : -0.2);
        if (t.shape === 'birch') wy = -5.4;
        h += '<ellipse cx="' + q(wx) + '" cy="' + q(wy) + '" rx="0.04" ry="0.05" fill="#d8c29a"/><ellipse cx="' + q(wx) + '" cy="' + q(wy + 0.004) + '" rx="0.028" ry="0.037" fill="#110c08"/>';
        out.hits.push({ k: k, cx: wx, cy: wy, r: 0.3 });
      }
    });
    out.svg = '<g filter="' + c.f('cast') + '">' + h + '</g>';
    return out;
  }
  // ---------------- labels (stepped-back view) ----------------
  function labelSize(w, pxw) { return w * 0.024 * clamp(640 / (pxw || 640), 1, 1.75); }
  function labels(t, g, V, pxw) {
    var fs = labelSize(V.w, pxw), sw = fs * 0.075, h = '';
    var T = function (x, y, s, anchor, w) { return '<text x="' + q(x) + '" y="' + q(y) + '" font-size="' + q(fs) + '" font-family="var(--mono)" font-weight="' + (w || 700) + '" text-anchor="' + (anchor || 'start') + '" fill="#132018" stroke="rgba(244,246,238,.88)" stroke-width="' + q(fs * 0.28) + '" paint-order="stroke" stroke-linejoin="round">' + s + '</text>'; };
    var Ln = function (x1, y1, x2, y2) { return '<line x1="' + q(x1) + '" y1="' + q(y1) + '" x2="' + q(x2) + '" y2="' + q(y2) + '" stroke="#132018" stroke-width="' + q(sw) + '"/>'; };
    // tree height
    var hx = -g.bk - 1.1;
    h += '<g opacity=".9">' + Ln(hx, 0, hx, -t.height) + Ln(hx - fs * 0.4, 0, hx + fs * 0.4, 0) + Ln(hx - fs * 0.4, -t.height, hx + fs * 0.4, -t.height) + '</g>';
    h += T(hx - fs * 0.3, -t.height / 2, t.height + ' m', 'end');
    // stem to the line
    var dy = fs * 1.4;
    if (t.under) h += T(t.dist, dy, 'Under the line', 'middle');
    else { h += Ln(0, dy, t.dist, dy) + Ln(0, dy - fs * 0.4, 0, dy + fs * 0.4) + Ln(t.dist, dy - fs * 0.4, t.dist, dy + fs * 0.4); h += T(t.dist / 2, dy + fs * 1.25, t.dist + ' m stem to line', 'middle'); }
    // conductor height
    // lowest conductor height, the voltage, and the conductors themselves
    var L = g.line, cx = g.pole + L.arm + 0.5, lowTxt = (L.low % 1 ? L.low.toFixed(1) : L.low) + ' m';
    h += Ln(cx, 0, cx, -L.low) + Ln(cx - fs * 0.3, -L.low, cx + fs * 0.3, -L.low) + T(cx + fs * 0.3, -L.low / 2, lowTxt, 'start');
    h += T(L.kind === 'tower' ? g.pole + 1.6 : g.pole + L.arm + 0.2, -L.top - (L.kind === 'tower' ? -fs * 1.2 : fs * 0.2), L.label, 'start');
    L.cond.forEach(function (cd) { h += '<circle cx="' + q(cd[0]) + '" cy="' + q(-cd[1]) + '" r="' + q(Math.max(0.09, fs * 0.17)) + '" fill="#1f2326" stroke="#e9eef0" stroke-width="' + q(fs * 0.05) + '"/>'; });
    // scale bar
    var sb = V.w > 26 ? 5 : 2, sx = V.x + V.w - sb - fs * 1.2, sy = V.y + V.h - fs * 1.1;
    for (var i = 0; i < sb; i++) h += '<rect x="' + q(sx + i) + '" y="' + q(sy - fs * 0.3) + '" width="1" height="' + q(fs * 0.3) + '" fill="' + (i % 2 ? '#f4f6ee' : '#132018') + '" stroke="#132018" stroke-width="' + q(sw * 0.6) + '"/>';
    h += T(sx, sy - fs * 0.55, '0', 'middle', 500) + T(sx + sb, sy - fs * 0.55, sb + ' m', 'middle', 500);
    return h;
  }

  function zoomLabels(t, g, V, pxw) {
    var fs = V.w * 0.03 * clamp(640 / (pxw || 640), 1, 1.5), sw = fs * 0.07, h = '', L = g.line;
    var T = function (x, y, s, anchor) { return '<text x="' + q(x) + '" y="' + q(y) + '" font-size="' + q(fs) + '" font-family="var(--mono)" font-weight="700" text-anchor="' + (anchor || 'start') + '" fill="#132018" stroke="rgba(244,246,238,.88)" stroke-width="' + q(fs * 0.28) + '" paint-order="stroke" stroke-linejoin="round">' + s + '</text>'; };
    var close = V.w < 9;
    L.cond.forEach(function (cd) { h += '<circle cx="' + q(cd[0]) + '" cy="' + q(-cd[1]) + '" r="' + q(close ? Math.max(0.055, fs * 0.2) : Math.max(0.1, fs * 0.2)) + '" fill="#1f2326" stroke="#e9eef0" stroke-width="' + q(fs * 0.06) + '"/>'; });
    var nc = nearest(t, g).c, ly = Math.max(-nc[1] - fs * 0.7, V.y + fs * 1.3);
    h += L.kind === 'lv' ? T(g.pole + 0.3, -L.top + fs * 0.9, L.label, 'start') : T(nc[0] + fs * 0.6, ly, L.label, 'start');
    // a 2 m bar in metres, or a 1 m bar in half metres when the view is close in
    var sb = V.w < 9 ? 1 : 2, seg = sb / 2, sx = V.x + V.w - sb - fs * 1.4, sy = V.y + V.h - fs * 1.0;
    for (var i = 0; i < 2; i++) h += '<rect x="' + q(sx + i * seg) + '" y="' + q(sy - fs * 0.32) + '" width="' + seg + '" height="' + q(fs * 0.32) + '" fill="' + (i % 2 ? '#f4f6ee' : '#132018') + '" stroke="#132018" stroke-width="' + q(sw * 0.6) + '"/>';
    // on the Advent pictures the middle figure is left off when there isn't room for it (phones, and the close-in bar)
    h += T(sx, sy - fs * 0.6, '0', 'middle') + (!t.winter || seg >= fs * (seg < 1 ? 2.8 : 1.9) ? T(sx + seg, sy - fs * 0.6, String(seg), 'middle') : '') + T(sx + sb, sy - fs * 0.6, sb + ' m', 'middle');
    return h;
  }

  // ---------------- build ----------------
  function build(t, mode, pxw) {
    var g = geo(t), PL = t.art ? places(t, g) : [], boxes = PL.map(function (p) { return fungusBox(t, p); });
    var fb = boxes.length ? boxes.reduce(function (a, b) { return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; }) : { x0: -0.4, y0: -1.6, x1: 0.4, y1: -1 };
    var V = mode === 'find' ? findView(t, g, fb) : mode === 'elev' ? elevView(t, g, pxw) : mode === 'zoom' ? zoomView(t, g) : mode === 'plain' ? plainView(t, g) : closeView(boxes[0]);
    var ppm = (pxw || 640) / V.w, c = new A.Ctx(mode[0] + t.id, ppm), R = A.rng(A.hash(t.id + 'scene'));
    var body = '';
    var bg = backdrop(c, A.rng(A.hash(t.id + 'bg')), V);
    body += mode === 'elev' || mode === 'zoom' || mode === 'plain' ? bg : '<g filter="' + c.f('dof') + '">' + bg + '</g>';
    var showLine = mode !== 'plain' && !(t.far && (mode === 'find' || mode === 'close'));
    body += trunk(c, A.rng(A.hash(t.id + 'trunk')), t, g, V);
    var FV = findView(t, g, fb), D = decoys(c, A.rng(A.hash(t.id + 'decoy')), t, g, -(FV.y + FV.h), -FV.y, fb);
    body += D.svg;
    var hole = (t.spot === 'high' || t.spot === 'limb') ? fb : null;
    if (mode !== 'close') body += crown(c, A.rng(A.hash(t.id + 'crown')), t, g, V, mode === 'find' || mode === 'zoom', hole);
    body += limbSvg(c, t, g);
    if (showLine) body += line(c, R, t, g);
    // the fungus
    var FR = A.rng(A.hash(t.id + t.art));
    PL.forEach(function (p) {
      var f = A.FUNGUS[t.art](c, FR);
      body += '<g transform="translate(' + q(p.x) + ' ' + q(p.y) + ') scale(' + (p.flip ? -1 : 1) * 0.01 * FS * p.s + ' ' + 0.01 * FS * p.s + ')">' + f.svg + '</g>';
    });
    body += grass(c, A.rng(A.hash(t.id + 'grass')), V, mode !== 'elev' && mode !== 'plain');
    body += litter(c, A.rng(A.hash(t.id + 'litter')), t, g, V);
    if (mode === 'elev') body += '<g class="lbl">' + labels(t, g, V, pxw) + '</g>';
    if (mode === 'zoom') body += '<g class="lbl">' + zoomLabels(t, g, V, pxw) + '</g>';
    var defs = '<defs>' + A.filters(c) + A.barkFilter(c, t.shape) + c.defs.join('') + '</defs>';
    var hits = { fungus: boxes.map(function (b) { var w = b.x1 - b.x0, hh = b.y1 - b.y0; return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, r: Math.max(Math.sqrt(w * w + hh * hh) * 0.42, 22 / ppm) }; }), decoys: D.hits };
    return { svg: defs + body, view: V, hits: hits, box: fb, main: boxes[0], ppm: ppm };
  }
  return { build: build, LINES: LINES, lineGeo: lineGeo, crownHalf: crownHalf, nearest: function (t) { return nearest(t, geo(t)); } };
})();

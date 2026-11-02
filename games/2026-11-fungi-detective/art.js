/* Fungi Detective — artwork. Everything is drawn in metres: x = horizontal (stem at 0, the line to the
 * right), SVG y = minus the height above ground. Fungi are drawn in centimetres inside a scale(0.01) group.
 * Deterministic: the same tree always looks the same (seeded from its id). */
var FungiArt = (function () {
  'use strict';

  // ---------------- helpers ----------------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function q(v) { return Math.round(v * 1000) / 1000; }
  function q1(v) { return Math.round(v * 10) / 10; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(R, arr) { return arr[Math.floor(R() * arr.length) % arr.length]; }
  function rr(R, a, b) { return a + (b - a) * R(); }
  // Catmull-Rom spline through points, as cubic Beziers
  function smooth(P, closed, f) {
    f = f || q; var n = P.length; if (n < 2) return '';
    var d = 'M' + f(P[0][0]) + ' ' + f(P[0][1]), last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + (closed ? 'Z' : '');
  }
  function blob(R, cx, cy, rx, ry, n, jit) {
    var P = [], ph = R() * 6.28;
    for (var i = 0; i < n; i++) { var a = ph + i / n * Math.PI * 2, k = 1 + (R() - 0.5) * 2 * jit; P.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return P;
  }

  // drawing context: collects <defs> and hands out unique ids (one per SVG)
  function Ctx(p, ppm) { this.p = p; this.ppm = ppm; this.defs = []; this.n = 0; }
  Ctx.prototype.uid = function (k) { return this.p + k + (this.n++); };
  Ctx.prototype.stops = function (S) { return S.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join(''); };
  Ctx.prototype.radial = function (S, cx, cy, r, ky, fx, fy) {
    var id = this.uid('r'), tf = ky && ky !== 1 ? ' gradientTransform="translate(' + q(cx) + ' ' + q(cy) + ') scale(1 ' + q(ky) + ') translate(' + q(-cx) + ' ' + q(-cy) + ')"' : '';
    this.defs.push('<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + q(cx) + '" cy="' + q(cy) + '" r="' + q(r) + '"' + (fx != null ? ' fx="' + q(fx) + '" fy="' + q(fy) + '"' : '') + tf + '>' + this.stops(S) + '</radialGradient>');
    return 'url(#' + id + ')';
  };
  Ctx.prototype.linear = function (S, x1, y1, x2, y2) {
    var id = this.uid('l');
    this.defs.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + q(x1) + '" y1="' + q(y1) + '" x2="' + q(x2) + '" y2="' + q(y2) + '">' + this.stops(S) + '</linearGradient>');
    return 'url(#' + id + ')';
  };
  Ctx.prototype.f = function (k) { return 'url(#' + this.p + k + ')'; };

  // ---------------- bark ----------------
  var BARK = {
    beech:    { col: ['#5a605c', '#848a84', '#9ba097', '#727771'], type: 'fractalNoise', fq: '1.8 3.2', oct: 3, bump: 0.07 },
    oak:      { col: ['#45392e', '#6b5a48', '#82705b', '#5a4b3d'], type: 'turbulence', fq: '7 0.55', oct: 3, bump: 0.19 },
    sycamore: { col: ['#5d5349', '#8c8072', '#a39584', '#716659'], type: 'turbulence', fq: '3.2 2.4', oct: 2, bump: 0.08 },
    ash:      { col: ['#5b5e55', '#8a8d82', '#a0a296', '#72756a'], type: 'turbulence', fq: '5 1.1', oct: 3, bump: 0.1 },
    cherry:   { col: ['#4d2b24', '#7a4539', '#915846', '#62372e'], type: 'fractalNoise', fq: '1.2 14', oct: 2, bump: 0.07 },
    birch:    { col: ['#b5afa5', '#e2ded5', '#efece5', '#cfcabf'], type: 'fractalNoise', fq: '2 16', oct: 2, bump: 0.05 },
    elder:    { col: ['#695b47', '#94866b', '#a79a80', '#7d6f5a'], type: 'turbulence', fq: '6 1.4', oct: 3, bump: 0.1 }
  };
  var LEAF = {
    beech:    ['#8a4a1c', '#a8561f', '#c9772c', '#dc9a45', '#b07a30'],
    oak:      ['#4f5520', '#6e6d28', '#8f8433', '#a99a48', '#7b5a24'],
    sycamore: ['#7a6418', '#a88a22', '#c9a733', '#ddc25a', '#7d7a2c'],
    ash:      ['#4e5a24', '#6b7a30', '#8c9640', '#a9ad5a'],
    cherry:   ['#6e1f17', '#9b2f1f', '#c4502c', '#d9773e', '#b9862f'],
    birch:    ['#8a6a16', '#b38a1f', '#d0aa2e', '#e3c752'],
    elder:    ['#3f5a26', '#56722f', '#71893b', '#97a24c', '#b5a94a']
  };
  var SPARSE = { ash: 0.45, cherry: 0.5, birch: 0.62, elder: 0.35 };

  function filters(c) {
    var p = c.p, s = c.ppm, out = '';
    // leafy edges for the crown (metres)
    out += '<filter id="' + p + 'leafy" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.55" xChannelSelector="R" yChannelSelector="G"/></filter>';
    out += '<filter id="' + p + 'leafyf" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="5" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.2" xChannelSelector="R" yChannelSelector="G"/></filter>';
    // fuzzy moss / lichen edges (metres)
    out += '<filter id="' + p + 'fuzz" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="14" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.05" xChannelSelector="R" yChannelSelector="G"/></filter>';
    out += '<filter id="' + p + 'haze" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="0.35"/></filter>';
    out += '<filter id="' + p + 'dof" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.09"/></filter>';
    out += '<filter id="' + p + 'cast" x="-10%" y="-10%" width="125%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="0.012"/><feOffset dx="0.014" dy="0.02"/><feComponentTransfer><feFuncA type="linear" slope="0.42"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    out += '<filter id="' + p + 'soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.05"/></filter>';
    // fungus-scale (centimetres)
    out += '<filter id="' + p + 'fsoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter>';
    out += '<filter id="' + p + 'fbump" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="3" seed="2" result="n"/><feDiffuseLighting in="n" surfaceScale="2.2" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.2" k2="0" k3="0" k4="0" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>';
    out += '<filter id="' + p + 'fdust" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -0.85" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>';
    out += '<filter id="' + p + 'fpore" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="1" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 1.5 -0.55" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>';
    return out;
  }
  function barkFilter(c, shape) {
    var B = BARK[shape], id = c.p + 'bark';
    var ss = B.bump; // Chromium applies surfaceScale in user units (metres here)
    return '<filter id="' + id + '" x="-8%" y="-2%" width="116%" height="104%" color-interpolation-filters="sRGB"><feTurbulence type="' + B.type + '" baseFrequency="' + B.fq + '" numOctaves="' + B.oct + '" seed="7" result="n"/><feDiffuseLighting in="n" surfaceScale="' + ss + '" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="200" elevation="48"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>';
  }

  // ---------------- fungi (centimetres, origin at the attachment point) ----------------
  // A bracket seen from the front: top surface between the attachment line and a wavy front edge,
  // then the margin, then the pore surface underneath.
  function shelf(c, R, o) {
    var N = 30, A = [], E = [], U = [], i, dome = o.dome == null ? 0.35 : o.dome, cx = o.x, cy = o.y;
    var ph = R() * 6.28;
    for (i = 0; i <= N; i++) {
      var t = i / N, th = Math.PI * (1 - t), s = Math.sin(th), co = Math.cos(th);
      var wob = 1 + (o.wav || 0) * Math.sin((o.nw || 3) * Math.PI * t + ph) * Math.pow(s, 0.35) + (R() - 0.5) * (o.jit || 0.02) * s;
      A.push([o.x + o.w * co * 0.97, o.y - o.d * dome * 0.5 * Math.pow(s, 0.8) + (R() - 0.5) * 0.3]);
      var ex = o.x + o.w * co * (0.94 + 0.06 * wob), ey = o.y + o.d * s * wob;
      E.push([ex, ey]);
      U.push([ex, ey + o.th * (0.08 + 0.92 * Math.pow(s, 0.9))]);
    }
    var C = o.cols, h = '';
    if (o.shadow !== false) h += '<ellipse cx="' + q1(o.x) + '" cy="' + q1(o.y + o.th + o.d * 0.6) + '" rx="' + q1(o.w * 0.92) + '" ry="' + q1(o.d * 0.4 + o.th * 0.45) + '" fill="#000" opacity="' + (o.shadowOp || 0.38) + '" filter="' + c.f('fsoft') + '"/>';
    // pore surface / margin face
    var ud = smooth(E.concat(U.slice().reverse()), true, q1);
    h += '<path d="' + ud + '" fill="' + c.linear([[0, C.under], [1, C.underDark || C.under]], 0, o.y, 0, o.y + o.d + o.th) + '"/>';
    if (o.pores) h += '<path d="' + ud + '" fill="#000" filter="' + c.f('fpore') + '" opacity="' + o.pores + '"/>';
    // the cap's own shadow on the pore surface, just under the margin
    h += '<path d="' + smooth(E.slice(3, N - 2), false, q1) + '" fill="none" stroke="#000" stroke-width="' + q1(o.th * 0.35) + '" opacity=".22" transform="translate(0 ' + q1(o.th * 0.28) + ')" filter="' + c.f('fsoft') + '"/>';
    // top surface: colour zones, then light from above so it reads as a dome
    var top = smooth(A.concat(E.slice().reverse()), true, q1);
    h += '<path d="' + top + '" fill="' + c.radial([[0, C.c0], [0.45, C.c1], [0.8, C.c2], [1, C.rim]], cx, o.y, o.w * 1.02, (o.d * 1.02) / o.w) + '"/>';
    if (o.bump) h += '<path d="' + top + '" fill="' + C.c1 + '" filter="' + c.f('fbump') + '" opacity="' + o.bump + '"/>';
    // growth zones parallel to the margin
    (o.zones || []).forEach(function (f, k) {
      var Z = [];
      for (i = 3; i <= N - 3; i++) Z.push([cx + f * (E[i][0] - cx) + (R() - 0.5) * 0.25, cy + f * (E[i][1] - cy) + (R() - 0.5) * 0.25]);
      h += '<path d="' + smooth(Z, false, q1) + '" fill="none" stroke="' + (k % 2 && C.zone2 ? C.zone2 : C.zone) + '" stroke-width="' + q1(o.zw || o.w * 0.025) + '" stroke-linecap="round" opacity="' + (o.zop || 0.55) + '"/>';
    });
    if (o.hairs) for (i = 0; i < o.hairs; i++) {
      var tt = 2 + Math.floor(R() * (N - 4)), f = Math.sqrt(R()) * 0.95, e = E[tt];
      var x = cx + f * (e[0] - cx), y = cy + f * (e[1] - cy), dx = e[0] - cx, dy = e[1] - cy, L = Math.sqrt(dx * dx + dy * dy) || 1;
      var len = o.hairLen * (0.6 + R() * 0.8);
      h += '<line x1="' + q1(x) + '" y1="' + q1(y) + '" x2="' + q1(x + dx / L * len + (R() - 0.5) * len * 0.5) + '" y2="' + q1(y + dy / L * len) + '" stroke="' + (R() < 0.5 ? C.hairA : C.hairB) + '" stroke-width="' + q1(o.hairW) + '" stroke-linecap="round" opacity=".8"/>';
    }
    if (o.scales) for (i = 0; i < o.scales.length; i++) {
      var ring = o.scales[i], n = ring[1];
      for (var j = 0; j < n; j++) {
        var ti = Math.round(lerp(4, N - 4, (j + 0.5 + (R() - 0.5) * 0.5) / n)), ee = E[ti];
        var sx = cx + ring[0] * (ee[0] - cx), sy = cy + ring[0] * (ee[1] - cy);
        var ang = Math.atan2(ee[1] - cy, ee[0] - cx) * 180 / Math.PI, sz = ring[2] * (0.8 + R() * 0.4);
        h += '<path transform="translate(' + q1(sx) + ' ' + q1(sy) + ') rotate(' + q1(ang) + ')" d="M' + q1(-sz * 0.5) + ' 0 Q' + q1(-sz * 0.2) + ' ' + q1(-sz * 0.55) + ' ' + q1(sz * 0.9) + ' 0 Q' + q1(-sz * 0.2) + ' ' + q1(sz * 0.55) + ' ' + q1(-sz * 0.5) + ' 0Z" fill="' + C.scale + '" opacity="' + q1(0.7 + R() * 0.3) + '"/>';
      }
    }
    var ytop = o.y - o.d * dome * 0.5;
    var lit = c.linear([[0, '#fff', o.light == null ? 0.42 : o.light], [0.3, '#fff', 0.1], [0.62, '#000', 0], [0.9, '#000', 0.3], [1, '#000', 0.12]], 0, ytop, 0, o.y + o.d);
    h += '<path d="' + top + '" fill="' + lit + '"/>';
    // light catching the crest of the cap
    h += '<path d="' + smooth(A.slice(3, N - 2), false, q1) + '" fill="none" stroke="#fff" stroke-width="' + q1(Math.max(0.6, o.d * 0.12)) + '" opacity=".35" stroke-linecap="round" transform="translate(0 ' + q1(o.d * 0.08) + ')" filter="' + c.f('fsoft') + '"/>';
    // the margin: only round the front, tucking into the bark at the ends
    var rw = o.rimW || o.th * 0.45, IN = [];
    for (i = N; i >= 0; i--) { var ss = Math.pow(Math.sin(Math.PI * i / N), 1.2), ex2 = E[i][0] - cx, ey2 = E[i][1] - cy, LL2 = Math.sqrt(ex2 * ex2 + ey2 * ey2) || 1, k2 = Math.max(0, 1 - rw * ss / LL2); IN.push([cx + ex2 * k2, cy + ey2 * k2]); }
    h += '<path d="' + smooth(E.concat(IN), true, q1) + '" fill="' + C.rim + '" opacity=".95"/>';
    if (o.gloss) h += '<ellipse cx="' + q1(cx - o.w * 0.15) + '" cy="' + q1(o.y + o.d * 0.3) + '" rx="' + q1(o.w * 0.42) + '" ry="' + q1(o.d * 0.25) + '" fill="#fff" opacity="' + o.gloss + '" filter="' + c.f('fsoft') + '"/>';
    o.E = E; o.U = U;
    return h;
  }
  // A bracket above eye level, seen from below: the curved face of the cap, a rounded margin, and the
  // pore surface underneath, receding towards the bark.
  function hoof(c, R, o) {
    var N = 30, T = [], RT = [], M = [], B = [], i, ph = R() * 6.28;
    for (i = 0; i <= N; i++) {
      var t = i / N, th = Math.PI * (1 - t), s = Math.sin(th), co = Math.cos(th);
      var wob = 1 + (o.wav || 0) * Math.sin((o.nw || 2) * Math.PI * t + ph) + (R() - 0.5) * (o.jit || 0.02);
      T.push([o.x + o.w * co, o.y - o.hTop * Math.pow(s, 0.85) * wob]);
      RT.push([o.x + o.w * co * 0.995, o.y - o.m * 0.35 * Math.pow(s, 0.8)]);
      M.push([o.x + o.w * co * 0.985 * (1 + 0.02 * wob), o.y + o.m * Math.pow(s, 0.7) * wob]);
      B.push([o.x + o.w * co * 0.86, o.y + o.m * Math.pow(s, 0.7) * wob + o.u * Math.pow(s, 1.1)]);
    }
    var C = o.cols, h = '';
    h += '<ellipse cx="' + q1(o.x) + '" cy="' + q1(o.y + o.m + o.u * 0.9) + '" rx="' + q1(o.w * 0.85) + '" ry="' + q1(o.u * 0.7 + 1) + '" fill="#000" opacity="' + (o.shadowOp || 0.35) + '" filter="' + c.f('fsoft') + '"/>';
    var und = smooth(M.concat(B.slice().reverse()), true, q1);
    h += '<path d="' + und + '" fill="' + c.linear([[0, C.under], [1, C.underDark || C.under]], 0, o.y + o.m * 0.5, 0, o.y + o.m + o.u) + '"/>';
    if (o.pores) h += '<path d="' + und + '" fill="#000" filter="' + c.f('fpore') + '" opacity="' + o.pores + '"/>';
    var face = smooth(T.concat(M.slice().reverse()), true, q1);
    h += '<path d="' + face + '" fill="' + c.linear([[0, C.c0], [0.45, C.c1], [0.85, C.c2], [1, C.c2]], 0, o.y - o.hTop, 0, o.y) + '"/>';
    if (o.bump) h += '<path d="' + face + '" fill="' + C.c1 + '" filter="' + c.f('fbump') + '" opacity="' + o.bump + '"/>';
    (o.zones || []).forEach(function (f, k) {
      var Z = []; for (i = 2; i <= N - 2; i++) Z.push([lerp(RT[i][0], T[i][0], f), lerp(RT[i][1], T[i][1], f) + (R() - 0.5) * 0.2]);
      h += '<path d="' + smooth(Z, false, q1) + '" fill="none" stroke="' + (k % 2 && C.zone2 ? C.zone2 : C.zone) + '" stroke-width="' + q1(o.zw || 0.6) + '" opacity="' + (o.zop || 0.5) + '" stroke-linecap="round"/>';
    });
    if (o.hairs) for (i = 0; i < o.hairs; i++) {
      var ti = 1 + Math.floor(R() * (N - 2)), f = R(), x = lerp(RT[ti][0], T[ti][0], f), y = lerp(RT[ti][1], T[ti][1], f), len = o.hairLen * (0.6 + R() * 0.8), ang = -Math.PI / 2 + (o.x - x) / o.w * -0.9 + (R() - 0.5) * 0.8;
      h += '<line x1="' + q1(x) + '" y1="' + q1(y) + '" x2="' + q1(x + Math.cos(ang) * len) + '" y2="' + q1(y + Math.sin(ang) * len * 0.6 + len * 0.5) + '" stroke="' + (R() < 0.5 ? C.hairA : C.hairB) + '" stroke-width="' + q1(o.hairW) + '" stroke-linecap="round" opacity=".8"/>';
    }
    if (o.scales) o.scales.forEach(function (ring) {
      for (var j = 0; j < ring[1]; j++) {
        var ti2 = Math.round(lerp(3, N - 3, (j + 0.5 + (R() - 0.5) * 0.5) / ring[1])), sx = lerp(RT[ti2][0], T[ti2][0], ring[0]), sy = lerp(RT[ti2][1], T[ti2][1], ring[0]), sz = ring[2] * (0.8 + R() * 0.4);
        var ang2 = Math.atan2(sy - (o.y + o.hTop * 0.4), sx - o.x) * 180 / Math.PI + 180;
        h += '<path transform="translate(' + q1(sx) + ' ' + q1(sy) + ') rotate(' + q1(ang2) + ')" d="M' + q1(-sz * 0.5) + ' 0 Q' + q1(-sz * 0.2) + ' ' + q1(-sz * 0.5) + ' ' + q1(sz * 0.9) + ' 0 Q' + q1(-sz * 0.2) + ' ' + q1(sz * 0.5) + ' ' + q1(-sz * 0.5) + ' 0Z" fill="' + C.scale + '" opacity="' + q1(0.7 + R() * 0.3) + '"/>';
      }
    });
    h += '<path d="' + face + '" fill="' + c.linear([[0, '#fff', o.light == null ? 0.3 : o.light], [0.45, '#fff', 0.04], [0.8, '#000', 0], [1, '#000', 0.18]], 0, o.y - o.hTop, 0, o.y + o.m * 0.5) + '"/>';
    var IN = []; for (i = N; i >= 0; i--) IN.push(RT[i]);
    h += '<path d="' + smooth(M.concat(IN), true, q1) + '" fill="' + c.linear([[0, C.rim], [1, C.rim2 || C.rim]], 0, o.y - o.m * 0.35, 0, o.y + o.m) + '"/>';
    if (o.gloss) h += '<ellipse cx="' + q1(o.x - o.w * 0.3) + '" cy="' + q1(o.y - o.hTop * 0.55) + '" rx="' + q1(o.w * 0.28) + '" ry="' + q1(o.hTop * 0.18) + '" fill="#fff" opacity="' + o.gloss + '" filter="' + c.f('fsoft') + '"/>';
    o.M = M; o.B = B; o.T = T;
    return h;
  }
  function group(x, y, s, inner, extra) { return '<g transform="translate(' + q(x) + ' ' + q(y) + ') scale(' + (0.01 * (s || 1)) + ')"' + (extra || '') + '>' + inner + '</g>'; }

  var FUNGUS = {
    rosette: function (c, R) {
      var cols = { c0: '#4e341d', c1: '#7f5832', c2: '#a87c4b', rim: '#eadbb9', under: '#efe5cf', underDark: '#d9c9a5', zone: '#3f2814', zone2: '#c09a68' };
      var caps = [[-6, -34, 13, 6, 1.6], [16, -30, 14, 6, 1.6], [-28, -24, 15, 7, 1.8], [34, -20, 15, 7, 1.8], [2, -22, 16, 7, 1.8], [-46, -8, 16, 8, 2], [48, -6, 15, 8, 2], [-20, -6, 20, 10, 2.2], [20, -4, 20, 10, 2.2], [0, 6, 22, 11, 2.4], [-38, 10, 15, 8, 2], [38, 11, 15, 8, 2]];
      var h = '<ellipse cx="0" cy="12" rx="62" ry="14" fill="#000" opacity=".3" filter="' + c.f('fsoft') + '"/>';
      caps.forEach(function (k) {
        var o = { x: k[0], y: k[1], w: k[2], d: k[3], th: k[4], wav: 0.09, nw: 3 + Math.floor(R() * 3), jit: 0.04, cols: cols, zones: [0.32, 0.5, 0.66, 0.8], zw: 0.6, zop: 0.5, pores: 0.25, shadowOp: 0.3 };
        h += shelf(c, R, o);
        // black bruising on the pore surface
        for (var i = 0; i < 3; i++) { var e = o.U[3 + Math.floor(R() * (o.U.length - 6))]; h += '<ellipse cx="' + q1(e[0]) + '" cy="' + q1(e[1] - 0.6) + '" rx="' + q1(1 + R() * 1.6) + '" ry="0.7" fill="#1d1712" opacity=".75"/>'; }
      });
      return { svg: h, box: [-64, -42, 64, 22] };
    },
    tiers: function (c, R) {
      var cols = { c0: '#b9471a', c1: '#d96a20', c2: '#e9933a', rim: '#f2cf62', rim2: '#dfae3e', under: '#e6c350', underDark: '#b3862a', zone: '#a83f16', zone2: '#f0b04a' };
      var old = { c0: '#c2b28d', c1: '#d6c9aa', c2: '#e2d8c0', rim: '#ece5d2', under: '#d9cdae', underDark: '#bcab84', zone: '#a9976f' };
      var h = '<g transform="rotate(-8 -27 30)">' + hoof(c, R, { x: -27, y: 30, w: 9, hTop: 3.5, m: 2.2, u: 2, wav: 0.14, nw: 3, cols: old, zones: [0.5], jit: 0.08 }) + '</g>';
      h += '<path d="M-33 29 l3 2 l2 -1 l3 3" stroke="#a8977a" stroke-width=".4" fill="none"/>';
      // overlapping, lobed fans fused down one side of the stem, biggest in the middle
      var fans = [[3, -27, 9, 4.2], [-5, -21, 12, 4.6], [6, -14, 14, 5], [-3, -7, 18, 5.6], [7, 0, 15, 5.2], [-4, 7, 19, 5.6], [5, 14, 15, 5], [-2, 21, 13, 4.6], [3, 27, 9, 4]];
      fans.forEach(function (k) {
        var rot = (R() - 0.5) * 16;
        h += '<g transform="rotate(' + q1(rot) + ' ' + k[0] + ' ' + k[1] + ')">' + hoof(c, R, { x: k[0], y: k[1], w: k[2], hTop: k[3], m: 2.1, u: 1.6, wav: 0.16, nw: 3 + Math.floor(R() * 2), jit: 0.05, cols: cols, zones: [0.3, 0.55, 0.78], zw: 0.7, zop: 0.3, gloss: 0.12, shadowOp: 0.3 }) + '</g>';
      });
      return { svg: h, box: [-38, -34, 28, 40] };
    },
    shelf: function (c, R) {
      var cols = { c0: '#2a1a0e', c1: '#4a2f1a', c2: '#634128', rim: '#f4efe4', under: '#f3eee3', underDark: '#ddd3c0', zone: '#1d1209', zone2: '#7a5434' };
      var h = '';
      h += shelf(c, R, { x: 14, y: -34, w: 19, d: 9, th: 3, dome: 0.45, wav: 0.05, nw: 2, cols: cols, zones: [0.3, 0.42, 0.54, 0.66, 0.77, 0.86], zw: 0.7, zop: 0.7, rimW: 2.6, bump: 0.5 });
      h += shelf(c, R, { x: -4, y: -14, w: 25, d: 11, th: 3.5, dome: 0.45, wav: 0.05, nw: 2, cols: cols, zones: [0.28, 0.4, 0.52, 0.63, 0.74, 0.84], zw: 0.8, zop: 0.7, rimW: 3, bump: 0.5 });
      // cocoa-brown spore dust on the brackets, bark and grass
      h += '<g filter="' + c.f('fdust') + '"><ellipse cx="2" cy="-30" rx="40" ry="34" fill="' + c.radial([[0, '#7a4521', 0.85], [0.6, '#7a4521', 0.5], [1, '#7a4521', 0]], 2, -30, 40, 0.85) + '"/><ellipse cx="-2" cy="10" rx="44" ry="9" fill="' + c.radial([[0, '#6e3d1c', 0.8], [1, '#6e3d1c', 0]], -2, 10, 44, 0.2) + '"/></g>';
      return { svg: h, box: [-34, -52, 40, 18] };
    },
    hairy: function (c, R) {
      var cols = { c0: '#5a2a10', c1: '#8b4317', c2: '#b0612a', rim: '#d9a347', rim2: '#b87a2e', under: '#a8712f', underDark: '#6e4519', zone: '#6a3212', hairA: '#c47a3a', hairB: '#5e2c10' };
      var dead = { c0: '#100d0b', c1: '#1b1612', c2: '#2a231d', rim: '#3a312a', under: '#2b231d', underDark: '#18130f', zone: '#000', hairA: '#3d3530', hairB: '#0b0908' };
      var h = hoof(c, R, { x: -22, y: 12, w: 8, hTop: 6, m: 2.5, u: 2.5, wav: 0.06, nw: 2, cols: dead, hairs: 90, hairLen: 1.1, hairW: 0.35, bump: 0.6, shadowOp: 0.3 });
      var o = { x: 0, y: 0, w: 13, hTop: 10, m: 3.5, u: 3.5, wav: 0.05, nw: 2, cols: cols, hairs: 520, hairLen: 1.4, hairW: 0.3, shadowOp: 0.35, light: 0.22 };
      h += hoof(c, R, o);
      // glistening amber droplets on the margin and pores
      for (var i = 0; i < 10; i++) { var e = o.M[4 + Math.floor(R() * (o.M.length - 8))], yy = e[1] + R() * 3; h += '<circle cx="' + q1(e[0]) + '" cy="' + q1(yy) + '" r="' + q1(0.6 + R() * 0.6) + '" fill="#e8b85e" opacity=".9"/><circle cx="' + q1(e[0] - 0.25) + '" cy="' + q1(yy - 0.3) + '" r="0.25" fill="#fff8e0"/>'; }
      return { svg: h, box: [-32, -12, 16, 20] };
    },
    hoof: function (c, R) {
      // one hoof; the tree draws three of these
      var cols = { c0: '#9d8058', c1: '#c4ad88', c2: '#ddd0b6', rim: '#f6f2e9', rim2: '#e2dccd', under: '#f4f1ea', underDark: '#cfc7b6', zone: '#9a7f58' };
      var h = hoof(c, R, { x: 0, y: 0, w: 9, hTop: 6.5, m: 3.2, u: 3, wav: 0.03, nw: 1, cols: cols, zones: [0.45], zw: 0.5, zop: 0.25, gloss: 0.25, shadowOp: 0.3 });
      h += '<path d="M-4 -3 q2 1 4 0" stroke="#8f7a5c" stroke-width=".35" fill="none" opacity=".5"/>';
      return { svg: h, box: [-10, -7, 10, 9] };
    },
    scaly: function (c, R) {
      var cols = { c0: '#a88d5f', c1: '#cdb98f', c2: '#e2d5b2', rim: '#efe6cf', rim2: '#d9cba8', under: '#f2ead6', underDark: '#cdbd98', zone: '#8b7048', scale: '#5a3d22' };
      var h = '<path d="M-5 -4 q4 -3 9 1 l-1 5 q-4 1 -8 -1Z" fill="#2a1d14"/>';
      h += hoof(c, R, { x: 0, y: 0, w: 22, hTop: 9, m: 1.6, u: 6, wav: 0.05, nw: 2, cols: cols, scales: [[0.85, 5, 1.3], [0.68, 8, 2.0], [0.5, 10, 2.4], [0.33, 12, 2.4], [0.17, 14, 2.0]], pores: 0.18, shadowOp: 0.3 });
      return { svg: h, box: [-24, -10, 24, 10] };
    },
    tongue: function (c, R) {
      // a fleshy tongue: short stalk at the bark, a broad lobe hanging out and down
      var P = [[-8, -1], [-12, 2], [-14.5, 7], [-14, 12], [-9.5, 16.5], [0, 17.5], [9.5, 16.5], [14, 12], [14.5, 7], [12, 2], [8, -1], [0, -2]];
      P = P.map(function (p) { return [p[0] + (R() - 0.5) * 0.6, p[1] + (R() - 0.5) * 0.6]; });
      var d = smooth(P, true, q1), h = '';
      h += '<path d="' + d + '" fill="#000" opacity=".4" transform="translate(1.5 3)" filter="' + c.f('fsoft') + '"/>';
      // pale pore surface showing under the front lip
      var lip = 'M-14.3 11.5 Q-11 20.5 0 21.5 Q11 20.5 14.2 11.5 Q11 17 0 18 Q-11 17 -14.3 11.5Z';
      h += '<path d="' + lip + '" fill="' + c.linear([[0, '#ecd0bd'], [1, '#b98b76']], 0, 14, 0, 21.5) + '"/><path d="' + lip + '" fill="#000" filter="' + c.f('fpore') + '" opacity=".3"/>';
      h += '<path d="' + d + '" fill="' + c.radial([[0, '#4a1210'], [0.35, '#742019'], [0.78, '#903024'], [1, '#b05a44']], 0, 2, 16, 1.25) + '"/>';
      h += '<path d="' + d + '" fill="#8a2620" filter="' + c.f('fbump') + '" opacity=".28"/>';
      // fine grain running out from the stalk, like the surface of a tongue
      var gid = c.uid('tg'), gr = '';
      c.defs.push('<clipPath id="' + gid + '"><path d="' + d + '"/></clipPath>');
      for (var gi = 0; gi < 60; gi++) { var ga = Math.PI * (0.06 + 0.88 * R()), gl = 3 + R() * 7, g0 = 3 + R() * 8; gr += '<path d="M' + q1(Math.cos(ga) * g0 * 1.3) + ' ' + q1(Math.sin(ga) * g0) + ' L' + q1(Math.cos(ga) * (g0 + gl) * 1.3) + ' ' + q1(Math.sin(ga) * (g0 + gl)) + '" stroke="' + (R() < 0.6 ? '#4a100d' : '#c0685a') + '" stroke-width=".3" opacity=".22" stroke-linecap="round"/>'; }
      h += '<g clip-path="url(#' + gid + ')">' + gr + '</g>';
      h += '<ellipse cx="-4" cy="6" rx="7" ry="3" fill="#fff" opacity=".16" filter="' + c.f('fsoft') + '"/>';
      h += '<path d="' + d + '" fill="' + c.linear([[0, '#fff', 0.14], [0.5, '#fff', 0], [1, '#000', 0.35]], 0, -2, 0, 18) + '"/>';
      h += '<path d="M-3 -1 Q0 -2 3 -1" stroke="#000" stroke-width="1" opacity=".4" fill="none"/>';
      // red juice
      [[-8, 19.6], [2, 21.6], [9, 19.8]].forEach(function (p) { h += '<path d="M' + p[0] + ' ' + p[1] + ' q-0.9 1.8 0 2.6 q0.9 -0.8 0 -2.6Z" fill="#9b1c14"/><circle cx="' + (p[0] - 0.2) + '" cy="' + (p[1] + 1.4) + '" r=".25" fill="#fcd"/>'; });
      return { svg: '<g transform="scale(1.12 0.72)">' + h + '</g>', box: [-17, -3, 17, 18] };
    },
    crust: function (c, R) {
      var h = '', cols = ['#0d0b0a', '#16130f', '#201b17'];
      var crusts = [[-18, -6, 14, 6], [2, -10, 12, 5], [20, -3, 11, 5], [-4, 2, 16, 5], [32, 4, 7, 3], [-34, 3, 8, 3.5]];
      crusts.forEach(function (k, i) {
        var P = blob(R, k[0], k[1], k[2], k[3], 14, 0.28), d = smooth(P, true, q1);
        h += '<path d="' + d + '" fill="#000" opacity=".35" transform="translate(0.8 1.4)" filter="' + c.f('fsoft') + '"/>';
        var fill = c.radial([[0, cols[2]], [0.7, cols[1]], [1, cols[0]]], k[0] - k[2] * 0.2, k[1] - k[3] * 0.3, k[2], k[3] / k[2]);
        h += '<path d="' + d + '" fill="' + fill + '"/><path d="' + d + '" fill="#2b2622" filter="' + c.f('fbump') + '" opacity=".9"/>';
        if (i === 4 || i === 5) h += '<path d="' + d + '" fill="none" stroke="#9a958d" stroke-width=".8" opacity=".8"/>';
        for (var j = 0; j < 3; j++) { var a = P[Math.floor(R() * P.length)], b2 = P[Math.floor(R() * P.length)]; h += '<path d="M' + q1(lerp(a[0], k[0], 0.4)) + ' ' + q1(lerp(a[1], k[1], 0.4)) + ' L' + q1(k[0] + (R() - 0.5) * 3) + ' ' + q1(k[1] + (R() - 0.5) * 2) + ' L' + q1(lerp(b2[0], k[0], 0.5)) + ' ' + q1(lerp(b2[1], k[1], 0.5)) + '" stroke="#3d3833" stroke-width=".35" fill="none"/>'; }
        for (j = 0; j < 6; j++) h += '<circle cx="' + q1(k[0] + (R() - 0.5) * k[2] * 1.2) + '" cy="' + q1(k[1] + (R() - 0.5) * k[3] * 1.1) + '" r="' + q1(0.4 + R() * 0.7) + '" fill="#4a4540" opacity=".6"/>';
      });
      return { svg: h, box: [-44, -18, 42, 10] };
    },
    tufts: function (c, R) {
      var h = '';
      function shroom(x, y, ht, cr, tilt) {
        var tx = x + tilt * ht, ty = y - ht, s = '';
        var sg = c.linear([[0, '#efe3c6'], [0.55, '#d8c39b'], [1, '#7e5c34']], 0, ty, 0, y);
        s += '<path d="M' + q1(x - cr * 0.14) + ' ' + q1(y) + ' Q' + q1(x + tilt * ht * 0.4 - cr * 0.2) + ' ' + q1(y - ht * 0.5) + ' ' + q1(tx - cr * 0.1) + ' ' + q1(ty) + ' L' + q1(tx + cr * 0.1) + ' ' + q1(ty) + ' Q' + q1(x + tilt * ht * 0.4 + cr * 0.2) + ' ' + q1(y - ht * 0.5) + ' ' + q1(x + cr * 0.14) + ' ' + q1(y) + 'Z" fill="' + sg + '"/>';
        var ry2 = ty + ht * 0.22, rx2 = tx - tilt * ht * 0.22;
        s += '<path d="M' + q1(rx2 - cr * 0.24) + ' ' + q1(ry2) + ' q' + q1(cr * 0.24) + ' ' + q1(cr * 0.18) + ' ' + q1(cr * 0.48) + ' 0 l-' + q1(cr * 0.06) + ' ' + q1(cr * 0.16) + ' q-' + q1(cr * 0.18) + ' ' + q1(cr * 0.1) + ' -' + q1(cr * 0.36) + ' 0Z" fill="#f4ead2" stroke="#c9b48a" stroke-width=".25"/>';
        // gills, then cap
        s += '<path d="M' + q1(tx - cr) + ' ' + q1(ty) + ' Q' + q1(tx) + ' ' + q1(ty + cr * 0.32) + ' ' + q1(tx + cr) + ' ' + q1(ty) + 'Z" fill="#eadbb7"/>';
        for (var g = -4; g <= 4; g++) s += '<line x1="' + q1(tx + g * cr * 0.22) + '" y1="' + q1(ty + 0.2) + '" x2="' + q1(tx + g * cr * 0.06) + '" y2="' + q1(ty + cr * 0.2) + '" stroke="#c7b088" stroke-width=".2"/>';
        var capFill = c.radial([[0, '#6e4518'], [0.35, '#a46d26'], [0.8, '#c99440'], [1, '#d8ab55']], tx - cr * 0.2, ty - cr * 0.5, cr * 1.2, 0.6);
        s += '<path d="M' + q1(tx - cr) + ' ' + q1(ty) + ' C' + q1(tx - cr) + ' ' + q1(ty - cr * 0.62) + ' ' + q1(tx + cr) + ' ' + q1(ty - cr * 0.62) + ' ' + q1(tx + cr) + ' ' + q1(ty) + ' Q' + q1(tx) + ' ' + q1(ty + cr * 0.12) + ' ' + q1(tx - cr) + ' ' + q1(ty) + 'Z" fill="' + capFill + '"/>';
        for (var k = 0; k < 10; k++) { var ax = (R() - 0.5) * cr * 1.2 * (k < 6 ? 0.5 : 1); s += '<ellipse cx="' + q1(tx + ax) + '" cy="' + q1(ty - cr * 0.38 + Math.abs(ax) * 0.25) + '" rx="' + q1(cr * 0.06) + '" ry="' + q1(cr * 0.035) + '" fill="#4a2c0e" opacity=".7"/>'; }
        s += '<path d="M' + q1(tx - cr * 0.5) + ' ' + q1(ty - cr * 0.36) + ' Q' + q1(tx - cr * 0.1) + ' ' + q1(ty - cr * 0.5) + ' ' + q1(tx + cr * 0.3) + ' ' + q1(ty - cr * 0.42) + '" stroke="#f1d38a" stroke-width="' + q1(cr * 0.06) + '" fill="none" opacity=".45" stroke-linecap="round"/>';
        return s;
      }
      // white mycelial fan under a lifted flap of bark, and bootlace rhizomorphs
      var i, crack = [[-1, -50], [3, -44], [5, -36], [4, -28], [0, -22], [-4, -28], [-6, -37], [-4, -45]];
      h += '<path d="' + smooth(crack, true, q1) + '" fill="#2a1a12"/>';
      h += '<path d="' + smooth(crack.map(function (p) { return [p[0] * 0.72 - 0.3, -36 + (p[1] + 36) * 0.9]; }), true, q1) + '" fill="' + c.linear([[0, '#f3efe2'], [1, '#d6ceb8']], 0, -48, 0, -24) + '"/>';
      for (i = 0; i < 9; i++) h += '<path d="M' + q1(-0.5 + (R() - 0.5)) + ' -24 Q' + q1((i - 4) * 0.9) + ' -34 ' + q1((i - 4) * 0.7 + (R() - 0.5)) + ' ' + q1(-46 + R() * 3) + '" stroke="#c9c1aa" stroke-width=".25" fill="none"/>';
      h += '<path d="' + smooth([[3, -45], [7, -43], [8, -35], [6, -27], [4, -29], [5, -36]], true, q1) + '" fill="#6a3d30"/>';
      for (i = 0; i < 6; i++) { var sx = -40 + i * 15 + R() * 6; h += '<path d="M' + q1(sx) + ' 4 q' + q1(3 + R() * 4) + ' -2 ' + q1(5 + R() * 4) + ' 2 t' + q1(6 + R() * 3) + ' 1 t5 -2" stroke="#120d0a" stroke-width=".7" fill="none" stroke-linecap="round"/>'; }
      // two tufts, back to front
      var tuft = [];
      [[-30, 2], [24, 3]].forEach(function (b, bi) { for (var j = 0; j < 8; j++) tuft.push([b[0] + (R() - 0.5) * 14, b[1] + R() * 2, 7 + R() * 9, 3.6 + R() * 3, (R() - 0.5) * 0.7 + (bi ? 0.15 : -0.15)]); });
      tuft.sort(function (a, b) { return a[2] - b[2]; }).reverse();
      h += '<ellipse cx="-30" cy="5" rx="14" ry="3" fill="#000" opacity=".3" filter="' + c.f('fsoft') + '"/><ellipse cx="24" cy="6" rx="14" ry="3" fill="#000" opacity=".3" filter="' + c.f('fsoft') + '"/>';
      tuft.forEach(function (m) { h += shroom(m[0], m[1], m[2], m[3], m[4]); });
      return { svg: h, box: [-46, -52, 42, 8] };
    },
    ears: function (c, R) {
      var h = '';
      [[-9, 2, 4.2, 5, -20], [-1, 3, 5.5, 6, 10], [8, 1.5, 4.6, 5.2, 25], [15, 3, 3, 3.6, -10]].forEach(function (e) {
        var P = [], n = 14;
        for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2, k = 1 + (i === 3 ? -0.35 : 0) + (R() - 0.5) * 0.18; P.push([Math.cos(a) * e[2] * k, Math.sin(a) * e[3] * k]); }
        var d = smooth(P, true, q1);
        var g = '<path d="' + d + '" fill="#000" opacity=".35" transform="translate(0.6 1)" filter="' + c.f('fsoft') + '"/>';
        g += '<path d="' + d + '" fill="' + c.radial([[0, '#4f2416'], [0.6, '#74392a'], [1, '#a2634a']], 0, 0, Math.max(e[2], e[3]), e[3] / e[2]) + '" opacity=".95"/>';
        for (var v = 0; v < 4; v++) g += '<path d="M' + q1((R() - 0.5) * e[2] * 0.6) + ' ' + q1(-e[3] * 0.5) + ' q' + q1((R() - 0.5) * e[2]) + ' ' + q1(e[3] * 0.5) + ' ' + q1((R() - 0.5) * e[2] * 0.8) + ' ' + q1(e[3] * 0.9) + '" stroke="#3b1a0f" stroke-width=".35" fill="none" opacity=".7"/>';
        g += '<path d="' + d + '" fill="none" stroke="#b9775a" stroke-width=".4" opacity=".7"/>';
        g += '<ellipse cx="' + q1(-e[2] * 0.3) + '" cy="' + q1(-e[3] * 0.3) + '" rx="' + q1(e[2] * 0.35) + '" ry="' + q1(e[3] * 0.2) + '" fill="#fff" opacity=".22" filter="' + c.f('fsoft') + '"/>';
        h += '<g transform="translate(' + e[0] + ' ' + e[1] + ') rotate(' + e[4] + ')">' + g + '</g>';
      });
      return { svg: h, box: [-15, -6, 20, 10] };
    }
  };

  return { rng: rng, hash: hash, q: q, q1: q1, clamp: clamp, lerp: lerp, pick: pick, rr: rr, smooth: smooth, blob: blob, Ctx: Ctx, BARK: BARK, LEAF: LEAF, SPARSE: SPARSE, filters: filters, barkFilter: barkFilter, FUNGUS: FUNGUS, group: group };
})();

/* Line Clear — game UI (Oakwick Games, October 2026) */
(function () {
  'use strict';
  var CFG = window.OAKWICK_CONFIG || {};
  var LC = window.LineClear;
  var TREES = LC.trees();
  var S = LC.SCENE;
  var KEY = 'oakwick-lc-' + (CFG.round || 'x');
  var DEMO = !CFG.apiUrl;
  var $ = function (id) { return document.getElementById(id); };
  var DEG = Math.PI / 180;

  // ---------------- storage (best effort) ----------------
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(KEY + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem(KEY + k); } catch (e) { } }
  };

  // ---------------- server ----------------
  function demoBoard() { return store.get('-demoboard') || []; }
  function sortTop(list) {
    return list.slice().sort(function (a, b) { return b.score - a.score || a.secs - b.secs || a.at - b.at; }).slice(0, 10);
  }
  var API = {
    post: function (body) {
      body.round = CFG.round; body.version = LC.VERSION;
      return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    start: function (code, name) {
      if (DEMO) return Promise.resolve({ ok: true, token: 'demo-' + Date.now() });
      return API.post({ action: 'start', code: code, name: name });
    },
    submit: function (st) {
      if (DEMO) {
        var res = LC.scoreAll(st.cuts), board = demoBoard();
        var entry = { name: st.name, score: res.total, secs: Math.round((Date.now() - st.startedAt) / 1000), at: Date.now() };
        board.push(entry); store.set('-demoboard', board);
        return Promise.resolve({ ok: true, score: res.total, secs: entry.secs, top: sortTop(board) });
      }
      return API.post({ action: 'submit', code: st.code, token: st.token, name: st.name, cuts: clean(st.cuts) });
    },
    top: function () {
      if (DEMO) return Promise.resolve({ ok: true, top: sortTop(demoBoard()) });
      return fetch(CFG.apiUrl + '?action=top&round=' + encodeURIComponent(CFG.round)).then(function (r) { return r.json(); });
    }
  };
  var ERR = {
    invalid: "That code isn't recognised. Check it and try again.",
    used: 'That code has already been used. Each code gives one attempt only.',
    started: 'That code has already been used to start an attempt. Each code gives one attempt only.',
    closed: 'This round has closed. Look out for next month’s game!',
    token: 'This attempt could not be verified. Please contact the organiser.',
    name: 'Please enter your name (2–24 characters).',
    version: 'The game has been updated. Please refresh the page.',
    network: "Couldn't reach the scoreboard. Check your connection and try again."
  };
  function errText(e) { return ERR[e] || ERR.network; }

  // ---------------- state ----------------
  var state = store.get('-state');   // {code, token, name, cuts, startedAt}
  var done = store.get('-done');     // {name, score, cuts, secs}
  var edit = null;                   // {idx, cut}
  var layers = { ghost: true };      // clearance zones are hidden during play; shown only on results
  var timerId = null;

  function clean(o) { return JSON.parse(JSON.stringify(o, function (k, v) { return k.charAt(0) === '_' ? undefined : v; })); }
  function save() { if (state) store.set('-state', clean(state)); }
  function fmtTime(secs) { secs = Math.max(0, Math.round(secs)); var m = Math.floor(secs / 60), s = secs % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function show(name) {
    ['screenIntro', 'screenPlay', 'screenResults'].forEach(function (id) { $(id).hidden = id !== name; });
    $('hud').hidden = name !== 'screenPlay';
    document.body.classList.toggle('playing', name === 'screenPlay');
    window.scrollTo(0, 0);
    if (name === 'screenPlay') { resize(); }
  }

  var toastT;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------------- leaderboard ----------------
  function renderBoard(el, top, me) {
    if (!top || !top.length) { el.innerHTML = '<li class="muted">No scores yet. Yours could be the first.</li>'; return; }
    el.innerHTML = top.map(function (r) {
      var mine = me && r.name === me.name && r.score === me.score;
      return '<li' + (mine ? ' class="me"' : '') + '><span class="nm">' + esc(r.name) + '</span><span class="tm">' + (r.secs != null ? fmtTime(r.secs) : '') + '</span><span class="sc">' + r.score + '</span></li>';
    }).join('');
  }
  function loadBoard() {
    API.top().then(function (r) {
      if (r && r.ok) { renderBoard($('boardIntro'), r.top, done); renderBoard($('boardResults'), r.top, done); }
      else $('boardIntro').innerHTML = '<li class="muted">Scoreboard unavailable right now.</li>';
    }).catch(function () { $('boardIntro').innerHTML = '<li class="muted">Scoreboard unavailable right now.</li>'; });
  }

  // =====================================================================
  //  RENDERING
  // =====================================================================
  var BARK = '#6b4a31', BARK_DK = '#3e2a1a', LEAF = 'rgba(78,143,67,0.62)', LEAF_GHOST = 'rgba(78,143,67,0.13)';

  function makeCam(x0, x1, y0, y1, w, h) {
    var k = Math.min(w / (x1 - x0), h / (y1 - y0));
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k: k, w: w, h: h };
  }
  function w2s(cam, x, y) { return [(x - cam.x) * cam.k + cam.w / 2, cam.h / 2 - (y - cam.y) * cam.k]; }
  function s2w(cam, sx, sy) { return [(sx - cam.w / 2) / cam.k + cam.x, cam.y - (sy - cam.h / 2) / cam.k]; }

  function cutsFor(t, list) { return list.filter(function (c) { return c.t === t; }); }

  // stroke a branch between params [from,to]
  function strokeBranch(ctx, cam, b, from, to, color, minW) {
    ctx.strokeStyle = color;
    for (var i = 1; i < b.pts.length; i++) {
      var s0 = b.cum[i - 1], s1 = b.cum[i];
      if (s1 <= from || s0 >= to) continue;
      var a = s0 < from ? LC.pointAt(b, from) : { x: b.pts[i - 1][0], y: b.pts[i - 1][1] };
      var c = s1 > to ? LC.pointAt(b, to) : { x: b.pts[i][0], y: b.pts[i][1] };
      var p = w2s(cam, a.x, a.y), q = w2s(cam, c.x, c.y);
      ctx.lineWidth = Math.max(minW, b.d[i - 1] * cam.k);
      ctx.lineCap = (s1 > to || s0 < from) ? 'butt' : 'round';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    ctx.lineCap = 'round';
  }
  function foliagePath(ctx, cam, tree, keep, removed) {
    ctx.beginPath();
    tree.branches.forEach(function (b, i) {
      var L = keep[i];
      b.lf.forEach(function (f) {
        var gone = L < 0 || f.s > L;
        if (gone !== removed) return;
        var p = w2s(cam, f.x, f.y);
        ctx.moveTo(p[0] + f.r * cam.k, p[1]); ctx.arc(p[0], p[1], f.r * cam.k, 0, Math.PI * 2);
      });
    });
  }
  function drawTree(ctx, cam, tree, keep, opts) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (opts.ghost) {
      foliagePath(ctx, cam, tree, keep, true); ctx.fillStyle = LEAF_GHOST; ctx.fill();
      tree.branches.forEach(function (b, i) { var L = keep[i]; if (L < b.len) strokeBranch(ctx, cam, b, Math.max(0, L), b.len, '#c4b8aa', 1); });
    }
    foliagePath(ctx, cam, tree, keep, false); ctx.fillStyle = LEAF; ctx.fill();
    tree.branches.forEach(function (b, i) { var L = keep[i]; if (L > 0) strokeBranch(ctx, cam, b, 0, L, BARK, 1); });
  }

  function circleUnionOutline(ctx, cam, circles) {
    ctx.beginPath();
    circles.forEach(function (c, ci) {
      var started = false;
      for (var a = 0; a <= 360; a += 2) {
        var x = c.x + Math.cos(a * DEG) * c.r, y = c.y + Math.sin(a * DEG) * c.r;
        var inside = circles.some(function (o, oi) { return oi !== ci && Math.hypot(x - o.x, y - o.y) < o.r - 1e-6; });
        var p = w2s(cam, x, y);
        if (inside) { started = false; continue; }
        if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
      }
    });
  }

  function label(ctx, text, x, y, color, align) {
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(text).width + 12;
    var bx = align === 'left' ? x - 6 : align === 'right' ? x - w + 6 : x - w / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, bx, y - 10, w, 20, 6); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y + 0.5);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawZones(ctx, cam) {
    var C = S.conductors, xA = C[0].x - TREES[0].target;
    // Tree A side corridor
    var p0 = w2s(cam, xA, 16), p1 = w2s(cam, C[0].x, 0);
    ctx.fillStyle = 'rgba(47,111,179,0.10)'; ctx.fillRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
    ctx.setLineDash([7, 5]); ctx.strokeStyle = '#2f6fb3'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p0[0], p1[1]); ctx.stroke();
    // dimension arrow
    var dy = 13.6, a = w2s(cam, xA, dy), b = w2s(cam, C[0].x, dy);
    ctx.setLineDash([]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    [[a, 1], [b, -1]].forEach(function (e) { ctx.beginPath(); ctx.moveTo(e[0][0] + 7 * e[1], e[0][1] - 4); ctx.lineTo(e[0][0], e[0][1]); ctx.lineTo(e[0][0] + 7 * e[1], e[0][1] + 4); ctx.stroke(); });
    var bt = w2s(cam, C[0].x, 9); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(bt[0], bt[1]); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'A · 4.5 m side clearance', (a[0] + b[0]) / 2, a[1] - 14, '#2f6fb3');
    // Tree B radial envelope
    var circles = C.map(function (c) { return { x: c.x, y: c.y, r: TREES[1].target }; });
    ctx.beginPath();
    circles.forEach(function (c) { var p = w2s(cam, c.x, c.y); ctx.moveTo(p[0] + c.r * cam.k, p[1]); ctx.arc(p[0], p[1], c.r * cam.k, 0, Math.PI * 2); });
    ctx.fillStyle = 'rgba(138,79,176,0.10)'; ctx.fill('nonzero');
    ctx.setLineDash([7, 5]); ctx.strokeStyle = '#8a4fb0'; ctx.lineWidth = 1.6;
    circleUnionOutline(ctx, cam, circles); ctx.stroke(); ctx.setLineDash([]);
    var lb = w2s(cam, C[1].x, C[1].y + TREES[1].target);
    label(ctx, 'B · 3.0 m restricted', lb[0], lb[1] - 14, '#8a4fb0');
  }

  function drawPole(ctx, cam) {
    var P = S.pole, C = S.conductors;
    var a = w2s(cam, P.x - 0.14, P.top), b = w2s(cam, P.x + 0.14, 0);
    var g = ctx.createLinearGradient(a[0], 0, b[0], 0); g.addColorStop(0, '#6e5134'); g.addColorStop(0.5, '#8b6a45'); g.addColorStop(1, '#5c4329');
    ctx.fillStyle = g; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    // crossarm
    var c0 = w2s(cam, P.x - P.armHalf, 8.8), c1 = w2s(cam, P.x + P.armHalf, 8.66);
    ctx.fillStyle = '#4b4f52'; ctx.fillRect(c0[0], c0[1], c1[0] - c0[0], c1[1] - c0[1]);
    // insulators + conductors
    C.forEach(function (c) {
      var i0 = w2s(cam, c.x - 0.05, c.y - 0.02), i1 = w2s(cam, c.x + 0.05, 8.8);
      ctx.fillStyle = '#9fb3c4'; ctx.fillRect(i0[0], i0[1], i1[0] - i0[0], i1[1] - i0[1]);
      var p = w2s(cam, c.x, c.y), r = Math.max(3.5, 0.05 * cam.k);
      ctx.beginPath(); ctx.arc(p[0], p[1], r + 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,200,0,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = '#1b1f1c'; ctx.fill();
    });
    var t = w2s(cam, P.x, P.top + 0.5);
    label(ctx, '11kV', t[0], t[1], '#1b1f1c');
  }

  function drawBackdrop(ctx, cam, opts) {
    var w = cam.w, h = cam.h;
    var gy = w2s(cam, 0, 0)[1];
    var sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, '#9ccbe6'); sky.addColorStop(1, '#e3f0f5');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // far hills
    ctx.fillStyle = '#b9d4c4';
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (var x = -40; x <= 40; x += 1) { var p = w2s(cam, x, 1.2 + 1.1 * Math.sin(x * 0.21) + 0.6 * Math.sin(x * 0.53 + 1)); ctx.lineTo(p[0], p[1]); }
    ctx.lineTo(w, gy); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fae6a'; ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = '#6f9f5b'; ctx.fillRect(0, gy, w, Math.max(2, 0.12 * cam.k));
  }

  function drawCutMarker(ctx, cam, c, num, active) {
    var tree = TREES[c.t], b = tree.branches[c.b], P = LC.pointAt(b, c.s), D = LC.diamAt(tree, b, c.s);
    var ang = Math.atan2(P.uy, P.ux) + (90 + c.a) * DEG;
    var half = num == null ? Math.max(4, D * cam.k * 0.8) : Math.max(8, D * cam.k * 0.9);
    var p = w2s(cam, P.x, P.y), dx = Math.cos(ang) * half, dy = -Math.sin(ang) * half;
    ctx.lineCap = 'round';
    ctx.strokeStyle = active ? '#fff' : '#1b1f1c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(p[0] - dx, p[1] - dy); ctx.lineTo(p[0] + dx, p[1] + dy); ctx.stroke();
    ctx.strokeStyle = '#ff7a00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0] - dx, p[1] - dy); ctx.lineTo(p[0] + dx, p[1] + dy); ctx.stroke();
    if (num != null) {
      var bx = p[0] + dx + (dx >= 0 ? 9 : -9), by = p[1] + dy - 9;
      ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fillStyle = active ? '#fff' : '#ff7a00'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b1f1c'; ctx.stroke();
      ctx.fillStyle = '#1b1f1c'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(num, bx, by + 0.5);
      c._badge = [bx, by];
    }
    c._screen = p;
  }

  function drawScaleBar(ctx, cam, top) {
    var target = (top ? 70 : 110) / cam.k, nice = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10], L = nice[0];
    nice.forEach(function (n) { if (n <= target) L = n; });
    var x = 14, y = top ? 34 : cam.h - 18, w = L * cam.k;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; roundRect(ctx, x - 6, y - 20, w + 12, 28, 6); ctx.fill();
    ctx.strokeStyle = '#1b1f1c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5); ctx.stroke();
    ctx.fillStyle = '#1b1f1c'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(L >= 1 ? L + ' m' : Math.round(L * 100) + ' cm', x + w / 2, y - 8);
  }

  function drawNearest(ctx, cam, res) {
    res.trees.forEach(function (tr, ti) {
      var cl = tr.clearance, col = ti === 0 ? '#2f6fb3' : '#8a4fb0', C = S.conductors;
      var p = w2s(cam, cl.x, cl.y), q;
      if (tr.rule === 'side') q = w2s(cam, C[0].x, cl.y);
      else { var best = C[0]; C.forEach(function (c) { if (Math.hypot(c.x - cl.x, c.y - cl.y) < Math.hypot(best.x - cl.x, best.y - cl.y)) best = c; }); q = w2s(cam, best.x, best.y); }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      label(ctx, tr.id + ': ' + cl.d.toFixed(2) + ' m', (p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 14, col);
    });
  }

  function drawScene(ctx, cam, o) {
    ctx.save();
    drawBackdrop(ctx, cam, o);
    if (o.zones) drawZones(ctx, cam);
    TREES.forEach(function (t, i) { drawTree(ctx, cam, t, o.keep[i], o); });
    drawPole(ctx, cam);
    if (o.cuts) o.cuts.forEach(function (c, i) { if (!o.skipIdx || i !== o.skipIdx.i) drawCutMarker(ctx, cam, c, o.noBadges ? null : i + 1, false); });
    if (o.pending) drawCutMarker(ctx, cam, o.pending, o.pendingNum, true);
    if (o.nearest) drawNearest(ctx, cam, o.nearest);
    drawScaleBar(ctx, cam);
    ctx.restore();
  }

  // =====================================================================
  //  PLAY SCREEN
  // =====================================================================
  var canvas = $('scene'), ctx = canvas.getContext('2d');
  var cam = null, dpr = 1, dirty = true;
  var VIEWS = { all: [-15.5, 13.5, -0.4, 14.6], A: [-14.2, -1.2, 1.5, 14.2], B: [-0.2, 12.8, 1.5, 14.2] };

  function currentKeep() {
    var cuts = state ? state.cuts : [];
    return TREES.map(function (t) {
      var list = cutsFor(t.index, cuts.filter(function (_, i) { return !edit || i !== edit.idx; }));
      if (edit && edit.cut.t === t.index) list = list.concat([edit.cut]);
      return LC.retainedLengths(t, list);
    });
  }
  function keepOthers(t) {
    var cuts = state.cuts.filter(function (c, i) { return c.t === t && (!edit || i !== edit.idx); });
    return LC.retainedLengths(TREES[t], cuts);
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    if (!cam) { var v = VIEWS.all; cam = makeCam(v[0], v[1], v[2], v[3], r.width, r.height); }
    else { cam.w = r.width; cam.h = r.height; }
    dirty = true;
    if (edit) sizeCloseup();
  }
  function setView(name) {
    var v = VIEWS[name], r = canvas.getBoundingClientRect();
    cam = makeCam(v[0], v[1], v[2], v[3], r.width, r.height); dirty = true;
  }
  function zoomAt(f, sx, sy) {
    var w = s2w(cam, sx, sy);
    cam.k = Math.max(8, Math.min(2500, cam.k * f));
    var w2 = s2w(cam, sx, sy);
    cam.x += w[0] - w2[0]; cam.y += w[1] - w2[1]; dirty = true;
  }
  function frame() {
    if (dirty && cam && !$('screenPlay').hidden) {
      dirty = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, cam, {
        keep: currentKeep(), zones: false, ghost: layers.ghost,
        cuts: state.cuts, skipIdx: edit && edit.idx >= 0 ? { i: edit.idx } : null,
        pending: edit ? edit.cut : null, pendingNum: edit ? (edit.idx >= 0 ? edit.idx + 1 : state.cuts.length + 1) : null
      });
    }
    requestAnimationFrame(frame);
  }

  // ---- pointer handling ----
  var ptrs = {}, gesture = null;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY };
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    } else {
      gesture = { type: 'tap', sx: e.offsetX, sy: e.offsetY, lx: e.offsetX, ly: e.offsetY, moved: false, touch: e.pointerType !== 'mouse' };
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId] || !gesture) return;
    ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY };
    if (gesture.type === 'pinch') {
      var ids = Object.keys(ptrs); if (ids.length < 2) return;
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.x -= (mx - gesture.mx) / cam.k; cam.y += (my - gesture.my) / cam.k;
      if (gesture.d > 0) zoomAt(d / gesture.d, mx, my);
      gesture.d = d; gesture.mx = mx; gesture.my = my; dirty = true;
      return;
    }
    var dx = e.offsetX - gesture.sx, dy = e.offsetY - gesture.sy;
    if (!gesture.moved && Math.hypot(dx, dy) > (gesture.touch ? 10 : 6)) {
      gesture.moved = true;
      gesture.type = 'pan'; $('stage').classList.add('panning');
    }
    if (gesture.type === 'pan') {
      cam.x -= (e.offsetX - gesture.lx) / cam.k; cam.y += (e.offsetY - gesture.ly) / cam.k; dirty = true;
    }
    gesture.lx = e.offsetX; gesture.ly = e.offsetY;
  });
  function endPtr(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    $('stage').classList.remove('panning');
    if (gesture && gesture.type === 'tap' && !gesture.moved && e.type === 'pointerup') {
      handleTap(e.offsetX, e.offsetY, gesture.touch);
    }
    if (Object.keys(ptrs).length === 0) gesture = null;
    else if (gesture && gesture.type === 'pinch') gesture = { type: 'pan-rest', moved: true };
  }
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });

  function handleTap(sx, sy, touch) {
    var R = touch ? 1.8 : 1;
    // existing markers first
    for (var i = state.cuts.length - 1; i >= 0; i--) {
      var c = state.cuts[i];
      if ((c._badge && Math.hypot(c._badge[0] - sx, c._badge[1] - sy) < 12 * R) || (c._screen && Math.hypot(c._screen[0] - sx, c._screen[1] - sy) < 9 * R)) { openEditor(i); return; }
    }
    var w = s2w(cam, sx, sy), best = null, tol = 14 * R / cam.k;
    TREES.forEach(function (t) {
      var hit = LC.pick(t, keepOthers(t.index), w[0], w[1], tol);
      if (hit && (!best || hit.dist < best.dist)) best = { t: t.index, b: hit.b, s: hit.s, dist: hit.dist };
    });
    if (!best) { toast('Tap on a branch to mark a cut there.'); return; }
    if (best.b === 0 && best.s < 2.5) { toast('That would fell the tree, which isn’t in the job spec.'); return; }
    var s = Math.round(best.s * 1000) / 1000;
    if (edit) { edit.cut = { t: best.t, b: best.b, s: s, a: edit.cut.a, m: edit.cut.m }; refreshEditor(); dirty = true; return; }
    openEditor(-1, { t: best.t, b: best.b, s: s, a: 0, m: 1 });
  }

  // ---- tools / buttons ----
  document.querySelectorAll('[data-view]').forEach(function (btn) { btn.addEventListener('click', function () { setView(btn.dataset.view); }); });
  document.querySelectorAll('[data-zoom]').forEach(function (btn) { btn.addEventListener('click', function () { zoomAt(btn.dataset.zoom > 0 ? 1.5 : 1 / 1.5, cam.w / 2, cam.h / 2); }); });
  document.querySelectorAll('[data-layer]').forEach(function (btn) {
    btn.addEventListener('click', function () { var k = btn.dataset.layer; layers[k] = !layers[k]; btn.classList.toggle('on', layers[k]); dirty = true; });
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe($('stage'));

  // =====================================================================
  //  CUT EDITOR
  // =====================================================================
  var cu = $('closeup'), cctx = cu.getContext('2d'), cdpr = 1;
  function sizeCloseup() {
    var r = cu.getBoundingClientRect(); if (!r.width) return;
    cdpr = window.devicePixelRatio || 1; cu.width = Math.round(r.width * cdpr); cu.height = Math.round(r.height * cdpr);
    drawCloseup();
  }
  function openEditor(idx, cut) {
    edit = { idx: idx, cut: idx >= 0 ? Object.assign({}, state.cuts[idx]) : cut };
    $('listView').hidden = true; $('editView').hidden = false; $('panel').classList.add('editing');
    $('btnDelete').hidden = idx < 0;
    $('btnConfirm').textContent = idx < 0 ? 'Confirm cut' : 'Update cut';
    requestAnimationFrame(function () { resize(); sizeCloseup(); });
    refreshEditor(); dirty = true;
  }
  function closeEditor() {
    edit = null; $('listView').hidden = false; $('editView').hidden = true; $('panel').classList.remove('editing');
    $('panel').classList.add('collapsed');
    renderCutList(); requestAnimationFrame(resize); dirty = true;
  }
  function refreshEditor() {
    var c = edit.cut, tree = TREES[c.t];
    $('editTitle').textContent = (edit.idx >= 0 ? 'Cut ' + (edit.idx + 1) : 'New cut') + ' · Tree ' + tree.id;
    $('roDiam').textContent = Math.round(LC.diamAt(tree, tree.branches[c.b], c.s) * 1000) + ' mm';
    $('roAngle').textContent = (c.a > 0 ? '+' : '') + c.a + '°';
    $('inAngle').value = c.a;
    document.querySelectorAll('#segMethod button').forEach(function (b) { b.classList.toggle('on', +b.dataset.m === c.m); });
    drawCloseup(); dirty = true;
  }
  function moveCut(ds) {
    var c = edit.cut, b = TREES[c.t].branches[c.b], ko = keepOthers(c.t)[c.b];
    var max = Math.min(b.len - 0.005, ko < 0 ? b.len : ko);
    var min = c.b === 0 ? 2.5 : 0.005;
    c.s = Math.round(Math.max(min, Math.min(max, c.s + ds)) * 1000) / 1000;
    refreshEditor();
  }
  document.querySelectorAll('[data-nudge]').forEach(function (btn) { btn.addEventListener('click', function () { moveCut(+btn.dataset.nudge); }); });
  document.querySelectorAll('[data-ang]').forEach(function (btn) { btn.addEventListener('click', function () { edit.cut.a = Math.max(-60, Math.min(60, edit.cut.a + (+btn.dataset.ang))); refreshEditor(); }); });
  $('inAngle').addEventListener('input', function () { edit.cut.a = +this.value; refreshEditor(); });
  document.querySelectorAll('#segMethod button').forEach(function (btn) { btn.addEventListener('click', function () { edit.cut.m = +btn.dataset.m; refreshEditor(); }); });
  $('btnEditClose').addEventListener('click', closeEditor);
  $('btnConfirm').addEventListener('click', function () {
    var c = { t: edit.cut.t, b: edit.cut.b, s: edit.cut.s, a: edit.cut.a, m: edit.cut.m };
    if (edit.idx >= 0) state.cuts[edit.idx] = c; else state.cuts.push(c);
    // drop cuts that are now on wood being removed
    var tree = TREES[c.t], removed = 0;
    for (var i = state.cuts.length - 1; i >= 0; i--) {
      if (state.cuts[i].t !== c.t) continue;
      var same = cutsFor(c.t, state.cuts), j = same.indexOf(state.cuts[i]);
      if (LC.isRedundant(tree, same, j)) { state.cuts.splice(i, 1); removed++; }
    }
    if (removed) toast(removed + ' earlier cut' + (removed > 1 ? 's were' : ' was') + ' on wood you’re now removing, so ' + (removed > 1 ? 'they were' : 'it was') + ' taken off.');
    save(); closeEditor();
  });
  $('btnDelete').addEventListener('click', function () { state.cuts.splice(edit.idx, 1); save(); closeEditor(); });
  document.addEventListener('keydown', function (e) {
    if (!edit || $('screenPlay').hidden || /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
    if (e.key === 'Escape') closeEditor();
    else if (e.key === 'ArrowRight') { moveCut(e.shiftKey ? 0.05 : 0.01); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { moveCut(e.shiftKey ? -0.05 : -0.01); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { edit.cut.a = Math.min(60, edit.cut.a + 1); refreshEditor(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { edit.cut.a = Math.max(-60, edit.cut.a - 1); refreshEditor(); e.preventDefault(); }
    else if (e.key === 'Enter') $('btnConfirm').click();
  });

  // close-up drag
  var cdrag = null, ccam = null;
  cu.addEventListener('pointerdown', function (e) { cu.setPointerCapture(e.pointerId); cdrag = { x: e.offsetX, y: e.offsetY }; });
  cu.addEventListener('pointermove', function (e) {
    if (!cdrag || !edit || !ccam) return;
    var c = edit.cut, P = LC.pointAt(TREES[c.t].branches[c.b], c.s);
    var dx = e.offsetX - cdrag.x, dy = e.offsetY - cdrag.y;
    var ds = (dx * P.ux - dy * P.uy) / ccam.k;
    if (Math.abs(ds) >= 0.001) { moveCut(ds); cdrag = { x: e.offsetX, y: e.offsetY }; }
  });
  cu.addEventListener('pointerup', function () { cdrag = null; });
  cu.addEventListener('pointercancel', function () { cdrag = null; });

  function drawUnionFeatures(g, cm, tree, kid, keep) {
    if (keep[kid.p] < 0 || kid.ps > keep[kid.p]) return;
    var ir = LC.idealRemoval(tree, kid), O = LC.pointAt(kid, 0), u = [O.ux, O.uy], n = ir.n, Db = ir.branchD;
    var ang = Math.atan2(u[1], u[0]) + (90 + ir.theta) * DEG, d = [Math.cos(ang), Math.sin(ang)];
    var A = LC.pointAt(kid, ir.sStar);
    // intersection of ideal line with the collar-side edge (-n)
    var E0 = [O.x - n[0] * Db / 2, O.y - n[1] * Db / 2];
    var den = u[0] * d[1] - u[1] * d[0];
    var tB = Math.abs(den) < 1e-6 ? ir.sStar : ((A.x - E0[0]) * d[1] - (A.y - E0[1]) * d[0]) / den;
    tB = Math.max(0.01, Math.min(kid.len, tB));
    var t0 = Math.max(0, Math.min(tB - 0.005, ir.sSurface - ir.collar * 0.5));
    // collar bulge
    g.beginPath();
    for (var f = 0; f <= 1.0001; f += 0.1) {
      var t = t0 + f * (tB - t0), bulge = Db * 0.22 * Math.sin(Math.PI * Math.pow(f, 0.75));
      var x = E0[0] + u[0] * t - n[0] * bulge, y = E0[1] + u[1] * t - n[1] * bulge, p = w2s(cm, x, y);
      if (f === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    g.lineTo.apply(g, w2s(cm, E0[0] + u[0] * t0, E0[1] + u[1] * t0));
    g.fillStyle = '#7d5a3d'; g.fill();
    g.beginPath();
    for (f = 0; f <= 1.0001; f += 0.1) {
      t = t0 + f * (tB - t0); bulge = Db * 0.22 * Math.sin(Math.PI * Math.pow(f, 0.75));
      p = w2s(cm, E0[0] + u[0] * t - n[0] * bulge, E0[1] + u[1] * t - n[1] * bulge);
      if (f === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    g.strokeStyle = '#e9d5a7'; g.lineWidth = 2; g.stroke();
    // branch bark ridge in the crotch
    var par = tree.branches[kid.p], W = LC.pointAt(par, kid.ps), w = [W.ux, W.uy];
    if (w[0] * n[0] + w[1] * n[1] < 0) w = [-w[0], -w[1]];
    var C = [O.x + u[0] * ir.sCrotch + n[0] * Db / 2, O.y + u[1] * ir.sCrotch + n[1] * Db / 2];
    var c1 = w2s(cm, C[0] + u[0] * Db * 0.3, C[1] + u[1] * Db * 0.3), c0 = w2s(cm, C[0], C[1]), c2 = w2s(cm, C[0] + w[0] * Db * 0.55, C[1] + w[1] * Db * 0.55);
    g.strokeStyle = '#2e1d10'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c1[0], c1[1]); g.quadraticCurveTo(c0[0], c0[1], c2[0], c2[1]); g.stroke();
  }

  function drawCloseup() {
    if (!edit) return;
    var W = cu.width / cdpr, H = cu.height / cdpr; if (!W) return;
    var c = edit.cut, tree = TREES[c.t], b = tree.branches[c.b], P = LC.pointAt(b, c.s), D = LC.diamAt(tree, b, c.s);
    var hw = Math.max(0.16, Math.min(0.9, D * 3.4 + 0.08));
    ccam = { x: P.x, y: P.y, k: Math.min(W, H) / (2 * hw), w: W, h: H };
    var g = cctx; g.setTransform(cdpr, 0, 0, cdpr, 0, 0);
    g.fillStyle = '#e6eff4'; g.fillRect(0, 0, W, H);
    var keep = currentKeep()[c.t];
    var tl = s2w(ccam, -40, -40), br = s2w(ccam, W + 40, H + 40);
    var near = tree.branches.filter(function (bb) {
      for (var i = 0; i < bb.pts.length; i++) { var q = bb.pts[i]; if (q[0] > tl[0] - 1 && q[0] < br[0] + 1 && q[1] < tl[1] + 1 && q[1] > br[1] - 1) return true; }
      return false;
    });
    g.lineCap = 'round'; g.lineJoin = 'round';
    // leaves (faint)
    near.forEach(function (bb) {
      var L = keep[bb.id];
      bb.lf.forEach(function (f) { var p = w2s(ccam, f.x, f.y); g.beginPath(); g.arc(p[0], p[1], f.r * ccam.k, 0, Math.PI * 2); g.fillStyle = (L < 0 || f.s > L) ? 'rgba(78,143,67,0.03)' : 'rgba(78,143,67,0.07)'; g.fill(); });
    });
    // removed wood (ghost), then retained with outline
    near.forEach(function (bb) { var L = keep[bb.id]; if (L < bb.len) strokeBranch(g, ccam, bb, Math.max(0, L), bb.len, '#cfc6bb', 1); });
    near.forEach(function (bb) { var L = keep[bb.id]; if (L > 0) { g.save(); g.lineCap = 'round'; strokeOutline(g, ccam, bb, L); g.restore(); } });
    near.forEach(function (bb) { var L = keep[bb.id]; if (L > 0) strokeBranch(g, ccam, bb, 0, L, BARK, 1); });
    // collars & ridges at unions in view
    near.forEach(function (bb) { if (bb.p >= 0) drawUnionFeatures(g, ccam, tree, bb, keep); });
    // the cut
    var ang = Math.atan2(P.uy, P.ux) + (90 + c.a) * DEG, half = (D / 2) / Math.max(0.35, Math.cos(c.a * DEG)) + 0.25 * D + 0.01;
    var p = w2s(ccam, P.x, P.y), dx = Math.cos(ang) * half * ccam.k, dy = -Math.sin(ang) * half * ccam.k;
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.moveTo(p[0] - dx, p[1] - dy); g.lineTo(p[0] + dx, p[1] + dy); g.stroke();
    g.strokeStyle = '#ff7a00'; g.lineWidth = 3; g.beginPath(); g.moveTo(p[0] - dx, p[1] - dy); g.lineTo(p[0] + dx, p[1] + dy); g.stroke();
    // three-cut hint
    if (c.m === 3) {
      g.setLineDash([4, 3]); g.strokeStyle = 'rgba(255,122,0,0.8)'; g.lineWidth = 2;
      var off = Math.max(0.12, D * 2.2), Q = LC.pointAt(b, Math.min(b.len, c.s + off)), q = w2s(ccam, Q.x, Q.y);
      var a2 = Math.atan2(Q.uy, Q.ux) + 90 * DEG, h2 = (D / 2 + 0.01) * ccam.k, ex = Math.cos(a2) * h2, ey = -Math.sin(a2) * h2;
      g.beginPath(); g.moveTo(q[0] - ex, q[1] - ey); g.lineTo(q[0] - ex * 0.1, q[1] - ey * 0.1); g.stroke();
      var Q2 = LC.pointAt(b, Math.min(b.len, c.s + off + 0.04)), q2 = w2s(ccam, Q2.x, Q2.y);
      g.beginPath(); g.moveTo(q2[0] + ex, q2[1] + ey); g.lineTo(q2[0] - ex, q2[1] - ey); g.stroke();
      g.setLineDash([]);
    }
    drawScaleBar(g, ccam, true);
  }
  function strokeOutline(g, cm, b, L) {
    g.strokeStyle = BARK_DK;
    for (var i = 1; i < b.pts.length; i++) {
      if (b.cum[i - 1] >= L) break;
      var a = { x: b.pts[i - 1][0], y: b.pts[i - 1][1] }, c = b.cum[i] > L ? LC.pointAt(b, L) : { x: b.pts[i][0], y: b.pts[i][1] };
      var p = w2s(cm, a.x, a.y), q = w2s(cm, c.x, c.y);
      g.lineWidth = Math.max(1, b.d[i - 1] * cm.k) + 2.5;
      g.lineCap = b.cum[i] > L ? 'butt' : 'round';
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
  }

  // ---- cut list ----
  function renderCutList() {
    $('cutCount').textContent = state ? state.cuts.length : 0;
    $('listCount').textContent = state && state.cuts.length ? '(' + state.cuts.length + ')' : '';
    if (!state) return;
    $('listEmpty').hidden = state.cuts.length > 0;
    var html = '';
    TREES.forEach(function (t) {
      var items = state.cuts.map(function (c, i) { return { c: c, i: i }; }).filter(function (o) { return o.c.t === t.index; });
      if (!items.length) return;
      html += '<div class="cut-group"><h4>' + esc(t.name) + ' · ' + items.length + ' cut' + (items.length > 1 ? 's' : '') + '</h4>';
      items.forEach(function (o) {
        var b = t.branches[o.c.b], D = Math.round(LC.diamAt(t, b, o.c.s) * 1000);
        html += '<button class="cut-item" data-idx="' + o.i + '"><span class="num">' + (o.i + 1) + '</span><span class="meta"><b>Ø ' + D + ' mm</b>' +
          (o.c.m === 3 ? 'Three-cut' : 'Single cut') + ' · ' + (o.c.a > 0 ? '+' : '') + o.c.a + '°</span><span>›</span></button>';
      });
      html += '</div>';
    });
    $('cutList').innerHTML = html;
    $('cutList').querySelectorAll('.cut-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = +el.dataset.idx, c = state.cuts[i], P = LC.pointAt(TREES[c.t].branches[c.b], c.s);
        cam.x = P.x; cam.y = P.y; if (cam.k < 60) cam.k = 60; openEditor(i);
      });
    });
  }

  // ---- timer ----
  function startTimer() {
    clearInterval(timerId);
    var tick = function () { $('timer').textContent = fmtTime((Date.now() - state.startedAt) / 1000); };
    tick(); timerId = setInterval(tick, 1000);
  }

  function enterPlay() {
    show('screenPlay');
    renderCutList(); startTimer();
    requestAnimationFrame(function () {
      resize();
      var r = canvas.getBoundingClientRect();
      setView(r.width / r.height < 0.9 ? 'A' : 'all');
      if (r.width / r.height < 0.9) setTimeout(function () { toast('Use Tree A / Site / Tree B to move between trees. Pinch to zoom.'); }, 2600);
    });
  }

  // =====================================================================
  //  SUBMIT + RESULTS
  // =====================================================================
  $('btnSubmit').addEventListener('click', function () {
    if (edit) closeEditor();
    var nA = cutsFor(0, state.cuts).length, nB = cutsFor(1, state.cuts).length;
    $('submitSummary').innerHTML = 'Tree A: <b>' + nA + '</b> cut' + (nA === 1 ? '' : 's') + ' · Tree B: <b>' + nB + '</b> cut' + (nB === 1 ? '' : 's') + ' · Time: <b>' + fmtTime((Date.now() - state.startedAt) / 1000) + '</b>' +
      ((!nA || !nB) ? '<br><span class="error">You haven’t marked any cuts on one of the trees.</span>' : '');
    $('submitError').textContent = '';
    $('dlgSubmit').showModal();
  });
  $('btnSubmitGo').addEventListener('click', function (e) {
    e.preventDefault();
    var btn = this; btn.disabled = true; btn.textContent = 'Submitting…'; $('submitError').textContent = '';
    API.submit(state).then(function (r) {
      btn.disabled = false; btn.textContent = 'Submit';
      if (!r || !r.ok) { $('submitError').textContent = errText(r && r.error); return; }
      done = { name: state.name, score: r.score, secs: r.secs, cuts: clean(state.cuts), at: Date.now() };
      store.set('-done', done); store.del('-state');
      clearInterval(timerId);
      $('dlgSubmit').close();
      showResults(done, r.top);
      state = null;
    }).catch(function () { btn.disabled = false; btn.textContent = 'Submit'; $('submitError').textContent = ERR.network; });
  });

  function bar(labelTxt, v, max) {
    return '<div class="barrow"><span>' + labelTxt + '</span><span class="track"><span class="fill" style="width:' + Math.round(100 * v / max) + '%"></span></span><span class="v">' + Math.round(v) + '/' + max + '</span></div>';
  }
  var TYPE = { removal: 'Removal cut', reduction: 'Reduction cut', heading: 'Heading cut' };

  function showResults(d, top) {
    var res = LC.scoreAll(d.cuts);
    show('screenResults');
    $('resTotal').textContent = d.score != null ? d.score : res.total;
    if (top) {
      renderBoard($('boardResults'), top, d);
      var pos = -1; top.forEach(function (r, i) { if (pos < 0 && r.name === d.name && r.score === d.score) pos = i; });
      $('resRank').textContent = pos >= 0 ? 'You’re currently #' + (pos + 1) + ' on the scoreboard' : 'Not in the Top 10 this time. Nice work getting the job done.';
    } else loadBoard();
    // per-tree cards
    var idxMap = d.cuts.map(function (c, i) { return i; });
    $('resTrees').innerHTML = res.trees.map(function (tr, ti) {
      var p = tr.points, cl = tr.clearance.d, T = tr.target;
      var clTxt = cl >= T ? '<span class="ok">' + cl.toFixed(2) + ' m ✓</span> (target ' + T.toFixed(1) + ' m)' : '<span style="color:var(--bad)">' + cl.toFixed(2) + ' m ✗ short of ' + T.toFixed(1) + ' m</span>';
      var facts = '<div class="facts">Clearance achieved: <b>' + clTxt + '</b><br>Started at ' + tr.initialClearance.toFixed(2) + ' m · Leaf-bearing material removed: <b>' + Math.round(tr.crown.leafRemoved * 100) + '%</b>' +
        (tr.crown.meanReduction != null ? '<br>Average crown reduction: <b>' + tr.crown.meanReduction.toFixed(2) + ' m</b> · evenness <b>' + Math.round(tr.crown.even * 100) + '%</b>' : '') + '</div>';
      var cutsHtml = tr.cuts.map(function (a) {
        var num = d.cuts.findIndex(function (c) { return c.t === a.cut.t && c.b === a.cut.b && c.s === a.cut.s; }) + 1;
        var cls = a.score >= 80 ? 'good' : a.score < 50 ? 'bad' : '';
        return '<div class="cutres"><span class="num">' + (num || '•') + '</span><div><b>' + TYPE[a.type] + '</b> · Ø ' + Math.round(a.D * 1000) + ' mm' +
          (a.notes.length ? '<ul>' + a.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<div class="ok">Meets BS 3998 good practice</div>') +
          '</div><span class="s ' + cls + '">' + Math.round(a.score) + '</span></div>';
      }).join('') || '<p class="muted small">No cuts on this tree.</p>';
      return '<section class="card tree-res"><h2><span>' + esc(tr.name) + '</span><span class="pts">' + Math.round(p.total) + '<small class="muted">/500</small></span></h2>' +
        '<div class="bars">' + bar('Clearance', p.clearance, 200) + bar('Cut quality', p.cuts, 200) + bar('Crown', p.crown, 100) + '</div>' + facts +
        '<details class="cuts-detail"' + (tr.cuts.length <= 8 ? ' open' : '') + '><summary>Your cuts (' + tr.cuts.length + ')</summary>' + cutsHtml + '</details></section>';
    }).join('');
    void idxMap;
    // final scene
    requestAnimationFrame(function () {
      var rc = $('resultScene'), r = rc.getBoundingClientRect(), dp = window.devicePixelRatio || 1;
      rc.width = Math.round(r.width * dp); rc.height = Math.round(r.height * dp);
      var g = rc.getContext('2d'); g.setTransform(dp, 0, 0, dp, 0, 0);
      var v = VIEWS.all, cm = makeCam(v[0], v[1], v[2], v[3], r.width, r.height);
      drawScene(g, cm, { keep: res.trees.map(function (t) { return t.keep; }), zones: true, ghost: true, cuts: d.cuts, noBadges: true, nearest: res });
    });
  }

  // =====================================================================
  //  INTRO
  // =====================================================================
  function initIntro() {
    document.querySelectorAll('.roundLabel').forEach(function (el) { el.textContent = CFG.roundLabel || CFG.round; });
    document.querySelectorAll('.closes').forEach(function (el) { el.textContent = CFG.closes || 'the end of the month'; });
    $('roundLabel').textContent = CFG.roundLabel || '';
    if (DEMO) { $('demoBanner').hidden = false; document.body.classList.add('has-demo'); $('codeRow').hidden = true; }
    if (done) {
      $('startCard').hidden = true; $('doneCard').hidden = false;
      $('doneName').textContent = done.name; $('doneScore').textContent = done.score;
      if (done.cuts) { $('btnViewResults').hidden = false; }
    }
    loadBoard();
  }
  $('btnViewResults').addEventListener('click', function () { showResults(done, null); });
  $('sheetHead').addEventListener('click', function (e) {
    if (e.target.closest('#btnRules2')) return;
    $('panel').classList.toggle('collapsed');
    requestAnimationFrame(resize);
  });
  $('btnRules').addEventListener('click', function () { $('dlgRules').showModal(); });
  $('btnRules2').addEventListener('click', function () { $('dlgRules').showModal(); });

  $('startForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('inName').value.replace(/\s+/g, ' ').trim();
    var code = $('inCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    $('startError').textContent = '';
    if (name.length < 2 || name.length > 24) { $('startError').textContent = ERR.name; return; }
    if (!DEMO && code.length < 6) { $('startError').textContent = 'Please enter the access code you were given.'; return; }
    var btn = $('btnStart'); btn.disabled = true; btn.textContent = 'Checking code…';
    API.start(code, name).then(function (r) {
      btn.disabled = false; btn.textContent = 'Start the job';
      if (!r || !r.ok) { $('startError').textContent = errText(r && r.error); return; }
      state = { code: code, token: r.token, name: name, cuts: [], startedAt: Date.now() };
      save(); enterPlay();
      setTimeout(function () { toast('Tap a branch to mark your first cut.'); }, 600);
    }).catch(function () { btn.disabled = false; btn.textContent = 'Start the job'; $('startError').textContent = ERR.network; });
  });

  // boot
  initIntro();
  if (state && !done) enterPlay(); else show('screenIntro');
  requestAnimationFrame(frame);

  // test hook (harmless in production)
  window.__lc = { get state() { return state; }, setView: setView, openEditor: openEditor, get cam() { return cam; } };
})();

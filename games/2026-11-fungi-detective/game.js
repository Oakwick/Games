/* Fungi Detective — game UI (Oakwick Games, November 2026).
 * Each tree: find the fungus (close view) → name it (close-up) → step back for the utility category → decide.
 * Live: players sign in with the personal link from their invitation (?k=...). Each answer is sent to the
 * server, which locks it in and sends back the marking, so the answer key never reaches the page.
 * Demo (no apiUrl, full engine loaded): everything is marked in the browser and kept on this device. */
(function () {
  'use strict';
  var CFG = window.OAKWICK_CONFIG || {};
  var F = window.FungiDetective || window.FungiPublic, TREES = F.TREES, S = window.FungiScene;
  var LOCAL = !!(window.FungiDetective && window.FungiDetective.step);
  var DEMO = !CFG.apiUrl;
  var ROUND = CFG.round || '2026-11';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'oakwick-fungi-' + ROUND + (DEMO ? '-demo' : '');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function q(v) { return Math.round(v * 1000) / 1000; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function treeById(id) { return byId(TREES, id); }
  function fmtTime(secs) { secs = Math.max(0, Math.round(secs || 0)); var m = Math.floor(secs / 60), s = secs % 60; return m + 'm ' + (s < 10 ? '0' : '') + s + 's'; }
  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } }
  };

  // ---------------- player key and server ----------------
  var PARAMS = new URLSearchParams(location.search), PKEY = 'oakwick-player-key', playerKey = null;
  try { playerKey = localStorage.getItem(PKEY); } catch (e) { }
  if (PARAMS.get('k')) {
    playerKey = PARAMS.get('k').toUpperCase().replace(/[^A-Z0-9]/g, '');
    try { localStorage.setItem(PKEY, playerKey); } catch (e) { }
    PARAMS.delete('k'); // keep the key out of the address bar, screenshots and history
    try { history.replaceState(null, '', location.pathname + (PARAMS.toString() ? '?' + PARAMS : '')); } catch (e) { }
  }
  function getJSON(qs) { return fetch(CFG.apiUrl + '?' + qs).then(function (r) { return r.json(); }); }
  var API = {
    post: function (body) {
      body.round = ROUND; body.version = F.VERSION; body.key = playerKey;
      return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    whoami: function () { return API.post({ action: 'whoami' }); },
    start: function () { return API.post({ action: 'start' }); },
    step: function (a) { return API.post({ action: 'step', step: a }); },
    submit: function () { return API.post({ action: 'submit', cuts: [] }); },
    top: function () { return getJSON('action=top&round=' + encodeURIComponent(ROUND)); },
    status: function () { return getJSON('action=status&round=' + encodeURIComponent(ROUND)); },
    winner: function (round) { return getJSON('action=winner&round=' + encodeURIComponent(round || ROUND)); }
  };
  var ERR = {
    key: "That link isn't recognised. Please use the link in your latest invitation email, or ask the organiser to resend it.",
    used: 'You’ve already finished your survey for this round.',
    closed: 'This round has closed. Look out for next month’s game!',
    not_open: 'Fungi Detective opens on ' + (CFG.opensText || '1 November') + '.',
    not_started: 'Your attempt could not be found. Please open your invitation link again.',
    version: 'The game has been updated. Please refresh the page.',
    network: "Couldn't reach the scoreboard. Check your signal and try again."
  };
  function errText(e) { return ERR[e] || ERR.network; }

  // ---------------- state ----------------
  // answers: [{t, id, cat, act}] locked in; reveals: the marking for each, in the same order
  var st = fresh(), me = null;
  function fresh() { return { idx: 0, phase: 'find', answers: [], reveals: [], pick: {}, misses: 0, busy: false, zoom: false }; }
  function total() { return st.reveals.reduce(function (s, r) { return s + (r.pts || 0); }, 0); }
  function cur() { return TREES[Math.min(st.idx, TREES.length - 1)]; }
  function adopt(review) {   // take the locked-in answers from the server
    st.reveals = (review || []).slice(); st.answers = st.reveals.map(function (r) { return { t: r.t, id: r.yours.id, cat: r.yours.cat, act: r.yours.act }; });
    st.idx = st.answers.length; st.phase = 'find'; st.pick = {}; st.misses = 0; st.zoom = false;
  }
  function saveDemo() { if (DEMO) store.set({ answers: st.answers, startedAt: st.startedAt, done: st.done || null }); }

  // ---------------- scene ----------------
  var cache = {}, shown = null, tween = null;
  function built(t, mode, pxw) {
    var k = t.id + mode + Math.round(pxw / 80);
    if (!cache[k]) cache[k] = S.build(t, mode, pxw);
    return cache[k];
  }
  function sceneWidth() { var w = $('scene').getBoundingClientRect().width; return w > 50 ? w : Math.min(window.innerWidth, 800); }
  function vb(V) { return q(V.x) + ' ' + q(V.y) + ' ' + q(V.w) + ' ' + q(V.h); }
  function drawScene() {
    var t = cur(), stepped = !(st.phase === 'find' || st.phase === 'id'), mode = !stepped ? 'find' : st.zoom ? 'zoom' : 'elev', B = built(t, mode, sceneWidth()), svg = $('scene');
    var zb = $('btnZoom'); zb.hidden = !stepped; zb.textContent = st.zoom ? 'Whole tree' : 'Zoom in on the line'; zb.setAttribute('aria-pressed', st.zoom ? 'true' : 'false');
    var h = B.svg, found = st.phase !== 'find';
    if (mode === 'find') {
      B.hits.decoys.forEach(function (d) { h += '<circle class="hot" data-decoy="' + d.k + '" cx="' + q(d.cx) + '" cy="' + q(d.cy) + '" r="' + q(d.r) + '" fill="transparent"/>'; });
      B.hits.fungus.forEach(function (f) { h += '<circle class="hot" data-fungus="1" cx="' + q(f.cx) + '" cy="' + q(f.cy) + '" r="' + q(f.r) + '" fill="transparent"/>'; });
      var m = B.hits.fungus[0], sw = B.view.w / 220;
      if (found) B.hits.fungus.forEach(function (f) { h += '<circle cx="' + q(f.cx) + '" cy="' + q(f.cy) + '" r="' + q(f.r * 1.05) + '" fill="none" stroke="var(--accent)" stroke-width="' + q(sw * 1.4) + '"/>'; });
      else if (st.misses >= 3) h += '<circle class="pulse" cx="' + q(m.cx) + '" cy="' + q(m.cy) + '" r="' + q(m.r * 1.3) + '" fill="none" stroke="var(--accent)" stroke-width="' + q(sw * 1.2) + '" stroke-dasharray="' + q(sw * 3) + ' ' + q(sw * 2) + '"/>';
    }
    var key = t.id + mode;
    svg.innerHTML = h;
    if (shown && shown.key !== key && shown.t === t.id && mode !== 'find' && !reduceMotion) animate(svg, shown.view, B.view);
    else { cancelTween(); svg.setAttribute('viewBox', vb(B.view)); }
    svg.setAttribute('aria-label', mode === 'find' ? t.species + ': look for the fungus' : mode === 'zoom' ? t.species + ': a closer look at the gap between the tree and the ' + (t.kv || 11) + 'kV line, with a 2 metre scale bar' : t.species + ', the whole tree and the ' + (t.kv || 11) + 'kV line, with a scale bar');
    shown = { key: key, t: t.id, view: B.view };
  }
  function cancelTween() { if (tween) cancelAnimationFrame(tween); tween = null; }
  function animate(svg, a, b) {
    cancelTween();
    var lbl = svg.querySelector('.lbl'); if (lbl) lbl.style.opacity = 0;
    var t0 = performance.now(), D = 700;
    (function step(now) {
      var u = Math.min(1, (now - t0) / D), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      svg.setAttribute('viewBox', vb({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e }));
      if (u < 1) tween = requestAnimationFrame(step);
      else { tween = null; if (lbl) { lbl.style.transition = 'opacity .3s'; lbl.style.opacity = 1; } }
    })(t0);
  }
  function closeup(t) {
    var w = Math.max(320, Math.min(560, $('panel').getBoundingClientRect().width - 40)), B = built(t, 'close', w);
    return '<svg viewBox="' + vb(B.view) + '" role="img" aria-label="Close-up of what you found">' + B.svg + '</svg>';
  }

  // ---------------- panel ----------------
  function hud() {
    $('hudTree').textContent = Math.min(st.idx + 1, TREES.length) + ' / ' + TREES.length;
    $('hudScore').textContent = total();
  }
  function facts(t) {
    return '<div class="facts four"><div><small>Species</small><b>' + esc(t.species) + '</b></div><div><small>Height</small><b>' + t.height + ' m</b></div><div><small>Line</small><b>' + (t.kv || 11) + 'kV</b></div><div><small>Stem to line</small><b>' + (t.under ? 'Under it' : t.dist + ' m') + '</b></div></div>';
  }
  function revealHtml(rv) {
    var best = byId(F.ACTIONS, rv.best), mine = byId(F.ACTIONS, rv.yours.act) || { label: '?' }, said = F.FUNGI[rv.yours.id] || { name: '?' };
    var h = '<div class="result ' + (rv.idOk ? 'good' : 'bad') + '"><span class="pts">+' + (rv.idOk ? F.ID_PTS : 0) + '</span><h3>' + (rv.idOk ? '✓ ' : '✗ It\'s ') + esc(rv.name) + '</h3><p><i>' + esc(rv.latin) + '</i>' + (rv.idOk ? '' : '. You said ' + esc(said.name) + '.') + '</p></div>';
    h += '<div class="result ' + (rv.catOk ? 'good' : 'bad') + '"><span class="pts">+' + (rv.catOk ? F.CAT_PTS : 0) + '</span><h3>' + (rv.catOk ? '✓ Category ' + rv.cat : '✗ It\'s Category ' + rv.cat + '. You said ' + esc(rv.yours.cat)) + '</h3><p>' + esc(rv.catWhy) + '</p></div>';
    h += '<div class="result ' + (rv.act === 1 ? 'good' : rv.act ? 'part' : 'bad') + '"><span class="pts">+' + Math.round(F.ACT_PTS * rv.act) + '</span><h3>' + (rv.act === 1 ? '✓ ' + best.label : rv.act ? '~ ' + mine.label + ' gets half marks. Best: ' + best.label : '✗ Best action: ' + best.label) + '</h3><p>' + esc(rv.why) + '</p></div>';
    return h;
  }
  function render() {
    var t = cur(), p = $('panel'), h = '';
    drawScene();
    h += '<div class="kicker">Tree ' + (st.idx + 1) + ' of ' + TREES.length + '</div><h2>' + esc(t.species) + (t.under ? ', under ' : ', ' + t.dist + '\u00a0m from ') + ((t.kv || 11) === 11 ? 'an ' : 'a ') + (t.kv || 11) + 'kV line' + '</h2>' + facts(t) + '<p class="note">' + esc(t.notes) + '</p>';
    if (st.phase === 'find') {
      h += '<p class="ask">Something is growing on this tree. Tap it on the picture.</p>';
      if (st.misses >= 3) h += '<p class="note">Look for the dashed circle.</p>';
    } else if (st.phase === 'id') {
      h += '<div class="closeup">' + closeup(t) + '</div><p class="look"><small>What you can see</small>' + esc(t.look) + '</p>';
      h += '<p class="ask">What is it?</p><div class="choices">' + shuffled(t).map(function (k) { return '<button class="choice" data-id="' + k + '"><b>' + esc(F.FUNGI[k].name) + '</b><i>' + esc(F.FUNGI[k].latin) + '</i></button>'; }).join('') + '</div>';
    } else if (st.phase === 'cat') {
      h += '<p class="picked">You said <b>' + esc(F.FUNGI[st.pick.id].name) + '</b>.</p>';
      h += '<p class="ask">Step back. Which utility category is this tree?</p>';
      h += '<div class="choices two">' + F.CATS.map(function (c) { return '<button class="choice" data-cat="' + c.id + '"><b>' + c.label + '</b><span>' + esc(c.hint) + '</span></button>'; }).join('') + '</div>';
    } else if (st.phase === 'act') {
      h += '<p class="picked">You said <b>' + esc(F.FUNGI[st.pick.id].name) + '</b>, Category ' + st.pick.cat + '.</p>';
      h += '<p class="ask">What should happen to this tree?</p><div class="choices two">' + F.ACTIONS.map(function (a) { return '<button class="choice" data-act="' + a.id + '"' + (st.busy ? ' disabled' : '') + '><b>' + a.label + '</b><span>' + a.hint + '</span></button>'; }).join('') + '</div>';
      if (st.busy) h += '<p class="note checking">Locking in your answer…</p>';
      if (st.err) h += '<p class="error">' + esc(st.err) + '</p>';
    } else {
      h += revealHtml(st.reveals[st.reveals.length - 1]);
      h += '<button class="btn go wide" id="btnNext">' + (st.idx + 1 < TREES.length ? 'Next tree →' : 'Finish the survey') + '</button>';
      if (st.err) h += '<p class="error">' + esc(st.err) + '</p>';
    }
    p.innerHTML = h;
    p.scrollTop = 0;
    p.querySelectorAll('[data-id]').forEach(function (b) { b.addEventListener('click', function () { st.pick = { id: b.dataset.id }; go('cat'); }); });
    p.querySelectorAll('[data-cat]').forEach(function (b) { b.addEventListener('click', function () { st.pick.cat = b.dataset.cat; go('act', true); }); });
    p.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { answer(t, b.dataset.act); }); });
    var nx = $('btnNext'); if (nx) nx.addEventListener('click', next);
    hud();
  }
  var phone = function () { return window.innerWidth <= 820; };
  function go(phase, stay) {
    st.phase = phase; st.err = ''; render();
    if (!phone()) return;
    if (phase === 'cat') $('scene').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    else if (!stay || phase === 'reveal') $('panel').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  // answer order is mixed up per tree (but the same for everyone)
  function shuffled(t) {
    var seed = 0; for (var i = 0; i < t.id.length; i++) seed = seed * 31 + t.id.charCodeAt(i);
    return t.options.map(function (k, i) { return { k: k, r: Math.sin(seed * 9301 + i * 49297) }; }).sort(function (a, b) { return a.r - b.r; }).map(function (o) { return o.k; });
  }

  // lock in this tree's answer and show the marking
  function answer(t, act) {
    if (st.busy) return;
    var a = { t: t.id, id: st.pick.id, cat: st.pick.cat, act: act };
    if (DEMO) {
      var r = window.FungiDetective.step(st.answers, a);
      if (r.error) return;
      st.answers = r.answers; st.reveals.push(r.reveal); saveDemo(); go('reveal', true); return;
    }
    st.busy = true; st.err = ''; render();
    API.step(a).then(function (r) {
      st.busy = false;
      if (r && r.ok) { st.answers.push(a); st.reveals.push(r.reveal); go('reveal', true); return; }
      if (r && r.error === 'order' && r.review) { adopt(r.review); render(); toast('Your survey was updated from another device.'); return; }
      if (r && (r.error === 'used' || r.error === 'closed')) { showMessage(errText(r.error)); return; }
      st.err = errText(r && r.error); render();
    }).catch(function () { st.busy = false; st.err = ERR.network; render(); });
  }
  function next() {
    if (st.idx + 1 >= TREES.length) { finish(); return; }
    st.idx++; st.phase = 'find'; st.pick = {}; st.misses = 0; st.err = ''; st.zoom = false; render();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function finish() {
    if (DEMO) {
      var sc = window.FungiDetective.score(st.answers).total, secs = Math.round((Date.now() - (st.startedAt || Date.now())) / 1000);
      st.done = { score: sc, secs: secs }; saveDemo();
      showResults({ name: 'You', score: sc, secs: secs, review: st.reveals });
      return;
    }
    var b = $('btnNext'); if (b) { b.disabled = true; b.textContent = 'Submitting…'; }
    API.submit().then(function (r) {
      if (!r || !r.ok) {
        if (r && r.error === 'used') { bootIntro(); return; }
        st.err = errText(r && r.error); render(); return;
      }
      showResults({ name: me ? me.name : 'You', score: r.score, secs: r.secs, review: r.review || st.reveals }, r.top);
    }).catch(function () { st.err = ERR.network; render(); });
  }

  var DECOY = {
    ivy: 'Ivy. It adds weight and can hide defects, but it isn\'t a fungus.',
    moss: 'Moss. Harmless: it just likes the damp side of the tree.',
    lichen: 'Lichen. Harmless to the tree, and a sign of clean air.',
    birdbox: 'A bird box. Worth knowing about before spring work, but it isn\'t what you\'re looking for.',
    woodpecker: 'A woodpecker hole. Often a sign of soft wood inside, but it isn\'t the fungus.'
  };
  var toastT;
  function toast(m) { var e = $('toast'); e.textContent = m; e.className = 'toast show'; clearTimeout(toastT); toastT = setTimeout(function () { e.className = 'toast'; }, 2600); }
  $('scene').addEventListener('click', function (e) {
    if (st.phase !== 'find' || !$('intro').hidden) return;
    var el = e.target.closest('.hot');
    if (el && el.dataset.fungus) { go('id'); return; }
    st.misses++;
    if (el && el.dataset.decoy) toast(DECOY[el.dataset.decoy]);
    else toast(st.misses >= 3 ? 'Not there. Look for the dashed circle.' : 'Nothing of interest there. Keep looking.');
    if (st.misses === 3) render();
  });

  // ---------------- results ----------------
  function boardHtml(top, mine) {
    if (!top || !top.length) return '<li class="muted">No scores yet. Yours could be the first.</li>';
    return top.map(function (r) {
      var isMe = mine && r.name === mine.name && r.score === mine.score;
      return '<li' + (isMe ? ' class="me"' : '') + '><span class="nm">' + esc(r.name) + '</span><span class="tm">' + (r.secs != null ? fmtTime(r.secs) : '') + '</span><span class="sc">' + r.score + '</span></li>';
    }).join('');
  }
  function rowsHtml(review) {
    return review.map(function (rv, i) {
      var t = treeById(rv.t), y = rv.yours || {}, said = F.FUNGI[y.id] || { name: '?' }, best = byId(F.ACTIONS, rv.best), mine = byId(F.ACTIONS, y.act) || { label: '?' };
      var detail = '<span class="' + (rv.idOk ? 'ok' : 'no') + '">' + esc(said.name) + '</span> · <span class="' + (rv.catOk ? 'ok' : 'no') + '">Cat ' + esc(y.cat || '?') + '</span>' + (rv.catOk ? '' : ' (' + rv.cat + ')') + ' · <span class="' + (rv.act === 1 ? 'ok' : 'no') + '">' + esc(mine.label) + '</span>' + (rv.act === 1 ? '' : ' (best: ' + best.label + ')');
      return '<details class="rrow"><summary><span class="n">' + (i + 1) + '</span><div><b>' + esc(t ? t.species : rv.t) + ': ' + esc(rv.name) + ', Cat ' + rv.cat + '</b><small>' + detail + '</small></div><span class="p">' + Math.round(rv.pts) + '</span></summary><div class="why2">' + esc(rv.catWhy) + ' ' + esc(rv.why) + '</div></details>';
    }).join('');
  }
  function showResults(d, top, opts) {
    opts = opts || {};
    var review = d.review || [], ids = 0, cats = 0, acts = 0;
    review.forEach(function (r) { if (r.idOk) ids++; if (r.catOk) cats++; if (r.act === 1) acts++; });
    var h = '<div class="kicker">' + (opts.winner ? 'Winning survey · ' + esc(CFG.roundLabel || ROUND) : 'Survey complete') + '</div>';
    if (opts.winner) h += '<h1 class="winname">' + esc(d.name) + '</h1>';
    h += '<div class="scoreline"><div class="big">' + d.score + '</div><div class="of">out of ' + (TREES.length * (F.ID_PTS + F.CAT_PTS + F.ACT_PTS)) + (d.secs != null ? '<br>in ' + fmtTime(d.secs) : '') + '</div></div>';
    h += '<p>' + (opts.winner ? esc(d.name) + ' named' : 'You named') + ' <b>' + ids + ' of 10</b> fungi, got <b>' + cats + ' of 10</b> categories right and chose the best action on <b>' + acts + ' of 10</b> trees.</p>';
    if (top && !opts.winner && !DEMO) {
      var pos = -1; top.forEach(function (r, i) { if (pos < 0 && r.name === d.name && r.score === d.score) pos = i; });
      h += '<p class="rank">' + (pos >= 0 ? 'You’re currently <b>#' + (pos + 1) + '</b> on the scoreboard.' : 'Not in the Top 10 this time. Thanks for playing.') + '</p>';
    }
    h += '<div class="rlist">' + rowsHtml(review) + '</div>';
    if (!DEMO) h += '<h3 class="boardhead">' + (opts.winner ? 'Final Top 10' : 'Top 10') + '</h3><ol class="board" id="boardResults">' + (top ? boardHtml(top, d) : '<li class="muted">Loading…</li>') + '</ol>';
    h += '<div class="row">' + (DEMO ? '<button class="btn go" id="btnAgain">Play again</button>' : opts.winner ? '<a class="btn go" href="./">Back to the game</a>' : '') + '</div>';
    if (DEMO) h += '<p class="proto">Demo. In the real game this score goes to the monthly Top 10. The answers are simplified for a game; real decisions need a full tree inspection.</p>';
    $('resultsBody').innerHTML = h; $('results').hidden = false; $('intro').hidden = true;
    if (!top && !DEMO) API.top().then(function (r) { if (r && r.ok) $('boardResults').innerHTML = boardHtml(r.top, d); }).catch(function () { });
    var again = $('btnAgain'); if (again) again.addEventListener('click', function () { st = fresh(); st.startedAt = Date.now(); saveDemo(); $('results').hidden = true; render(); });
  }
  function showMessage(msg) { $('results').hidden = true; $('intro').hidden = false; introState('<p class="state-msg">' + esc(msg) + '</p>'); }

  // ---------------- intro / sign in ----------------
  function introState(html) { $('introState').innerHTML = html; }
  function loadBoard() {
    if (DEMO) { $('introBoard').hidden = true; return; }
    API.top().then(function (r) { $('boardIntro').innerHTML = r && r.ok ? boardHtml(r.top, me && me.done) : '<li class="muted">Scoreboard unavailable right now.</li>'; })
      .catch(function () { $('boardIntro').innerHTML = '<li class="muted">Scoreboard unavailable right now.</li>'; });
    API.status().then(function (r) {
      if (r && r.ok && r.winner) { $('winnerCard').hidden = false; $('winnerCard').innerHTML = '<b>Winner: ' + esc(r.winner) + '</b> with ' + r.winnerScore + ' points. <a href="?view=winner&round=' + encodeURIComponent(ROUND) + '">See the winning survey</a>'; }
    }).catch(function () { });
  }
  function begin(resumeReview, startedAt) {
    st = fresh(); st.startedAt = startedAt || Date.now();
    if (resumeReview && resumeReview.length) adopt(resumeReview);
    $('intro').hidden = true;
    if (st.idx >= TREES.length) { st.idx = TREES.length - 1; st.phase = 'reveal'; finish(); return; }
    render();
  }
  function bootIntro() {
    $('intro').hidden = false; $('results').hidden = true;
    loadBoard();
    if (DEMO) {
      if (!LOCAL) { introState('<p class="state-msg">This game isn\'t connected to the scoreboard yet. Put the backend address in <code>site-config.js</code>.</p>'); return; }
      var saved = store.get();
      var h = '<div class="row">';
      if (saved && saved.answers && saved.answers.length && !saved.done) h += '<button class="btn ghost" id="btnResume">Carry on where I left off</button>';
      h += '<button class="btn go" id="btnStart">Start the walk</button></div>';
      introState(h);
      $('btnStart').addEventListener('click', function () { begin(null); saveDemo(); });
      if ($('btnResume')) $('btnResume').addEventListener('click', function () {
        var rev = window.FungiDetective.review(saved.answers);
        begin(rev, saved.startedAt);
      });
      return;
    }
    if (!playerKey) { introState('<p class="state-msg"><b>Use your personal link.</b> Open the link in your Oakwick Games invitation email to play. It signs you in, so there’s nothing to type.</p>'); return; }
    introState('<p class="state-msg">Signing you in…</p>');
    API.whoami().then(function (r) {
      if (!r || !r.ok) {
        if (r && r.error === 'key') { try { localStorage.removeItem(PKEY); } catch (e) { } playerKey = null; introState('<p class="state-msg"><b>Link not recognised.</b> ' + esc(ERR.key) + '</p>'); }
        else introState('<p class="state-msg">' + esc(errText(r && r.error)) + '</p><div class="row"><button class="btn go" id="btnRetry">Try again</button></div>');
        if ($('btnRetry')) $('btnRetry').addEventListener('click', bootIntro);
        return;
      }
      me = { name: r.name };
      if (r.status === 'submitted') {
        me.done = { name: r.name, score: r.score };
        introState('<p class="state-msg">Thanks, ' + esc(r.name) + '. You scored <b>' + r.score + '</b>' + (r.secs != null ? ' in ' + fmtTime(r.secs) : '') + '.</p><div class="row"><button class="btn go" id="btnMine">See your survey</button></div>');
        $('btnMine').addEventListener('click', function () { showResults({ name: r.name, score: r.score, secs: r.secs, review: r.review || [] }); });
        loadBoard(); return;
      }
      if (r.notYet) { introState('<p class="state-msg">Hi ' + esc(r.name) + '. <b>Fungi Detective opens on ' + esc(CFG.opensText || '1 November') + '.</b> Come back then using the same link.</p>'); return; }
      if (!r.open) { introState('<p class="state-msg">' + esc(ERR.closed) + '</p>'); return; }
      var resuming = r.status === 'started';
      introState('<p class="state-msg">' + (resuming ? 'Welcome back, ' : 'Welcome, ') + esc(r.name) + '.' + (resuming ? ' Your survey is in progress.' : ' You get one attempt, so take your time.') + '</p><div class="row"><button class="btn go" id="btnStart">' + (resuming ? 'Carry on with my survey' : 'Start the walk') + '</button></div><p class="error" id="startError"></p>');
      $('btnStart').addEventListener('click', function () {
        var b = this; b.disabled = true; b.textContent = 'Starting…';
        API.start().then(function (s) {
          if (!s || !s.ok) { b.disabled = false; b.textContent = 'Try again'; $('startError').textContent = errText(s && s.error); if (s && s.error === 'used') bootIntro(); return; }
          begin(s.review, s.startedAt);
          if (s.resumed && s.review && s.review.length) setTimeout(function () { toast('Welcome back. You’re on tree ' + (st.idx + 1) + '.'); }, 400);
        }).catch(function () { b.disabled = false; b.textContent = 'Try again'; $('startError').textContent = ERR.network; });
      });
    }).catch(function () { introState('<p class="state-msg">' + esc(ERR.network) + '</p><div class="row"><button class="btn go" id="btnRetry">Try again</button></div>'); $('btnRetry').addEventListener('click', bootIntro); });
  }
  function bootWinner() {
    $('intro').hidden = true; $('results').hidden = false;
    $('resultsBody').innerHTML = '<div class="kicker">Winning survey</div><p>Loading…</p>';
    if (DEMO) { $('resultsBody').innerHTML = '<p>The winning survey is published here when the round closes.</p>'; return; }
    API.winner(PARAMS.get('round') || ROUND).then(function (r) {
      if (!r || !r.ok) { $('resultsBody').innerHTML = '<div class="kicker">Winning survey</div><p>' + (r && r.error === 'not_closed' ? 'The winning survey will be published here when the round closes.' : 'There were no entries this round.') + '</p><div class="row"><a class="btn go" href="./">Back to the game</a></div>'; return; }
      showResults({ name: r.name, score: r.score, secs: r.secs, review: r.review || [] }, r.top, { winner: true });
    }).catch(function () { $('resultsBody').innerHTML = '<p>' + esc(ERR.network) + '</p>'; });
  }

  $('btnZoom').addEventListener('click', function () { st.zoom = !st.zoom; drawScene(); });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (!$('intro').hidden) return; shown = null; drawScene(); }, 250); });
  if (DEMO) document.body.classList.add('demo');
  render();
  if (PARAMS.get('view') === 'winner') bootWinner(); else bootIntro();
  window.__fungi = { get st() { return st; }, render: render, built: function (m) { return built(cur(), m, sceneWidth()); } };
})();

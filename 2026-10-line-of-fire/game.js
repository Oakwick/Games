/* Line of Fire — game UI (Oakwick Games, hand-safety special edition, October 2026).
 * Each moment: mark every hand that is in the line of fire → choose what to do → see what happens.
 * After the last moment the player makes the commitment, which finishes the game.
 *
 * Open to anyone with the link: there is no sign-in. The page marks the answers itself (engine.js), and
 * progress is kept on this device. When the scoreboard address is set (site-config.js) the player types
 * their name at the commitment, and the server re-scores the answers and adds them to the completion record.
 * With no scoreboard address (the demo) nothing is recorded. */
(function () {
  'use strict';
  var CFG = window.OAKWICK_CONFIG || {};
  var F = window.LineOfFire, SC = F.SCENES, ART = window.LofArt;
  var DEMO = !CFG.apiUrl;                // no scoreboard address: nothing is recorded
  var recording = !DEMO;                 // switched off if the server says the special edition has closed
  var ROUND = CFG.round || 'line-of-fire';
  var LETTERS = 'ABCDEFGH';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'oakwick-lof-' + ROUND + (DEMO ? '-demo' : ''), WHO = 'oakwick-lof-who';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function sceneById(id) { return byId(SC, id); }
  function letterOf(s, handId) { for (var i = 0; i < s.hands.length; i++) if (s.hands[i].id === handId) return LETTERS.charAt(i); return '?'; }
  function listWords(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  // ---------------- server (only used to record a finished game) ----------------
  var API = {
    complete: function (who) {
      var body = { action: 'complete', round: ROUND, version: F.VERSION, name: who.name, team: who.team, answers: st.answers, pledge: true };
      return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    },
    status: function () { return fetch(CFG.apiUrl + '?action=status&round=' + encodeURIComponent(ROUND)).then(function (r) { return r.json(); }); }
  };
  var ERR = {
    name: 'Please type your name so your completion can be recorded.',
    closed: 'Line of Fire has closed, so this result can’t be recorded now.',
    not_open: 'Line of Fire hasn’t opened yet, so this result can’t be recorded.',
    incomplete: 'Some answers are missing. Please refresh the page and carry on where you left off.',
    version: 'The game has been updated. Please refresh the page.',
    network: 'Couldn’t reach the server to record your result. Check your signal and try again.'
  };
  function errText(e) { return ERR[e] || ERR.network; }

  // ---------------- state ----------------
  // answers: [{s, h:[hand ids], act}] locked in; reveals: the marking for each, in the same order
  var st = fresh();
  function fresh() { return { idx: 0, phase: 'hands', answers: [], reveals: [], pick: { h: {}, act: null } }; }
  function total() { return st.reveals.reduce(function (s, r) { return s + (r.pts || 0); }, 0); }
  function cur() { return SC[Math.min(st.idx, SC.length - 1)]; }
  function picked() { return cur().hands.filter(function (h) { return st.pick.h[h.id]; }).map(function (h) { return h.id; }); }
  function keep() { save(KEY, { v: F.VERSION, answers: st.answers }); }   // progress stays on this device

  // ---------------- the picture ----------------
  var playT, phone = function () { return window.innerWidth <= 820; };
  function drawScene() {
    var s = cur(), art = ART.scene(s.art), svg = $('scene'), rv = st.phase === 'reveal' ? st.reveals[st.reveals.length - 1] : null;
    svg.innerHTML = art.svg + '<g id="hands">' + s.hands.map(function (hd, i) {
      var cls = rv ? (byId(rv.hands, hd.id).danger ? 'danger' : 'safe') : st.pick.h[hd.id] ? 'sel' : '';
      return ART.marker(hd, LETTERS.charAt(i), cls, phone() ? 1.3 : 1);   // bigger hands on a small screen
    }).join('') + '</g>';
    svg.setAttribute('class', st.phase === 'hands' ? 'pick' : '');
    svg.setAttribute('aria-label', art.label + '. ' + s.hands.length + ' hand positions are marked, ' + listWords(s.hands.map(function (h, i) { return LETTERS.charAt(i); })) + '.');
    $('happens').hidden = !rv; $('replay').hidden = !rv || reduceMotion;
    if (rv) { $('happens').innerHTML = '<small>What if…</small>' + esc(rv.happens); play(); }
  }
  function play() {
    var svg = $('scene'), art = ART.scene(cur().art); clearTimeout(playT);
    svg.style.setProperty('--d', reduceMotion ? '0s' : art.dur); svg.style.setProperty('--e', art.ease);
    svg.classList.add('reset'); svg.classList.remove('fail');   // jump back to the start without animating
    void svg.getBoundingClientRect();
    svg.classList.remove('reset');
    playT = setTimeout(function () { svg.classList.add('fail'); }, reduceMotion ? 0 : 800);   // a beat to look at the picture first
  }
  function syncHands() {   // reflect the marked hands without redrawing the picture
    var s = cur();
    s.hands.forEach(function (h) {
      var on = !!st.pick.h[h.id], m = $('scene').querySelector('.hand[data-hand="' + h.id + '"]'), b = $('panel').querySelector('.hbtn[data-hand="' + h.id + '"]');
      if (m) m.setAttribute('class', 'hand' + (on ? ' sel' : ''));
      if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var n = picked().length, go = $('btnHands');
    if (go) { go.disabled = !n; go.textContent = n ? 'Next: make the call' : 'Mark at least one hand'; }
  }
  function toggleHand(id) {
    if (st.phase !== 'hands' || !$('intro').hidden) return;
    st.pick.h[id] = !st.pick.h[id]; syncHands();
  }

  // ---------------- the card ----------------
  function hud() {
    $('hudScene').textContent = Math.min(st.idx + 1, SC.length) + ' / ' + SC.length;
    $('hudScore').textContent = total();
  }
  function handRows(s, rv) {
    return '<ul class="hres">' + rv.hands.map(function (h) {
      var you = h.danger ? (h.picked ? '<span class="you">You marked it.</span>' : '<span class="you no">You missed this one.</span>')
        : (h.picked ? '<span class="you no">You marked it, but this hand is clear.</span>' : '');
      return '<li class="' + (h.danger ? 'danger' : 'safe') + '"><span class="ltr">' + letterOf(s, h.id) + '</span><div><b>' + (h.danger ? 'In the line of fire.' : 'Clear.') + '</b> ' + esc(h.why) + you + '</div></li>';
    }).join('') + '</ul>';
  }
  function actBlock(s, rv) {
    var best = byId(s.options, rv.best), mine = byId(s.options, rv.yours.act) || { label: '?' };
    var cls = rv.act === 1 ? 'good' : rv.act ? 'part' : 'bad';
    var h = '<div class="result ' + cls + '"><h3><span class="pts">+' + rv.actPts + '</span>' + (rv.act === 1 ? '✓ The right call' : rv.act ? '~ Half marks' : '✗ Not the right call') + '</h3>';
    if (rv.act !== 1) h += '<p>You chose: ' + esc(mine.label) + '.</p>';
    if (rv.partialWhy) h += '<p>' + esc(rv.partialWhy) + '</p>';
    h += '<p><b>' + (rv.act === 1 ? '' : 'Best: ') + esc(best.label) + '.</b></p><p>' + esc(rv.why) + '</p></div>';
    return h;
  }
  function handsBlock(s, rv) {
    var cls = rv.handPts >= F.HAND_PTS ? 'good' : rv.handPts > 0 ? 'part' : 'bad';
    return '<div class="result ' + cls + '"><h3><span class="pts">+' + rv.handPts + '</span>You found ' + rv.hits + ' of ' + rv.dangers + ' in the line of fire' + (rv.wrong ? ', and marked ' + rv.wrong + ' that ' + (rv.wrong === 1 ? 'was' : 'were') + ' clear' : '') + '</h3>' + handRows(s, rv) + '</div>';
  }
  function realHtml(rv) { return rv.real ? '<div class="real"><small>In the real world</small><p>' + esc(rv.real) + '</p></div>' : ''; }
  function principleHtml(n) { var p = F.PRINCIPLES[n - 1]; return p ? '<p class="principle"><small>Principle ' + p.n + ' of 5</small>' + esc(p.title) + '</p>' : ''; }
  function render() {
    var s = cur(), p = $('panel'), h = '';
    drawScene();
    h += '<div class="kicker">Moment ' + (st.idx + 1) + ' of ' + SC.length + ' · ' + esc(s.when) + '</div><h2>' + esc(s.title) + '</h2>';
    if (st.phase === 'hands') {
      h += '<p class="note">' + esc(s.situation) + '</p>';
      h += '<p class="ask">Which hands are in the line of fire?</p><p class="hint">Mark every one, on the picture or in this list. What if something moves, slips, drops, swings, energises or fails?</p>';
      h += '<div class="hlist">' + s.hands.map(function (hd, i) { return '<button type="button" class="hbtn" data-hand="' + hd.id + '" aria-pressed="' + (st.pick.h[hd.id] ? 'true' : 'false') + '"><span class="ltr">' + LETTERS.charAt(i) + '</span><span>' + esc(hd.label) + '</span></button>'; }).join('') + '</div>';
      h += '<button type="button" class="btn go wide" id="btnHands"></button>';
    } else if (st.phase === 'act') {
      h += '<p class="picked">You marked <b>' + listWords(picked().map(function (id) { return letterOf(s, id); })) + '</b>. <button type="button" class="linkish" id="btnBack">Change</button></p>';
      h += '<p class="ask">' + esc(s.question) + '</p>';
      h += '<div class="choices">' + s.options.map(function (o) { return '<button type="button" class="choice" data-act="' + o.id + '" aria-pressed="' + (st.pick.act === o.id ? 'true' : 'false') + '">' + esc(o.label) + '</button>'; }).join('') + '</div>';
      h += '<button type="button" class="btn go wide" id="btnLock"' + (st.pick.act ? '' : ' disabled') + '>' + (st.pick.act ? 'Lock in my answer' : 'Choose one') + '</button>';
    } else {
      var rv = st.reveals[st.reveals.length - 1];
      h += handsBlock(s, rv) + actBlock(s, rv) + realHtml(rv) + principleHtml(rv.principle);
      h += '<button type="button" class="btn go wide" id="btnNext">' + (st.idx + 1 < SC.length ? 'Next moment →' : 'Finish') + '</button>';
    }
    p.innerHTML = h;
    p.scrollTop = 0;
    p.querySelectorAll('.hbtn').forEach(function (b) { b.addEventListener('click', function () { toggleHand(b.dataset.hand); }); });
    p.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { st.pick.act = b.dataset.act; render(); }); });
    if ($('btnHands')) { $('btnHands').addEventListener('click', function () { if (picked().length) go('act'); }); syncHands(); }
    if ($('btnBack')) $('btnBack').addEventListener('click', function () { st.pick.act = null; go('hands'); });
    if ($('btnLock')) $('btnLock').addEventListener('click', function () { if (st.pick.act) answer(s); });
    if ($('btnNext')) $('btnNext').addEventListener('click', next);
    hud();
  }
  function toTop() { if (phone()) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }
  function go(phase) { st.phase = phase; render(); toTop(); }

  // lock in this moment's answer and show the marking
  function answer(s) {
    var r = F.step(st.answers, { s: s.id, h: picked(), act: st.pick.act });
    if (r.error) return;
    st.answers = r.answers; st.reveals.push(r.reveal); keep(); go('reveal');
  }
  function next() {
    if (st.idx + 1 >= SC.length) { st.idx = SC.length; showPledge(); return; }
    st.idx++; st.phase = 'hands'; st.pick = { h: {}, act: null }; render(); toTop();
  }

  var toastT;
  function toast(m) { var e = $('toast'); e.textContent = m; e.className = 'toast show'; clearTimeout(toastT); toastT = setTimeout(function () { e.className = 'toast'; }, 2800); }
  $('scene').addEventListener('click', function (e) { var el = e.target.closest('.hand'); if (el) toggleHand(el.dataset.hand); });
  $('replay').addEventListener('click', play);

  // ---------------- the commitment (finishes the game) ----------------
  function principlesList() {
    return '<ol class="plist">' + F.PRINCIPLES.map(function (p) { return '<li><div><b>' + esc(p.title) + '</b><span>' + esc(p.text) + '</span></div></li>'; }).join('') + '</ol>';
  }
  function stopBox() {
    return '<div class="stopbox"><div class="sign" aria-hidden="true">STOP</div><p><b>You have the authority to stop.</b> If something doesn’t look right, the plan doesn’t cover what you’re doing, conditions have changed, or the job feels so routine that nobody has thought about hands: stop. Nobody will be criticised for stopping a job to keep people safe.</p></div>';
  }
  function validName(v) { return String(v || '').replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2; }
  function showPledge(err, failed) {
    var who = load(WHO) || {};
    var h = '<div class="kicker">Eight moments done · one thing left</div><h2>Take this back to work</h2>' +
      '<p class="quote"><small>The question, before every task</small>“' + esc(F.QUESTION) + '”</p>' +
      '<p>If you can’t answer it with confidence, stop and reassess before you start.</p>' +
      '<h2>Five principles</h2>' + principlesList() + stopBox() +
      '<div class="commit"><small>My commitment</small><p>“' + esc(F.COMMITMENT) + '”</p></div>';
    if (recording) {
      h += '<form class="who" id="whoForm" novalidate>' +
        '<label for="whoName"><span>Your name</span><input id="whoName" name="name" maxlength="60" autocomplete="name" required value="' + esc(who.name || '') + '"></label>' +
        '<label for="whoTeam"><span>Company or team <span class="opt">(optional)</span></span><input id="whoTeam" name="team" maxlength="60" autocomplete="organization" value="' + esc(who.team || '') + '"></label>' +
        '<p class="small">Your name, company or team and score are recorded, so there’s a record that you’ve completed this.</p>' +
        '<button type="submit" class="btn go wide" id="btnPledge">I make this commitment</button></form>';
    } else {
      h += '<button type="button" class="btn go wide" id="btnPledge">I make this commitment</button>' +
        '<p class="small" style="margin-top:10px">' + (DEMO ? 'In the live game you type your name here, and your completion is recorded.' : esc(ERR.closed)) + '</p>';
    }
    if (err) h += '<p class="error" role="alert">' + esc(err) + '</p>';
    if (failed) h += '<div class="row"><button type="button" class="btn ghost" id="btnSkip">See my results without recording them</button></div>';
    $('pledgeBody').innerHTML = h; $('pledge').hidden = false; $('intro').hidden = true; $('results').hidden = true;
    if (!err) $('pledgeBody').scrollTop = 0; else $('pledgeBody').scrollTop = $('pledgeBody').scrollHeight;
    if (recording) $('whoForm').addEventListener('submit', function (e) { e.preventDefault(); finish(); });
    else $('btnPledge').addEventListener('click', finish);
    if ($('btnSkip')) $('btnSkip').addEventListener('click', function () { results(null); });
  }
  function results(recordedAs) {
    save(KEY, null);   // finished: the next visit starts afresh
    showResults({ score: F.score(st.answers).total, review: st.reveals, name: recordedAs });
  }
  function finish() {
    if (!recording) { results(null); return; }
    var who = { name: $('whoName').value.trim(), team: $('whoTeam').value.trim() };
    if (!validName(who.name)) { showPledge(ERR.name); $('whoName').focus(); return; }
    save(WHO, who);
    var b = $('btnPledge'); b.disabled = true; b.textContent = 'Recording…';
    API.complete(who).then(function (r) {
      if (r && r.ok) { results(r.name || who.name); return; }
      if (r && (r.error === 'closed' || r.error === 'not_open')) { recording = false; showPledge(errText(r.error)); return; }
      showPledge(errText(r && r.error), !(r && r.error === 'name'));
    }).catch(function () { showPledge(ERR.network, true); });
  }

  // ---------------- results ----------------
  function rowsHtml(review) {
    return review.map(function (rv, i) {
      var s = sceneById(rv.s); if (!s) return '';
      var detail = '<span class="' + (rv.hits === rv.dangers && !rv.wrong ? 'ok' : 'no') + '">Hands ' + rv.hits + '/' + rv.dangers + (rv.wrong ? ', ' + rv.wrong + ' wrongly marked' : '') + '</span> · <span class="' + (rv.act === 1 ? 'ok' : 'no') + '">' + (rv.act === 1 ? 'Right call' : rv.act ? 'Half marks for the call' : 'Wrong call') + '</span>';
      return '<details class="rrow"><summary><span class="n">' + (i + 1) + '</span><div><b>' + esc(s.title) + '</b><small>' + detail + '</small></div><span class="p">' + rv.pts + '</span></summary><div class="body">' + handRows(s, rv) + '<p><b>Best call: ' + esc(byId(s.options, rv.best).label) + '.</b> ' + esc(rv.why) + '</p>' + (rv.real ? '<p><b>In the real world.</b> ' + esc(rv.real) + '</p>' : '') + '</div></details>';
    }).join('');
  }
  function showResults(d) {
    var review = d.review || [], hits = 0, dangers = 0, wrong = 0, calls = 0;
    review.forEach(function (r) { hits += r.hits; dangers += r.dangers; wrong += r.wrong; if (r.act === 1) calls++; });
    var h = '<div class="kicker">Line of Fire · completed</div>';
    h += '<div class="scoreline"><div class="big">' + d.score + '</div><div class="of">out of ' + F.MAX + '</div></div>';
    h += '<p>You found <b>' + hits + ' of ' + dangers + '</b> hands in the line of fire' + (wrong ? ', marked <b>' + wrong + '</b> that ' + (wrong === 1 ? 'was' : 'were') + ' clear,' : '') + ' and made the best call in <b>' + calls + ' of ' + SC.length + '</b> moments.</p>';
    if (d.name) h += '<p class="state-msg">Thanks, ' + esc(d.name) + '. Your result and your commitment are recorded.</p>';
    else if (!DEMO) h += '<p class="state-msg">This result wasn’t recorded.</p>';
    h += '<div class="rlist">' + rowsHtml(review) + '</div>';
    h += '<p class="quote"><small>Before every task</small>“' + esc(F.QUESTION) + '”</p>';
    h += '<div class="commit"><small>Your commitment</small><p>“' + esc(F.COMMITMENT) + '”</p></div>';
    h += '<p class="closing">No job is so urgent that it is worth a finger.</p>';
    h += '<div class="row"><button type="button" class="btn ' + (DEMO ? 'go' : 'ghost') + '" id="btnAgain">Play again</button></div>';
    if (DEMO) h += '<p class="proto">Demo. In the live game the player’s name and result go on the completion record. There is no prize and no Top 10.</p>';
    $('resultsBody').innerHTML = h; $('results').hidden = false; $('intro').hidden = true; $('pledge').hidden = true;
    $('resultsBody').scrollTop = 0;
    $('btnAgain').addEventListener('click', function () { st = fresh(); $('results').hidden = true; render(); bootIntro(); });
  }

  // ---------------- intro ----------------
  function begin(saved) {
    st = fresh();
    if (saved) { st.reveals = F.review(saved); st.answers = st.reveals.map(function (r) { return { s: r.s, h: r.yours.h, act: r.yours.act }; }); st.idx = st.answers.length; }
    $('intro').hidden = true;
    if (st.idx >= SC.length) showPledge(); else { render(); if (saved) setTimeout(function () { toast('Welcome back. You’re on moment ' + (st.idx + 1) + '.'); }, 400); }
  }
  function recordNote() {
    $('introRecord').textContent = DEMO ? '' : recording ? 'At the end you’ll be asked for your name, so there’s a record that you’ve completed it.' : 'Line of Fire has closed, so results aren’t being recorded now. You can still play it.';
  }
  function bootIntro() {
    $('intro').hidden = false; $('results').hidden = true; $('pledge').hidden = true;
    var saved = load(KEY), part = saved && saved.v === F.VERSION && saved.answers && saved.answers.length ? saved.answers : null;
    var h = '<div class="row">';
    if (part) h += '<button type="button" class="btn ghost" id="btnStart">Start again</button><button type="button" class="btn go" id="btnResume">Carry on where I left off</button>';
    else h += '<button type="button" class="btn go" id="btnStart">Start</button>';
    $('introState').innerHTML = h + '</div>';
    recordNote();
    $('btnStart').addEventListener('click', function () { save(KEY, null); begin(null); });
    if ($('btnResume')) $('btnResume').addEventListener('click', function () { begin(part); });
  }

  var rt, wasPhone = phone();
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (phone() !== wasPhone) { wasPhone = phone(); drawScene(); } }, 250); });
  $('introQuote').innerHTML = '“' + esc(F.QUESTION) + '”';
  if (DEMO) document.body.classList.add('demo');
  render();
  bootIntro();
  // Is the special edition still open for recording? (If this check fails, the commitment step finds out instead.)
  if (!DEMO) API.status().then(function (r) { if (r && r.ok && !r.open) { recording = false; recordNote(); } }).catch(function () { });
  window.__lof = { get st() { return st; }, render: render, play: play, showPledge: showPledge };
})();

/* =====================================================================
 * Oakwick Games: Google Apps Script backend
 * ---------------------------------------------------------------------
 * - Players have a permanent personal key, tied to their email address.
 *   Each month they're emailed a link containing their key, which signs
 *   them in. No codes or names to type.
 * - One attempt per player per round. Progress is saved to the server, so
 *   they can carry on on another device, but never start again.
 * - Every submission is re-scored on the server from the raw cuts.
 * - When the round closes (automatically, or from the menu) everyone who
 *   played is emailed the winner, their own result and a link to the
 *   winning submission, which is then public on the game page.
 *
 * Tabs (created by "Oakwick Games > Set up sheets"):
 *   Players  : Name | Email | Key | Active | Invited (round) | Added
 *   Rounds   : Round | Title | Game URL | Closes | Status | Winner | Winner score | Results emailed
 *   Attempts : Round | Email | Name | Status | Started | Submitted | Score | Time (s) | Breakdown | Data | Engine | Results emailed
 * ===================================================================== */

// One entry per monthly round: how the server re-scores a submission.
// Next month: paste the new game's engine above this file and add a line here.
var GAMES = {
  '2026-10': {
    version: function () { return LineClear.VERSION; },
    sanitise: function (moves) { return LineClear.sanitise(moves); },
    score: function (moves) {
      var r = LineClear.scoreAll(moves);
      return { total: r.total, breakdown: 'A ' + Math.round(r.trees[0].points.total) + ' / B ' + Math.round(r.trees[1].points.total), data: r.cuts };
    }
  }
};

var PLAYER_HEAD = ['Name', 'Email', 'Key', 'Active', 'Invited (round)', 'Added'];
var ROUND_HEAD = ['Round', 'Title', 'Game URL', 'Closes', 'Status', 'Winner', 'Winner score', 'Results emailed'];
var ATTEMPT_HEAD = ['Round', 'Email', 'Name', 'Status', 'Started', 'Submitted', 'Score', 'Time (s)', 'Breakdown', 'Data', 'Engine', 'Results emailed'];
var KEY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var SENDER_NAME = 'Oakwick Games';

// ---------------- web endpoints ----------------
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'top') return json_(topResponse_(p.round));
    if (p.action === 'winner') return json_(winner_(p.round));
    if (p.action === 'status') return json_(status_(p.round));
    return json_({ ok: true, service: 'Oakwick Games', round: (currentRound_() || {}).id || null });
  } catch (err) { return json_({ ok: false, error: 'server', detail: String(err) }); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (body.action === 'whoami') return json_(whoami_(body));
    if (body.action === 'start') return json_(start_(body));
    if (body.action === 'save') return json_(save_(body));
    if (body.action === 'submit') return json_(submit_(body));
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    return json_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ---------------- player actions ----------------
function openRound_(id) {
  var r = roundById_(id);
  if (!r) return { error: 'closed' };
  if (r.status !== 'Open' || (r.closes && new Date() > r.closes)) return { error: 'closed', round: r };
  if (!GAMES[r.id]) return { error: 'closed', round: r };
  return { round: r };
}

function whoami_(body) {
  var pl = playerByKey_(body.key);
  if (!pl) return { ok: false, error: 'key' };
  var r = roundById_(body.round);
  var out = { ok: true, name: pl.name, round: body.round, open: !!(r && r.status === 'Open' && !(r.closes && new Date() > r.closes)), closes: r && r.closes ? r.closes.getTime() : null, status: 'new' };
  var at = attempt_(body.round, pl.email);
  if (at) {
    out.status = at.get('Status') === 'Submitted' ? 'submitted' : 'started';
    if (out.status === 'submitted') { out.score = Number(at.get('Score')); out.secs = numOrNull_(at.get('Time (s)')); out.cuts = parseData_(at.get('Data')); }
  }
  return out;
}

function start_(body) {
  var pl = playerByKey_(body.key);
  if (!pl) return { ok: false, error: 'key' };
  var o = openRound_(body.round);
  if (o.error) return { ok: false, error: o.error };
  var game = GAMES[o.round.id];
  if (body.version && body.version !== game.version()) return { ok: false, error: 'version' };
  var at = attempt_(o.round.id, pl.email);
  if (at) {
    if (at.get('Status') === 'Submitted') return { ok: false, error: 'used' };
    // already started: resume the same attempt (same cuts, same clock) on any device
    var st = at.get('Started');
    return { ok: true, resumed: true, name: pl.name, startedAt: st instanceof Date ? st.getTime() : Date.now(), cuts: parseData_(at.get('Data')) };
  }
  var now = new Date();
  sheet_('Attempts', ATTEMPT_HEAD).appendRow([o.round.id, pl.email, pl.name, 'Started', now, '', '', '', '', '[]', game.version(), '']);
  return { ok: true, resumed: false, name: pl.name, startedAt: now.getTime(), cuts: [] };
}

function save_(body) {
  var pl = playerByKey_(body.key);
  if (!pl) return { ok: false, error: 'key' };
  var o = openRound_(body.round);
  if (o.error) return { ok: false, error: o.error };
  var at = attempt_(o.round.id, pl.email);
  if (!at || at.get('Status') !== 'Started') return { ok: false, error: at ? 'used' : 'not_started' };
  at.set({ Data: JSON.stringify(GAMES[o.round.id].sanitise(body.cuts)) });
  return { ok: true };
}

function submit_(body) {
  var pl = playerByKey_(body.key);
  if (!pl) return { ok: false, error: 'key' };
  var o = openRound_(body.round);
  if (o.error) return { ok: false, error: o.error };
  var game = GAMES[o.round.id];
  var at = attempt_(o.round.id, pl.email);
  if (!at) return { ok: false, error: 'not_started' };
  if (at.get('Status') === 'Submitted') return { ok: false, error: 'used' };
  var res = game.score(body.cuts);                    // authoritative re-score on the server
  var now = new Date(), started = at.get('Started');
  var secs = started instanceof Date ? Math.round((now - started) / 1000) : null;
  at.set({ Status: 'Submitted', Submitted: now, Score: res.total, 'Time (s)': secs, Breakdown: res.breakdown, Data: JSON.stringify(res.data), Engine: game.version() });
  CacheService.getScriptCache().remove('top_' + o.round.id);
  return { ok: true, score: res.total, secs: secs, top: topList_(o.round.id) };
}

// ---------------- public reads ----------------
function topResponse_(roundId) {
  roundId = roundId || (currentRound_() || {}).id;
  var cache = CacheService.getScriptCache(), key = 'top_' + roundId, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var out = { ok: true, round: roundId, top: topList_(roundId) };
  cache.put(key, JSON.stringify(out), 30);
  return out;
}

function status_(roundId) {
  var r = roundById_(roundId || (currentRound_() || {}).id);
  if (!r) return { ok: false, error: 'no_round' };
  var open = r.status === 'Open' && !(r.closes && new Date() > r.closes);
  var closed = r.status === 'Closed' && r.winner && r.winner !== '(no entries)';
  return { ok: true, round: r.id, title: r.title, open: open, closes: r.closes ? r.closes.getTime() : null, winner: closed ? r.winner : null, winnerScore: closed ? Number(r.get('Winner score')) : null };
}

// The winning submission: only published once the round is closed.
function winner_(roundId) {
  var r = roundById_(roundId || (currentRound_() || {}).id);
  if (!r || r.status !== 'Closed') return { ok: false, error: 'not_closed' };
  var rows = standings_(r.id);
  if (!rows.length) return { ok: false, error: 'no_entries' };
  var w = rows[0];
  return { ok: true, round: r.id, title: r.title, name: w.name, score: w.score, secs: w.secs, cuts: w.cuts, top: rows.slice(0, 10).map(publicRow_) };
}

function topList_(roundId) { return standings_(roundId).slice(0, 10).map(publicRow_); }
function publicRow_(r) { return { name: r.name, score: r.score, secs: r.secs }; }
function standings_(roundId) {
  var vals = sheet_('Attempts', ATTEMPT_HEAD).getDataRange().getValues(), H = vals[0], rows = [];
  var c = function (n) { return H.indexOf(n); };
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (String(v[c('Round')]) !== String(roundId) || v[c('Status')] !== 'Submitted') continue;
    rows.push({ name: String(v[c('Name')]), email: String(v[c('Email')]), score: Number(v[c('Score')]) || 0, secs: numOrNull_(v[c('Time (s)')]),
      at: v[c('Submitted')] instanceof Date ? v[c('Submitted')].getTime() : 0, cuts: parseData_(v[c('Data')]), row: i + 1, emailed: v[c('Results emailed')] });
  }
  rows.sort(function (a, b) { return b.score - a.score || (a.secs == null ? 1e9 : a.secs) - (b.secs == null ? 1e9 : b.secs) || a.at - b.at; });
  return rows;
}

// ---------------- closing a round ----------------
// Run hourly by the trigger from "Turn on automatic month-end close".
function autoCloseRounds() {
  var rs = rounds_();
  rs.forEach(function (r) { if (r.status === 'Open' && r.closes && new Date() > r.closes) closeRound_(r.id); });
  // finish sending any results emails that hit the daily quota yesterday
  rs.forEach(function (r) { if (r.status === 'Closed' && !r.emailedDone) emailResults_(r.id); });
}

function closeRound_(roundId) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var r = roundById_(roundId); if (!r) return 'Round not found.';
    var rows = standings_(roundId);
    r.set({ Status: 'Closed', Winner: rows.length ? rows[0].name : '(no entries)', 'Winner score': rows.length ? rows[0].score : '' });
    CacheService.getScriptCache().remove('top_' + roundId);
  } finally { lock.releaseLock(); }
  return emailResults_(roundId);
}

function emailResults_(roundId) {
  var r = roundById_(roundId); if (!r || r.status !== 'Closed') return 'Round is not closed.';
  var rows = standings_(roundId); if (!rows.length) { r.set({ 'Results emailed': 'No entries' }); return 'No entries, so no emails sent.'; }
  var w = rows[0], sent = 0, pending = 0, sh = sheet_('Attempts', ATTEMPT_HEAD), col = ATTEMPT_HEAD.indexOf('Results emailed') + 1;
  var link = winnerLink_(r);
  var top10 = rows.slice(0, 10).map(function (x, i) { return '<tr><td style="padding:3px 10px 3px 0">' + (i + 1) + '.</td><td style="padding:3px 16px 3px 0">' + esc_(x.name) + '</td><td style="text-align:right"><b>' + x.score + '</b></td></tr>'; }).join('');
  for (var i = 0; i < rows.length; i++) {
    var p = rows[i];
    if (p.emailed) continue;
    if (MailApp.getRemainingDailyQuota() < 1) { pending++; continue; }
    var isWinner = i === 0;
    var html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b1f1c;max-width:560px">' +
      '<h2 style="color:#1f3a2b;margin:0 0 6px">' + esc_(r.title || 'Oakwick Games') + ': the results</h2>' +
      (isWinner ? '<p style="font-size:17px"><b>Congratulations, ' + esc_(p.name) + '! You won this month with ' + p.score + ' points.</b></p>'
        : '<p>This month\'s winner is <b>' + esc_(w.name) + '</b> with <b>' + w.score + '</b> points.</p>') +
      '<p>You scored <b>' + p.score + '</b> and finished <b>' + ordinal_(i + 1) + '</b> out of ' + rows.length + '.</p>' +
      (link ? '<p><a href="' + link + '" style="display:inline-block;background:#ff7a00;color:#1a1100;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">See the winning cuts and how each one scored</a></p>' : '') +
      '<p style="margin-top:18px"><b>Final Top 10</b></p><table style="border-collapse:collapse;font-size:14px">' + top10 + '</table>' +
      '<p style="color:#5e6660;font-size:12px;margin-top:20px">Thanks for playing. Look out for next month\'s game.</p></div>';
    MailApp.sendEmail({ to: p.email, subject: (r.title || 'Oakwick Games') + ': ' + (isWinner ? 'you won!' : w.name + ' wins'), htmlBody: html, name: SENDER_NAME });
    sh.getRange(p.row, col).setValue(new Date()); sent++;
  }
  r.set({ 'Results emailed': pending ? 'Partly (' + pending + ' waiting for quota)' : new Date() });
  return 'Results emailed to ' + sent + ' player(s).' + (pending ? ' ' + pending + ' still to send. Daily email limit reached; they\'ll go automatically tomorrow if automatic close is on, or run "Close round & email results" again.' : '');
}

function winnerLink_(r) { return r.url ? r.url + (r.url.indexOf('?') >= 0 ? '&' : '?') + 'view=winner&round=' + encodeURIComponent(r.id) : ''; }
function playLink_(r, key) { return r.url ? r.url + (r.url.indexOf('?') >= 0 ? '&' : '?') + 'k=' + encodeURIComponent(key) : ''; }

// ---------------- data helpers ----------------
function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function rowObj_(sh, head, rowNum, values) {
  return {
    get: function (col) { return values[head.indexOf(col)]; },
    set: function (obj) { for (var k in obj) { var c = head.indexOf(k); if (c >= 0) { sh.getRange(rowNum, c + 1).setValue(obj[k]); values[c] = obj[k]; } } }
  };
}
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function numOrNull_(v) { return v === '' || v == null ? null : Number(v); }
function parseData_(s) { try { var v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function ordinal_(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function playerByKey_(key) {
  key = String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length < 12) return null;
  var vals = sheet_('Players', PLAYER_HEAD).getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][2]).toUpperCase() === key && String(vals[i][3]).toUpperCase() !== 'N' && vals[i][1]) {
      return { name: String(vals[i][0]).trim() || normEmail_(vals[i][1]).split('@')[0], email: normEmail_(vals[i][1]), key: key, row: i + 1 };
    }
  }
  return null;
}
function attempt_(roundId, email) {
  var sh = sheet_('Attempts', ATTEMPT_HEAD), vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(roundId) && normEmail_(vals[i][1]) === email) return rowObj_(sh, ATTEMPT_HEAD, i + 1, vals[i]);
  }
  return null;
}
function rounds_() {
  var sh = sheet_('Rounds', ROUND_HEAD), vals = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i]; if (!String(v[0]).trim()) continue;
    var r = rowObj_(sh, ROUND_HEAD, i + 1, v);
    r.id = String(v[0]).trim(); r.title = String(v[1] || ''); r.url = String(v[2] || '').trim();
    r.closes = v[3] instanceof Date ? v[3] : (v[3] ? new Date(v[3]) : null);
    r.status = String(v[4] || 'Open'); r.winner = String(v[5] || ''); r.emailedDone = v[7] instanceof Date || v[7] === 'No entries';
    out.push(r);
  }
  return out;
}
function roundById_(id) { var rs = rounds_(); for (var i = 0; i < rs.length; i++) if (rs[i].id === String(id)) return rs[i]; return null; }
function currentRound_() { var rs = rounds_(), open = rs.filter(function (r) { return r.status === 'Open'; }); return open.length ? open[open.length - 1] : rs[rs.length - 1] || null; }
function newKey_(existing) {
  for (var t = 0; t < 1000; t++) {
    var s = ''; for (var i = 0; i < 16; i++) s += KEY_CHARS.charAt(Math.floor(Math.random() * KEY_CHARS.length));
    if (!existing[s]) { existing[s] = true; return s; }
  }
  throw new Error('Could not make a unique key');
}

// ---------------- admin menu (in the Google Sheet) ----------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Oakwick Games')
    .addItem('Set up sheets', 'setupSheets')
    .addItem('Create keys for new players', 'createKeys')
    .addSeparator()
    .addItem('Email this month\'s invitations', 'sendInvitations')
    .addItem('Email a reminder to players who haven\'t finished', 'sendReminders')
    .addSeparator()
    .addItem('Show current Top 3', 'showTop')
    .addItem('Close round & email results now', 'closeRoundNow')
    .addItem('Turn on automatic month-end close', 'installAutoClose')
    .addSeparator()
    .addItem('Start a new round…', 'startNewRound')
    .addItem('Reset a player\'s attempt…', 'resetAttempt')
    .addToUi();
}
function ui_() { return SpreadsheetApp.getUi(); }

function setupSheets() {
  sheet_('Players', PLAYER_HEAD); sheet_('Attempts', ATTEMPT_HEAD);
  var rs = sheet_('Rounds', ROUND_HEAD);
  if (rs.getLastRow() < 2) rs.appendRow(['2026-10', 'Line Clear (October 2026)', 'https://YOUR-USERNAME.github.io/oakwick-games/games/2026-10-line-clear/', new Date(2026, 9, 31, 23, 59), 'Open', '', '', '']);
  ui_().alert('Sheets ready.\n\n1. Rounds tab: put your real GitHub Pages game address in "Game URL" and check the closing date and time.\n2. Players tab: add each person\'s Name and Email, then run Oakwick Games > Create keys for new players.\n3. Oakwick Games > Email this month\'s invitations.');
}

function createKeys() {
  var sh = sheet_('Players', PLAYER_HEAD), vals = sh.getDataRange().getValues(), ex = {}, n = 0, seen = {}, dups = [];
  for (var i = 1; i < vals.length; i++) if (vals[i][2]) ex[String(vals[i][2]).toUpperCase()] = true;
  for (i = 1; i < vals.length; i++) {
    var em = normEmail_(vals[i][1]); if (!em) continue;
    if (seen[em]) { dups.push(em); continue; } seen[em] = true;
    if (!vals[i][2]) { sh.getRange(i + 1, 3, 1, 4).setValues([[newKey_(ex), vals[i][3] || 'Y', vals[i][4] || '', new Date()]]); n++; }
  }
  ui_().alert(n + ' new key(s) created.' + (dups.length ? '\n\nThese emails appear more than once, so only the first row was used: ' + dups.join(', ') : '') + '\n\nKeys are permanent. To stop someone playing, set Active to N.');
}

function sendInvitations() { invite_(false); }
function sendReminders() { invite_(true); }
function invite_(reminder) {
  var r = currentRound_();
  if (!r || r.status !== 'Open') { ui_().alert('There is no open round. Use Start a new round… first.'); return; }
  if (!r.url || /YOUR-USERNAME/.test(r.url)) { ui_().alert('Put the real game address in the Rounds tab ("Game URL") first.'); return; }
  var sh = sheet_('Players', PLAYER_HEAD), vals = sh.getDataRange().getValues(), sent = 0, skipped = 0, noQuota = 0;
  var closes = r.closes ? Utilities.formatDate(r.closes, Session.getScriptTimeZone(), "EEEE d MMMM 'at' HH:mm") : 'the end of the month';
  for (var i = 1; i < vals.length; i++) {
    var name = String(vals[i][0]).trim(), em = normEmail_(vals[i][1]), key = String(vals[i][2]), active = String(vals[i][3]).toUpperCase() !== 'N';
    if (!em || !key || !active) continue;
    if (!reminder && String(vals[i][4]) === r.id) { skipped++; continue; }           // already invited this round
    if (reminder) { var at = attempt_(r.id, em); if (at && at.get('Status') === 'Submitted') { skipped++; continue; } }
    if (MailApp.getRemainingDailyQuota() < 1) { noQuota++; continue; }
    var link = playLink_(r, key);
    var html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b1f1c;max-width:560px">' +
      '<p>Hi ' + esc_(name.split(' ')[0] || 'there') + ',</p>' +
      '<p>' + (reminder ? 'Just a reminder: you haven\'t submitted this month\'s game yet.' : 'This month\'s Oakwick game is live: <b>' + esc_(r.title) + '</b>.') + '</p>' +
      '<p><a href="' + link + '" style="display:inline-block;background:#ff7a00;color:#1a1100;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Play now</a></p>' +
      '<p>This link is personal to you. It signs you in, so please don\'t forward it. You get <b>one attempt</b>, and you can carry on on another device if you need to.</p>' +
      '<p>The round closes ' + closes + '. The top score wins this month\'s prize.</p></div>';
    MailApp.sendEmail({ to: em, subject: (reminder ? 'Reminder: ' : '') + r.title + ': your link to play', htmlBody: html, name: SENDER_NAME });
    if (!reminder) sh.getRange(i + 1, 5).setValue(r.id);
    sent++;
  }
  ui_().alert(sent + ' email(s) sent.' + (skipped ? ' ' + skipped + ' skipped (' + (reminder ? 'already submitted' : 'already invited this round') + ').' : '') + (noQuota ? '\n\n' + noQuota + ' not sent because the daily email limit was reached. Run this again tomorrow; it only sends to people who haven\'t had one.' : ''));
}

function showTop() {
  var r = currentRound_(); if (!r) { ui_().alert('No rounds yet.'); return; }
  var rows = standings_(r.id);
  ui_().alert(r.title + ' (' + r.status + ')\n\n' + (rows.length ? rows.slice(0, 3).map(function (t, i) { return (i + 1) + '. ' + t.name + ' (' + t.email + '): ' + t.score + (t.secs != null ? ', ' + Math.floor(t.secs / 60) + 'm ' + (t.secs % 60) + 's' : ''); }).join('\n') : 'No scores yet.') + '\n\n' + rows.length + ' submitted so far.');
}

function closeRoundNow() {
  var r = currentRound_(); if (!r) { ui_().alert('No rounds yet.'); return; }
  if (r.status === 'Closed') { ui_().alert(emailResults_(r.id)); return; }
  var ok = ui_().alert('Close ' + r.title + ' now?', 'No more attempts will be accepted. Everyone who played will be emailed the result, and the winning submission will be published.', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;
  ui_().alert(closeRound_(r.id));
}

function installAutoClose() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoCloseRounds') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('autoCloseRounds').timeBased().everyHours(1).create();
  ui_().alert('Done. Every hour the script checks the Rounds tab. Once a round\'s closing time has passed, it closes the round, emails the results and publishes the winning submission.');
}

function startNewRound() {
  var ui = ui_(), cur = currentRound_();
  if (cur && cur.status === 'Open') { ui.alert('Close ' + cur.title + ' first (Close round & email results now).'); return; }
  var a = ui.prompt('New round ID', 'e.g. 2026-11. It must match "round" in the new game\'s config.js.', ui.ButtonSet.OK_CANCEL); if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('Title', 'e.g. Chipper Challenge (November 2026)', ui.ButtonSet.OK_CANCEL); if (b.getSelectedButton() !== ui.Button.OK) return;
  var c = ui.prompt('Game URL', 'The GitHub Pages address of the new game folder.', ui.ButtonSet.OK_CANCEL); if (c.getSelectedButton() !== ui.Button.OK) return;
  var id = a.getResponseText().trim();
  var d = new Date(); var closes = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59);
  sheet_('Rounds', ROUND_HEAD).appendRow([id, b.getResponseText().trim(), c.getResponseText().trim(), closes, 'Open', '', '', '']);
  ui.alert('Round ' + id + ' is open and closes ' + closes.toDateString() + ' 23:59 (edit it in the Rounds tab if needed).\n\nRemember: the server also needs the new game\'s scoring (GAMES entry). Then send the invitations.');
}

function resetAttempt() {
  var ui = ui_(), r = currentRound_(); if (!r) return;
  var a = ui.prompt('Reset an attempt', 'Email address of the player (round ' + r.id + '). This deletes their unfinished attempt so they can start again from scratch. Submitted scores can\'t be reset.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var em = normEmail_(a.getResponseText()), sh = sheet_('Attempts', ATTEMPT_HEAD), vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]) === r.id && normEmail_(vals[i][1]) === em) {
      if (vals[i][3] === 'Submitted') { ui.alert('That player has already submitted, so it can\'t be reset.'); return; }
      sh.deleteRow(i + 1); ui.alert('Attempt reset.'); return;
    }
  }
  ui.alert('No attempt found for that email this round.');
}

/* =====================================================================
 * Oakwick Games scoreboard: Google Apps Script backend
 * ---------------------------------------------------------------------
 * Handles access codes (one attempt each), re-scores every submission on
 * the server from the raw cuts, and serves the Top 10.
 * Sheets used (created automatically by "Oakwick Games > Set up sheets"):
 *   Codes  : Round | Code | Issued to | Status | Started | Submitted | Name used | Token
 *   Scores : Round | Submitted | Name | Score | Time (s) | Breakdown | Code | Issued to | Data | Engine
 * ===================================================================== */

// One entry per monthly round: how the server re-scores a submission.
// Next month: paste the new game's engine above this file and add a line here.
var GAMES = {
  '2026-10': {
    version: function () { return LineClear.VERSION; },
    score: function (body) {
      var r = LineClear.scoreAll(body.cuts);
      return { total: r.total, breakdown: 'A ' + Math.round(r.trees[0].points.total) + ' / B ' + Math.round(r.trees[1].points.total), data: JSON.stringify(r.cuts) };
    }
  }
};

var CODE_HEAD = ['Round', 'Code', 'Issued to', 'Status', 'Started', 'Submitted', 'Name used', 'Token'];
var SCORE_HEAD = ['Round', 'Submitted', 'Name', 'Score', 'Time (s)', 'Breakdown', 'Code', 'Issued to', 'Data', 'Engine'];
var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------------- web endpoints ----------------
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'top') return json_(topResponse_(p.round || currentRound_()));
    return json_({ ok: true, service: 'Oakwick Games scoreboard', round: currentRound_() });
  } catch (err) { return json_({ ok: false, error: 'server', detail: String(err) }); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (body.action === 'start') return json_(start_(body));
    if (body.action === 'submit') return json_(submit_(body));
    if (body.action === 'top') return json_(topResponse_(body.round || currentRound_()));
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    return json_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ---------------- actions ----------------
function start_(body) {
  var round = currentRound_();
  var game = GAMES[round];
  if (body.round !== round || !game) return { ok: false, error: 'closed' };
  if (body.version && body.version !== game.version()) return { ok: false, error: 'version' };
  var name = cleanName_(body.name);
  if (!name) return { ok: false, error: 'name' };
  var row = findCode_(round, body.code);
  if (!row) return { ok: false, error: 'invalid' };
  if (row.status === 'Submitted') return { ok: false, error: 'used' };
  if (row.status !== 'Unused' && row.status !== '') return { ok: false, error: 'started' };
  var token = Utilities.getUuid();
  row.set({ Status: 'Started', Started: new Date(), 'Name used': name, Token: token });
  return { ok: true, token: token };
}

function submit_(body) {
  var round = currentRound_(), game = GAMES[round];
  if (body.round !== round || !game) return { ok: false, error: 'closed' };
  var row = findCode_(round, body.code);
  if (!row) return { ok: false, error: 'invalid' };
  if (row.status === 'Submitted') return { ok: false, error: 'used' };
  if (row.status !== 'Started' || !body.token || body.token !== row.get('Token')) return { ok: false, error: 'token' };
  var res = game.score(body);                        // authoritative re-score on the server
  var now = new Date(), started = row.get('Started');
  var secs = started instanceof Date ? Math.round((now - started) / 1000) : null;
  var name = row.get('Name used') || cleanName_(body.name) || 'Player';
  sheet_('Scores', SCORE_HEAD).appendRow([
    round, now, name, res.total, secs, res.breakdown,
    row.get('Code'), row.get('Issued to'), res.data, game.version()
  ]);
  row.set({ Status: 'Submitted', Submitted: now });
  CacheService.getScriptCache().remove('top_' + round);
  var top = topList_(round);
  return { ok: true, score: res.total, secs: secs, top: top };
}

function topResponse_(round) {
  var cache = CacheService.getScriptCache(), key = 'top_' + round, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var out = { ok: true, round: round, top: topList_(round) };
  cache.put(key, JSON.stringify(out), 30);
  return out;
}

function topList_(round) {
  var sh = sheet_('Scores', SCORE_HEAD), vals = sh.getDataRange().getValues(), rows = [];
  for (var i = 1; i < vals.length; i++) {
    var v = vals[i];
    if (String(v[0]) !== String(round)) continue;
    rows.push({ name: String(v[2]), score: Number(v[3]) || 0, secs: v[4] === '' ? null : Number(v[4]), at: v[1] instanceof Date ? v[1].getTime() : 0 });
  }
  rows.sort(function (a, b) { return b.score - a.score || (a.secs == null ? 1e9 : a.secs) - (b.secs == null ? 1e9 : b.secs) || a.at - b.at; });
  return rows.slice(0, 10).map(function (r) { return { name: r.name, score: r.score, secs: r.secs }; });
}

// ---------------- helpers ----------------
function currentRound_() { return PropertiesService.getScriptProperties().getProperty('ROUND') || '2026-10'; }
function normCode_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function cleanName_(n) {
  n = String(n || '').replace(/[<>"\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  return n.length >= 2 && n.length <= 24 ? n : '';
}
function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function findCode_(round, code) {
  var want = normCode_(code); if (want.length < 6) return null;
  var sh = sheet_('Codes', CODE_HEAD), vals = sh.getDataRange().getValues();
  var head = vals[0];
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(round) && normCode_(vals[i][1]) === want) {
      return rowObj_(sh, head, i + 1, vals[i]);
    }
  }
  return null;
}
function rowObj_(sh, head, rowNum, values) {
  return {
    status: String(values[head.indexOf('Status')] || ''),
    get: function (col) { return values[head.indexOf(col)]; },
    set: function (obj) {
      for (var k in obj) {
        var c = head.indexOf(k);
        if (c >= 0) { sh.getRange(rowNum, c + 1).setValue(obj[k]); values[c] = obj[k]; }
      }
    }
  };
}
function newCode_(existing) {
  for (var tries = 0; tries < 1000; tries++) {
    var s = '';
    for (var i = 0; i < 8; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    if (!existing[s]) { existing[s] = true; return s.slice(0, 4) + '-' + s.slice(4); }
  }
  throw new Error('Could not generate a unique code');
}
function existingCodes_() {
  var vals = sheet_('Codes', CODE_HEAD).getDataRange().getValues(), set = {};
  for (var i = 1; i < vals.length; i++) set[normCode_(vals[i][1])] = true;
  return set;
}

// ---------------- admin menu (in the Google Sheet) ----------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Oakwick Games')
    .addItem('Set up sheets', 'setupSheets')
    .addSeparator()
    .addItem('Create codes for names in the Codes sheet', 'fillCodesForNames')
    .addItem('Create a batch of blank codes…', 'generateBlankCodes')
    .addItem('Reset a code (let someone start again)…', 'resetCode')
    .addSeparator()
    .addItem('Show current round & Top 3', 'showWinner')
    .addItem('Start a new round…', 'startNewRound')
    .addToUi();
}
function setupSheets() {
  sheet_('Codes', CODE_HEAD); sheet_('Scores', SCORE_HEAD);
  if (!PropertiesService.getScriptProperties().getProperty('ROUND')) PropertiesService.getScriptProperties().setProperty('ROUND', '2026-10');
  SpreadsheetApp.getUi().alert('Sheets ready. Current round: ' + currentRound_() + '\n\nNext: type employee names in column C ("Issued to") of the Codes sheet, then use Oakwick Games > Create codes for names.');
}
function fillCodesForNames() {
  var sh = sheet_('Codes', CODE_HEAD), vals = sh.getDataRange().getValues(), ex = existingCodes_(), n = 0, round = currentRound_();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][2]).trim() && !String(vals[i][1]).trim()) {
      sh.getRange(i + 1, 1, 1, 4).setValues([[round, newCode_(ex), vals[i][2], 'Unused']]); n++;
    }
  }
  SpreadsheetApp.getUi().alert(n + ' code(s) created for round ' + round + '. Send each person their own code.');
}
function generateBlankCodes() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('How many codes?', 'Codes are for round ' + currentRound_() + '.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var count = Math.min(500, Math.max(1, parseInt(r.getResponseText(), 10) || 0)), ex = existingCodes_(), rows = [];
  for (var i = 0; i < count; i++) rows.push([currentRound_(), newCode_(ex), '', 'Unused', '', '', '', '']);
  var sh = sheet_('Codes', CODE_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, CODE_HEAD.length).setValues(rows);
  ui.alert(count + ' codes added. Fill in "Issued to" as you hand them out.');
}
function resetCode() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('Reset a code', 'Enter the code to reset. Only do this if the person could not finish (e.g. their phone died). A submitted score is not removed.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var row = findCode_(currentRound_(), r.getResponseText());
  if (!row) { ui.alert('Code not found in the current round.'); return; }
  if (row.status === 'Submitted') { ui.alert('That code has already submitted a score, so it can\'t be reset.'); return; }
  row.set({ Status: 'Unused', Started: '', 'Name used': '', Token: '' });
  ui.alert('Code reset. They can start again.');
}
function showWinner() {
  var top = topList_(currentRound_()), msg = 'Round ' + currentRound_() + '\n\n';
  msg += top.length ? top.slice(0, 3).map(function (t, i) { return (i + 1) + '. ' + t.name + ': ' + t.score + (t.secs != null ? ' (' + Math.floor(t.secs / 60) + 'm ' + (t.secs % 60) + 's)' : ''); }).join('\n') : 'No scores yet.';
  msg += '\n\nCheck the Scores sheet (Code / Issued to columns) to confirm who the winner is before awarding the prize.';
  SpreadsheetApp.getUi().alert(msg);
}
function startNewRound() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('Start a new round', 'Enter the new round ID, e.g. 2026-11. It must match "round" in the new game\'s config.js. Old scores stay in the sheet.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var id = r.getResponseText().trim();
  if (!/^[0-9A-Za-z-]{4,20}$/.test(id)) { ui.alert('That doesn\'t look like a round ID.'); return; }
  PropertiesService.getScriptProperties().setProperty('ROUND', id);
  ui.alert('Current round is now ' + id + '. Create new codes for it.');
}

// Runs backend/Code.gs in a mocked Apps Script environment: personal keys, one attempt,
// server-side save/resume, re-scoring, round close, results emails and the winner page.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../backend/Code.gs', 'utf8');
function mkSheet() {
  const data = [];
  return {
    data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues: (v) => { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; } return { setFontWeight: () => {} }; },
      setValue: (v) => { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; },
      setFontWeight: () => {}
    }),
    appendRow: (row) => data.push(row.slice()),
    deleteRow: (r) => data.splice(r - 1, 1),
    setFrozenRows: () => {},
    getLastRow: () => data.length
  };
}
const sheets = {}, cache = {}, mail = [], alerts = [];
let quota = 100;
const ctx = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = mkSheet()) }),
    getUi: () => ({ alert: (m) => { alerts.push(String(m)); return 'YES'; }, Button: { YES: 'YES', OK: 'OK' }, ButtonSet: {} })
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
  MailApp: { getRemainingDailyQuota: () => quota, sendEmail: (o) => { quota--; mail.push(o); } },
  Session: { getScriptTimeZone: () => 'Europe/London' },
  Utilities: { formatDate: (d) => d.toISOString() },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create() {} }) }) }) },
  Math, JSON, Date, console
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ round: '2026-10', version: ctx.LineClear.VERSION }, b)) } }).t);
const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).t);

// --- admin setup ---
ctx.setupSheets();
const R = sheets.Rounds; R.data[1][2] = 'https://example.github.io/oakwick-games/games/2026-10-line-clear/';
R.data[1][3] = new Date(Date.now() + 86400000); // closes tomorrow
const P = sheets.Players;
P.appendRow(['Alice Smith', 'Alice@Example.com']); P.appendRow(['Bob Jones', 'bob@example.com']);
P.appendRow(['Cara Lee', 'cara@example.com']); P.appendRow(['Dan Out', 'dan@example.com', '', 'N']);
ctx.createKeys();
const key = (i) => P.data[i][2];
const [kA, kB, kC, kD] = [key(1), key(2), key(3), key(4)];
assert.ok(kA.length === 16 && kA !== kB);

ctx.sendInvitations();
assert.equal(mail.length, 3, 'inactive player not invited');
assert.ok(mail[0].htmlBody.includes('?k=' + kA), 'invite contains personal link');
ctx.sendInvitations(); assert.equal(mail.length, 3, 'no duplicate invitations');

// --- player flows ---
const solve = require('./solver.js'), C0 = ctx.LineClear.SCENE.conductors;
const good = solve(0, (x, y, r) => x + r > C0[0].x - 4.6).concat(solve(1, (x, y, r) => Math.min(...C0.map(c => Math.hypot(x - c.x, y - c.y))) - r < 3.1));
let r = post({ action: 'whoami', key: 'NOTAREALKEY12345' }); assert.equal(r.error, 'key');
r = post({ action: 'whoami', key: kD }); assert.equal(r.error, 'key', 'inactive player rejected');
r = post({ action: 'whoami', key: kA.toLowerCase() }); assert.ok(r.ok && r.name === 'Alice Smith' && r.status === 'new' && r.open);
r = post({ action: 'start', key: kA }); assert.ok(r.ok && !r.resumed);
r = post({ action: 'save', key: kA, cuts: good.slice(0, 5) }); assert.ok(r.ok);
r = post({ action: 'start', key: kA }); assert.ok(r.ok && r.resumed && r.cuts.length === 5, 'resume on another device restores cuts');
r = post({ action: 'whoami', key: kA }); assert.equal(r.status, 'started');
r = post({ action: 'submit', key: kA, cuts: good, score: 1000 });
assert.ok(r.ok); assert.equal(r.score, require('./load.js').scoreAll(good).total, 'server re-scores from cuts');
r = post({ action: 'start', key: kA }); assert.equal(r.error, 'used');
r = post({ action: 'save', key: kA, cuts: [] }); assert.equal(r.error, 'used');
r = post({ action: 'submit', key: kA, cuts: good }); assert.equal(r.error, 'used');
r = post({ action: 'whoami', key: kA }); assert.ok(r.status === 'submitted' && r.cuts.length > 0);
r = post({ action: 'submit', key: kB, cuts: good }); assert.equal(r.error, 'not_started', 'must start first');
post({ action: 'start', key: kB }); r = post({ action: 'submit', key: kB, cuts: good.slice(0, 3) }); assert.ok(r.ok && r.score < 900);
post({ action: 'start', key: kC }); // Cara starts but never submits
r = get({ action: 'winner', round: '2026-10' }); assert.equal(r.error, 'not_closed', 'winner hidden while open');
r = get({ action: 'top', round: '2026-10' }); assert.equal(r.top[0].name, 'Alice Smith'); assert.ok(!JSON.stringify(r).includes('@'), 'no emails leak');

// --- reminders go only to people who haven't submitted ---
mail.length = 0; ctx.sendReminders(); assert.deepEqual(mail.map(m => m.to).sort(), ['cara@example.com']);

// --- automatic close ---
mail.length = 0; ctx.autoCloseRounds(); assert.equal(mail.length, 0, 'not closed before closing time');
R.data[1][3] = new Date(Date.now() - 1000);
r = post({ action: 'save', key: kC, cuts: [] }); assert.equal(r.error, 'closed', 'no saves after closing time');
quota = 1; ctx.autoCloseRounds();
assert.equal(R.data[1][4], 'Closed'); assert.equal(R.data[1][5], 'Alice Smith');
assert.equal(mail.length, 1, 'quota respected'); assert.ok(String(R.data[1][7]).startsWith('Partly'));
quota = 100; ctx.autoCloseRounds(); // next hour: finishes sending
assert.equal(mail.length, 2); assert.deepEqual(mail.map(m => m.to).sort(), ['alice@example.com', 'bob@example.com'], 'only players who submitted');
assert.ok(mail.find(m => m.to === 'alice@example.com').subject.includes('you won'));
const bobMail = mail.find(m => m.to === 'bob@example.com');
assert.ok(bobMail.subject.includes('Alice Smith wins') && bobMail.htmlBody.includes('view=winner&round=2026-10') && bobMail.htmlBody.includes('2nd'));
ctx.autoCloseRounds(); assert.equal(mail.length, 2, 'results not re-sent');
r = get({ action: 'winner', round: '2026-10' });
assert.ok(r.ok && r.name === 'Alice Smith' && r.cuts.length === good.length && r.top.length === 2 && !JSON.stringify(r).includes('@'));
r = get({ action: 'status', round: '2026-10' }); assert.ok(!r.open && r.winner === 'Alice Smith' && r.winnerScore === r.winnerScore);
r = post({ action: 'start', key: kC }); assert.equal(r.error, 'closed');
console.log('Emails:', mail.map(m => m.to + ' | ' + m.subject).join('\n        '));
console.log('ALL BACKEND TESTS PASSED');

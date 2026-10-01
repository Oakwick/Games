// Runs backend/Code.gs in a mocked Apps Script environment and exercises the one-attempt rules.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../backend/Code.gs', 'utf8');
function mkSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues: (v) => { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; } return { setFontWeight: () => {} }; },
      setValue: (v) => { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; },
      setFontWeight: () => {}
    }),
    appendRow: (row) => data.push(row.slice()),
    setFrozenRows: () => {},
    getLastRow: () => data.length
  };
  return sh;
}
const sheets = {};
const props = {};
const cache = {};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = mkSheet(n)) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => 'tok-' + Math.random().toString(36).slice(2) },
  Math, JSON, Date, console
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);
const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).t);

// seed codes
const codes = ctx.sheet_('Codes', ctx.CODE_HEAD);
const ex = {};
codes.appendRow(['2026-10', ctx.newCode_(ex), 'Alice Smith', 'Unused']);
codes.appendRow(['2026-10', ctx.newCode_(ex), 'Bob Jones', 'Unused']);
codes.appendRow(['2026-09', 'OLDX-CODE', 'Carol', 'Unused']);
const [cA, cB] = [codes.data[1][1], codes.data[2][1]];
const V = ctx.LineClear.VERSION;
const solve = require('./solver.js'), C0 = ctx.LineClear.SCENE.conductors;
const cuts = solve(0, (x, y, r) => x + r > C0[0].x - 4.6).concat(solve(1, (x, y, r) => Math.min(...C0.map(c => Math.hypot(x - c.x, y - c.y))) - r < 3.1));

let r = post({ action: 'start', round: '2026-10', version: V, code: 'NOPE-NOPE', name: 'Alice' }); assert.equal(r.error, 'invalid');
r = post({ action: 'start', round: '2026-10', version: V, code: 'OLDX-CODE', name: 'Carol' }); assert.equal(r.error, 'invalid');
r = post({ action: 'start', round: '2026-09', version: V, code: cA, name: 'Alice' }); assert.equal(r.error, 'closed');
r = post({ action: 'start', round: '2026-10', version: 'old', code: cA, name: 'Alice' }); assert.equal(r.error, 'version');
r = post({ action: 'start', round: '2026-10', version: V, code: cA, name: 'A' }); assert.equal(r.error, 'name');
r = post({ action: 'start', round: '2026-10', version: V, code: cA.toLowerCase().replace('-', ' '), name: '  Alice   Smith ' }); assert.ok(r.ok, JSON.stringify(r));
const tokA = r.token;
r = post({ action: 'start', round: '2026-10', version: V, code: cA, name: 'Alice again' }); assert.equal(r.error, 'started');
r = post({ action: 'submit', round: '2026-10', code: cA, token: 'forged', cuts }); assert.equal(r.error, 'token');
r = post({ action: 'submit', round: '2026-10', code: cA, token: tokA, cuts, name: 'Hacker' }); assert.ok(r.ok, JSON.stringify(r));
const local = require('./load.js').scoreAll(cuts).total;
assert.equal(r.score, local, 'server score must match client engine');
assert.equal(r.top[0].name, 'Alice Smith');
r = post({ action: 'submit', round: '2026-10', code: cA, token: tokA, cuts }); assert.equal(r.error, 'used');
r = post({ action: 'start', round: '2026-10', version: V, code: cA, name: 'Alice' }); assert.equal(r.error, 'used');
// forged score fields are ignored — the server rescored from cuts
r = post({ action: 'start', round: '2026-10', version: V, code: cB, name: 'Bob Jones' });
r = post({ action: 'submit', round: '2026-10', code: cB, token: r.token, cuts: [{ t: 0, b: 999, s: 'x' }, { junk: 1 }], score: 1000 });
assert.ok(r.ok); assert.ok(r.score < 200, 'garbage cuts score low: ' + r.score);
const top = get({ action: 'top', round: '2026-10' });
assert.equal(top.top.length, 2); assert.equal(top.top[0].name, 'Alice Smith');
console.log('Codes sheet:'); codes.data.forEach(row => console.log('  ', row.slice(0, 7).map(v => v instanceof Date ? 'date' : v).join(' | ')));
console.log('Scores sheet:'); sheets.Scores.data.forEach(row => console.log('  ', row.slice(0, 8).map(v => v instanceof Date ? 'date' : v).join(' | ')));
console.log('Top:', JSON.stringify(top.top));
console.log('ALL BACKEND TESTS PASSED');

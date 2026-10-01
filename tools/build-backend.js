// Builds backend/Code.gs = game data + scoring engine + server, ready to paste into Apps Script.
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const out = [
  '// Oakwick Games scoreboard (Google Apps Script). Built by tools/build-backend.js on ' + new Date().toISOString().slice(0, 10) + '.',
  '// Paste this whole file into Code.gs in the Apps Script editor. Don\'t edit the game sections by hand.',
  '',
  '// ===== Line Clear (2026-10): tree data =====', R('games/2026-10-line-clear/trees-data.js'),
  '// ===== Line Clear (2026-10): scoring engine =====', R('games/2026-10-line-clear/engine.js'),
  '// ===== Server =====', R('backend/server.js')
].join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), out);
console.log('backend/Code.gs', out.length, 'bytes');

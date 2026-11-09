// Log simples em arquivo (userData/logs/app.log) com rotação, para investigar falhas em PCs de usuários.
const fs = require('fs');
const path = require('path');

const MAX = 1024 * 1024;
let file = null;

function init(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); file = path.join(dir, 'app.log'); } catch { file = null; }
}
function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  if (level === 'error') console.error(line.trim());
  if (!file) return;
  try {
    const st = fs.statSync(file);
    if (st.size > MAX) fs.renameSync(file, file + '.1');
  } catch { /* ainda não existe */ }
  try { fs.appendFileSync(file, line); } catch { /* disco cheio/sem permissão: ignora */ }
}
const logger = {
  info: (m) => log('info', m), warn: (m) => log('warn', m), error: (m) => log('error', m), debug: () => {},
};
module.exports = { init, log, logger, get file() { return file; } };

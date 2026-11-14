// Utilitários dos testes de caça-bugs. Não altera o código do app: carrega uma CÓPIA do
// optimizer.js com as funções internas expostas, numa pasta temporária dentro de bug-hunt/.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(__dirname, '.tmp');
fs.mkdirSync(TMP, { recursive: true });

function internals() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'optimizer.js'), 'utf8');
  const out = path.join(TMP, 'optimizer-internals.js');
  fs.writeFileSync(out, src + '\nmodule.exports.__i = { ps, q, run, walkDir, classify, parseJson, killProcesses, listProcesses };\n');
  delete require.cache[out];
  const m = require(out);
  m.init({ stateFile: path.join(TMP, 'state.json'), log: () => {} });
  return m.__i;
}

// Pasta de testes isolada e descartável
function sandbox(name) {
  const d = path.join(TMP, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const results = [];
async function test(id, title, fn) {
  try {
    await fn();
    results.push({ id, title, ok: true });
    console.log(`PASS  ${id}  ${title}`);
  } catch (e) {
    results.push({ id, title, ok: false, msg: e.message });
    console.log(`FAIL  ${id}  ${title}\n        -> ${e.message}`);
  }
}

module.exports = { ROOT, TMP, internals, sandbox, test, results };

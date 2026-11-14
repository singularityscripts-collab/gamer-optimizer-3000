// Testes adversários do núcleo. Cada teste afirma o comportamento CORRETO:
// FAIL = bug reproduzido. Rode com:  node bug-hunt/backend.test.js
// Nada aqui altera registro, serviços ou arquivos fora de bug-hunt/.tmp.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { internals, sandbox, test, results, ROOT, TMP } = require('./lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const I = internals();

  // B1 — aspas tipográficas furam o escape de q() e permitem injetar comandos no PowerShell (que roda como admin).
  await test('B1', 'q() neutraliza aspas tipográficas (’ ‘) no PowerShell', async () => {
    for (const payload of ['x’; Write-Output PWNED; ’', "x‘; Write-Output PWNED; ‘", "x'; Write-Output PWNED; '", 'x‚; Write-Output PWNED; ‛', "Nome normal (açaí) ’’ ''"]) {
      const r = await I.ps(`Write-Output '${I.q(payload)}'`);
      const lines = r.stdout.split(/\r?\n/).filter((l) => l !== '');
      if (lines.includes('PWNED')) throw new Error(`comando injetado executou com ${JSON.stringify(payload)}. Saída: ${JSON.stringify(lines)}`);
      if (lines.length !== 1 || lines[0] !== payload) throw new Error(`texto alterado: ${JSON.stringify(payload)} → ${JSON.stringify(lines)}`);
    }
  });

  // B2 — o script .ps1 é gravado em %TEMP% (gravável por qualquer processo do usuário) e executado depois:
  // outro programa pode trocar o conteúdo nesse intervalo e rodar código com os privilégios do app (admin).
  await test('B2', 'script temporário do PowerShell não pode ser adulterado antes de executar', async () => {
    const marker = path.join(TMP, 'b2-injected.txt');
    fs.rmSync(marker, { force: true });
    const watcher = fs.watch(os.tmpdir(), (ev, name) => {
      if (!name || !/^g3k-.*\.ps1$/.test(name)) return;
      try { fs.appendFileSync(path.join(os.tmpdir(), name), `\nSet-Content -Path '${marker}' -Value adulterado`); } catch { /* corrida */ }
    });
    let r;
    try { r = await I.ps('Write-Output ok'); } finally { watcher.close(); }
    if (fs.existsSync(marker)) throw new Error('código injetado por outro processo foi executado pelo app');
    if (r.stdout.trim() !== 'ok') throw new Error(`ps() deixou de funcionar: ${JSON.stringify(r.stdout)} ${r.stderr}`);
  });

  // B3 — limpeza seguindo junction: uma junction plantada em %TEMP% apontando para outra pasta
  // faria a limpeza (como admin) apagar arquivos de fora do %TEMP%.
  await test('B3', 'limpeza não segue junctions para fora da pasta limpa', async () => {
    const base = sandbox('b3');
    const fakeTemp = path.join(base, 'temp'), victim = path.join(base, 'documentos');
    fs.mkdirSync(fakeTemp); fs.mkdirSync(victim);
    const doc = path.join(victim, 'importante.txt');
    fs.writeFileSync(doc, 'não apague');
    const old = new Date('2020-01-01'); fs.utimesSync(doc, old, old);
    fs.symlinkSync(victim, path.join(fakeTemp, 'link'), 'junction');
    const scanned = await I.walkDir(fakeTemp, { minAge: 2 * 3600e3, dry: true });
    await I.walkDir(fakeTemp, { minAge: 2 * 3600e3, dry: false });
    if (!fs.existsSync(doc)) throw new Error('arquivo fora da pasta foi apagado através da junction');
    if (scanned > 0) throw new Error(`análise contou ${scanned} bytes de fora da pasta`);
  });

  // B4 — campo "Personalizado" vazio vira 0 → intervalo cai para 5 minutos sem o usuário pedir.
  await test('B4', 'intervalo vazio/inválido mantém o valor anterior', async () => {
    const settings = require(path.join(ROOT, 'src', 'settings.js'));
    const f = path.join(sandbox('b4'), 'settings.json');
    settings.init(f);
    settings.update({ auto: { intervalMin: 240 } });
    const a = settings.update({ auto: { intervalMin: '' } }).auto.intervalMin;
    const b = settings.update({ auto: { intervalMin: 240 } }) && settings.update({ auto: { intervalMin: 'abc' } }).auto.intervalMin;
    if (a !== 240 || b !== 240) throw new Error(`esperado 240, ficou '' → ${a} min e 'abc' → ${b} min`);
    // valores válidos continuam funcionando (e são limitados ao mínimo/máximo)
    const c = settings.update({ auto: { intervalMin: '90' } }).auto.intervalMin;
    const d = settings.update({ auto: { intervalMin: 2 } }).auto.intervalMin;
    const e = settings.update({ auto: { intervalMin: -10 } }).auto.intervalMin;
    if (c !== 90 || d !== 5 || e !== 5) throw new Error(`válidos: '90'→${c}, 2→${d} (esperado 5), -10→${e} (esperado manter 5)`);
  });

  // B5 — "Otimizar" (e a otimização automática) encerra à força apps da lista automática mesmo com janela aberta,
  // ex.: Teams no meio de uma reunião, sem perguntar.
  await test('B5', 'app com janela aberta não é encerrado automaticamente', async () => {
    // Cópia do Electron renomeada para Teams.exe: um app qualquer, com janela, fora do System32.
    const dir = path.join(TMP, 'b5-teams');
    const exe = path.join(dir, 'Teams.exe');
    fs.cpSync(path.join(ROOT, 'node_modules', 'electron', 'dist'), dir, { recursive: true, force: true });
    fs.renameSync(path.join(dir, 'electron.exe'), exe);
    const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
    child.unref();
    try {
      let g = null;
      for (let i = 0; i < 20 && !(g && g.title); i++) {
        await sleep(500);
        g = (await I.listProcesses()).find((p) => p.name.toLowerCase() === 'teams' && p.path.toLowerCase() === exe.toLowerCase());
      }
      if (!g) throw new Error('processo de teste não apareceu (inconclusivo)');
      if (!g.title) throw new Error('processo de teste sem janela (inconclusivo)');
      if (g.kind === 'auto') throw new Error(`"${g.name}" com a janela "${g.title}" foi classificado como 'auto' e seria fechado sem perguntar`);
    } finally {
      await new Promise((r) => execFile('taskkill', ['/F', '/T', '/PID', String(child.pid)], () => r()));
    }
  });

  // B6 — JSON do PowerShell vazio ou com lixo não pode derrubar as listagens.
  await test('B6', 'parseJson tolera saída vazia, BOM e lixo', async () => {
    const cases = ['', '   ', '﻿[]', 'AVISO: algo\n[]', '{"a":', 'null'];
    for (const c of cases) I.parseJson(c, []); // não pode lançar
  });

  // B7 — salvar estado em pasta sem permissão/inexistente não pode lançar exceção.
  await test('B7', 'falha ao gravar configurações não derruba o app', async () => {
    const settings = require(path.join(ROOT, 'src', 'settings.js'));
    settings.init(path.join(TMP, 'nao', 'existe', 'settings.json'));
    settings.update({ auto: { enabled: true } });
    if (!settings.get().auto.enabled) throw new Error('valor não ficou em memória');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passaram · ${failed.length} bug(s) reproduzido(s)`);
  process.exitCode = failed.length ? 1 : 0;
})();

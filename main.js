const { app, BrowserWindow, ipcMain, shell, Tray, Menu, Notification, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const opt = require('./src/optimizer');
const settings = require('./src/settings');
const L = require('./src/logger');

const OWNER = 'singularityscripts-collab';
const REPO = 'gamer-optimizer-3000';
const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
const TASK_NAME = 'GamerOptimizer3000';
// Na versão portátil o exe roda extraído numa pasta temporária; o caminho real vem desta variável.
const EXE = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_FILE;
const START_HIDDEN = process.argv.includes('--hidden');

let win = null, tray = null, quitting = false;
let updateState = { state: 'idle' };
let auto = { nextAt: null, lastAt: null, last: null, running: false, postponed: false };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);
app.on('second-instance', () => showWindow());

process.on('uncaughtException', (e) => L.log('error', 'uncaught: ' + (e.stack || e)));
process.on('unhandledRejection', (e) => L.log('error', 'unhandledRejection: ' + ((e && e.stack) || e)));

function fmt(b) {
  if (!b || b < 1) return '0 MB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b >= 100 || i < 2 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}
function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

/* ------------------------------ janela ------------------------------ */
function createWindow(show) {
  win = new BrowserWindow({
    width: 1080, height: 720, minWidth: 900, minHeight: 540,
    frame: false, backgroundColor: '#0c0c0e', show: false, title: 'Gamer Optimizer 3000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (show) win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Se a interface travar ou cair, recarrega em vez de deixar uma janela branca.
  win.webContents.on('render-process-gone', (_e, d) => {
    L.log('error', `renderer caiu: ${d.reason}`);
    if (!quitting && d.reason !== 'clean-exit') setTimeout(() => win && !win.isDestroyed() && win.reload(), 1000);
  });
  win.on('unresponsive', () => L.log('warn', 'janela sem resposta'));
  // Erros de JavaScript da interface também vão para o log.
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') L.log('renderer', `${e.level}: ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.on('close', (e) => {
    if (quitting || !settings.get().closeToTray) return;
    e.preventDefault(); win.hide();
    if (!auto.trayHintShown && Notification.isSupported()) {
      auto.trayHintShown = true;
      new Notification({ title: 'Gamer Optimizer continua ativo', body: 'Ele está na bandeja do sistema. Clique com o botão direito no ícone para sair.' }).show();
    }
  });
  win.on('closed', () => { win = null; });
}
function showWindow() {
  if (!win) createWindow(true);
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}
function quit() { quitting = true; app.quit(); }

/* ------------------------------ bandeja ------------------------------ */
function buildTrayMenu() {
  if (!tray) return;
  const s = settings.get();
  const next = s.auto.enabled && auto.nextAt ? `Próxima: ${new Date(auto.nextAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Automática desligada';
  tray.setToolTip(`Gamer Optimizer 3000 — ${next}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: showWindow },
    { label: auto.running ? 'Otimizando…' : 'Otimizar agora', enabled: !auto.running, click: () => runOptimize('tray') },
    { type: 'separator' },
    { label: 'Otimização automática', type: 'checkbox', checked: s.auto.enabled, click: (i) => applySettings({ auto: { enabled: i.checked } }) },
    { label: next, enabled: false },
    { type: 'separator' },
    { label: 'Sair', click: quit },
  ]));
}
function createTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.on('click', showWindow);
    buildTrayMenu();
  } catch (e) { L.log('error', 'tray: ' + e.message); }
}

/* ------------------------------ otimização (manual e automática) ------------------------------ */
async function runOptimize(source, steps) {
  if (opt.isOptimizing()) return opt.optimizeAll();
  auto.running = true; buildTrayMenu(); send('auto:status', autoStatus());
  try {
    const result = await opt.optimizeAll((p) => send('opt:progress', p), { source, steps });
    send('opt:done', result);
    return result;
  } catch (e) {
    L.log('error', 'otimização: ' + (e.stack || e));
    send('opt:done', { error: String(e.message || e), source });
    throw e;
  } finally { auto.running = false; buildTrayMenu(); send('auto:status', autoStatus()); }
}

function autoStatus() {
  const s = settings.get();
  return { enabled: s.auto.enabled, nextAt: s.auto.enabled ? auto.nextAt : null, lastAt: auto.lastAt, last: auto.last, running: auto.running, postponed: auto.postponed };
}
// A última execução fica salva: sem isso, cada reinício do PC empurrava a próxima otimização para frente
// e um intervalo longo (ex.: 24 h) nunca chegava a rodar.
let scheduleFile = null;
function loadSchedule() {
  try { const d = JSON.parse(require('fs').readFileSync(scheduleFile, 'utf8')); auto.lastAt = Number(d.lastAt) || null; auto.last = d.last || null; } catch { /* primeira vez */ }
}
function saveSchedule() {
  try { require('fs').writeFileSync(scheduleFile, JSON.stringify({ lastAt: auto.lastAt, last: auto.last })); } catch { /* ignora */ }
}
function reschedule() {
  const s = settings.get();
  if (!s.auto.enabled) auto.nextAt = null;
  else {
    const now = Date.now(), every = s.auto.intervalMin * 60000;
    // Se já passou do horário (PC estava desligado), roda 2 min depois de abrir, não na hora.
    // lastAt no futuro (relógio estava adiantado) travaria a automática até o relógio alcançar
    const last = auto.lastAt ? Math.min(auto.lastAt, now) : null;
    auto.nextAt = last ? Math.max(last + every, now + 2 * 60000) : now + every;
  }
  auto.postponed = false;
  buildTrayMenu(); send('auto:status', autoStatus());
}
// Verifica a cada 30 s em vez de um timer longo: sobrevive a suspensão/hibernação do PC.
let ticking = false;
async function tick() {
  const s = settings.get();
  if (ticking || !s.auto.enabled || !auto.nextAt || Date.now() < auto.nextAt || opt.isOptimizing()) return;
  ticking = true;
  try {
    if (s.auto.skipWhenBusy && await opt.isUserBusy()) {
      auto.nextAt = Date.now() + 5 * 60000; auto.postponed = true;
      L.log('info', 'otimização automática adiada: tela cheia/jogo em execução');
      buildTrayMenu(); send('auto:status', autoStatus());
      return;
    }
    const r = await runOptimize('auto', s.auto.steps);
    auto.lastAt = Date.now(); auto.last = { ramFreed: r.ramFreed, junk: r.junk, killed: r.killed }; saveSchedule();
    if (s.auto.notify && Notification.isSupported() && !(win && win.isVisible() && win.isFocused())) {
      new Notification({ title: 'Otimização automática concluída', body: `${fmt(r.ramFreed)} de RAM e ${fmt(r.junk)} de disco liberados · ${r.killed} processo(s) encerrado(s)`, silent: true }).show();
    }
  } catch { /* já registrado */ } finally {
    ticking = false;
    reschedule();
  }
}

/* ------------------------------ iniciar com o Windows ------------------------------ */
function runCmd(file, args) {
  return new Promise((res) => require('child_process').execFile(file, args, { windowsHide: true, timeout: 20000 }, (err, so, se) => res({ ok: !err, msg: String(se || (err && err.message) || '') })));
}
// O app pede elevação; o Windows não eleva itens da chave Run no logon, então como admin usamos uma tarefa agendada.
async function setLaunchAtLogin(on) {
  if (!app.isPackaged) return { ok: true };
  const admin = await opt.isAdmin();
  if (admin) {
    app.setLoginItemSettings({ openAtLogin: false });
    const r = on
      ? await runCmd('schtasks', ['/create', '/tn', TASK_NAME, '/tr', `"${EXE}" --hidden`, '/sc', 'onlogon', '/rl', 'highest', '/f'])
      : await runCmd('schtasks', ['/delete', '/tn', TASK_NAME, '/f']);
    if (!r.ok && on) return { ok: false, msg: 'Não foi possível criar a tarefa de inicialização.' };
    return { ok: true };
  }
  app.setLoginItemSettings({ openAtLogin: on, path: EXE, args: ['--hidden'] });
  return { ok: true };
}

async function applySettings(patch) {
  const before = settings.get();
  let msg = '';
  if (patch && 'launchAtLogin' in patch && !!patch.launchAtLogin !== before.launchAtLogin) {
    const r = await setLaunchAtLogin(!!patch.launchAtLogin);
    if (!r.ok) { msg = r.msg; patch = { ...patch, launchAtLogin: before.launchAtLogin }; }
  }
  const after = settings.update(patch);
  if (after.auto.enabled !== before.auto.enabled || after.auto.intervalMin !== before.auto.intervalMin) reschedule();
  buildTrayMenu();
  send('settings:changed', after);
  return { ok: !msg, msg, settings: after, auto: autoStatus() };
}

/* ------------------------------ auto update ------------------------------ */
function sendUpdate(s) { updateState = s; send('update:status', s); }
function setupUpdater() {
  autoUpdater.logger = L.logger;
  autoUpdater.setFeedURL({ provider: 'github', owner: OWNER, repo: REPO, releaseType: 'release' });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', version: updateState.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => {
    sendUpdate({ state: 'ready', version: i.version });
    if (tray && Notification.isSupported()) new Notification({ title: `Atualização ${i.version} pronta`, body: 'Será instalada ao fechar o app, ou abra a aba Atualização para instalar agora.' }).show();
  });
  autoUpdater.on('error', (e) => {
    L.log('warn', 'updater: ' + ((e && e.message) || e));
    sendUpdate({ state: 'error', message: 'Sem conexão com o GitHub ou nenhuma versão publicada ainda.' });
  });
}
let checking = false;
async function checkUpdates() {
  if (!app.isPackaged) return sendUpdate({ state: 'dev' });
  if (PORTABLE) return sendUpdate({ state: 'portable' });
  if (checking || ['downloading', 'ready'].includes(updateState.state)) return;
  checking = true;
  try { await autoUpdater.checkForUpdates(); } catch { /* evento 'error' já tratou */ } finally { checking = false; }
}

/* ------------------------------ IPC ------------------------------ */
// Todo handler devolve erro tratado em vez de rejeitar sem contexto.
function handle(ch, fn) {
  ipcMain.handle(ch, async (...a) => {
    try { return await fn(...a); } catch (e) { L.log('error', `${ch}: ${e.stack || e}`); throw new Error('Falha interna. Detalhes em logs/app.log.'); }
  });
}
const strArr = (v) => (Array.isArray(v) ? v.slice(0, 500).map(String) : []);
function registerIpc() {
  handle('win:min', () => win && win.minimize());
  handle('win:max', () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
  handle('win:close', () => win && win.close());

  handle('sys:stats', () => opt.getStats());
  handle('proc:list', () => opt.listProcesses());
  handle('proc:kill', (_e, names) => opt.killProcesses(strArr(names)));
  handle('mem:clean', () => opt.cleanMemory());
  handle('clean:scan', () => opt.scanJunk());
  handle('clean:run', (_e, ids) => opt.cleanJunk(Array.isArray(ids) ? strArr(ids) : null));
  handle('startup:list', () => opt.listStartup());
  handle('startup:set', (_e, loc, name, enable) => opt.setStartup(String(loc), String(name), !!enable));
  handle('tweaks:list', () => opt.listTweaks());
  handle('tweaks:set', (_e, id, on) => opt.applyTweak(String(id), !!on));
  handle('optimize:all', () => runOptimize('manual'));

  handle('settings:get', () => ({ settings: settings.get(), auto: autoStatus() }));
  handle('settings:set', (_e, patch) => applySettings(patch));

  handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, portable: PORTABLE, update: updateState, repo: REPO_URL }));
  handle('app:repo', () => shell.openExternal(REPO_URL));
  handle('app:logs', () => L.file && shell.showItemInFolder(L.file));
  handle('update:check', async () => { await checkUpdates(); return updateState; });
  handle('update:install', () => {
    if (updateState.state !== 'ready') return;
    quitting = true; // senão o "fechar para a bandeja" bloqueia a instalação
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
}

if (gotLock) app.whenReady().then(() => {
  const ud = app.getPath('userData');
  L.init(path.join(ud, 'logs'));
  L.log('info', `iniciando v${app.getVersion()} ${PORTABLE ? '(portátil)' : ''}`);
  settings.init(path.join(ud, 'settings.json'));
  opt.init({ stateFile: path.join(ud, 'state.json'), log: L.log });
  scheduleFile = path.join(ud, 'schedule.json'); loadSchedule();
  registerIpc();
  setupUpdater();
  createTray();
  createWindow(!START_HIDDEN);
  reschedule();
  setInterval(tick, 30000);
  powerMonitor.on('resume', () => {
    // Ao voltar da suspensão, espera o sistema estabilizar antes de uma otimização atrasada.
    if (auto.nextAt && auto.nextAt < Date.now() + 60000) auto.nextAt = Date.now() + 60000;
    setTimeout(checkUpdates, 30000);
  });
  setTimeout(checkUpdates, 5000);
  setInterval(checkUpdates, 4 * 60 * 60 * 1000);
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (quitting || !settings.get().closeToTray) app.quit(); });

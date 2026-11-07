const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const opt = require('./src/optimizer');

const REPO_URL = 'https://github.com/huginhohenriquerl-ops/gamer-optimizer-3000';
let win = null;
let updateState = { state: 'idle' };

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1120, height: 740, minWidth: 940, minHeight: 620,
    frame: false, backgroundColor: '#0b0d17', show: false, title: 'Gamer Optimizer 3000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

/* ------------------------------ auto update ------------------------------ */
function sendUpdate(s) {
  updateState = s;
  if (win && !win.isDestroyed()) win.webContents.send('update:status', s);
}
function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', version: updateState.version, percent: Math.round(p.percent), speed: p.bytesPerSecond }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => sendUpdate({ state: 'error', message: String((e && e.message) || e).slice(0, 200) }));
}
function checkUpdates() {
  if (!app.isPackaged) { sendUpdate({ state: 'dev' }); return; }
  autoUpdater.checkForUpdates().catch(() => {});
}

/* ------------------------------ IPC ------------------------------ */
function registerIpc() {
  ipcMain.handle('win:min', () => win && win.minimize());
  ipcMain.handle('win:max', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
  ipcMain.handle('win:close', () => win && win.close());

  ipcMain.handle('sys:stats', () => opt.getStats());
  ipcMain.handle('proc:list', () => opt.listProcesses());
  ipcMain.handle('proc:kill', (_e, names) => opt.killProcesses(Array.isArray(names) ? names.map(String) : []));
  ipcMain.handle('mem:clean', () => opt.cleanMemory());
  ipcMain.handle('clean:scan', () => opt.scanJunk());
  ipcMain.handle('clean:run', (_e, ids) => opt.cleanJunk(Array.isArray(ids) ? ids.map(String) : null));
  ipcMain.handle('startup:list', () => opt.listStartup());
  ipcMain.handle('startup:set', (_e, hive, name, enable) => opt.setStartup(String(hive), String(name), !!enable));
  ipcMain.handle('tweaks:list', () => opt.listTweaks());
  ipcMain.handle('tweaks:set', (_e, id, on) => opt.applyTweak(String(id), !!on));
  ipcMain.handle('optimize:all', (e) => opt.optimizeAll((p) => e.sender.send('opt:progress', p)));

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, update: updateState }));
  ipcMain.handle('app:repo', () => shell.openExternal(REPO_URL));
  ipcMain.handle('update:check', () => { checkUpdates(); return updateState; });
  ipcMain.handle('update:install', () => { if (updateState.state === 'ready') autoUpdater.quitAndInstall(false, true); });
}

app.whenReady().then(() => {
  opt.init({ stateFile: path.join(app.getPath('userData'), 'state.json') });
  registerIpc();
  setupUpdater();
  createWindow();
  setTimeout(checkUpdates, 4000);
  setInterval(checkUpdates, 4 * 60 * 60 * 1000);
});
app.on('window-all-closed', () => app.quit());

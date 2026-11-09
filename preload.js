const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch, cb) => {
  const fn = (_e, data) => { try { cb(data); } catch (err) { console.error(ch, err); } };
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('api', {
  win: { minimize: () => invoke('win:min'), maximize: () => invoke('win:max'), close: () => invoke('win:close') },
  stats: () => invoke('sys:stats'),
  processes: () => invoke('proc:list'),
  killProcesses: (names) => invoke('proc:kill', names),
  cleanMemory: () => invoke('mem:clean'),
  scanJunk: () => invoke('clean:scan'),
  cleanJunk: (ids) => invoke('clean:run', ids),
  startup: () => invoke('startup:list'),
  setStartup: (loc, name, enable) => invoke('startup:set', loc, name, enable),
  tweaks: () => invoke('tweaks:list'),
  setTweak: (id, on) => invoke('tweaks:set', id, on),
  optimizeAll: () => invoke('optimize:all'),
  onProgress: (cb) => on('opt:progress', cb),
  onDone: (cb) => on('opt:done', cb),
  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),
  onSettings: (cb) => on('settings:changed', cb),
  onAuto: (cb) => on('auto:status', cb),
  appInfo: () => invoke('app:info'),
  checkUpdate: () => invoke('update:check'),
  installUpdate: () => invoke('update:install'),
  onUpdate: (cb) => on('update:status', cb),
  openRepo: () => invoke('app:repo'),
  openLogs: () => invoke('app:logs'),
});

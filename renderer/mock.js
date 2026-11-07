// Só é usado ao abrir a página fora do Electron (pré-visualização no navegador).
if (!window.api) {
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const listeners = { p: [], u: [] };
  window.api = {
    win: { minimize() {}, maximize() {}, close() {} },
    stats: async () => ({ cpu: 12 + Math.round(Math.random() * 20), ramTotal: 16 * GB, ramUsed: 10.4 * GB, diskTotal: 512 * GB, diskUsed: 301 * GB, uptime: 93000, cpuName: 'AMD Ryzen 5 5600X', cores: 12, admin: false }),
    processes: async () => [
      { name: 'chrome', count: 14, mem: 2100 * MB, path: 'C:\\x', title: 'Google', kind: 'suggest' },
      { name: 'OneDrive', count: 1, mem: 180 * MB, path: 'C:\\x', title: '', kind: 'auto' },
      { name: 'Teams', count: 6, mem: 420 * MB, path: 'C:\\x', title: '', kind: 'auto' },
      { name: 'Discord', count: 5, mem: 390 * MB, path: 'C:\\x', title: '', kind: 'suggest' },
      { name: 'notepad', count: 1, mem: 30 * MB, path: 'C:\\x', title: 'sem título', kind: 'normal' },
      { name: 'explorer', count: 1, mem: 160 * MB, path: 'C:\\Windows\\explorer.exe', title: '', kind: 'protected' },
    ],
    killProcesses: async (n) => ({ killed: n.length, freed: 300 * MB, closed: n }),
    cleanMemory: async () => { await sleep(900); return { freed: 1.2 * GB, trimmed: 140, standbyPurged: false }; },
    scanJunk: async () => [
      { id: 'temp', name: 'Temporários do usuário', desc: 'Arquivos temporários de apps e instaladores (%TEMP%).', size: 820 * MB },
      { id: 'shader', name: 'Cache de shaders (DirectX/GPU)', desc: 'Recriado automaticamente pelos jogos.', size: 1.6 * GB },
      { id: 'chrome', name: 'Cache do Chrome', desc: 'Não apaga senhas nem histórico.', size: 540 * MB },
      { id: 'recycle', name: 'Lixeira', desc: 'Esvazia a Lixeira de todas as unidades.', size: 90 * MB },
    ],
    cleanJunk: async () => { await sleep(700); return { freed: 3 * GB }; },
    startup: async () => [
      { name: 'OneDrive', cmd: 'C:\\Program Files\\OneDrive\\OneDrive.exe /background', scope: 'Usuário', loc: 'hkcu', enabled: true },
      { name: 'Discord', cmd: 'C:\\Users\\x\\Discord\\Update.exe', scope: 'Usuário', loc: 'hkcu', enabled: true },
      { name: 'RtkAudUService', cmd: 'C:\\Windows\\System32\\RtkAudUService64.exe', scope: 'Sistema', loc: 'hklm', enabled: false },
    ],
    setStartup: async () => ({ ok: true }),
    tweaks: async () => [
      { id: 'power', name: 'Plano de energia: Desempenho máximo', desc: 'Ativa o plano de alto desempenho.', recommended: true, admin: false, applied: true },
      { id: 'gamemode', name: 'Modo de Jogo do Windows', desc: 'Prioriza CPU/GPU para o jogo.', recommended: true, admin: false, applied: false },
      { id: 'netprio', name: 'Prioridade de jogos e multimídia', desc: 'Desliga o limitador de rede.', recommended: true, admin: true, applied: false },
      { id: 'dns', name: 'Limpar cache DNS', desc: 'Renova o cache DNS.', recommended: true, admin: false, oneshot: true, applied: false },
      { id: 'visualfx', name: 'Efeitos visuais: melhor desempenho', desc: 'Desliga transparência e animações.', recommended: false, admin: false, applied: false },
    ],
    setTweak: async () => ({ ok: true }),
    optimizeAll: async () => {
      for (let i = 1; i <= 4; i++) { listeners.p.forEach((f) => f({ step: i, label: '', })); await sleep(700); listeners.p.forEach((f) => f({ step: i, done: true })); }
      return { killed: 9, closed: [], junk: 3.1 * GB, ramFreed: 1.4 * GB, tweaks: 8, skipped: 0, admin: true };
    },
    onProgress: (cb) => { listeners.p.push(cb); },
    appInfo: async () => ({ version: '1.0.0', packaged: false, update: { state: 'dev' } }),
    checkUpdate: async () => ({ state: 'dev' }),
    installUpdate: async () => {},
    onUpdate: (cb) => { listeners.u.push(cb); },
    openRepo: async () => {},
  };
}

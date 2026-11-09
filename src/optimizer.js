// Núcleo do otimizador: processos, RAM, limpeza, inicialização e ajustes do Windows.
const { execFile } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

let stateFile = null;
let state = null; // cache em mem\u00f3ria: evita que duas opera\u00e7\u00f5es simult\u00e2neas sobrescrevam o estado uma da outra
let log = () => {};
function init(opts) { stateFile = opts.stateFile; if (opts.log) log = opts.log; }
function loadState() {
  if (!state) { try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {}; } catch { state = {}; } }
  return state;
}
// Grava num arquivo tempor\u00e1rio e renomeia: uma queda no meio da escrita n\u00e3o corrompe o estado.
function saveState(s) {
  state = s;
  if (!stateFile) return;
  try { const tmp = stateFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, stateFile); }
  catch (e) { log('warn', 'saveState: ' + e.message); }
}

/* ------------------------------ helpers ------------------------------ */
function run(file, args, timeout = 120000) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout, encoding: 'utf8' },
        (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', err }));
    } catch (err) { resolve({ ok: false, stdout: '', stderr: String(err.message || err), err }); }
  });
}
async function ps(script, timeout = 120000) {
  const f = path.join(os.tmpdir(), `g3k-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  try { fs.writeFileSync(f, '\ufeff[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$ProgressPreference=\'SilentlyContinue\'\n' + script, 'utf8'); }
  catch (e) { log('error', 'ps write: ' + e.message); return { ok: false, stdout: '', stderr: e.message }; }
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f], timeout);
  fs.unlink(f, () => {});
  if (!r.ok) log('warn', `ps falhou: ${(r.stderr || (r.err && r.err.message) || '').slice(0, 300)}`);
  return r;
}
const q = (s) => String(s).replace(/'/g, "''");
function parseJson(text, fallback) {
  try { const t = String(text).trim().replace(/^\ufeff/, ''); return t ? JSON.parse(t) : fallback; } catch { return fallback; }
}

// "net session" dava falso negativo quando o servi\u00e7o Servidor (LanmanServer) est\u00e1 desativado \u2014 algo comum em PCs "otimizados".
let adminPromise = null;
function isAdmin() {
  if (!adminPromise) {
    adminPromise = ps('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)', 20000)
      .then((r) => /true/i.test(r.stdout));
  }
  return adminPromise;
}

// O usu\u00e1rio est\u00e1 jogando / em tela cheia / apresentando? (usado pela otimiza\u00e7\u00e3o autom\u00e1tica)
async function isUserBusy() {
  const r = await ps(`Add-Type -Namespace G3K -Name N -MemberDefinition '[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s);'
$s = 0; [void][G3K.N]::SHQueryUserNotificationState([ref]$s); Write-Output $s`, 20000);
  const s = Number(r.stdout.trim());
  return s === 2 || s === 3 || s === 4; // QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE
}

/* ------------------------------ estatísticas ------------------------------ */
let lastCpu = null;
function cpuSnapshot() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
  return { idle, total };
}
async function getStats() {
  const now = cpuSnapshot();
  let cpu = 0;
  if (lastCpu) {
    const dt = now.total - lastCpu.total, di = now.idle - lastCpu.idle;
    cpu = dt > 0 ? Math.round((1 - di / dt) * 100) : 0;
  }
  lastCpu = now;
  const total = os.totalmem(), free = os.freemem();
  let diskTotal = 0, diskFree = 0;
  try {
    const root = process.env.SystemDrive ? process.env.SystemDrive + '\\' : 'C:\\';
    const s = await fsp.statfs(root);
    diskTotal = s.blocks * s.bsize; diskFree = s.bavail * s.bsize;
  } catch { /* ignore */ }
  return {
    cpu, ramTotal: total, ramUsed: total - free,
    diskTotal, diskUsed: diskTotal - diskFree,
    uptime: os.uptime(), cpuName: (os.cpus()[0] || {}).model || 'CPU', cores: os.cpus().length,
    admin: await isAdmin(),
  };
}

/* ------------------------------ processos ------------------------------ */
// Fechados automaticamente por "Otimizar tudo" (lixo de segundo plano seguro).
const AUTO = new Set(['onedrive', 'onedrivestandalone', 'teams', 'ms-teams', 'msteams', 'skype', 'skypeapp', 'skypehost',
  'yourphone', 'phoneexperiencehost', 'widgets', 'widgetservice', 'cortana', 'googleupdate', 'microsoftedgeupdate',
  'jusched', 'adobearm', 'armsvc', 'acrotray', 'adobecollabsync', 'adobeipcbroker', 'ccxprocess', 'cclibrary',
  'adobenotificationclient', 'ituneshelper', 'ipodservice', 'gamebarpresencewriter', 'gamebarftserver',
  'hxoutlook', 'hxtsr', 'microsoft.photos', 'gamebar', 'dropboxupdate']);
// Sugeridos como dispensáveis, mas só fecham se você marcar.
const SUGGEST = new Set(['spotify', 'discord', 'steam', 'steamwebhelper', 'epicgameslauncher', 'epicwebhelper', 'battle.net',
  'origin', 'eadesktop', 'ealauncher', 'upc', 'ubisoftconnect', 'galaxyclient', 'whatsapp', 'telegram', 'slack', 'zoom',
  'dropbox', 'googledrivefs', 'icloudservices', 'applemobiledevicehelper', 'chrome', 'msedge', 'firefox', 'opera', 'brave']);
// Nunca encerrados.
const PROTECTED = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost',
  'dwm', 'explorer', 'fontdrvhost', 'sihost', 'taskhostw', 'ctfmon', 'runtimebroker', 'startmenuexperiencehost',
  'shellexperiencehost', 'textinputhost', 'securityhealthservice', 'securityhealthsystray', 'msmpeng', 'nissrv',
  'audiodg', 'spoolsv', 'wmiprvse', 'dllhost', 'conhost', 'searchhost', 'searchindexer', 'lsaiso', 'memcompression',
  'taskmgr', 'cmd', 'powershell', 'pwsh', 'windowsterminal', 'wt', 'code', 'cursor', 'claude', 'node', 'git', 'devenv',
  'nvdisplay.container', 'nvcontainer', 'amdrsserv', 'radeonsoftware', 'rtkauduservice64', 'igfxem', 'igfxhk']);
const SELF = path.basename(process.execPath, '.exe').toLowerCase();

function classify(name, p) {
  const n = name.toLowerCase();
  const win = (process.env.SystemRoot || 'C:\\Windows').toLowerCase();
  if (n === SELF || PROTECTED.has(n)) return 'protected';
  if (!p) return 'protected';
  if (p.toLowerCase().startsWith(win + '\\system32') || p.toLowerCase().startsWith(win + '\\syswow64')) return 'protected';
  if (AUTO.has(n)) return 'auto';
  if (SUGGEST.has(n)) return 'suggest';
  return 'normal';
}

async function listProcesses() {
  const r = await ps('$p = Get-Process | Select-Object Name,Id,WorkingSet64,Path,MainWindowTitle; ConvertTo-Json -InputObject @($p) -Compress', 60000);
  const arr = parseJson(r.stdout, []) || [];
  const groups = new Map();
  for (const p of arr) {
    const key = String(p.Name).toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { name: p.Name, count: 0, mem: 0, path: p.Path || '', title: '', pids: [] }; groups.set(key, g); }
    g.count++; g.mem += p.WorkingSet64 || 0; g.pids.push(p.Id);
    if (!g.path && p.Path) g.path = p.Path;
    if (!g.title && p.MainWindowTitle) g.title = p.MainWindowTitle;
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.pids.includes(process.pid)) { g.kind = 'protected'; } else g.kind = classify(g.name, g.path);
    out.push(g);
  }
  return out.sort((a, b) => b.mem - a.mem);
}

// Encerra pelos PIDs listados (não por nome + /T, que derrubaria árvores inteiras, ex.: um jogo aberto pela Steam).
async function killProcesses(names, list) {
  list = list || await listProcesses();
  const allowed = new Map(list.filter((p) => p.kind !== 'protected').map((p) => [p.name.toLowerCase(), p]));
  let killed = 0, freed = 0; const closed = [];
  for (const name of names) {
    const p = allowed.get(String(name).toLowerCase());
    if (!p) continue;
    const args = ['/F'];
    for (const pid of p.pids) args.push('/PID', String(pid));
    const r = await run('taskkill', args, 20000);
    // taskkill escreve cada sucesso em stdout e cada falha em stderr (texto localizado, então contamos linhas).
    const ok = r.stdout.split(/\r?\n/).filter((l) => l.trim()).length;
    if (ok) { killed += ok; freed += Math.round(p.mem * Math.min(1, ok / p.count)); closed.push(p.name); }
  }
  return { killed, freed, closed };
}

async function killAuto() {
  const list = await listProcesses();
  return killProcesses(list.filter((p) => p.kind === 'auto').map((p) => p.name), list);
}

/* ------------------------------ memória ------------------------------ */
const MEM_SCRIPT = `
$sig = @'
using System; using System.Runtime.InteropServices;
public class M {
  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);
  [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int c, IntPtr i, int l);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr p, int a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LookupPrivilegeValue(string s, string n, out long l);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr t, bool d, ref TP n, int l, IntPtr p, IntPtr r);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static int ForegroundPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return (int)p; }
  [StructLayout(LayoutKind.Sequential, Pack=1)] struct TP { public int Count; public long Luid; public int Attr; }
  public static int Purge() {
    IntPtr t; if (!OpenProcessToken(GetCurrentProcess(), 0x28, out t)) return -1;
    TP tp = new TP(); tp.Count = 1; tp.Attr = 2;
    if (!LookupPrivilegeValue(null, "SeProfileSingleProcessPrivilege", out tp.Luid)) return -2;
    AdjustTokenPrivileges(t, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
    IntPtr p = Marshal.AllocHGlobal(4); Marshal.WriteInt32(p, 4);
    int r = NtSetSystemInformation(80, p, 4); Marshal.FreeHGlobal(p); return r;
  }
}
'@
Add-Type -TypeDefinition $sig
$n = 0
# Não esvazia o processo em primeiro plano (ex.: o jogo aberto): forçaria page faults e engasgos.
$fg = [M]::ForegroundPid()
Get-Process | Where-Object { $_.Id -ne $fg -and $_.Id -ne $PID } | ForEach-Object { try { if ([M]::EmptyWorkingSet($_.Handle)) { $n++ } } catch {} }
$purge = [M]::Purge()
[GC]::Collect()
Write-Output "TRIMMED=$n"
Write-Output "PURGE=$purge"
`;
async function cleanMemory() {
  const before = os.freemem();
  const r = await ps(MEM_SCRIPT, 90000);
  await new Promise((res) => setTimeout(res, 600));
  const after = os.freemem();
  const trimmed = Number((/TRIMMED=(\d+)/.exec(r.stdout) || [])[1] || 0);
  const purge = Number((/PURGE=(-?\d+)/.exec(r.stdout) || [])[1] ?? -1);
  return { before, after, freed: Math.max(0, after - before), trimmed, standbyPurged: purge === 0 };
}

/* ------------------------------ limpeza ------------------------------ */
const H = 3600 * 1000;
function cleanTargets() {
  const local = process.env.LOCALAPPDATA || '';
  const win = process.env.SystemRoot || 'C:\\Windows';
  const pd = process.env.ProgramData || 'C:\\ProgramData';
  const browser = (base) => ['Cache', 'Code Cache', 'GPUCache'].map((d) => path.join(base, 'User Data', 'Default', d));
  return [
    { id: 'temp', name: 'Temporários do usuário', desc: 'Arquivos temporários de apps e instaladores (%TEMP%).', paths: [os.tmpdir()], minAge: 2 * H },
    { id: 'wintemp', name: 'Temporários do Windows', desc: 'C:\\Windows\\Temp (requer administrador).', paths: [path.join(win, 'Temp')], minAge: 2 * H },
    { id: 'prefetch', name: 'Prefetch', desc: 'Cache de pré-carregamento antigo do Windows.', paths: [path.join(win, 'Prefetch')], minAge: 24 * H },
    { id: 'wupdate', name: 'Cache do Windows Update', desc: 'Pacotes de atualização já baixados.', paths: [path.join(win, 'SoftwareDistribution', 'Download')], minAge: 24 * H },
    { id: 'thumbs', name: 'Cache de miniaturas', desc: 'Miniaturas de imagens/vídeos (recriadas sob demanda).', paths: [path.join(local, 'Microsoft', 'Windows', 'Explorer')], match: /^(thumbcache|iconcache).*\.db$/i, minAge: 0 },
    { id: 'crash', name: 'Relatórios de erro e dumps', desc: 'CrashDumps e Relatórios de Erro do Windows.', paths: [path.join(local, 'CrashDumps'), path.join(pd, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), path.join(pd, 'Microsoft', 'Windows', 'WER', 'ReportQueue')], minAge: 0 },
    { id: 'shader', name: 'Cache de shaders (DirectX/GPU)', desc: 'Recriado automaticamente pelos jogos.', paths: [path.join(local, 'D3DSCache'), path.join(local, 'NVIDIA', 'DXCache'), path.join(local, 'NVIDIA', 'GLCache'), path.join(local, 'AMD', 'DxCache')], minAge: 0 },
    { id: 'chrome', name: 'Cache do Chrome', desc: 'Não apaga senhas nem histórico.', paths: browser(path.join(local, 'Google', 'Chrome')), minAge: 0 },
    { id: 'edge', name: 'Cache do Edge', desc: 'Não apaga senhas nem histórico.', paths: browser(path.join(local, 'Microsoft', 'Edge')), minAge: 0 },
    { id: 'firefox', name: 'Cache do Firefox', desc: 'Cache de páginas (cache2).', paths: firefoxCaches(local), minAge: 0 },
    { id: 'recycle', name: 'Lixeira', desc: 'Esvazia a Lixeira de todas as unidades.', special: 'recycle' },
  ];
}
function firefoxCaches(local) {
  const base = path.join(local, 'Mozilla', 'Firefox', 'Profiles');
  try { return fs.readdirSync(base).map((d) => path.join(base, d, 'cache2')); } catch { return []; }
}
async function walkDir(dir, { minAge, match, dry }, depth = 0) {
  let bytes = 0, ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (match && depth === 0) continue;
      bytes += await walkDir(p, { minAge, match, dry }, depth + 1);
      // Só remove pastas vazias antigas: pastas recém-criadas podem estar sendo usadas por um instalador.
      if (!dry) {
        try { const st = await fsp.lstat(p); if (!minAge || Date.now() - st.mtimeMs >= minAge) await fsp.rmdir(p); } catch { /* não vazia */ }
      }
    } else {
      if (match && !match.test(e.name)) continue;
      try {
        const st = await fsp.lstat(p);
        if (minAge && Date.now() - st.mtimeMs < minAge) continue;
        if (!dry) await fsp.unlink(p);
        bytes += st.size;
      } catch { /* em uso ou sem permissão */ }
    }
  }
  return bytes;
}
async function recycleSize() {
  const r = await ps("$s=0; (New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $s += $_.Size }; Write-Output $s", 30000);
  return Number(r.stdout.trim()) || 0;
}
async function scanJunk() {
  const out = [];
  for (const t of cleanTargets()) {
    let size = 0;
    if (t.special === 'recycle') size = await recycleSize();
    else for (const p of t.paths) size += await walkDir(p, { minAge: t.minAge, match: t.match, dry: true });
    out.push({ id: t.id, name: t.name, desc: t.desc, size });
  }
  return out;
}
async function cleanJunk(ids) {
  let freed = 0; const details = [];
  for (const t of cleanTargets()) {
    if (ids && !ids.includes(t.id)) continue;
    let size = 0;
    if (t.special === 'recycle') {
      size = await recycleSize();
      await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', 60000);
    } else for (const p of t.paths) size += await walkDir(p, { minAge: t.minAge, match: t.match, dry: false });
    freed += size; details.push({ id: t.id, size });
  }
  return { freed, details };
}

/* ------------------------------ inicialização ------------------------------ */
// Mesma técnica do Gerenciador de Tarefas: o item continua lá, só fica marcado como desativado em StartupApproved.
const APPR = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
const STARTUP_LOCS = {
  hkcu: { kind: 'reg', src: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', appr: `HKCU:\\${APPR}\\Run`, scope: 'Usuário' },
  hklm: { kind: 'reg', src: 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', appr: `HKLM:\\${APPR}\\Run`, scope: 'Sistema', admin: true },
  hklm32: { kind: 'reg', src: 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', appr: `HKLM:\\${APPR}\\Run32`, scope: 'Sistema', admin: true },
  folder: { kind: 'dir', src: "[Environment]::GetFolderPath('Startup')", appr: `HKCU:\\${APPR}\\StartupFolder`, scope: 'Pasta' },
  common: { kind: 'dir', src: "[Environment]::GetFolderPath('CommonStartup')", appr: `HKLM:\\${APPR}\\StartupFolder`, scope: 'Pasta', admin: true },
};
async function listStartup() {
  const blocks = Object.entries(STARTUP_LOCS).map(([id, l]) => {
    const read = l.kind === 'reg'
      ? `if (Test-Path '${l.src}') { $k = Get-Item '${l.src}'; foreach ($n in $k.GetValueNames()) { if ($n) { $items += ,@($n, [string]$k.GetValue($n)) } } }`
      : `$d = ${l.src}; if ($d -and (Test-Path $d)) { Get-ChildItem $d -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { $items += ,@($_.Name, $_.FullName) } }`;
    return `$items = @(); ${read}
$ap = $null; try { $ap = Get-ItemProperty '${l.appr}' -ErrorAction Stop } catch {}
foreach ($it in $items) { $en = $true; if ($ap) { $b = $ap.($it[0]); if ($b -and ($b[0] -band 1)) { $en = $false } }
  $out += [pscustomobject]@{ loc = '${id}'; name = $it[0]; cmd = $it[1]; scope = '${l.scope}'; enabled = $en } }`;
  });
  const r = await ps(`$out = @()\n${blocks.join('\n')}\nConvertTo-Json -InputObject @($out) -Compress`, 30000);
  return parseJson(r.stdout, []) || [];
}
async function setStartup(loc, name, enable) {
  const l = STARTUP_LOCS[loc];
  if (!l) return { ok: false, msg: 'Local inválido' };
  if (l.admin && !(await isAdmin())) return { ok: false, msg: 'Requer administrador para alterar itens do sistema.' };
  const bytes = enable ? '2,0,0,0,0,0,0,0,0,0,0,0' : '3,0,0,0,0,0,0,0,0,0,0,0';
  const r = await ps(`$a = '${l.appr}'
if (-not (Test-Path $a)) { New-Item $a -Force | Out-Null }
Set-ItemProperty -Path $a -Name '${q(name)}' -Value ([byte[]](${bytes})) -Type Binary -ErrorAction Stop`, 20000);
  return { ok: r.ok, msg: r.ok ? '' : r.stderr.trim() || 'Falhou' };
}

/* ------------------------------ ajustes ------------------------------ */
const DW = 'REG_DWORD', SZ = 'REG_SZ';
const SVC_LIST = ['SysMain', 'DiagTrack', 'WSearch', 'MapsBroker', 'WerSvc', 'RetailDemo', 'Fax', 'lfsvc'];
const TWEAKS = [
  { id: 'power', name: 'Plano de energia: Desempenho máximo', desc: 'Ativa o plano “Desempenho Máximo/Alto Desempenho” do Windows.', recommended: true, custom: true },
  { id: 'gamemode', name: 'Modo de Jogo do Windows', desc: 'Prioriza CPU/GPU para o jogo em primeiro plano.', recommended: true,
    reg: [['HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', DW, '1', '0'], ['HKCU\\Software\\Microsoft\\GameBar', 'AllowAutoGameMode', DW, '1', '1']] },
  { id: 'dvr', name: 'Desativar Game DVR / gravação em segundo plano', desc: 'Remove a sobrecarga de captura automática da Xbox Game Bar.', recommended: true,
    reg: [['HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', DW, '0', '1'], ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', DW, '0', '1']] },
  { id: 'mouse', name: 'Desativar aceleração do mouse', desc: 'Mira 1:1 (precisão aprimorada desligada). Vale após reiniciar a sessão.', recommended: true,
    reg: [['HKCU\\Control Panel\\Mouse', 'MouseSpeed', SZ, '0', '1'], ['HKCU\\Control Panel\\Mouse', 'MouseThreshold1', SZ, '0', '6'], ['HKCU\\Control Panel\\Mouse', 'MouseThreshold2', SZ, '0', '10']] },
  { id: 'bgapps', name: 'Bloquear apps em segundo plano', desc: 'Impede apps da Microsoft Store de rodarem escondidos.', recommended: true,
    reg: [['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', DW, '1', '0']] },
  { id: 'tips', name: 'Desativar sugestões e anúncios do Windows', desc: 'Menos apps promovidos e processamento de “dicas”.', recommended: true,
    reg: [['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SilentInstalledAppsEnabled', DW, '0', '1'], ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SystemPaneSuggestionsEnabled', DW, '0', '1'], ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SoftLandingEnabled', DW, '0', '1']] },
  { id: 'netprio', name: 'Prioridade de jogos e multimídia', desc: 'Desliga o limitador de rede e prioriza tarefas de jogo (administrador).', recommended: true, admin: true,
    reg: [['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'NetworkThrottlingIndex', DW, '4294967295', '10'],
      ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'SystemResponsiveness', DW, '0', '20'],
      ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'GPU Priority', DW, '8', '2'],
      ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Priority', DW, '6', '2'],
      ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Scheduling Category', SZ, 'High', 'Medium']] },
  { id: 'services', name: 'Pausar serviços desnecessários', desc: 'Para SysMain, telemetria (DiagTrack), indexação, mapas e relatórios de erro até reiniciar (administrador).', recommended: true, admin: true, custom: true },
  { id: 'dns', name: 'Limpar cache DNS', desc: 'Renova o cache de resolução de nomes.', recommended: true, oneshot: true, custom: true },
  { id: 'visualfx', name: 'Efeitos visuais: melhor desempenho', desc: 'Desliga transparência e animações do Windows (muda a aparência).', recommended: false,
    reg: [['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', DW, '2', '0'], ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', DW, '0', '1']] },
];

async function regAdd(key, name, type, data) {
  return run('reg', ['add', key, '/v', name, '/t', type, '/d', data, '/f'], 15000);
}
async function applyTweak(id, on) {
  const t = TWEAKS.find((x) => x.id === id);
  if (!t) return { ok: false, msg: 'Ajuste desconhecido' };
  if (t.admin && !(await isAdmin())) return { ok: false, msg: 'Requer executar como administrador.' };
  const state = loadState(); state.tweaks = state.tweaks || {};
  let ok = true, msg = '';

  if (t.reg) {
    for (const [key, name, type, onV, offV] of t.reg) {
      const r = await regAdd(key, name, type, on ? onV : offV);
      if (!r.ok) { ok = false; msg = r.stderr.trim(); }
    }
  } else if (id === 'power') {
    if (on) {
      const cur = await run('powercfg', ['/getactivescheme']);
      const m = /([0-9a-f-]{36})/i.exec(cur.stdout);
      if (m && !state.prevPower && m[1].toLowerCase() !== state.ultimatePower) state.prevPower = m[1];
      // Reaproveita o plano criado antes: duplicar a cada execução enchia o Windows de planos repetidos.
      const list = (await run('powercfg', ['/list'])).stdout.toLowerCase();
      let guid = state.ultimatePower && list.includes(state.ultimatePower) ? state.ultimatePower : null;
      if (!guid) {
        const dup = await run('powercfg', ['-duplicatescheme', 'e9a42b02-d5df-448d-aa00-03f14749eb61']);
        const g = /([0-9a-f-]{36})/i.exec(dup.stdout);
        if (g) guid = state.ultimatePower = g[1].toLowerCase();
      }
      guid = guid || '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
      let r = await run('powercfg', ['/setactive', guid]);
      if (!r.ok) r = await run('powercfg', ['/setactive', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c']);
      ok = r.ok; msg = r.stderr;
    } else {
      const r = await run('powercfg', ['/setactive', state.prevPower || '381b4222-f694-41f0-9685-ff5bb260df2e']);
      ok = r.ok; msg = r.stderr;
      if (ok) delete state.prevPower; // senão uma troca de plano feita depois seria desfeita para um plano antigo

    }
  } else if (id === 'services') {
    if (on) {
      const r = await ps(`$stopped = @(); foreach ($s in @(${SVC_LIST.map((s) => `'${s}'`).join(',')})) {
  $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') { try { Stop-Service -Name $s -Force -ErrorAction Stop; $stopped += $s } catch {} }
}
ConvertTo-Json -InputObject @($stopped) -Compress`, 60000);
      // Soma aos já pausados: rodar duas vezes não pode "esquecer" o que precisa ser religado.
      state.stoppedServices = [...new Set([...(state.stoppedServices || []), ...[].concat(parseJson(r.stdout, []) || [])])];
      state.servicesBoot = bootTime();
    } else {
      const names = state.stoppedServices || SVC_LIST;
      await ps(`foreach ($s in @(${names.map((s) => `'${q(s)}'`).join(',')})) { try { Start-Service -Name $s -ErrorAction Stop } catch {} }`, 60000);
      state.stoppedServices = [];
    }
  } else if (id === 'dns') {
    const r = await run('ipconfig', ['/flushdns']); ok = r.ok;
  }
  if (!t.oneshot) state.tweaks[id] = ok ? !!on : !!state.tweaks[id];
  saveState(state);
  return { ok, msg };
}
// Momento do boot (arredondado) para saber se uma pausa de serviços já foi desfeita por um reinício.
function bootTime() { return Math.round((Date.now() - os.uptime() * 1000) / 60000); }
function listTweaks() {
  const st = loadState(); const s = { ...(st.tweaks || {}) };
  if (s.services && Math.abs((st.servicesBoot || 0) - bootTime()) > 2) s.services = false;
  return TWEAKS.map((t) => ({ id: t.id, name: t.name, desc: t.desc, recommended: t.recommended, admin: !!t.admin, oneshot: !!t.oneshot, applied: !!s[t.id] }));
}

/* ------------------------------ otimizar tudo ------------------------------ */
const ALL_STEPS = { procs: true, tweaks: true, junk: true, memory: true };
let running = null;
// Uma execução por vez (manual e automática compartilham): quem chamar durante uma execução recebe o mesmo resultado.
function optimizeAll(progress, opts = {}) {
  if (!running) running = doOptimize(progress, opts).finally(() => { running = null; });
  return running;
}
function isOptimizing() { return !!running; }
async function doOptimize(progress, { steps = ALL_STEPS, source = 'manual' } = {}) {
  const emit = (step, extra = {}) => { try { progress && progress({ step, source, ...extra }); } catch { /* janela fechada */ } };
  const t0 = Date.now();
  const freeBefore = os.freemem();
  const admin = await isAdmin();
  const result = { killed: 0, closed: [], junk: 0, ramFreed: 0, tweaks: 0, skipped: 0, admin, errors: [], source };
  // Cada etapa é isolada: uma falha não interrompe as demais.
  const step = async (n, enabled, fn) => {
    if (!enabled) { emit(n, { done: true, skipped: true }); return; }
    emit(n);
    try { emit(n, { done: true, ...(await fn()) }); }
    catch (e) { log('error', `etapa ${n}: ${e.stack || e}`); result.errors.push(n); emit(n, { done: true, error: true }); }
  };

  await step(1, steps.procs, async () => {
    const k = await killAuto(); result.killed = k.killed; result.closed = k.closed; return { value: k.killed };
  });
  await step(2, steps.tweaks, async () => {
    for (const t of TWEAKS.filter((x) => x.recommended)) {
      if (t.admin && !admin) { result.skipped++; continue; }
      const r = await applyTweak(t.id, true);
      if (r.ok) result.tweaks++; else result.skipped++;
    }
    return { value: result.tweaks };
  });
  await step(3, steps.junk, async () => { const j = await cleanJunk(); result.junk = j.freed; return { bytes: j.freed }; });
  await step(4, steps.memory, async () => {
    const m = await cleanMemory();
    result.ramFreed = Math.max(m.freed, os.freemem() - freeBefore, 0); result.standbyPurged = m.standbyPurged;
    return { bytes: result.ramFreed };
  });
  result.ms = Date.now() - t0;
  log('info', `otimização (${source}) concluída: ${JSON.stringify({ ...result, closed: result.closed.length })}`);
  return result;
}

module.exports = { init, getStats, listProcesses, killProcesses, cleanMemory, scanJunk, cleanJunk, listStartup, setStartup,
  listTweaks, applyTweak, optimizeAll, isOptimizing, isAdmin, isUserBusy };

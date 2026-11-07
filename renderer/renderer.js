const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(b) {
  if (!b || b < 1) return '0 MB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b >= 100 || i < 2 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
}

/* ------------------------------ navegação ------------------------------ */
const ICONS = {
  dashboard: '<path d="M3 13a9 9 0 1 1 18 0"/><path d="M12 13l4-5"/><circle cx="12" cy="13" r="1.4"/>',
  processes: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  memory: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7V4M12 7V4M17 7V4M7 20v-3M12 20v-3M17 20v-3"/>',
  clean: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  startup: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  tweaks: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  update: '<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>',
};
const TABS = [['dashboard', 'Painel'], ['processes', 'Processos'], ['memory', 'Memória'], ['clean', 'Limpeza'], ['startup', 'Inicialização'], ['tweaks', 'Ajustes'], ['update', 'Atualização']];
const loaders = {};
function buildNav() {
  const nav = $('#nav');
  TABS.forEach(([id, label], i) => {
    if (id === 'update') nav.insertAdjacentHTML('beforeend', '<div class="nav-spacer"></div>');
    nav.insertAdjacentHTML('beforeend', `<button class="nav-item${i ? '' : ' active'}" data-tab="${id}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg><span>${label}</span></button>`);
  });
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item'); if (!b) return;
    const id = b.dataset.tab;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'v-' + id));
    if (loaders[id]) loaders[id]();
  });
}

/* ------------------------------ painel ------------------------------ */
function ring(el, pct, title, main, sub) {
  const r = 40, c = 2 * Math.PI * r;
  el.innerHTML = `<div class="ring"><svg viewBox="0 0 100 100"><defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
    <circle class="bg" cx="50" cy="50" r="${r}"/><circle class="fg" cx="50" cy="50" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(pct, 100) / 100)}"/></svg><div class="pct">${pct}%</div></div>
    <div class="g-meta"><h4>${title}</h4><div>${main}</div><small>${sub}</small></div>`;
}
function uptime(s) { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d ? d + 'd ' : ''}${h}h ${m}m`; }
async function refreshStats() {
  const s = await api.stats();
  const ramPct = Math.round((s.ramUsed / s.ramTotal) * 100), diskPct = s.diskTotal ? Math.round((s.diskUsed / s.diskTotal) * 100) : 0;
  ring($('#g-cpu'), s.cpu, 'CPU', `${s.cpu}% em uso`, `${s.cores} threads`);
  ring($('#g-ram'), ramPct, 'Memória RAM', `${fmt(s.ramUsed)} / ${fmt(s.ramTotal)}`, `${fmt(s.ramTotal - s.ramUsed)} livre`);
  ring($('#g-disk'), diskPct, 'Disco do sistema', `${fmt(s.diskUsed)} / ${fmt(s.diskTotal)}`, `${fmt(s.diskTotal - s.diskUsed)} livre`);
  $('#sysinfo').innerHTML = `<div>Processador<b>${esc(s.cpuName.trim())}</b></div><div>Tempo ligado<b>${uptime(s.uptime)}</b></div><div>Permissão<b>${s.admin ? 'Administrador' : 'Usuário padrão'}</b></div>`;
  $('#adminNote').textContent = s.admin ? '' : 'Dica: execute como administrador para limpeza total e ajustes avançados.';
  if ($('#v-memory').classList.contains('active')) {
    ring($('#g-ram2'), ramPct, '', '', ''); $('#g-ram2').classList.add('big');
    $('#g-ram2 .g-meta').remove();
    $('#mUsed').textContent = fmt(s.ramUsed); $('#mFree').textContent = fmt(s.ramTotal - s.ramUsed); $('#mTotal').textContent = fmt(s.ramTotal);
  }
}
let optimizing = false;
async function optimizeAll() {
  if (optimizing) return; optimizing = true;
  const btn = $('#optAll'); btn.disabled = true; btn.classList.add('running'); $('#optAllLabel').textContent = 'OTIMIZANDO…';
  $('#result').hidden = true;
  document.querySelectorAll('.step').forEach((s) => { s.className = 'step'; $('b', s).textContent = ''; });
  try {
    const res = await api.optimizeAll();
    $('#kpis').innerHTML = `
      <div class="kpi"><b>${res.killed}</b><span>processos encerrados</span></div>
      <div class="kpi"><b>${fmt(res.ramFreed)}</b><span>RAM liberada</span></div>
      <div class="kpi"><b>${fmt(res.junk)}</b><span>espaço em disco liberado</span></div>
      <div class="kpi"><b>${res.tweaks}</b><span>ajustes aplicados${res.tweakErrors ? ` (${res.tweakErrors} sem permissão)` : ''}</span></div>`;
    $('#result').hidden = false;
    toast('Otimização concluída!', 'ok');
  } catch (e) { toast('Falha na otimização: ' + e.message, 'err'); }
  btn.disabled = false; btn.classList.remove('running'); $('#optAllLabel').textContent = 'OTIMIZAR TUDO'; optimizing = false;
  refreshStats();
}
api.onProgress((p) => {
  const el = document.querySelector(`.step[data-s="${p.step}"]`); if (!el) return;
  if (p.done) { el.className = 'step done'; $('b', el).textContent = p.bytes ? fmt(p.bytes) : ''; }
  else { document.querySelectorAll('.step.active').forEach((s) => s.classList.remove('active')); el.className = 'step active'; }
});

/* ------------------------------ processos ------------------------------ */
let procs = [];
const KIND = { auto: 'Dispensável', suggest: 'Sugerido', protected: 'Protegido', normal: '' };
async function loadProcesses() {
  $('#procTable').innerHTML = '<div class="empty"><span class="spinner"></span>Lendo processos…</div>';
  procs = await api.processes(); renderProcs();
}
function renderProcs() {
  const rows = procs.map((p, i) => `<label class="row proc-row"><input type="checkbox" data-i="${i}" ${p.kind === 'protected' ? 'disabled' : ''} ${p.kind === 'auto' ? 'checked' : ''}>
    <div class="t"><b>${esc(p.name)}${p.count > 1 ? ` <span style="color:var(--muted);font-weight:400">×${p.count}</span>` : ''}</b><small>${esc(p.title || p.path || '')}</small></div>
    <span class="badge ${p.kind}">${KIND[p.kind] || 'Normal'}</span><span class="size">${fmt(p.mem)}</span><span></span></label>`).join('');
  $('#procTable').innerHTML = `<div class="row proc-row proc-head"><span></span><span>Nome</span><span>Tipo</span><span style="text-align:right">Memória</span><span></span></div>${rows}`;
}
async function killSelected() {
  const names = [...document.querySelectorAll('#procTable input:checked')].map((c) => procs[c.dataset.i].name);
  if (!names.length) return toast('Selecione ao menos um processo.');
  const r = await api.killProcesses(names);
  toast(`${r.killed} processo(s) encerrado(s) — ${fmt(r.freed)} liberados.`, 'ok'); loadProcesses();
}
loaders.processes = loadProcesses;

/* ------------------------------ memória ------------------------------ */
loaders.memory = refreshStats;
async function cleanMem() {
  const b = $('#memClean'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>Limpando…'; $('#memNote').textContent = '';
  const r = await api.cleanMemory();
  $('#memNote').textContent = `${fmt(r.freed)} de RAM liberados • ${r.trimmed} processos reduzidos${r.standbyPurged ? ' • lista standby limpa' : ' • (execute como administrador para limpar a standby)'}`;
  b.disabled = false; b.textContent = 'Limpar RAM agora'; refreshStats();
}

/* ------------------------------ limpeza ------------------------------ */
let junk = [];
async function scanJunk() {
  $('#cleanList').innerHTML = '<div class="empty"><span class="spinner"></span>Analisando arquivos…</div>';
  junk = await api.scanJunk(); renderJunk();
}
function renderJunk() {
  const total = junk.reduce((a, j) => a + j.size, 0);
  $('#cleanList').innerHTML = junk.map((j) => `<label class="row list-row"><input type="checkbox" data-id="${j.id}" checked>
    <div class="t"><b>${esc(j.name)}</b><small>${esc(j.desc)}</small></div><span class="size">${fmt(j.size)}</span></label>`).join('')
    + `<div class="row list-row" style="border-top:1px solid var(--line)"><span></span><div class="t"><b>Total encontrado</b></div><span class="size">${fmt(total)}</span></div>`;
}
async function runClean() {
  const ids = [...document.querySelectorAll('#cleanList input:checked')].map((c) => c.dataset.id);
  if (!ids.length) return toast('Selecione ao menos um item.');
  const b = $('#cRun'); b.disabled = true;
  const r = await api.cleanJunk(ids); toast(`${fmt(r.freed)} liberados!`, 'ok'); b.disabled = false; scanJunk();
}
loaders.clean = scanJunk;

/* ------------------------------ inicialização ------------------------------ */
async function loadStartup() {
  $('#startList').innerHTML = '<div class="empty"><span class="spinner"></span>Carregando…</div>';
  const items = await api.startup();
  if (!items.length) { $('#startList').innerHTML = '<div class="empty">Nenhum programa de inicialização encontrado.</div>'; return; }
  $('#startList').innerHTML = items.map((s, i) => `<label class="row list-row"><span></span>
    <div class="t"><b>${esc(s.name)}<span class="tag">${esc(s.scope)}</span></b><small title="${esc(s.cmd)}">${esc(s.cmd)}</small></div>
    <input type="checkbox" class="switch" data-i="${i}" ${s.enabled ? 'checked' : ''}></label>`).join('');
  $('#startList').onchange = async (e) => {
    const c = e.target.closest('.switch'); if (!c) return;
    const s = items[c.dataset.i]; const r = await api.setStartup(s.hive, s.name, c.checked);
    if (!r.ok) { c.checked = !c.checked; toast(r.msg || 'Não foi possível alterar.', 'err'); } else toast(`${s.name}: ${c.checked ? 'ativado' : 'desativado'}`, 'ok');
  };
}
loaders.startup = loadStartup;

/* ------------------------------ ajustes ------------------------------ */
async function loadTweaks() {
  const list = await api.tweaks();
  $('#tweakList').innerHTML = list.map((t) => `<label class="row list-row"><span></span>
    <div class="t"><b>${esc(t.name)}${t.admin ? '<span class="tag">admin</span>' : ''}${t.recommended ? '' : '<span class="tag">opcional</span>'}</b><small style="white-space:normal;max-width:640px">${esc(t.desc)}</small></div>
    ${t.oneshot ? `<button class="btn ghost" data-id="${t.id}" data-one="1">Executar</button>` : `<input type="checkbox" class="switch" data-id="${t.id}" ${t.applied ? 'checked' : ''}>`}</label>`).join('');
  $('#tweakList').onchange = async (e) => {
    const c = e.target.closest('.switch'); if (!c) return;
    const r = await api.setTweak(c.dataset.id, c.checked);
    if (!r.ok) { c.checked = !c.checked; toast(r.msg || 'Falhou.', 'err'); } else toast(c.checked ? 'Ajuste aplicado' : 'Ajuste revertido', 'ok');
  };
  $('#tweakList').onclick = async (e) => {
    const b = e.target.closest('[data-one]'); if (!b) return;
    e.preventDefault(); const r = await api.setTweak(b.dataset.id, true); toast(r.ok ? 'Concluído' : r.msg || 'Falhou', r.ok ? 'ok' : 'err');
  };
}
loaders.tweaks = loadTweaks;

/* ------------------------------ atualização ------------------------------ */
function showUpdate(u) {
  const t = $('#updTitle'), s = $('#updSub'), bar = $('#updBar');
  bar.hidden = u.state !== 'downloading'; $('#updInstall').hidden = u.state !== 'ready'; $('#updIco').textContent = '⬇';
  const map = {
    idle: ['Pronto para verificar', ''], checking: ['Verificando atualizações…', 'Consultando o GitHub.'],
    latest: ['Você está na versão mais recente', 'Nenhuma atualização disponível.'], dev: ['Modo de desenvolvimento', 'A atualização automática funciona no app instalado.'],
    downloading: [`Baixando versão ${u.version || ''}`, `${u.percent || 0}%`], ready: [`Versão ${u.version} pronta`, 'Reinicie para concluir a instalação.'],
    error: ['Não foi possível verificar', u.message || ''],
  };
  const [a, b] = map[u.state] || map.idle; t.textContent = a; s.textContent = b;
  if (u.state === 'downloading') $('div', bar).style.width = (u.percent || 0) + '%';
  if (u.state === 'latest') $('#updIco').textContent = '✓'; if (u.state === 'error') $('#updIco').textContent = '!';
  document.querySelector('.nav-item[data-tab="update"] .dot')?.remove();
  if (u.state === 'ready' || u.state === 'downloading') document.querySelector('.nav-item[data-tab="update"]').insertAdjacentHTML('beforeend', '<i class="dot"></i>');
  if (u.state === 'ready') toast(`Atualização ${u.version} pronta para instalar.`, 'ok');
}

/* ------------------------------ init ------------------------------ */
buildNav();
$('#wMin').onclick = () => api.win.minimize(); $('#wMax').onclick = () => api.win.maximize(); $('#wClose').onclick = () => api.win.close();
$('#optAll').onclick = optimizeAll;
$('#pRefresh').onclick = loadProcesses; $('#pKill').onclick = killSelected;
$('#pSelSuggest').onclick = () => document.querySelectorAll('#procTable input').forEach((c) => { const k = procs[c.dataset.i]?.kind; if (k === 'auto' || k === 'suggest') c.checked = true; });
$('#memClean').onclick = cleanMem; $('#cScan').onclick = scanJunk; $('#cRun').onclick = runClean; $('#sRefresh').onclick = loadStartup;
$('#updCheck').onclick = async () => showUpdate(await api.checkUpdate()); $('#updInstall').onclick = () => api.installUpdate(); $('#repo').onclick = () => api.openRepo();
api.onUpdate(showUpdate);
api.appInfo().then((i) => { $('#ver').textContent = 'v' + i.version; showUpdate(i.update || { state: 'idle' }); });
refreshStats(); setInterval(refreshStats, 2000);

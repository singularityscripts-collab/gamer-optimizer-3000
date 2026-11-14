'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function fmt(b) {
  if (!b || b < 1) return '0 MB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b >= 100 || i < 2 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}

// Anima um número de onde está até o novo valor.
function tween(el, to, format = (v) => Math.round(v), dur = 800) {
  const from = el._v ?? 0; el._v = to;
  if (reduced || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (to - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

function confirmBox(title, text, ok = 'Confirmar') {
  return new Promise((resolve) => {
    $('#mTitle').textContent = title; $('#mText').textContent = text; $('#mOk').textContent = ok;
    const m = $('#modal'); m.hidden = false;
    const done = (v) => { m.hidden = true; $('#mOk').onclick = $('#mCancel').onclick = m.onclick = null; resolve(v); };
    $('#mOk').onclick = () => done(true); $('#mCancel').onclick = () => done(false);
    m.onclick = (e) => { if (e.target === m) done(false); };
    $('#mOk').focus();
  });
}

async function busy(btn, fn) {
  btn.classList.add('loading');
  try { return await fn(); } catch (e) { toast('Algo deu errado: ' + (e.message || e), 'err'); } finally { btn.classList.remove('loading'); }
}

function skeleton(el, n = 6) {
  el.innerHTML = Array.from({ length: n }, (_, i) => `<div class="skel" style="--w:${(i * 37) % 40}"></div>`).join('');
}

/* ------------------------------ navegação ------------------------------ */
const ICONS = {
  dashboard: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  processes: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h4"/>',
  memory: '<rect x="4" y="7" width="16" height="10" rx="1.5"/><path d="M8 7V4M12 7V4M16 7V4M8 20v-3M12 20v-3M16 20v-3"/>',
  clean: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  startup: '<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
  tweaks: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  update: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
};
const TABS = [['dashboard', 'Painel'], ['processes', 'Processos'], ['memory', 'Memória'], ['clean', 'Limpeza'], ['startup', 'Inicialização'], ['tweaks', 'Ajustes'], ['settings', 'Configurações'], ['update', 'Atualização']];
const loaders = {};
let current = 'dashboard';

function buildNav() {
  const nav = $('#nav');
  for (const [id, label] of TABS) {
    if (id === 'settings') nav.insertAdjacentHTML('beforeend', '<div class="spacer"></div>');
    nav.insertAdjacentHTML('beforeend', `<button class="nav" data-tab="${id}" data-label="${label}" aria-label="${label}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg></button>`);
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('.nav'); if (b) go(b.dataset.tab); });
  go('dashboard', true);
  addEventListener('resize', () => moveIndicator(true));
}
function moveIndicator(instant) {
  const b = $(`.nav[data-tab="${current}"]`), ind = $('#indicator');
  if (instant) ind.style.transition = 'none';
  ind.style.transform = `translateY(${b.offsetTop}px)`;
  if (instant) requestAnimationFrame(() => (ind.style.transition = ''));
}
function go(id, instant) {
  current = id;
  $$('.nav').forEach((n) => n.classList.toggle('active', n.dataset.tab === id));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'v-' + id));
  moveIndicator(instant);
  $('#main').scrollTop = 0;
  if (loaders[id]) loaders[id]();
}

/* ------------------------------ estatísticas ------------------------------ */
let stats = null;
function setMetric(id, pct, sub) {
  const m = $('#' + id);
  tween($('.num b', m), pct);
  const bar = $('.line i', m); bar.style.width = pct + '%'; bar.classList.toggle('hot', pct >= 85);
  $('.sub', m).textContent = sub;
}
async function refreshStats() {
  try { stats = await api.stats(); } catch { return; }
  const s = stats;
  const ram = Math.round((s.ramUsed / s.ramTotal) * 100), disk = s.diskTotal ? Math.round((s.diskUsed / s.diskTotal) * 100) : 0;
  setMetric('m-cpu', s.cpu, `${s.cores} threads · ${s.cpuName.replace(/\(R\)|\(TM\)|CPU|@.*$/g, '').replace(/\s+/g, ' ').trim()}`);
  setMetric('m-ram', ram, `${fmt(s.ramUsed)} de ${fmt(s.ramTotal)}`);
  setMetric('m-disk', disk, `${fmt(s.diskTotal - s.diskUsed)} livres`);
  $('#adminHint').hidden = s.admin;
  if (current === 'memory') updateMemory();
}

/* ------------------------------ otimizar tudo ------------------------------ */
const STEP_TEXT = ['Encerrando processos em segundo plano…', 'Aplicando ajustes de desempenho…', 'Removendo arquivos inúteis…', 'Liberando memória RAM…'];
const IDLE_TEXT = 'Um clique para deixar o PC mais leve.';
const C = 2 * Math.PI * 100;
let resetTimer = null; // antes, o timer de uma execução anterior podia resetar o orbe no meio da seguinte
function setOrb(p) {
  $('#orbProg').style.strokeDashoffset = C * (1 - p);
  tween($('#orbPct'), Math.round(p * 100), (v) => Math.round(v) + '%', 600);
}
function setStatus(text) { const s = $('#status'); s.textContent = text; s.classList.remove('swap'); void s.offsetWidth; s.classList.add('swap'); }

// O estado visual vem dos eventos do processo principal, então otimizações automáticas também aparecem aqui.
function enterRunning(source) {
  const orb = $('#orb');
  if (orb.classList.contains('running')) return;
  clearTimeout(resetTimer);
  orb.className = 'orb running'; $('#results').hidden = true;
  $$('.seg').forEach((s) => (s.className = 'seg'));
  $('#orbPct')._v = 0; setOrb(0);
  if (source === 'auto') toast('Otimização automática em andamento');
}
api.onProgress((p) => {
  enterRunning(p.source);
  const segs = $$('.seg'), i = p.step - 1;
  if (!segs[i]) return;
  if (p.done) { segs[i].className = 'seg ' + (p.skipped ? 'skipped' : p.error ? 'failed' : 'done'); setOrb(p.step / 4); }
  else { segs[i].className = 'seg active'; setStatus(STEP_TEXT[i]); setOrb(i / 4 + 0.04); }
});
api.onDone((r) => {
  const orb = $('#orb');
  if (r.error) { orb.className = 'orb'; setOrb(0); setStatus('A otimização falhou. Tente novamente.'); toast(r.error, 'err'); return; }
  orb.className = 'orb done'; setOrb(1);
  setStatus(r.source === 'auto' ? 'Otimização automática concluída.' : r.errors && r.errors.length ? 'Concluído, mas alguma etapa falhou.' : 'Seu PC está otimizado.');
  const n = (v) => Math.round(v);
  const items = [[r.killed, 'processos encerrados', n], [r.ramFreed, 'RAM liberada', fmt], [r.junk, 'disco liberado', fmt], [r.tweaks, 'ajustes aplicados', n]];
  const box = $('#results');
  box.innerHTML = items.map(([, l], i) => `<div style="--i:${i}"><b>0</b><span>${l}</span></div>`).join('')
    + (r.skipped && !r.admin ? `<div class="results-note" style="--i:4">${r.skipped} ajuste(s) pulados por falta de permissão de administrador.</div>` : '');
  box.hidden = false;
  $$('b', box).forEach((b, i) => { b._v = 0; setTimeout(() => tween(b, items[i][0], items[i][2], 1100), i * 90); });
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    if (!orb.classList.contains('done')) return;
    orb.className = 'orb'; setOrb(0); setStatus(IDLE_TEXT); $$('.seg').forEach((s) => (s.className = 'seg'));
  }, 9000);
  refreshStats();
});
async function optimizeAll() {
  if ($('#orb').classList.contains('running')) return;
  enterRunning('manual');
  try { await api.optimizeAll(); } catch (e) {
    $('#orb').className = 'orb'; setOrb(0); setStatus('A otimização falhou. Tente novamente.'); toast(e.message || 'Falhou', 'err');
  }
}

/* ------------------------------ processos ------------------------------ */
let procs = [];
const KIND = { auto: 'Dispensável', suggest: 'Sugerido' };
const LOCK = '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
async function loadProcesses() {
  skeleton($('#procList'), 9);
  try { procs = (await api.processes()).map((p) => ({ ...p, checked: p.kind === 'auto' })); } catch { procs = []; }
  renderProcs();
}
// Só o que a busca mostra conta para marcar, contar e encerrar: antes, itens escondidos pelo filtro também eram encerrados.
function visibleProcs() {
  const q = $('#pSearch').value.trim().toLowerCase();
  return procs.map((p, i) => ({ ...p, i })).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q));
}
function renderProcs() {
  const list = visibleProcs();
  $('#procList').innerHTML = list.length ? list.map((p, n) => `<label class="row${p.kind === 'protected' ? ' off' : ''}" style="--i:${n}">
      ${p.kind === 'protected' ? LOCK : `<input type="checkbox" data-i="${p.i}" ${p.checked ? 'checked' : ''}>`}
      <div class="t"><b><span class="nm">${esc(p.name)}</span>${p.count > 1 ? ` <span class="count">×${p.count}</span>` : ''}${KIND[p.kind] ? `<span class="tag ${p.kind}">${KIND[p.kind]}</span>` : ''}</b>
      <small>${esc(p.title || p.path || 'Sistema')}</small></div>
      <span></span><span class="size">${fmt(p.mem)}</span></label>`).join('')
    : '<div class="empty">Nenhum processo encontrado.</div>';
  updateKillBtn();
}
function updateKillBtn() {
  const n = visibleProcs().filter((p) => p.checked).length;
  $('#pKill').disabled = !n; $('#pKill').textContent = n ? `Encerrar ${n}` : 'Encerrar';
}
async function killSelected() {
  const sel = visibleProcs().filter((p) => p.checked);
  if (!sel.length) return;
  const withWindow = sel.filter((p) => p.title);
  const ok = await confirmBox(`Encerrar ${sel.length} processo(s)?`,
    withWindow.length ? `${withWindow.map((p) => p.name).join(', ')} ${withWindow.length > 1 ? 'têm janelas abertas' : 'tem uma janela aberta'}. Trabalho não salvo será perdido.` : 'Eles serão fechados imediatamente.', 'Encerrar');
  if (!ok) return;
  await busy($('#pKill'), async () => {
    const r = await api.killProcesses(sel.map((p) => p.name));
    toast(`${r.killed} processo(s) encerrado(s) · ${fmt(r.freed)} liberados`, 'ok');
    await loadProcesses();
  });
}
loaders.processes = loadProcesses;

/* ------------------------------ memória ------------------------------ */
function buildMemRing() {
  const r = 92, c = 2 * Math.PI * r;
  $('#memRing').innerHTML = `<svg viewBox="0 0 200 200"><circle class="bg" cx="100" cy="100" r="${r}"/><circle class="fg" cx="100" cy="100" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>
    <div class="lbl"><b>0%</b><span>em uso</span></div>`;
  $('#memRing')._c = c;
}
function updateMemory() {
  if (!stats) return;
  const s = stats, pct = Math.round((s.ramUsed / s.ramTotal) * 100);
  $('#memRing .fg').style.strokeDashoffset = $('#memRing')._c * (1 - pct / 100);
  tween($('#memRing .lbl b'), pct, (v) => Math.round(v) + '%');
  $('#mUsed').textContent = fmt(s.ramUsed); $('#mFree').textContent = fmt(s.ramTotal - s.ramUsed); $('#mTotal').textContent = fmt(s.ramTotal);
}
async function cleanMem() {
  $('#memNote').textContent = '';
  await busy($('#memClean'), async () => {
    const r = await api.cleanMemory();
    $('#memNote').textContent = `${fmt(r.freed)} liberados · ${r.trimmed} processos compactados${r.standbyPurged ? ' · cache standby limpo' : ''}`;
    await refreshStats();
  });
}
loaders.memory = updateMemory;

/* ------------------------------ limpeza ------------------------------ */
let junk = [];
async function scanJunk() {
  skeleton($('#cleanList'), 8); $('#cRun').disabled = true; $('#cTotal')._v = 0; $('#cTotal').textContent = '…';
  await busy($('#cScan'), async () => { junk = (await api.scanJunk()).map((j) => ({ ...j, checked: j.size > 0 })); });
  renderJunk();
}
function renderJunk() {
  $('#cleanList').innerHTML = junk.map((j, i) => `<label class="row${j.size ? '' : ' off'}" style="--i:${i}">
    <input type="checkbox" data-i="${i}" ${j.checked ? 'checked' : ''} ${j.size ? '' : 'disabled'}>
    <div class="t"><b>${esc(j.name)}</b><small>${esc(j.desc)}</small></div><span></span><span class="size">${j.size ? fmt(j.size) : '—'}</span></label>`).join('');
  updateJunkTotal();
}
function updateJunkTotal() {
  const total = junk.filter((j) => j.checked).reduce((a, j) => a + j.size, 0);
  tween($('#cTotal'), total, fmt); $('#cRun').disabled = !total;
}
async function runClean() {
  const ids = junk.filter((j) => j.checked).map((j) => j.id);
  if (!ids.length) return;
  await busy($('#cRun'), async () => { const r = await api.cleanJunk(ids); toast(`${fmt(r.freed)} liberados`, 'ok'); });
  scanJunk();
}
loaders.clean = () => { if (!junk.length) scanJunk(); };

/* ------------------------------ inicialização ------------------------------ */
let startItems = [];
async function loadStartup() {
  skeleton($('#startList'), 6);
  try { startItems = await api.startup(); } catch { startItems = []; }
  $('#startList').innerHTML = startItems.length ? startItems.map((s, i) => `<label class="row${s.enabled ? '' : ' off'}" style="--i:${i}"><span></span>
      <div class="t"><b><span class="nm">${esc(s.name)}</span><span class="tag">${esc(s.scope)}</span></b><small title="${esc(s.cmd)}">${esc(s.cmd)}</small></div>
      <span></span><input type="checkbox" class="switch" data-i="${i}" ${s.enabled ? 'checked' : ''}></label>`).join('')
    : '<div class="empty">Nenhum programa abre junto com o Windows.</div>';
}
$('#startList').addEventListener('change', async (e) => {
  const c = e.target.closest('.switch'); if (!c) return;
  const s = startItems[c.dataset.i];
  if (!(await toggleCall(c, () => api.setStartup(s.loc, s.name, c.checked), `${s.name} ${c.checked ? 'ativado' : 'desativado'}`))) return;
  s.enabled = c.checked; c.closest('.row').classList.toggle('off', !c.checked);
});
loaders.startup = loadStartup;

/* ------------------------------ ajustes ------------------------------ */
async function loadTweaks() {
  let list = [];
  try { list = await api.tweaks(); } catch (e) { $('#tweakList').innerHTML = '<div class="empty">Não foi possível carregar os ajustes.</div>'; return; }
  const admin = stats ? stats.admin : true;
  $('#tweakList').innerHTML = list.map((t, i) => `<${t.oneshot ? 'div' : 'label'} class="row" style="--i:${i}"><span></span>
    <div class="t"><b>${esc(t.name)}${t.admin ? '<span class="tag admin">admin</span>' : ''}${t.recommended ? '' : '<span class="tag">opcional</span>'}</b><small class="wrap">${esc(t.desc)}</small></div><span></span>
    ${t.oneshot ? `<button class="btn" data-one="${t.id}">Executar</button>` : `<input type="checkbox" class="switch" data-id="${t.id}" ${t.applied ? 'checked' : ''} ${t.admin && !admin ? 'disabled title="Requer administrador"' : ''}>`}</${t.oneshot ? 'div' : 'label'}>`).join('');
}
// Interruptor que chama o processo principal: em qualquer falha volta ao estado anterior e nunca fica travado desabilitado.
async function toggleCall(c, fn, okMsg) {
  c.disabled = true;
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, msg: e.message }; }
  c.disabled = false;
  if (!r || !r.ok) { c.checked = !c.checked; toast((r && r.msg) || 'Não foi possível alterar.', 'err'); return false; }
  if (okMsg) toast(okMsg, 'ok');
  return true;
}
$('#tweakList').addEventListener('change', (e) => {
  const c = e.target.closest('.switch'); if (!c) return;
  toggleCall(c, () => api.setTweak(c.dataset.id, c.checked), c.checked ? 'Ajuste aplicado' : 'Ajuste revertido');
});
$('#tweakList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-one]'); if (!b) return;
  e.preventDefault();
  await busy(b, async () => { const r = await api.setTweak(b.dataset.one, true); toast(r.ok ? 'Concluído' : r.msg || 'Falhou', r.ok ? 'ok' : 'err'); });
});
loaders.tweaks = loadTweaks;

/* ------------------------------ configurações / otimização automática ------------------------------ */
const INTERVALS = [[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [480, '8 horas'], [720, '12 horas'], [1440, '24 horas']];
let cfg = null, autoState = null;
function intervalLabel(min) {
  const f = INTERVALS.find(([m]) => m === min);
  if (f) return f[1];
  return min % 60 === 0 ? `${min / 60} h` : `${min} min`;
}
function relTime(ts) {
  const d = Math.round((ts - Date.now()) / 60000);
  if (d <= 0) return 'em instantes';
  if (d < 60) return `em ${d} min`;
  const h = Math.floor(d / 60), m = d % 60;
  return `em ${h} h${m ? ` ${m} min` : ''}`;
}
const clock = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function renderAuto() {
  if (!cfg) return;
  const a = cfg.auto, s = autoState || {};
  // Linha de status no painel
  const line = $('#autoLine');
  if (!a.enabled) line.innerHTML = 'Otimização automática desligada · <a data-go="settings">ativar</a>';
  else if (s.running) line.innerHTML = '<i class="live"></i>Otimização automática em andamento…';
  else line.innerHTML = `<i class="live"></i>Automática a cada ${intervalLabel(a.intervalMin)} · próxima ${s.nextAt ? `às ${clock(s.nextAt)} (${relTime(s.nextAt)})` : '—'}${s.postponed ? ' · adiada por jogo em tela cheia' : ''}`;
  // Tela de configurações
  $('#autoNext').textContent = !a.enabled ? 'Desligada' : s.running ? 'Rodando agora…' : s.nextAt ? `Próxima às ${clock(s.nextAt)} · ${relTime(s.nextAt)}` : '—';
  $('#autoLast').textContent = s.lastAt ? `Última: ${new Date(s.lastAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${s.last ? ` · ${fmt(s.last.ramFreed)} RAM · ${fmt(s.last.junk)} disco` : ''}` : 'Ainda não executada';
}
function renderSettings() {
  if (!cfg) return;
  const a = cfg.auto;
  $('#sAuto').checked = a.enabled;
  $('#autoBody').classList.toggle('disabled', !a.enabled);
  const preset = INTERVALS.some(([m]) => m === a.intervalMin);
  $('#sInterval').innerHTML = INTERVALS.map(([m, l]) => `<option value="${m}">${l}</option>`).join('') + '<option value="custom">Personalizado…</option>';
  $('#sInterval').value = preset ? String(a.intervalMin) : 'custom';
  $('#sCustomWrap').hidden = preset;
  $('#sCustom').value = a.intervalMin;
  for (const k of ['procs', 'tweaks', 'junk', 'memory']) $(`#st-${k}`).checked = a.steps[k];
  $('#sBusy').checked = a.skipWhenBusy; $('#sNotify').checked = a.notify;
  $('#sTray').checked = cfg.closeToTray; $('#sLogin').checked = cfg.launchAtLogin;
  renderAuto();
}
async function saveSettings(patch, input) {
  try {
    const r = await api.setSettings(patch);
    cfg = r.settings; autoState = r.auto;
    if (!r.ok) toast(r.msg || 'Não foi possível salvar.', 'err');
  } catch (e) { toast(e.message || 'Não foi possível salvar.', 'err'); }
  renderSettings();
  if (input) input.blur();
}
async function loadSettings() {
  try { const r = await api.getSettings(); cfg = r.settings; autoState = r.auto; } catch { return; }
  renderSettings();
}
$('#sAuto').addEventListener('change', (e) => saveSettings({ auto: { enabled: e.target.checked } }).then(() => {
  if (cfg.auto.enabled) toast(`Otimização automática a cada ${intervalLabel(cfg.auto.intervalMin)}`, 'ok');
}));
$('#sInterval').addEventListener('change', (e) => {
  if (e.target.value === 'custom') { $('#sCustomWrap').hidden = false; $('#sCustom').focus(); return; }
  saveSettings({ auto: { intervalMin: Number(e.target.value) } });
});
$('#sCustom').addEventListener('change', (e) => saveSettings({ auto: { intervalMin: Number(e.target.value) } }, e.target));
for (const k of ['procs', 'tweaks', 'junk', 'memory']) {
  $(`#st-${k}`).addEventListener('change', (e) => {
    const steps = { ...cfg.auto.steps, [k]: e.target.checked };
    if (!Object.values(steps).some(Boolean)) { e.target.checked = true; return toast('Mantenha pelo menos uma etapa ligada.', 'err'); }
    saveSettings({ auto: { steps: { [k]: e.target.checked } } });
  });
}
$('#sBusy').addEventListener('change', (e) => saveSettings({ auto: { skipWhenBusy: e.target.checked } }));
$('#sNotify').addEventListener('change', (e) => saveSettings({ auto: { notify: e.target.checked } }));
$('#sTray').addEventListener('change', (e) => saveSettings({ closeToTray: e.target.checked }));
$('#sLogin').addEventListener('change', (e) => saveSettings({ launchAtLogin: e.target.checked }));
api.onSettings((s) => { cfg = s; renderSettings(); });
api.onAuto((s) => { autoState = s; renderAuto(); });
document.addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go); } });
loaders.settings = loadSettings;

/* ------------------------------ atualização ------------------------------ */
let lastUpdateState = '';
function showUpdate(u) {
  if (!u) return;
  const map = {
    idle: ['Aguardando verificação', '', ''], checking: ['Procurando atualizações…', 'Consultando o GitHub.', 'on'],
    latest: ['Você está na versão mais recente', '', 'ok'], dev: ['Modo de desenvolvimento', 'A atualização automática funciona no app instalado.', ''],
    portable: ['Versão portátil', 'A versão portátil não se atualiza sozinha. Use o instalador para receber atualizações automáticas.', ''],
    downloading: [`Baixando a versão ${u.version || ''}`, `${u.percent || 0}%`, 'on'], ready: [`Versão ${u.version} pronta`, 'Reinicie para concluir a instalação.', 'ok'],
    error: ['Não foi possível verificar', u.message || '', 'err'],
  };
  const [title, sub, cls] = map[u.state] || map.idle;
  $('#updTitle').textContent = title; $('#updSub').textContent = sub;
  $('#updState .pulse').className = 'pulse ' + cls;
  $('#updBar').hidden = u.state !== 'downloading'; $('#updBar i').style.width = (u.percent || 0) + '%';
  $('#updInstall').hidden = u.state !== 'ready';
  const nav = $('.nav[data-tab="update"]'); $('.dot', nav)?.remove();
  if (u.state === 'ready') nav.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
  if (u.state === 'ready' && lastUpdateState !== 'ready') toast(`Atualização ${u.version} pronta para instalar`, 'ok');
  lastUpdateState = u.state;
}

/* ------------------------------ init ------------------------------ */
buildNav();
buildMemRing();
$('#wMin').onclick = () => api.win.minimize(); $('#wMax').onclick = () => api.win.maximize(); $('#wClose').onclick = () => api.win.close();
$('#optAll').onclick = optimizeAll;
$('#pSearch').addEventListener('input', renderProcs);
$('#procList').addEventListener('change', (e) => { const c = e.target.closest('input[data-i]'); if (c) { procs[c.dataset.i].checked = c.checked; updateKillBtn(); } });
$('#pSelSuggest').onclick = () => { visibleProcs().forEach((p) => { if (p.kind === 'auto' || p.kind === 'suggest') procs[p.i].checked = true; }); renderProcs(); };
$('#pKill').onclick = killSelected;
$('#memClean').onclick = cleanMem;
$('#cScan').onclick = scanJunk; $('#cRun').onclick = runClean;
$('#cleanList').addEventListener('change', (e) => { const c = e.target.closest('input[data-i]'); if (c) { junk[c.dataset.i].checked = c.checked; updateJunkTotal(); } });
$('#sRefresh').onclick = () => busy($('#sRefresh'), loadStartup);
$('#updCheck').onclick = () => busy($('#updCheck'), async () => showUpdate(await api.checkUpdate()));
$('#updInstall').onclick = () => api.installUpdate();
$('#repo').onclick = () => api.openRepo();
$('#logs').onclick = () => api.openLogs();
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) $('#mCancel').click(); });
api.onUpdate(showUpdate);
api.appInfo().then((i) => { $('#ver').textContent = 'v' + i.version; showUpdate(i.update || { state: 'idle' }); }).catch(() => {});
loadSettings();
refreshStats().then(() => setTimeout(refreshStats, 1000));
setInterval(() => { if (!document.hidden) refreshStats(); }, 2000);
setInterval(() => { if (!document.hidden) renderAuto(); }, 30000); // mantém o "em X min" atualizado

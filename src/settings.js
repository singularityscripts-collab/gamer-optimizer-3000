// Configurações persistentes, sempre validadas: um arquivo editado à mão ou corrompido nunca derruba o app.
const fs = require('fs');

const DEFAULTS = {
  auto: {
    enabled: false,
    intervalMin: 60,
    steps: { procs: true, tweaks: false, junk: true, memory: true },
    skipWhenBusy: true,
    notify: true,
  },
  closeToTray: true,
  launchAtLogin: false,
};
const MIN_INTERVAL = 5, MAX_INTERVAL = 7 * 24 * 60;

let file = null;
let data = null;

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
function sanitize(s) {
  s = s && typeof s === 'object' ? s : {};
  const a = s.auto && typeof s.auto === 'object' ? s.auto : {};
  const st = a.steps && typeof a.steps === 'object' ? a.steps : {};
  const d = DEFAULTS.auto;
  let interval = Math.round(Number(a.intervalMin));
  if (!Number.isFinite(interval)) interval = d.intervalMin;
  interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, interval));
  return {
    auto: {
      enabled: bool(a.enabled, d.enabled),
      intervalMin: interval,
      steps: {
        procs: bool(st.procs, d.steps.procs), tweaks: bool(st.tweaks, d.steps.tweaks),
        junk: bool(st.junk, d.steps.junk), memory: bool(st.memory, d.steps.memory),
      },
      skipWhenBusy: bool(a.skipWhenBusy, d.skipWhenBusy),
      notify: bool(a.notify, d.notify),
    },
    closeToTray: bool(s.closeToTray, DEFAULTS.closeToTray),
    launchAtLogin: bool(s.launchAtLogin, DEFAULTS.launchAtLogin),
  };
}

function init(path) {
  file = path;
  try { data = sanitize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { data = sanitize({}); }
  return data;
}
function get() { return JSON.parse(JSON.stringify(data)); }
function update(patch) {
  const next = get();
  if (patch && typeof patch === 'object') {
    if (patch.auto && typeof patch.auto === 'object') {
      const pa = { ...patch.auto };
      // Campo vazio ('' vira 0) ou texto inválido mantém o intervalo atual em vez de cair para 5 min ou 60 min.
      if ('intervalMin' in pa) {
        const n = Number(pa.intervalMin);
        if (pa.intervalMin === '' || pa.intervalMin === null || typeof pa.intervalMin === 'boolean' || !Number.isFinite(n) || n <= 0) delete pa.intervalMin;
      }
      Object.assign(next.auto, pa, { steps: { ...next.auto.steps, ...(pa.steps || {}) } });
    }
    if ('closeToTray' in patch) next.closeToTray = patch.closeToTray;
    if ('launchAtLogin' in patch) next.launchAtLogin = patch.launchAtLogin;
  }
  data = sanitize(next);
  try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, file); } catch { /* mantém em memória */ }
  return get();
}

module.exports = { init, get, update, MIN_INTERVAL, MAX_INTERVAL };

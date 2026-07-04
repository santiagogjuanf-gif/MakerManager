// Auth
let currentUser = null;

function getToken() { return localStorage.getItem('mm_token'); }

async function checkAuth() {
  const token = getToken();
  if (!token) { window.location.href = '/login'; return false; }
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { localStorage.removeItem('mm_token'); localStorage.removeItem('mm_user'); window.location.href = '/login'; return false; }
    currentUser = await res.json();
    if (currentUser.is_default_password) {
      setTimeout(() => showToast('⚠️ Credenciales por defecto. Cámbialas en Configuración.', 'error'), 1500);
    }
    if (currentUser.role === 'worker') {
      document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
    }
    const userEl = document.getElementById('sidebar-user');
    if (userEl) userEl.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--text)">${currentUser.display_name || currentUser.username}</div><div style="font-size:10px;color:var(--text-muted);margin-top:1px">${currentUser.role === 'admin' ? '👑 Admin' : '👷 Worker'}</div>`;
    return true;
  } catch { window.location.href = '/login'; return false; }
}

function logout() {
  localStorage.removeItem('mm_token');
  localStorage.removeItem('mm_user');
  window.location.href = '/login';
}

// Themes
const THEMES = {
  morado:   { accent:'#6c63ff', accentLight:'#8b84ff', bg:'#0f1117', surface:'#1a1d27', card:'#1e2130', border:'#2d3148', text:'#e2e8f0', textMuted:'#8892a4' },
  cerberus: { accent:'#f97316', accentLight:'#fb923c', bg:'#080b10', surface:'#111318', card:'#14171e', border:'#1f2330', text:'#f1f5f9', textMuted:'#8892a4' },
  cian:     { accent:'#06b6d4', accentLight:'#22d3ee', bg:'#f8fafc', surface:'#f1f5f9', card:'#ffffff', border:'#e2e8f0', text:'#1e293b', textMuted:'#64748b' },
  bambu:    { accent:'#16a34a', accentLight:'#22c55e', bg:'#e2e5e9', surface:'#d8dfe6', card:'#f0f2f5', border:'#c5cdd8', text:'#1e293b', textMuted:'#64748b' },
};

function applyTheme(t) {
  const th = THEMES[t] || THEMES.morado;
  const r = document.documentElement.style;
  [['--accent',th.accent],['--accent-light',th.accentLight],['--accent-dim',th.accent+'26'],['--bg',th.bg],['--surface',th.surface],['--card',th.card],['--border',th.border],['--text',th.text],['--text-muted',th.textMuted]].forEach(([k,v]) => r.setProperty(k,v));
}

// Global config store
let appConfig = {};

// Global API helper — includes auth header, handles 401
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { localStorage.removeItem('mm_token'); window.location.href = '/login'; throw new Error('No autenticado'); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

// Toast
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

// Modal
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').innerHTML = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-box')?.classList.remove('modal-wide');
}

function cancelModal() {
  confirmModal('¿Seguro que deseas cancelar? Se perderán los datos.', closeModal, '❌');
}

// Confirm modal
function confirmModal(msg, onYes, icon = '⚠️') {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-icon').textContent = icon;
  const overlay = document.getElementById('confirm-overlay');
  overlay.classList.remove('hidden');
  const btn = document.getElementById('confirm-yes-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => { closeConfirm(); onYes(); });
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.add('hidden');
}

// Format currency (dynamic)
function fmtMoney(v) {
  if (v == null || v === '') return '-';
  const sym = appConfig.simbolo_moneda || '$';
  const cur = appConfig.moneda || '';
  return `${sym}${parseFloat(v).toFixed(2)}${cur ? ' ' + cur : ''}`;
}

function fmtNum(v, dec = 2) {
  return parseFloat(v || 0).toFixed(dec);
}

function materialBadge(mat) {
  const m = (mat || '').toUpperCase();
  const map = { PLA: 'pla', PETG: 'petg', ABS: 'abs', TPU: 'tpu', ASA: 'asc' };
  const cls = map[m] || 'default';
  return `<span class="badge badge-${cls}">${mat || '-'}</span>`;
}

function colorHex(name) {
  const map = {
    negro: '#222', blanco: '#eee', gris: '#888', azul: '#3b82f6',
    verde: '#22c55e', rojo: '#ef4444', amarillo: '#fbbf24', naranja: '#f97316',
    morado: '#a855f7', rosa: '#ec4899', cyan: '#06b6d4', cafe: '#92400e',
  };
  return map[(name || '').toLowerCase()] || '#6c63ff';
}

// Pagination
function paginate(data, page, perPage = 10) {
  const totalPages = Math.max(1, Math.ceil(data.length / perPage));
  const p = Math.min(Math.max(1, page), totalPages);
  return { items: data.slice((p - 1) * perPage, p * perPage), totalPages, page: p };
}

function renderPagination(containerId, current, total, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (total <= 1) { container.innerHTML = ''; return; }
  let html = `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="(${onPageChange})(${current - 1})">‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (total > 7 && i > 2 && i < total - 1 && Math.abs(i - current) > 1) {
      if (i === 3 || i === total - 2) html += `<span class="page-info">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="(${onPageChange})(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${current === total ? 'disabled' : ''} onclick="(${onPageChange})(${current + 1})">›</button>`;
  container.innerHTML = html;
}

// Load app config
async function loadConfig() {
  try {
    const cfg = await api('GET', '/api/config');
    appConfig = Array.isArray(cfg) ? cfg.reduce((a, r) => ({ ...a, [r.key]: r.value }), {}) : cfg;
  } catch(e) { console.warn('Config load failed:', e.message); }
}

// Router
const pages = ['dashboard', 'inventory', 'printers', 'clients', 'jobs', 'config'];
const pageLoaders = {};

function navigate(page) {
  if (!pages.includes(page)) page = 'dashboard';
  // Workers can't access config
  if (page === 'config' && currentUser?.role === 'worker') { page = 'dashboard'; }
  // Stop printer live polling when leaving printers page
  if (page !== 'printers' && window.prStopLive) window.prStopLive();
  pages.forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('hidden', p !== page);
  });
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  if (pageLoaders[page]) pageLoaders[page]();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const page = el.dataset.page;
    window.location.hash = page;
    navigate(page);
  });
});

function handleRoute() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigate(hash);
}

async function startup() {
  const ok = await checkAuth();
  if (!ok) return;
  await loadConfig();
  if (appConfig.theme_color) applyTheme(appConfig.theme_color);
  handleRoute();
}

window.addEventListener('hashchange', () => { if (currentUser) handleRoute(); });
window.addEventListener('load', startup);

// Global config store
let appConfig = {};

// Global API helper
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Toast
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// Modal
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// Confirm modal
function confirmModal(msg, onYes, icon = '⚠️') {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-icon').textContent = icon;
  const overlay = document.getElementById('confirm-overlay');
  overlay.classList.remove('hidden');
  const btn = document.getElementById('confirm-yes-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    closeConfirm();
    onYes();
  });
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.add('hidden');
}

document.getElementById('confirm-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeConfirm();
});

// Format currency (dynamic)
function fmtMoney(v) {
  if (v == null || v === '') return '-';
  const sym = appConfig.simbolo_moneda || '$';
  const cur = appConfig.moneda || 'CAD';
  return `${sym}${parseFloat(v).toFixed(2)} ${cur}`;
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

// Color name to hex approximation
function colorHex(name) {
  const map = {
    negro: '#222', blanco: '#eee', gris: '#888', azul: '#3b82f6',
    verde: '#22c55e', rojo: '#ef4444', amarillo: '#fbbf24', naranja: '#f97316',
    morado: '#a855f7', rosa: '#ec4899', cyan: '#06b6d4', cafe: '#92400e',
  };
  return map[(name || '').toLowerCase()] || '#6c63ff';
}

// Pagination helper
function paginate(data, page, perPage = 10) {
  const totalPages = Math.max(1, Math.ceil(data.length / perPage));
  const p = Math.min(Math.max(1, page), totalPages);
  const items = data.slice((p - 1) * perPage, p * perPage);
  return { items, totalPages, page: p };
}

// Render pagination controls
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

// Load app config from API
async function loadConfig() {
  try {
    const cfg = await api('GET', '/api/config');
    if (Array.isArray(cfg)) {
      cfg.forEach(row => { appConfig[row.key] = row.value; });
    } else {
      appConfig = cfg;
    }
  } catch (e) {
    console.warn('Could not load config:', e.message);
  }
}

// Router
const pages = ['dashboard', 'inventory', 'printers', 'clients', 'jobs', 'config'];
const pageLoaders = {};

function navigate(page) {
  if (!pages.includes(page)) page = 'dashboard';
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

window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', async () => {
  await loadConfig();
  handleRoute();
});

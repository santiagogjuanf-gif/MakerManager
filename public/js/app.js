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

// Format currency
function fmtCAD(v) {
  if (v == null || v === '') return '-';
  return `$${parseFloat(v).toFixed(2)} CAD`;
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

// Router
const pages = ['dashboard', 'filaments', 'printers', 'clients', 'jobs', 'config'];
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
window.addEventListener('load', handleRoute);

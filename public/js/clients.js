(function () {
  let allClients = [];
  let clPage = 1, clSearch = '';

  pageLoaders['clients'] = async function loadClients() {
    const el = document.getElementById('page-clients');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Clientes</div>
          <div class="page-subtitle">Gestión de clientes</div>
        </div>
        <button class="btn btn-primary" onclick="clOpenForm()">＋ Nuevo Cliente</button>
      </div>
      <div style="margin-bottom:16px">
        <input class="search-input form-control" style="width:300px;max-width:100%" placeholder="Buscar cliente..." oninput="clSearch2(this.value)" autocomplete="off">
      </div>
      <div id="cl-grid"></div>
      <div class="pagination" id="cl-pagination"></div>`;

    await refreshClients();
  };

  async function refreshClients() {
    try { allClients = await api('GET', '/api/clients'); } catch (e) { allClients = []; }
    clPage = 1;
    renderClients();
  }

  function classBadge(cls) {
    const c = (cls || 'nuevo').toLowerCase();
    const badgeClass = c === 'vip' ? 'badge-vip'
      : c === 'frecuente' ? 'badge-frecuente'
      : c === 'regular' ? 'badge-regular'
      : 'badge-default';
    return `<span class="badge ${badgeClass}">${cls || 'Nuevo'}</span>`;
  }

  function renderPaginationInline(containerId, current, total, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container || total <= 1) { if (container) container.innerHTML = ''; return; }
    container.innerHTML = '';
    function makeBtn(label, page, disabled, active) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (active ? ' active' : '');
      btn.textContent = label;
      btn.disabled = disabled;
      if (!disabled) btn.addEventListener('click', () => onPageChange(page));
      container.appendChild(btn);
    }
    makeBtn('‹', current - 1, current === 1, false);
    for (let i = 1; i <= total; i++) {
      if (total > 7 && i > 2 && i < total - 1 && Math.abs(i - current) > 1) {
        if (i === 3 || i === total - 2) { const sp = document.createElement('span'); sp.className = 'page-info'; sp.textContent = '…'; container.appendChild(sp); }
        continue;
      }
      makeBtn(String(i), i, false, i === current);
    }
    makeBtn('›', current + 1, current === total, false);
  }

  function renderClients() {
    const q = clSearch.toLowerCase();
    const filtered = allClients.filter(c =>
      `${c.nombre} ${c.telefono} ${c.email} ${c.clasificacion}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, clPage);
    clPage = page;

    const grid = document.getElementById('cl-grid');
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div>Sin clientes</div>';
    } else {
      grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
        ${items.map(c => `
          <div class="printer-card" onclick="clView(${c.id})" style="cursor:pointer">
            <div class="printer-card-body">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                ${classBadge(c.clasificacion)}
              </div>
              <div class="printer-card-name" style="font-size:17px;margin-bottom:6px">${c.nombre || '-'}</div>
              <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
                ${c.telefono ? `<div style="font-size:13px;color:var(--text-muted)">📞 ${c.telefono}</div>` : ''}
                ${c.email ? `<div style="font-size:13px;color:var(--text-muted)">✉️ ${c.email}</div>` : ''}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
                <span style="font-size:12px;color:var(--text-muted)">${c.total_pedidos || 0} pedido${(c.total_pedidos || 0) !== 1 ? 's' : ''}</span>
                <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
                  <button class="btn btn-secondary btn-sm" onclick="clEdit(${c.id})">✏️</button>
                  <button class="btn btn-danger btn-sm" onclick="clDelete(${c.id})">🗑️</button>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
    }

    renderPaginationInline('cl-pagination', clPage, totalPages, (p) => { clPage = p; renderClients(); });
  }

  window.clSearch2 = function (q) { clSearch = q; clPage = 1; renderClients(); };

  window.clView = async function (id) {
    const c = allClients.find(x => x.id === id) || {};
    let jobs = [], totals = { total: 0, gastado: 0 };
    try {
      const r = await api('GET', `/api/clients/${id}/jobs`);
      jobs = r.jobs || [];
      totals = r.totals || totals;
    } catch {}

    const STAGE_COLORS = { 'Solicitud':'#6366f1','Levantamiento':'#f59e0b','Producción':'#3b82f6','Cierre':'#22c55e' };

    const jobRows = jobs.length === 0
      ? `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0">Sin pedidos registrados</div>`
      : jobs.map(j => {
          const sc = STAGE_COLORS[j.estado] || 'var(--accent)';
          return `<div onclick="dashOpenJob(${j.id})" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='transparent'">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${j.nombre_proyecto||'Sin nombre'}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${j.fecha||'-'} ${j.impresora?`· 🖨️ ${j.impresora}`:''}</div>
            </div>
            <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:${sc}22;color:${sc};white-space:nowrap">${j.estado}</span>
            <span style="font-size:13px;font-weight:800;color:var(--accent-light);white-space:nowrap">${fmtMoney(j.precio_final)}</span>
          </div>`;
        }).join('');

    openModal(`👤 ${c.nombre || 'Cliente'}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div style="background:var(--surface);border-radius:12px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;margin-bottom:10px">DATOS DE CONTACTO</div>
          ${c.telefono ? `<div style="font-size:13px;margin-bottom:6px">📞 ${c.telefono}</div>` : ''}
          ${c.email ? `<div style="font-size:13px;margin-bottom:6px">✉️ ${c.email}</div>` : ''}
          ${c.direccion ? `<div style="font-size:13px;margin-bottom:6px">📍 ${c.direccion}</div>` : ''}
          ${!c.telefono && !c.email && !c.direccion ? `<div style="color:var(--text-muted);font-size:12px">—</div>` : ''}
          ${c.notas ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;border-top:1px solid var(--border);padding-top:8px">${c.notas}</div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:var(--accent)">${totals.total||0}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Pedidos</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center">
            <div style="font-size:16px;font-weight:800;color:#22c55e">${fmtMoney(totals.gastado||0)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Total gastado</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;grid-column:span 2">
            ${classBadge(c.clasificacion)}
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Clasificación${c.clasificacion_manual?` (manual)`:''}</div>
          </div>
        </div>
      </div>

      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;margin-bottom:8px">📋 HISTORIAL DE PEDIDOS</div>
        <div style="max-height:260px;overflow-y:auto">${jobRows}</div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-danger btn-sm" onclick="clDelete(${id})">🗑️ Eliminar</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="clEdit(${id})">✏️ Editar</button>
      </div>
    `);
  };

  window.clOpenForm = function (id) {
    const c = id ? (allClients.find(x => x.id === id) || {}) : {};
    openModal(id ? 'Editar Cliente' : 'Nuevo Cliente', `
      <form id="cl-form" onsubmit="clSave(event, ${id || 'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Nombre *</label><input class="form-control" name="nombre" value="${c.nombre || ''}" required autocomplete="off"></div>
          <div class="form-group"><label>Teléfono</label><input class="form-control" name="telefono" value="${c.telefono || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Email</label><input class="form-control" name="email" type="email" value="${c.email || ''}" autocomplete="off"></div>
          <div class="form-group form-full"><label>Dirección</label><input class="form-control" name="direccion" value="${c.direccion || ''}" autocomplete="off"></div>
          <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2" autocomplete="off">${c.notas || ''}</textarea></div>
          <div class="form-group form-full">
            <label>
              <input type="checkbox" id="cl-manual-chk" ${c.clasificacion_manual ? 'checked' : ''} onchange="clToggleManual(this.checked)" autocomplete="off">
              Clasificación manual
            </label>
          </div>
          <div class="form-group form-full" id="cl-manual-field" style="${c.clasificacion_manual ? '' : 'display:none'}">
            <label>Clasificación</label>
            <select class="form-control" name="clasificacion">
              ${['Nuevo','Regular','Frecuente','VIP'].map(cl => `<option ${c.clasificacion===cl?'selected':''}>${cl}</option>`).join('')}
            </select>
            <input type="hidden" name="clasificacion_manual" id="cl-manual-val" value="${c.clasificacion_manual ? '1' : '0'}" autocomplete="off">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
  };

  window.clToggleManual = function (checked) {
    const field = document.getElementById('cl-manual-field');
    const val = document.getElementById('cl-manual-val');
    if (field) field.style.display = checked ? '' : 'none';
    if (val) val.value = checked ? '1' : '0';
  };

  window.clSave = async function (e, id) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    if (!body.clasificacion_manual || body.clasificacion_manual === '0') {
      delete body.clasificacion;
      body.clasificacion_manual = '0';
    }
    try {
      if (id) await api('PUT', `/api/clients/${id}`, body);
      else await api('POST', '/api/clients', body);
      closeModal(); showToast(id ? 'Cliente actualizado' : 'Cliente agregado');
      await refreshClients();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.clEdit = function (id) { clOpenForm(id); };
  window.clDelete = function (id) {
    const c = allClients.find(x => x.id === id);
    confirmModal(`¿Eliminar cliente "${c?.nombre}"?`, async () => {
      try { await api('DELETE', `/api/clients/${id}`); showToast('Cliente eliminado'); await refreshClients(); }
      catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };
})();

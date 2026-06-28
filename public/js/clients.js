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

  window.clView = function (id) { clOpenForm(id); };

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

// Inventory page: 4 tabs (Filamentos, Resinas, Láser, CNC)
(function () {
  let allFilaments = [], allResinas = [], allLaser = [], allCNC = [];
  let filPage = 1, resinPage = 1, laserPage = 1, cncPage = 1;
  let filSearch = '', resinSearch = '', laserSearch = '', cncSearch = '';
  let activeTab = 'filamentos';

  pageLoaders['inventory'] = async function loadInventory() {
    const el = document.getElementById('page-inventory');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Inventario</div>
          <div class="page-subtitle">Filamentos, resinas y consumibles</div>
        </div>
      </div>
      <div class="tabs" id="inv-tabs">
        <button class="tab-btn active" data-tab="filamentos">🧵 Filamentos</button>
        <button class="tab-btn" data-tab="resinas">🫙 Resinas</button>
        <button class="tab-btn" data-tab="laser">🔥 Láser</button>
        <button class="tab-btn" data-tab="cnc">🔩 CNC</button>
      </div>
      <div id="inv-tab-filamentos" class="inv-tab"></div>
      <div id="inv-tab-resinas" class="inv-tab hidden"></div>
      <div id="inv-tab-laser" class="inv-tab hidden"></div>
      <div id="inv-tab-cnc" class="inv-tab hidden"></div>`;

    document.querySelectorAll('#inv-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#inv-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.inv-tab').forEach(t => t.classList.add('hidden'));
        activeTab = btn.dataset.tab;
        document.getElementById(`inv-tab-${activeTab}`).classList.remove('hidden');
      });
    });

    await Promise.all([
      refreshFilaments(),
      refreshResinas(),
      refreshLaser(),
      refreshCNC()
    ]);
  };

  // ===================== FILAMENTOS =====================
  async function refreshFilaments() {
    try {
      allFilaments = await api('GET', '/api/filaments');
    } catch (e) { allFilaments = []; }
    filPage = 1;
    renderFilaments();
  }

  function renderFilaments() {
    const q = filSearch.toLowerCase();
    const filtered = allFilaments.filter(f =>
      `${f.marca} ${f.nombre_comercial} ${f.material} ${f.color}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, filPage);
    filPage = page;

    const rows = items.length ? items.map(f => {
      const pct = f.peso_inicial_g > 0 ? Math.round((f.peso_actual_g / f.peso_inicial_g) * 100) : 0;
      const pctColor = pct < 20 ? 'var(--danger)' : pct < 40 ? 'var(--warning)' : 'var(--success)';
      return `<tr>
        <td><strong>${f.marca || '-'}</strong><br><small style="color:var(--text-muted)">${f.nombre_comercial || ''}</small></td>
        <td>${materialBadge(f.material)} <span class="color-dot" style="background:${colorHex(f.color)}"></span>${f.color || '-'}</td>
        <td>${fmtNum(f.peso_actual_g, 0)}g
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${pctColor}"></div></div>
        </td>
        <td>${pct}%</td>
        <td>${fmtMoney(f.costo_por_gramo)}/g</td>
        <td class="actions">
          <button class="btn btn-secondary btn-sm" onclick="invEditFilament(${f.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="invDeleteFilament(${f.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🧵</div>Sin filamentos</td></tr>';

    document.getElementById('inv-tab-filamentos').innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:220px" placeholder="Buscar filamento..." value="${filSearch}"
            oninput="invSearchFil(this.value)">
          <button class="btn btn-primary" onclick="invOpenFilamentForm()">＋ Agregar</button>
        </div>
        <table>
          <thead><tr><th>Marca</th><th>Color / Material</th><th>Peso actual</th><th>%</th><th>Costo/g</th><th>Acciones</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pagination" id="fil-pagination"></div>
      </div>`;

    if (totalPages > 1) {
      const onPage = (p) => { filPage = p; renderFilaments(); };
      renderPaginationInline('fil-pagination', filPage, totalPages, onPage);
    }
  }

  window.invSearchFil = function (q) { filSearch = q; filPage = 1; renderFilaments(); };

  window.invOpenFilamentForm = async function (id) {
    let f = {};
    if (id) {
      try { f = allFilaments.find(x => x.id === id) || {}; } catch (e) {}
    }
    const title = id ? 'Editar Filamento' : 'Nuevo Filamento';
    openModal(title, `
      <form id="fil-form" onsubmit="invSaveFilament(event, ${id || 'null'})">
        <div class="form-grid">
          <div class="form-group">
            <label>Marca *</label>
            <input class="form-control" name="marca" value="${f.marca || ''}" required>
          </div>
          <div class="form-group">
            <label>Nombre comercial</label>
            <input class="form-control" name="nombre_comercial" value="${f.nombre_comercial || ''}">
          </div>
          <div class="form-group">
            <label>Material</label>
            <select class="form-control" name="material">
              ${['PLA','PETG','ABS','TPU','ASA','Nylon','PC','HIPS'].map(m => `<option ${f.material===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Color</label>
            <input class="form-control" name="color" value="${f.color || ''}">
          </div>
          <div class="form-group">
            <label>Acabado</label>
            <select class="form-control" name="acabado">
              ${['Mate','Brillante','Seda','Transparente'].map(a => `<option ${f.acabado===a?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Diámetro (mm)</label>
            <input class="form-control" name="diametro_mm" type="number" step="0.01" value="${f.diametro_mm || 1.75}">
          </div>
          <div class="form-group">
            <label>Peso inicial (g)</label>
            <input class="form-control" name="peso_inicial_g" type="number" value="${f.peso_inicial_g || 1000}" id="fil-peso-inicial" oninput="invCalcCostG()">
          </div>
          <div class="form-group">
            <label>Peso actual (g)</label>
            <input class="form-control" name="peso_actual_g" type="number" value="${f.peso_actual_g || 1000}">
          </div>
          <div class="form-group">
            <label>Peso bobina vacía (g)</label>
            <input class="form-control" name="peso_bobina_vacia_g" type="number" value="${f.peso_bobina_vacia_g || 200}" id="fil-peso-bobina" oninput="invCalcCostG()">
          </div>
          <div class="form-group">
            <label>Costo total</label>
            <input class="form-control" name="costo_total" type="number" step="0.01" value="${f.costo_total || ''}" id="fil-costo-total" oninput="invCalcCostG()">
          </div>
          <div class="form-group">
            <label>Costo/g (auto)</label>
            <input class="form-control" name="costo_por_gramo" type="number" step="0.0001" id="fil-cpg" value="${f.costo_por_gramo || ''}" placeholder="Se calcula solo">
          </div>
          <div class="form-group">
            <label>Proveedor</label>
            <input class="form-control" name="proveedor" value="${f.proveedor || ''}">
          </div>
          <div class="form-group form-full">
            <label>Notas</label>
            <textarea class="form-control" name="notas" rows="2">${f.notas || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
  };

  window.invCalcCostG = function () {
    const pi = parseFloat(document.getElementById('fil-peso-inicial')?.value || 0);
    const pb = parseFloat(document.getElementById('fil-peso-bobina')?.value || 0);
    const ct = parseFloat(document.getElementById('fil-costo-total')?.value || 0);
    const net = pi - pb;
    const cpg = document.getElementById('fil-cpg');
    if (cpg && net > 0 && ct > 0) cpg.value = (ct / net).toFixed(4);
  };

  window.invSaveFilament = async function (e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      if (id) await api('PUT', `/api/filaments/${id}`, body);
      else await api('POST', '/api/filaments', body);
      closeModal();
      showToast(id ? 'Filamento actualizado' : 'Filamento agregado');
      await refreshFilaments();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.invEditFilament = function (id) { invOpenFilamentForm(id); };

  window.invDeleteFilament = function (id) {
    const f = allFilaments.find(x => x.id === id);
    confirmModal(`¿Eliminar filamento "${f?.marca} ${f?.nombre_comercial || ''}"?`, async () => {
      try {
        await api('DELETE', `/api/filaments/${id}`);
        showToast('Filamento eliminado');
        await refreshFilaments();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };

  // ===================== RESINAS =====================
  async function refreshResinas() {
    try { allResinas = await api('GET', '/api/resinas'); } catch (e) { allResinas = []; }
    resinPage = 1;
    renderResinas();
  }

  function renderResinas() {
    const q = resinSearch.toLowerCase();
    const filtered = allResinas.filter(r =>
      `${r.marca} ${r.nombre_comercial} ${r.tipo} ${r.color}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, resinPage);
    resinPage = page;

    const rows = items.length ? items.map(r => `<tr>
      <td><strong>${r.marca || '-'}</strong><br><small style="color:var(--text-muted)">${r.nombre_comercial || ''}</small></td>
      <td><span class="badge badge-default">${r.tipo || '-'}</span></td>
      <td><span class="color-dot" style="background:${colorHex(r.color)}"></span>${r.color || '-'}</td>
      <td>${fmtNum(r.volumen_actual_ml, 0)} ml</td>
      <td>${fmtMoney(r.costo_por_ml)}/ml</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="invEditResina(${r.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="invDeleteResina(${r.id})">🗑️</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🫙</div>Sin resinas</td></tr>';

    document.getElementById('inv-tab-resinas').innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:220px" placeholder="Buscar resina..." value="${resinSearch}"
            oninput="invSearchResin(this.value)">
          <button class="btn btn-primary" onclick="invOpenResinaForm()">＋ Agregar</button>
        </div>
        <table>
          <thead><tr><th>Marca</th><th>Tipo</th><th>Color</th><th>Volumen actual</th><th>Costo/ml</th><th>Acciones</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pagination" id="resin-pagination"></div>
      </div>`;

    if (totalPages > 1) renderPaginationInline('resin-pagination', resinPage, totalPages, (p) => { resinPage = p; renderResinas(); });
  }

  window.invSearchResin = function (q) { resinSearch = q; resinPage = 1; renderResinas(); };

  window.invOpenResinaForm = async function (id) {
    const r = id ? (allResinas.find(x => x.id === id) || {}) : {};
    openModal(id ? 'Editar Resina' : 'Nueva Resina', `
      <form id="resin-form" onsubmit="invSaveResina(event, ${id || 'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Marca *</label><input class="form-control" name="marca" value="${r.marca || ''}" required></div>
          <div class="form-group"><label>Nombre comercial</label><input class="form-control" name="nombre_comercial" value="${r.nombre_comercial || ''}"></div>
          <div class="form-group"><label>Tipo</label>
            <select class="form-control" name="tipo">
              ${['Estándar','Flexible','ABS-Like','Water-Washable','Dental','Castable'].map(t => `<option ${r.tipo===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Color</label><input class="form-control" name="color" value="${r.color || ''}"></div>
          <div class="form-group"><label>Volumen total (ml)</label><input class="form-control" name="volumen_ml" type="number" value="${r.volumen_ml || 1000}" id="resin-vol" oninput="invCalcCostMl()"></div>
          <div class="form-group"><label>Volumen actual (ml)</label><input class="form-control" name="volumen_actual_ml" type="number" value="${r.volumen_actual_ml || 1000}"></div>
          <div class="form-group"><label>Costo total</label><input class="form-control" name="costo_total" type="number" step="0.01" value="${r.costo_total || ''}" id="resin-costo" oninput="invCalcCostMl()"></div>
          <div class="form-group"><label>Costo/ml (auto)</label><input class="form-control" name="costo_por_ml" type="number" step="0.0001" id="resin-cpm" value="${r.costo_por_ml || ''}"></div>
          <div class="form-group"><label>Proveedor</label><input class="form-control" name="proveedor" value="${r.proveedor || ''}"></div>
          <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${r.notas || ''}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
  };

  window.invCalcCostMl = function () {
    const vol = parseFloat(document.getElementById('resin-vol')?.value || 0);
    const costo = parseFloat(document.getElementById('resin-costo')?.value || 0);
    const cpm = document.getElementById('resin-cpm');
    if (cpm && vol > 0 && costo > 0) cpm.value = (costo / vol).toFixed(4);
  };

  window.invSaveResina = async function (e, id) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (id) await api('PUT', `/api/resinas/${id}`, body);
      else await api('POST', '/api/resinas', body);
      closeModal(); showToast(id ? 'Resina actualizada' : 'Resina agregada');
      await refreshResinas();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.invEditResina = function (id) { invOpenResinaForm(id); };
  window.invDeleteResina = function (id) {
    const r = allResinas.find(x => x.id === id);
    confirmModal(`¿Eliminar resina "${r?.marca} ${r?.nombre_comercial || ''}"?`, async () => {
      try { await api('DELETE', `/api/resinas/${id}`); showToast('Resina eliminada'); await refreshResinas(); }
      catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };

  // ===================== LÁSER =====================
  async function refreshLaser() {
    try { allLaser = await api('GET', '/api/laser'); } catch (e) { allLaser = []; }
    laserPage = 1;
    renderLaser();
  }

  function renderLaser() {
    const q = laserSearch.toLowerCase();
    const filtered = allLaser.filter(c =>
      `${c.nombre} ${c.material} ${c.dimensiones}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, laserPage);
    laserPage = page;

    const rows = items.length ? items.map(c => `<tr>
      <td><strong>${c.nombre || '-'}</strong></td>
      <td>${c.material || '-'}</td>
      <td>${c.dimensiones || '-'}</td>
      <td>${fmtNum(c.cantidad, 0)} ${c.unidad || 'pcs'}</td>
      <td>${fmtMoney(c.costo_unitario)}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="invEditLaser(${c.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="invDeleteLaser(${c.id})">🗑️</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🔥</div>Sin consumibles láser</td></tr>';

    document.getElementById('inv-tab-laser').innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:220px" placeholder="Buscar consumible..." value="${laserSearch}"
            oninput="invSearchLaser(this.value)">
          <button class="btn btn-primary" onclick="invOpenLaserForm()">＋ Agregar</button>
        </div>
        <table>
          <thead><tr><th>Nombre</th><th>Material</th><th>Dimensiones</th><th>Cantidad</th><th>Costo unit.</th><th>Acciones</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pagination" id="laser-pagination"></div>
      </div>`;

    if (totalPages > 1) renderPaginationInline('laser-pagination', laserPage, totalPages, (p) => { laserPage = p; renderLaser(); });
  }

  window.invSearchLaser = function (q) { laserSearch = q; laserPage = 1; renderLaser(); };

  function consumibleForm(data, submitFn) {
    const c = data || {};
    return `
      <div class="form-grid">
        <div class="form-group"><label>Nombre *</label><input class="form-control" name="nombre" value="${c.nombre || ''}" required></div>
        <div class="form-group"><label>Material</label><input class="form-control" name="material" value="${c.material || ''}"></div>
        <div class="form-group"><label>Dimensiones</label><input class="form-control" name="dimensiones" value="${c.dimensiones || ''}"></div>
        <div class="form-group"><label>Cantidad</label><input class="form-control" name="cantidad" type="number" value="${c.cantidad || 0}"></div>
        <div class="form-group"><label>Unidad</label>
          <select class="form-control" name="unidad">
            ${['pcs','hojas','m','m²','kg'].map(u => `<option ${c.unidad===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Costo unitario</label><input class="form-control" name="costo_unitario" type="number" step="0.01" value="${c.costo_unitario || ''}"></div>
        <div class="form-group"><label>Proveedor</label><input class="form-control" name="proveedor" value="${c.proveedor || ''}"></div>
        <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${c.notas || ''}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>`;
  }

  window.invOpenLaserForm = function (id) {
    const c = id ? (allLaser.find(x => x.id === id) || {}) : {};
    openModal(id ? 'Editar Consumible Láser' : 'Nuevo Consumible Láser',
      `<form onsubmit="invSaveLaser(event, ${id || 'null'})">${consumibleForm(c)}</form>`);
  };

  window.invSaveLaser = async function (e, id) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (id) await api('PUT', `/api/laser/${id}`, body);
      else await api('POST', '/api/laser', body);
      closeModal(); showToast('Consumible láser guardado');
      await refreshLaser();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.invEditLaser = function (id) { invOpenLaserForm(id); };
  window.invDeleteLaser = function (id) {
    const c = allLaser.find(x => x.id === id);
    confirmModal(`¿Eliminar "${c?.nombre}"?`, async () => {
      try { await api('DELETE', `/api/laser/${id}`); showToast('Eliminado'); await refreshLaser(); }
      catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };

  // ===================== CNC =====================
  async function refreshCNC() {
    try { allCNC = await api('GET', '/api/cnc'); } catch (e) { allCNC = []; }
    cncPage = 1;
    renderCNC();
  }

  function renderCNC() {
    const q = cncSearch.toLowerCase();
    const filtered = allCNC.filter(c =>
      `${c.nombre} ${c.material} ${c.dimensiones}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, cncPage);
    cncPage = page;

    const rows = items.length ? items.map(c => `<tr>
      <td><strong>${c.nombre || '-'}</strong></td>
      <td>${c.material || '-'}</td>
      <td>${c.dimensiones || '-'}</td>
      <td>${fmtNum(c.cantidad, 0)} ${c.unidad || 'pcs'}</td>
      <td>${fmtMoney(c.costo_unitario)}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="invEditCNC(${c.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="invDeleteCNC(${c.id})">🗑️</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🔩</div>Sin consumibles CNC</td></tr>';

    document.getElementById('inv-tab-cnc').innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:220px" placeholder="Buscar consumible..." value="${cncSearch}"
            oninput="invSearchCNC(this.value)">
          <button class="btn btn-primary" onclick="invOpenCNCForm()">＋ Agregar</button>
        </div>
        <table>
          <thead><tr><th>Nombre</th><th>Material</th><th>Dimensiones</th><th>Cantidad</th><th>Costo unit.</th><th>Acciones</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pagination" id="cnc-pagination"></div>
      </div>`;

    if (totalPages > 1) renderPaginationInline('cnc-pagination', cncPage, totalPages, (p) => { cncPage = p; renderCNC(); });
  }

  window.invSearchCNC = function (q) { cncSearch = q; cncPage = 1; renderCNC(); };

  window.invOpenCNCForm = function (id) {
    const c = id ? (allCNC.find(x => x.id === id) || {}) : {};
    openModal(id ? 'Editar Consumible CNC' : 'Nuevo Consumible CNC',
      `<form onsubmit="invSaveCNC(event, ${id || 'null'})">${consumibleForm(c)}</form>`);
  };

  window.invSaveCNC = async function (e, id) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (id) await api('PUT', `/api/cnc/${id}`, body);
      else await api('POST', '/api/cnc', body);
      closeModal(); showToast('Consumible CNC guardado');
      await refreshCNC();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.invEditCNC = function (id) { invOpenCNCForm(id); };
  window.invDeleteCNC = function (id) {
    const c = allCNC.find(x => x.id === id);
    confirmModal(`¿Eliminar "${c?.nombre}"?`, async () => {
      try { await api('DELETE', `/api/cnc/${id}`); showToast('Eliminado'); await refreshCNC(); }
      catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };

  // Inline pagination renderer (uses closures, not string-encoded callbacks)
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
        if (i === 3 || i === total - 2) {
          const sp = document.createElement('span');
          sp.className = 'page-info'; sp.textContent = '…';
          container.appendChild(sp);
        }
        continue;
      }
      makeBtn(String(i), i, false, i === current);
    }
    makeBtn('›', current + 1, current === total, false);
  }
})();

// Inventory page — dynamic tabs based on registered printer types
(function () {
  let allFilaments = [], allResinas = [], allLaser = [], allCNC = [];
  let allExternos = [], allInternos = [];
  let filPage = 1, resinPage = 1, laserPage = 1, cncPage = 1, extPage = 1, intPage = 1;
  let filSearch = '', resinSearch = '', laserSearch = '', cncSearch = '', extSearch = '', intSearch = '';
  let activeTab = 'externos';

  pageLoaders['inventory'] = async function loadInventory() {
    const el = document.getElementById('page-inventory');
    el.innerHTML = `<div class="page-header"><div><div class="page-title">Inventario</div><div class="page-subtitle">Consumibles y materiales</div></div></div><div id="inv-tabs-wrap"><p style="color:var(--text-muted)">Cargando...</p></div>`;

    // Determine which tabs to show
    const [printers, filaments, resinas, laser, cnc] = await Promise.all([
      api('GET', '/api/printers').catch(() => []),
      api('GET', '/api/filaments').catch(() => []),
      api('GET', '/api/resinas').catch(() => []),
      api('GET', '/api/laser').catch(() => []),
      api('GET', '/api/cnc').catch(() => []),
    ]);
    allFilaments = filaments; allResinas = resinas; allLaser = laser; allCNC = cnc;

    const tipos = new Set(printers.map(p => p.tipo));
    const tabs = [
      { id: 'externos', label: '📦 Externos', always: true },
      { id: 'internos', label: '🧴 Internos', always: true },
      { id: 'filamentos', label: '🧵 Filamentos', show: tipos.has('FDM') || filaments.length > 0 },
      { id: 'resinas',    label: '🫙 Resinas',    show: tipos.has('Resina') || resinas.length > 0 },
      { id: 'laser',      label: '🔥 Láser',      show: tipos.has('Laser') || laser.length > 0 },
      { id: 'cnc',        label: '🔩 CNC',        show: tipos.has('CNC') || cnc.length > 0 },
    ].filter(t => t.always || t.show);

    if (!tabs.find(t => t.id === activeTab)) activeTab = tabs[0].id;

    document.getElementById('inv-tabs-wrap').innerHTML = `
      <div class="tabs" id="inv-tabs">
        ${tabs.map(t => `<button class="tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      ${tabs.map(t => `<div id="inv-tab-${t.id}" class="inv-tab ${t.id === activeTab ? '' : 'hidden'}"></div>`).join('')}`;

    document.querySelectorAll('#inv-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#inv-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.inv-tab').forEach(t => t.classList.add('hidden'));
        activeTab = btn.dataset.tab;
        document.getElementById(`inv-tab-${activeTab}`)?.classList.remove('hidden');
      });
    });

    await Promise.all([
      refreshExternos(),
      refreshInternos(),
      tabs.find(t=>t.id==='filamentos') ? renderFilaments() : Promise.resolve(),
      tabs.find(t=>t.id==='resinas') ? refreshResinas() : Promise.resolve(),
      tabs.find(t=>t.id==='laser') ? refreshLaser() : Promise.resolve(),
      tabs.find(t=>t.id==='cnc') ? refreshCNC() : Promise.resolve(),
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
            oninput="invSearchFil(this.value)" autocomplete="off">
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
            <input class="form-control" name="marca" value="${f.marca || ''}" required autocomplete="off">
          </div>
          <div class="form-group">
            <label>Nombre comercial</label>
            <input class="form-control" name="nombre_comercial" value="${f.nombre_comercial || ''}" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Material</label>
            <select class="form-control" name="material">
              ${['PLA','PETG','ABS','TPU','ASA','Nylon','PC','HIPS'].map(m => `<option ${f.material===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Color</label>
            <input class="form-control" name="color" value="${f.color || ''}" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Acabado</label>
            <select class="form-control" name="acabado">
              ${['Mate','Brillante','Seda','Transparente'].map(a => `<option ${f.acabado===a?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Diámetro (mm)</label>
            <input class="form-control" name="diametro_mm" type="number" step="0.01" value="${f.diametro_mm || 1.75}" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Peso inicial (g)</label>
            <input class="form-control" name="peso_inicial_g" type="number" value="${f.peso_inicial_g || 1000}" id="fil-peso-inicial" oninput="invCalcCostG()" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Peso actual (g)</label>
            <input class="form-control" name="peso_actual_g" type="number" value="${f.peso_actual_g || 1000}" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Peso bobina vacía (g)</label>
            <input class="form-control" name="peso_bobina_vacia_g" type="number" value="${f.peso_bobina_vacia_g || 200}" id="fil-peso-bobina" oninput="invCalcCostG()" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Costo total</label>
            <input class="form-control" name="costo_total" type="number" step="0.01" value="${f.costo_total || ''}" id="fil-costo-total" oninput="invCalcCostG()" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Costo/g (auto)</label>
            <input class="form-control" name="costo_por_gramo" type="number" step="0.0001" id="fil-cpg" value="${f.costo_por_gramo || ''}" placeholder="Se calcula solo" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Proveedor</label>
            <input class="form-control" name="proveedor" value="${f.proveedor || ''}" autocomplete="off">
          </div>
          <div class="form-group form-full">
            <label>Notas</label>
            <textarea class="form-control" name="notas" rows="2" autocomplete="off">${f.notas || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
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
            oninput="invSearchResin(this.value)" autocomplete="off">
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
          <div class="form-group"><label>Marca *</label><input class="form-control" name="marca" value="${r.marca || ''}" required autocomplete="off"></div>
          <div class="form-group"><label>Nombre comercial</label><input class="form-control" name="nombre_comercial" value="${r.nombre_comercial || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Tipo</label>
            <select class="form-control" name="tipo">
              ${['Estándar','Flexible','ABS-Like','Water-Washable','Dental','Castable'].map(t => `<option ${r.tipo===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Color</label><input class="form-control" name="color" value="${r.color || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Volumen total (ml)</label><input class="form-control" name="volumen_ml" type="number" value="${r.volumen_ml || 1000}" id="resin-vol" oninput="invCalcCostMl()" autocomplete="off"></div>
          <div class="form-group"><label>Volumen actual (ml)</label><input class="form-control" name="volumen_actual_ml" type="number" value="${r.volumen_actual_ml || 1000}" autocomplete="off"></div>
          <div class="form-group"><label>Costo total</label><input class="form-control" name="costo_total" type="number" step="0.01" value="${r.costo_total || ''}" id="resin-costo" oninput="invCalcCostMl()" autocomplete="off"></div>
          <div class="form-group"><label>Costo/ml (auto)</label><input class="form-control" name="costo_por_ml" type="number" step="0.0001" id="resin-cpm" value="${r.costo_por_ml || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Proveedor</label><input class="form-control" name="proveedor" value="${r.proveedor || ''}" autocomplete="off"></div>
          <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2" autocomplete="off">${r.notas || ''}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
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
            oninput="invSearchLaser(this.value)" autocomplete="off">
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
        <div class="form-group"><label>Nombre *</label><input class="form-control" name="nombre" value="${c.nombre || ''}" required autocomplete="off"></div>
        <div class="form-group"><label>Material</label><input class="form-control" name="material" value="${c.material || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Dimensiones</label><input class="form-control" name="dimensiones" value="${c.dimensiones || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Cantidad</label><input class="form-control" name="cantidad" type="number" value="${c.cantidad || 0}" autocomplete="off"></div>
        <div class="form-group"><label>Unidad</label>
          <select class="form-control" name="unidad">
            ${['pcs','hojas','m','m²','kg'].map(u => `<option ${c.unidad===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Costo unitario</label><input class="form-control" name="costo_unitario" type="number" step="0.01" value="${c.costo_unitario || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Proveedor</label><input class="form-control" name="proveedor" value="${c.proveedor || ''}" autocomplete="off"></div>
        <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2" autocomplete="off">${c.notas || ''}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
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
            oninput="invSearchCNC(this.value)" autocomplete="off">
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

  // ===================== CONSUMIBLES EXTERNOS =====================
  async function refreshExternos() {
    try { allExternos = await api('GET', '/api/consumibles/externos'); } catch { allExternos = []; }
    extPage = 1; renderExternos();
  }

  function renderExternos() {
    const tab = document.getElementById('inv-tab-externos');
    if (!tab) return;
    const q = extSearch.toLowerCase();
    const filtered = allExternos.filter(c => `${c.nombre} ${c.categoria||''}`.toLowerCase().includes(q));
    const { items, totalPages, page } = paginate(filtered, extPage);
    extPage = page;
    const rows = items.length ? items.map(c => {
      const lowStock = c.stock_minimo > 0 && c.cantidad <= c.stock_minimo;
      return `<tr>
        <td><strong>${c.nombre}</strong>${lowStock ? ' <span class="badge badge-low">⚠️ Stock bajo</span>' : ''}</td>
        <td>${c.categoria || '-'}</td>
        <td>${fmtNum(c.cantidad, 2)} ${c.unidad}</td>
        <td>${fmtMoney(c.costo_unitario)}</td>
        <td>${fmtNum(c.stock_minimo, 0)} ${c.unidad}</td>
        <td class="actions">
          <button class="btn btn-secondary btn-sm" onclick="invEditExt(${c.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="invDeleteExt(${c.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">📦</div>Sin consumibles externos</td></tr>';

    tab.innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:220px" placeholder="Buscar..." value="${extSearch}" oninput="invSearchExt(this.value)" autocomplete="off">
          <button class="btn btn-primary" onclick="invOpenExtForm()">＋ Agregar</button>
        </div>
        <table>
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Cantidad</th><th>Costo unit.</th><th>Stock mín.</th><th>Acciones</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pagination" id="ext-pagination"></div>
      </div>`;
    renderPaginationInline('ext-pagination', extPage, totalPages, p => { extPage = p; renderExternos(); });
  }

  window.invSearchExt = function(q) { extSearch = q; extPage = 1; renderExternos(); };

  function consumibleForm(tipo, id, data = {}) {
    openModal(id ? `Editar ${tipo}` : `Nuevo ${tipo}`, `
      <form onsubmit="invSaveConsumible(event,'${tipo}',${id||'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Nombre *</label><input class="form-control" name="nombre" value="${data.nombre||''}" required autocomplete="off"></div>
          <div class="form-group"><label>Categoría</label><input class="form-control" name="categoria" value="${data.categoria||''}" autocomplete="off"></div>
          <div class="form-group"><label>Cantidad</label><input class="form-control" name="cantidad" type="number" step="0.01" value="${data.cantidad||0}" autocomplete="off"></div>
          <div class="form-group"><label>Unidad</label>
            <select class="form-control" name="unidad">
              ${['pcs','kg','L','m','hojas','rollo','bolsa'].map(u=>`<option ${(data.unidad||'pcs')===u?'selected':''}>${u}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Costo unitario</label><input class="form-control" name="costo_unitario" type="number" step="0.01" value="${data.costo_unitario||0}" autocomplete="off"></div>
          <div class="form-group"><label>Stock mínimo</label><input class="form-control" name="stock_minimo" type="number" step="0.01" value="${data.stock_minimo||0}" autocomplete="off"></div>
          <div class="form-group"><label>Proveedor</label><input class="form-control" name="proveedor" value="${data.proveedor||''}" autocomplete="off"></div>
          <div class="form-group form-full"><label>Notas</label><input class="form-control" name="notas" value="${data.notas||''}" autocomplete="off"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
  }

  window.invOpenExtForm = function(id) { consumibleForm('externo', id, id ? allExternos.find(x=>x.id===id)||{} : {}); };
  window.invEditExt = function(id) { invOpenExtForm(id); };
  window.invDeleteExt = function(id) {
    const c = allExternos.find(x=>x.id===id);
    confirmModal(`¿Eliminar "${c?.nombre}"?`, async () => {
      try { await api('DELETE', `/api/consumibles/externos/${id}`); showToast('Eliminado'); await refreshExternos(); }
      catch(e) { showToast('Error: '+e.message,'error'); }
    }, '🗑️');
  };

  // ===================== CONSUMIBLES INTERNOS =====================
  async function refreshInternos() {
    try { allInternos = await api('GET', '/api/consumibles/internos'); } catch { allInternos = []; }
    intPage = 1; renderInternos();
  }

  function renderInternos() {
    const tab = document.getElementById('inv-tab-internos');
    if (!tab) return;
    const q = intSearch.toLowerCase();
    const filtered = allInternos.filter(c => `${c.nombre} ${c.categoria||''}`.toLowerCase().includes(q));
    const { items, totalPages, page } = paginate(filtered, intPage);
    intPage = page;
    const rows = items.length ? items.map(c => {
      const lowStock = c.stock_minimo > 0 && c.cantidad <= c.stock_minimo;
      return `<tr>
        <td><strong>${c.nombre}</strong>${lowStock ? ' <span class="badge badge-low">⚠️ Stock bajo</span>' : ''}</td>
        <td>${c.categoria || '-'}</td>
        <td>${fmtNum(c.cantidad, 2)} ${c.unidad}</td>
        <td>${fmtMoney(c.costo_unitario)}</td>
        <td>${fmtNum(c.stock_minimo, 0)} ${c.unidad}</td>
        <td class="actions">
          <button class="btn btn-secondary btn-sm" onclick="invEditInt(${c.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="invDeleteInt(${c.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🧴</div>Sin consumibles internos</td></tr>';

    tab.innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:220px" placeholder="Buscar..." value="${intSearch}" oninput="invSearchInt(this.value)" autocomplete="off">
          <button class="btn btn-primary" onclick="invOpenIntForm()">＋ Agregar</button>
        </div>
        <table>
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Cantidad</th><th>Costo unit.</th><th>Stock mín.</th><th>Acciones</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pagination" id="int-pagination"></div>
      </div>`;
    renderPaginationInline('int-pagination', intPage, totalPages, p => { intPage = p; renderInternos(); });
  }

  window.invSearchInt = function(q) { intSearch = q; intPage = 1; renderInternos(); };
  window.invOpenIntForm = function(id) { consumibleForm('interno', id, id ? allInternos.find(x=>x.id===id)||{} : {}); };
  window.invEditInt = function(id) { invOpenIntForm(id); };
  window.invDeleteInt = function(id) {
    const c = allInternos.find(x=>x.id===id);
    confirmModal(`¿Eliminar "${c?.nombre}"?`, async () => {
      try { await api('DELETE', `/api/consumibles/internos/${id}`); showToast('Eliminado'); await refreshInternos(); }
      catch(e) { showToast('Error: '+e.message,'error'); }
    }, '🗑️');
  };

  window.invSaveConsumible = async function(e, tipo, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    for (const [k,v] of fd.entries()) body[k] = v;
    const endpoint = tipo === 'externo' ? 'externos' : 'internos';
    const refresh = tipo === 'externo' ? refreshExternos : refreshInternos;
    try {
      if (id) { await api('PUT', `/api/consumibles/${endpoint}/${id}`, body); }
      else { await api('POST', `/api/consumibles/${endpoint}`, body); }
      closeModal();
      showToast(id ? 'Actualizado' : 'Agregado');
      await refresh();
    } catch(err) { showToast('Error: '+err.message,'error'); }
  };
})();

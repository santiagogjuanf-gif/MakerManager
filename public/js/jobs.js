(function () {
  let allJobs = [], allClients = [], allPrinters = [], allFilaments = [];
  let jobPage = 1, jobSearch = '';

  // Time helpers
  function parseTime(str) {
    if (!str) return 0;
    const hm = String(str).match(/^(\d+):(\d+)h?$/);
    if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return Math.round(num * 60);
  }

  function formatTime(min) {
    min = parseInt(min) || 0;
    const h = Math.floor(min / 60), m = min % 60;
    return `${h}:${String(m).padStart(2, '0')}h`;
  }

  pageLoaders['jobs'] = async function loadJobs() {
    const el = document.getElementById('page-jobs');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Trabajos</div>
          <div class="page-subtitle">Historial de impresiones</div>
        </div>
        <button class="btn btn-primary" onclick="jobOpenForm()">＋ Nuevo Trabajo</button>
      </div>
      <div class="table-container">
        <div class="table-toolbar">
          <input class="search-input form-control" style="width:260px" placeholder="Buscar trabajo..." oninput="jobSearch2(this.value)">
        </div>
        <table>
          <thead><tr><th>#</th><th>Proyecto</th><th>Cliente</th><th>Fecha</th><th>Piezas</th><th>Precio final</th><th>Acciones</th></tr></thead>
          <tbody id="job-tbody"></tbody>
        </table>
        <div class="pagination" id="job-pagination"></div>
      </div>`;

    await refreshJobs();
  };

  async function refreshJobs() {
    try {
      [allJobs, allClients, allPrinters, allFilaments] = await Promise.all([
        api('GET', '/api/jobs'),
        api('GET', '/api/clients'),
        api('GET', '/api/printers'),
        api('GET', '/api/filaments'),
      ]);
    } catch (e) { allJobs = []; allClients = []; allPrinters = []; allFilaments = []; }
    jobPage = 1;
    renderJobs();
  }

  function renderJobs() {
    const q = jobSearch.toLowerCase();
    const filtered = allJobs.filter(j =>
      `${j.nombre_proyecto} ${j.cliente_nombre} ${j.id}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, jobPage);
    jobPage = page;

    const tbody = document.getElementById('job-tbody');
    if (!tbody) return;

    tbody.innerHTML = items.length ? items.map(j => {
      const multicolor = j.filament_count > 1 ? '<span class="badge badge-default" style="margin-left:4px">Multicolor</span>' : '';
      const fallo = j.fallo ? '<span class="badge badge-low" style="margin-left:4px">Falló</span>' : '';
      return `<tr>
        <td style="cursor:pointer;color:var(--accent-light)" onclick="jobView(${j.id})">#${j.id}</td>
        <td>${j.nombre_proyecto || '-'}${multicolor}${fallo}</td>
        <td>${j.cliente_nombre || '-'}</td>
        <td>${j.fecha ? j.fecha.substring(0,10) : '-'}</td>
        <td>${j.piezas || '-'}</td>
        <td><strong>${fmtMoney(j.precio_final)}</strong></td>
        <td class="actions">
          <button class="btn btn-secondary btn-sm" title="Ver" onclick="jobView(${j.id})">👁️</button>
          <button class="btn btn-secondary btn-sm" title="Editar" onclick="jobOpenForm(${j.id})">✏️</button>
          <button class="btn btn-success btn-sm" title="PDF cliente" onclick="jobPDF(${j.id},'cliente')">📄</button>
          <button class="btn btn-danger btn-sm" title="Eliminar" onclick="jobDelete(${j.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty-state"><div class="empty-state-icon">📋</div>Sin trabajos</td></tr>';

    renderPaginationInline('job-pagination', jobPage, totalPages, (p) => { jobPage = p; renderJobs(); });
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

  window.jobSearch2 = function (q) { jobSearch = q; jobPage = 1; renderJobs(); };

  window.jobView = async function (id) {
    try {
      const j = await api('GET', `/api/jobs/${id}`);
      const filRows = (j.filaments || []).map(f =>
        `<div class="cost-row"><span><span class="color-dot" style="background:${colorHex(f.color)}"></span>${f.marca || ''} ${f.nombre_comercial || ''} (${f.material || ''})</span><strong>${fmtNum(f.gramos_pieza, 1)}g</strong></div>`
      ).join('') || '<div class="cost-row"><span>Sin filamentos</span></div>';

      const prodRows = (j.products || []).map(p =>
        `<div class="cost-row"><span>${p.descripcion || '-'}</span><strong>×${p.cantidad}</strong></div>`
      ).join('');

      const extraRows = (j.extras || []).map(x =>
        `<div class="cost-row"><span>${x.nombre_extra || '-'} ×${x.cantidad}</span><strong>${fmtMoney(x.costo_total)}</strong></div>`
      ).join('');

      const costs = j.costs || {};
      const clienteName = allClients.find(c => c.id === j.cliente_id)?.nombre || '-';
      const printerName = allPrinters.find(p => p.id === j.impresora_id)?.nombre || '-';

      openModal(`#${j.id} — ${j.nombre_proyecto || 'Sin nombre'}`, `
        <div class="form-grid" style="margin-bottom:16px">
          <div><span style="color:var(--text-muted);font-size:12px">Cliente</span><br><strong>${clienteName}</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px">Impresora</span><br><strong>${printerName}</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px">Fecha</span><br><strong>${j.fecha ? j.fecha.substring(0,10) : '-'}</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px">Tipo precio</span><br><strong>${j.tipo_precio || '-'}</strong></div>
        </div>

        <div style="margin-bottom:12px"><strong style="color:var(--text-muted);font-size:12px;text-transform:uppercase">Filamentos</strong>${filRows}</div>

        ${prodRows ? `<div style="margin-bottom:12px"><strong style="color:var(--text-muted);font-size:12px;text-transform:uppercase">Productos</strong>${prodRows}</div>` : ''}
        ${extraRows ? `<div style="margin-bottom:12px"><strong style="color:var(--text-muted);font-size:12px;text-transform:uppercase">Extras</strong>${extraRows}</div>` : ''}

        <div class="cost-breakdown">
          ${[
            ['Tiempos', `Impresión: ${formatTime(j.tiempo_impresion_min)} | Prep: ${formatTime(j.tiempo_preparacion_min)} | Post: ${formatTime(j.tiempo_postproceso_min)} | Diseño: ${formatTime(j.tiempo_diseno_min)}`],
            ['Gramos purga', `${fmtNum(j.gramos_purga, 1)}g`],
            ['Gramos perdidos', `${fmtNum(j.gramos_perdidos, 1)}g`],
            ['Costo filamento', fmtMoney(costs.costo_filamento)],
            ['Costo electricidad', fmtMoney(costs.costo_electricidad)],
            ['Costo desgaste', fmtMoney(costs.costo_desgaste)],
            ['Mano de obra', fmtMoney(costs.costo_mano_obra)],
            ['Extras', fmtMoney(costs.costo_extras)],
            ['Precio menudeo', fmtMoney(j.precio_menudeo)],
            ['Precio mayoreo', fmtMoney(j.precio_mayoreo)],
          ].map(([k, v]) => `<div class="cost-row"><span>${k}</span><strong>${v || '-'}</strong></div>`).join('')}
          <div class="cost-row total"><span>Precio final</span><strong>${fmtMoney(j.precio_final)}</strong></div>
        </div>

        ${j.notas ? `<div class="alert alert-info" style="margin-top:12px">${j.notas}</div>` : ''}
        ${j.requiere_factura ? `<div class="alert alert-warning" style="margin-top:8px">⚠️ Requiere factura</div>` : ''}

        <div class="form-actions">
          <button class="btn btn-secondary" onclick="jobPDF(${j.id},'cliente')">📄 PDF Cliente</button>
          <button class="btn btn-secondary" onclick="jobPDF(${j.id},'interno')">🔒 PDF Interno</button>
          <button class="btn btn-secondary" onclick="closeModal();jobOpenForm(${j.id})">✏️ Editar</button>
          <button class="btn btn-danger" onclick="jobDelete(${j.id})">🗑️ Eliminar</button>
        </div>`);
    } catch (e) { showToast('Error cargando trabajo: ' + e.message, 'error'); }
  };

  window.jobPDF = function (id, tipo) {
    window.open(`/api/pdf/${id}?tipo=${tipo}`, '_blank');
  };

  window.jobOpenForm = async function (id) {
    let j = {};
    if (id) {
      try { j = await api('GET', `/api/jobs/${id}`); } catch (e) {}
    }

    const clientOptions = allClients.map(c =>
      `<option value="${c.id}" ${j.cliente_id == c.id ? 'selected' : ''}>${c.nombre}</option>`
    ).join('');
    const printerOptions = allPrinters.map(p =>
      `<option value="${p.id}" ${j.impresora_id == p.id ? 'selected' : ''}>${p.nombre} (${p.tipo})</option>`
    ).join('');
    const filamentOptions = allFilaments.map(f =>
      `<option value="${f.id}">${f.marca} ${f.nombre_comercial || ''} — ${f.material} ${f.color}</option>`
    ).join('');

    const existingFilaments = (j.filaments || []).map((f, i) =>
      `<div class="extra-item" id="fil-row-${i}">
        <select class="form-control" name="filamento_id[]" style="flex:2">
          ${allFilaments.map(af => `<option value="${af.id}" ${af.id == f.filamento_id ? 'selected' : ''}>${af.marca} ${af.nombre_comercial || ''} — ${af.material}</option>`).join('')}
        </select>
        <input class="form-control" name="gramos_pieza[]" type="number" step="0.1" value="${f.gramos_pieza || ''}" placeholder="g" style="width:80px">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
      </div>`
    ).join('');

    const existingProducts = (j.products || []).map((p, i) =>
      `<div class="extra-item" id="prod-row-${i}">
        <input class="form-control" name="prod_desc[]" value="${p.descripcion || ''}" placeholder="Descripción" style="flex:2">
        <input class="form-control" name="prod_qty[]" type="number" min="1" value="${p.cantidad || 1}" style="width:70px">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
      </div>`
    ).join('');

    const existingExtras = (j.extras || []).map((x, i) =>
      `<div class="extra-item" id="extra-row-${i}">
        <input class="form-control" name="extra_nombre[]" value="${x.nombre_extra || ''}" placeholder="Nombre" style="flex:2">
        <input class="form-control" name="extra_qty[]" type="number" value="${x.cantidad || 1}" style="width:60px">
        <input class="form-control" name="extra_costo[]" type="number" step="0.01" value="${x.costo_unitario || ''}" placeholder="$/u" style="width:80px">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
      </div>`
    ).join('');

    openModal(id ? `Editar Trabajo #${id}` : 'Nuevo Trabajo', `
      <form id="job-form" onsubmit="jobSave(event, ${id || 'null'})">

        <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">1. Básico</div>
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-group form-full"><label>Nombre del proyecto *</label><input class="form-control" name="nombre_proyecto" value="${j.nombre_proyecto || ''}" required></div>
          <div class="form-group"><label>Cliente</label><select class="form-control" name="cliente_id"><option value="">— Sin cliente —</option>${clientOptions}</select></div>
          <div class="form-group"><label>Impresora</label><select class="form-control" name="impresora_id"><option value="">— Sin impresora —</option>${printerOptions}</select></div>
          <div class="form-group"><label>Fecha</label><input class="form-control" name="fecha" type="date" value="${j.fecha ? j.fecha.substring(0,10) : new Date().toISOString().substring(0,10)}"></div>
          <div class="form-group"><label><input type="checkbox" name="fallo" value="1" ${j.fallo ? 'checked' : ''}> Trabajo fallido</label></div>
        </div>

        <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">2. Filamentos</div>
        <div id="filamentos-list" style="margin-bottom:8px">
          ${existingFilaments || `<div class="extra-item">
            <select class="form-control" name="filamento_id[]" style="flex:2"><option value="">— Seleccionar —</option>${filamentOptions}</select>
            <input class="form-control" name="gramos_pieza[]" type="number" step="0.1" placeholder="g" style="width:80px">
            <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
          </div>`}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddFilament()" style="margin-bottom:16px">＋ Filamento</button>
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-group"><label>Gramos purga</label><input class="form-control" name="gramos_purga" type="number" step="0.1" value="${j.gramos_purga || 0}"></div>
          <div class="form-group"><label>Gramos perdidos</label><input class="form-control" name="gramos_perdidos" type="number" step="0.1" value="${j.gramos_perdidos || 0}"></div>
        </div>

        <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">3. Tiempos</div>
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-group"><label>Impresión</label><input class="form-control" name="tiempo_impresion" placeholder="2:30h" value="${j.tiempo_impresion_min ? formatTime(j.tiempo_impresion_min) : ''}"></div>
          <div class="form-group"><label>Preparación</label><input class="form-control" name="tiempo_preparacion" placeholder="0:30h" value="${j.tiempo_preparacion_min ? formatTime(j.tiempo_preparacion_min) : ''}"></div>
          <div class="form-group"><label>Postproceso</label><input class="form-control" name="tiempo_postproceso" placeholder="0:15h" value="${j.tiempo_postproceso_min ? formatTime(j.tiempo_postproceso_min) : ''}"></div>
          <div class="form-group"><label>Diseño</label><input class="form-control" name="tiempo_diseno" placeholder="1:00h" value="${j.tiempo_diseno_min ? formatTime(j.tiempo_diseno_min) : ''}"></div>
        </div>

        <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">4. Productos</div>
        <div id="products-list" style="margin-bottom:8px">${existingProducts}</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddProduct()" style="margin-bottom:16px">＋ Producto</button>

        <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">5. Extras</div>
        <div id="extras-list" style="margin-bottom:8px">${existingExtras}</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddExtra()" style="margin-bottom:16px">＋ Extra</button>

        <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">6. Precio</div>
        <div class="form-grid">
          <div class="form-group form-full">
            <label>Tipo de precio</label>
            <div style="display:flex;gap:16px;margin-top:4px">
              ${['menudeo','mayoreo','personalizado'].map(t =>
                `<label><input type="radio" name="tipo_precio" value="${t}" ${(j.tipo_precio||'menudeo')===t?'checked':''}> ${t.charAt(0).toUpperCase()+t.slice(1)}</label>`
              ).join('')}
            </div>
          </div>
          <div class="form-group"><label>Precio final</label><input class="form-control" name="precio_final" type="number" step="0.01" value="${j.precio_final || ''}"></div>
          <div class="form-group"><label><input type="checkbox" name="requiere_factura" value="1" ${j.requiere_factura ? 'checked' : ''}> Requiere factura</label></div>
          <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${j.notas || ''}</textarea></div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);

    const filamentOptions2 = allFilaments.map(f =>
      `<option value="${f.id}">${f.marca} ${f.nombre_comercial || ''} — ${f.material} ${f.color}</option>`
    ).join('');
    window._jobFilamentOptions = filamentOptions2;
  };

  window.jobAddFilament = function () {
    const list = document.getElementById('filamentos-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'extra-item';
    row.innerHTML = `
      <select class="form-control" name="filamento_id[]" style="flex:2"><option value="">— Seleccionar —</option>${window._jobFilamentOptions || ''}</select>
      <input class="form-control" name="gramos_pieza[]" type="number" step="0.1" placeholder="g" style="width:80px">
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
    list.appendChild(row);
  };

  window.jobAddProduct = function () {
    const list = document.getElementById('products-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'extra-item';
    row.innerHTML = `
      <input class="form-control" name="prod_desc[]" placeholder="Descripción" style="flex:2">
      <input class="form-control" name="prod_qty[]" type="number" min="1" value="1" style="width:70px">
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
    list.appendChild(row);
  };

  window.jobAddExtra = function () {
    const list = document.getElementById('extras-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'extra-item';
    row.innerHTML = `
      <input class="form-control" name="extra_nombre[]" placeholder="Nombre" style="flex:2">
      <input class="form-control" name="extra_qty[]" type="number" value="1" style="width:60px">
      <input class="form-control" name="extra_costo[]" type="number" step="0.01" placeholder="$/u" style="width:80px">
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
    list.appendChild(row);
  };

  window.jobSave = async function (e, id) {
    e.preventDefault();
    const form = e.target;

    // Collect filaments
    const filIds = [...form.querySelectorAll('[name="filamento_id[]"]')].map(el => el.value).filter(Boolean);
    const filGrams = [...form.querySelectorAll('[name="gramos_pieza[]"]')].map(el => el.value);
    const filaments = filIds.map((fid, i) => ({ filamento_id: fid, gramos_pieza: filGrams[i] || 0 }));

    // Collect products
    const prodDescs = [...form.querySelectorAll('[name="prod_desc[]"]')].map(el => el.value).filter(Boolean);
    const prodQtys = [...form.querySelectorAll('[name="prod_qty[]"]')].map(el => el.value);
    const products = prodDescs.map((d, i) => ({ descripcion: d, cantidad: prodQtys[i] || 1 }));

    // Collect extras
    const extraNames = [...form.querySelectorAll('[name="extra_nombre[]"]')].map(el => el.value).filter(Boolean);
    const extraQtys = [...form.querySelectorAll('[name="extra_qty[]"]')].map(el => el.value);
    const extraCosts = [...form.querySelectorAll('[name="extra_costo[]"]')].map(el => el.value);
    const extras = extraNames.map((n, i) => ({
      nombre_extra: n,
      cantidad: extraQtys[i] || 1,
      costo_unitario: extraCosts[i] || 0
    }));

    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());

    // Parse times
    body.tiempo_impresion_min = parseTime(body.tiempo_impresion);
    body.tiempo_preparacion_min = parseTime(body.tiempo_preparacion);
    body.tiempo_postproceso_min = parseTime(body.tiempo_postproceso);
    body.tiempo_diseno_min = parseTime(body.tiempo_diseno);
    delete body.tiempo_impresion;
    delete body.tiempo_preparacion;
    delete body.tiempo_postproceso;
    delete body.tiempo_diseno;

    body.fallo = form.querySelector('[name=fallo]')?.checked ? 1 : 0;
    body.requiere_factura = form.querySelector('[name=requiere_factura]')?.checked ? 1 : 0;
    body.filaments = filaments;
    body.products = products;
    body.extras = extras;

    // Remove array fields that FormData picked up individually
    delete body['filamento_id[]'];
    delete body['gramos_pieza[]'];
    delete body['prod_desc[]'];
    delete body['prod_qty[]'];
    delete body['extra_nombre[]'];
    delete body['extra_qty[]'];
    delete body['extra_costo[]'];

    try {
      if (id) await api('PUT', `/api/jobs/${id}`, body);
      else await api('POST', '/api/jobs', body);
      closeModal();
      showToast(id ? 'Trabajo actualizado' : 'Trabajo guardado');
      await refreshJobs();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.jobDelete = function (id) {
    const j = allJobs.find(x => x.id === id);
    confirmModal(`¿Eliminar trabajo "${j?.nombre_proyecto || '#' + id}"?`, async () => {
      try {
        await api('DELETE', `/api/jobs/${id}`);
        closeModal();
        showToast('Trabajo eliminado');
        await refreshJobs();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };
})();

let jobsList = [];
let jobPrinters = [];
let jobFilaments = [];
let jobClients = [];

pageLoaders['jobs'] = async function loadJobs() {
  const el = document.getElementById('page-jobs');
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">📋 Trabajos de Impresión</div><div class="page-subtitle">Historial y cálculo de costos</div></div>
      <button class="btn btn-primary" onclick="openJobForm()">+ Nuevo trabajo</button>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <input class="search-input" placeholder="Buscar trabajo..." oninput="filterJobs(this.value)">
        <span id="job-count" style="color:var(--text-muted)"></span>
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>Proyecto</th><th>Cliente</th><th>Fecha</th><th>Material</th><th>Gramos</th><th>Tiempo</th><th>Precio final</th><th>Acciones</th></tr>
        </thead>
        <tbody id="jobs-tbody"></tbody>
      </table>
    </div>`;
  await refreshJobs();
};

async function refreshJobs() {
  [jobsList, jobPrinters, jobFilaments, jobClients] = await Promise.all([
    api('GET', '/api/jobs'),
    api('GET', '/api/printers'),
    api('GET', '/api/filaments'),
    api('GET', '/api/clients'),
  ]);
  renderJobs(jobsList);
}

function renderJobs(list) {
  const tbody = document.getElementById('jobs-tbody');
  document.getElementById('job-count').textContent = `${list.length} trabajo(s)`;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">📋</div><div>No hay trabajos. Crea el primero con el botón de arriba.</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(j => {
    const h = Math.floor((j.tiempo_impresion_min || 0) / 60);
    const m = (j.tiempo_impresion_min || 0) % 60;
    return `<tr>
      <td style="color:var(--text-muted)">#${j.id}</td>
      <td>
        <strong>${j.nombre_proyecto}</strong>
        ${j.fallo ? ' <span class="badge badge-low">FALLO</span>' : ''}
      </td>
      <td>${j.cliente_nombre || '-'}</td>
      <td>${j.fecha || '-'}</td>
      <td>
        ${materialBadge(j.material)}
        <span class="color-dot" style="background:${colorHex(j.color)}"></span>${j.color || ''}
      </td>
      <td>${fmtNum(j.gramos_total)}g</td>
      <td>${h}h ${m}m</td>
      <td><strong style="color:var(--accent-light)">${fmtCAD(j.precio_final_cad)}</strong></td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="viewJob(${j.id})" title="Ver detalle">👁️</button>
        <button class="btn btn-secondary btn-sm" onclick="openJobForm(${j.id})" title="Editar">✏️</button>
        <a class="btn btn-success btn-sm" href="/api/pdf/${j.id}" target="_blank" title="Descargar PDF">📄</a>
        <button class="btn btn-danger btn-sm" onclick="deleteJob(${j.id})" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function filterJobs(q) {
  const lq = q.toLowerCase();
  renderJobs(jobsList.filter(j =>
    [j.nombre_proyecto, j.cliente_nombre, j.material, j.color, j.notas]
      .some(v => (v || '').toLowerCase().includes(lq))
  ));
}

async function viewJob(id) {
  const j = await api('GET', `/api/jobs/${id}`);
  let cost = {};
  try { cost = await api('GET', `/api/jobs/${id}/cost`); } catch(e) {}

  const extrasHtml = j.extras && j.extras.length
    ? j.extras.map(e => `
        <div class="cost-row" style="padding-left:20px;font-size:12px">
          <span style="color:var(--text-muted)">↳ ${e.nombre_extra} ×${e.cantidad}</span>
          <span>${fmtCAD(e.costo_total)}</span>
        </div>`).join('')
    : '';

  openModal(`Trabajo #${id} — ${j.nombre_proyecto}`, `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:13px">
      <span><strong>Cliente:</strong> ${j.cliente_nombre || '-'}</span>
      <span><strong>Fecha:</strong> ${j.fecha}</span>
      <span><strong>Impresora:</strong> ${j.impresora_nombre || '-'}</span>
      ${j.fallo ? '<span class="badge badge-low">TRABAJO FALLIDO</span>' : ''}
    </div>
    <div class="grid-2" style="margin-bottom:16px;gap:12px">
      <div class="card" style="padding:14px">
        <div class="card-title">Material</div>
        ${materialBadge(j.material)}
        <span class="color-dot" style="background:${colorHex(j.color)}"></span>${j.color || '-'}
        <br><small style="color:var(--text-muted)">${j.filamento_nombre || '-'}</small>
      </div>
      <div class="card" style="padding:14px">
        <div class="card-title">Gramos</div>
        <div style="font-size:12px;line-height:1.8">
          Pieza: <strong>${fmtNum(j.gramos_pieza)}g</strong><br>
          Purga: <strong>${fmtNum(j.gramos_purga)}g</strong><br>
          Pérdidos: <strong>${fmtNum(j.gramos_perdidos)}g</strong><br>
          <strong style="color:var(--accent-light)">Total: ${fmtNum(j.gramos_total)}g</strong>
        </div>
      </div>
    </div>
    <div class="card" style="padding:14px;margin-bottom:16px;font-size:12px">
      <div class="card-title">Tiempos</div>
      Impresión: <strong>${j.tiempo_impresion_min}min</strong> &nbsp;|&nbsp;
      Preparación: <strong>${j.tiempo_preparacion_min}min</strong> &nbsp;|&nbsp;
      Post-proceso: <strong>${j.tiempo_postproceso_min}min</strong> &nbsp;|&nbsp;
      Diseño: <strong>${j.tiempo_diseno_min}min</strong>
    </div>
    <div class="cost-breakdown">
      <div class="cost-row"><span>🧵 Filamento</span><span>${fmtCAD(cost.costo_filamento)}</span></div>
      <div class="cost-row"><span>⚡ Electricidad (${fmtNum(cost.kwh_usados, 4)} kWh)</span><span>${fmtCAD(cost.costo_luz)}</span></div>
      <div class="cost-row"><span>🖨️ Desgaste máquina (${fmtNum(cost.horas_impresion)}h)</span><span>${fmtCAD(cost.costo_maquina)}</span></div>
      <div class="cost-row"><span>👷 Mano de obra</span><span>${fmtCAD(cost.mano_obra)}</span></div>
      <div class="cost-row"><span>📦 Extras</span><span>${fmtCAD(cost.extras_total)}</span></div>
      ${extrasHtml}
      <div class="cost-row" style="border-top:1px solid var(--border);padding-top:8px"><span>Costo real</span><span>${fmtCAD(cost.costo_real)}</span></div>
      <div class="cost-row"><span style="color:var(--text-muted)">Precio sugerido (×${cost.margen || ''})</span><span style="color:var(--text-muted)">${fmtCAD(cost.precio_sugerido)}</span></div>
      <div class="cost-row total"><span>PRECIO FINAL</span><span>${fmtCAD(j.precio_final_cad)}</span></div>
    </div>
    ${j.notas ? `<p style="margin-top:12px;color:var(--text-muted);font-size:12px">📝 ${j.notas}</p>` : ''}
    <div class="form-actions">
      <a class="btn btn-success" href="/api/pdf/${id}" target="_blank">📄 Descargar PDF</a>
      <button class="btn btn-primary" onclick="closeModal();openJobForm(${id})">✏️ Editar</button>
    </div>
  `);
}

function addExtraRow(nombre = '', cantidad = 1, costo_unitario = 0) {
  const container = document.getElementById('extras-container');
  if (!container) return;
  const idx = Date.now();
  const div = document.createElement('div');
  div.className = 'extra-item';
  div.dataset.idx = idx;
  div.innerHTML = `
    <input class="form-control" placeholder="Extra (ej: Aro llavero)" value="${nombre}" style="flex:2">
    <input class="form-control" type="number" placeholder="Cant." value="${cantidad}" step="1" min="0" style="width:72px" oninput="updateExtraTotal(this)">
    <input class="form-control" type="number" placeholder="$/u" value="${costo_unitario}" step="0.01" min="0" style="width:80px" oninput="updateExtraTotal(this)">
    <input class="form-control" type="number" placeholder="Total" readonly style="width:80px;opacity:0.6" value="${(cantidad * costo_unitario).toFixed(2)}">
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
}

function updateExtraTotal(inp) {
  const row = inp.closest('.extra-item');
  const inputs = row.querySelectorAll('input[type="number"]');
  const qty = parseFloat(inputs[0].value) || 0;
  const unit = parseFloat(inputs[1].value) || 0;
  inputs[2].value = (qty * unit).toFixed(2);
}

function getExtraRows() {
  const rows = [];
  document.querySelectorAll('#extras-container .extra-item').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const nombre = inputs[0].value.trim();
    if (!nombre) return;
    const cantidad = parseFloat(inputs[1].value) || 1;
    const costo_unitario = parseFloat(inputs[2].value) || 0;
    rows.push({ nombre_extra: nombre, cantidad, costo_unitario, costo_total: cantidad * costo_unitario });
  });
  return rows;
}

async function openJobForm(id) {
  let j = {
    fecha: new Date().toISOString().slice(0, 10),
    gramos_pieza: 0, gramos_purga: 3, gramos_perdidos: 1,
    tiempo_impresion_min: 60, tiempo_preparacion_min: 10,
    tiempo_postproceso_min: 5, tiempo_diseno_min: 0
  };
  let existingExtras = [];
  if (id) {
    const full = await api('GET', `/api/jobs/${id}`);
    j = full;
    existingExtras = full.extras || [];
  }

  const printerOpts = jobPrinters.map(p =>
    `<option value="${p.id}" ${j.impresora_id == p.id ? 'selected' : ''}>${p.nombre}</option>`
  ).join('');

  const filamentOpts = jobFilaments.map(f =>
    `<option value="${f.id}" ${j.filamento_id == f.id ? 'selected' : ''}>${f.color} ${f.material} — ${f.marca} (${fmtNum(f.peso_actual_g)}g)</option>`
  ).join('');

  const clientOpts = `<option value="">— Sin cliente —</option>` + jobClients.map(c =>
    `<option value="${c.id}" ${j.cliente_id == c.id ? 'selected' : ''}>${c.nombre}</option>`
  ).join('');

  const grTotal = ((+j.gramos_pieza || 0) + (+j.gramos_purga || 0) + (+j.gramos_perdidos || 0)).toFixed(1);

  openModal(id ? `Editar trabajo #${id}` : 'Nuevo trabajo de impresión', `
    <form id="job-form" onsubmit="saveJob(event, ${id || 'null'})">

      <div class="form-grid">
        <div class="form-group form-full">
          <label>Nombre del proyecto *</label>
          <input class="form-control" name="nombre_proyecto" value="${j.nombre_proyecto || ''}" required placeholder="Ej: Llavero personalizado x5">
        </div>
        <div class="form-group">
          <label>Cliente</label>
          <select class="form-control" name="cliente_id">${clientOpts}</select>
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input class="form-control" type="date" name="fecha" value="${j.fecha || ''}">
        </div>
        <div class="form-group">
          <label>Impresora</label>
          <select class="form-control" name="impresora_id">${printerOpts}</select>
        </div>
        <div class="form-group">
          <label>Filamento</label>
          <select class="form-control" name="filamento_id" onchange="autoFillMaterialColor(this)">${filamentOpts}</select>
        </div>
        <div class="form-group">
          <label>Material</label>
          <input class="form-control" name="material" value="${j.material || ''}" placeholder="Auto-llenado del filamento">
        </div>
        <div class="form-group">
          <label>Color</label>
          <input class="form-control" name="color" value="${j.color || ''}" placeholder="Auto-llenado del filamento">
        </div>
      </div>

      <div class="section-header">Gramos de material</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Gramos pieza</label>
          <input class="form-control" type="number" step="0.1" name="gramos_pieza" value="${j.gramos_pieza || 0}" oninput="recalcTotal()">
        </div>
        <div class="form-group">
          <label>Gramos purga</label>
          <input class="form-control" type="number" step="0.1" name="gramos_purga" value="${j.gramos_purga || 0}" oninput="recalcTotal()">
        </div>
        <div class="form-group">
          <label>Gramos perdidos / soporte</label>
          <input class="form-control" type="number" step="0.1" name="gramos_perdidos" value="${j.gramos_perdidos || 0}" oninput="recalcTotal()">
        </div>
        <div class="form-group">
          <label>Total (calculado)</label>
          <input class="form-control" id="gramos-total-display" readonly style="opacity:0.6;background:var(--bg)" value="${grTotal}g">
        </div>
      </div>

      <div class="section-header">Tiempos (en minutos)</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Tiempo impresión</label>
          <input class="form-control" type="number" name="tiempo_impresion_min" value="${j.tiempo_impresion_min || 0}">
        </div>
        <div class="form-group">
          <label>Preparación</label>
          <input class="form-control" type="number" name="tiempo_preparacion_min" value="${j.tiempo_preparacion_min || 0}">
        </div>
        <div class="form-group">
          <label>Post-proceso</label>
          <input class="form-control" type="number" name="tiempo_postproceso_min" value="${j.tiempo_postproceso_min || 0}">
        </div>
        <div class="form-group">
          <label>Diseño</label>
          <input class="form-control" type="number" name="tiempo_diseno_min" value="${j.tiempo_diseno_min || 0}">
        </div>
      </div>

      <div class="section-header">Extras / Materiales adicionales</div>
      <div id="extras-container"></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addExtraRow()" style="margin-top:8px">
        + Agregar extra
      </button>
      <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">
        Ejemplos: Aro llavero, Bolsa transparente, Etiqueta, Imán, Tornillos, Caja de empaque...
      </div>

      <div class="section-header">Precio y finalización</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Precio final (CAD)</label>
          <input class="form-control" type="number" step="0.01" name="precio_final_cad" value="${j.precio_final_cad || ''}" placeholder="Deja vacío para usar precio sugerido">
        </div>
        <div class="form-group" style="justify-content:center">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:20px">
            <input type="checkbox" name="fallo" ${j.fallo ? 'checked' : ''}> Trabajo fallido (no afecta inventario)
          </label>
        </div>
        <div class="form-group form-full">
          <label>Notas</label>
          <textarea class="form-control" name="notas" rows="2">${j.notas || ''}</textarea>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${id ? 'Guardar cambios' : 'Crear trabajo'}</button>
      </div>
    </form>
  `);

  // Auto-load extras
  for (const e of existingExtras) {
    addExtraRow(e.nombre_extra, e.cantidad, e.costo_unitario);
  }
}

function recalcTotal() {
  const form = document.getElementById('job-form');
  if (!form) return;
  const p = parseFloat(form.querySelector('[name="gramos_pieza"]').value) || 0;
  const pu = parseFloat(form.querySelector('[name="gramos_purga"]').value) || 0;
  const pe = parseFloat(form.querySelector('[name="gramos_perdidos"]').value) || 0;
  document.getElementById('gramos-total-display').value = (p + pu + pe).toFixed(1) + 'g';
}

function autoFillMaterialColor(sel) {
  const f = jobFilaments.find(f => f.id == sel.value);
  if (!f) return;
  const form = document.getElementById('job-form');
  if (!form) return;
  form.querySelector('[name="material"]').value = f.material || '';
  form.querySelector('[name="color"]').value = f.color || '';
}

async function saveJob(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  data.fallo = form.querySelector('[name="fallo"]').checked ? 1 : 0;
  data.extras = getExtraRows();

  try {
    if (id) {
      await api('PUT', `/api/jobs/${id}`, data);
      showToast('Trabajo actualizado ✓');
    } else {
      const r = await api('POST', '/api/jobs', data);
      showToast('Trabajo creado ✓');
    }
    closeModal();
    await refreshJobs();
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteJob(id) {
  if (!confirm('¿Eliminar este trabajo?\nLos gramos se devolverán automáticamente al inventario del filamento.')) return;
  try {
    await api('DELETE', `/api/jobs/${id}`);
    showToast('Trabajo eliminado. Inventario restaurado.');
    await refreshJobs();
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
}

let printersList = [];

pageLoaders['printers'] = async function loadPrinters() {
  const el = document.getElementById('page-printers');
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">🖨️ Impresoras</div><div class="page-subtitle">Gestión de equipos</div></div>
      <button class="btn btn-primary" onclick="openPrinterForm()">+ Agregar impresora</button>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <input class="search-input" placeholder="Buscar impresora..." oninput="filterPrinters(this.value)">
        <span id="printer-count" style="color:var(--text-muted);font-size:13px"></span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Modelo</th><th>Costo compra</th><th>Costo/hora</th><th>Consumo</th><th>Vida útil</th><th>Acciones</th></tr></thead>
        <tbody id="printers-tbody"></tbody>
      </table>
    </div>`;
  await refreshPrinters();
};

async function refreshPrinters() {
  printersList = await api('GET', '/api/printers');
  renderPrinters(printersList);
}

function renderPrinters(list) {
  const tbody = document.getElementById('printers-tbody');
  document.getElementById('printer-count').textContent = `${list.length} impresora(s)`;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🖨️</div><div>No hay impresoras registradas.</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => `<tr>
    <td style="color:var(--text-muted)">#${p.id}</td>
    <td><strong>${p.nombre}</strong></td>
    <td>${p.modelo || '-'}</td>
    <td>${fmtCAD(p.costo_compra_cad)}</td>
    <td>${fmtCAD(p.costo_por_hora)}/hr</td>
    <td>${p.consumo_promedio_watts || 0}W</td>
    <td>${p.vida_util_horas || 0}h</td>
    <td class="actions">
      <button class="btn btn-secondary btn-sm" onclick="openPrinterForm(${p.id})">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="deletePrinter(${p.id})">🗑️</button>
    </td>
  </tr>`).join('');
}

function filterPrinters(q) {
  const lq = q.toLowerCase();
  renderPrinters(printersList.filter(p => [p.nombre, p.modelo].some(v => (v||'').toLowerCase().includes(lq))));
}

async function openPrinterForm(id) {
  let p = { consumo_promedio_watts: 120, vida_util_horas: 1500, costo_kwh_cad: 0.18 };
  if (id) p = await api('GET', `/api/printers/${id}`);

  openModal(id ? 'Editar impresora' : 'Agregar impresora', `
    <form id="printer-form" onsubmit="savePrinter(event, ${id || 'null'})">
      <div class="form-grid">
        <div class="form-group"><label>Nombre</label><input class="form-control" name="nombre" value="${p.nombre || ''}" required></div>
        <div class="form-group"><label>Modelo</label><input class="form-control" name="modelo" value="${p.modelo || ''}"></div>
        <div class="form-group"><label>Costo de compra (CAD)</label><input class="form-control" type="number" step="0.01" name="costo_compra_cad" value="${p.costo_compra_cad || ''}" required></div>
        <div class="form-group"><label>Fecha de compra</label><input class="form-control" type="date" name="fecha_compra" value="${p.fecha_compra || ''}"></div>
        <div class="form-group"><label>Vida útil (horas)</label><input class="form-control" type="number" name="vida_util_horas" value="${p.vida_util_horas || 1500}"></div>
        <div class="form-group"><label>Consumo (Watts)</label><input class="form-control" type="number" name="consumo_promedio_watts" value="${p.consumo_promedio_watts || 120}"></div>
        <div class="form-group"><label>Costo kWh (CAD)</label><input class="form-control" type="number" step="0.001" name="costo_kwh_cad" value="${p.costo_kwh_cad || 0.18}"></div>
        <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${p.notas || ''}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${id ? 'Guardar' : 'Agregar'}</button>
      </div>
    </form>
  `);
}

async function savePrinter(e, id) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    if (id) { await api('PUT', `/api/printers/${id}`, data); showToast('Impresora actualizada'); }
    else { await api('POST', '/api/printers', data); showToast('Impresora agregada'); }
    closeModal();
    await refreshPrinters();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function deletePrinter(id) {
  if (!confirm('¿Eliminar esta impresora?')) return;
  await api('DELETE', `/api/printers/${id}`);
  showToast('Impresora eliminada');
  await refreshPrinters();
}

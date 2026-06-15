let filamentsList = [];

pageLoaders['filaments'] = async function loadFilaments() {
  const el = document.getElementById('page-filaments');
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">🧵 Filamentos</div><div class="page-subtitle">Gestión de inventario de filamentos</div></div>
      <button class="btn btn-primary" onclick="openFilamentForm()">+ Agregar filamento</button>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <input class="search-input" placeholder="Buscar filamento..." oninput="filterFilaments(this.value)" id="fil-search">
        <span id="fil-count" style="color:var(--text-muted);font-size:13px"></span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Marca / Nombre</th><th>Material</th><th>Color</th><th>Peso actual</th><th>Costo/g</th><th>Costo total</th><th>Acciones</th></tr></thead>
        <tbody id="filaments-tbody"></tbody>
      </table>
    </div>`;
  await refreshFilaments();
};

async function refreshFilaments() {
  filamentsList = await api('GET', '/api/filaments');
  renderFilaments(filamentsList);
}

function renderFilaments(list) {
  const tbody = document.getElementById('filaments-tbody');
  document.getElementById('fil-count').textContent = `${list.length} filamento(s)`;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🧵</div><div>No hay filamentos. Agrega uno para empezar.</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(f => {
    const pct = Math.max(0, Math.min(100, (f.peso_actual_g / f.peso_inicial_g) * 100));
    const cls = pct < 10 ? 'low' : pct < 25 ? 'warn' : 'ok';
    return `<tr>
      <td style="color:var(--text-muted)">#${f.id}</td>
      <td><strong>${f.marca || ''}</strong><br><small style="color:var(--text-muted)">${f.nombre_comercial || ''}</small></td>
      <td>${materialBadge(f.material)}</td>
      <td><span class="color-dot" style="background:${colorHex(f.color)}"></span>${f.color || '-'}</td>
      <td>
        <strong>${fmtNum(f.peso_actual_g)}g</strong> / ${fmtNum(f.peso_inicial_g)}g
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--${cls === 'low' ? 'danger' : cls === 'warn' ? 'warning' : 'success'})"></div></div>
        <span class="badge badge-${cls}">${pct.toFixed(0)}%</span>
      </td>
      <td>$${parseFloat(f.costo_por_gramo || 0).toFixed(4)}</td>
      <td>${fmtCAD(f.costo_total_cad)}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="openFilamentForm(${f.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFilament(${f.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function filterFilaments(q) {
  const lq = q.toLowerCase();
  renderFilaments(filamentsList.filter(f =>
    [f.marca, f.nombre_comercial, f.material, f.color, f.proveedor].some(v => (v || '').toLowerCase().includes(lq))
  ));
}

async function openFilamentForm(id) {
  let f = { diametro_mm: 1.75, peso_inicial_g: 1000, peso_bobina_vacia_g: 200, material: 'PLA', acabado: 'Mate' };
  if (id) f = await api('GET', `/api/filaments/${id}`);
  const title = id ? 'Editar filamento' : 'Agregar filamento';

  openModal(title, `
    <form id="filament-form" onsubmit="saveFilament(event, ${id || 'null'})">
      <div class="form-grid">
        <div class="form-group"><label>Marca</label><input class="form-control" name="marca" value="${f.marca || ''}" required></div>
        <div class="form-group"><label>Nombre comercial</label><input class="form-control" name="nombre_comercial" value="${f.nombre_comercial || ''}"></div>
        <div class="form-group"><label>Material</label>
          <select class="form-control" name="material">
            ${['PLA','PETG','ABS','TPU','ASA','PA','PC','PLA+','SILK','Wood'].map(m => `<option ${f.material===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Color</label><input class="form-control" name="color" value="${f.color || ''}"></div>
        <div class="form-group"><label>Acabado</label>
          <select class="form-control" name="acabado">
            ${['Mate','Brillante','Seda','Satinado'].map(a => `<option ${f.acabado===a?'selected':''}>${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Diámetro (mm)</label><input class="form-control" type="number" step="0.01" name="diametro_mm" value="${f.diametro_mm || 1.75}"></div>
        <div class="form-group"><label>Peso inicial (g)</label><input class="form-control" type="number" name="peso_inicial_g" value="${f.peso_inicial_g || 1000}" required></div>
        <div class="form-group"><label>Peso actual (g)</label><input class="form-control" type="number" name="peso_actual_g" value="${f.peso_actual_g || ''}"></div>
        <div class="form-group"><label>Peso bobina vacía (g)</label><input class="form-control" type="number" name="peso_bobina_vacia_g" value="${f.peso_bobina_vacia_g || 200}"></div>
        <div class="form-group"><label>Costo total (CAD)</label><input class="form-control" type="number" step="0.01" name="costo_total_cad" value="${f.costo_total_cad || ''}" required></div>
        <div class="form-group"><label>Fecha compra</label><input class="form-control" type="date" name="fecha_compra" value="${f.fecha_compra || ''}"></div>
        <div class="form-group"><label>Proveedor</label><input class="form-control" name="proveedor" value="${f.proveedor || ''}"></div>
        <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${f.notas || ''}</textarea></div>
        <div class="form-group"><label><input type="checkbox" name="tiene_nfc" ${f.tiene_nfc ? 'checked' : ''}> Tiene NFC (futuro)</label></div>
        <div class="form-group"><label>UID NFC</label><input class="form-control" name="uid_nfc" value="${f.uid_nfc || ''}" placeholder="Para futuro"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${id ? 'Guardar cambios' : 'Agregar'}</button>
      </div>
    </form>
  `);
}

async function saveFilament(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  data.tiene_nfc = form.querySelector('[name=tiene_nfc]').checked ? 1 : 0;
  data.tiene_rfid = 0;
  try {
    if (id) {
      await api('PUT', `/api/filaments/${id}`, data);
      showToast('Filamento actualizado');
    } else {
      await api('POST', '/api/filaments', data);
      showToast('Filamento agregado');
    }
    closeModal();
    await refreshFilaments();
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteFilament(id) {
  if (!confirm('¿Eliminar este filamento?')) return;
  await api('DELETE', `/api/filaments/${id}`);
  showToast('Filamento eliminado');
  await refreshFilaments();
}

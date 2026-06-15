let clientsList = [];

pageLoaders['clients'] = async function loadClients() {
  const el = document.getElementById('page-clients');
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">👥 Clientes</div><div class="page-subtitle">Directorio de clientes</div></div>
      <button class="btn btn-primary" onclick="openClientForm()">+ Agregar cliente</button>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <input class="search-input" placeholder="Buscar cliente..." oninput="filterClients(this.value)">
        <span id="client-count" style="color:var(--text-muted)"></span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Notas</th><th>Acciones</th></tr></thead>
        <tbody id="clients-tbody"></tbody>
      </table>
    </div>`;
  await refreshClients();
};

async function refreshClients() {
  clientsList = await api('GET', '/api/clients');
  renderClients(clientsList);
}

function renderClients(list) {
  const tbody = document.getElementById('clients-tbody');
  document.getElementById('client-count').textContent = `${list.length} cliente(s)`;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👥</div><div>No hay clientes aún.</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(c => `<tr>
    <td style="color:var(--text-muted)">#${c.id}</td>
    <td><strong>${c.nombre}</strong></td>
    <td>${c.telefono || '-'}</td>
    <td>${c.email ? `<a href="mailto:${c.email}" style="color:var(--accent-light)">${c.email}</a>` : '-'}</td>
    <td style="color:var(--text-muted)">${c.notas || '-'}</td>
    <td class="actions">
      <button class="btn btn-secondary btn-sm" onclick="openClientForm(${c.id})">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="deleteClient(${c.id})">🗑️</button>
    </td>
  </tr>`).join('');
}

function filterClients(q) {
  const lq = q.toLowerCase();
  renderClients(clientsList.filter(c => [c.nombre, c.email, c.telefono].some(v => (v||'').toLowerCase().includes(lq))));
}

async function openClientForm(id) {
  let c = {};
  if (id) c = await api('GET', `/api/clients/${id}`);
  openModal(id ? 'Editar cliente' : 'Agregar cliente', `
    <form onsubmit="saveClient(event, ${id || 'null'})">
      <div class="form-grid">
        <div class="form-group form-full"><label>Nombre *</label><input class="form-control" name="nombre" value="${c.nombre || ''}" required></div>
        <div class="form-group"><label>Teléfono</label><input class="form-control" name="telefono" value="${c.telefono || ''}"></div>
        <div class="form-group"><label>Email</label><input class="form-control" type="email" name="email" value="${c.email || ''}"></div>
        <div class="form-group form-full"><label>Dirección</label><input class="form-control" name="direccion" value="${c.direccion || ''}"></div>
        <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${c.notas || ''}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${id ? 'Guardar' : 'Agregar'}</button>
      </div>
    </form>
  `);
}

async function saveClient(e, id) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try {
    if (id) { await api('PUT', `/api/clients/${id}`, data); showToast('Cliente actualizado'); }
    else { await api('POST', '/api/clients', data); showToast('Cliente agregado'); }
    closeModal();
    await refreshClients();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function deleteClient(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  await api('DELETE', `/api/clients/${id}`);
  showToast('Cliente eliminado');
  await refreshClients();
}

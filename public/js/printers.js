(function () {
  let allPrinters = [];
  let prPage = 1, prSearch = '';

  const typeIcon = { FDM: '🖨️', Resina: '🫙', Laser: '🔥', CNC: '🔩' };

  pageLoaders['printers'] = async function loadPrinters() {
    const el = document.getElementById('page-printers');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Impresoras</div>
          <div class="page-subtitle">Gestión de equipos</div>
        </div>
        <button class="btn btn-primary" onclick="prOpenForm()">＋ Agregar Impresora</button>
      </div>
      <div class="table-toolbar" style="background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:20px">
        <input class="search-input form-control" style="width:260px" placeholder="Buscar impresora..." oninput="prSearch2(this.value)">
      </div>
      <div id="pr-grid" class="printer-grid"></div>
      <div class="pagination" id="pr-pagination"></div>`;

    await refreshPrinters();
  };

  async function refreshPrinters() {
    try { allPrinters = await api('GET', '/api/printers'); } catch (e) { allPrinters = []; }
    prPage = 1;
    renderPrinters();
  }

  function renderPrinters() {
    const q = prSearch.toLowerCase();
    const filtered = allPrinters.filter(p =>
      `${p.nombre} ${p.marca} ${p.modelo} ${p.tipo}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, prPage);
    prPage = page;

    const grid = document.getElementById('pr-grid');
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🖨️</div>Sin impresoras</div>';
      document.getElementById('pr-pagination').innerHTML = '';
      return;
    }

    grid.innerHTML = items.map(p => {
      const icon = typeIcon[p.tipo] || '🖨️';
      const imgHtml = p.foto_path
        ? `<img src="/${p.foto_path}" class="printer-card-img" style="object-fit:cover" onerror="this.outerHTML='<div class=\\'printer-card-img\\'>${icon}</div>'">`
        : `<div class="printer-card-img">${icon}</div>`;
      const estadoCls = (p.estado || 'activa').toLowerCase().replace('ó', 'o');
      const ams = p.tipo === 'FDM' && p.tiene_ams ? '<span class="badge badge-default">AMS</span> ' : '';
      return `
        <div class="printer-card" onclick="prViewDetail(${p.id})">
          ${imgHtml}
          <div class="printer-card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div class="printer-card-name">${p.nombre || '-'}</div>
              <span class="badge badge-${estadoCls}">${p.estado || 'Activa'}</span>
            </div>
            <div class="printer-card-sub">${p.marca || ''} ${p.modelo || ''}</div>
            <div class="printer-card-stats">
              <div class="printer-card-stat"><span>Tipo</span><strong>${p.tipo || '-'}</strong></div>
              <div class="printer-card-stat"><span>Horas</span><strong>${fmtNum(p.horas_acumuladas, 0)}</strong></div>
              ${p.tipo === 'FDM' ? `<div class="printer-card-stat"><span>AMS</span><strong>${p.tiene_ams ? '✓' : '✗'}</strong></div>` : ''}
              <div class="printer-card-stat"><span>Costo/h</span><strong>${fmtMoney(p.costo_por_hora)}</strong></div>
            </div>
          </div>
        </div>`;
    }).join('');

    renderPaginationInline('pr-pagination', prPage, totalPages, (p) => { prPage = p; renderPrinters(); });
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

  window.prSearch2 = function (q) { prSearch = q; prPage = 1; renderPrinters(); };

  window.prViewDetail = function (id) {
    const p = allPrinters.find(x => x.id === id);
    if (!p) return;
    const icon = typeIcon[p.tipo] || '🖨️';
    const imgHtml = p.foto_path
      ? `<img src="/${p.foto_path}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:16px">`
      : `<div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;font-size:56px;margin-bottom:16px">${icon}</div>`;

    const extras = [];
    if (p.tipo === 'FDM') extras.push(['AMS', p.tiene_ams ? '✓ Sí' : '✗ No']);
    if (p.area_trabajo) extras.push(['Área de trabajo', p.area_trabajo]);
    if (p.potencia_laser_w) extras.push(['Potencia láser', `${p.potencia_laser_w}W`]);
    if (p.tipo_laser) extras.push(['Tipo láser', p.tipo_laser]);
    if (p.tipo_resina) extras.push(['Tipo resina', p.tipo_resina]);
    if (p.fuente_luz) extras.push(['Fuente de luz', p.fuente_luz]);
    if (p.husillo_w) extras.push(['Husillo', `${p.husillo_w}W`]);
    if (p.velocidad_max_mm) extras.push(['Velocidad máx', `${p.velocidad_max_mm} mm/s`]);
    if (p.materiales_compatibles) extras.push(['Materiales', p.materiales_compatibles]);

    const rows = [
      ['Marca', p.marca], ['Modelo', p.modelo], ['Tipo', p.tipo],
      ['Estado', p.estado], ['Ubicación', p.ubicacion],
      ['Costo de compra', fmtMoney(p.costo_compra)],
      ['Fecha de compra', p.fecha_compra ? p.fecha_compra.substring(0,10) : '-'],
      ['Consumo', `${p.consumo_promedio_watts || 0}W`],
      ['Costo/hora', fmtMoney(p.costo_por_hora)],
      ['Horas acumuladas', fmtNum(p.horas_acumuladas, 0)],
      ...extras,
    ].map(([k, v]) => `<div class="cost-row"><span>${k}</span><strong>${v || '-'}</strong></div>`).join('');

    openModal(p.nombre, `
      ${imgHtml}
      <div class="cost-breakdown">${rows}</div>
      ${p.notas ? `<div class="alert alert-info" style="margin-top:12px">${p.notas}</div>` : ''}
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="prOpenForm(${p.id})">✏️ Editar</button>
        <button class="btn btn-danger" onclick="prDelete(${p.id})">🗑️ Eliminar</button>
      </div>`);
  };

  window.prOpenForm = function (id) {
    const p = id ? (allPrinters.find(x => x.id === id) || {}) : {};
    const tipo = p.tipo || 'FDM';

    openModal(id ? 'Editar Impresora' : 'Nueva Impresora', `
      <form id="pr-form" onsubmit="prSave(event, ${id || 'null'})">
        <div id="pr-photo-preview" style="margin-bottom:12px">
          ${p.foto_path ? `<img src="/${p.foto_path}" class="photo-preview" id="pr-preview-img">` : `<div class="photo-preview" id="pr-preview-img">📷</div>`}
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Foto</label>
          <input type="file" class="form-control" name="foto" accept="image/*" onchange="prPreviewPhoto(this)">
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Nombre *</label><input class="form-control" name="nombre" value="${p.nombre || ''}" required></div>
          <div class="form-group"><label>Marca</label><input class="form-control" name="marca" value="${p.marca || ''}"></div>
          <div class="form-group"><label>Modelo</label><input class="form-control" name="modelo" value="${p.modelo || ''}"></div>
          <div class="form-group"><label>Tipo</label>
            <select class="form-control" name="tipo" id="pr-tipo-sel" onchange="prTypeChange(this.value)">
              ${['FDM','Resina','Laser','CNC'].map(t => `<option ${tipo===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Estado</label>
            <select class="form-control" name="estado">
              ${['Activa','Mantenimiento','Inactiva'].map(s => `<option ${p.estado===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Ubicación</label><input class="form-control" name="ubicacion" value="${p.ubicacion || ''}"></div>
          <div class="form-group"><label>Costo de compra</label><input class="form-control" name="costo_compra" type="number" step="0.01" value="${p.costo_compra || ''}"></div>
          <div class="form-group"><label>Fecha de compra</label><input class="form-control" name="fecha_compra" type="date" value="${p.fecha_compra ? p.fecha_compra.substring(0,10) : ''}"></div>
          <div class="form-group"><label>Consumo (W)</label><input class="form-control" name="consumo_promedio_watts" type="number" value="${p.consumo_promedio_watts || 120}"></div>
          <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2">${p.notas || ''}</textarea></div>
        </div>
        <div id="pr-type-fields"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);

    prTypeChange(tipo, p);
  };

  window.prPreviewPhoto = function (input) {
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const prev = document.getElementById('pr-preview-img');
        if (prev) prev.outerHTML = `<img src="${e.target.result}" class="photo-preview" id="pr-preview-img" style="object-fit:cover">`;
      };
      reader.readAsDataURL(input.files[0]);
    }
  };

  window.prTypeChange = function (tipo, existing) {
    const p = existing || {};
    const container = document.getElementById('pr-type-fields');
    if (!container) return;

    let html = '<div class="form-grid">';
    if (tipo === 'FDM') {
      html += `<div class="form-group form-full"><label><input type="checkbox" name="tiene_ams" value="1" ${p.tiene_ams ? 'checked' : ''}> Tiene AMS / Multi-material</label></div>`;
    } else if (tipo === 'Laser') {
      html += `
        <div class="form-group"><label>Área de trabajo</label><input class="form-control" name="area_trabajo" value="${p.area_trabajo || ''}"></div>
        <div class="form-group"><label>Potencia láser (W)</label><input class="form-control" name="potencia_laser_w" type="number" step="0.1" value="${p.potencia_laser_w || ''}"></div>
        <div class="form-group"><label>Tipo láser</label>
          <select class="form-control" name="tipo_laser">
            ${['CO2','Diodo','Fibra'].map(t => `<option ${p.tipo_laser===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Materiales compatibles</label><input class="form-control" name="materiales_compatibles" value="${p.materiales_compatibles || ''}"></div>`;
    } else if (tipo === 'Resina') {
      html += `
        <div class="form-group"><label>Tipo resina</label>
          <select class="form-control" name="tipo_resina">
            ${['MSLA','DLP','SLA'].map(t => `<option ${p.tipo_resina===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Fuente de luz</label><input class="form-control" name="fuente_luz" value="${p.fuente_luz || ''}"></div>
        <div class="form-group"><label>Velocidad máx (mm/s)</label><input class="form-control" name="velocidad_max_mm" type="number" step="0.1" value="${p.velocidad_max_mm || ''}"></div>
        <div class="form-group"><label>Área de trabajo</label><input class="form-control" name="area_trabajo" value="${p.area_trabajo || ''}"></div>`;
    } else if (tipo === 'CNC') {
      html += `
        <div class="form-group"><label>Área de trabajo</label><input class="form-control" name="area_trabajo" value="${p.area_trabajo || ''}"></div>
        <div class="form-group"><label>Husillo (W)</label><input class="form-control" name="husillo_w" type="number" value="${p.husillo_w || ''}"></div>
        <div class="form-group"><label>Velocidad máx (mm/s)</label><input class="form-control" name="velocidad_max_mm" type="number" step="0.1" value="${p.velocidad_max_mm || ''}"></div>
        <div class="form-group"><label>Materiales compatibles</label><input class="form-control" name="materiales_compatibles" value="${p.materiales_compatibles || ''}"></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  };

  window.prSave = async function (e, id) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);

    // Ensure tiene_ams is 0 if not checked
    if (!form.querySelector('[name=tiene_ams]') || !form.querySelector('[name=tiene_ams]').checked) {
      fd.set('tiene_ams', '0');
    } else {
      fd.set('tiene_ams', '1');
    }

    try {
      const url = id ? `/api/printers/${id}` : '/api/printers';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      closeModal();
      showToast(id ? 'Impresora actualizada' : 'Impresora agregada');
      await refreshPrinters();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.prDelete = function (id) {
    const p = allPrinters.find(x => x.id === id);
    confirmModal(`¿Eliminar impresora "${p?.nombre}"?`, async () => {
      try {
        await api('DELETE', `/api/printers/${id}`);
        closeModal();
        showToast('Impresora eliminada');
        await refreshPrinters();
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };
})();

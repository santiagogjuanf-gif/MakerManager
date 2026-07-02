(function () {
  let allPrinters = [];
  let prPage = 1, prSearch = '';
  let liveData = {}; // cache de status en vivo por printer id
  let liveTimer = null;

  const typeIcon = { FDM: '🖨️', Resina: '🫙', Laser: '🔥', CNC: '🔩' };

  pageLoaders['printers'] = async function loadPrinters() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
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
        <input class="search-input form-control" style="width:260px" placeholder="Buscar impresora..." oninput="prSearch2(this.value)" autocomplete="off">
      </div>
      <div id="pr-grid" class="printer-grid"></div>
      <div class="pagination" id="pr-pagination"></div>`;

    await refreshPrinters();
    fetchAllLive();
    liveTimer = setInterval(fetchAllLive, 30000);
  };

  async function fetchAllLive() {
    const monitored = allPrinters.filter(p => p.octoprint_url && p.octoprint_apikey);
    if (!monitored.length) return;
    await Promise.all(monitored.map(async p => {
      try {
        const d = await api('GET', `/api/printers/${p.id}/live`);
        liveData[p.id] = d;
      } catch { liveData[p.id] = { configured: true, online: false }; }
    }));
    updateLiveBadges();
  }

  function updateLiveBadges() {
    allPrinters.forEach(p => {
      const badge = document.getElementById(`live-badge-${p.id}`);
      if (!badge) return;
      badge.innerHTML = liveBadgeHtml(p.id);
    });
  }

  function liveBadgeHtml(id) {
    const d = liveData[id];
    if (!d || !d.configured) return '';
    if (!d.online) return `<span class="live-badge offline">⚫ Offline</span>`;
    const state = d.printer?.state || '';
    const isPrinting = state.toLowerCase().includes('printing') || (d.job?.progress > 0 && d.job?.progress < 100);
    if (isPrinting) {
      const pct = Math.round(d.job?.progress || 0);
      return `<span class="live-badge printing">🟢 ${pct}%</span>`;
    }
    if (state.toLowerCase().includes('paused')) return `<span class="live-badge paused">🟡 Pausado</span>`;
    return `<span class="live-badge idle">🔵 Listo</span>`;
  }

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
        ? `<img src="${p.foto_path}" class="printer-card-img" style="object-fit:cover" onerror="this.outerHTML='<div class=\\'printer-card-img\\'>${icon}</div>'">`
        : `<div class="printer-card-img">${icon}</div>`;
      const estadoCls = (p.estado || 'activa').toLowerCase().replace('ó', 'o');
      const hasLive = p.monitor_type === 'bambu' ? (p.bambu_ip && p.bambu_serial) : p.monitor_type === 'octoprint' ? (p.octoprint_url && p.octoprint_apikey) : false;
      return `
        <div class="printer-card" onclick="prViewDetail(${p.id})">
          ${imgHtml}
          <div class="printer-card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
              <div class="printer-card-name">${p.nombre || '-'}</div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <span class="badge badge-${estadoCls}">${p.estado || 'Activa'}</span>
                ${hasLive ? `<span id="live-badge-${p.id}">${liveBadgeHtml(p.id)}</span>` : ''}
              </div>
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
  window.prStopLive = function() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } };

  async function prLoadLivePanel(id) {
    const panel = document.getElementById('pr-live-panel');
    if (!panel) return;
    try {
      const d = await api('GET', `/api/printers/${id}/live`);
      liveData[id] = d;
      if (!d.configured) { panel.innerHTML = ''; return; }
      if (!d.online) {
        panel.innerHTML = `<div class="live-monitor offline"><span style="font-size:24px">⚫</span><div><div style="font-weight:700">Offline</div><div style="font-size:11px;color:var(--text-muted)">No se pudo conectar con OctoPrint</div></div></div>`;
        return;
      }
      const pr = d.printer || {};
      const job = d.job || {};
      const isPrinting = (pr.state || '').toLowerCase().includes('printing') || (job.progress > 0 && job.progress < 100);
      const pct = Math.round(job.progress || 0);

      const tempRow = (label, t) => t ? `<div class="live-temp"><span>${label}</span><strong>${Math.round(t.actual || 0)}°<small>/${Math.round(t.target || 0)}°</small></strong></div>` : '';
      const temps = [
        tempRow('🔧 Extrusor', pr.tool0),
        tempRow('🔧 Extrusor 2', pr.tool1),
        tempRow('🛏️ Cama', pr.bed),
        tempRow('📦 Cámara', pr.chamber),
      ].filter(Boolean).join('');

      const layerHtml = pr.layer ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">📐 Capa ${pr.layer.current} / ${pr.layer.total}</div>` : '';

      const amsHtml = d.ams && d.ams.length ? `
        <div style="margin-top:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px">🔄 AMS</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${d.ams.map(slot => `
              <div style="display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:5px 8px;font-size:11px">
                <div style="width:14px;height:14px;border-radius:50%;background:${slot.color || '#888'};border:1px solid rgba(255,255,255,0.2);flex-shrink:0"></div>
                <div>
                  <div style="font-weight:700">${slot.material}</div>
                  ${slot.remain != null ? `<div style="color:var(--text-muted)">${slot.remain}%</div>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>` : '';

      const fmtTime = (s) => {
        if (!s && s !== 0) return '-';
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      };

      panel.innerHTML = `
        <div class="live-monitor ${isPrinting ? 'printing' : 'idle'}">
          <div class="live-monitor-top">
            <div class="live-status-dot ${isPrinting ? 'pulse' : ''}"></div>
            <div>
              <div style="font-weight:700;font-size:14px">${pr.state || 'Desconocido'}</div>
              ${job.file ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">📄 ${job.file}</div>` : ''}
            </div>
            <button onclick="prLoadLivePanel(${id})" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px" title="Actualizar">🔄</button>
          </div>
          ${isPrinting ? `
          <div class="live-progress-bar"><div class="live-progress-fill" style="width:${pct}%"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px">
            <span>${pct}% completado</span>
            <span>⏱️ Restante: ${fmtTime(job.printTimeLeft)}</span>
          </div>
          ${layerHtml}` : ''}
          ${temps ? `<div class="live-temps">${temps}</div>` : ''}
          ${amsHtml}
        </div>`;

      updateLiveBadges();
    } catch (e) {
      if (document.getElementById('pr-live-panel')) {
        document.getElementById('pr-live-panel').innerHTML = `<div class="alert alert-warning" style="font-size:12px">Error: ${e.message}</div>`;
      }
    }
  }
  window.prLoadLivePanel = prLoadLivePanel;

  window.prViewDetail = function (id) {
    const p = allPrinters.find(x => x.id === id);
    if (!p) return;
    const icon = typeIcon[p.tipo] || '🖨️';
    const imgHtml = p.foto_path
      ? `<img src="${p.foto_path}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:16px">`
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
      ['Costo/hora (depreciación)', fmtMoney(p.costo_por_hora)],
      ['Horas acumuladas', fmtNum(p.horas_acumuladas, 0)],
      ['Vida útil estimada', `${p.vida_util_horas || 3000}h`],
      ...extras,
    ].map(([k, v]) => `<div class="cost-row"><span>${k}</span><strong>${v || '-'}</strong></div>`).join('');

    const hasMonitor = p.monitor_type === 'bambu'
      ? (p.bambu_ip && p.bambu_serial && p.bambu_access_code)
      : p.monitor_type === 'octoprint'
        ? (p.octoprint_url && p.octoprint_apikey)
        : false;

    const livePanel = hasMonitor
      ? `<div id="pr-live-panel" style="margin-bottom:12px"><div style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px">⏳ Cargando estado en vivo...</div></div>`
      : '';

    openModal(p.nombre, `
      ${imgHtml}
      ${livePanel}
      <div class="cost-breakdown">${rows}</div>
      ${p.notas ? `<div class="alert alert-info" style="margin-top:12px">${p.notas}</div>` : ''}
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="prOpenForm(${p.id})">✏️ Editar</button>
        <button class="btn btn-danger" onclick="prDelete(${p.id})">🗑️ Eliminar</button>
      </div>`);

    if (hasMonitor) {
      prLoadLivePanel(p.id);
    }
  };

  window.prOpenForm = function (id) {
    const p = id ? (allPrinters.find(x => x.id === id) || {}) : {};
    const tipo = p.tipo || 'FDM';

    openModal(id ? 'Editar Impresora' : 'Nueva Impresora', `
      <form id="pr-form" onsubmit="prSave(event, ${id || 'null'})">
        <div id="pr-photo-preview" style="margin-bottom:12px">
          ${p.foto_path ? `<img src="${p.foto_path}" class="photo-preview" id="pr-preview-img">` : `<div class="photo-preview" id="pr-preview-img">📷</div>`}
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label>Foto</label>
          <input type="file" class="form-control" name="foto" accept="image/*" onchange="prPreviewPhoto(this)" autocomplete="off">
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Nombre *</label><input class="form-control" name="nombre" value="${p.nombre || ''}" required autocomplete="off"></div>
          <div class="form-group"><label>Marca</label><input class="form-control" name="marca" value="${p.marca || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Modelo</label><input class="form-control" name="modelo" value="${p.modelo || ''}" autocomplete="off"></div>
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
          <div class="form-group"><label>Ubicación</label><input class="form-control" name="ubicacion" value="${p.ubicacion || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Costo de compra</label><input class="form-control" name="costo_compra" type="number" step="0.01" value="${p.costo_compra || ''}" autocomplete="off"></div>
          <div class="form-group"><label>Fecha de compra</label><input class="form-control" name="fecha_compra" type="date" value="${p.fecha_compra ? p.fecha_compra.substring(0,10) : ''}" autocomplete="off"></div>
          <div class="form-group"><label>Horas acumuladas</label><input class="form-control" name="horas_acumuladas" type="number" step="0.1" min="0" value="${p.horas_acumuladas || 0}" autocomplete="off"></div>
          <div class="form-group"><label>Vida útil estimada (h) <span style="font-size:10px;color:var(--text-muted)">para depreciación</span></label><input class="form-control" name="vida_util_horas" type="number" min="100" value="${p.vida_util_horas || 3000}" autocomplete="off"></div>
          <div class="form-group"><label>Consumo (W)</label><input class="form-control" name="consumo_promedio_watts" type="number" value="${p.consumo_promedio_watts || 120}" autocomplete="off"></div>
          <div class="form-group form-full"><label>Notas</label><textarea class="form-control" name="notas" rows="2" autocomplete="off">${p.notas || ''}</textarea></div>
        </div>
        <div id="pr-type-fields"></div>

        <!-- Monitoreo en vivo -->
        <div style="margin-top:16px;padding:14px;background:var(--surface);border-radius:10px;border:1px solid var(--border)">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--text)">📡 Monitoreo en vivo</div>
          <div class="form-group" style="margin-bottom:10px">
            <label>Tipo de monitoreo</label>
            <select class="form-control" name="monitor_type" id="pr-monitor-type" onchange="prMonitorTypeChange(this.value)">
              <option value="none" ${(p.monitor_type||'none')==='none'?'selected':''}>Sin monitoreo</option>
              <option value="bambu" ${p.monitor_type==='bambu'?'selected':''}>🐼 Bambu Lab (WiFi local)</option>
              <option value="octoprint" ${p.monitor_type==='octoprint'?'selected':''}>🐙 OctoPrint</option>
            </select>
          </div>
          <div id="pr-monitor-fields"></div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);

    prTypeChange(tipo, p);
    prMonitorTypeChange(p.monitor_type || 'none', p);
  };

  window.prMonitorTypeChange = function(type, existing) {
    const p = existing || {};
    const container = document.getElementById('pr-monitor-fields');
    if (!container) return;
    if (type === 'bambu') {
      container.innerHTML = `
        <div class="form-grid">
          <div class="form-group form-full">
            <label>IP de la impresora <span style="font-size:10px;color:var(--text-muted)">(ej: 192.168.1.50)</span></label>
            <input class="form-control" name="bambu_ip" value="${p.bambu_ip || ''}" placeholder="192.168.1.50" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Número de serie</label>
            <input class="form-control" name="bambu_serial" value="${p.bambu_serial || ''}" placeholder="01P00A..." autocomplete="off">
          </div>
          <div class="form-group">
            <label>Access Code</label>
            <input class="form-control" name="bambu_access_code" value="${p.bambu_access_code || ''}" placeholder="Código de 8 dígitos" autocomplete="off">
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          💡 <strong>Cómo obtener los datos:</strong> En tu Bambu → pantalla táctil → <em>Settings → Network</em> → activa <em>LAN Mode</em>. El serial y Access Code aparecen ahí mismo.
        </div>`;
    } else if (type === 'octoprint') {
      container.innerHTML = `
        <div class="form-grid">
          <div class="form-group form-full">
            <label>URL de OctoPrint</label>
            <input class="form-control" name="octoprint_url" value="${p.octoprint_url || ''}" placeholder="http://192.168.1.100" autocomplete="off">
          </div>
          <div class="form-group form-full">
            <label>API Key</label>
            <input class="form-control" name="octoprint_apikey" value="${p.octoprint_apikey || ''}" placeholder="Settings → API en OctoPrint" autocomplete="off">
          </div>
        </div>`;
    } else {
      container.innerHTML = '';
    }
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
      html += `<div class="form-group form-full"><label><input type="checkbox" name="tiene_ams" value="1" ${p.tiene_ams ? 'checked' : ''} autocomplete="off"> Tiene AMS / Multi-material</label></div>`;
    } else if (tipo === 'Laser') {
      html += `
        <div class="form-group"><label>Área de trabajo</label><input class="form-control" name="area_trabajo" value="${p.area_trabajo || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Potencia láser (W)</label><input class="form-control" name="potencia_laser_w" type="number" step="0.1" value="${p.potencia_laser_w || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Tipo láser</label>
          <select class="form-control" name="tipo_laser">
            ${['CO2','Diodo','Fibra'].map(t => `<option ${p.tipo_laser===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Materiales compatibles</label><input class="form-control" name="materiales_compatibles" value="${p.materiales_compatibles || ''}" autocomplete="off"></div>`;
    } else if (tipo === 'Resina') {
      html += `
        <div class="form-group"><label>Tipo resina</label>
          <select class="form-control" name="tipo_resina">
            ${['MSLA','DLP','SLA'].map(t => `<option ${p.tipo_resina===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Fuente de luz</label><input class="form-control" name="fuente_luz" value="${p.fuente_luz || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Velocidad máx (mm/s)</label><input class="form-control" name="velocidad_max_mm" type="number" step="0.1" value="${p.velocidad_max_mm || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Área de trabajo</label><input class="form-control" name="area_trabajo" value="${p.area_trabajo || ''}" autocomplete="off"></div>`;
    } else if (tipo === 'CNC') {
      html += `
        <div class="form-group"><label>Área de trabajo</label><input class="form-control" name="area_trabajo" value="${p.area_trabajo || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Husillo (W)</label><input class="form-control" name="husillo_w" type="number" value="${p.husillo_w || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Velocidad máx (mm/s)</label><input class="form-control" name="velocidad_max_mm" type="number" step="0.1" value="${p.velocidad_max_mm || ''}" autocomplete="off"></div>
        <div class="form-group"><label>Materiales compatibles</label><input class="form-control" name="materiales_compatibles" value="${p.materiales_compatibles || ''}" autocomplete="off"></div>`;
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
    const invNames = { FDM:'filamentos', Resina:'resinas', Laser:'consumibles láser', CNC:'consumibles CNC' };
    const invName = invNames[p?.tipo] || 'inventario';
    confirmModal(`¿Eliminar impresora "${p?.nombre}"?`, () => {
      openModal('¿Qué hacemos con el inventario?', `
        <div style="text-align:center;padding:16px">
          <div style="font-size:40px;margin-bottom:12px">📦</div>
          <p style="margin-bottom:24px;color:var(--text)">¿Deseas también eliminar los <strong>${invName}</strong> asociados a este tipo de impresora?</p>
          <div class="form-actions" style="justify-content:center;gap:12px">
            <button class="btn btn-secondary" onclick="prDoDelete(${id},false)">Mantener inventario</button>
            <button class="btn btn-danger" onclick="prDoDelete(${id},true)">Eliminar también</button>
          </div>
        </div>`);
    }, '🗑️');
  };

  window.prDoDelete = async function(id, deleteInventory) {
    try {
      const res = await fetch(`/api/printers/${id}?delete_inventory=${deleteInventory}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + getToken() }
      });
      if (!res.ok) throw new Error('Error eliminando');
      closeModal();
      showToast('Impresora eliminada');
      await refreshPrinters();
    } catch(err) { showToast('Error: ' + err.message, 'error'); }
  };
})();

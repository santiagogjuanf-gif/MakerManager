(function () {
  let allJobs = [], allClients = [], allPrinters = [], allFilaments = [];
  let jobPage = 1, jobSearch = '', jobViewMode = 'list';
  let _appCfg = {};

  const STAGES = [
    { key: 'Solicitud',     label: 'Solicitud',     color: 'badge-default',   next: 'Levantamiento' },
    { key: 'Levantamiento', label: 'Levantamiento', color: 'badge-regular',   next: 'Producción' },
    { key: 'Producción',    label: 'Producción',    color: 'badge-frecuente', next: 'Cierre' },
    { key: 'Cierre',        label: 'Cierre',        color: 'badge-vip',       next: null },
  ];
  function stageIndex(estado) {
    const i = STAGES.findIndex(s => s.key === (estado || 'Solicitud'));
    return i === -1 ? 0 : i;
  }
  function stageBadge(estado) {
    const s = STAGES[stageIndex(estado)];
    return `<span class="badge ${s.color}">${s.label}</span>`;
  }

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
          <div class="page-subtitle">Gestión de órdenes de producción</div>
        </div>
      </div>
      <div class="fil-toolbar-top" style="margin-bottom:12px">
        <button class="btn btn-secondary" onclick="openCalculator()" title="Calcular costo">🧮 Calculadora</button>
        <button class="btn btn-primary" onclick="jobOpenForm()">＋ Nuevo Trabajo</button>
        <input class="search-input form-control" style="flex:1;max-width:300px" placeholder="Buscar trabajo..." oninput="jobSearch2(this.value)" autocomplete="off">
        <div style="display:flex;gap:2px;background:var(--surface);border-radius:8px;padding:3px;border:1px solid var(--border)">
          <button id="job-view-list" class="btn btn-sm ${jobViewMode==='list'?'btn-primary':'btn-secondary'}" onclick="jobSetView('list')" style="padding:4px 10px">☰ Lista</button>
          <button id="job-view-kanban" class="btn btn-sm ${jobViewMode==='kanban'?'btn-primary':'btn-secondary'}" onclick="jobSetView('kanban')" style="padding:4px 10px">📋 Tablero</button>
        </div>
      </div>
      <div id="job-cards"></div>
      <div class="pagination" id="job-pagination"></div>`;

    await refreshJobs();

    if (window._jobToOpen) {
      const id = window._jobToOpen;
      delete window._jobToOpen;
      setTimeout(() => jobView(id), 150);
    }
  };

  async function refreshJobs() {
    try {
      [allJobs, allClients, allPrinters, allFilaments, _appCfg] = await Promise.all([
        api('GET', '/api/jobs'),
        api('GET', '/api/clients'),
        api('GET', '/api/printers'),
        api('GET', '/api/filaments'),
        api('GET', '/api/config').catch(() => ({})),
      ]);
    } catch (e) { allJobs = []; allClients = []; allPrinters = []; allFilaments = []; }
    jobPage = 1;
    renderJobs();
  }

  window.jobSetView = function(mode) {
    jobViewMode = mode;
    document.getElementById('job-view-list')?.classList.toggle('btn-primary', mode === 'list');
    document.getElementById('job-view-list')?.classList.toggle('btn-secondary', mode !== 'list');
    document.getElementById('job-view-kanban')?.classList.toggle('btn-primary', mode === 'kanban');
    document.getElementById('job-view-kanban')?.classList.toggle('btn-secondary', mode !== 'kanban');
    renderJobs();
  };

  // ─── TABLERO (KANBAN) ─────────────────────────────────────────────────────────

  function camaPct(j) {
    const camas = j.camas || [];
    if (!camas.length) return null;
    const done = camas.filter(c => c.completada).length;
    return Math.round(done / camas.length * 100);
  }

  function renderKanban(filtered) {
    const BOARD_STAGES = [
      { key: 'Solicitud',     icon: '📥', color: '#6366f1' },
      { key: 'Levantamiento', icon: '📐', color: '#f59e0b' },
      { key: 'Producción',    icon: '🖨️', color: '#3b82f6' },
      { key: 'Cierre',        icon: '✅', color: '#22c55e' },
    ];
    const byStage = {};
    BOARD_STAGES.forEach(s => byStage[s.key] = []);
    filtered.forEach(j => {
      const key = j.estado || 'Solicitud';
      if (byStage[key]) byStage[key].push(j);
      else byStage['Solicitud'].push(j);
    });

    const cols = BOARD_STAGES.map(st => {
      const jobs = byStage[st.key] || [];
      const cards = jobs.length === 0
        ? `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px 8px">Sin trabajos</div>`
        : jobs.map(j => {
            const pct = st.key === 'Producción' ? camaPct(j) : null;
            const printerName = j.impresora_id ? (allPrinters.find(p => p.id === j.impresora_id)?.nombre || '') : '';
            const progressBar = pct !== null ? `
              <div style="margin-top:8px">
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:3px">
                  <span>${pct}% completado</span>
                  ${printerName ? `<span>🖨️ ${printerName}</span>` : ''}
                </div>
                <div style="height:5px;background:var(--border);border-radius:3px">
                  <div style="height:100%;background:${st.color};border-radius:3px;width:${pct}%;transition:width 0.3s"></div>
                </div>
              </div>` : (printerName ? `<div style="font-size:10px;color:var(--text-muted);margin-top:6px">🖨️ ${printerName}</div>` : '');
            return `
              <div onclick="jobView(${j.id})" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s"
                onmouseover="this.style.borderColor='${st.color}'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.3;margin-bottom:3px">${j.nombre_proyecto||'Sin nombre'}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">👥 ${j.cliente_nombre||'—'}</div>
                ${j.precio_final ? `<div style="font-size:12px;font-weight:800;color:${st.color}">${fmtMoney(j.precio_final)}</div>` : ''}
                ${progressBar}
                <div style="display:flex;gap:4px;margin-top:8px" onclick="event.stopPropagation()">
                  <button class="btn btn-secondary btn-sm" style="flex:1;font-size:11px" onclick="jobOpenForm(${j.id})">✏️</button>
                  <button class="btn btn-danger btn-sm" style="font-size:11px" onclick="jobDelete(${j.id})">🗑️</button>
                </div>
              </div>`;
          }).join('');
      return `<div style="flex:1;min-width:220px;max-width:300px">
        <div style="background:${st.color}22;border:1px solid ${st.color}44;border-radius:12px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>${st.icon}</span>
          <span style="font-size:12px;font-weight:700;color:${st.color}">${st.key}</span>
          <span style="margin-left:auto;background:${st.color};color:white;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px">${jobs.length}</span>
        </div>
        ${cards}
      </div>`;
    }).join('');

    return `<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;align-items:flex-start">${cols}</div>`;
  }

  function renderJobs() {
    const q = jobSearch.toLowerCase();
    const filtered = allJobs.filter(j =>
      `${j.nombre_proyecto} ${j.cliente_nombre} ${j.id}`.toLowerCase().includes(q)
    );
    const { items, totalPages, page } = paginate(filtered, jobPage);
    jobPage = page;

    const container = document.getElementById('job-cards');
    if (!container) return;

    if (jobViewMode === 'kanban') {
      container.innerHTML = renderKanban(filtered);
      document.getElementById('job-pagination').innerHTML = '';
      return;
    }

    if (!items.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>Sin trabajos</div>';
      renderPaginationInline('job-pagination', jobPage, totalPages, p => { jobPage = p; renderJobs(); });
      return;
    }

    container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
    ${items.map(j => {
      const pct = camaPct(j);
      const fallo = j.fallo ? '<span class="badge badge-low" style="margin-left:4px">Falló</span>' : '';
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:all 0.2s" onclick="jobView(${j.id})" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="font-weight:700;font-size:14px;color:var(--text);line-height:1.3;flex:1">${j.nombre_proyecto || 'Sin nombre'}${fallo}</div>
          ${stageBadge(j.estado)}
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)">
          <span>👥 ${j.cliente_nombre||'—'}</span>
          <span style="margin-left:auto">📅 ${j.fecha ? j.fecha.substring(0,10) : '-'}</span>
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--accent-light)">${fmtMoney(j.precio_final)}</div>
        ${pct !== null ? `<div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:3px"><span>Progreso</span><span>${pct}%</span></div>
          <div style="height:5px;background:var(--border);border-radius:3px"><div style="height:100%;background:var(--accent);border-radius:3px;width:${pct}%"></div></div>
        </div>` : ''}
        <div style="display:flex;gap:6px;margin-top:2px" onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="jobView(${j.id})">👁️ Ver</button>
          <button class="btn btn-secondary btn-sm" onclick="jobOpenForm(${j.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="jobDelete(${j.id})">🗑️</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;

    renderPaginationInline('job-pagination', jobPage, totalPages, p => { jobPage = p; renderJobs(); });
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

  // ─── VIEW MODAL ──────────────────────────────────────────────────────────────

  window.jobView = async function (id) {
    try {
      const j = await api('GET', `/api/jobs/${id}`);
      const idx = stageIndex(j.estado);
      const clienteName = allClients.find(c => c.id === j.cliente_id)?.nombre || '-';
      const printerName = allPrinters.find(p => p.id === j.impresora_id)?.nombre || '-';
      const lev = parseLev(j.levantamiento_datos);
      const camas = j.camas || [];

      let sections = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <div style="font-size:13px"><span style="color:var(--text-muted)">👥</span> <strong>${clienteName}</strong></div>
          <div style="font-size:13px"><span style="color:var(--text-muted)">📅</span> ${j.fecha ? j.fecha.substring(0,10) : '-'}</div>
          ${j.tipo_precio ? tierBadge(j.tipo_precio) : ''}
        </div>
        ${j.descripcion ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">${j.descripcion}</div>` : ''}`;

      if (idx >= 1) {
        const fils = lev.filamentos || j.filaments || [];
        const spoolsHtml = fils.filter(f => (f.gramos||f.gramos_pieza||0) > 0).map(f => {
          const g = f.gramos || f.gramos_pieza || 0;
          const hex = f.color_hex || colorHex(f.color||'');
          const spoolEl = typeof makeSpool === 'function' && f.material
            ? makeSpool({ marca:f.marca||'', material:f.material||'', color:f.color||'', color_hex:f.color_hex||'', acabado:f.acabado||'' }, 52)
            : `<div style="width:52px;height:52px;border-radius:50%;background:${hex};border:2px solid var(--border)"></div>`;
          const inv = allFilaments.find(af => af.id === (f.fil_id||f.filamento_id));
          const stock = inv ? inv.peso_actual_g : null;
          const warn = stock !== null && stock < g;
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:70px">
            ${spoolEl}
            <div style="font-size:10px;font-weight:700;text-align:center;max-width:72px;line-height:1.3">${f.nombre||f.material||'—'}</div>
            <div style="font-size:11px;color:var(--accent);font-weight:700">${fmtNum(g,1)}g</div>
            ${warn ? `<div style="font-size:9px;background:#ef444422;color:#ef4444;border-radius:4px;padding:1px 5px;text-align:center">⚠️ Stock: ${fmtNum(stock,0)}g</div>` : (stock !== null ? `<div style="font-size:9px;color:var(--text-muted)">Stock: ${fmtNum(stock,0)}g</div>` : '')}
          </div>`;
        }).join('');

        const hImp = lev.tiempo_h !== undefined ? (parseFloat(lev.tiempo_h||0)+parseFloat(lev.tiempo_m||0)/60) : (j.tiempo_impresion_min||0)/60;
        const hMO  = lev.mo_h !== undefined ? (parseFloat(lev.mo_h||0)+parseFloat(lev.mo_m||0)/60) : 0;
        const hStr = n => n >= 1 ? `${Math.floor(n)}h ${Math.round((n%1)*60)}min` : n > 0 ? `${Math.round(n*60)}min` : '-';
        const printerLev = lev.printer || (j.impresora_id ? printerName : null);

        sections += `
          <div style="font-weight:700;color:var(--accent-light);margin:4px 0 10px;font-size:13px">📐 Levantamiento</div>
          ${spoolsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px">${spoolsHtml}</div>` : ''}
          <div class="cost-breakdown">
            ${printerLev ? `<div class="cost-row"><span>🖨️ Impresora</span><strong>${printerLev}</strong></div>` : ''}
            ${hImp > 0 ? `<div class="cost-row"><span>⏱️ Tiempo impresión</span><strong>${hStr(hImp)}</strong></div>` : ''}
            ${hMO > 0 ? `<div class="cost-row"><span>👷 Mano de obra</span><strong>${hStr(hMO)}</strong></div>` : ''}
            ${j.precio_final ? `<div class="cost-row total"><span>Precio final · ${j.tipo_precio||''}</span><strong>${fmtMoney(j.precio_final)}</strong></div>` : ''}
          </div>
          ${j.notas ? `<div class="alert alert-info" style="margin-top:8px">${j.notas}</div>` : ''}`;

        if (camas.length > 0) {
          const done = camas.filter(c => c.completada).length;
          const pct  = Math.round(done / camas.length * 100);
          sections += `
            <div style="font-weight:700;color:var(--accent-light);margin:14px 0 8px;font-size:13px">🛏️ Camas (${done}/${camas.length})</div>
            <div style="background:var(--surface);border-radius:6px;padding:6px 10px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px"><span>${done}/${camas.length} completadas</span><span>${pct}%</span></div>
              <div style="height:7px;background:var(--border);border-radius:4px"><div style="height:100%;background:var(--accent);border-radius:4px;width:${pct}%"></div></div>
            </div>`;
          if (idx >= 2) {
            sections += camas.map(c => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer" onclick="jobToggleCama(${id},${c.id})">
                <span style="font-size:20px">${c.completada ? '✅' : '⬜'}</span>
                <span style="flex:1;${c.completada?'text-decoration:line-through;opacity:0.5':''}">Cama ${c.numero}${c.descripcion?' — '+c.descripcion:''}</span>
                ${c.completada_at ? `<span style="font-size:10px;color:var(--text-muted)">${c.completada_at}</span>` : ''}
              </div>`).join('');
          } else {
            sections += camas.map(c => `
              <div style="display:flex;align-items:center;gap:10px;padding:6px 4px;color:var(--text-muted);font-size:12px">
                <span>⬜</span><span>Cama ${c.numero}${c.descripcion?' — '+c.descripcion:''}</span>
              </div>`).join('');
          }
        }
      }

      if (idx >= 2 && j.notas_produccion) {
        sections += `<div class="alert alert-warning" style="margin-top:10px">${j.notas_produccion}</div>`;
      }

      if (idx >= 3) {
        const prodRows = (j.products || []).map(p =>
          `<div class="cost-row"><span>${p.descripcion||'-'}</span><strong>×${p.cantidad}</strong></div>`).join('');
        const extraRows = (j.extras || []).map(x =>
          `<div class="cost-row"><span>${x.nombre_extra||'-'} ×${x.cantidad}</span><strong>${fmtMoney(x.costo_total)}</strong></div>`).join('');
        sections += `
          <div style="font-weight:700;color:var(--accent-light);margin:14px 0 8px;font-size:13px">✅ Cierre</div>
          ${prodRows ? `<div class="cost-breakdown" style="margin-bottom:8px">${prodRows}</div>` : ''}
          ${extraRows ? `<div class="cost-breakdown">${extraRows}</div>` : ''}
          ${j.requiere_factura ? `<div class="alert alert-warning" style="margin-top:8px">⚠️ Requiere factura</div>` : ''}`;
      }

      const nextStage = STAGES[idx].next;
      let nextBtn = '';
      if (nextStage === 'Levantamiento') {
        nextBtn = `<button class="btn btn-primary" onclick="closeModal();jobGoToLevantamiento(${j.id})">📐 Levantamiento →</button>`;
      } else if (nextStage === 'Producción') {
        nextBtn = `<button class="btn btn-primary" onclick="closeModal();jobJustAdvance(${j.id},'Producción')">🖨️ Pasar a Producción</button>`;
      } else if (nextStage === 'Cierre') {
        nextBtn = `<button class="btn btn-primary" onclick="closeModal();jobOpenForm(${j.id})">✅ Cierre →</button>`;
      }

      openModal(`#${j.id} — ${j.nombre_proyecto || 'Sin nombre'} ${stageBadge(j.estado)}`, `
        ${sections}
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal();jobOpenForm(${j.id})">✏️ Editar</button>
          ${nextBtn}
          <button class="btn btn-danger" onclick="jobDelete(${j.id})">🗑️</button>
        </div>`);
    } catch (e) { showToast('Error cargando trabajo: ' + e.message, 'error'); }
  };

  function parseLev(raw) {
    try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { return {}; }
  }

  function tierBadge(tier) {
    const map = { unitario: ['badge-default','Unitario'], menudeo: ['badge-regular','Menudeo'], mayoreo: ['badge-frecuente','Mayoreo'] };
    const [cls, label] = map[tier] || ['badge-default', tier];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  // Go to Levantamiento: advance estado and open form
  window.jobGoToLevantamiento = async function(id) {
    try {
      await api('PUT', `/api/jobs/${id}`, { estado: 'Levantamiento' });
      await jobOpenForm(id);
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  };

  window.jobJustAdvance = async function(id, newStage) {
    try {
      await api('PUT', `/api/jobs/${id}`, { estado: newStage });
      showToast(`Avanzado a ${newStage}`);
      await refreshJobs();
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  };

  window.jobToggleCama = async function(jobId, camaId) {
    try {
      await api('PATCH', `/api/jobs/${jobId}/camas/${camaId}`, {});
      closeModal();
      await jobView(jobId);
      await refreshJobs();
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  };

  // ─── SOLICITUD ───────────────────────────────────────────────────────────────

  function renderSolicitudFields(j) {
    const clientOptions = allClients.map(c =>
      `<option value="${c.id}" ${j.cliente_id == c.id ? 'selected' : ''}>${c.nombre}</option>`
    ).join('');
    return `
      <div style="font-weight:700;color:var(--accent-light);margin-bottom:10px">📥 Solicitud</div>
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group form-full"><label>Nombre del proyecto *</label><input class="form-control" name="nombre_proyecto" value="${j.nombre_proyecto||''}" required autocomplete="off"></div>
        <div class="form-group"><label>Cliente</label><select class="form-control" name="cliente_id"><option value="">— Sin cliente —</option>${clientOptions}</select></div>
        <div class="form-group"><label>Fecha</label><input class="form-control" name="fecha" type="date" value="${j.fecha ? j.fecha.substring(0,10) : new Date().toISOString().substring(0,10)}" autocomplete="off"></div>
        <div class="form-group form-full"><label>Descripción / requerimiento</label><textarea class="form-control" name="descripcion" rows="2" autocomplete="off">${j.descripcion||''}</textarea></div>
      </div>`;
  }

  // ─── LEVANTAMIENTO (calculator-style) ────────────────────────────────────────

  let _jlevFilCount = 0;

  function jlevFilRowHtml(i, selectedId, grams) {
    const opts = allFilaments.map(f =>
      `<option value="${f.id}" ${f.id == selectedId ? 'selected' : ''}>${f.marca||''} ${f.nombre_comercial||''} — ${f.material} ${f.color}</option>`
    ).join('');
    const fil = selectedId ? allFilaments.find(f => f.id == selectedId) : null;
    const hex = fil ? (fil.color_hex || colorHex(fil.color||'')) : 'var(--border)';
    const stock = fil ? fil.peso_actual_g : null;
    const warn  = stock !== null && grams > 0 && stock < grams;
    return `<div class="extra-item" id="jlev-fil-${i}" style="align-items:center;gap:8px;flex-wrap:wrap">
      <div id="jlev-fil-dot-${i}" style="width:24px;height:24px;border-radius:50%;background:${hex};border:2px solid var(--border);flex-shrink:0"></div>
      <select class="form-control" id="jlev-fil-sel-${i}" style="flex:2;min-width:140px" onchange="jlevFilChange(${i})">
        <option value="">— Filamento —</option>${opts}
      </select>
      <div style="display:flex;align-items:center;gap:4px">
        <input class="form-control" id="jlev-fil-g-${i}" type="number" step="0.1" value="${grams||''}" placeholder="g" style="width:80px" oninput="jlevRecalc()">
        <span style="font-size:11px;color:var(--text-muted)">g</span>
      </div>
      <div id="jlev-fil-stock-${i}" style="font-size:10px;${warn?'color:#ef4444':'color:var(--text-muted)'}">
        ${stock !== null ? (warn ? `⚠️ Stock: ${fmtNum(stock,0)}g` : `✓ ${fmtNum(stock,0)}g`) : ''}
      </div>
      <button type="button" class="btn btn-danger btn-sm" onclick="jlevRemFil(${i})">✕</button>
    </div>`;
  }

  window.jlevFilChange = function(i) {
    const sel = document.getElementById(`jlev-fil-sel-${i}`);
    const fil = sel?.value ? allFilaments.find(f => f.id == sel.value) : null;
    const hex = fil ? (fil.color_hex || colorHex(fil.color||'')) : 'var(--border)';
    const dot = document.getElementById(`jlev-fil-dot-${i}`);
    if (dot) { dot.style.background = hex; }
    jlevRecalc();
    // Update stock display
    const gEl = document.getElementById(`jlev-fil-g-${i}`);
    const stock = fil ? fil.peso_actual_g : null;
    const g = parseFloat(gEl?.value)||0;
    const stockEl = document.getElementById(`jlev-fil-stock-${i}`);
    if (stockEl) {
      const warn = stock !== null && g > 0 && stock < g;
      stockEl.style.color = warn ? '#ef4444' : 'var(--text-muted)';
      stockEl.textContent = stock !== null ? (warn ? `⚠️ Stock: ${fmtNum(stock,0)}g` : `✓ ${fmtNum(stock,0)}g`) : '';
    }
  };

  window.jlevAddFil = function() {
    const list = document.getElementById('jlev-fils');
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = jlevFilRowHtml(_jlevFilCount, null, '');
    list.appendChild(wrap.firstChild);
    _jlevFilCount++;
  };

  window.jlevRemFil = function(i) {
    document.getElementById(`jlev-fil-${i}`)?.remove();
    jlevRecalc();
  };

  window.jlevRecalc = function() {
    const prSel = document.getElementById('jlev-printer-sel');
    const printer = prSel?.value ? allPrinters.find(p => p.id == prSel.value) : null;
    const hImp = (parseFloat(document.getElementById('jlev-h')?.value)||0)
               + (parseFloat(document.getElementById('jlev-m')?.value)||0)/60;
    const hMO  = (parseFloat(document.getElementById('jlev-mo-h')?.value)||0)
               + (parseFloat(document.getElementById('jlev-mo-m')?.value)||0)/60;

    let costoFil = 0;
    for (let i = 0; i < _jlevFilCount; i++) {
      const sel = document.getElementById(`jlev-fil-sel-${i}`);
      const gEl = document.getElementById(`jlev-fil-g-${i}`);
      if (!sel?.value || !gEl) continue;
      const fil = allFilaments.find(f => f.id == sel.value);
      const g = parseFloat(gEl.value)||0;
      if (fil) costoFil += g * (fil.costo_por_gramo||0);
      // Live stock check
      const stockEl = document.getElementById(`jlev-fil-stock-${i}`);
      if (stockEl && fil) {
        const warn = fil.peso_actual_g < g && g > 0;
        stockEl.style.color = warn ? '#ef4444' : 'var(--text-muted)';
        stockEl.textContent = warn ? `⚠️ Stock: ${fmtNum(fil.peso_actual_g,0)}g` : `✓ ${fmtNum(fil.peso_actual_g,0)}g`;
      }
    }

    const kwh = printer ? ((printer.consumo_promedio_watts||0)/1000)*hImp : 0;
    const costoLuz = kwh * (parseFloat(_appCfg.costo_kwh)||0.18);
    const costoMaq = printer ? hImp*(printer.costo_por_hora||0) : 0;
    const costoEmb = parseFloat(document.getElementById('jlev-embalaje')?.value)||0;
    const costoMO  = hMO * (parseFloat(_appCfg.tarifa_hora)||25);
    const costoBase = costoFil + costoLuz + costoMaq + costoMO + costoEmb;

    const t = { mu: parseFloat(_appCfg.margen_unitario)||2.2, mm: parseFloat(_appCfg.margen_menudeo)||1.9, mmay: parseFloat(_appCfg.margen_mayoreo)||1.5 };
    const tier = document.getElementById('jlev-tier')?.value || 'menudeo';
    const margin = tier === 'unitario' ? t.mu : tier === 'mayoreo' ? t.mmay : t.mm;
    const precio = costoBase * margin;

    const s = id => document.getElementById(id);
    if (s('jlev-sum-fil'))    s('jlev-sum-fil').textContent    = fmtMoney(costoFil);
    if (s('jlev-sum-luz'))    s('jlev-sum-luz').textContent    = fmtMoney(costoLuz);
    if (s('jlev-sum-maq'))    s('jlev-sum-maq').textContent    = fmtMoney(costoMaq);
    if (s('jlev-sum-mo'))     s('jlev-sum-mo').textContent     = fmtMoney(costoMO);
    if (s('jlev-sum-emb'))    s('jlev-sum-emb').textContent    = fmtMoney(costoEmb);
    if (s('jlev-sum-base'))   s('jlev-sum-base').textContent   = fmtMoney(costoBase);
    if (s('jlev-sum-precio')) s('jlev-sum-precio').textContent = fmtMoney(precio);

    const pf = document.getElementById('jlev-precio-final');
    if (pf && !pf.dataset.manual) pf.value = precio.toFixed(2);
  };

  function renderLevantamientoFields(j) {
    const lev = parseLev(j.levantamiento_datos);

    const printerOpts = allPrinters.map(p =>
      `<option value="${p.id}" ${(lev.printer_id ? lev.printer_id == p.id : j.impresora_id == p.id) ? 'selected' : ''}>${p.nombre}</option>`
    ).join('');

    const fils = lev.filamentos?.length ? lev.filamentos : (j.filaments || []);
    _jlevFilCount = Math.max(fils.length, 1);
    const filRows = Array.from({length: _jlevFilCount}, (_, i) => {
      const f = fils[i] || {};
      return jlevFilRowHtml(i, f.fil_id || f.filamento_id, f.gramos || f.gramos_pieza || '');
    }).join('');

    const hImp = lev.tiempo_h !== undefined ? lev.tiempo_h : Math.floor((j.tiempo_impresion_min||0)/60);
    const mImp = lev.tiempo_m !== undefined ? lev.tiempo_m : (j.tiempo_impresion_min||0)%60;
    const hMO  = lev.mo_h !== undefined ? lev.mo_h : Math.floor((j.tiempo_diseno_min||0)/60);
    const mMO  = lev.mo_m !== undefined ? lev.mo_m : (j.tiempo_diseno_min||0)%60;
    const tier = lev.tier || j.tipo_precio || 'menudeo';
    const emb  = lev.embalaje || '';
    const t    = { mu: parseFloat(_appCfg.margen_unitario)||2.2, mm: parseFloat(_appCfg.margen_menudeo)||1.9, mmay: parseFloat(_appCfg.margen_mayoreo)||1.5 };

    // Existing camas count
    const camasExist = j.camas || [];
    const nCamas = camasExist.length || 1;

    return `
      <div style="font-weight:700;color:var(--accent-light);margin:4px 0 12px;font-size:13px">📐 Levantamiento</div>

      <div class="form-group" style="margin-bottom:14px">
        <label>🖨️ Impresora</label>
        <select class="form-control" id="jlev-printer-sel" onchange="jlevRecalc()">
          <option value="">— Sin impresora —</option>${printerOpts}
        </select>
      </div>

      <div class="form-grid" style="margin-bottom:14px">
        <div class="form-group">
          <label>⏱️ Tiempo impresión</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input class="form-control" id="jlev-h" type="number" min="0" value="${hImp}" placeholder="0" style="width:60px" oninput="jlevRecalc()">
            <span style="color:var(--text-muted);font-size:12px">h</span>
            <input class="form-control" id="jlev-m" type="number" min="0" max="59" value="${mImp}" placeholder="0" style="width:60px" oninput="jlevRecalc()">
            <span style="color:var(--text-muted);font-size:12px">min</span>
          </div>
        </div>
        <div class="form-group">
          <label>👷 Mano de obra</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input class="form-control" id="jlev-mo-h" type="number" min="0" value="${hMO}" placeholder="0" style="width:60px" oninput="jlevRecalc()">
            <span style="color:var(--text-muted);font-size:12px">h</span>
            <input class="form-control" id="jlev-mo-m" type="number" min="0" max="59" value="${mMO}" placeholder="0" style="width:60px" oninput="jlevRecalc()">
            <span style="color:var(--text-muted);font-size:12px">min</span>
          </div>
        </div>
      </div>

      <div style="font-weight:600;font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">🧵 Filamentos</div>
      <div id="jlev-fils" style="margin-bottom:6px">${filRows}</div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="jlevAddFil()" style="margin-bottom:16px">＋ Agregar filamento</button>

      <div class="form-grid" style="margin-bottom:14px">
        <div class="form-group">
          <label>📦 Embalaje / extras ($)</label>
          <input class="form-control" id="jlev-embalaje" type="number" step="0.01" value="${emb}" placeholder="0.00" oninput="jlevRecalc()">
        </div>
        <div class="form-group">
          <label>💰 Tier de precio</label>
          <select class="form-control" id="jlev-tier" onchange="jlevRecalc()">
            <option value="unitario" ${tier==='unitario'?'selected':''}>Unitario (×${t.mu})</option>
            <option value="menudeo" ${tier==='menudeo'||!tier?'selected':''}>Menudeo (×${t.mm})</option>
            <option value="mayoreo" ${tier==='mayoreo'?'selected':''}>Mayoreo (×${t.mmay})</option>
          </select>
        </div>
      </div>

      <!-- Desglose en vivo -->
      <div style="background:var(--surface);border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px">
        <div style="font-weight:700;font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Desglose de costo</div>
        <div class="cost-row"><span>Filamentos</span><strong id="jlev-sum-fil">$0.00</strong></div>
        <div class="cost-row"><span>Electricidad</span><strong id="jlev-sum-luz">$0.00</strong></div>
        <div class="cost-row"><span>Depreciación</span><strong id="jlev-sum-maq">$0.00</strong></div>
        <div class="cost-row"><span>Mano de obra</span><strong id="jlev-sum-mo">$0.00</strong></div>
        <div class="cost-row"><span>Embalaje</span><strong id="jlev-sum-emb">$0.00</strong></div>
        <div class="cost-row" style="border-top:1px solid var(--border);padding-top:6px;margin-top:4px"><span>Costo base</span><strong id="jlev-sum-base">$0.00</strong></div>
        <div class="cost-row total"><span>Precio sugerido</span><strong id="jlev-sum-precio" style="color:var(--accent)">$0.00</strong></div>
      </div>

      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group">
          <label>💵 Precio final ($)</label>
          <input class="form-control" id="jlev-precio-final" name="precio_final" type="number" step="0.01"
            value="${j.precio_final||''}" placeholder="0.00" autocomplete="off" oninput="this.dataset.manual='1'">
        </div>
        <div class="form-group">
          <label>🛏️ Número de camas</label>
          <input class="form-control" id="jlev-n-camas" type="number" min="1" value="${nCamas}" placeholder="1">
        </div>
        <div class="form-group form-full">
          <label>📝 Notas de cotización</label>
          <textarea class="form-control" name="notas" rows="2" autocomplete="off">${j.notas||''}</textarea>
        </div>
      </div>`;
  }

  // ─── PRODUCCIÓN ──────────────────────────────────────────────────────────────

  function renderProduccionFields(j) {
    const lev = parseLev(j.levantamiento_datos);
    const printerOptions = allPrinters.map(p =>
      `<option value="${p.id}" ${(lev.printer_id ? lev.printer_id == p.id : j.impresora_id == p.id) ? 'selected' : ''}>${p.nombre}</option>`
    ).join('');
    const camas = j.camas || [];
    const done = camas.filter(c => c.completada).length;
    const pct = camas.length ? Math.round(done/camas.length*100) : 0;

    const camaChecks = camas.map(c => `
      <div class="extra-item" style="align-items:center;background:var(--surface);border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer" onclick="jobToggleCama(${j.id},${c.id})">
        <span style="font-size:22px;margin-right:8px">${c.completada ? '✅' : '⬜'}</span>
        <span style="flex:1;font-size:13px;${c.completada?'text-decoration:line-through;opacity:0.5':''}">
          Cama ${c.numero}${c.descripcion?' — '+c.descripcion:''}
        </span>
        <span style="font-size:11px;font-weight:700;color:var(--accent)">${Math.round(100/camas.length)}%</span>
        ${c.completada_at ? `<span style="font-size:10px;color:var(--text-muted);margin-left:8px">${c.completada_at}</span>` : ''}
      </div>`).join('');

    return `
      <div style="font-weight:700;color:var(--accent-light);margin:4px 0 12px;font-size:13px">🖨️ Producción</div>
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group">
          <label>🖨️ Impresora en uso</label>
          <select class="form-control" name="impresora_id">
            <option value="">— Sin impresora —</option>${printerOptions}
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <label><input type="checkbox" name="fallo" value="1" ${j.fallo?'checked':''} autocomplete="off"> ⚠️ Trabajo fallido</label>
        </div>
        <div class="form-group form-full">
          <label>📝 Notas de producción</label>
          <textarea class="form-control" name="notas_produccion" rows="2" autocomplete="off">${j.notas_produccion||''}</textarea>
        </div>
      </div>
      ${camas.length ? `
        <div style="font-weight:600;font-size:12px;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">🛏️ Camas de impresión</div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:5px">
            <span>${done}/${camas.length} completadas</span><span>${pct}%</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:4px">
            <div style="height:100%;background:var(--accent);border-radius:4px;width:${pct}%;transition:width 0.3s"></div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Toca una cama para marcarla como completada</div>
        ${camaChecks}
      ` : `<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Sin camas definidas — agrégalas en el Levantamiento</div>`}`;
  }

  // ─── CIERRE ──────────────────────────────────────────────────────────────────

  function renderCierreFields(j) {
    const existingProducts = (j.products || []).map(p =>
      `<div class="extra-item">
        <input class="form-control" name="prod_desc[]" value="${p.descripcion||''}" placeholder="Descripción" style="flex:2" autocomplete="off">
        <input class="form-control" name="prod_qty[]" type="number" min="1" value="${p.cantidad||1}" style="width:70px" autocomplete="off">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
      </div>`).join('');
    const existingExtras = (j.extras || []).map(x =>
      `<div class="extra-item">
        <input class="form-control" name="extra_nombre[]" value="${x.nombre_extra||''}" placeholder="Nombre" style="flex:2" autocomplete="off">
        <input class="form-control" name="extra_qty[]" type="number" value="${x.cantidad||1}" style="width:60px" autocomplete="off">
        <input class="form-control" name="extra_costo[]" type="number" step="0.01" value="${x.costo_unitario||''}" placeholder="$/u" style="width:80px" autocomplete="off">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
      </div>`).join('');
    return `
      <div style="font-weight:700;color:var(--accent-light);margin:4px 0 12px;font-size:13px">✅ Cierre</div>
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group"><label>Preparación</label><input class="form-control" name="tiempo_preparacion" placeholder="0:30h" value="${j.tiempo_preparacion_min ? formatTime(j.tiempo_preparacion_min) : ''}" autocomplete="off"></div>
        <div class="form-group"><label>Postproceso</label><input class="form-control" name="tiempo_postproceso" placeholder="0:15h" value="${j.tiempo_postproceso_min ? formatTime(j.tiempo_postproceso_min) : ''}" autocomplete="off"></div>
      </div>
      <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">Productos</div>
      <div id="products-list" style="margin-bottom:8px">${existingProducts}</div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddProduct()" style="margin-bottom:16px">＋ Producto</button>
      <div style="font-weight:600;color:var(--accent-light);margin-bottom:8px">Extras</div>
      <div id="extras-list" style="margin-bottom:8px">${existingExtras}</div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="jobAddExtra()" style="margin-bottom:16px">＋ Extra</button>
      <div class="form-group"><label><input type="checkbox" name="requiere_factura" value="1" ${j.requiere_factura?'checked':''} autocomplete="off"> Requiere factura</label></div>`;
  }

  // ─── OPEN FORM ───────────────────────────────────────────────────────────────

  window.jobOpenForm = async function (id, calcPrefill) {
    let j = {};
    if (id) {
      try { j = await api('GET', `/api/jobs/${id}`); } catch (e) {}
    }
    if (calcPrefill && !id) j.precio_final = calcPrefill.precio_final;

    const idx = id ? stageIndex(j.estado) : 0;
    let bodyHtml, buttonsHtml, title;

    if (!id) {
      title = 'Nuevo Trabajo';
      bodyHtml = renderSolicitudFields(j);
      buttonsHtml = `
        <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="jobSave(null)">Guardar</button>`;
    } else {
      const stage = STAGES[idx];
      title = `#${id} — ${j.nombre_proyecto||'Trabajo'} · ${stage.label}`;

      if (stage.key === 'Solicitud') {
        bodyHtml = renderSolicitudFields(j);
        buttonsHtml = `
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button>`;
      } else if (stage.key === 'Levantamiento') {
        bodyHtml = renderSolicitudFields(j) + renderLevantamientoFields(j);
        buttonsHtml = `
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button>
          <button type="button" class="btn btn-success" onclick="jobSave(${id},'Producción')">🖨️ Guardar y pasar a Producción</button>`;
      } else if (stage.key === 'Producción') {
        bodyHtml = renderProduccionFields(j);
        buttonsHtml = `
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button>
          <button type="button" class="btn btn-success" onclick="jobSave(${id},'Cierre')">✅ Guardar y Cerrar trabajo</button>`;
      } else {
        bodyHtml = renderSolicitudFields(j) + renderCierreFields(j);
        buttonsHtml = `
          <button type="button" class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="jobSave(${id})">💾 Guardar</button>`;
      }
    }

    openModal(title, `<form id="job-form">${bodyHtml}<div class="form-actions">${buttonsHtml}</div></form>`);

    if (id && STAGES[idx].key === 'Levantamiento') {
      setTimeout(jlevRecalc, 60);
    }
  };

  // ─── ADD ROWS ────────────────────────────────────────────────────────────────

  window.jobAddProduct = function () {
    const list = document.getElementById('products-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'extra-item';
    row.innerHTML = `
      <input class="form-control" name="prod_desc[]" placeholder="Descripción" style="flex:2" autocomplete="off">
      <input class="form-control" name="prod_qty[]" type="number" min="1" value="1" style="width:70px" autocomplete="off">
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
    list.appendChild(row);
  };

  window.jobAddExtra = function () {
    const list = document.getElementById('extras-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'extra-item';
    row.innerHTML = `
      <input class="form-control" name="extra_nombre[]" placeholder="Nombre" style="flex:2" autocomplete="off">
      <input class="form-control" name="extra_qty[]" type="number" value="1" style="width:60px" autocomplete="off">
      <input class="form-control" name="extra_costo[]" type="number" step="0.01" placeholder="$/u" style="width:80px" autocomplete="off">
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
    list.appendChild(row);
  };

  // ─── SAVE ────────────────────────────────────────────────────────────────────

  window.jobSave = async function (id, advanceTo) {
    const form = document.getElementById('job-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }

    const body = {};
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) {
      if (k.endsWith('[]')) continue;
      body[k] = v;
    }

    // Cierre: products + extras
    if (document.getElementById('products-list')) {
      const descs = [...form.querySelectorAll('[name="prod_desc[]"]')].map(el => el.value).filter(Boolean);
      const qtys  = [...form.querySelectorAll('[name="prod_qty[]"]')].map(el => el.value);
      body.products = descs.map((d, i) => ({ descripcion: d, cantidad: qtys[i] || 1 }));
    }
    if (document.getElementById('extras-list')) {
      const names = [...form.querySelectorAll('[name="extra_nombre[]"]')].map(el => el.value).filter(Boolean);
      const qtys  = [...form.querySelectorAll('[name="extra_qty[]"]')].map(el => el.value);
      const costs = [...form.querySelectorAll('[name="extra_costo[]"]')].map(el => el.value);
      body.extras = names.map((n, i) => ({
        nombre_extra: n, cantidad: qtys[i]||1, costo_unitario: costs[i]||0,
        costo_total: (parseFloat(qtys[i])||1)*(parseFloat(costs[i])||0)
      }));
    }

    if ('tiempo_preparacion' in body) { body.tiempo_preparacion_min = parseTime(body.tiempo_preparacion); delete body.tiempo_preparacion; }
    if ('tiempo_postproceso' in body) { body.tiempo_postproceso_min = parseTime(body.tiempo_postproceso); delete body.tiempo_postproceso; }
    if (form.querySelector('[name=fallo]'))            body.fallo            = form.querySelector('[name=fallo]').checked ? 1 : 0;
    if (form.querySelector('[name=requiere_factura]')) body.requiere_factura = form.querySelector('[name=requiere_factura]').checked ? 1 : 0;

    // Levantamiento fields
    if (document.getElementById('jlev-printer-sel')) {
      const prId    = document.getElementById('jlev-printer-sel')?.value || null;
      const hImp    = parseFloat(document.getElementById('jlev-h')?.value)||0;
      const mImp    = parseFloat(document.getElementById('jlev-m')?.value)||0;
      const hMO     = parseFloat(document.getElementById('jlev-mo-h')?.value)||0;
      const mMO     = parseFloat(document.getElementById('jlev-mo-m')?.value)||0;
      const emb     = parseFloat(document.getElementById('jlev-embalaje')?.value)||0;
      const tier    = document.getElementById('jlev-tier')?.value || 'menudeo';
      const nCamas  = parseInt(document.getElementById('jlev-n-camas')?.value)||1;
      const printer = prId ? allPrinters.find(p => p.id == prId) : null;

      const fils = [];
      for (let i = 0; i < _jlevFilCount; i++) {
        const sel = document.getElementById(`jlev-fil-sel-${i}`);
        const gEl = document.getElementById(`jlev-fil-g-${i}`);
        if (!sel?.value) continue;
        const fil = allFilaments.find(f => f.id == sel.value);
        fils.push({
          fil_id: parseInt(sel.value), filamento_id: parseInt(sel.value),
          gramos: parseFloat(gEl?.value)||0, gramos_pieza: parseFloat(gEl?.value)||0,
          nombre: fil ? `${fil.marca||''} ${fil.nombre_comercial||''} — ${fil.material} ${fil.color}`.trim() : '',
          color: fil?.color||'', color_hex: fil?.color_hex||'', material: fil?.material||'',
          acabado: fil?.acabado||'', marca: fil?.marca||'', nombre_comercial: fil?.nombre_comercial||'',
        });
      }
      body.filaments = fils.map(f => ({ filamento_id: f.fil_id, gramos_pieza: f.gramos }));

      // Generate N equal camas (without time — percentage based)
      body.camas = Array.from({length: nCamas}, (_, i) => ({
        numero: i+1, descripcion: '', tiempo_min: 0, completada: 0
      }));

      body.tiempo_impresion_min = Math.round(hImp*60 + mImp);
      body.tiempo_diseno_min    = Math.round(hMO*60 + mMO);
      body.impresora_id         = prId ? parseInt(prId) : null;
      body.tipo_precio          = tier;

      const pfEl = document.getElementById('jlev-precio-final');
      if (pfEl?.value) body.precio_final = parseFloat(pfEl.value);

      body.levantamiento_datos = {
        printer_id: prId ? parseInt(prId) : null,
        printer: printer?.nombre||'',
        tiempo_h: hImp, tiempo_m: mImp,
        mo_h: hMO, mo_m: mMO,
        embalaje: emb, tier,
        filamentos: fils,
      };
    }

    if (advanceTo) body.estado = advanceTo;

    try {
      if (id) await api('PUT', `/api/jobs/${id}`, body);
      else    await api('POST', '/api/jobs', body);
      closeModal();
      showToast(id ? 'Trabajo actualizado' : 'Trabajo creado');
      await refreshJobs();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  // ─── DELETE ──────────────────────────────────────────────────────────────────

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

  window.jobOpenFormWithPrice = function(calcResult) {
    jobOpenForm(null, calcResult);
  };

  window.jobPDF = function(id, tipo) {
    window.open(`/api/pdf/${id}?tipo=${tipo}`, '_blank');
  };
})();

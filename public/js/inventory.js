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
      { id: 'filamentos', label: '🧵 Filamentos', show: tipos.has('FDM') || filaments.length > 0 },
      { id: 'externos', label: '📦 Externos', always: true },
      { id: 'internos', label: '🧴 Internos', always: true },
      { id: 'resinas',    label: '🫙 Resinas',    show: tipos.has('Resina') || resinas.length > 0 },
      { id: 'laser',      label: '🔥 Láser',      show: tipos.has('Laser') || laser.length > 0 },
      { id: 'cnc',        label: '🔩 CNC',        show: tipos.has('CNC') || cnc.length > 0 },
    ].filter(t => t.always || t.show);

    if (window._invTargetTab) { activeTab = window._invTargetTab; delete window._invTargetTab; }
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

    // NFC tap: switch to filamentos tab and open quick-weight modal
    const nfcId = parseInt(localStorage.getItem('mm_nfc_open') || '0');
    if (nfcId) {
      localStorage.removeItem('mm_nfc_open');
      const filTab = tabs.find(t => t.id === 'filamentos');
      if (filTab) {
        document.querySelectorAll('#inv-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.inv-tab').forEach(t => t.classList.add('hidden'));
        document.querySelector(`#inv-tabs [data-tab="filamentos"]`)?.classList.add('active');
        document.getElementById('inv-tab-filamentos')?.classList.remove('hidden');
        activeTab = 'filamentos';
      }
      const filament = allFilaments.find(x => x.id === nfcId);
      if (filament) invQuickWeight(filament);
    }
  };

  // ===================== FILAMENTOS =====================
  let filFilterMat = '', filFilterAcabado = '', filFilterMarca = '';

  const FIL_MATERIALES = ['PLA','PETG','ABS','TPU','ASA','PA','PC','PLA+','FLEX','PPS','HIPS'];
  const FIL_ACABADOS   = [
    'Estándar','Mate','Silk','Traslúcido','Galaxy','Marble','Wood',
    'Gradient','Glow','Sparkly','CF','Metal','Pure','Rainbow','HS'
  ];

  function makeSpool(f, size) {
    const CX = size / 2, CY = size / 2;
    const R     = size * 0.38;
    const SW    = size * 0.16;   // thinner ring so it always looks like a full circle
    const hubR  = size * 0.13;
    const hub2R = size * 0.075;
    const hub3R = size * 0.040;
    const circ  = 2 * Math.PI * R;
    const pct   = f.peso_inicial_g > 0 ? Math.max(0, Math.min(1, f.peso_actual_g / f.peso_inicial_g)) : 0;
    const fill  = circ * pct;
    const empty = circ - fill;
    const offset = circ * 0.25;
    const isFull = pct >= 0.99;
    const isLow  = pct < 0.10;
    const acabadoL = (f.acabado || '').toLowerCase();
    const isGalaxy = acabadoL.includes('galaxy');
    const isMarble = acabadoL.includes('marble') || acabadoL.includes('marmol');
    const gradId   = `spg${f.id}_${size}`;
    const hexColor = f.color_hex || colorHex(f.color);
    let strokeColor = hexColor;
    let gradDefs = '';
    if (isGalaxy) {
      gradDefs = `<defs><radialGradient id="${gradId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#c084fc"/><stop offset="55%" stop-color="#6366f1"/><stop offset="100%" stop-color="#1e1b4b"/></radialGradient></defs>`;
      strokeColor = `url(#${gradId})`;
    } else if (isMarble) {
      gradDefs = `<defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e2e8f0"/><stop offset="40%" stop-color="#94a3b8"/><stop offset="75%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#64748b"/></linearGradient></defs>`;
      strokeColor = `url(#${gradId})`;
    }
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      ${gradDefs}
      <circle cx="${CX}" cy="${CY+size*0.017}" r="${R+SW/2+2}" fill="#00000030"/>
      <circle cx="${CX}" cy="${CY}" r="${R+SW/2+2}" fill="#252535"/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#35354f" stroke-width="${SW}"/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${strokeColor}" stroke-width="${SW}" opacity="0.95"
        ${!isFull ? `stroke-dasharray="${fill.toFixed(2)} ${empty.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"` : ''}/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="white" stroke-width="${SW*0.18}" opacity="0.08"
        stroke-dasharray="${(size*0.32).toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(-size*0.05).toFixed(1)}"/>
      <circle cx="${CX}" cy="${CY}" r="${hubR}" fill="#18181f"/>
      <circle cx="${CX}" cy="${CY}" r="${hubR}" fill="none" stroke="${isLow?'#ef444455':'#2e2e48'}" stroke-width="1.5"/>
      <circle cx="${CX}" cy="${CY}" r="${hub2R}" fill="#111118"/>
      <circle cx="${CX}" cy="${CY}" r="${hub3R}" fill="#1e1e2e"/>
    </svg>`;
  }

  async function refreshFilaments() {
    try { allFilaments = await api('GET', '/api/filaments'); } catch (e) { allFilaments = []; }
    filPage = 1;
    renderFilaments();
    // Check if opened via NFC tap
  }

  function renderFilaments() {
    const tab = document.getElementById('inv-tab-filamentos');
    if (!tab) return;
    const q = filSearch.toLowerCase();
    const marcas = [...new Set(allFilaments.map(f => f.marca).filter(Boolean))].sort();
    const filtered = allFilaments.filter(f => {
      const text = `${f.marca} ${f.nombre_comercial} ${f.material} ${f.color} ${f.acabado}`.toLowerCase();
      return (!q || text.includes(q))
        && (!filFilterMat     || f.material === filFilterMat)
        && (!filFilterAcabado || f.acabado  === filFilterAcabado)
        && (!filFilterMarca   || f.marca    === filFilterMarca);
    });
    const { items, totalPages, page } = paginate(filtered, filPage, 12);
    filPage = page;

    const matOpts   = FIL_MATERIALES.map(m => `<option value="${m}" ${filFilterMat===m?'selected':''}>${m}</option>`).join('');
    const acabOpts  = FIL_ACABADOS.map(a => `<option value="${a}" ${filFilterAcabado===a?'selected':''}>${a}</option>`).join('');
    const marcaOpts = marcas.map(m => `<option value="${m}" ${filFilterMarca===m?'selected':''}>${m}</option>`).join('');

    const cardsHTML = items.length
      ? `<div class="fil-cards-grid">${items.map(f => {
          const pct   = f.peso_inicial_g > 0 ? f.peso_actual_g / f.peso_inicial_g : 0;
          const isLow = pct < 0.10;
          const barClr = isLow ? 'var(--danger)' : (f.color_hex || colorHex(f.color));
          const gLbl  = isLow
            ? `<span style="color:var(--danger)">${fmtNum(f.peso_actual_g,0)}g</span>`
            : `${fmtNum(f.peso_actual_g,0)}g`;
          return `<div class="fil-card${isLow?' fil-card-low':''}" onclick="invViewFilament(${f.id})">
            ${isLow ? '<span class="fil-alert-badge">⚠️ BAJO</span>' : ''}
            ${f.tiene_nfc ? '<span class="fil-nfc-badge" title="NFC vinculado">📡</span>' : ''}
            ${makeSpool(f, 110)}
            <div class="fil-card-name">${f.marca||'-'} — ${f.material} ${f.acabado||''}</div>
            <div class="fil-card-sub">${f.color||'-'}</div>
            <div class="weight-wrap" style="width:100%">
              <div class="weight-label"><span>${gLbl} restantes</span><span>${fmtNum(f.peso_inicial_g,0)}g</span></div>
              <div class="weight-bar-bg"><div class="weight-bar-fill" style="width:${Math.round(pct*100)}%;background:${barClr}"></div></div>
            </div>
            <span class="${f.tipo_bobina==='Refil'?'badge badge-default':'badge badge-regular'}">${f.tipo_bobina||'Bobina completa'}</span>
          </div>`;
        }).join('')}</div>`
      : `<div class="empty-state"><div class="empty-state-icon">🧵</div>Sin filamentos que coincidan</div>`;

    tab.innerHTML = `
      <div class="fil-toolbar-top">
        <button class="btn btn-secondary btn-sm" onclick="invToggleFilFilter()" id="fil-filter-btn">🔍 Filtrar</button>
        <span style="color:var(--text-muted);font-size:12px;flex:1">${filtered.length} filamento${filtered.length!==1?'s':''}</span>
        <button class="btn btn-primary btn-sm" onclick="invOpenFilamentForm()">＋ Agregar</button>
      </div>
      <div class="fil-filter-panel${window.innerWidth <= 640 ? ' fil-filter-hidden' : ''}" id="fil-filter-panel">
        <input class="search-input form-control" style="flex:1;min-width:160px;max-width:240px"
          placeholder="Buscar filamento..." value="${filSearch}"
          oninput="invSearchFil(this.value)" autocomplete="off">
        <select class="form-control" style="width:auto" onchange="invSetFilFilter('mat',this.value)">
          <option value="">Material</option>${matOpts}
        </select>
        <select class="form-control" style="width:auto" onchange="invSetFilFilter('acabado',this.value)">
          <option value="">Acabado</option>${acabOpts}
        </select>
        <select class="form-control" style="width:auto" onchange="invSetFilFilter('marca',this.value)">
          <option value="">Marca</option>${marcaOpts}
        </select>
      </div>
      ${cardsHTML}
      <div class="pagination" id="fil-pagination"></div>`;

    if (totalPages > 1) renderPaginationInline('fil-pagination', filPage, totalPages, p => { filPage = p; renderFilaments(); });
  }

  window.invToggleFilFilter = function () {
    const panel = document.getElementById('fil-filter-panel');
    if (panel) panel.classList.toggle('fil-filter-hidden');
  };
  window.invSearchFil = function (q) { filSearch = q; filPage = 1; renderFilaments(); };
  window.invSetFilFilter = function (field, val) {
    if (field === 'mat') filFilterMat = val;
    else if (field === 'acabado') filFilterAcabado = val;
    else if (field === 'marca') filFilterMarca = val;
    filPage = 1; renderFilaments();
  };

  // ---------- FILAMENT DETAIL MODAL ----------
  function ensureFilDetailModal() {
    if (document.getElementById('fil-detail-overlay')) return;
    const el = document.createElement('div');
    el.id = 'fil-detail-overlay';
    el.className = 'fil-detail-overlay';
    el.innerHTML = `
      <div class="fil-detail-modal">
        <div class="fil-detail-header">
          <span class="fil-detail-title" id="fil-det-title"></span>
          <button class="modal-close" onclick="invCloseFilDetail()">✕</button>
        </div>
        <div class="fil-detail-body">
          <div class="fil-detail-left">
            <div id="fil-det-spool"></div>
            <div class="weight-wrap" style="width:170px">
              <div class="weight-label">
                <span id="fil-det-g-actual"></span>
                <span id="fil-det-g-total"></span>
              </div>
              <div class="weight-bar-bg" style="height:8px">
                <div class="weight-bar-fill" id="fil-det-bar" style="height:8px"></div>
              </div>
            </div>
            <div style="font-size:24px;font-weight:800;text-align:center" id="fil-det-pct"></div>
          </div>
          <div class="fil-detail-right" id="fil-det-data"></div>
        </div>
        <div class="fil-detail-footer">
          <button class="btn btn-primary" id="fil-det-edit">✏️ Editar</button>
          <button class="btn btn-success" id="fil-det-nfc">📡 NFC</button>
          <button class="btn btn-secondary" id="fil-det-hist">📋 Historial</button>
          <button class="btn btn-warning" id="fil-det-weight">⚖️ Actualizar peso</button>
          <div class="fil-det-close-row">
            <button class="btn btn-danger" id="fil-det-del">🗑️ Eliminar</button>
            <button class="btn btn-secondary" onclick="invCloseFilDetail()">✕ Cerrar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
  }

  window.invViewFilament = function (id) {
    ensureFilDetailModal();
    const f = allFilaments.find(x => x.id === id);
    if (!f) return;
    const pct   = f.peso_inicial_g > 0 ? Math.max(0, Math.min(1, f.peso_actual_g / f.peso_inicial_g)) : 0;
    const isLow = pct < 0.10;
    const barClr = isLow ? '#ef4444' : (f.color_hex || colorHex(f.color));
    const gClr  = isLow ? '#ef4444' : 'var(--text-primary)';

    document.getElementById('fil-det-title').textContent = `${f.marca||'-'} — ${f.material} ${f.acabado||''}`;
    document.getElementById('fil-det-spool').innerHTML = makeSpool(f, 175);
    document.getElementById('fil-det-g-actual').innerHTML = `<span style="color:${gClr};font-weight:700">${fmtNum(f.peso_actual_g,0)}g restantes</span>`;
    document.getElementById('fil-det-g-total').textContent = `${fmtNum(f.peso_inicial_g,0)}g inicial`;
    document.getElementById('fil-det-bar').style.cssText = `width:${Math.round(pct*100)}%;background:${barClr};height:8px;border-radius:99px`;
    document.getElementById('fil-det-pct').innerHTML = `<span style="color:${barClr}">${Math.round(pct*100)}%</span>`;

    const nfcLine = f.tiene_nfc
      ? `<span style="color:#22c55e;font-size:12px">● Vinculado · UID: ${f.uid_nfc||'—'}</span>`
      : `<span style="color:var(--text-muted);font-size:12px">○ Sin tag vinculado</span>`;

    const rows = [
      ['Marca',           f.marca||'—'],
      ['Material',        f.material||'—'],
      ['Acabado',         f.acabado||'—'],
      ['Color', `<span class="color-dot" style="background:${f.color_hex||colorHex(f.color)}"></span>${f.color||'—'}`],
      ['Tipo de bobina',  f.tipo_bobina||'Bobina completa'],
      ['Diámetro',        `${f.diametro_mm||1.75} mm`],
      ['Costo/g',         fmtMoney(f.costo_por_gramo)],
      ['Proveedor',       f.proveedor||'—'],
      ['NFC',             nfcLine],
      ...(f.notas ? [['Notas', f.notas]] : []),
    ];
    document.getElementById('fil-det-data').innerHTML = rows.map(([lbl,val]) =>
      `<div class="fil-data-row"><div class="fil-data-label">${lbl}</div><div class="fil-data-value">${val}</div></div>`
    ).join('');

    document.getElementById('fil-det-edit').onclick = () => { invCloseFilDetail(); invOpenFilamentForm(id); };
    document.getElementById('fil-det-del').onclick = () => { invCloseFilDetail(); invDeleteFilament(id); };
    document.getElementById('fil-det-nfc').onclick = () => invNFCMenu(f);
    document.getElementById('fil-det-hist').onclick = () => invShowHistory(id, f);
    document.getElementById('fil-det-weight').onclick = () => invQuickWeight(f);
    document.getElementById('fil-detail-overlay').classList.add('open');
  };

  window.invCloseFilDetail = function () {
    document.getElementById('fil-detail-overlay')?.classList.remove('open');
  };

  // ---------- QUICK WEIGHT UPDATE (NFC tap) ----------
  window.invQuickWeight = function (f) {
    if (!f) return;
    const pct = f.peso_inicial_g > 0 ? Math.max(0, Math.min(1, f.peso_actual_g / f.peso_inicial_g)) : 0;
    const barClr = f.color_hex || colorHex(f.color);
    openModal(`⚖️ ${f.marca||''} ${f.material} ${f.acabado||''}`, `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:12px">
          ${makeSpool(f, 80)}
          <div>
            <div style="font-size:13px;color:var(--text-muted)">${f.color||''} · ${f.tipo_bobina||'Bobina completa'}</div>
            <div style="font-size:22px;font-weight:800;color:${barClr}">${Math.round(pct*100)}%</div>
            <div style="font-size:12px;color:var(--text-muted)">Actual: <strong style="color:var(--text)">${fmtNum(f.peso_actual_g,0)}g</strong> / ${fmtNum(f.peso_inicial_g,0)}g</div>
          </div>
        </div>
        <div class="weight-wrap">
          <div class="weight-label"><span id="qw-lbl-act">${fmtNum(f.peso_actual_g,0)}g restantes</span><span>${fmtNum(f.peso_inicial_g,0)}g inicial</span></div>
          <div class="weight-bar-bg"><div class="weight-bar-fill" id="qw-bar" style="width:${Math.round(pct*100)}%;background:${barClr}"></div></div>
        </div>
        <div class="form-group">
          <label style="font-weight:700">Nuevo peso actual (g)</label>
          <input id="qw-input" class="form-control" type="number" min="0" max="${f.peso_inicial_g}"
            value="${f.peso_actual_g}" style="font-size:20px;text-align:center;padding:12px"
            oninput="invQWPreview(${f.peso_inicial_g},'${barClr}')">
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="invQWSave(${f.id})">💾 Guardar</button>
        </div>
      </div>`);
    setTimeout(() => document.getElementById('qw-input')?.focus(), 100);
  };

  window.invQWPreview = function (pesoInicial, barClr) {
    const val = parseFloat(document.getElementById('qw-input')?.value || 0);
    const pct = pesoInicial > 0 ? Math.max(0, Math.min(1, val / pesoInicial)) : 0;
    const bar = document.getElementById('qw-bar');
    const lbl = document.getElementById('qw-lbl-act');
    if (bar) bar.style.width = Math.round(pct * 100) + '%';
    if (lbl) lbl.textContent = Math.round(val) + 'g restantes';
  };

  window.invQWSave = async function (id) {
    const val = parseFloat(document.getElementById('qw-input')?.value);
    if (isNaN(val) || val < 0) { showToast('Ingresa un peso válido', 'error'); return; }
    try {
      await api('PUT', `/api/filaments/${id}`, { peso_actual_g: val });
      showToast('Peso actualizado ✓');
      closeModal();
      await refreshFilaments();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  // ---------- HISTORY ----------
  window.invShowHistory = async function (id, f) {
    try {
      const rows = await api('GET', `/api/filaments/${id}/history`);
      const body = rows.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📋</div><div>Sin historial de cambios</div></div>`
        : `<table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Fecha</th>
              <th style="text-align:right;padding:8px 10px;font-size:11px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Anterior</th>
              <th style="text-align:right;padding:8px 10px;font-size:11px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Nuevo</th>
              <th style="text-align:right;padding:8px 10px;font-size:11px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border)">Δ</th>
            </tr></thead>
            <tbody>${rows.map(r => {
              const diff = r.peso_nuevo - r.peso_anterior;
              const diffClr = diff < 0 ? 'var(--danger)' : 'var(--success)';
              const fecha = new Date(r.fecha).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'});
              return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:9px 10px;font-size:12px">${fecha}</td>
                <td style="padding:9px 10px;font-size:12px;text-align:right">${fmtNum(r.peso_anterior,0)}g</td>
                <td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700">${fmtNum(r.peso_nuevo,0)}g</td>
                <td style="padding:9px 10px;font-size:12px;text-align:right;color:${diffClr};font-weight:700">${diff>0?'+':''}${fmtNum(diff,0)}g</td>
              </tr>`;
            }).join('')}</tbody>
           </table>`;
      openModal(`📋 Historial — ${f.marca||''} ${f.material}`,
        body + `<div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div>`);
    } catch (e) { showToast('Error al cargar historial', 'error'); }
  };

  // ---------- NFC ----------
  function invNFCMenu(f) {
    const url = `${location.protocol}//${location.host}/nfc/${f.id}`;
    const hasNDEF = 'NDEFReader' in window;
    openModal(`📡 NFC — ${f.marca||''} ${f.material}`, `
      <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
        <div>
          <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;margin-bottom:6px">URL del tag (cópiala en NFC Tools)</div>
          <code style="display:block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;word-break:break-all">${url}</code>
          <button class="btn btn-secondary" style="margin-top:8px;width:100%"
            onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('URL copiada ✓'))">📋 Copiar URL</button>
        </div>
        ${hasNDEF ? `
          <div>
            <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;margin-bottom:6px">Escritura directa (requiere HTTPS)</div>
            <button class="btn btn-success" style="width:100%;margin-bottom:8px" onclick="invNFCWrite(${f.id},'${url}')">✍️ Escribir URL al tag NFC</button>
            <button class="btn btn-secondary" style="width:100%" onclick="invNFCRead()">📡 Leer tag NFC</button>
          </div>` : `
          <div class="alert alert-info" style="font-size:13px">
            ℹ️ Para escritura NFC descarga <strong>NFC Tools</strong> en tu teléfono.<br>
            Escribe la URL de arriba como tipo <em>URL</em> en el tag.<br>
            Al tocarlo, Chrome abrirá este filamento automáticamente.
          </div>`}
        ${f.tiene_nfc ? `<div style="color:#22c55e;font-size:13px">✅ Tag ya vinculado · UID: ${f.uid_nfc||'—'}</div>` : ''}
      </div>
      <div class="form-actions"><button class="btn btn-secondary" onclick="closeModal()">Cerrar</button></div>`);
  }

  window.invNFCWrite = async function (id, url) {
    if (!('NDEFReader' in window)) { showToast('Web NFC no disponible — usa NFC Tools app', 'error'); return; }
    try {
      const ndef = new NDEFReader();
      showToast('Acerca el tag NFC al teléfono…');
      await ndef.write({ records: [{ recordType: 'url', data: url }] });
      const serial = ndef.serialNumber || '';
      await api('PUT', `/api/filaments/${id}`, { tiene_nfc: 1, uid_nfc: serial });
      showToast('Tag NFC escrito y vinculado ✓');
      await refreshFilaments(); closeModal();
    } catch (e) {
      showToast('Error NFC: ' + e.message + (e.message.includes('secure') ? ' — necesitas HTTPS' : ''), 'error');
    }
  };

  window.invNFCRead = async function () {
    if (!('NDEFReader' in window)) { showToast('Web NFC no disponible', 'error'); return; }
    try {
      const ndef = new NDEFReader();
      showToast('Acerca el tag al teléfono…');
      await ndef.scan();
      ndef.onreading = ({ serialNumber, message }) => {
        let found = allFilaments.find(f => f.uid_nfc && f.uid_nfc.toLowerCase() === serialNumber.toLowerCase());
        if (!found) {
          for (const rec of (message?.records || [])) {
            if (rec.recordType === 'url') {
              const txt = new TextDecoder().decode(rec.data);
              const m = txt.match(/\/nfc\/(\d+)/);
              if (m) found = allFilaments.find(f => f.id === parseInt(m[1]));
            }
          }
        }
        if (found) { closeModal(); invViewFilament(found.id); }
        else showToast('Tag no vinculado a ningún filamento', 'error');
      };
    } catch (e) { showToast('Error NFC: ' + e.message, 'error'); }
  };

  // ---------- FORM ----------
  window.invOpenFilamentForm = async function (id) {
    let f = {};
    if (id) { try { f = allFilaments.find(x => x.id === id) || {}; } catch (e) {} }
    const matOpts  = FIL_MATERIALES.map(m => `<option ${f.material===m?'selected':''}>${m}</option>`).join('');
    const acabOpts = FIL_ACABADOS.map(a => `<option ${f.acabado===a?'selected':''}>${a}</option>`).join('');
    openModal(id ? 'Editar Filamento' : 'Nuevo Filamento', `
      <form id="fil-form" onsubmit="invSaveFilament(event,${id||'null'})">
        <div class="form-grid">
          <div class="form-group"><label>Marca *</label>
            <input class="form-control" name="marca" value="${f.marca||''}" required autocomplete="off"></div>
          <div class="form-group"><label>Nombre comercial</label>
            <input class="form-control" name="nombre_comercial" value="${f.nombre_comercial||''}" autocomplete="off"></div>
          <div class="form-group"><label>Material</label>
            <select class="form-control" name="material">${matOpts}</select></div>
          <div class="form-group"><label>Acabado</label>
            <select class="form-control" name="acabado">${acabOpts}</select></div>
          <div class="form-group"><label>Color (nombre)</label>
            <input class="form-control" name="color" value="${f.color||''}" placeholder="Ej. Rojo, Azul cielo" autocomplete="off"></div>
          <div class="form-group"><label>Color exacto</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="color" name="color_hex" value="${f.color_hex||colorHex(f.color||'')}"
                style="width:48px;height:36px;border:1px solid var(--border);border-radius:8px;padding:2px;background:var(--surface);cursor:pointer">
              <span style="font-size:11px;color:var(--text-muted)">Elige el color de la bobina</span>
            </div>
          </div>
          <div class="form-group"><label>Tipo de bobina</label>
            <select class="form-control" name="tipo_bobina">
              <option ${(f.tipo_bobina||'Bobina completa')==='Bobina completa'?'selected':''}>Bobina completa</option>
              <option ${f.tipo_bobina==='Refil'?'selected':''}>Refil</option>
            </select>
          </div>
          <div class="form-group"><label>Diámetro (mm)</label>
            <input class="form-control" name="diametro_mm" type="number" step="0.01" value="${f.diametro_mm||1.75}" autocomplete="off"></div>
          <div class="form-group"><label>Peso inicial (g)</label>
            <input class="form-control" name="peso_inicial_g" type="number" value="${f.peso_inicial_g||1000}" id="fil-peso-inicial" oninput="invCalcCostG()" autocomplete="off"></div>
          <div class="form-group"><label>Peso actual (g)</label>
            <input class="form-control" name="peso_actual_g" type="number" value="${f.peso_actual_g!=null?f.peso_actual_g:f.peso_inicial_g||1000}" autocomplete="off"></div>
          <div class="form-group"><label>Peso bobina vacía (g)</label>
            <input class="form-control" name="peso_bobina_vacia_g" type="number" value="${f.peso_bobina_vacia_g||200}" id="fil-peso-bobina" oninput="invCalcCostG()" autocomplete="off"></div>
          <div class="form-group"><label>Costo total</label>
            <input class="form-control" name="costo_total" type="number" step="0.01" value="${f.costo_total||''}" id="fil-costo-total" oninput="invCalcCostG()" autocomplete="off"></div>
          <div class="form-group"><label>Costo/g (auto)</label>
            <input class="form-control" name="costo_por_gramo" type="number" step="0.0001" id="fil-cpg" value="${f.costo_por_gramo||''}" placeholder="Se calcula solo" autocomplete="off"></div>
          <div class="form-group"><label>Proveedor</label>
            <input class="form-control" name="proveedor" value="${f.proveedor||''}" autocomplete="off"></div>
          <div class="form-group form-full"><label>Notas</label>
            <textarea class="form-control" name="notas" rows="2" autocomplete="off">${f.notas||''}</textarea></div>
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
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (id) await api('PUT', `/api/filaments/${id}`, body);
      else    await api('POST', '/api/filaments', body);
      closeModal();
      showToast(id ? 'Filamento actualizado' : 'Filamento agregado');
      await refreshFilaments();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.invEditFilament   = function (id) { invOpenFilamentForm(id); };

  window.invDeleteFilament = function (id) {
    const f = allFilaments.find(x => x.id === id);
    confirmModal(`¿Eliminar filamento "${f?.marca} ${f?.nombre_comercial||''}"?`, async () => {
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
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
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

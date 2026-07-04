(function () {
  let _allProducts = [];

  pageLoaders['catalog'] = async function loadCatalog() {
    const el = document.getElementById('page-catalog');
    el.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Catálogo de Productos</div>
          <div class="page-subtitle">Tus productos con costos pre-calculados</div>
        </div>
        <button class="btn btn-primary" onclick="openCalculator(null,null,'producto')">＋ Nuevo Producto</button>
      </div>
      <div style="margin-bottom:16px">
        <input class="search-input form-control" style="width:300px;max-width:100%" placeholder="Buscar producto..." oninput="catSearch(this.value)" autocomplete="off" id="cat-search-input">
      </div>
      <div id="cat-grid"><p style="color:var(--text-muted);padding:20px">Cargando...</p></div>`;

    await refreshCatalog();
  };

  async function refreshCatalog() {
    try { _allProducts = await api('GET', '/api/productos'); } catch { _allProducts = []; }
    renderCatalog('');
  }

  function renderCatalog(q) {
    const filtered = _allProducts.filter(p =>
      `${p.nombre} ${p.descripcion||''}`.toLowerCase().includes((q||'').toLowerCase())
    );
    const grid = document.getElementById('cat-grid');
    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🏷️</div>
        <div>${q ? 'Sin resultados' : 'Sin productos en el catálogo'}</div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-muted)">Usa la calculadora → "Guardar como producto" para agregar tu primer producto</div>
      </div>`;
      return;
    }

    grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">
      ${filtered.map(p => {
        const img = p.foto_path
          ? `<img src="${p.foto_path}" style="width:100%;height:140px;object-fit:cover;border-radius:10px 10px 0 0" loading="lazy" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:140px;background:linear-gradient(135deg,var(--accent)22,var(--accent)55);border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:center;font-size:48px">🏷️</div>`;
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;display:flex;flex-direction:column"
          onclick="catViewProduct(${p.id})"
          onmouseover="this.style.borderColor='var(--accent)';this.style.transform='translateY(-2px)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'">
          ${img}
          <div style="padding:12px;flex:1;display:flex;flex-direction:column;gap:6px">
            <div style="font-weight:700;font-size:14px;color:var(--text)">${p.nombre}</div>
            ${p.descripcion ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.descripcion}</div>` : ''}
            <div style="margin-top:auto;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:10px;color:var(--text-muted)">Online</div>
                <div style="font-size:15px;font-weight:800;color:var(--accent)">${fmtMoney(p.precio_online)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:10px;color:var(--text-muted)">Local</div>
                <div style="font-size:15px;font-weight:800;color:#22c55e">${fmtMoney(p.precio_local)}</div>
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  window.catSearch = function(q) {
    renderCatalog(q);
  };

  window.catViewProduct = async function(id) {
    let prod;
    try { prod = await api('GET', `/api/productos/${id}`); } catch { showToast('Error cargando producto','error'); return; }
    const d = prod.datos || {};
    const hStr = n => n >= 1 ? `${Math.floor(n)}h ${Math.round((n%1)*60)}min` : `${Math.round(n*60)}min`;
    const timeH = parseFloat(d.tiempo_h||0) + parseFloat(d.tiempo_m||0)/60;
    const moH   = parseFloat(d.mo_h||0)     + parseFloat(d.mo_m||0)/60;

    const filRows = (d.filamentos||[]).filter(f => f.nombre && parseFloat(f.gramos)>0).map(f => {
      const hex = f.color_hex || colorHex(f.color||'');
      const spoolHtml = typeof makeSpool === 'function' && f.material
        ? makeSpool({ marca: f.marca||'', material: f.material||'', color: f.color||'', color_hex: f.color_hex||'', acabado: f.acabado||'', peso_inicial_g: 1000, peso_actual_g: 1000 }, 60)
        : `<div style="width:60px;height:60px;border-radius:50%;background:${hex};border:2px solid var(--border)"></div>`;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        ${spoolHtml}
        <div style="font-size:10px;font-weight:700;text-align:center;max-width:80px;line-height:1.3">${f.nombre}</div>
        <div style="font-size:11px;color:var(--accent);font-weight:700">${f.gramos}g</div>
      </div>`;
    }).join('');

    const img = prod.foto_path
      ? `<img src="${prod.foto_path}" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-bottom:12px">`
      : '';

    openModal(`🏷️ ${prod.nombre}`, `
      ${img}
      ${prod.descripcion ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">${prod.descripcion}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--surface);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">🌐 Precio Online</div>
          <div style="font-size:22px;font-weight:800;color:var(--accent)">${fmtMoney(prod.precio_online)}</div>
        </div>
        <div style="background:var(--surface);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">📍 Precio Local</div>
          <div style="font-size:22px;font-weight:800;color:#22c55e">${fmtMoney(prod.precio_local)}</div>
        </div>
      </div>

      ${d.printer || timeH > 0 ? `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;margin-bottom:8px">🖨️ IMPRESIÓN</div>
        ${d.printer ? `<div style="font-size:12px;margin-bottom:4px">Impresora: <strong>${d.printer}</strong></div>` : ''}
        ${timeH > 0 ? `<div style="font-size:12px">Tiempo: <strong>${hStr(timeH)}</strong></div>` : ''}
        ${moH > 0 ? `<div style="font-size:12px;margin-top:4px">MO: <strong>${hStr(moH)}</strong></div>` : ''}
      </div>` : ''}

      ${(d.filamentos||[]).filter(f=>f.gramos>0).length > 0 ? `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.05em;margin-bottom:10px">🧵 FILAMENTOS</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">${filRows || '<span style="color:var(--text-muted);font-size:12px">—</span>'}</div>
      </div>` : ''}

      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-danger btn-sm" onclick="catDeleteProduct(${id})">🗑️</button>
        <button class="btn btn-secondary btn-sm" onclick="catEditProduct(${id})">✏️ Editar</button>
        <button class="btn btn-secondary btn-sm" onclick="catRecalcular(${id})">🧮 Recalcular</button>
        <button class="btn btn-secondary" onclick="closeModal()" style="margin-right:auto">Cerrar</button>
        <button class="btn btn-primary" onclick="catCotizarCliente(${id})">🛒 Crear Trabajo</button>
      </div>
    `);
  };

  window.catCotizarCliente = async function(id) {
    let prod;
    try { prod = await api('GET', `/api/productos/${id}`); } catch { showToast('Error','error'); return; }
    closeModal();
    await openCalculator({ nombre: prod.nombre, _datos: prod.datos }, null, 'venta');
  };

  window.catRecalcular = async function(id) {
    let prod;
    try { prod = await api('GET', `/api/productos/${id}`); } catch { showToast('Error','error'); return; }
    closeModal();
    await openCalculator({ nombre: prod.nombre, _datos: prod.datos }, id, 'producto');
  };

  window.catEditProduct = async function(id) {
    let prod;
    try { prod = await api('GET', `/api/productos/${id}`); } catch { showToast('Error cargando producto','error'); return; }
    openModal(`✏️ Editar Producto`, `
      <div class="form-group"><label>Nombre *</label><input id="cat-edit-nombre" class="form-control" value="${(prod.nombre||'').replace(/"/g,'&quot;')}" autocomplete="off"></div>
      <div class="form-group"><label>Descripción</label><textarea id="cat-edit-desc" class="form-control" rows="3">${prod.descripcion||''}</textarea></div>
      <div class="form-grid">
        <div class="form-group"><label>Precio Online</label><input id="cat-edit-online" class="form-control" type="number" step="any" value="${prod.precio_online||''}"></div>
        <div class="form-group"><label>Precio Local</label><input id="cat-edit-local" class="form-control" type="number" step="any" value="${prod.precio_local||''}"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="cancelModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="catEditSave(${id})">💾 Guardar</button>
      </div>
    `);
  };

  window.catEditSave = async function(id) {
    const nombre = document.getElementById('cat-edit-nombre')?.value?.trim();
    if (!nombre) { showToast('El nombre es obligatorio','error'); return; }
    const precio_online = parseFloat(document.getElementById('cat-edit-online')?.value)||0;
    const precio_local  = parseFloat(document.getElementById('cat-edit-local')?.value)||0;
    const descripcion   = document.getElementById('cat-edit-desc')?.value?.trim()||'';
    try {
      await api('PATCH', `/api/productos/${id}`, { nombre, descripcion, precio_online, precio_local });
      showToast('Producto actualizado');
      closeModal();
      await refreshCatalog();
    } catch(e) { showToast('Error: '+e.message,'error'); }
  };

  window.catDeleteProduct = function(id) {
    const p = _allProducts.find(x => x.id === id);
    confirmModal(`¿Eliminar producto "${p?.nombre}"?`, async () => {
      try {
        await api('DELETE', `/api/productos/${id}`);
        showToast('Producto eliminado');
        closeModal();
        await refreshCatalog();
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }, '🗑️');
  };

  window.refreshCatalog = refreshCatalog;
})();

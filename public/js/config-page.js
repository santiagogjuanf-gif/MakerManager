(function () {
  let configData = {};

  pageLoaders['config'] = async function loadConfigPage() {
    const el = document.getElementById('page-config');
    el.innerHTML = `<div class="page-header"><div><div class="page-title">Configuración</div><div class="page-subtitle">Ajustes del sistema</div></div></div><div id="config-body"><p style="color:var(--text-muted)">Cargando...</p></div>`;

    try {
      const rows = await api('GET', '/api/config');
      configData = {};
      if (Array.isArray(rows)) {
        rows.forEach(r => { configData[r.key] = r.value; });
      } else {
        configData = rows;
      }
      // Sync global appConfig too
      Object.assign(appConfig, configData);
      renderConfigPage();
    } catch (e) {
      document.getElementById('config-body').innerHTML = `<div class="alert alert-warning">Error cargando configuración: ${e.message}</div>`;
    }
  };

  function val(key, def = '') {
    return configData[key] !== undefined ? configData[key] : def;
  }

  function renderConfigPage() {
    const logoHtml = val('logo_path')
      ? `<img src="${val('logo_path')}" class="logo-preview" id="cfg-logo-img" style="object-fit:contain">`
      : `<div class="logo-preview" id="cfg-logo-img" style="display:flex;align-items:center;justify-content:center">⬡</div>`;

    document.getElementById('config-body').innerHTML = `
      <form id="cfg-form" onsubmit="cfgSave(event)">

        <!-- Negocio -->
        <div class="config-section">
          <div class="config-section-title">🏢 Negocio</div>
          <div style="display:flex;gap:24px;align-items:flex-start">
            <div>
              ${logoHtml}
              <div style="margin-top:8px">
                <input type="file" class="form-control" accept="image/*" onchange="cfgUploadLogo(this)" style="font-size:12px">
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Logo del negocio</div>
              </div>
            </div>
            <div class="form-grid" style="flex:1">
              <div class="form-group"><label>Nombre del negocio</label><input class="form-control" name="nombre_negocio" value="${val('nombre_negocio')}"></div>
              <div class="form-group"><label>Teléfono</label><input class="form-control" name="telefono" value="${val('telefono')}"></div>
              <div class="form-group form-full"><label>Dirección</label><input class="form-control" name="direccion" value="${val('direccion')}"></div>
            </div>
          </div>
        </div>

        <!-- Moneda -->
        <div class="config-section">
          <div class="config-section-title">💱 Moneda</div>
          <div class="form-grid">
            <div class="form-group"><label>Moneda</label>
              <select class="form-control" name="moneda">
                ${['CAD','USD','MXN','EUR','GBP'].map(m => `<option ${val('moneda','CAD')===m?'selected':''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Símbolo</label><input class="form-control" name="simbolo_moneda" value="${val('simbolo_moneda','$')}" placeholder="$"></div>
          </div>
        </div>

        <!-- Tarifas -->
        <div class="config-section">
          <div class="config-section-title">⚡ Tarifas</div>
          <div class="form-grid">
            <div class="form-group"><label>Costo kWh</label><input class="form-control" name="costo_kwh" type="number" step="0.001" value="${val('costo_kwh','0.14')}"></div>
            <div class="form-group"><label>Tarifa hora (mano de obra)</label><input class="form-control" name="tarifa_hora" type="number" step="0.01" value="${val('tarifa_hora','15')}"></div>
            <div class="form-group"><label>Impuesto (%)</label><input class="form-control" name="tax_rate" type="number" step="0.1" value="${parseFloat(val('tax_rate','0'))*100}"></div>
          </div>
        </div>

        <!-- Márgenes -->
        <div class="config-section">
          <div class="config-section-title">📈 Márgenes</div>
          <div class="form-grid">
            <div class="form-group"><label>Margen unitario (%)</label><input class="form-control" name="margen_unitario" type="number" step="0.1" value="${parseFloat(val('margen_unitario','30'))}"></div>
            <div class="form-group"><label>Margen menudeo (%)</label><input class="form-control" name="margen_menudeo" type="number" step="0.1" value="${parseFloat(val('margen_menudeo','20'))}"></div>
            <div class="form-group"><label>Margen mayoreo (%)</label><input class="form-control" name="margen_mayoreo" type="number" step="0.1" value="${parseFloat(val('margen_mayoreo','10'))}"></div>
          </div>
        </div>

        <!-- Precios mínimos -->
        <div class="config-section">
          <div class="config-section-title">🏷️ Precios mínimos</div>
          <div class="form-grid">
            <div class="form-group"><label>Mínimo menudeo</label><input class="form-control" name="minimo_menudeo" type="number" step="0.01" value="${val('minimo_menudeo','5')}"></div>
            <div class="form-group"><label>Mínimo mayoreo</label><input class="form-control" name="minimo_mayoreo" type="number" step="0.01" value="${val('minimo_mayoreo','50')}"></div>
          </div>
        </div>

        <!-- Clasificación clientes -->
        <div class="config-section">
          <div class="config-section-title">👥 Clasificación de clientes (# de pedidos)</div>
          <div class="form-grid">
            <div class="form-group"><label>Nuevo (0 a...)</label><input class="form-control" name="nivel_nuevo" type="number" value="${val('nivel_nuevo','1')}"></div>
            <div class="form-group"><label>Regular (hasta...)</label><input class="form-control" name="nivel_regular" type="number" value="${val('nivel_regular','5')}"></div>
            <div class="form-group"><label>Frecuente (hasta...)</label><input class="form-control" name="nivel_frecuente" type="number" value="${val('nivel_frecuente','15')}"></div>
            <div class="form-group"><label>VIP (más de...)</label><input class="form-control" name="nivel_vip" type="number" value="${val('nivel_vip','15')}"></div>
          </div>
        </div>

        <!-- Términos y condiciones -->
        <div class="config-section">
          <div class="config-section-title">📝 Términos y condiciones</div>
          <div class="form-group">
            <label>Texto para PDFs</label>
            <textarea class="form-control" name="terminos_condiciones" rows="5">${val('terminos_condiciones','')}</textarea>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
          <button type="submit" class="btn btn-primary" style="padding:12px 32px">💾 Guardar configuración</button>
        </div>
      </form>

      <!-- Zona de peligro -->
      <div class="config-section" style="border-color:rgba(239,68,68,0.3)">
        <div class="config-section-title" style="color:var(--danger)">⚠️ Zona de peligro</div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Estas acciones son irreversibles. Procede con precaución.</p>
        <button class="btn btn-danger" onclick="cfgResetDB()">🗑️ Resetear Base de Datos</button>
      </div>`;
  }

  window.cfgSave = async function (e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const updates = {};
    for (const [key, value] of fd.entries()) {
      if (key === 'tax_rate') {
        updates[key] = (parseFloat(value) / 100).toString();
      } else {
        updates[key] = value;
      }
    }
    try {
      await api('PUT', '/api/config', updates);
      Object.assign(appConfig, updates);
      showToast('Configuración guardada');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  window.cfgUploadLogo = async function (input) {
    if (!input.files || !input.files[0]) return;
    const fd = new FormData();
    fd.append('logo', input.files[0]);
    try {
      const res = await fetch('/api/config/logo', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const prev = document.getElementById('cfg-logo-img');
      if (prev && data.logo_path) {
        prev.outerHTML = `<img src="${data.logo_path}?t=${Date.now()}" class="logo-preview" id="cfg-logo-img" style="object-fit:contain">`;
      }
      showToast('Logo actualizado');
    } catch (err) { showToast('Error subiendo logo: ' + err.message, 'error'); }
  };

  window.cfgResetDB = function () {
    confirmModal('¿Seguro? Esto borrará TODOS los datos permanentemente.', () => {
      // Second confirmation: type ELIMINAR
      openModal('Confirmar reset', `
        <div style="text-align:center;padding:16px">
          <div style="font-size:40px;margin-bottom:12px">☠️</div>
          <p style="margin-bottom:16px;color:var(--text)">Escribe <strong>ELIMINAR</strong> para confirmar el borrado total de la base de datos.</p>
          <input class="form-control" id="cfg-reset-input" placeholder="ELIMINAR" style="text-align:center;margin-bottom:16px">
          <div class="form-actions" style="justify-content:center">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="cfgConfirmReset()">Confirmar reset</button>
          </div>
        </div>`);
    }, '⚠️');
  };

  window.cfgConfirmReset = async function () {
    const input = document.getElementById('cfg-reset-input');
    if (!input || input.value.trim() !== 'ELIMINAR') {
      showToast('Escribe ELIMINAR exactamente', 'error');
      return;
    }
    try {
      const res = await fetch('/api/reset', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      closeModal();
      showToast('Base de datos reseteada');
      await pageLoaders['config']();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };
})();

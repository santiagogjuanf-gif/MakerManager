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
      : `<div class="logo-preview" id="cfg-logo-img" style="display:flex;align-items:center;justify-content:center;font-size:32px">⬡</div>`;

    const usersHtml = currentUser?.role === 'admin' ? `
      <div class="config-section">
        <div class="config-section-title" style="justify-content:space-between">
          <span>👥 Usuarios del sistema</span>
          <button type="button" class="btn btn-primary btn-sm" onclick="cfgOpenUserForm()">＋ Nuevo</button>
        </div>
        <div id="cfg-users-list"><p style="color:var(--text-muted);font-size:13px">Cargando...</p></div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <button type="button" class="btn btn-secondary btn-sm" onclick="cfgChangePassword()">🔑 Cambiar mi contraseña</button>
        </div>
      </div>` : `
      <div class="config-section">
        <div class="config-section-title">🔑 Mi cuenta</div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="cfgChangePassword()">Cambiar contraseña</button>
      </div>`;

    document.getElementById('config-body').innerHTML = `
      <form id="cfg-form" onsubmit="cfgSave(event)" autocomplete="off">

        <!-- Negocio -->
        <div class="config-section">
          <div class="config-section-title">🏢 Negocio</div>
          <div style="display:flex;gap:16px;align-items:flex-start">
            <div style="flex-shrink:0">
              ${logoHtml}
              <div style="margin-top:6px">
                <input type="file" accept="image/*" onchange="cfgUploadLogo(this)" style="font-size:11px;width:100px;color:var(--text-muted)">
              </div>
            </div>
            <div style="flex:1;display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px">
              <div class="form-group"><label>Nombre del negocio</label><input class="form-control" name="nombre_negocio" value="${val('nombre_negocio')}" autocomplete="off"></div>
              <div class="form-group"><label>Teléfono</label><input class="form-control" name="telefono" value="${val('telefono')}" autocomplete="off"></div>
              <div class="form-group"><label>Dirección</label><input class="form-control" name="direccion" value="${val('direccion')}" autocomplete="off"></div>
            </div>
          </div>
        </div>

        <!-- Moneda+Tarifas | Márgenes+Mínimos (two columns) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="config-section" style="margin-bottom:0">
            <div class="config-section-title">💱 Moneda & Tarifas</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-group"><label>Moneda</label>
                <select class="form-control" name="moneda">
                  ${['CAD','USD','MXN','EUR','GBP'].map(m => `<option ${val('moneda','CAD')===m?'selected':''}>${m}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Símbolo</label><input class="form-control" name="simbolo_moneda" value="${val('simbolo_moneda','$')}" autocomplete="off"></div>
              <div class="form-group"><label>Costo kWh</label><input class="form-control" name="costo_kwh" type="number" step="0.001" value="${val('costo_kwh','0.18')}" autocomplete="off"></div>
              <div class="form-group"><label>Tarifa hora</label><input class="form-control" name="tarifa_hora" type="number" step="0.01" value="${val('tarifa_hora','25')}" autocomplete="off"></div>
              <div class="form-group" style="grid-column:1/-1"><label>Impuesto (%)</label><input class="form-control" name="tax_rate" type="number" step="0.1" value="${parseFloat(val('tax_rate','0'))*100}" autocomplete="off"></div>
            </div>
          </div>
          <div class="config-section" style="margin-bottom:0">
            <div class="config-section-title">📈 Márgenes & Precios mínimos</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-group"><label>Margen unitario</label><input class="form-control" name="margen_unitario" type="number" step="0.1" value="${val('margen_unitario','3')}" autocomplete="off"></div>
              <div class="form-group"><label>Margen menudeo</label><input class="form-control" name="margen_menudeo" type="number" step="0.1" value="${val('margen_menudeo','2.5')}" autocomplete="off"></div>
              <div class="form-group"><label>Margen mayoreo</label><input class="form-control" name="margen_mayoreo" type="number" step="0.1" value="${val('margen_mayoreo','1.8')}" autocomplete="off"></div>
              <div class="form-group"><label>Mín. menudeo (pzas)</label><input class="form-control" name="minimo_menudeo" type="number" value="${val('minimo_menudeo','2')}" autocomplete="off"></div>
              <div class="form-group" style="grid-column:1/-1"><label>Mín. mayoreo (pzas)</label><input class="form-control" name="minimo_mayoreo" type="number" value="${val('minimo_mayoreo','10')}" autocomplete="off"></div>
            </div>
          </div>
        </div>

        <!-- Clasificación clientes (1 row of 4) -->
        <div class="config-section">
          <div class="config-section-title">🏆 Clasificación de clientes (# de pedidos)</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            <div class="form-group"><label>Nuevo (hasta)</label><input class="form-control" name="nivel_nuevo" type="number" value="${val('nivel_nuevo','1')}" autocomplete="off"></div>
            <div class="form-group"><label>Regular (hasta)</label><input class="form-control" name="nivel_regular" type="number" value="${val('nivel_regular','3')}" autocomplete="off"></div>
            <div class="form-group"><label>Frecuente (hasta)</label><input class="form-control" name="nivel_frecuente" type="number" value="${val('nivel_frecuente','7')}" autocomplete="off"></div>
            <div class="form-group"><label>VIP (más de)</label><input class="form-control" name="nivel_vip" type="number" value="${val('nivel_vip','15')}" autocomplete="off"></div>
          </div>
        </div>

        <!-- Tema visual -->
        <div class="config-section">
          <div class="config-section-title">🎨 Tema visual</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${[{id:'morado',color:'#6c63ff',name:'Morado'},{id:'cerberus',color:'#f97316',name:'Cerberus'},{id:'cian',color:'#06b6d4',name:'Cian'},{id:'bambu',color:'#4ade80',name:'Bambú'}]
              .map(t => `<button type="button" onclick="cfgSetTheme('${t.id}')" class="theme-btn ${val('theme_color','morado')===t.id?'active':''}" data-theme="${t.id}" style="--th:${t.color}">
                <div class="theme-dot" style="background:${t.color}"></div>
                <span style="font-size:12px;color:var(--text)">${t.name}</span>
              </button>`).join('')}
          </div>
        </div>

        <!-- Términos y condiciones -->
        <div class="config-section">
          <div class="config-section-title">📝 Términos y condiciones</div>
          <textarea class="form-control" name="terminos_condiciones" rows="4" autocomplete="off">${val('terminos_condiciones','')}</textarea>
        </div>

        <div style="display:flex;justify-content:center;margin-bottom:24px">
          <button type="submit" class="btn btn-primary" style="padding:11px 36px;font-size:15px">💾 Guardar configuración</button>
        </div>
      </form>

      <!-- Usuarios -->
      ${usersHtml}

      <!-- Zona de peligro -->
      <div class="config-section" style="border-color:rgba(239,68,68,0.3);padding:12px 16px" data-admin-only>
        <div class="config-section-title" style="color:var(--danger);font-size:13px;margin-bottom:8px">⚠️ Zona de peligro</div>
        <button class="btn btn-danger btn-sm" onclick="cfgResetDB()">🗑️ Resetear Base de Datos</button>
      </div>`;

    if (currentUser?.role === 'admin') {
      cfgLoadUsers();
      document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = '');
    } else {
      document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
    }
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

  window.cfgSetTheme = async function(theme) {
    try {
      await api('PUT', '/api/config', { theme_color: theme });
      appConfig.theme_color = theme;
      applyTheme(theme);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
      showToast('Tema aplicado');
    } catch(e) { showToast('Error: '+e.message,'error'); }
  };

  window.cfgLoadUsers = async function() {
    const el = document.getElementById('cfg-users-list');
    if (!el) return;
    try {
      const users = await api('GET', '/api/auth/users');
      el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:8px">
        ${users.map(u => {
          const isMe = u.id === currentUser?.id;
          const isAdmin = u.role === 'admin';
          return `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">
            <div style="font-size:40px">${isAdmin ? '👑' : '👷'}</div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">${u.display_name||u.username}</div>
            <div style="font-size:12px;color:var(--text-muted)">@${u.username}</div>
            <span class="badge ${isAdmin?'badge-frecuente':'badge-regular'}" style="font-size:11px">${isAdmin?'Administrador':'Trabajador'}</span>
            ${isMe
              ? `<span style="color:var(--text-muted);font-size:11px;margin-top:4px">← Tú</span>`
              : `<div style="display:flex;gap:6px;margin-top:4px;width:100%">
                  <button class="btn btn-secondary btn-sm" style="flex:1" onclick="cfgEditUser(${u.id})">✏️ Editar</button>
                  <button class="btn btn-danger btn-sm" style="flex:1" onclick="cfgDeleteUser(${u.id},'${u.username}')">🗑️ Borrar</button>
                </div>`}
          </div>`;
        }).join('')}
      </div>`;
    } catch(e) { if (el) el.innerHTML = `<p style="color:var(--danger);font-size:13px">Error: ${e.message}</p>`; }
  };

  window.cfgOpenUserForm = function(id, userData) {
    openModal(id ? 'Editar usuario' : 'Nuevo usuario', `
      <form onsubmit="cfgSaveUser(event,${id||'null'})" autocomplete="off">
        <div class="form-grid">
          ${!id ? `<div class="form-group"><label>Usuario *</label><input class="form-control" name="username" required autocomplete="off"></div>` : ''}
          <div class="form-group"><label>Nombre</label><input class="form-control" name="display_name" value="${userData?.display_name||''}" autocomplete="off"></div>
          <div class="form-group"><label>Rol</label>
            <select class="form-control" name="role">
              <option value="worker" ${userData?.role!=='admin'?'selected':''}>Worker</option>
              <option value="admin" ${userData?.role==='admin'?'selected':''}>Admin</option>
            </select>
          </div>
          <div class="form-group form-full"><label>Contraseña ${id?'(vacío = sin cambio)':'*'}</label><input class="form-control" name="password" type="password" ${!id?'required':''} autocomplete="new-password"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
  };

  window.cfgEditUser = async function(id) {
    try {
      const users = await api('GET', '/api/auth/users');
      cfgOpenUserForm(id, users.find(x=>x.id===id)||{});
    } catch(e) { showToast('Error: '+e.message,'error'); }
  };

  window.cfgSaveUser = async function(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    for (const [k,v] of fd.entries()) if (v) body[k] = v;
    try {
      if (id) await api('PUT', `/api/auth/users/${id}`, body);
      else await api('POST', '/api/auth/users', body);
      closeModal();
      showToast(id ? 'Usuario actualizado' : 'Usuario creado');
      await cfgLoadUsers();
    } catch(e) { showToast('Error: '+e.message,'error'); }
  };

  window.cfgDeleteUser = function(id, username) {
    confirmModal(`¿Eliminar usuario "${username}"?`, async () => {
      try { await api('DELETE', `/api/auth/users/${id}`); showToast('Usuario eliminado'); await cfgLoadUsers(); }
      catch(e) { showToast('Error: '+e.message,'error'); }
    }, '🗑️');
  };

  window.cfgChangePassword = function() {
    openModal('Cambiar contraseña', `
      <form onsubmit="cfgDoChangePassword(event)" autocomplete="off">
        <div class="form-group" style="margin-bottom:12px">
          <label>Contraseña actual</label>
          <input class="form-control" name="current_password" type="password" required autocomplete="current-password">
        </div>
        <div class="form-group" style="margin-bottom:20px">
          <label>Nueva contraseña (mín. 4 caracteres)</label>
          <input class="form-control" name="new_password" type="password" required minlength="4" autocomplete="new-password">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Cambiar contraseña</button>
        </div>
      </form>`);
  };

  window.cfgDoChangePassword = async function(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('PUT', '/api/auth/password', { current_password: fd.get('current_password'), new_password: fd.get('new_password') });
      closeModal();
      showToast('Contraseña cambiada exitosamente');
    } catch(err) { showToast('Error: '+err.message,'error'); }
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

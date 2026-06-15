pageLoaders['config'] = async function loadConfig() {
  const el = document.getElementById('page-config');
  el.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">⚙️ Configuración</div><div class="page-subtitle">Parámetros globales del negocio</div></div>
    </div>
    <div id="config-content"><p style="color:var(--text-muted);padding:20px">Cargando...</p></div>`;

  try {
    const cfg = await api('GET', '/api/config');
    const taxPct = (parseFloat(cfg.tax_rate || 0) * 100).toFixed(0);

    document.getElementById('config-content').innerHTML = `
      <div class="grid-2">
        <div>
          <form id="config-form" onsubmit="saveConfig(event)">
            <div class="card">
              <div class="card-title">Datos del negocio</div>
              <div class="form-grid">
                <div class="form-group form-full">
                  <label>Nombre del negocio</label>
                  <input class="form-control" name="nombre_negocio" value="${cfg.nombre_negocio || ''}" placeholder="MakerManager Studio">
                </div>
                <div class="form-group">
                  <label>Moneda</label>
                  <select class="form-control" name="moneda">
                    ${['CAD','USD','MXN','EUR'].map(m => `<option ${cfg.moneda===m?'selected':''}>${m}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Impuesto (%)</label>
                  <input class="form-control" type="number" step="1" name="tax_rate" value="${taxPct}" placeholder="13">
                </div>
              </div>

              <div class="card-title" style="margin-top:20px">Costos operativos</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Costo kWh (CAD)</label>
                  <input class="form-control" type="number" step="0.001" name="costo_kwh" value="${cfg.costo_kwh || 0.18}">
                </div>
                <div class="form-group">
                  <label>Tarifa mano de obra (CAD/hora)</label>
                  <input class="form-control" type="number" step="0.01" name="tarifa_hora" value="${cfg.tarifa_hora || 25}">
                </div>
                <div class="form-group">
                  <label>Margen de ganancia (multiplicador)</label>
                  <input class="form-control" type="number" step="0.1" name="margen_default" value="${cfg.margen_default || 2.5}">
                  <small style="color:var(--text-muted)">Ej: 2.5 significa precio = costo × 2.5</small>
                </div>
                <div class="form-group">
                  <label>Vida útil impresora (horas)</label>
                  <input class="form-control" type="number" name="vida_util_impresora_horas" value="${cfg.vida_util_impresora_horas || 1500}">
                </div>
              </div>
            </div>
            <div class="form-actions" style="justify-content:flex-start;margin-top:16px">
              <button type="submit" class="btn btn-primary">💾 Guardar configuración</button>
            </div>
          </form>
        </div>

        <div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-title">Resumen actual</div>
            <div class="cost-breakdown">
              <div class="cost-row"><span>Negocio</span><span>${cfg.nombre_negocio || '-'}</span></div>
              <div class="cost-row"><span>Moneda</span><span>${cfg.moneda || 'CAD'}</span></div>
              <div class="cost-row"><span>Impuesto</span><span>${taxPct}%</span></div>
              <div class="cost-row"><span>Costo kWh</span><span>$${parseFloat(cfg.costo_kwh||0).toFixed(3)} CAD</span></div>
              <div class="cost-row"><span>Tarifa hora trabajo</span><span>$${parseFloat(cfg.tarifa_hora||0).toFixed(2)} CAD/h</span></div>
              <div class="cost-row"><span>Margen de ganancia</span><span>${cfg.margen_default || 2.5}×</span></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Herramientas</div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
              Carga datos de ejemplo con impresoras, filamentos y clientes para comenzar rápido.
            </p>
            <button class="btn btn-secondary" onclick="runSeed()">🔄 Cargar datos de ejemplo</button>
            <div class="alert alert-info" style="margin-top:16px;font-size:12px">
              ℹ️ Los datos de ejemplo incluyen: Bambu Lab P1S Combo, 5 filamentos PLA, y 2 clientes de prueba.
            </div>
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    document.getElementById('config-content').innerHTML = `<div class="alert alert-warning">Error: ${e.message}</div>`;
  }
};

async function saveConfig(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  if (data.tax_rate !== undefined) {
    data.tax_rate = (parseFloat(data.tax_rate) / 100).toFixed(4);
  }
  try {
    await api('PUT', '/api/config', data);
    showToast('Configuración guardada ✓');
    await pageLoaders['config']();
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function runSeed() {
  if (!confirm('¿Cargar datos de ejemplo?\nEsto borrará filamentos, impresoras y clientes existentes, y cargará datos de muestra.')) return;
  try {
    const res = await fetch('/api/seed', { method: 'POST' });
    if (!res.ok) throw new Error('Error del servidor');
    showToast('Datos de ejemplo cargados ✓');
  } catch(err) {
    showToast('Error: ' + err.message, 'error');
  }
}

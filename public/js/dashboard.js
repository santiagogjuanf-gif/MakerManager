pageLoaders['dashboard'] = async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div class="page-header"><div><div class="page-title">Dashboard</div><div class="page-subtitle">Resumen del negocio</div></div></div><div id="dash-content"><p style="color:var(--text-muted)">Cargando...</p></div>`;

  try {
    const data = await api('GET', '/api/dashboard');
    const { lowFilaments, recentJobs, monthStats, stats } = data;

    const lowAlert = lowFilaments.length > 0 ? `
      <div class="alert alert-warning">
        ⚠️ ${lowFilaments.length} filamento(s) con menos de 150g: ${lowFilaments.map(f => `<strong>${f.color} ${f.material}</strong>`).join(', ')}
      </div>` : '';

    const recentRows = recentJobs.length === 0
      ? '<tr><td colspan="5" class="empty-state">No hay trabajos recientes</td></tr>'
      : recentJobs.map(j => `
        <tr>
          <td>${j.id}</td>
          <td>${j.nombre_proyecto}</td>
          <td>${j.cliente_nombre || '-'}</td>
          <td>${j.fecha}</td>
          <td>${fmtCAD(j.precio_final_cad)}</td>
        </tr>`).join('');

    const lowRows = lowFilaments.length === 0
      ? '<tr><td colspan="4"><div class="empty-state">Todos los filamentos están bien 🎉</div></td></tr>'
      : lowFilaments.map(f => {
          const pct = Math.max(0, Math.min(100, (f.peso_actual_g / f.peso_inicial_g) * 100));
          const cls = pct < 10 ? 'danger' : pct < 20 ? 'warning' : 'success';
          return `<tr>
            <td><span class="color-dot" style="background:${colorHex(f.color)}"></span>${f.marca}</td>
            <td>${f.color} ${f.material}</td>
            <td>${fmtNum(f.peso_actual_g)}g</td>
            <td>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--${cls})"></div></div>
              <span class="badge badge-${cls === 'danger' ? 'low' : cls === 'warning' ? 'warn' : 'ok'}">${pct.toFixed(0)}%</span>
            </td>
          </tr>`;
        }).join('');

    document.getElementById('dash-content').innerHTML = `
      ${lowAlert}
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${stats.jobs}</div><div class="stat-label">Trabajos totales</div></div>
        <div class="stat-card"><div class="stat-value">${stats.filaments}</div><div class="stat-label">Filamentos</div></div>
        <div class="stat-card"><div class="stat-value">${stats.clients}</div><div class="stat-label">Clientes</div></div>
        <div class="stat-card"><div class="stat-value">${fmtCAD(monthStats?.total_ingresos)}</div><div class="stat-label">Ingresos del mes</div></div>
        <div class="stat-card"><div class="stat-value">${monthStats?.total_jobs || 0}</div><div class="stat-label">Trabajos del mes</div></div>
        <div class="stat-card"><div class="stat-value">${fmtNum(monthStats?.total_gramos)}g</div><div class="stat-label">Filamento usado (mes)</div></div>
      </div>

      <div class="grid-2">
        <div>
          <h3 style="margin-bottom:12px;font-size:14px;color:var(--text-muted)">🧵 Filamentos bajos</h3>
          <div class="table-container">
            <table>
              <thead><tr><th>Marca</th><th>Color/Material</th><th>Restante</th><th>Nivel</th></tr></thead>
              <tbody>${lowRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 style="margin-bottom:12px;font-size:14px;color:var(--text-muted)">📋 Trabajos recientes</h3>
          <div class="table-container">
            <table>
              <thead><tr><th>#</th><th>Proyecto</th><th>Cliente</th><th>Fecha</th><th>Total</th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    document.getElementById('dash-content').innerHTML = `<div class="alert alert-warning">Error cargando datos: ${e.message}</div>`;
  }
};

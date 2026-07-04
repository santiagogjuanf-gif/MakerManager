(function () {
  let _data = null;
  let _mes = new Date().toISOString().slice(0, 7);
  let _gastos = [];
  let _editGasto = null;

  const CATS = ['Filamento', 'Resina', 'Impresora', 'Mantenimiento', 'Consumible', 'Electricidad', 'General'];
  const CAT_COLORS = {
    'Filamento': '#6c63ff', 'Resina': '#06b6d4', 'Impresora': '#f59e0b',
    'Mantenimiento': '#ef4444', 'Consumible': '#10b981', 'Electricidad': '#f97316', 'General': '#8b5cf6',
  };

  function fmtM(v) {
    if (!v) return '$0.00';
    const sym = (_data?.config?.simbolo_moneda) || '$';
    const cur = (_data?.config?.moneda) || '';
    return `${sym}${parseFloat(v).toFixed(2)} ${cur}`.trim();
  }
  function fmtDate(d) { return d ? d.substring(0, 10) : '-'; }
  function mesLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${names[parseInt(m)-1]} ${y}`;
  }

  // ── Bar chart: Ingresos vs Gastos 6 months ──────────────────────────────────
  function drawBarChart(canvasId, meses6) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth || 600;
    const H = canvas.height = 220;
    const pad = { top: 20, right: 20, bottom: 40, left: 60 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6c63ff';
    const textMuted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
    const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333';

    ctx.clearRect(0, 0, W, H);

    if (!meses6 || !meses6.length) return;
    const maxVal = Math.max(...meses6.map(m => Math.max(m.ingresos || 0, m.gastos || 0)), 1);
    const n = meses6.length;
    const groupW = cw / n;
    const barW = Math.min(groupW * 0.3, 28);
    const gap = barW * 0.5;

    // Grid lines
    ctx.strokeStyle = border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + ch - (ch * i / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = textMuted;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      const val = maxVal * i / 4;
      ctx.fillText('$' + (val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0)), pad.left - 4, y + 4);
    }

    meses6.forEach((m, i) => {
      const cx = pad.left + groupW * i + groupW / 2;
      const ing = ((m.ingresos || 0) / maxVal) * ch;
      const gast = ((m.gastos || 0) / maxVal) * ch;

      // Ingreso bar (accent color)
      const r1 = parseInt(accent.slice(1,3)||'6c',16);
      const g1 = parseInt(accent.slice(3,5)||'63',16);
      const b1 = parseInt(accent.slice(5,7)||'ff',16);
      ctx.fillStyle = `rgba(${r1},${g1},${b1},0.85)`;
      ctx.beginPath();
      const x1 = cx - gap/2 - barW;
      roundRect(ctx, x1, pad.top + ch - ing, barW, ing, 3);
      ctx.fill();

      // Gasto bar (red)
      ctx.fillStyle = 'rgba(239,68,68,0.8)';
      ctx.beginPath();
      const x2 = cx + gap/2;
      roundRect(ctx, x2, pad.top + ch - gast, barW, gast, 3);
      ctx.fill();

      // Label
      ctx.fillStyle = textMuted;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(mesLabel(m.mes), cx, pad.top + ch + 18);
    });

    // Legend
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    const r2 = parseInt(accent.slice(1,3)||'6c',16);
    const g2 = parseInt(accent.slice(3,5)||'63',16);
    const b2 = parseInt(accent.slice(5,7)||'ff',16);
    ctx.fillStyle = `rgba(${r2},${g2},${b2},0.85)`;
    ctx.fillRect(pad.left, 4, 12, 10);
    ctx.fillStyle = textMuted; ctx.fillText('Ingresos', pad.left + 16, 13);
    ctx.fillStyle = 'rgba(239,68,68,0.8)';
    ctx.fillRect(pad.left + 80, 4, 12, 10);
    ctx.fillStyle = textMuted; ctx.fillText('Gastos', pad.left + 96, 13);
  }

  // ── Donut chart: gastos por categoría ───────────────────────────────────────
  function drawDonutChart(canvasId, cats) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth || 280;
    const H = canvas.height = 200;
    const cx = W / 2, cy = H / 2 - 8, r = Math.min(W, H) * 0.32, inner = r * 0.55;

    ctx.clearRect(0, 0, W, H);
    if (!cats || !cats.length) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
      ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Sin datos', cx, cy);
      return;
    }

    const total = cats.reduce((s, c) => s + (c.total || 0), 0);
    if (total === 0) return;
    let angle = -Math.PI / 2;

    cats.forEach(c => {
      const slice = (c.total / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = CAT_COLORS[c.categoria] || '#8b5cf6';
      ctx.fill();
      angle += slice;
    });

    // Inner circle (donut hole)
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#1e1e2e';
    ctx.fill();

    // Center text
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff';
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(fmtM(total), cx, cy + 5);
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) { ctx.rect(x, y, w, 1); return; }
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Render main page ─────────────────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('contabilidad-root');
    if (!container) return;

    try {
      [_data, _gastos] = await Promise.all([
        api('GET', `/api/contabilidad/resumen?mes=${_mes}`),
        api('GET', `/api/contabilidad/gastos?mes=${_mes}`),
      ]);
    } catch(e) { container.innerHTML = `<div class="alert alert-warning">Error cargando datos: ${e.message}</div>`; return; }

    const ing = _data.ingresos?.total || 0;
    const gast = _data.gastos?.total || 0;
    const util = ing - gast;
    const margen = ing > 0 ? ((util / ing) * 100).toFixed(1) : 0;
    const utilColor = util >= 0 ? 'var(--accent)' : '#ef4444';

    // Month picker — current and past 11 months
    const monthOptions = Array.from({length: 12}, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const ym = d.toISOString().slice(0, 7);
      return `<option value="${ym}" ${ym === _mes ? 'selected' : ''}>${mesLabel(ym)}</option>`;
    }).join('');

    container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">💰 Contabilidad</div>
        <div class="page-subtitle">Ingresos, gastos y utilidad del negocio</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="form-control" style="width:150px" onchange="contabSetMes(this.value)">${monthOptions}</select>
        <button class="btn btn-primary" onclick="contabNewGasto()">+ Registrar gasto</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">
      ${kpiCard('💚 Ingresos', fmtM(ing), `${_data.ingresos?.cnt||0} trabajos cerrados`, 'var(--accent)')}
      ${kpiCard('🔴 Gastos', fmtM(gast), `${_data.gastos?.cnt||0} registros`, '#ef4444')}
      ${kpiCard('📈 Utilidad neta', fmtM(util), util >= 0 ? 'Positivo este mes ✓' : 'Mes en negativo ⚠️', utilColor)}
      ${kpiCard('📊 Margen', `${margen}%`, 'Del ingreso bruto', margen >= 40 ? 'var(--accent)' : margen >= 20 ? '#f59e0b' : '#ef4444')}
      ${kpiCard('⏳ Pipeline', fmtM(_data.pending?.total||0), `${_data.pending?.cnt||0} trabajos activos`, '#f59e0b')}
    </div>

    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;margin-bottom:20px">
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">📊 Ingresos vs Gastos — últimos 6 meses</div>
        <canvas id="contab-bar-chart" style="width:100%;display:block"></canvas>
      </div>
      <div class="card" style="display:flex;flex-direction:column;align-items:center">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;align-self:flex-start">🍩 Gastos por categoría</div>
        <canvas id="contab-donut-chart" style="width:100%;display:block"></canvas>
        <div style="width:100%;margin-top:8px">
          ${(_data.gastCat||[]).map(c=>`
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px">
              <div style="width:10px;height:10px;border-radius:50%;background:${CAT_COLORS[c.categoria]||'#8b5cf6'};flex-shrink:0"></div>
              <span style="flex:1;color:var(--text-muted)">${c.categoria}</span>
              <strong>${fmtM(c.total)}</strong>
            </div>`).join('') || '<div style="font-size:11px;color:var(--text-muted)">Sin gastos este mes</div>'}
        </div>
      </div>
    </div>

    <!-- Movimientos y Gastos -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <!-- Movimientos del mes -->
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">📋 Movimientos del mes</div>
        <div style="max-height:320px;overflow-y:auto">
          ${_data.movimientos?.length ? _data.movimientos.map(m=>`
            <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:16px">${m.tipo==='ingreso'?'💚':'🔴'}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.descripcion||'-'}</div>
                <div style="font-size:10px;color:var(--text-muted)">${fmtDate(m.fecha)} · ${m.categoria}</div>
              </div>
              <strong style="font-size:12px;color:${m.tipo==='ingreso'?'var(--accent)':'#ef4444'};white-space:nowrap">${m.tipo==='ingreso'?'+':'−'}${fmtM(m.monto)}</strong>
            </div>`).join('')
          : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Sin movimientos</div>'}
        </div>
      </div>

      <!-- Gastos registrados -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700">🧾 Gastos registrados</div>
        </div>
        <div style="max-height:320px;overflow-y:auto">
          ${_gastos.length ? _gastos.map(g=>`
            <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
              <div style="width:8px;height:8px;border-radius:50%;background:${CAT_COLORS[g.categoria]||'#8b5cf6'};flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.descripcion}</div>
                <div style="font-size:10px;color:var(--text-muted)">${fmtDate(g.fecha)} · ${g.categoria}${g.proveedor?` · ${g.proveedor}`:''}</div>
              </div>
              <strong style="font-size:12px;color:#ef4444;white-space:nowrap;margin-right:4px">${fmtM(g.monto)}</strong>
              <div style="display:flex;gap:4px">
                <button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:10px" onclick="contabEditGasto(${g.id})">✏️</button>
                <button class="btn btn-danger btn-sm" style="padding:2px 6px;font-size:10px" onclick="contabDeleteGasto(${g.id})">🗑️</button>
              </div>
            </div>`).join('')
          : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Sin gastos registrados</div>'}
        </div>
      </div>
    </div>

    <!-- All-time by category -->
    ${_data.topCat?.length ? `<div class="card" style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">📦 Gastos históricos por categoría</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        ${_data.topCat.map(c=>`
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
            <div style="width:12px;height:12px;border-radius:50%;background:${CAT_COLORS[c.categoria]||'#8b5cf6'};margin:0 auto 6px"></div>
            <div style="font-size:10px;color:var(--text-muted)">${c.categoria}</div>
            <div style="font-size:14px;font-weight:700;color:#ef4444">${fmtM(c.total)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
    `;

    // Draw charts after DOM is ready
    requestAnimationFrame(() => {
      drawBarChart('contab-bar-chart', _data.meses6 || []);
      drawDonutChart('contab-donut-chart', _data.gastCat || []);
    });
  }

  function kpiCard(label, value, sub, color) {
    return `<div class="card" style="text-align:center;padding:16px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${color}">${value}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${sub}</div>
    </div>`;
  }

  // ── Gasto form modal ──────────────────────────────────────────────────────────
  function gastoFormHtml(g) {
    const today = new Date().toISOString().slice(0, 10);
    return `<form id="gasto-form">
      <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input type="date" class="form-control" name="fecha" value="${g?.fecha||today}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Monto</label>
          <input type="number" class="form-control" name="monto" step="0.01" min="0" value="${g?.monto||''}" placeholder="0.00" required>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Descripción</label>
          <input type="text" class="form-control" name="descripcion" value="${g?.descripcion||''}" placeholder="Ej: Filamento PLA 1kg Bambu Lab" required>
        </div>
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select class="form-control" name="categoria">
            ${CATS.map(c=>`<option value="${c}" ${(g?.categoria||'General')===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Proveedor</label>
          <input type="text" class="form-control" name="proveedor" value="${g?.proveedor||''}" placeholder="Ej: Amazon, Mercado Libre">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">Notas</label>
          <textarea class="form-control" name="notas" rows="2" placeholder="Notas opcionales">${g?.notas||''}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar gasto</button>
      </div>
    </form>`;
  }

  window.contabSetMes = function(mes) {
    _mes = mes;
    render();
  };

  window.contabNewGasto = function() {
    _editGasto = null;
    openModal('➕ Registrar gasto', gastoFormHtml(null));
    document.getElementById('gasto-form').onsubmit = async function(e) {
      e.preventDefault();
      const fd = new FormData(this);
      const body = Object.fromEntries(fd.entries());
      try {
        await api('POST', '/api/contabilidad/gastos', body);
        closeModal();
        showToast('Gasto registrado');
        render();
      } catch(err) { showToast('Error: ' + err.message, 'error'); }
    };
  };

  window.contabEditGasto = function(id) {
    const g = _gastos.find(x => x.id === id);
    if (!g) return;
    openModal('✏️ Editar gasto', gastoFormHtml(g));
    document.getElementById('gasto-form').onsubmit = async function(e) {
      e.preventDefault();
      const fd = new FormData(this);
      const body = Object.fromEntries(fd.entries());
      try {
        await api('PUT', `/api/contabilidad/gastos/${id}`, body);
        closeModal();
        showToast('Gasto actualizado');
        render();
      } catch(err) { showToast('Error: ' + err.message, 'error'); }
    };
  };

  window.contabDeleteGasto = function(id) {
    const g = _gastos.find(x => x.id === id);
    confirmModal(`¿Eliminar gasto "${g?.descripcion||'#'+id}"?`, async () => {
      try {
        await api('DELETE', `/api/contabilidad/gastos/${id}`);
        showToast('Eliminado');
        render();
      } catch(err) { showToast('Error: ' + err.message, 'error'); }
    }, '🗑️');
  };

  window.pageLoaders = window.pageLoaders || {};
  window.pageLoaders.contabilidad = async function() {
    document.getElementById('page-contabilidad').innerHTML = `<div id="contabilidad-root"><div class="loading-spinner" style="margin:60px auto"></div></div>`;
    await render();
  };
})();

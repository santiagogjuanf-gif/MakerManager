(function () {
  // ── G-code parser ────────────────────────────────────────────────────────────
  function parseGcode(text) {
    const result = { time_seconds: null, filament_g: null, filament_m: null, slicer: 'Desconocido', layers: null };

    // BambuStudio / OrcaSlicer
    let m = text.match(/;\s*total filament used\s*\[g\]\s*=\s*([\d.]+)/i);
    if (m) { result.filament_g = parseFloat(m[1]); result.slicer = 'BambuStudio/OrcaSlicer'; }
    m = text.match(/;\s*filament used\s*\[g\]\s*=\s*([\d.]+)/i);
    if (m && !result.filament_g) { result.filament_g = parseFloat(m[1]); result.slicer = 'PrusaSlicer'; }
    m = text.match(/;\s*filament used\s*\[mm\]\s*=\s*([\d.]+)/i);
    if (m) result.filament_m = parseFloat(m[1]) / 1000;

    // BambuStudio estimated time: "; estimated printing time = 2h 15m 30s"
    m = text.match(/;\s*estimated printing time(?:\s*\(normal mode\))?\s*=\s*(.*)/i);
    if (m) result.time_seconds = parseTimeStr(m[1]);

    // PrusaSlicer: "; estimated printing time (normal mode) = 2h 15m 30s"
    if (!result.time_seconds) {
      m = text.match(/;\s*estimated printing time \(normal mode\)\s*=\s*(.*)/i);
      if (m) result.time_seconds = parseTimeStr(m[1]);
    }

    // Cura: ";TIME:8100"
    if (!result.time_seconds) {
      m = text.match(/^;TIME:(\d+)/m);
      if (m) { result.time_seconds = parseInt(m[1]); result.slicer = 'Cura'; }
    }
    // Cura filament: ";Filament used: 4.56789m"
    if (!result.filament_m) {
      m = text.match(/^;Filament used:\s*([\d.]+)m/mi);
      if (m) result.filament_m = parseFloat(m[1]);
    }

    // Layers
    m = text.match(/;\s*total layer(?:s)?\s*(?:count|number)?\s*[=:]\s*(\d+)/i)
      || text.match(/^;LAYER_COUNT:(\d+)/m);
    if (m) result.layers = parseInt(m[1]);

    return result;
  }

  function parseTimeStr(str) {
    let total = 0;
    const h = str.match(/(\d+)\s*h/i), min = str.match(/(\d+)\s*m(?!s)/i), s = str.match(/(\d+)\s*s/i);
    if (h) total += parseInt(h[1]) * 3600;
    if (min) total += parseInt(min[1]) * 60;
    if (s) total += parseInt(s[1]);
    return total > 0 ? total : null;
  }

  function fmtSeconds(s) {
    if (!s) return '-';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // ── Core calculation ─────────────────────────────────────────────────────────
  function calculate() {
    const timeH      = parseFloat(document.getElementById('calc-time-h')?.value || 0)
                     + parseFloat(document.getElementById('calc-time-m')?.value || 0) / 60;
    const filG       = parseFloat(document.getElementById('calc-fil-g')?.value || 0);
    const costPerG   = parseFloat(document.getElementById('calc-cost-g')?.value || 0);
    const watts      = parseFloat(document.getElementById('calc-watts')?.value || 0);
    const kwh        = parseFloat(appConfig.costo_kwh || 0.18);
    const tarifaH    = parseFloat(document.getElementById('calc-tarifa-h')?.value || parseFloat(appConfig.tarifa_hora || 25));
    const qty        = Math.max(1, parseInt(document.getElementById('calc-qty')?.value || 1));
    const saleType   = document.getElementById('calc-sale-type')?.value || 'unitario';
    const taxRate    = parseFloat(appConfig.tax_rate || 0);
    const marginKey  = 'margen_' + saleType;
    const margin     = parseFloat(document.getElementById('calc-margin')?.value || appConfig[marginKey] || 1);

    const costFil    = filG * costPerG;
    const costElec   = (watts / 1000) * timeH * kwh;
    const costMach   = timeH * tarifaH;
    const costUnit   = costFil + costElec + costMach;
    const costTotal  = costUnit * qty;
    const priceNoTax = costTotal * margin;
    const taxAmt     = priceNoTax * taxRate;
    const priceTotal = priceNoTax + taxAmt;
    const pricePerPc = qty > 1 ? priceNoTax / qty : null;

    const fmt = (v) => fmtMoney(v);

    const rows = [
      ['🧵 Filamento', fmt(costFil), `${filG}g × ${fmt(costPerG)}/g`],
      ['⚡ Electricidad', fmt(costElec), `${watts}W × ${fmtSeconds(timeH*3600)} × $${kwh}/kWh`],
      ['🖨️ Maquinado', fmt(costMach), `${fmtSeconds(timeH*3600)} × ${fmt(tarifaH)}/h`],
      ['📦 Subtotal (×' + qty + ' pzas)', fmt(costTotal), ''],
      ['📈 Margen ×' + margin, fmt(priceNoTax), saleType],
    ];
    if (taxRate > 0) rows.push([`🧾 IVA (${Math.round(taxRate*100)}%)`, fmt(taxAmt), '']);
    rows.push(['💰 PRECIO FINAL', fmt(priceTotal), 'total']);
    if (pricePerPc) rows.push(['💰 Precio por pieza', fmt(pricePerPc), '']);

    const tbody = document.getElementById('calc-result-rows');
    if (tbody) {
      tbody.innerHTML = rows.map(([label, val, note], i) => {
        const isTotal = label.startsWith('💰 PRECIO FINAL');
        const isSub = label.startsWith('📦');
        return `<tr class="${isTotal ? 'calc-row-total' : isSub ? 'calc-row-sub' : ''}">
          <td>${label}</td>
          <td style="text-align:right;font-weight:${isTotal?'800':'600'}">${val}</td>
          <td style="font-size:11px;color:var(--text-muted)">${note}</td>
        </tr>`;
      }).join('');
    }

    // Store final price for "usar en trabajo"
    window._calcResult = { precio_final: priceTotal.toFixed(2), gramos: filG, tiempo_h: timeH.toFixed(2) };

    return priceTotal;
  }

  // ── Filament selector → cost per gram ────────────────────────────────────────
  async function loadFilamentsForCalc() {
    try {
      const fils = await api('GET', '/api/filaments');
      const sel = document.getElementById('calc-fil-sel');
      if (!sel) return;
      sel.innerHTML = `<option value="">-- Seleccionar filamento --</option>` +
        fils.map(f => {
          const costG = f.precio_compra && f.peso_inicial_g ? (f.precio_compra / f.peso_inicial_g) : 0;
          return `<option value="${costG.toFixed(4)}" data-name="${f.marca} ${f.material} ${f.color}">${f.marca || '-'} ${f.material} ${f.color} (${fmtMoney(costG)}/g)</option>`;
        }).join('');
      sel.onchange = () => {
        if (sel.value) document.getElementById('calc-cost-g').value = parseFloat(sel.value).toFixed(4);
        recalc();
      };
    } catch { /* ignore */ }
  }

  async function loadPrintersForCalc() {
    try {
      const prs = await api('GET', '/api/printers');
      const sel = document.getElementById('calc-printer-sel');
      if (!sel) return;
      sel.innerHTML = `<option value="">-- Seleccionar impresora --</option>` +
        prs.filter(p => p.tipo === 'FDM').map(p =>
          `<option value="${p.consumo_promedio_watts || 120}">${p.nombre} (${p.consumo_promedio_watts || 120}W)</option>`
        ).join('');
      sel.onchange = () => {
        if (sel.value) document.getElementById('calc-watts').value = sel.value;
        recalc();
      };
    } catch { /* ignore */ }
  }

  function recalc() { calculate(); }
  window.calcRecalc = recalc;

  // ── Margin auto-update when sale type changes ─────────────────────────────────
  window.calcSaleTypeChange = function(val) {
    const marginKey = 'margen_' + val;
    const m = document.getElementById('calc-margin');
    if (m) m.value = appConfig[marginKey] || 1;
    recalc();
  };

  // ── G-code file handler ───────────────────────────────────────────────────────
  window.calcHandleFile = function(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseGcode(text);
      const badge = document.getElementById('calc-gcode-badge');
      if (badge) badge.innerHTML = `<span style="color:var(--accent);font-size:11px">✓ ${file.name} — ${parsed.slicer}</span>`;

      if (parsed.time_seconds) {
        const h = Math.floor(parsed.time_seconds / 3600);
        const m = Math.round((parsed.time_seconds % 3600) / 60);
        const hEl = document.getElementById('calc-time-h');
        const mEl = document.getElementById('calc-time-m');
        if (hEl) hEl.value = h;
        if (mEl) mEl.value = m;
      }
      if (parsed.filament_g) {
        const gEl = document.getElementById('calc-fil-g');
        if (gEl) gEl.value = parsed.filament_g.toFixed(1);
      }
      if (parsed.layers) {
        const lEl = document.getElementById('calc-layers');
        if (lEl) lEl.textContent = parsed.layers + ' capas';
      }
      recalc();
    };
    reader.readAsText(file);
  };

  // ── Drop zone ─────────────────────────────────────────────────────────────────
  window.calcDrop = function(e) {
    e.preventDefault();
    const dz = document.getElementById('calc-dropzone');
    if (dz) dz.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseGcode(ev.target.result);
        const badge = document.getElementById('calc-gcode-badge');
        if (badge) badge.innerHTML = `<span style="color:var(--accent);font-size:11px">✓ ${file.name} — ${parsed.slicer}</span>`;
        if (parsed.time_seconds) {
          document.getElementById('calc-time-h').value = Math.floor(parsed.time_seconds / 3600);
          document.getElementById('calc-time-m').value = Math.round((parsed.time_seconds % 3600) / 60);
        }
        if (parsed.filament_g) document.getElementById('calc-fil-g').value = parsed.filament_g.toFixed(1);
        recalc();
      };
      reader.readAsText(file);
    }
  };

  // ── Open calculator ───────────────────────────────────────────────────────────
  window.openCalculator = function(prefill) {
    const defaultMargin = appConfig.margen_unitario || 3;
    const defaultTarifa = appConfig.tarifa_hora || 25;
    const taxPct = Math.round(parseFloat(appConfig.tax_rate || 0) * 100);

    openModal('🧮 Calculadora de Costos', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="calc-layout">

        <!-- LEFT: inputs -->
        <div>
          <!-- G-code drop zone -->
          <div id="calc-dropzone" class="calc-dropzone"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="calcDrop(event)">
            <div style="font-size:28px">📄</div>
            <div style="font-size:13px;font-weight:600;margin:4px 0">Arrastra tu G-code aquí</div>
            <div style="font-size:11px;color:var(--text-muted)">BambuStudio, OrcaSlicer, PrusaSlicer, Cura</div>
            <label style="margin-top:8px;cursor:pointer;font-size:11px;padding:5px 12px;background:var(--accent);color:#fff;border-radius:6px;display:inline-block">
              Seleccionar archivo
              <input type="file" accept=".gcode,.gco,.g,.3mf" onchange="calcHandleFile(this)" style="display:none">
            </label>
            <div id="calc-gcode-badge" style="margin-top:6px;min-height:16px"></div>
            <div id="calc-layers" style="font-size:10px;color:var(--text-muted)"></div>
          </div>

          <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <!-- Tiempo -->
            <div class="form-group" style="grid-column:1/-1">
              <label>⏱️ Tiempo de impresión</label>
              <div style="display:flex;gap:6px;align-items:center">
                <input id="calc-time-h" class="form-control" type="number" min="0" value="${prefill?.horas||0}" oninput="calcRecalc()" style="width:70px"> <span style="color:var(--text-muted);font-size:12px">h</span>
                <input id="calc-time-m" class="form-control" type="number" min="0" max="59" value="${prefill?.minutos||0}" oninput="calcRecalc()" style="width:70px"> <span style="color:var(--text-muted);font-size:12px">min</span>
              </div>
            </div>

            <!-- Filamento -->
            <div class="form-group" style="grid-column:1/-1">
              <label>🧵 Filamento usado (g)</label>
              <input id="calc-fil-g" class="form-control" type="number" step="0.1" min="0" value="${prefill?.gramos||0}" oninput="calcRecalc()">
            </div>

            <!-- Filamento selector -->
            <div class="form-group" style="grid-column:1/-1">
              <label>Filamento del inventario</label>
              <select id="calc-fil-sel" class="form-control"></select>
            </div>

            <!-- Costo/g manual -->
            <div class="form-group" style="grid-column:1/-1">
              <label>Costo por gramo <span style="font-size:10px;color:var(--text-muted)">(se llena al seleccionar arriba)</span></label>
              <input id="calc-cost-g" class="form-control" type="number" step="0.0001" min="0" value="0" oninput="calcRecalc()">
            </div>

            <!-- Impresora -->
            <div class="form-group" style="grid-column:1/-1">
              <label>🖨️ Impresora</label>
              <select id="calc-printer-sel" class="form-control"></select>
            </div>

            <!-- Watts -->
            <div class="form-group">
              <label>Consumo (W)</label>
              <input id="calc-watts" class="form-control" type="number" min="0" value="120" oninput="calcRecalc()">
            </div>

            <!-- Tarifa hora -->
            <div class="form-group">
              <label>Tarifa/hora</label>
              <input id="calc-tarifa-h" class="form-control" type="number" step="0.01" value="${defaultTarifa}" oninput="calcRecalc()">
            </div>

            <!-- Cantidad -->
            <div class="form-group">
              <label>📦 Cantidad (pzas)</label>
              <input id="calc-qty" class="form-control" type="number" min="1" value="1" oninput="calcRecalc()">
            </div>

            <!-- Tipo de venta -->
            <div class="form-group">
              <label>Tipo de venta</label>
              <select id="calc-sale-type" class="form-control" onchange="calcSaleTypeChange(this.value)">
                <option value="unitario">Unitario</option>
                <option value="menudeo">Menudeo</option>
                <option value="mayoreo">Mayoreo</option>
              </select>
            </div>

            <!-- Margen -->
            <div class="form-group" style="grid-column:1/-1">
              <label>Margen (multiplicador)</label>
              <input id="calc-margin" class="form-control" type="number" step="0.1" min="1" value="${defaultMargin}" oninput="calcRecalc()">
            </div>
          </div>
        </div>

        <!-- RIGHT: results -->
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--text-muted)">Desglose de costos</div>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <tbody id="calc-result-rows"></tbody>
            </table>
          </div>
          <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">
            kWh: ${appConfig.costo_kwh || 0.18} | IVA: ${taxPct}%
          </div>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-primary" onclick="calcUseInJob()">📋 Usar en nuevo trabajo</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
          </div>
        </div>
      </div>
    `);

    loadFilamentsForCalc();
    loadPrintersForCalc();
    recalc();
  };

  // ── Use result in a new job ───────────────────────────────────────────────────
  window.calcUseInJob = function() {
    closeModal();
    window._calcPrefill = window._calcResult;
    window.location.hash = 'jobs';
    navigate('jobs');
    setTimeout(() => {
      if (window.jobOpenFormWithPrice) window.jobOpenFormWithPrice(window._calcPrefill);
    }, 300);
  };
})();

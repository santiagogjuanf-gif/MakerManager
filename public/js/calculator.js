(function () {
  // ── State ────────────────────────────────────────────────────────────────────
  let filCount = 1;      // how many filament rows
  let hwCount  = 0;      // how many hardware rows
  let _allFils = [];
  let _allPrinters = [];

  // Qty cards — default 1 / 5 / 10, user can change
  const qtyDefaults = [1, 5, 10];

  // Colors per cost segment (for donut)
  const SEG_COLORS = {
    filamento:    'var(--accent)',
    electricidad: '#f59e0b',
    maquinado:    '#3b82f6',
    manoObra:     '#ec4899',
    hardware:     '#8b5cf6',
    embalaje:     '#06b6d4',
  };

  // ── Donut chart (pure SVG, no library) ───────────────────────────────────────
  function renderDonut(segments) {
    const R = 54, SW = 22, CX = 70, CY = 70;
    const circ = 2 * Math.PI * R;
    const total = segments.reduce((s, x) => s + x.value, 0);

    if (total <= 0) {
      return `<svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${SW}"/>
        <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="11">$0</text>
      </svg>`;
    }

    let offset = 0;
    let arcs = '';
    segments.forEach(seg => {
      if (seg.value <= 0) return;
      const len = (seg.value / total) * circ;
      const gap = circ - len;
      arcs += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
        stroke="${seg.color}" stroke-width="${SW}"
        stroke-dasharray="${len.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${CX} ${CY})"
        style="transition:stroke-dasharray 0.4s"/>`;
      offset += len;
    });

    const centerLabel = fmtMoney(total);
    return `<svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${SW}" opacity="0.3"/>
      ${arcs}
      <text x="${CX}" y="${CY - 7}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-size="11" font-weight="700">${centerLabel}</text>
      <text x="${CX}" y="${CY + 10}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="9">costo base</text>
    </svg>`;
  }

  // ── Calculation engine ────────────────────────────────────────────────────────
  function getValues() {
    const timeH    = parseFloat(document.getElementById('calc-time-h')?.value || 0)
                   + parseFloat(document.getElementById('calc-time-m')?.value || 0) / 60;
    const watts    = parseFloat(document.getElementById('calc-watts')?.value || 0);
    const kwh      = parseFloat(appConfig.costo_kwh || 0.18);
    // costMach uses printer depreciation rate (costo_por_hora), NOT tarifa_hora
    const machRate = parseFloat(document.getElementById('calc-mach-rate')?.value || 0);
    // mano de obra uses the operator hourly rate from config
    const tarifaH  = parseFloat(appConfig.tarifa_hora || 25);
    const moHours  = parseFloat(document.getElementById('calc-mo-h')?.value || 0)
                   + parseFloat(document.getElementById('calc-mo-m')?.value || 0) / 60;
    const embalaje = parseFloat(document.getElementById('calc-embalaje')?.value || 0);

    // Filaments
    let costFil = 0;
    for (let i = 0; i < filCount; i++) {
      const g  = parseFloat(document.getElementById(`calc-fil-g-${i}`)?.value || 0);
      const cg = parseFloat(document.getElementById(`calc-fil-cg-${i}`)?.value || 0);
      costFil += g * cg;
    }

    // Hardware (uses hidden cost field set by calcHwChange)
    let costHW = 0;
    for (let i = 0; i < hwCount; i++) {
      const row = document.getElementById(`calc-hw-row-${i}`);
      if (!row) continue;
      const unit = parseFloat(document.getElementById(`calc-hw-cost-${i}`)?.value || 0);
      const qty  = parseFloat(document.getElementById(`calc-hw-qty-${i}`)?.value  || 1);
      costHW += unit * qty;
    }

    const costElec = (watts / 1000) * timeH * kwh;
    const costMach = timeH * machRate;   // printer depreciation/maintenance per hour
    const costMO   = moHours * tarifaH; // human labor rate
    const costBase = costFil + costElec + costMach + costMO + costHW + embalaje;

    return { costFil, costElec, costMach, costMO, costHW, embalaje, costBase, timeH, tarifaH, machRate };
  }

  function calcQtyPrice(costBase, qty, margin, taxRate) {
    const total      = costBase * qty;
    const priceNoTax = total * margin;
    const tax        = priceNoTax * taxRate;
    const priceTotal = priceNoTax + tax;
    const perPiece   = priceTotal / qty;
    return { total, priceNoTax, tax, priceTotal, perPiece };
  }

  function recalc() {
    const v = getValues();
    const margin  = parseFloat(document.getElementById('calc-margin')?.value || appConfig.margen_unitario || 3);
    const taxRate = parseFloat(appConfig.tax_rate || 0);
    const taxPct  = Math.round(taxRate * 100);

    // Donut
    const donutEl = document.getElementById('calc-donut');
    if (donutEl) {
      donutEl.innerHTML = renderDonut([
        { value: v.costFil,   color: SEG_COLORS.filamento,    label: 'Filamento'     },
        { value: v.costElec,  color: SEG_COLORS.electricidad, label: 'Electricidad'  },
        { value: v.costMach,  color: SEG_COLORS.maquinado,    label: 'Maquinado'     },
        { value: v.costMO,    color: SEG_COLORS.manoObra,     label: 'Mano de obra'  },
        { value: v.costHW,    color: SEG_COLORS.hardware,     label: 'Hardware'      },
        { value: v.embalaje,  color: SEG_COLORS.embalaje,     label: 'Embalaje'      },
      ]);
    }

    // Legend
    const legendEl = document.getElementById('calc-legend');
    if (legendEl && v.costBase > 0) {
      const items = [
        ['🧵 Filamento',    v.costFil,  SEG_COLORS.filamento],
        ['⚡ Electricidad', v.costElec, SEG_COLORS.electricidad],
        [`🖨️ Maquinado (${fmtMoney(v.machRate)}/h)`, v.costMach, SEG_COLORS.maquinado],
        ['👷 Mano de obra', v.costMO,   SEG_COLORS.manoObra],
        ['🔩 Hardware',     v.costHW,   SEG_COLORS.hardware],
        ['📦 Embalaje',     v.embalaje, SEG_COLORS.embalaje],
      ].filter(([,val]) => val > 0);
      legendEl.innerHTML = items.map(([label, val, color]) =>
        `<div style="display:flex;align-items:center;gap:6px;font-size:11px">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
          <span style="color:var(--text-muted);flex:1">${label}</span>
          <span style="font-weight:600">${fmtMoney(val)}</span>
        </div>`
      ).join('');
    }

    // Price cards
    const qtys = [0, 1, 2].map(i => Math.max(1, parseInt(document.getElementById(`calc-qty-${i}`)?.value || qtyDefaults[i])));
    const margins = qtys.map((_, i) => {
      const keys = ['margen_unitario', 'margen_menudeo', 'margen_mayoreo'];
      return parseFloat(appConfig[keys[i]] || margin);
    });
    // Use user-edited margin for card 0
    margins[0] = margin;

    qtys.forEach((qty, i) => {
      const p = calcQtyPrice(v.costBase, qty, margins[i], taxRate);
      const card = document.getElementById(`calc-price-card-${i}`);
      if (!card) return;
      card.querySelector('.cpc-total').textContent   = fmtMoney(p.priceTotal);
      card.querySelector('.cpc-cost').textContent    = `Costo: ${fmtMoney(p.total)}`;
      card.querySelector('.cpc-margin').textContent  = `Margen ×${margins[i]}`;
      card.querySelector('.cpc-tax').textContent     = taxPct > 0 ? `IVA ${taxPct}%: ${fmtMoney(p.tax)}` : '';
      if (qty > 1) card.querySelector('.cpc-each').textContent = `${fmtMoney(p.perPiece)} / pieza`;
      else card.querySelector('.cpc-each').textContent = '';
    });

    // Store result
    window._calcResult = {
      precio_unitario: calcQtyPrice(v.costBase, 1, margin, taxRate).priceTotal,
      costBase: v.costBase,
    };
  }

  window.calcRecalc = recalc;

  // ── Filament rows ─────────────────────────────────────────────────────────────
  function filRowHtml(i) {
    // Use costo_por_gramo directly (already calculated and stored in DB)
    const opts = _allFils.map(f => {
      const cg = parseFloat(f.costo_por_gramo || 0);
      return `<option value="${cg}" data-nombre="${f.marca||'-'} ${f.material} ${f.color}">${f.marca || '-'} ${f.material} ${f.color}</option>`;
    }).join('');
    return `<div class="calc-fil-row" id="calc-fil-row-${i}" style="margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr 100px;gap:8px;align-items:flex-end">
        <div class="form-group" style="margin:0">
          <select id="calc-fil-sel-${i}" class="form-control" onchange="calcFilChange(${i})">
            <option value="">-- Seleccionar filamento --</option>
            ${opts}
          </select>
          <input type="hidden" id="calc-fil-cg-${i}" value="0">
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:10px;color:var(--text-muted)">Gramos usados</label>
          <input id="calc-fil-g-${i}" class="form-control" type="number" step="0.1" min="0" value="" oninput="calcFilChange(${i})" placeholder="0">
        </div>
      </div>
      <div id="calc-fil-info-${i}" style="font-size:11px;color:var(--text-muted);margin-top:4px;padding:0 2px;min-height:16px"></div>
    </div>`;
  }

  window.calcFilChange = function(i) {
    const sel  = document.getElementById(`calc-fil-sel-${i}`);
    const cgEl = document.getElementById(`calc-fil-cg-${i}`);
    const gEl  = document.getElementById(`calc-fil-g-${i}`);
    const info = document.getElementById(`calc-fil-info-${i}`);
    if (!sel) return;
    const cg = parseFloat(sel.value || 0);
    if (cgEl) cgEl.value = cg;
    if (info) {
      if (sel.value && cg > 0) {
        const g = parseFloat(gEl?.value || 0);
        const subtotal = g * cg;
        const cgDisplay = parseFloat(cg) < 0.01
          ? `$${parseFloat(cg).toFixed(5)}`
          : `$${parseFloat(cg).toFixed(4)}`;
        info.innerHTML = `<span style="color:var(--accent);font-weight:600">${cgDisplay}/g</span>`
          + (g > 0 ? ` &nbsp;·&nbsp; ${g}g = <strong style="color:var(--text)">${fmtMoney(subtotal)}</strong>` : '');
      } else if (sel.value && cg === 0) {
        info.innerHTML = `<span style="color:#f59e0b">⚠️ Sin costo registrado — ve a Inventario → Filamentos y agrega el costo de compra</span>`;
      } else {
        info.textContent = '';
      }
    }
    recalc();
  };

  window.calcAddFil = function() {
    const container = document.getElementById('calc-fil-rows');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', filRowHtml(filCount));
    filCount++;
    recalc();
  };

  window.calcRemFil = function() {
    if (filCount <= 1) return;
    filCount--;
    const row = document.getElementById(`calc-fil-row-${filCount}`);
    if (row) row.remove();
    recalc();
  };

  // ── Hardware rows (from internal consumables inventory) ───────────────────────
  let _allInternos = [];

  function hwRowHtml(i) {
    const opts = _allInternos.map(c =>
      `<option value="${parseFloat(c.costo_unitario||0)}" data-unidad="${c.unidad||'pcs'}">${c.nombre} (${fmtMoney(c.costo_unitario||0)}/${c.unidad||'pcs'})</option>`
    ).join('');
    return `<div class="calc-hw-row" id="calc-hw-row-${i}" style="margin-bottom:8px">
      <div style="display:grid;grid-template-columns:1fr 80px auto;gap:6px;align-items:flex-end">
        <div class="form-group" style="margin:0">
          <select id="calc-hw-sel-${i}" class="form-control" style="font-size:12px" onchange="calcHwChange(${i})">
            <option value="">-- Seleccionar del inventario --</option>
            ${opts}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:10px;color:var(--text-muted)">Cantidad</label>
          <input id="calc-hw-qty-${i}" class="form-control" type="number" min="1" value="1" oninput="calcHwChange(${i})" style="font-size:12px">
        </div>
        <button type="button" onclick="calcRemHw(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;padding:0 4px;margin-bottom:2px" title="Eliminar">✕</button>
      </div>
      <div id="calc-hw-info-${i}" style="font-size:11px;color:var(--text-muted);margin-top:3px;min-height:14px"></div>
      <input type="hidden" id="calc-hw-cost-${i}" value="0">
    </div>`;
  }

  window.calcHwChange = function(i) {
    const sel  = document.getElementById(`calc-hw-sel-${i}`);
    const qty  = parseFloat(document.getElementById(`calc-hw-qty-${i}`)?.value || 1);
    const cost = document.getElementById(`calc-hw-cost-${i}`);
    const info = document.getElementById(`calc-hw-info-${i}`);
    if (!sel) return;
    const unitCost = parseFloat(sel.value || 0);
    if (cost) cost.value = unitCost;
    if (info && sel.value) {
      const subtotal = unitCost * qty;
      const unidad = sel.options[sel.selectedIndex]?.dataset.unidad || 'pcs';
      info.innerHTML = `${fmtMoney(unitCost)}/${unidad} × ${qty} = <strong style="color:var(--text)">${fmtMoney(subtotal)}</strong>`;
    } else if (info) {
      info.textContent = '';
    }
    recalc();
  };

  window.calcAddHw = function() {
    const container = document.getElementById('calc-hw-rows');
    if (!container) return;
    // Clear placeholder text on first add
    const placeholder = container.querySelector('.calc-hw-placeholder');
    if (placeholder) placeholder.remove();
    container.insertAdjacentHTML('beforeend', hwRowHtml(hwCount));
    hwCount++;
    recalc();
  };

  window.calcRemHw = function(i) {
    const row = document.getElementById(`calc-hw-row-${i}`);
    if (row) row.remove();
    recalc();
  };

  // ── Load data from API ────────────────────────────────────────────────────────
  async function loadData() {
    [_allFils, _allPrinters, _allInternos] = await Promise.all([
      api('GET', '/api/filaments').catch(() => []),
      api('GET', '/api/printers').catch(() => []),
      api('GET', '/api/consumibles/internos').catch(() => []),
    ]);
  }

  function populatePrinters() {
    const sel = document.getElementById('calc-printer-sel');
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Seleccionar impresora --</option>` +
      _allPrinters.map(p =>
        `<option value="${p.consumo_promedio_watts || 120}" data-cph="${p.costo_por_hora || 0}">
          ${p.nombre} (${p.consumo_promedio_watts || 120}W)
        </option>`
      ).join('');
    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      const wEl    = document.getElementById('calc-watts');
      const rEl    = document.getElementById('calc-mach-rate');
      const rLabel = document.getElementById('calc-mach-rate-label');
      if (wEl && sel.value) wEl.value = sel.value;
      const cph = parseFloat(opt?.dataset.cph || 0);
      if (rEl) rEl.value = cph;
      if (rLabel) rLabel.textContent = cph > 0 ? `${fmtMoney(cph)}/h` : '—';
      recalc();
    };
  }

  function buildFilRows() {
    const container = document.getElementById('calc-fil-rows');
    if (!container) return;
    container.innerHTML = filRowHtml(0);
  }

  // ── Price card HTML ───────────────────────────────────────────────────────────
  function priceCardHtml(i, defaultQty, label, accentStyle) {
    return `<div id="calc-price-card-${i}" class="calc-price-card ${accentStyle}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <label style="font-size:11px;color:var(--text-muted);margin:0">Piezas:</label>
        <input id="calc-qty-${i}" class="form-control" type="number" min="1" value="${defaultQty}"
          oninput="calcRecalc()" style="width:60px;font-size:12px;padding:3px 6px">
      </div>
      <div class="cpc-label">${label}</div>
      <div class="cpc-total">$0.00</div>
      <div class="cpc-cost" style="font-size:11px;color:var(--text-muted)">Costo: $0</div>
      <div class="cpc-margin" style="font-size:10px;color:var(--text-muted)"></div>
      <div class="cpc-tax"   style="font-size:10px;color:var(--text-muted)"></div>
      <div class="cpc-each"  style="font-size:11px;color:var(--accent-light);margin-top:4px;font-weight:700"></div>
    </div>`;
  }

  // ── Collect form data for saving ──────────────────────────────────────────────
  function collectFormData() {
    const fils = [];
    for (let i = 0; i < filCount; i++) {
      const sel = document.getElementById(`calc-fil-sel-${i}`);
      const g   = document.getElementById(`calc-fil-g-${i}`)?.value;
      const cg  = document.getElementById(`calc-fil-cg-${i}`)?.value;
      if (sel) fils.push({ nombre: sel.options[sel.selectedIndex]?.text || '', gramos: g, costo_g: cg });
    }
    const hws = [];
    for (let i = 0; i < hwCount; i++) {
      const row = document.getElementById(`calc-hw-row-${i}`);
      if (!row) continue;
      const desc = row.querySelector('input[placeholder]')?.value;
      const cost = document.getElementById(`calc-hw-cost-${i}`)?.value;
      const qty  = document.getElementById(`calc-hw-qty-${i}`)?.value;
      hws.push({ desc, cost, qty });
    }
    return {
      nombre:     document.getElementById('calc-nombre')?.value || '',
      printer:    document.getElementById('calc-printer-sel')?.options[document.getElementById('calc-printer-sel')?.selectedIndex]?.text || '',
      tiempo_h:   document.getElementById('calc-time-h')?.value || 0,
      tiempo_m:   document.getElementById('calc-time-m')?.value || 0,
      watts:      document.getElementById('calc-watts')?.value || 0,
      mo_h:       document.getElementById('calc-mo-h')?.value || 0,
      mo_m:       document.getElementById('calc-mo-m')?.value || 0,
      embalaje:   document.getElementById('calc-embalaje')?.value || 0,
      margin:     document.getElementById('calc-margin')?.value || 3,
      filamentos: fils,
      hardware:   hws,
    };
  }

  // ── Open modal ────────────────────────────────────────────────────────────────
  window.openCalculator = async function(prefill) {
    filCount = 1;
    hwCount  = 0;

    await loadData();

    const taxPct = Math.round(parseFloat(appConfig.tax_rate || 0) * 100);
    const defaultMargin = appConfig.margen_unitario || 3;

    openModal('🧮 Calculadora de Costos', `
      <div class="calc-wrap">

        <!-- ── LEFT ── -->
        <div class="calc-left">

          <!-- Proyecto -->
          <div class="calc-section">
            <div class="calc-section-title">📋 Proyecto</div>
            <div class="form-group" style="margin:0">
              <label>Nombre del proyecto</label>
              <input id="calc-nombre" class="form-control" placeholder="Ej: Llavero logo cliente" value="${prefill?.nombre || ''}" autocomplete="off">
            </div>
          </div>

          <!-- Impresión -->
          <div class="calc-section">
            <div class="calc-section-title">🖨️ Impresión</div>
            <div class="form-group">
              <label>Impresora</label>
              <select id="calc-printer-sel" class="form-control"></select>
            </div>
            <div class="form-group">
              <label>Tiempo de impresión</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="calc-time-h" class="form-control" type="number" min="0" value="" oninput="calcRecalc()" style="width:70px">
                <span style="color:var(--text-muted);font-size:12px">h</span>
                <input id="calc-time-m" class="form-control" type="number" min="0" max="59" value="" oninput="calcRecalc()" style="width:70px">
                <span style="color:var(--text-muted);font-size:12px">min</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="form-group" style="margin:0">
                <label>Consumo (W)</label>
                <input id="calc-watts" class="form-control" type="number" min="0" value="120" oninput="calcRecalc()">
              </div>
              <div class="form-group" style="margin:0">
                <label style="display:flex;align-items:center;gap:4px">
                  Depreciación/h
                  <div class="calc-tooltip-wrap">
                    <span class="calc-tooltip-icon">?</span>
                    <div class="calc-tooltip-box">Costo de depreciación de la impresora por hora (precio compra ÷ vida útil). Se calcula automáticamente al seleccionar la impresora.</div>
                  </div>
                </label>
                <div id="calc-mach-rate-label" style="padding:7px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--text-muted)">—</div>
                <input type="hidden" id="calc-mach-rate" value="0">
              </div>
            </div>
          </div>

          <!-- Filamentos -->
          <div class="calc-section">
            <div class="calc-section-title" style="display:flex;align-items:center;justify-content:space-between">
              <span>🧵 Filamento(s)</span>
              <div style="display:flex;gap:4px">
                <button type="button" onclick="calcRemFil()" class="calc-pm-btn" title="Quitar filamento">−</button>
                <button type="button" onclick="calcAddFil()" class="calc-pm-btn" title="Agregar filamento">＋</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto;gap:4px;font-size:10px;color:var(--text-muted);margin-bottom:4px;padding:0 2px">
              <span>Filamento del inventario</span><span>Gramos</span>
            </div>
            <div id="calc-fil-rows"></div>
          </div>

          <!-- Mano de obra -->
          <div class="calc-section">
            <div class="calc-section-title" style="display:flex;align-items:center;gap:6px">
              <span>👷 Mano de obra</span>
              <div class="calc-tooltip-wrap">
                <span class="calc-tooltip-icon">?</span>
                <div class="calc-tooltip-box">Incluye: configuración de la impresora, remoción de soportes, acabado y lijado de la pieza.</div>
              </div>
            </div>
            <div class="form-group" style="margin:0">
              <label>Tiempo total de mano de obra</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="calc-mo-h" class="form-control" type="number" min="0" value="" oninput="calcRecalc()" style="width:70px">
                <span style="color:var(--text-muted);font-size:12px">h</span>
                <input id="calc-mo-m" class="form-control" type="number" min="0" max="59" value="10" oninput="calcRecalc()" style="width:70px">
                <span style="color:var(--text-muted);font-size:12px">min</span>
              </div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Tarifa mano de obra: ${fmtMoney(appConfig.tarifa_hora || 25)}/h (Configuración → Tarifas)</div>
            </div>
          </div>

          <!-- Hardware -->
          <div class="calc-section">
            <div class="calc-section-title" style="display:flex;align-items:center;justify-content:space-between">
              <span>🔩 Hardware / Extras</span>
              <button type="button" onclick="calcAddHw()" class="calc-pm-btn" title="Agregar componente">＋ Agregar</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 80px 60px 24px;gap:6px;font-size:10px;color:var(--text-muted);margin-bottom:4px;padding:0 2px">
              <span>Descripción</span><span>$/unidad</span><span>Cant.</span><span></span>
            </div>
            <div id="calc-hw-rows">
              <div class="calc-hw-placeholder" style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">Presiona ＋ Agregar para seleccionar del inventario</div>
            </div>
          </div>

          <!-- Embalaje -->
          <div class="calc-section">
            <div class="calc-section-title">📦 Embalaje</div>
            <div class="form-group" style="margin:0">
              <label>Costo de empaque por pieza (caja, bolsa, etc.)</label>
              <input id="calc-embalaje" class="form-control" type="number" step="0.01" min="0" value="" oninput="calcRecalc()">
            </div>
          </div>

          <!-- Margen -->
          <div class="calc-section">
            <div class="calc-section-title">📈 Margen</div>
            <div class="form-group" style="margin:0">
              <label>Multiplicador de ganancia</label>
              <input id="calc-margin" class="form-control" type="number" step="0.1" min="1" value="${defaultMargin}" oninput="calcRecalc()">
              <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                Menudeo ×${appConfig.margen_menudeo || 2.5} &nbsp;|&nbsp; Mayoreo ×${appConfig.margen_mayoreo || 1.8} &nbsp;|&nbsp; IVA ${taxPct}%
              </div>
            </div>
          </div>
        </div>

        <!-- ── RIGHT ── -->
        <div class="calc-right">
          <!-- Donut -->
          <div class="calc-section" style="text-align:center">
            <div class="calc-section-title">Desglose de costos</div>
            <div id="calc-donut" style="display:inline-block"></div>
            <div id="calc-legend" style="text-align:left;margin-top:10px;display:flex;flex-direction:column;gap:5px"></div>
          </div>

          <!-- Price cards -->
          <div class="calc-section">
            <div class="calc-section-title">💰 Precios sugeridos</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${priceCardHtml(0, 1,  '1 pieza',   'calc-card-primary')}
              ${priceCardHtml(1, 5,  'Menudeo',   'calc-card-menudeo')}
              ${priceCardHtml(2, 10, 'Mayoreo',   'calc-card-mayoreo')}
            </div>
          </div>
        </div>
      </div>

      <!-- ── BUTTONS ── -->
      <div class="calc-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">✗ Cancelar</button>
        <button type="button" class="btn btn-secondary" onclick="verCotizaciones()" style="margin-right:auto">📂 Ver guardadas</button>
        <button type="button" class="btn btn-secondary" onclick="calcAceptar()">✓ Aceptar</button>
        <button type="button" class="btn btn-primary"   onclick="calcGuardar()">💾 Guardar cotización</button>
      </div>
    `);

    // Make this modal wider than the default
    document.getElementById('modal-box')?.classList.add('modal-wide');
    populatePrinters();
    buildFilRows();
    recalc();
  };

  // ── Actions ───────────────────────────────────────────────────────────────────
  window.calcAceptar = function() {
    const v = getValues();
    const margin  = parseFloat(document.getElementById('calc-margin')?.value || 3);
    const taxRate = parseFloat(appConfig.tax_rate || 0);
    const precio  = calcQtyPrice(v.costBase, 1, margin, taxRate).priceTotal;
    window._calcResult = { precio_final: precio.toFixed(2), gramos: 0 };
    closeModal();
    showToast(`Precio calculado: ${fmtMoney(precio)}`);
  };

  window.calcGuardar = async function() {
    const datos = collectFormData();
    if (!datos.nombre.trim()) {
      showToast('Escribe el nombre del proyecto antes de guardar', 'error');
      return;
    }
    const v = getValues();
    const margin  = parseFloat(document.getElementById('calc-margin')?.value || 3);
    const taxRate = parseFloat(appConfig.tax_rate || 0);
    const precio  = calcQtyPrice(v.costBase, 1, margin, taxRate).priceTotal;
    try {
      await api('POST', '/api/cotizaciones', { nombre: datos.nombre, datos, precio_unitario: precio });
      showToast(`Cotización "${datos.nombre}" guardada`);
      closeModal();
    } catch (e) {
      showToast('Error al guardar: ' + e.message, 'error');
    }
  };

  // ── Ver cotizaciones guardadas ────────────────────────────────────────────────
  window.verCotizaciones = async function() {
    closeModal();
    let rows = [];
    try { rows = await api('GET', '/api/cotizaciones'); } catch { rows = []; }

    const listHtml = rows.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📂</div>No hay cotizaciones guardadas</div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${rows.map(r => {
            const fecha = r.created_at ? r.created_at.substring(0,10) : '—';
            return `<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
              <div style="flex:1">
                <div style="font-weight:700;font-size:13px">${r.nombre}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${fecha} &nbsp;·&nbsp; 💰 ${fmtMoney(r.precio_unitario)}/pieza</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="eliminarCotizacion(${r.id})">🗑️</button>
            </div>`;
          }).join('')}
        </div>`;

    openModal('📂 Cotizaciones guardadas', `
      <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted)">${rows.length} cotización(es) guardada(s)</div>
      ${listHtml}
      <div style="margin-top:16px;display:flex;justify-content:space-between">
        <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="closeModal();openCalculator()">＋ Nueva cotización</button>
      </div>
    `);
  };

  window.eliminarCotizacion = async function(id) {
    confirmModal('¿Eliminar esta cotización?', async () => {
      try {
        await api('DELETE', `/api/cotizaciones/${id}`);
        showToast('Cotización eliminada');
        verCotizaciones();
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }, '🗑️');
  };

  // Expose verCotizaciones globally so dashboard can also call it
  window.verCotizaciones = window.verCotizaciones;

  // ── Expose a tiny helper used by calculator-button in jobOpenFormWithPrice ────
  window.calcUseInJob = function() {
    calcAceptar();
    setTimeout(() => {
      if (window._calcResult) {
        window._jobToOpen = null;
        window.location.hash = 'jobs';
        navigate('jobs');
        setTimeout(() => {
          if (window.jobOpenFormWithPrice) jobOpenFormWithPrice(window._calcResult);
        }, 300);
      }
    }, 100);
  };
})();

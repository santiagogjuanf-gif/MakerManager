(function () {
  // ── State ────────────────────────────────────────────────────────────────────
  let filCount = 1;
  let hwCount  = 0;
  let _allFils = [];
  let _allPrinters = [];
  let _allEmbalaje = [];
  let _editingCotizacionId = null;   // null = new cotización, number = editing existing
  let _editingProductoId   = null;   // null = new product, number = editing existing
  let _calcMode = 'cotizacion';      // 'cotizacion' | 'producto'

  // Volume tier margins — read from appConfig at runtime
  function getTiers() {
    const mU  = parseFloat(appConfig.margen_unitario  || 2.2);
    const mMe = parseFloat(appConfig.margen_menudeo   || 1.9);
    const mMa = parseFloat(appConfig.margen_mayoreo   || 1.5);
    const pMe = parseInt(appConfig.minimo_menudeo     || 5);
    const pMa = parseInt(appConfig.minimo_mayoreo     || 10);
    return {
      unitario: { label: `Unitario (1–${pMe - 1} pzas)`,      margin: mU  },
      menudeo:  { label: `Menudeo (${pMe}–${pMa - 1} pzas)`,  margin: mMe },
      mayoreo:  { label: `Mayoreo (${pMa}+ pzas)`,            margin: mMa },
    };
  }

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

  function calcChannelPrice(costBase, costMO, margin, taxRate, channel) {
    if (channel === 'online') {
      // Full cost × margin
      const subtotal = costBase * margin;
      const tax      = subtotal * taxRate;
      return { costBase, subtotal, tax, total: subtotal + tax, margin,
               costMaterials: costBase - costMO, costMO };
    } else {
      // Local: materials × margin, then add MO flat (no markup on labor)
      const costMaterials = costBase - costMO;
      const subtotal      = costMaterials * margin + costMO;
      const tax           = subtotal * taxRate;
      return { costBase, subtotal, tax, total: subtotal + tax, margin,
               costMaterials, costMO };
    }
  }

  function recalc() {
    const v       = getValues();
    const tiers   = getTiers();
    const tierKey = document.getElementById('calc-tier')?.value || 'unitario';
    const tier    = tiers[tierKey] || tiers.unitario;
    const margin  = tier.margin;
    const taxRate = parseFloat(appConfig.tax_rate || 0);
    const taxPct  = Math.round(taxRate * 100);

    // Donut
    const donutEl = document.getElementById('calc-donut');
    if (donutEl) {
      donutEl.innerHTML = renderDonut([
        { value: v.costFil,   color: SEG_COLORS.filamento,    label: 'Filamento'    },
        { value: v.costElec,  color: SEG_COLORS.electricidad, label: 'Electricidad' },
        { value: v.costMach,  color: SEG_COLORS.maquinado,    label: 'Maquinado'    },
        { value: v.costMO,    color: SEG_COLORS.manoObra,     label: 'Mano de obra' },
        { value: v.costHW,    color: SEG_COLORS.hardware,     label: 'Hardware'     },
        { value: v.embalaje,  color: SEG_COLORS.embalaje,     label: 'Embalaje'     },
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

    // Price cards — online vs local
    const pOnline = calcChannelPrice(v.costBase, v.costMO, margin, taxRate, 'online');
    const pLocal  = calcChannelPrice(v.costBase, v.costMO, margin, taxRate, 'local');

    function fillCard(cardId, p, channel) {
      const card = document.getElementById(cardId);
      if (!card) return;
      const moLine = channel === 'local' && p.costMO > 0
        ? `<div class="cpc-row"><span>👷 MO (sin margen)</span><span>${fmtMoney(p.costMO)}</span></div>`
        : '';
      const matLabel = channel === 'local' ? 'Materiales + extras' : 'Costo base';
      // Local: big price = subtotal (sin IVA), with IVA shown below in small text
      // Online: big price = total (con IVA incluido)
      const bigPrice   = channel === 'local' ? p.subtotal : p.total;
      const ivaSuffix  = channel === 'local' && taxPct > 0
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">Con IVA ${taxPct}%: <strong style="color:var(--text)">${fmtMoney(p.total)}</strong></div>`
        : '';
      card.innerHTML = `
        <div class="cpc-header">${channel === 'online' ? '🌐 Online' : '📍 Local / Facebook'}</div>
        <div class="cpc-subheader">${channel === 'online' ? 'Etsy · Shopify · eBay' : 'Venta directa · Mercado local'}</div>
        <div class="cpc-rows">
          <div class="cpc-row muted"><span>${matLabel}</span><span>${fmtMoney(channel==='local'?p.costMaterials:p.costBase)}</span></div>
          <div class="cpc-row muted"><span>Margen ×${margin}</span><span>${fmtMoney(p.subtotal - (channel==='local'?p.costMO:0))}</span></div>
          ${moLine}
          ${channel === 'online' && taxPct > 0 ? `<div class="cpc-row muted"><span>IVA ${taxPct}%</span><span>${fmtMoney(p.tax)}</span></div>` : ''}
        </div>
        <div class="cpc-total-row">
          <span>${channel === 'local' ? 'Precio sin IVA' : 'Precio / pieza'}</span>
          <span class="cpc-price">${fmtMoney(bigPrice)}</span>
        </div>
        ${ivaSuffix}`;
    }

    fillCard('calc-card-online', pOnline, 'online');
    fillCard('calc-card-local',  pLocal,  'local');

    // Store result for "Aceptar" button
    window._calcResult = {
      precio_final:    pOnline.total,
      precio_local:    pLocal.total,
      costBase:        v.costBase,
      tier:            tierKey,
      margin,
    };
  }

  window.calcRecalc = recalc;

  window.calcEmbalajeSelect = function(sel) {
    const cost = parseFloat(sel.value || 0);
    const inp = document.getElementById('calc-embalaje');
    if (inp) { inp.value = cost > 0 ? cost.toFixed(2) : ''; }
    recalc();
  };

  // ── Filament rows ─────────────────────────────────────────────────────────────
  function filRowHtml(i) {
    const grouped = {};
    for (const f of _allFils) {
      const mat = f.material || 'Otro';
      if (!grouped[mat]) grouped[mat] = [];
      grouped[mat].push(f);
    }
    const sortedMats = Object.keys(grouped).sort();
    for (const mat of sortedMats) {
      grouped[mat].sort((a, b) => {
        const la = `${a.marca||''} ${a.color||''}`.toLowerCase();
        const lb = `${b.marca||''} ${b.color||''}`.toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
      });
    }
    const opts = sortedMats.map(mat => {
      const options = grouped[mat].map(f => {
        const cg = parseFloat(f.costo_por_gramo || 0);
        const acabado = f.acabado && f.acabado !== 'Estándar' ? ` ${f.acabado}` : '';
        const label = `${f.marca||'-'} ${f.material}${acabado} ${f.color}`.trim();
        return `<option value="${cg}" data-id="${f.id}" data-nombre="${label}">${label}</option>`;
      }).join('');
      return `<optgroup label="${mat}">${options}</optgroup>`;
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

  // ── Hardware rows (from consumables inventory — externos + internos) ─────────
  let _allInternos = [];   // externos
  let _allInternos2 = [];  // internos

  function hwRowHtml(i) {
    // Combine externos + internos, deduplicate by nombre
    const combined = [..._allInternos, ..._allInternos2];
    const seen = new Set();
    const items = combined.filter(c => { if (seen.has(c.nombre)) return false; seen.add(c.nombre); return true; });

    let optsHtml = '';
    if (items.length > 0) {
      optsHtml = items.map(c =>
        `<option value="${parseFloat(c.costo_unitario||0)}" data-unidad="${c.unidad||'pcs'}">${c.nombre} — ${fmtMoney(c.costo_unitario||0)}/${c.unidad||'pcs'}</option>`
      ).join('');
    }

    const hasInventory = items.length > 0;

    return `<div class="calc-hw-row" id="calc-hw-row-${i}" style="margin-bottom:10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px">
      <div style="display:grid;grid-template-columns:1fr 90px 28px;gap:6px;align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:4px">
          ${hasInventory ? `
          <select id="calc-hw-sel-${i}" class="form-control" style="font-size:12px" onchange="calcHwChange(${i})">
            <option value="">— Seleccionar del inventario —</option>
            ${optsHtml}
          </select>
          <div style="font-size:10px;color:var(--text-muted);text-align:center">— o escribe manualmente —</div>` : ''}
          <div style="display:flex;gap:4px">
            <input id="calc-hw-desc-${i}" class="form-control" type="text" placeholder="Descripción" style="flex:2;font-size:12px" oninput="calcHwManual(${i})">
            <input id="calc-hw-unit-${i}" class="form-control" type="number" step="0.01" min="0" placeholder="$/u" style="flex:1;font-size:12px" oninput="calcHwManual(${i})">
          </div>
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted)">Cantidad</label>
          <input id="calc-hw-qty-${i}" class="form-control" type="number" min="1" value="1" oninput="calcHwChange(${i})" style="font-size:12px">
        </div>
        <button type="button" onclick="calcRemHw(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;padding:0;margin-bottom:2px" title="Eliminar">✕</button>
      </div>
      <div id="calc-hw-info-${i}" style="font-size:11px;color:var(--text-muted);margin-top:5px;min-height:14px"></div>
      <input type="hidden" id="calc-hw-cost-${i}" value="0">
    </div>`;
  }

  window.calcHwChange = function(i) {
    const sel  = document.getElementById(`calc-hw-sel-${i}`);
    const qty  = parseFloat(document.getElementById(`calc-hw-qty-${i}`)?.value || 1);
    const cost = document.getElementById(`calc-hw-cost-${i}`);
    const info = document.getElementById(`calc-hw-info-${i}`);
    const descEl = document.getElementById(`calc-hw-desc-${i}`);
    const unitEl = document.getElementById(`calc-hw-unit-${i}`);
    if (!sel) { calcHwManual(i); return; }
    if (sel.value) {
      const unitCost = parseFloat(sel.value || 0);
      if (cost) cost.value = unitCost;
      const unidad = sel.options[sel.selectedIndex]?.dataset.unidad || 'pcs';
      const subtotal = unitCost * qty;
      if (descEl) descEl.value = sel.options[sel.selectedIndex]?.text.split(' — ')[0] || '';
      if (unitEl) unitEl.value = unitCost;
      if (info) info.innerHTML = `${fmtMoney(unitCost)}/${unidad} × ${qty} = <strong style="color:var(--text)">${fmtMoney(subtotal)}</strong>`;
    } else {
      calcHwManual(i);
    }
    recalc();
  };

  window.calcHwManual = function(i) {
    const qty    = parseFloat(document.getElementById(`calc-hw-qty-${i}`)?.value || 1);
    const unit   = parseFloat(document.getElementById(`calc-hw-unit-${i}`)?.value || 0);
    const cost   = document.getElementById(`calc-hw-cost-${i}`);
    const info   = document.getElementById(`calc-hw-info-${i}`);
    if (cost) cost.value = unit;
    if (info && unit > 0) info.innerHTML = `${fmtMoney(unit)}/u × ${qty} = <strong style="color:var(--text)">${fmtMoney(unit*qty)}</strong>`;
    else if (info) info.textContent = '';
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
    [_allFils, _allPrinters, _allInternos, _allInternos2, _allEmbalaje] = await Promise.all([
      api('GET', '/api/filaments').catch(() => []),
      api('GET', '/api/printers').catch(() => []),
      api('GET', '/api/consumibles/externos').catch(() => []),
      api('GET', '/api/consumibles/internos').catch(() => []),
      api('GET', '/api/embalaje').catch(() => []),
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
      const wLabel = document.getElementById('calc-watts-label');
      const rEl    = document.getElementById('calc-mach-rate');
      const rLabel = document.getElementById('calc-mach-rate-label');
      const watts  = sel.value ? (parseFloat(sel.value) || 0) : 0;
      if (wEl) wEl.value = watts;
      if (wLabel) wLabel.textContent = sel.value ? `${watts} W` : '— (selecciona impresora)';
      if (wLabel) wLabel.style.color = sel.value ? 'var(--text)' : 'var(--text-muted)';
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
      if (sel && sel.value) {
        const opt = sel.options[sel.selectedIndex];
        const filId = opt?.dataset?.id || '';
        const matched = filId ? _allFils.find(f => f.id == filId) : null;
        fils.push({
          nombre:    opt?.text || '',
          fil_id:    filId,
          gramos:    g,
          costo_g:   cg,
          color:     matched?.color     || '',
          material:  matched?.material  || '',
          color_hex: matched?.color_hex || '',
          acabado:   matched?.acabado   || '',
          marca:     matched?.marca     || '',
        });
      }
    }
    const hws = [];
    for (let i = 0; i < hwCount; i++) {
      const row = document.getElementById(`calc-hw-row-${i}`);
      if (!row) continue;
      const desc = document.getElementById(`calc-hw-desc-${i}`)?.value || '';
      const cost = document.getElementById(`calc-hw-cost-${i}`)?.value || 0;
      const qty  = document.getElementById(`calc-hw-qty-${i}`)?.value || 1;
      if (desc || parseFloat(cost) > 0) hws.push({ desc, cost, qty });
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
      tier:       document.getElementById('calc-tier')?.value || 'unitario',
      mach_rate:  document.getElementById('calc-mach-rate')?.value || 0,
      filamentos: fils,
      hardware:   hws,
    };
  }

  // ── Open modal ────────────────────────────────────────────────────────────────
  window.openCalculator = async function(prefill, editingId, mode) {
    filCount = 1;
    hwCount  = 0;
    _calcMode = mode || 'cotizacion';
    _editingCotizacionId = (_calcMode === 'cotizacion') ? (editingId || null) : null;
    _editingProductoId   = (_calcMode === 'producto')   ? (editingId || null) : null;

    await loadData();

    const taxPct = Math.round(parseFloat(appConfig.tax_rate || 0) * 100);

    openModal('🧮 Calculadora de Costos', `
      <div class="calc-wrap">

        <!-- ── LEFT ── -->
        <div class="calc-left">

          <!-- Proyecto -->
          <div class="calc-section">
            <div class="calc-section-title" id="calc-section-proyecto">📋 Proyecto</div>
            <div class="form-group" style="margin:0">
              <label>Nombre del proyecto</label>
              <input id="calc-nombre" class="form-control" placeholder="Ej: Llavero logo cliente" value="${prefill?.nombre || ''}" autocomplete="off">
            </div>
          </div>

          <!-- Impresión -->
          <div class="calc-section">
            <div class="calc-section-title" id="calc-section-impresion">🖨️ Impresión</div>
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
                <div id="calc-watts-label" style="padding:7px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--text-muted)">— (selecciona impresora)</div>
                <input type="hidden" id="calc-watts" value="0">
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
            <div class="calc-section-title" id="calc-section-filamento" style="display:flex;align-items:center;justify-content:space-between">
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
            <div class="calc-section-title" id="calc-section-mo" style="display:flex;align-items:center;gap:6px">
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
                <input id="calc-mo-m" class="form-control" type="number" min="0" max="59" value="" oninput="calcRecalc()" style="width:70px" placeholder="0">
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
            <div class="form-group" style="margin:0 0 8px">
              <label>Seleccionar del catálogo</label>
              <select id="calc-embalaje-sel" class="form-control" onchange="calcEmbalajeSelect(this)">
                <option value="">— Seleccionar embalaje —</option>
                ${_allEmbalaje.sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'')).map(e => {
                  const dims = [e.largo_cm,e.ancho_cm,e.alto_cm].filter(Boolean).map(d=>d+'cm').join('×');
                  return `<option value="${e.costo}" data-nombre="${e.nombre}">${e.nombre}${dims?' ('+dims+')':''} — ${fmtMoney(e.costo)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label>Costo por pieza (editable)</label>
              <input id="calc-embalaje" class="form-control" type="number" step="0.01" min="0" value="" oninput="calcRecalc()" placeholder="0.00">
            </div>
          </div>

          <!-- Volumen / Margen -->
          <div class="calc-section">
            <div class="calc-section-title">📈 Volumen de venta</div>
            <div class="form-group" style="margin:0">
              <label>Cantidad estimada</label>
              <select id="calc-tier" class="form-control" onchange="calcRecalc()">
                ${(function(){
                  const t = getTiers();
                  return Object.entries(t).map(([k,v]) =>
                    `<option value="${k}">${v.label} — ×${v.margin}</option>`
                  ).join('');
                })()}
              </select>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px">IVA ${taxPct}% incluido en precios sugeridos</div>
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
            <div style="display:flex;flex-direction:column;gap:10px">
              <div id="calc-card-online" class="calc-price-card calc-card-online">—</div>
              <div id="calc-card-local"  class="calc-price-card calc-card-local">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── BUTTONS ── -->
      <div id="calc-save-errors" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:8px 12px;font-size:12px;color:#ef4444;margin-bottom:8px"></div>
      <div class="calc-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">✗ Cancelar</button>
        <button type="button" class="btn btn-secondary" onclick="verCotizaciones()" style="margin-right:auto">📂 Ver guardadas</button>
        <button type="button" class="btn btn-secondary" onclick="calcAceptar()">✓ Aceptar</button>
        ${_calcMode === 'producto'
          ? `<button type="button" id="calc-save-btn" class="btn btn-primary" onclick="calcGuardarProducto()">🏷️ ${_editingProductoId ? 'Actualizar producto' : 'Guardar en catálogo'}</button>`
          : _calcMode === 'venta'
          ? `<button type="button" class="btn btn-primary" onclick="calcCrearTrabajoDirecto()">🛒 Crear Trabajo</button>`
          : `<button type="button" id="calc-save-btn" class="btn btn-secondary" onclick="calcGuardarProducto(true)">🏷️ Guardar como producto</button>
             <button type="button" class="btn btn-primary" onclick="calcGuardar()">💾 ${_editingCotizacionId ? 'Actualizar cotización' : 'Guardar cotización'}</button>`
        }
      </div>
    `);

    // Make this modal wider than the default
    document.getElementById('modal-box')?.classList.add('modal-wide');
    populatePrinters();
    buildFilRows();

    // Pre-fill form if datos provided
    if (prefill && prefill._datos) {
      const d = prefill._datos;
      // Basic fields
      const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
      setVal('calc-nombre',   d.nombre   || prefill.nombre || '');
      setVal('calc-time-h',   d.tiempo_h || '');
      setVal('calc-time-m',   d.tiempo_m || '');
      setVal('calc-mo-h',     d.mo_h     || '');
      setVal('calc-mo-m',     d.mo_m     || '');
      setVal('calc-embalaje', d.embalaje || '');
      // Tier dropdown
      const tierSel = document.getElementById('calc-tier');
      if (tierSel && d.tier) tierSel.value = d.tier;
      // Printer — match by text
      if (d.printer) {
        const psel = document.getElementById('calc-printer-sel');
        if (psel) {
          for (let i = 0; i < psel.options.length; i++) {
            if (psel.options[i].text.trim().startsWith(d.printer.trim().split('(')[0].trim())) {
              psel.selectedIndex = i;
              psel.dispatchEvent(new Event('change'));
              break;
            }
          }
        }
      }
      // Filaments — rebuild rows from saved data
      const filData = d.filamentos || [];
      if (filData.length > 0) {
        filCount = 1;
        buildFilRows(); // already built row 0
        // Add extra rows
        for (let i = 1; i < filData.length; i++) window.calcAddFil && calcAddFil();
        filData.forEach((f, i) => {
          const sel = document.getElementById(`calc-fil-sel-${i}`);
          const gEl = document.getElementById(`calc-fil-g-${i}`);
          if (sel) {
            let matched = -1;
            if (f.fil_id) {
              for (let j = 0; j < sel.options.length; j++) {
                if (sel.options[j].dataset.id == f.fil_id) { matched = j; break; }
              }
            }
            if (matched === -1 && f.nombre) {
              for (let j = 0; j < sel.options.length; j++) {
                if (sel.options[j].text.trim() === f.nombre.trim()) { matched = j; break; }
              }
            }
            if (matched !== -1) { sel.selectedIndex = matched; calcFilChange(i); }
          }
          if (gEl && f.gramos) { gEl.value = f.gramos; calcFilChange(i); }
        });
      }
      // Hardware rows
      const hwData = d.hardware || [];
      hwData.forEach(h => {
        if (!h.desc) return;
        window.calcAddHw && calcAddHw();
        const idx = hwCount - 1;
        // Try to match inventory item by desc
        const hwSel = document.getElementById(`calc-hw-sel-${idx}`);
        if (hwSel) {
          for (let j = 0; j < hwSel.options.length; j++) {
            if (hwSel.options[j].text.startsWith(h.desc)) {
              hwSel.selectedIndex = j;
              calcHwChange(idx);
              break;
            }
          }
        }
        const qEl = document.getElementById(`calc-hw-qty-${idx}`);
        if (qEl && h.qty) { qEl.value = h.qty; calcHwChange(idx); }
      });
    } else if (prefill) {
      const el = document.getElementById('calc-nombre');
      if (el && prefill.nombre) el.value = prefill.nombre;
    }

    recalc();
  };

  // ── Actions ───────────────────────────────────────────────────────────────────
  window.calcAceptar = function() {
    const r = window._calcResult || {};
    closeModal();
    showToast(`Precio online: ${fmtMoney(r.precio_final)} · Local: ${fmtMoney(r.precio_local)}`);
  };

  function calcValidate() {
    const errors = [];
    const mark = (id, msg) => {
      const el = document.getElementById(id);
      if (el) { el.style.color = 'var(--danger,#ef4444)'; }
      errors.push(msg);
    };
    const unmark = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.color = '';
    };

    // Reset
    ['calc-section-proyecto','calc-section-impresion','calc-section-filamento','calc-section-mo'].forEach(unmark);

    const nombre = document.getElementById('calc-nombre')?.value?.trim();
    if (!nombre) mark('calc-section-proyecto', 'Falta el nombre del proyecto');

    const printer = document.getElementById('calc-printer-sel')?.value;
    const timeH = parseFloat(document.getElementById('calc-time-h')?.value || 0)
                + parseFloat(document.getElementById('calc-time-m')?.value || 0) / 60;
    if (!printer || timeH <= 0) mark('calc-section-impresion', 'Selecciona impresora y agrega tiempo de impresión');

    let hasFilament = false;
    for (let i = 0; i < filCount; i++) {
      const sel = document.getElementById(`calc-fil-sel-${i}`);
      const g   = parseFloat(document.getElementById(`calc-fil-g-${i}`)?.value || 0);
      if (sel?.value && g > 0) { hasFilament = true; break; }
    }
    if (!hasFilament) mark('calc-section-filamento', 'Selecciona al menos un filamento y sus gramos');

    const moH = parseFloat(document.getElementById('calc-mo-h')?.value || 0)
              + parseFloat(document.getElementById('calc-mo-m')?.value || 0) / 60;
    if (moH <= 0) mark('calc-section-mo', 'Agrega el tiempo de mano de obra');

    return errors;
  }

  window.calcGuardarProducto = async function(andAlsoCotizacion) {
    const errors = calcValidate();
    const errEl = document.getElementById('calc-save-errors');
    if (errors.length > 0) {
      if (errEl) { errEl.innerHTML = errors.map(e => `<div>⚠️ ${e}</div>`).join(''); errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    const datos = collectFormData();
    const r = window._calcResult || {};
    try {
      if (_editingProductoId) {
        await api('PUT', `/api/productos/${_editingProductoId}`, { nombre: datos.nombre, datos, precio_online: r.precio_final || 0, precio_local: r.precio_local || 0 });
        showToast(`Producto "${datos.nombre}" actualizado`);
      } else {
        await api('POST', '/api/productos', { nombre: datos.nombre, datos, precio_online: r.precio_final || 0, precio_local: r.precio_local || 0 });
        showToast(`"${datos.nombre}" guardado en catálogo`);
      }
      if (window.refreshCatalog) refreshCatalog();
      if (!andAlsoCotizacion) { closeModal(); return; }
    } catch (e) { showToast('Error: ' + e.message, 'error'); return; }
    // Also save as cotización if called from cotización mode
    if (andAlsoCotizacion) await window.calcGuardar();
  };

  window.calcGuardar = async function() {
    const errors = calcValidate();
    const errEl = document.getElementById('calc-save-errors');
    if (errors.length > 0) {
      if (errEl) {
        errEl.innerHTML = errors.map(e => `<div>⚠️ ${e}</div>`).join('');
        errEl.style.display = 'block';
      }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    const datos = collectFormData();
    const r = window._calcResult || {};
    try {
      if (_editingCotizacionId) {
        await api('PUT', `/api/cotizaciones/${_editingCotizacionId}`, { nombre: datos.nombre, datos, precio_unitario: r.precio_final || 0 });
        showToast(`Cotización "${datos.nombre}" actualizada`);
      } else {
        await api('POST', '/api/cotizaciones', { nombre: datos.nombre, datos, precio_unitario: r.precio_final || 0 });
        showToast(`Cotización "${datos.nombre}" guardada`);
      }
      _editingCotizacionId = null;
      closeModal();
    } catch (e) {
      showToast('Error al guardar: ' + e.message, 'error');
    }
  };

  // ── Crear trabajo directo desde modo venta (sin guardar cotización) ──────────
  window.calcCrearTrabajoDirecto = async function() {
    const datos = collectFormData();
    const r = window._calcResult || {};
    let cotizacionId;
    try {
      const saved = await api('POST', '/api/cotizaciones', { nombre: datos.nombre, datos, precio_unitario: r.precio_final || 0 });
      cotizacionId = saved.id;
    } catch(e) { showToast('Error: '+e.message,'error'); return; }
    closeModal();
    await aceptarCotizacion(cotizacionId);
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
            return `<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:pointer;transition:border-color 0.15s"
              onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"
              onclick="verCotizacionDetalle(${r.id})">
              <div style="flex:1">
                <div style="font-weight:700;font-size:13px">${r.nombre}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${fecha} &nbsp;·&nbsp; 💰 ${fmtMoney(r.precio_unitario)}/pieza online</div>
              </div>
              <span style="font-size:11px;color:var(--accent)">Ver →</span>
              <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();eliminarCotizacion(${r.id})">🗑️</button>
            </div>`;
          }).join('')}
        </div>`;

    openModal('📂 Cotizaciones guardadas', `
      <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted)">${rows.length} cotización(es) · Haz clic para ver el detalle</div>
      ${listHtml}
      <div style="margin-top:16px;display:flex;justify-content:space-between">
        <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="closeModal();openCalculator()">＋ Nueva cotización</button>
      </div>
    `);
  };

  window.verCotizacionDetalle = async function(id) {
    let row;
    try { row = await api('GET', `/api/cotizaciones/${id}`); } catch { showToast('Error cargando cotización','error'); return; }
    if (_allFils.length === 0) await loadData();
    const d = row.datos || {};
    const taxRate = parseFloat(appConfig.tax_rate || 0);
    const taxPct  = Math.round(taxRate * 100);
    const tiers   = getTiers();
    const tier    = tiers[d.tier || 'unitario'] || tiers.unitario;
    const margin  = tier.margin;

    // Reconstruct cost from datos
    const timeH   = parseFloat(d.tiempo_h || 0) + parseFloat(d.tiempo_m || 0) / 60;
    const moH     = parseFloat(d.mo_h || 0)     + parseFloat(d.mo_m || 0) / 60;
    const costMO  = moH * parseFloat(appConfig.tarifa_hora || 25);
    let costFil   = 0;
    (d.filamentos || []).forEach(f => { costFil += parseFloat(f.gramos || 0) * parseFloat(f.costo_g || 0); });
    let costHW = 0;
    (d.hardware || []).forEach(h => { costHW += parseFloat(h.cost || 0) * parseFloat(h.qty || 1); });
    const kwh       = parseFloat(appConfig.costo_kwh || 0.18);
    const costElec  = (parseFloat(d.watts || 0) / 1000) * timeH * kwh;
    const costMach  = timeH * parseFloat(d.mach_rate || 0);
    const embalaje  = parseFloat(d.embalaje || 0);
    const costBase  = costFil + costElec + costMach + costMO + costHW + embalaje;

    const onlinePrice = costBase * margin * (1 + taxRate);
    const localSubtotal = (costBase - costMO) * margin + costMO;
    const localPrice  = localSubtotal * (1 + taxRate);

    // Filament visuals
    const hStr = n => n >= 1 ? `${Math.floor(n)}h ${Math.round((n%1)*60)}min` : `${Math.round(n*60)}min`;
    const fecha = row.created_at ? row.created_at.substring(0,10) : '—';

    // Filament cards — styled boxes with spool visual
    const filCardsHtml = (d.filamentos || []).filter(f => f.nombre && parseFloat(f.gramos) > 0).map(f => {
      const matched = (f.fil_id ? _allFils.find(af => af.id == f.fil_id) : null)
        || _allFils.find(af => {
          const acabado = af.acabado && af.acabado !== 'Estándar' ? ` ${af.acabado}` : '';
          return `${af.marca||''} ${af.material}${acabado} ${af.color}`.trim() === f.nombre.trim();
        });
      const spoolHtml = matched && typeof makeSpool === 'function'
        ? makeSpool(matched, 80)
        : `<div style="width:80px;height:80px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:800">${(f.nombre||'').substring(0,4)}</div>`;
      const subtotal = parseFloat(f.gramos || 0) * parseFloat(f.costo_g || 0);
      const cpgNum = parseFloat(f.costo_g || 0);
      const cpgStr = cpgNum < 0.01 ? `$${cpgNum.toFixed(5)}` : `$${cpgNum.toFixed(4)}`;
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 10px;text-align:center;min-width:110px;box-shadow:0 2px 8px rgba(0,0,0,0.18)">
        ${spoolHtml}
        <div style="font-size:10px;font-weight:700;margin-top:8px;color:var(--text);line-height:1.4">${f.nombre}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${cpgStr}/g</div>
        <div style="background:var(--surface);border-radius:6px;padding:4px 0;margin-top:6px">
          <div style="font-size:11px;color:var(--text-muted)">${f.gramos} g</div>
          <div style="font-size:14px;font-weight:800;color:var(--accent)">${fmtMoney(subtotal)}</div>
        </div>
      </div>`;
    }).join('');

    // Info cards (impresión, MO, extras) — reusable row helper
    const infoRow = (label, val) =>
      `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--text-muted)">${label}</span><span style="font-weight:600">${val}</span>
      </div>`;

    const hwRows = (d.hardware || []).filter(h => h.desc).map(h =>
      infoRow(`🔩 ${h.desc} ×${h.qty}`, fmtMoney(parseFloat(h.cost||0)*parseFloat(h.qty||1)))
    ).join('');

    // Price card helper — full breakdown like the calculator
    const priceCardDetail = (title, subtitle, accentColor, rows, bigPrice, bigLabel, suffix) =>
      `<div style="background:var(--card);border:1px solid ${accentColor};border-radius:12px;padding:14px;box-shadow:0 2px 10px rgba(0,0,0,0.18)">
        <div style="font-size:13px;font-weight:800;color:${accentColor}">${title}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:10px">${subtitle}</div>
        <div style="border-top:1px solid var(--border);padding-top:8px;margin-bottom:8px;display:flex;flex-direction:column;gap:3px">
          ${rows}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:8px">
          <span style="font-size:11px;color:var(--text-muted);font-weight:600">${bigLabel}</span>
          <span style="font-size:22px;font-weight:800;color:${accentColor}">${fmtMoney(bigPrice)}</span>
        </div>
        ${suffix || ''}
      </div>`;

    const pRow = (label, val) =>
      `<div style="display:flex;justify-content:space-between;font-size:11px">
        <span style="color:var(--text-muted)">${label}</span>
        <span style="font-weight:600">${val}</span>
      </div>`;

    // Margin rows show the subtotal (cost × margin), matching the live calculator display
    const onlineTax  = onlinePrice - costBase * margin;
    const onlineCard = priceCardDetail(
      '🌐 Online', 'Etsy · Shopify · eBay', 'var(--accent-light)',
      pRow('Costo base', fmtMoney(costBase))
      + pRow(`Margen ×${margin}`, fmtMoney(costBase * margin))
      + (taxPct > 0 ? pRow(`IVA ${taxPct}%`, fmtMoney(onlineTax)) : ''),
      onlinePrice, 'Precio / pieza', ''
    );

    const localMat   = costBase - costMO;
    const localMOLine = costMO > 0 ? pRow('👷 MO (sin margen)', fmtMoney(costMO)) : '';
    const localCard  = priceCardDetail(
      '📍 Local / Facebook', 'Venta directa · Mercado local', '#22c55e',
      pRow('Materiales + extras', fmtMoney(localMat))
      + pRow(`Margen ×${margin}`, fmtMoney(localMat * margin))
      + localMOLine
      + (taxPct > 0 ? pRow(`IVA ${taxPct}%`, fmtMoney(localSubtotal * taxRate)) : ''),
      localSubtotal, 'Precio sin IVA',
      taxPct > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Con IVA ${taxPct}%: <strong style="color:var(--text)">${fmtMoney(localPrice)}</strong></div>` : ''
    );

    closeModal();
    openModal(`📋 ${row.nombre}`, `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">
        📅 ${fecha} &nbsp;·&nbsp; ${tier.label} — margen ×${margin}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- LEFT: costs -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.05em">🖨️ IMPRESIÓN</div>
            ${infoRow('Impresora', d.printer || '—')}
            ${infoRow('Tiempo', hStr(timeH))}
            ${infoRow(`Consumo (${d.watts||0} W)`, fmtMoney(costElec))}
            ${infoRow('Depreciación', fmtMoney(costMach))}
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.05em">👷 MANO DE OBRA</div>
            ${infoRow('Tiempo', hStr(moH))}
            ${infoRow('Costo', fmtMoney(costMO))}
          </div>
          ${embalaje > 0 ? `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.05em">📦 EMBALAJE</div>
            ${infoRow('Costo por pieza', fmtMoney(embalaje))}
          </div>` : ''}
          ${hwRows ? `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.05em">🔩 HARDWARE</div>
            ${hwRows}
          </div>` : ''}
        </div>

        <!-- RIGHT: filaments + prices -->
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:12px;letter-spacing:.05em">🧵 FILAMENTOS</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px">${filCardsHtml || '<span style="font-size:12px;color:var(--text-muted)">—</span>'}</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:12px;letter-spacing:.05em">💰 PRECIOS SUGERIDOS</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${onlineCard}
              ${localCard}
            </div>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-danger btn-sm" onclick="eliminarCotizacion(${id})">🗑️ Eliminar</button>
        <button class="btn btn-secondary" onclick="verCotizaciones()">← Volver</button>
        <button class="btn btn-secondary" onclick="printCotizacion(${id})">🖨️ Imprimir</button>
        <button class="btn btn-secondary" onclick="editarCotizacion(${id})">✏️ Editar</button>
        <button class="btn btn-primary" onclick="aceptarCotizacion(${id})">✅ Aceptar cotización</button>
      </div>
    `);
    document.getElementById('modal-box')?.classList.add('modal-wide');
  };

  window.editarCotizacion = async function(id) {
    let row;
    try { row = await api('GET', `/api/cotizaciones/${id}`); } catch { showToast('Error cargando cotización','error'); return; }
    closeModal();
    await openCalculator({ nombre: row.nombre, _datos: row.datos }, id);
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

  // ── Aceptar cotización → crear trabajo ───────────────────────────────────────
  window.aceptarCotizacion = async function(id) {
    let row;
    try { row = await api('GET', `/api/cotizaciones/${id}`); } catch { showToast('Error','error'); return; }
    const d = row.datos || {};

    // Check filament availability
    let filWarnings = [];
    if (_allFils.length === 0) await loadData();
    (d.filamentos||[]).filter(f => f.fil_id || f.nombre).forEach(f => {
      const found = f.fil_id
        ? _allFils.find(af => af.id == f.fil_id)
        : _allFils.find(af => `${af.marca||''} ${af.material}`.trim().toLowerCase() === (f.nombre||'').toLowerCase().split(' ').slice(0,2).join(' '));
      if (!found) {
        filWarnings.push(`"${f.nombre}" — no encontrado en inventario`);
      } else if (found.estado === 'Agotado' || parseFloat(found.peso_actual_g||0) < parseFloat(f.gramos||0)) {
        filWarnings.push(`"${f.nombre}" — ${found.estado === 'Agotado' ? 'agotado' : `solo ${Math.round(found.peso_actual_g)}g disponibles, necesitas ${f.gramos}g`}`);
      }
    });

    // Load clients for picker
    let allClients = [];
    try { allClients = await api('GET', '/api/clients'); } catch {}

    const warnHtml = filWarnings.length > 0 ? `
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.4);border-radius:10px;padding:10px 12px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:6px">⚠️ Advertencia de inventario</div>
        ${filWarnings.map(w => `<div style="font-size:12px;color:var(--text-muted)">${w}</div>`).join('')}
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Puedes continuar, pero verifica tu inventario antes de producir.</div>
      </div>` : '';

    const clientOpts = allClients.map(c =>
      `<option value="${c.id}">${c.nombre}${c.telefono?' · '+c.telefono:''}</option>`
    ).join('');

    openModal('✅ Aceptar cotización', `
      ${warnHtml}
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
        Cotización: <strong>${row.nombre}</strong> · ${fmtMoney(row.precio_unitario)}/pieza
      </div>

      <div style="background:var(--surface);border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px;letter-spacing:.05em">👤 CLIENTE</div>
        <div class="form-group" style="margin-bottom:10px">
          <label style="font-size:12px">Seleccionar cliente existente</label>
          <select id="acept-client-sel" class="form-control" onchange="acept_clientChange()">
            <option value="">— Seleccionar o crear nuevo —</option>
            ${clientOpts}
          </select>
        </div>
        <div id="acept-new-client" style="">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;text-align:center">— ó crear cliente nuevo —</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group" style="margin:0"><label style="font-size:11px">Nombre *</label><input id="acept-cl-nombre" class="form-control" placeholder="Nombre del cliente" autocomplete="off"></div>
            <div class="form-group" style="margin:0"><label style="font-size:11px">Teléfono</label><input id="acept-cl-tel" class="form-control" placeholder="+1 xxx xxxx" autocomplete="off"></div>
          </div>
        </div>
      </div>

      <div style="background:var(--surface);border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px;letter-spacing:.05em">📋 TRABAJO</div>
        <div class="form-group" style="margin-bottom:8px">
          <label style="font-size:12px">Nombre del trabajo</label>
          <input id="acept-job-nombre" class="form-control" value="${row.nombre}" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:12px">Notas adicionales</label>
          <textarea id="acept-job-notas" class="form-control" rows="2" placeholder="Instrucciones especiales, variantes, etc." autocomplete="off"></textarea>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="acept_confirmar(${id})">✅ Crear trabajo</button>
      </div>
    `);
  };

  window.acept_clientChange = function() {
    const sel = document.getElementById('acept-client-sel');
    const newClientDiv = document.getElementById('acept-new-client');
    if (newClientDiv) newClientDiv.style.display = sel?.value ? 'none' : '';
  };

  window.acept_confirmar = async function(cotizacionId) {
    const clientSel   = document.getElementById('acept-client-sel');
    const clNombre    = document.getElementById('acept-cl-nombre')?.value?.trim();
    const clTel       = document.getElementById('acept-cl-tel')?.value?.trim();
    const jobNombre   = document.getElementById('acept-job-nombre')?.value?.trim() || 'Sin nombre';
    const jobNotas    = document.getElementById('acept-job-notas')?.value?.trim() || '';

    let clienteId = clientSel?.value ? parseInt(clientSel.value) : null;

    // Create new client if no existing selected
    if (!clienteId && clNombre) {
      try {
        const r = await api('POST', '/api/clients', { nombre: clNombre, telefono: clTel });
        clienteId = r.id;
      } catch (e) { showToast('Error creando cliente: ' + e.message, 'error'); return; }
    }

    // Get cotización data
    let row;
    try { row = await api('GET', `/api/cotizaciones/${cotizacionId}`); } catch { showToast('Error','error'); return; }
    const d = row.datos || {};
    const r = window._calcResult || {};

    // Build levantamiento_datos from cotización so it pre-fills the Levantamiento form
    const levDatos = {
      printer_id:   null,
      printer:      d.printer || '',
      tiempo_h:     d.tiempo_h || 0,
      tiempo_m:     d.tiempo_m || 0,
      mo_h:         d.mo_h || 0,
      mo_m:         d.mo_m || 0,
      embalaje:     d.embalaje || 0,
      tier:         d.tier || 'unitario',
      filamentos:   (d.filamentos || []).map(f => ({
        fil_id:          f.fil_id || null,
        filamento_id:    f.fil_id || null,
        gramos:          parseFloat(f.gramos || 0),
        gramos_pieza:    parseFloat(f.gramos || 0),
        nombre:          f.nombre || '',
        color:           f.color || '',
        color_hex:       f.color_hex || '',
        material:        f.material || '',
        acabado:         f.acabado || '',
        marca:           f.marca || '',
        nombre_comercial:f.nombre_comercial || '',
      })),
    };

    const jobBody = {
      nombre_proyecto:       jobNombre,
      cliente_id:            clienteId,
      descripcion:           jobNotas,
      estado:                'Solicitud',
      tiempo_impresion_min:  (parseFloat(d.tiempo_h||0)*60 + parseFloat(d.tiempo_m||0)),
      tiempo_diseno_min:     (parseFloat(d.mo_h||0)*60 + parseFloat(d.mo_m||0)),
      precio_unitario:        row.precio_unitario || 0,
      precio_final:           row.precio_unitario || 0,
      tipo_precio:            d.tier || 'unitario',
      notas:                  jobNotas,
      cotizacion_id:          cotizacionId,
      levantamiento_datos:    levDatos,
    };

    try {
      const created = await api('POST', '/api/jobs', jobBody);
      showToast(`Trabajo "${jobNombre}" creado en Solicitud`);
      closeModal();
      // Navigate to kanban/jobs
      window._jobToOpen = created.id;
      window.location.hash = 'jobs';
      navigate('jobs');
    } catch (e) { showToast('Error creando trabajo: ' + e.message, 'error'); }
  };

  // ── Print / PDF cotización ────────────────────────────────────────────────────
  window.printCotizacion = async function(id) {
    let row;
    try { row = await api('GET', `/api/cotizaciones/${id}`); } catch { showToast('Error cargando cotización','error'); return; }
    const d = row.datos || {};
    const taxRate  = parseFloat(appConfig.tax_rate || 0);
    const taxPct   = Math.round(taxRate * 100);
    const tiers    = getTiers();
    const tier     = tiers[d.tier || 'unitario'] || tiers.unitario;
    const margin   = tier.margin;
    const sym      = appConfig.simbolo_moneda || '$';
    const fmt      = v => `${sym}${parseFloat(v||0).toFixed(2)}`;

    const timeH   = parseFloat(d.tiempo_h||0) + parseFloat(d.tiempo_m||0)/60;
    const moH     = parseFloat(d.mo_h||0)     + parseFloat(d.mo_m||0)/60;
    const costMO  = moH * parseFloat(appConfig.tarifa_hora || 25);
    let costFil = 0;
    (d.filamentos||[]).forEach(f => { costFil += parseFloat(f.gramos||0)*parseFloat(f.costo_g||0); });
    let costHW = 0;
    (d.hardware||[]).forEach(h => { costHW += parseFloat(h.cost||0)*parseFloat(h.qty||1); });
    const costElec  = (parseFloat(d.watts||0)/1000)*timeH*parseFloat(appConfig.costo_kwh||0.18);
    const costMach  = timeH * parseFloat(d.mach_rate||0);
    const embalaje  = parseFloat(d.embalaje||0);
    const costBase  = costFil + costElec + costMach + costMO + costHW + embalaje;
    const onlinePrice    = costBase * margin * (1+taxRate);
    const localSubtotal  = (costBase - costMO)*margin + costMO;
    const localPrice     = localSubtotal * (1+taxRate);

    const hStr = n => n >= 1 ? `${Math.floor(n)}h ${Math.round((n%1)*60)}min` : `${Math.round(n*60)}min`;
    const now  = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
    const bizName = appConfig.nombre_negocio || 'MakerManager Studio';
    const bizTel  = appConfig.telefono || '';
    const bizAddr = appConfig.direccion || '';
    const terminos = appConfig.terminos_condiciones || '';

    const filRows = (d.filamentos||[]).filter(f => f.nombre && parseFloat(f.gramos)>0).map(f =>
      `<tr><td>${f.nombre}</td><td style="text-align:center">${f.gramos}g</td><td style="text-align:right">${fmt(parseFloat(f.gramos)*parseFloat(f.costo_g||0))}</td></tr>`
    ).join('');

    const hwRows = (d.hardware||[]).filter(h=>h.desc).map(h =>
      `<tr><td>${h.desc} ×${h.qty||1}</td><td></td><td style="text-align:right">${fmt(parseFloat(h.cost||0)*parseFloat(h.qty||1))}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Cotización — ${row.nombre}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;font-size:13px;color:#111;background:#fff;padding:32px 40px}
  h1{font-size:22px;font-weight:800;color:#6d28d9}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #6d28d9}
  .biz-name{font-size:18px;font-weight:800;color:#6d28d9}
  .biz-info{font-size:11px;color:#555;margin-top:4px;line-height:1.6}
  .meta{text-align:right;font-size:12px;color:#555}
  .meta-id{font-size:20px;font-weight:800;color:#111;margin-bottom:4px}
  h2{font-size:12px;font-weight:700;color:#6d28d9;letter-spacing:.08em;text-transform:uppercase;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f3f0ff;color:#6d28d9;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:6px 10px;text-align:left}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  tr:last-child td{border-bottom:none}
  .total-row td{font-weight:700;background:#f9fafb}
  .price-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
  .price-card{border:2px solid #e5e7eb;border-radius:10px;padding:14px}
  .price-card.online{border-color:#6d28d9}
  .price-card.local{border-color:#16a34a}
  .price-card-title{font-size:12px;font-weight:700;margin-bottom:8px}
  .price-card.online .price-card-title{color:#6d28d9}
  .price-card.local .price-card-title{color:#16a34a}
  .price-row{display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:4px}
  .price-total{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:6px}
  .price-total span:last-child{font-size:20px;font-weight:800}
  .price-card.online .price-total span:last-child{color:#6d28d9}
  .price-card.local .price-total span:last-child{color:#16a34a}
  .terms{font-size:10px;color:#777;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;line-height:1.6}
  .footer{margin-top:28px;display:flex;justify-content:space-between;font-size:11px;color:#aaa}
  @media print{body{padding:16px 20px}.no-print{display:none}}
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 20px;background:#6d28d9;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Imprimir / Guardar PDF</button>
<div class="header">
  <div>
    <div class="biz-name">${bizName}</div>
    <div class="biz-info">${[bizTel, bizAddr].filter(Boolean).join(' · ')}</div>
  </div>
  <div class="meta">
    <div class="meta-id">COTIZACIÓN #${id}</div>
    <div>${dateStr}</div>
    <div style="margin-top:4px;font-weight:700">${row.nombre}</div>
    <div style="font-size:11px;color:#777;margin-top:2px">${tier.label} — margen ×${margin}</div>
  </div>
</div>

<h2>Desglose de costos</h2>
<table>
  <thead><tr><th>Concepto</th><th style="text-align:center">Detalle</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>
    ${filRows || '<tr><td colspan="3" style="color:#999">Sin filamentos</td></tr>'}
    ${costElec > 0 ? `<tr><td>⚡ Electricidad</td><td style="text-align:center">${d.watts||0}W · ${hStr(timeH)}</td><td style="text-align:right">${fmt(costElec)}</td></tr>` : ''}
    ${costMach > 0 ? `<tr><td>🖨️ Depreciación impresora</td><td style="text-align:center">${d.printer||'—'} · ${hStr(timeH)}</td><td style="text-align:right">${fmt(costMach)}</td></tr>` : ''}
    ${costMO > 0 ? `<tr><td>👷 Mano de obra</td><td style="text-align:center">${hStr(moH)}</td><td style="text-align:right">${fmt(costMO)}</td></tr>` : ''}
    ${hwRows}
    ${embalaje > 0 ? `<tr><td>📦 Embalaje</td><td></td><td style="text-align:right">${fmt(embalaje)}</td></tr>` : ''}
    <tr class="total-row"><td colspan="2">Costo base total</td><td style="text-align:right">${fmt(costBase)}</td></tr>
  </tbody>
</table>

<h2>Precios sugeridos</h2>
<div class="price-grid">
  <div class="price-card online">
    <div class="price-card-title">🌐 Online (Etsy · Shopify)</div>
    <div class="price-row"><span>Costo base</span><span>${fmt(costBase)}</span></div>
    <div class="price-row"><span>Margen ×${margin}</span><span>${fmt(costBase*margin)}</span></div>
    ${taxPct > 0 ? `<div class="price-row"><span>IVA ${taxPct}%</span><span>${fmt(costBase*margin*taxRate)}</span></div>` : ''}
    <div class="price-total"><span>Precio / pieza</span><span>${fmt(onlinePrice)}</span></div>
  </div>
  <div class="price-card local">
    <div class="price-card-title">📍 Local / Facebook</div>
    <div class="price-row"><span>Materiales</span><span>${fmt(costBase-costMO)}</span></div>
    <div class="price-row"><span>Margen ×${margin}</span><span>${fmt((costBase-costMO)*margin)}</span></div>
    ${costMO > 0 ? `<div class="price-row"><span>MO (sin margen)</span><span>${fmt(costMO)}</span></div>` : ''}
    <div class="price-total"><span>Precio sin IVA</span><span>${fmt(localSubtotal)}</span></div>
    ${taxPct > 0 ? `<div style="font-size:11px;color:#555;margin-top:4px">Con IVA ${taxPct}%: <strong>${fmt(localPrice)}</strong></div>` : ''}
  </div>
</div>

${terminos ? `<div class="terms"><strong>Términos y condiciones:</strong> ${terminos}</div>` : ''}

<div class="footer">
  <span>${bizName}</span>
  <span>Generado el ${dateStr}</span>
</div>

<script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else showToast('Activa los popups del navegador para imprimir', 'error');
  };

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

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '❄️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return '¡Buenos días!';
  if (h >= 12 && h < 19) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

function animateCounter(el, target, isFloat = false) {
  const duration = 800;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    el.textContent = isFloat ? fmtMoney(current) : Math.round(current).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

async function loadWeather(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!navigator.geolocation) { el.innerHTML = ''; return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const data = await res.json();
      const w = data.current_weather;
      const icon = weatherIcon(w.weathercode);
      el.innerHTML = `<div class="weather-widget">
        <span style="font-size:32px">${icon}</span>
        <div>
          <div class="weather-temp">${Math.round(w.temperature)}°C</div>
          <div class="weather-desc">${w.windspeed} km/h viento</div>
        </div>
      </div>`;
    } catch { el.innerHTML = ''; }
  }, () => { el.innerHTML = ''; });
}

// Mini SVG bar chart for monthly revenue
function buildRevenueChart(data) {
  if (!data || data.length === 0) return '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px">Sin datos</div>';
  const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const maxVal = Math.max(...data.map(d => parseFloat(d.ingresos) || 0), 1);
  const W = 280, H = 90, PAD_L = 8, PAD_R = 8, PAD_TOP = 16, BAR_AREA = H - PAD_TOP - 18;
  const n = data.length;
  const slotW = (W - PAD_L - PAD_R) / n;
  const barW = Math.min(slotW * 0.65, 30);

  const bars = data.map((d, i) => {
    const val = parseFloat(d.ingresos) || 0;
    const barH = Math.max(2, (val / maxVal) * BAR_AREA);
    const x = PAD_L + i * slotW + (slotW - barW) / 2;
    const y = PAD_TOP + BAR_AREA - barH;
    const mes = d.mes ? monthNames[parseInt(d.mes.split('-')[1]) - 1] : '';
    const sym = (typeof appConfig !== 'undefined' && appConfig.simbolo_moneda) || '$';
    const valLabel = val >= 1000 ? `${sym}${(val/1000).toFixed(1)}k` : val > 0 ? `${sym}${Math.round(val)}` : '';
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="var(--accent)" opacity="0.85"/>
      ${valLabel ? `<text x="${(x+barW/2).toFixed(1)}" y="${(y-3).toFixed(1)}" text-anchor="middle" fill="var(--text-muted)" font-size="7.5" font-weight="600">${valLabel}</text>` : ''}
      <text x="${(x+barW/2).toFixed(1)}" y="${H-2}" text-anchor="middle" fill="var(--text-muted)" font-size="8.5">${mes}</text>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${bars}</svg>`;
}

pageLoaders['dashboard'] = async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  el.innerHTML = `
    <div class="dash-hero">
      <div class="dash-hero-left">
        <div class="dash-greeting">${getGreeting()}</div>
        <div class="dash-biz">${appConfig.nombre_negocio || 'MakerManager'}</div>
        <div class="dash-date">${dateStr}</div>
      </div>
      <div id="weather-container"></div>
    </div>
    <div id="dash-content"><p style="color:var(--text-muted);padding:20px">Cargando...</p></div>`;

  loadWeather('weather-container');

  try {
    const data = await api('GET', '/api/dashboard');
    const { lowFilaments = [], recentJobs = [], monthStats = {}, stats = {},
            jobsByStage = [], monthlyRevenue = [], topFilaments = [] } = data;

    // ── Stage pipeline ────────────────────────────────────────────────────────
    const STAGES = [
      { key: 'Solicitud',    icon: '📥', color: '#6366f1' },
      { key: 'Levantamiento',icon: '📐', color: '#f59e0b' },
      { key: 'Producción',   icon: '🖨️', color: '#3b82f6' },
      { key: 'Cierre',       icon: '✅', color: '#22c55e' },
    ];
    const stageMap = {};
    jobsByStage.forEach(s => stageMap[s.estado] = parseInt(s.cnt) || 0);
    const activeTotal = STAGES.slice(0,3).reduce((s, st) => s + (stageMap[st.key]||0), 0);

    const stageSection = `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:.06em">📊 ETAPAS DE PRODUCCIÓN</div>
          ${activeTotal > 0 ? `<span style="background:var(--accent);color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">${activeTotal} activos</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${STAGES.map(st => `
            <div onclick="window.location.hash='jobs';navigate('jobs')" style="background:var(--surface);border-radius:12px;padding:12px 8px;text-align:center;border:1px solid ${st.color}44;cursor:pointer;transition:border-color 0.15s"
              onmouseover="this.style.borderColor='${st.color}'" onmouseout="this.style.borderColor='${st.color}44'">
              <div style="font-size:11px;margin-bottom:4px">${st.icon}</div>
              <div style="font-size:26px;font-weight:800;color:${st.color};line-height:1">${stageMap[st.key]||0}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${st.key}</div>
            </div>
          `).join('')}
        </div>
      </div>`;

    // ── Revenue chart + Top filaments ─────────────────────────────────────────
    const topFilHtml = topFilaments.length === 0
      ? `<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px">Sin uso registrado</div>`
      : topFilaments.map((f, i) => {
          const maxG = parseFloat(topFilaments[0].total_gramos) || 1;
          const pct  = Math.round((parseFloat(f.total_gramos)/maxG)*100);
          const hex  = f.color_hex || colorHex(f.color);
          return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0${i<topFilaments.length-1?';border-bottom:1px solid var(--border)':''}">
            <div style="width:28px;height:28px;border-radius:50%;background:${hex};border:2px solid var(--border);flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.marca||'-'} ${f.material}</div>
              <div style="height:4px;border-radius:99px;background:var(--surface);margin-top:4px;overflow:hidden">
                <div style="height:4px;border-radius:99px;background:${hex};width:${pct}%;transition:width 0.6s"></div>
              </div>
            </div>
            <div style="font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0">${Math.round(f.total_gramos)}g</div>
          </div>`;
        }).join('');

    const analyticsRow = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px">📈 INGRESOS ÚLTIMOS 6 MESES</div>
          ${buildRevenueChart(monthlyRevenue)}
          <div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px">${monthlyRevenue.reduce((s,d)=>s+(parseInt(d.pedidos)||0),0)} pedidos totales</div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px">🧵 FILAMENTOS MÁS USADOS (mes)</div>
          ${topFilHtml}
        </div>
      </div>`;

    // ── Low filaments ─────────────────────────────────────────────────────────
    const lowSection = lowFilaments.length === 0 ? '' : `
      <div style="margin-bottom:24px">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--warning)">⚠️ Filamentos bajos</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">
          ${lowFilaments.map(f => {
            const pct = f.peso_inicial_g > 0 ? Math.max(0, Math.min(1, f.peso_actual_g / f.peso_inicial_g)) : 0;
            const hex = f.color_hex || colorHex(f.color);
            const barClr = pct < 0.10 ? '#ef4444' : hex;
            return `<div onclick="dashOpenFilament(${f.id})" style="background:var(--card);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:10px;cursor:pointer;text-align:center;transition:all 0.2s"
              onmouseover="this.style.borderColor='rgba(239,68,68,0.8)'" onmouseout="this.style.borderColor='rgba(239,68,68,0.4)'">
              ${typeof makeSpool==='function' ? makeSpool(f, 70) : `<div style="width:70px;height:70px;border-radius:50%;background:${hex};margin:0 auto"></div>`}
              <div style="font-size:11px;font-weight:700;margin-top:6px">${f.marca||'-'}</div>
              <div style="font-size:10px;color:var(--text-muted)">${f.material}</div>
              <div style="font-size:12px;font-weight:700;color:#ef4444;margin-top:4px">${Math.round(f.peso_actual_g||0)}g</div>
              <div style="background:var(--surface);border-radius:99px;height:4px;margin-top:6px;overflow:hidden">
                <div style="height:4px;border-radius:99px;background:${barClr};width:${Math.round(pct*100)}%"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    // ── Recent jobs ───────────────────────────────────────────────────────────
    const STAGE_COLORS_MAP = { 'Solicitud':'#6366f1','Levantamiento':'#f59e0b','Producción':'#3b82f6','Cierre':'#22c55e' };
    const recentSection = recentJobs.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📋</div>Sin trabajos recientes</div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
          ${recentJobs.map(j => {
            const sc = STAGE_COLORS_MAP[j.estado] || 'var(--accent)';
            return `<div onclick="dashOpenJob(${j.id})" style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;cursor:pointer;transition:all 0.2s;display:flex;flex-direction:column;gap:6px"
              onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
                <div style="font-weight:700;font-size:13px;line-height:1.3;flex:1">${j.nombre_proyecto || 'Sin nombre'}</div>
                <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:${sc}22;color:${sc};white-space:nowrap">${j.estado||''}</span>
              </div>
              <div style="font-size:12px;color:var(--text-muted)">👥 ${j.cliente_nombre || '—'}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">
                <span style="font-size:11px;color:var(--text-muted)">📅 ${j.fecha ? j.fecha.substring(0,10) : '-'}</span>
                <span style="font-size:14px;font-weight:800;color:var(--accent-light)">${fmtMoney(j.precio_final)}</span>
              </div>
            </div>`;
          }).join('')}
        </div>`;

    document.getElementById('dash-content').innerHTML = `
      <div class="stats-row" id="stat-counters">
        <div class="stat-chip" style="cursor:pointer" onclick="window.location.hash='jobs';navigate('jobs')">
          <div class="stat-chip-icon">📋</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" id="sc-jobs">0</div>
            <div class="stat-chip-lbl">Trabajos</div>
          </div>
          <a class="stat-chip-add" href="#jobs" title="Nuevo trabajo">＋</a>
        </div>
        <div class="stat-chip" style="cursor:pointer" onclick="window._invTargetTab='filamentos';window.location.hash='inventory';navigate('inventory')">
          <div class="stat-chip-icon">🧵</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" id="sc-fil">0</div>
            <div class="stat-chip-lbl">Filamentos</div>
          </div>
          <a class="stat-chip-add" href="#inventory" title="Agregar">＋</a>
        </div>
        <div class="stat-chip" style="cursor:pointer" onclick="window.location.hash='clients';navigate('clients')">
          <div class="stat-chip-icon">👥</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" id="sc-cli">0</div>
            <div class="stat-chip-lbl">Clientes</div>
          </div>
          <a class="stat-chip-add" href="#clients" title="Nuevo cliente">＋</a>
        </div>
        <div class="stat-chip" style="cursor:pointer" onclick="openCalculator()">
          <div class="stat-chip-icon">🧮</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" style="font-size:14px">Calcular</div>
            <div class="stat-chip-lbl">Calculadora de costos</div>
          </div>
        </div>
        <div class="stat-chip accent" style="cursor:default">
          <div class="stat-chip-icon">💰</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" id="sc-rev">$0</div>
            <div class="stat-chip-lbl">Ingresos del mes</div>
          </div>
        </div>
        <div class="stat-chip" style="cursor:default">
          <div class="stat-chip-icon">📅</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" id="sc-mjobs">0</div>
            <div class="stat-chip-lbl">Trabajos del mes</div>
          </div>
        </div>
      </div>

      ${stageSection}
      ${analyticsRow}
      ${lowSection}

      <div>
        <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--text-muted)">🕐 Trabajos recientes</div>
        ${recentSection}
      </div>`;

    // Animate counters
    setTimeout(() => {
      const sc = (id, val, isFloat) => { const e = document.getElementById(id); if(e) animateCounter(e, val, isFloat); };
      sc('sc-jobs',  stats.jobs || 0);
      sc('sc-fil',   stats.filaments || 0);
      sc('sc-cli',   stats.clients || 0);
      sc('sc-rev',   parseFloat(monthStats.total_ingresos || 0), true);
      sc('sc-mjobs', monthStats.total_jobs || 0);
    }, 100);

    document.querySelectorAll('.stat-chip-add').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const page = a.getAttribute('href').replace('#','');
        window.location.hash = page; navigate(page);
      });
    });

  } catch (e) {
    document.getElementById('dash-content').innerHTML = `<div class="alert alert-warning">Error cargando datos: ${e.message}</div>`;
  }
};

window.dashOpenJob = function(id) {
  window._jobToOpen = id;
  window.location.hash = 'jobs';
  navigate('jobs');
};

window.dashOpenFilament = function(id) {
  window._invTargetTab = 'filamentos';
  window._invOpenFilament = id;
  window.location.hash = 'inventory';
  navigate('inventory');
};

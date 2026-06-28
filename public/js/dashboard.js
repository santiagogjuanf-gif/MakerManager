// Weather code to emoji mapping
function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌧️';
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
  const startVal = 0;
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (target - startVal) * eased;
    el.textContent = isFloat ? fmtMoney(current) : Math.round(current).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

async function loadWeather(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!navigator.geolocation) {
    el.innerHTML = '';
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const data = await res.json();
      const w = data.current_weather;
      const icon = weatherIcon(w.weathercode);
      el.innerHTML = `
        <div class="weather-widget">
          <span style="font-size:32px">${icon}</span>
          <div>
            <div class="weather-temp">${Math.round(w.temperature)}°C</div>
            <div class="weather-desc">${w.windspeed} km/h viento</div>
          </div>
        </div>`;
    } catch (e) {
      el.innerHTML = '';
    }
  }, () => { el.innerHTML = ''; });
}

pageLoaders['dashboard'] = async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const bizName = appConfig.nombre_negocio ? ` — ${appConfig.nombre_negocio}` : '';

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
    const { lowFilaments = [], recentJobs = [], monthStats = {}, stats = {} } = data;

    const lowRows = lowFilaments.length
      ? lowFilaments.map(f => {
          const pct = Math.max(0, Math.min(100, (f.peso_actual_g / f.peso_inicial_g) * 100));
          const cls = pct < 10 ? 'danger' : pct < 20 ? 'warning' : 'success';
          const badgeCls = cls === 'danger' ? 'low' : cls === 'warning' ? 'warn' : 'ok';
          return `<tr>
            <td><span class="color-dot" style="background:${colorHex(f.color)}"></span>${f.marca}</td>
            <td>${materialBadge(f.material)}</td>
            <td><span class="badge badge-${badgeCls}">${fmtNum(f.peso_actual_g,0)}g</span></td>
            <td style="min-width:90px">
              <div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(0)}%;background:var(--${cls})"></div></div>
              <span style="font-size:10px;color:var(--text-muted)">${pct.toFixed(0)}%</span>
            </td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" class="empty-state" style="padding:20px">Sin filamentos bajos ✓</td></tr>';

    const recentRows = recentJobs.length
      ? recentJobs.map(j => `
        <tr onclick="dashOpenJob(${j.id})" style="cursor:pointer">
          <td>${j.nombre_proyecto || '-'}</td>
          <td>${j.cliente_nombre || '-'}</td>
          <td>${j.fecha ? j.fecha.substring(0, 10) : '-'}</td>
          <td>${fmtMoney(j.precio_final)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="empty-state" style="padding:20px">Sin trabajos recientes</td></tr>';

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
        <div class="stat-chip" style="cursor:default">
          <div class="stat-chip-icon">⚖️</div>
          <div class="stat-chip-body">
            <div class="stat-chip-val" id="sc-mg">0g</div>
            <div class="stat-chip-lbl">Gramos usados</div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="table-container">
          <div class="table-toolbar"><span class="card-title" style="margin:0">⚠️ Filamentos bajos</span></div>
          <table><thead><tr><th>Filamento</th><th>Material</th><th>Peso</th><th>Nivel</th></tr></thead>
          <tbody>${lowRows}</tbody></table>
        </div>
        <div class="table-container">
          <div class="table-toolbar"><span class="card-title" style="margin:0">🕐 Trabajos recientes</span></div>
          <table><thead><tr><th>Proyecto</th><th>Cliente</th><th>Fecha</th><th>Precio</th></tr></thead>
          <tbody>${recentRows}</tbody></table>
        </div>
      </div>`;

    // Animate counters
    setTimeout(() => {
      const sc = (id, val, isFloat) => {
        const el = document.getElementById(id);
        if (el) animateCounter(el, val, isFloat);
      };
      sc('sc-jobs', stats.jobs || 0);
      sc('sc-fil', stats.filaments || 0);
      sc('sc-cli', stats.clients || 0);
      sc('sc-rev', parseFloat(monthStats.total_ingresos || 0), true);
      sc('sc-mjobs', monthStats.total_jobs || 0);
      const mgEl = document.getElementById('sc-mg');
      if (mgEl) { const gv = parseFloat(monthStats.total_gramos || 0); animateCounter(mgEl, gv); mgEl.textContent = Math.round(gv) + 'g'; }
    }, 100);

    // Make quick-add links navigate properly (stop propagation so chip onclick doesn't also fire)
    document.querySelectorAll('.stat-chip-add').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const page = a.getAttribute('href').replace('#', '');
        window.location.hash = page;
        navigate(page);
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

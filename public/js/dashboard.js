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
    <div class="page-header" style="flex-wrap:wrap;gap:12px">
      <div>
        <div class="dash-greeting">${getGreeting()}${bizName}</div>
        <div class="dash-date">${dateStr}</div>
      </div>
      <div id="weather-container" style="min-width:160px"></div>
    </div>
    <div id="dash-content"><p style="color:var(--text-muted);padding:20px">Cargando...</p></div>`;

  loadWeather('weather-container');

  try {
    const data = await api('GET', '/api/dashboard');
    const { lowFilaments = [], recentJobs = [], monthStats = {}, stats = {} } = data;

    const lowRows = lowFilaments.length
      ? lowFilaments.map(f => `
        <tr>
          <td><span class="color-dot" style="background:${colorHex(f.color)}"></span>${f.marca} ${f.nombre_comercial || ''}</td>
          <td>${materialBadge(f.material)}</td>
          <td><span class="badge badge-low">${fmtNum(f.peso_actual_g, 0)}g</span></td>
        </tr>`).join('')
      : '<tr><td colspan="3" class="empty-state" style="padding:20px">Sin filamentos bajos ✓</td></tr>';

    const recentRows = recentJobs.length
      ? recentJobs.map(j => `
        <tr>
          <td>${j.nombre_proyecto || '-'}</td>
          <td>${j.cliente_nombre || '-'}</td>
          <td>${j.fecha ? j.fecha.substring(0, 10) : '-'}</td>
          <td>${fmtMoney(j.precio_final)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="empty-state" style="padding:20px">Sin trabajos recientes</td></tr>';

    document.getElementById('dash-content').innerHTML = `
      <div class="stats-grid" id="stat-counters">
        <div class="stat-card">
          <div class="stat-label">Trabajos totales</div>
          <div class="stat-value" id="sc-jobs">0</div>
          <a class="stat-quick-add" href="#jobs" title="Nuevo trabajo">＋</a>
        </div>
        <div class="stat-card">
          <div class="stat-label">Filamentos activos</div>
          <div class="stat-value" id="sc-fil">0</div>
          <a class="stat-quick-add" href="#inventory" title="Agregar filamento">＋</a>
        </div>
        <div class="stat-card">
          <div class="stat-label">Clientes</div>
          <div class="stat-value" id="sc-cli">0</div>
          <a class="stat-quick-add" href="#clients" title="Nuevo cliente">＋</a>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ingresos del mes</div>
          <div class="stat-value" id="sc-rev">${fmtMoney(0)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Trabajos este mes</div>
          <div class="stat-value" id="sc-mjobs">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Gramos este mes</div>
          <div class="stat-value" id="sc-mg">0</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="table-container">
          <div class="table-toolbar"><span class="card-title" style="margin:0">⚠️ Filamentos bajos</span></div>
          <table><thead><tr><th>Filamento</th><th>Material</th><th>Peso</th></tr></thead>
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
      sc('sc-jobs', stats.total_jobs || 0);
      sc('sc-fil', stats.total_filaments || 0);
      sc('sc-cli', stats.total_clients || 0);
      sc('sc-rev', parseFloat(monthStats.revenue || 0), true);
      sc('sc-mjobs', monthStats.jobs || 0);
      sc('sc-mg', parseFloat(monthStats.grams || 0));
    }, 100);

    // Make quick-add links navigate properly
    document.querySelectorAll('.stat-quick-add').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const page = a.getAttribute('href').replace('#', '');
        window.location.hash = page;
        navigate(page);
      });
    });

  } catch (e) {
    document.getElementById('dash-content').innerHTML = `<div class="alert alert-warning">Error cargando datos: ${e.message}</div>`;
  }
};

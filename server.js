require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database/db');

// Ensure JWT_SECRET is stable across restarts.
// If not set in .env, generate once and persist to .jwt_secret so tokens survive PM2 restarts.
if (!process.env.JWT_SECRET) {
  const secretFile = path.join(__dirname, '.jwt_secret');
  if (fs.existsSync(secretFile)) {
    process.env.JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
    try { fs.writeFileSync(secretFile, process.env.JWT_SECRET, { mode: 0o600 }); } catch(_) {}
    console.warn('[WARN] JWT_SECRET not in .env — generated persistent secret in .jwt_secret');
  }
}

fs.mkdirSync(path.join(__dirname, 'public/uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'database/tenants'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['https://makermanager.cerberusdev.pro'];
app.use(cors({
  origin: (origin, cb) => {
    // Permitir peticiones sin origin (apps móviles, curl, mismo servidor)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origen no permitido: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// Landing page must be before express.static (static auto-serves index.html for /)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Superadmin static panel
app.use('/superadmin', express.static(path.join(__dirname, 'public/superadmin')));

// Superadmin API routes
app.use('/superadmin/api', require('./routes/superadmin'));

// Tenant middleware — actúa solo en rutas /app/:slug/...
const tenantMiddleware = require('./middleware/tenant');
app.use(tenantMiddleware);

// WebSocket — tiempo real entre dispositivos del mismo taller
// (SSE era cortado por Cloudflare Tunnel; WebSocket funciona correctamente)
const sse = require('./utils/sse');
const { WebSocketServer } = require('ws');

// Broadcast automático tras escrituras exitosas en rutas de tenant
app.use('/app/:slug/api', (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  const slug = req.params.slug;
  const origJson = res.json.bind(res);
  res.json = function(body) {
    const result = origJson(body);
    if (res.statusCode >= 200 && res.statusCode < 300 && slug) {
      const m = req.path.match(/^\/([^/]+)/);
      const section = m ? m[1] : 'data';
      sse.broadcast(slug, 'data-changed', { section, method: req.method });
    }
    return result;
  };
  next();
});

// Rutas API del tenant (con prefijo /app/:slug)
app.use('/app/:slug/api/dashboard', require('./routes/dashboard'));
app.use('/app/:slug/api/filaments', require('./routes/filaments'));
app.use('/app/:slug/api/resinas', require('./routes/resinas'));
app.use('/app/:slug/api/laser', require('./routes/laser'));
app.use('/app/:slug/api/cnc', require('./routes/cnc'));
app.use('/app/:slug/api/printers', require('./routes/printers'));
app.use('/app/:slug/api/clients', require('./routes/clients'));
app.use('/app/:slug/api/jobs', require('./routes/jobs'));
app.use('/app/:slug/api/extras', require('./routes/extras'));
app.use('/app/:slug/api/config', require('./routes/config'));
app.use('/app/:slug/api/pdf', require('./routes/pdf'));
app.use('/app/:slug/api/auth', require('./routes/auth'));
app.use('/app/:slug/api/consumibles', require('./routes/consumibles'));
app.use('/app/:slug/api/cotizaciones', require('./routes/cotizaciones'));
app.use('/app/:slug/api/productos', require('./routes/productos'));
app.use('/app/:slug/api/contabilidad', require('./routes/contabilidad'));
app.use('/app/:slug/api/embalaje', require('./routes/embalaje'));
app.get('/app/:slug/api/plan', (req, res) => {
  res.json(req.tenant?.plan || { max_admins:99, max_workers:99, max_filamentos:9999, max_resinas:9999, max_clientes:9999, max_impresoras:9999, max_trabajos_activos:9999, feature_contabilidad:true, feature_pdf:true, feature_nfc:true });
});

// Entrada del tenant: inyecta el slug en el HTML para que el frontend use sessionStorage (por pestaña)
function serveTenantApp(req, res) {
  const slug = req.params.slug;
  // Leer index.html e inyectar script antes de que cargue la app
  const indexPath = path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  // Solo inyectar el slug en sessionStorage — la función api() en app.js
  // se encarga de construir las URLs correctas sin necesitar interceptar fetch
  const inject = `<script>(function(){ sessionStorage.setItem('mm_tenant', ${JSON.stringify(slug)}); })();</script>`;
  html = html.replace('<head>', '<head>' + inject);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
}
app.get('/app/:slug', serveTenantApp);
app.get('/app/:slug/*', serveTenantApp);

// Rutas API para uso propio (sin tenant)
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/filaments', require('./routes/filaments'));
app.use('/api/resinas', require('./routes/resinas'));
app.use('/api/laser', require('./routes/laser'));
app.use('/api/cnc', require('./routes/cnc'));
app.use('/api/printers', require('./routes/printers'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/extras', require('./routes/extras'));
app.use('/api/config', require('./routes/config'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consumibles', require('./routes/consumibles'));
app.use('/api/cotizaciones', require('./routes/cotizaciones'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/contabilidad', require('./routes/contabilidad'));
app.use('/api/embalaje', require('./routes/embalaje'));

// Plan endpoint
app.get('/api/plan', (req, res) => {
  if (req.tenant && req.tenant.plan) {
    res.json(req.tenant.plan);
  } else {
    res.json({ max_admins: 99, max_workers: 99, max_filamentos: 9999, max_resinas: 9999, max_clientes: 9999, max_impresoras: 9999, max_trabajos_activos: 9999, feature_contabilidad: true, feature_pdf: true, feature_nfc: true });
  }
});

// Rutas de utilidad solo disponibles fuera de producción
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/seed', async (req, res) => {
    try {
      delete require.cache[require.resolve('./database/seed')];
      await require('./database/seed')();
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/reset', async (req, res) => {
    try {
      const tables = ['job_extras','job_products','job_filaments','print_jobs','filaments','resinas','consumibles_laser','consumibles_cnc','printers','clients'];
      for (const t of tables) await db.runAsync(`DELETE FROM ${t}`);
      await db.runAsync(`DELETE FROM sqlite_sequence WHERE name IN (${tables.map(()=>'?').join(',')})`, tables);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
}

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// Página de emergencia — limpia todo el storage del navegador y rompe cualquier loop
app.get('/reset-browser', (req, res) => {
  const slug = req.query.slug || '';
  const redirect = slug ? `/app/${slug}` : '/login';
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Limpiando...</title></head>
  <body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
  <h2>Limpiando sesión...</h2><p id="st" style="color:#8892a4">Iniciando...</p>
  <script>
    (async function(){
      const st = document.getElementById('st');
      st.textContent = 'Borrando localStorage...';
      localStorage.clear();
      st.textContent = 'Borrando sessionStorage...';
      sessionStorage.clear();
      st.textContent = 'Desregistrando service workers...';
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      st.textContent = 'Borrando caché del navegador...';
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
      st.textContent = 'Listo. Redirigiendo...';
      setTimeout(() => { window.location.href = ${JSON.stringify(redirect)}; }, 800);
    })();
  </script>
  </body></html>`);
});

// NFC tag tap → redirect to app with filament highlighted
app.get('/nfc/:id', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MakerManager — Filamento</title>
  <script>
    const id = ${parseInt(req.params.id)||0};
    localStorage.setItem('mm_nfc_open', id);
    window.location.href = '/#inventory';
  </script></head><body style="background:#0f0f13;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <p>Abriendo filamento...</p></body></html>`);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const superadminDb = require('./database/superadmin-db');
Promise.all([db.ready, superadminDb.ready]).then(() => {
  const server = app.listen(PORT, () => console.log(`MakerManager v2.0 → http://localhost:${PORT}`));

  // WebSocket server — comparte el mismo puerto HTTP
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const m = req.url.match(/^\/app\/([a-z0-9-]+)\/api\/events$/);
    if (!m) { socket.destroy(); return; }
    const slug = m[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      sse.subscribe(slug, ws);
      ws.on('close', () => sse.unsubscribe(slug, ws));
      ws.on('error', () => sse.unsubscribe(slug, ws));
    });
  });
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });

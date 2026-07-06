require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database/db');

fs.mkdirSync(path.join(__dirname, 'public/uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'database/tenants'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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

// Tenant middleware (skip for superadmin routes)
const tenantMiddleware = require('./middleware/tenant');
app.use((req, res, next) => {
  if (req.path.startsWith('/superadmin')) return next();
  tenantMiddleware(req, res, next);
});

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

// Plan endpoint
app.get('/api/plan', (req, res) => {
  if (req.tenant && req.tenant.plan) {
    res.json(req.tenant.plan);
  } else {
    res.json({ max_admins: 99, max_workers: 99, max_filamentos: 9999, max_resinas: 9999, max_clientes: 9999, max_impresoras: 9999, max_trabajos_activos: 9999, feature_contabilidad: true, feature_pdf: true, feature_nfc: true });
  }
});

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

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

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
  app.listen(PORT, () => console.log(`MakerManager v2.0 → http://localhost:${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });

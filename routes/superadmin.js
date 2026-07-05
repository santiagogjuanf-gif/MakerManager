const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const superadminDb = require('../database/superadmin-db');
const { initTenantDb } = require('../database/tenant-init');
const { createSubdomainDNS, deleteSubdomainDNS } = require('../utils/cloudflare');
const fs = require('fs');
const path = require('path');

const SA_JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || 'superadmin-secret-change-me';

function requireSuperAdmin(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try { req.saUser = jwt.verify(h.slice(7), SA_JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido o expirado' }); }
}

// POST /superadmin/api/login
router.post('/login', async (req, res) => {
  try {
    await superadminDb.ready;
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
    const user = await superadminDb.getAsync('SELECT * FROM superadmin_users WHERE username = ?', [username.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign({ id: user.id, username: user.username }, SA_JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /superadmin/api/me
router.get('/me', requireSuperAdmin, async (req, res) => {
  res.json({ id: req.saUser.id, username: req.saUser.username });
});

// GET /superadmin/api/dashboard
router.get('/dashboard', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const totals = await superadminDb.getAsync(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN estado='activo' THEN 1 ELSE 0 END) as activos,
        SUM(CASE WHEN estado='trial' THEN 1 ELSE 0 END) as trials,
        SUM(CASE WHEN estado='suspendido' THEN 1 ELSE 0 END) as suspendidos,
        SUM(CASE WHEN estado='cancelado' THEN 1 ELSE 0 END) as cancelados
      FROM tenants
    `);
    const ingresos = await superadminDb.getAsync(`
      SELECT COALESCE(SUM(p.precio_mensual), 0) as estimado
      FROM tenants t JOIN plans p ON t.plan_id = p.id
      WHERE t.estado = 'activo'
    `);
    const tenants = await superadminDb.allAsync(`
      SELECT t.*, p.nombre as plan_nombre, p.slug as plan_slug, p.precio_mensual
      FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id ORDER BY t.created_at DESC
    `);
    res.json({ ...totals, ingresos_estimados: ingresos?.estimado || 0, tenants });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /superadmin/api/plans
router.get('/plans', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    res.json(await superadminDb.allAsync('SELECT * FROM plans ORDER BY precio_mensual ASC'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /superadmin/api/plans
router.post('/plans', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const { nombre, slug, precio_mensual, max_admins, max_workers, max_filamentos, max_resinas, max_clientes, max_impresoras, max_trabajos_activos, feature_contabilidad, feature_pdf, feature_nfc } = req.body;
    if (!nombre || !slug) return res.status(400).json({ error: 'nombre y slug requeridos' });
    const r = await superadminDb.runAsync(
      `INSERT INTO plans (nombre, slug, precio_mensual, max_admins, max_workers, max_filamentos, max_resinas, max_clientes, max_impresoras, max_trabajos_activos, feature_contabilidad, feature_pdf, feature_nfc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [nombre, slug, precio_mensual||0, max_admins||1, max_workers||1, max_filamentos||15, max_resinas||5, max_clientes||20, max_impresoras||2, max_trabajos_activos||10, feature_contabilidad?1:0, feature_pdf?1:0, feature_nfc?1:0]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /superadmin/api/plans/:id
router.put('/plans/:id', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const { nombre, precio_mensual, max_admins, max_workers, max_filamentos, max_resinas, max_clientes, max_impresoras, max_trabajos_activos, feature_contabilidad, feature_pdf, feature_nfc, activo } = req.body;
    await superadminDb.runAsync(
      `UPDATE plans SET nombre=?, precio_mensual=?, max_admins=?, max_workers=?, max_filamentos=?, max_resinas=?, max_clientes=?, max_impresoras=?, max_trabajos_activos=?, feature_contabilidad=?, feature_pdf=?, feature_nfc=?, activo=? WHERE id=?`,
      [nombre, precio_mensual, max_admins, max_workers, max_filamentos, max_resinas, max_clientes, max_impresoras, max_trabajos_activos, feature_contabilidad?1:0, feature_pdf?1:0, feature_nfc?1:0, activo?1:0, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /superadmin/api/tenants
router.get('/tenants', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const rows = await superadminDb.allAsync(`
      SELECT t.*, p.nombre as plan_nombre, p.slug as plan_slug, p.precio_mensual,
             p.max_admins, p.max_workers, p.max_filamentos, p.max_resinas,
             p.max_clientes, p.max_impresoras, p.max_trabajos_activos,
             p.feature_contabilidad, p.feature_pdf, p.feature_nfc
      FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id
      ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Resolve plan_id from plan_slug or create custom plan
async function resolvePlanId(plan_slug, custom_plan) {
  if (plan_slug === 'custom' && custom_plan) {
    const r = await superadminDb.runAsync(
      `INSERT INTO plans (nombre, slug, precio_mensual, max_admins, max_workers, max_filamentos, max_resinas, max_clientes, max_impresoras, max_trabajos_activos, feature_contabilidad, feature_pdf, feature_nfc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['Custom', `custom-${Date.now()}`, custom_plan.precio_mensual||0, custom_plan.max_admins||1, custom_plan.max_workers||1,
       custom_plan.max_filamentos||15, custom_plan.max_resinas||5, custom_plan.max_clientes||20,
       custom_plan.max_impresoras||2, custom_plan.max_trabajos_activos||10,
       custom_plan.feature_contabilidad||0, custom_plan.feature_pdf||0, custom_plan.feature_nfc||0]
    );
    return r.lastID;
  }
  if (plan_slug) {
    const p = await superadminDb.getAsync('SELECT id FROM plans WHERE slug=?', [plan_slug]);
    return p ? p.id : null;
  }
  return null;
}

// POST /superadmin/api/tenants
router.post('/tenants', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const { slug, nombre_negocio, email_contacto, plan_slug, plan_id: plan_id_direct, custom_plan,
            estado: estadoReq, trial_fin, admin_username, admin_password, notas_admin } = req.body;
    if (!slug || !nombre_negocio) return res.status(400).json({ error: 'slug y nombre_negocio requeridos' });
    if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug inválido (solo letras minúsculas, números y guiones)' });

    const existing = await superadminDb.getAsync('SELECT id FROM tenants WHERE slug=?', [slug]);
    if (existing) return res.status(400).json({ error: 'El slug ya existe' });

    // Accept plan_id (integer) directly or resolve from plan_slug
    const plan_id = plan_id_direct ? parseInt(plan_id_direct) : await resolvePlanId(plan_slug, custom_plan);
    const estado = estadoReq || 'trial';
    const now = new Date().toISOString();
    const trialFinDate = trial_fin || new Date(Date.now() + 14*24*60*60*1000).toISOString().slice(0,10);

    const r = await superadminDb.runAsync(
      `INSERT INTO tenants (slug, nombre_negocio, email_contacto, plan_id, estado, trial_inicio, trial_fin, fecha_activacion, notas_admin)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [slug, nombre_negocio, email_contacto||'', plan_id, estado, now, trialFinDate, estado==='activo'?now:null, notas_admin||'']
    );

    const adminUser = admin_username || 'admin';
    const adminPass = admin_password || Math.random().toString(36).slice(-8);
    await initTenantDb(slug, adminUser, adminPass, nombre_negocio);

    try { await createSubdomainDNS(slug); } catch(e) { console.error('DNS creation failed:', e.message); }

    res.json({ success: true, id: r.lastID, slug, admin_username: adminUser, admin_password: adminPass, url: `https://${slug}.makermanager.cerberusdev.pro` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /superadmin/api/tenants/:id
router.get('/tenants/:id', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const tenant = await superadminDb.getAsync(`
      SELECT t.*, p.nombre as plan_nombre, p.precio_mensual, p.max_admins, p.max_workers, p.max_filamentos, p.max_resinas, p.max_clientes, p.max_impresoras, p.max_trabajos_activos, p.feature_contabilidad, p.feature_pdf, p.feature_nfc
      FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.id=?
    `, [req.params.id]);
    if (!tenant) return res.status(404).json({ error: 'No encontrado' });
    res.json(tenant);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /superadmin/api/tenants/:id
router.put('/tenants/:id', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const { nombre_negocio, email_contacto, plan_slug, plan_id: plan_id_direct, custom_plan, estado, notas_admin, fecha_vencimiento, trial_fin } = req.body;
    const plan_id = plan_id_direct ? parseInt(plan_id_direct) : await resolvePlanId(plan_slug, custom_plan);
    await superadminDb.runAsync(
      `UPDATE tenants SET nombre_negocio=COALESCE(?,nombre_negocio), email_contacto=COALESCE(?,email_contacto),
       plan_id=COALESCE(?,plan_id), estado=COALESCE(?,estado), notas_admin=COALESCE(?,notas_admin),
       fecha_vencimiento=COALESCE(?,fecha_vencimiento), trial_fin=COALESCE(?,trial_fin),
       updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [nombre_negocio||null, email_contacto||null, plan_id||null, estado||null, notas_admin||null,
       fecha_vencimiento||null, trial_fin||null, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /superadmin/api/tenants/:id
router.delete('/tenants/:id', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const tenant = await superadminDb.getAsync('SELECT * FROM tenants WHERE id=?', [req.params.id]);
    if (!tenant) return res.status(404).json({ error: 'No encontrado' });

    try { await deleteSubdomainDNS(tenant.slug); } catch(e) { console.error('DNS delete failed:', e.message); }

    const dbPath = path.join(__dirname, '../database/tenants', `${tenant.slug}.db`);
    try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch(e) { console.error('DB delete failed:', e.message); }

    await superadminDb.runAsync('DELETE FROM tenants WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /superadmin/api/tenants/:id/suspend
router.post('/tenants/:id/suspend', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    await superadminDb.runAsync("UPDATE tenants SET estado='suspendido', updated_at=CURRENT_TIMESTAMP WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /superadmin/api/tenants/:id/activate
router.post('/tenants/:id/activate', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    await superadminDb.runAsync("UPDATE tenants SET estado='activo', fecha_activacion=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /superadmin/api/tenants/:id/trial
router.post('/tenants/:id/trial', requireSuperAdmin, async (req, res) => {
  try {
    await superadminDb.ready;
    const { dias } = req.body;
    const trialFin = new Date(Date.now() + (parseInt(dias)||14) * 24*60*60*1000).toISOString();
    await superadminDb.runAsync("UPDATE tenants SET estado='trial', trial_inicio=CURRENT_TIMESTAMP, trial_fin=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [trialFin, req.params.id]);
    res.json({ success: true, trial_fin: trialFin });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

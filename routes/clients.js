const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('./auth');

// Multi-tenant DB selector
router.use(requireAuth, (req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

async function updateClassification(clientId, dbInstance) {
  if (!dbInstance) dbInstance = require('../database/db');
  const client = await dbInstance.getAsync('SELECT total_pedidos, clasificacion_manual FROM clients WHERE id=?', [clientId]);
  if (!client || client.clasificacion_manual) return;
  const cfgRows = await dbInstance.allAsync('SELECT key, value FROM config WHERE key IN (?,?,?,?)',
    ['nivel_nuevo','nivel_regular','nivel_frecuente','nivel_vip']);
  const cfg = {};
  cfgRows.forEach(r => cfg[r.key] = parseInt(r.value));
  const n = client.total_pedidos;
  let cls = 'Nuevo';
  if (n >= (cfg.nivel_vip||15)) cls = 'VIP';
  else if (n >= (cfg.nivel_frecuente||7)) cls = 'Frecuente';
  else if (n >= (cfg.nivel_regular||3)) cls = 'Regular';
  await dbInstance.runAsync('UPDATE clients SET clasificacion=? WHERE id=?', [cls, clientId]);
}

router.get('/', async (req, res) => {
  try { res.json(await req.db.allAsync('SELECT * FROM clients ORDER BY nombre ASC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const r = await req.db.getAsync('SELECT * FROM clients WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/', async (req, res) => {
  try {
    // Plan limit check
    if (req.tenant?.plan) {
      const count = await req.db.getAsync('SELECT COUNT(*) as cnt FROM clients');
      if (count.cnt >= req.tenant.plan.max_clientes) return res.status(400).json({ error: `Límite de ${req.tenant.plan.max_clientes} clientes alcanzado para tu plan` });
    }
    const d = req.body;
    const r = await req.db.runAsync(
      'INSERT INTO clients (nombre,telefono,email,direccion,notas) VALUES (?,?,?,?,?)',
      [d.nombre,d.telefono,d.email,d.direccion,d.notas]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const manual = d.clasificacion_manual ? 1 : 0;
    await req.db.runAsync(
      'UPDATE clients SET nombre=?,telefono=?,email=?,direccion=?,notas=?,clasificacion=?,clasificacion_manual=? WHERE id=?',
      [d.nombre,d.telefono,d.email,d.direccion,d.notas,d.clasificacion||'Nuevo',manual,req.params.id]
    );
    if (!manual) await updateClassification(req.params.id, req.db);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id/jobs', async (req, res) => {
  try {
    const jobs = await req.db.allAsync(`
      SELECT pj.id, pj.nombre_proyecto, pj.fecha, pj.precio_final, pj.estado, pj.fallo,
             p.nombre as impresora
      FROM print_jobs pj
      LEFT JOIN printers p ON pj.impresora_id = p.id
      WHERE pj.cliente_id = ?
      ORDER BY pj.fecha DESC, pj.created_at DESC
    `, [req.params.id]);
    const totals = await req.db.getAsync(
      'SELECT COUNT(*) as total, SUM(CASE WHEN fallo=0 THEN precio_final ELSE 0 END) as gastado FROM print_jobs WHERE cliente_id=?',
      [req.params.id]
    );
    res.json({ jobs, totals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { await req.db.runAsync('DELETE FROM clients WHERE id=?',[req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.updateClassification = updateClassification;

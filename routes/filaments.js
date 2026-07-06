const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('./auth');

// Multi-tenant DB selector
router.use(requireAuth, (req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

router.get('/', async (req, res) => {
  try { res.json(await req.db.allAsync('SELECT * FROM filaments ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/nfc/:uid', async (req, res) => {
  try {
    const row = await req.db.getAsync('SELECT id FROM filaments WHERE uid_nfc=?', [req.params.uid]);
    if (!row) return res.status(404).json({ error: 'Filamento no encontrado para este UID' });
    res.json({ id: row.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id/history', async (req, res) => {
  try {
    const rows = await req.db.allAsync(
      'SELECT * FROM filament_history WHERE filament_id=? ORDER BY fecha DESC LIMIT 50',
      [req.params.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const r = await req.db.getAsync('SELECT * FROM filaments WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function calcCpg(d) {
  const pi = parseFloat(d.peso_inicial_g) || 0;
  const ct = parseFloat(d.costo_total) || 0;
  return pi > 0 && ct > 0 ? ct / pi : 0;
}

router.post('/', async (req, res) => {
  try {
    // Plan limit check
    if (req.tenant?.plan) {
      const count = await req.db.getAsync('SELECT COUNT(*) as cnt FROM filaments');
      if (count.cnt >= req.tenant.plan.max_filamentos) return res.status(400).json({ error: `Límite de ${req.tenant.plan.max_filamentos} filamentos alcanzado para tu plan` });
    }
    const d = req.body;
    const cpg = parseFloat(d.costo_por_gramo) || calcCpg(d);
    const r = await req.db.runAsync(
      `INSERT INTO filaments (marca,nombre_comercial,material,color,color_hex,acabado,tipo_bobina,diametro_mm,peso_inicial_g,peso_actual_g,peso_bobina_vacia_g,costo_total,costo_por_gramo,proveedor,tiene_nfc,uid_nfc,notas,estado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.marca, d.nombre_comercial, d.material||'PLA', d.color, d.color_hex||null,
       d.acabado||'Estándar', d.tipo_bobina||'Bobina completa', d.diametro_mm||1.75,
       d.peso_inicial_g, d.peso_actual_g||d.peso_inicial_g,
       d.peso_bobina_vacia_g||200, d.costo_total, cpg,
       d.proveedor, d.tiene_nfc?1:0, d.uid_nfc||null, d.notas,
       d.estado || 'En uso']
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const old = await req.db.getAsync('SELECT * FROM filaments WHERE id=?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Not found' });
    const merged = { ...old, ...d };
    const cpg = calcCpg(merged) || (merged.costo_por_gramo || 0);
    await req.db.runAsync(
      `UPDATE filaments SET marca=?,nombre_comercial=?,material=?,color=?,color_hex=?,acabado=?,tipo_bobina=?,
       diametro_mm=?,peso_inicial_g=?,peso_actual_g=?,peso_bobina_vacia_g=?,costo_total=?,costo_por_gramo=?,
       proveedor=?,tiene_nfc=?,uid_nfc=?,notas=?,estado=? WHERE id=?`,
      [merged.marca, merged.nombre_comercial, merged.material, merged.color, merged.color_hex||null,
       merged.acabado, merged.tipo_bobina||'Bobina completa', merged.diametro_mm||1.75,
       merged.peso_inicial_g, merged.peso_actual_g, merged.peso_bobina_vacia_g||200,
       merged.costo_total, cpg, merged.proveedor,
       merged.tiene_nfc?1:0, merged.uid_nfc||null, merged.notas,
       merged.estado || 'En uso', req.params.id]
    );
    const newPeso = parseFloat(merged.peso_actual_g);
    const oldPeso = parseFloat(old.peso_actual_g);
    if (d.peso_actual_g !== undefined && Math.abs(newPeso - oldPeso) > 0.001) {
      await req.db.runAsync(
        'INSERT INTO filament_history (filament_id, peso_anterior, peso_nuevo, nota) VALUES (?,?,?,?)',
        [req.params.id, oldPeso, newPeso, d._nota_historial || null]
      );
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['En uso', 'En stock', 'Agotado'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
    await req.db.runAsync('UPDATE filaments SET estado=? WHERE id=?', [estado, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/agotar', async (req, res) => {
  try {
    const f = await req.db.getAsync('SELECT * FROM filaments WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    await req.db.runAsync('DELETE FROM filaments WHERE id=?', [req.params.id]);
    const next = await req.db.getAsync(
      `SELECT id FROM filaments WHERE material=? AND color=? AND estado='En stock' ORDER BY created_at ASC LIMIT 1`,
      [f.material, f.color]
    );
    let promoted = null;
    if (next) {
      await req.db.runAsync(`UPDATE filaments SET estado='En uso' WHERE id=?`, [next.id]);
      promoted = next.id;
    }
    res.json({ success: true, promoted });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { await req.db.runAsync('DELETE FROM filaments WHERE id=?',[req.params.id]); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM filaments ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const r = await db.getAsync('SELECT * FROM filaments WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/nfc/:uid', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT id FROM filaments WHERE uid_nfc=?', [req.params.uid]);
    if (!row) return res.status(404).json({ error: 'Filamento no encontrado para este UID' });
    res.json({ id: row.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const net = (parseFloat(d.peso_inicial_g)||1000) - (parseFloat(d.peso_bobina_vacia_g)||200);
    const cpg = net > 0 ? (parseFloat(d.costo_total)||0) / net : 0;
    const r = await db.runAsync(
      `INSERT INTO filaments (marca,nombre_comercial,material,color,color_hex,acabado,tipo_bobina,diametro_mm,peso_inicial_g,peso_actual_g,peso_bobina_vacia_g,costo_total,costo_por_gramo,proveedor,tiene_nfc,uid_nfc,notas)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.marca, d.nombre_comercial, d.material||'PLA', d.color, d.color_hex||null,
       d.acabado||'Estándar', d.tipo_bobina||'Bobina completa', d.diametro_mm||1.75,
       d.peso_inicial_g, d.peso_actual_g||d.peso_inicial_g,
       d.peso_bobina_vacia_g||200, d.costo_total, cpg,
       d.proveedor, d.tiene_nfc?1:0, d.uid_nfc||null, d.notas]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const old = await db.getAsync('SELECT * FROM filaments WHERE id=?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Not found' });
    const merged = { ...old, ...d };
    const net = (parseFloat(merged.peso_inicial_g)||1000) - (parseFloat(merged.peso_bobina_vacia_g)||200);
    const cpg = net > 0 ? (parseFloat(merged.costo_total)||0) / net : (merged.costo_por_gramo||0);
    await db.runAsync(
      `UPDATE filaments SET marca=?,nombre_comercial=?,material=?,color=?,color_hex=?,acabado=?,tipo_bobina=?,
       diametro_mm=?,peso_inicial_g=?,peso_actual_g=?,peso_bobina_vacia_g=?,costo_total=?,costo_por_gramo=?,
       proveedor=?,tiene_nfc=?,uid_nfc=?,notas=? WHERE id=?`,
      [merged.marca, merged.nombre_comercial, merged.material, merged.color, merged.color_hex||null,
       merged.acabado, merged.tipo_bobina||'Bobina completa', merged.diametro_mm||1.75,
       merged.peso_inicial_g, merged.peso_actual_g, merged.peso_bobina_vacia_g||200,
       merged.costo_total, cpg, merged.proveedor,
       merged.tiene_nfc?1:0, merged.uid_nfc||null, merged.notas, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', async (req, res) => {
  try { await db.runAsync('DELETE FROM filaments WHERE id=?',[req.params.id]); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;

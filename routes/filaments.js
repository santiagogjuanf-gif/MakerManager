const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM filaments ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT * FROM filaments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const netWeight = (parseFloat(d.peso_inicial_g) || 1000) - (parseFloat(d.peso_bobina_vacia_g) || 200);
    const costo_por_gramo = netWeight > 0 ? (parseFloat(d.costo_total_cad) || 0) / netWeight : 0;
    const r = await db.runAsync(`
      INSERT INTO filaments (marca, nombre_comercial, material, color, acabado, diametro_mm, peso_inicial_g, peso_actual_g, peso_bobina_vacia_g, costo_total_cad, costo_por_gramo, fecha_compra, proveedor, tiene_rfid, tiene_nfc, uid_nfc, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.marca, d.nombre_comercial, d.material || 'PLA', d.color, d.acabado || 'Mate',
       d.diametro_mm || 1.75, d.peso_inicial_g, d.peso_actual_g || d.peso_inicial_g,
       d.peso_bobina_vacia_g || 200, d.costo_total_cad, costo_por_gramo,
       d.fecha_compra, d.proveedor, d.tiene_nfc ? 0 : 0, d.tiene_nfc ? 1 : 0, d.uid_nfc, d.notas]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const netWeight = (parseFloat(d.peso_inicial_g) || 1000) - (parseFloat(d.peso_bobina_vacia_g) || 200);
    const costo_por_gramo = netWeight > 0 ? (parseFloat(d.costo_total_cad) || 0) / netWeight : 0;
    await db.runAsync(`
      UPDATE filaments SET marca=?, nombre_comercial=?, material=?, color=?, acabado=?, diametro_mm=?,
      peso_inicial_g=?, peso_actual_g=?, peso_bobina_vacia_g=?, costo_total_cad=?, costo_por_gramo=?,
      fecha_compra=?, proveedor=?, tiene_rfid=?, tiene_nfc=?, uid_nfc=?, notas=? WHERE id=?`,
      [d.marca, d.nombre_comercial, d.material, d.color, d.acabado, d.diametro_mm || 1.75,
       d.peso_inicial_g, d.peso_actual_g, d.peso_bobina_vacia_g || 200, d.costo_total_cad, costo_por_gramo,
       d.fecha_compra, d.proveedor, 0, d.tiene_nfc ? 1 : 0, d.uid_nfc, d.notas, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.runAsync('DELETE FROM filaments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

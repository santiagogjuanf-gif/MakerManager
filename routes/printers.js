const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM printers ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT * FROM printers WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const costo_por_hora = (parseFloat(d.costo_compra_cad) || 0) / (parseFloat(d.vida_util_horas) || 1500);
    const r = await db.runAsync(`
      INSERT INTO printers (nombre, modelo, costo_compra_cad, fecha_compra, vida_util_horas, costo_por_hora, consumo_promedio_watts, costo_kwh_cad, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nombre, d.modelo, d.costo_compra_cad, d.fecha_compra, d.vida_util_horas || 1500,
       costo_por_hora, d.consumo_promedio_watts || 120, d.costo_kwh_cad || 0.18, d.notas]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const costo_por_hora = (parseFloat(d.costo_compra_cad) || 0) / (parseFloat(d.vida_util_horas) || 1500);
    await db.runAsync(`
      UPDATE printers SET nombre=?, modelo=?, costo_compra_cad=?, fecha_compra=?, vida_util_horas=?,
      costo_por_hora=?, consumo_promedio_watts=?, costo_kwh_cad=?, notas=? WHERE id=?`,
      [d.nombre, d.modelo, d.costo_compra_cad, d.fecha_compra, d.vida_util_horas || 1500,
       costo_por_hora, d.consumo_promedio_watts, d.costo_kwh_cad, d.notas, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.runAsync('DELETE FROM printers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

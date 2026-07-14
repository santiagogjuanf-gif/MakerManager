const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');

// Multi-tenant DB selector
router.use(requireAuth, (req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

router.get('/', async (req, res) => {
  try { res.json(await req.db.allAsync('SELECT * FROM embalaje ORDER BY nombre ASC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await req.db.getAsync('SELECT * FROM embalaje WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const d = req.body;
  try {
    const r = await req.db.runAsync(
      `INSERT INTO embalaje (nombre,tipo,largo_cm,ancho_cm,alto_cm,costo,stock,proveedor,notas) VALUES (?,?,?,?,?,?,?,?,?)`,
      [d.nombre, d.tipo||'Caja', d.largo_cm||0, d.ancho_cm||0, d.alto_cm||0, d.costo||0, d.stock||0, d.proveedor||'', d.notas||'']
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const d = req.body;
  try {
    await req.db.runAsync(
      `UPDATE embalaje SET nombre=?,tipo=?,largo_cm=?,ancho_cm=?,alto_cm=?,costo=?,stock=?,proveedor=?,notas=? WHERE id=?`,
      [d.nombre, d.tipo||'Caja', d.largo_cm||0, d.ancho_cm||0, d.alto_cm||0, d.costo||0, d.stock||0, d.proveedor||'', d.notas||'', req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.db.runAsync('DELETE FROM embalaje WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

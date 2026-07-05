const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

router.get('/', async (req, res) => {
  try {
    const rows = await req.db.allAsync('SELECT id, nombre, precio_unitario, created_at FROM cotizaciones ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await req.db.getAsync('SELECT * FROM cotizaciones WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.datos = JSON.parse(row.datos || '{}');
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, datos, precio_unitario } = req.body;
    const r = await req.db.runAsync(
      'INSERT INTO cotizaciones (nombre, datos, precio_unitario) VALUES (?,?,?)',
      [nombre || 'Sin nombre', JSON.stringify(datos || {}), precio_unitario || 0]
    );
    res.json({ id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, datos, precio_unitario } = req.body;
    const existing = await req.db.getAsync('SELECT id FROM cotizaciones WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await req.db.runAsync(
      'UPDATE cotizaciones SET nombre=?, datos=?, precio_unitario=? WHERE id=?',
      [nombre || 'Sin nombre', JSON.stringify(datos || {}), precio_unitario || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.db.runAsync('DELETE FROM cotizaciones WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

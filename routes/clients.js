const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM clients ORDER BY nombre ASC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const r = await db.runAsync(
      'INSERT INTO clients (nombre, telefono, email, direccion, notas) VALUES (?, ?, ?, ?, ?)',
      [d.nombre, d.telefono, d.email, d.direccion, d.notas]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await db.runAsync(
      'UPDATE clients SET nombre=?, telefono=?, email=?, direccion=?, notas=? WHERE id=?',
      [d.nombre, d.telefono, d.email, d.direccion, d.notas, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.runAsync('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

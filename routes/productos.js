const express = require('express');
const router = express.Router();
const db = require('../database/db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, `prod-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  try {
    const rows = await req.db.allAsync('SELECT id, nombre, descripcion, foto_path, precio_online, precio_local, created_at FROM productos ORDER BY nombre ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await req.db.getAsync('SELECT * FROM productos WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.datos = JSON.parse(row.datos || '{}');
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, datos, precio_online, precio_local } = req.body;
    const r = await req.db.runAsync(
      'INSERT INTO productos (nombre, descripcion, datos, precio_online, precio_local) VALUES (?,?,?,?,?)',
      [nombre || 'Sin nombre', descripcion || '', JSON.stringify(datos || {}), precio_online || 0, precio_local || 0]
    );
    res.json({ id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, descripcion, datos, precio_online, precio_local } = req.body;
    const existing = await req.db.getAsync('SELECT id FROM productos WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await req.db.runAsync(
      'UPDATE productos SET nombre=?, descripcion=?, datos=?, precio_online=?, precio_local=? WHERE id=?',
      [nombre || 'Sin nombre', descripcion || '', JSON.stringify(datos || {}), precio_online || 0, precio_local || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await req.db.getAsync('SELECT * FROM productos WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const nombre        = req.body.nombre        ?? existing.nombre;
    const descripcion   = req.body.descripcion   ?? existing.descripcion;
    const precio_online = req.body.precio_online ?? existing.precio_online;
    const precio_local  = req.body.precio_local  ?? existing.precio_local;
    await req.db.runAsync(
      'UPDATE productos SET nombre=?, descripcion=?, precio_online=?, precio_local=? WHERE id=?',
      [nombre, descripcion||'', precio_online||0, precio_local||0, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/foto', upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const existing = await req.db.getAsync('SELECT foto_path FROM productos WHERE id=?', [req.params.id]);
    if (existing?.foto_path) {
      const old = path.join(__dirname, '../public', existing.foto_path);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    const foto_path = `/uploads/${req.file.filename}`;
    await req.db.runAsync('UPDATE productos SET foto_path=? WHERE id=?', [foto_path, req.params.id]);
    res.json({ foto_path });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const row = await req.db.getAsync('SELECT foto_path FROM productos WHERE id=?', [req.params.id]);
    if (row?.foto_path) {
      const p = path.join(__dirname, '../public', row.foto_path);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    await req.db.runAsync('DELETE FROM productos WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

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
  try { res.json(await req.db.allAsync('SELECT * FROM consumibles_cnc ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const r = await req.db.runAsync('INSERT INTO consumibles_cnc (nombre,material,dimensiones,cantidad,unidad,costo_unitario,proveedor,notas) VALUES (?,?,?,?,?,?,?,?)',
      [d.nombre,d.material,d.dimensiones,d.cantidad||0,d.unidad||'pcs',d.costo_unitario||0,d.proveedor,d.notas]);
    res.json({id:r.lastID});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await req.db.runAsync('UPDATE consumibles_cnc SET nombre=?,material=?,dimensiones=?,cantidad=?,unidad=?,costo_unitario=?,proveedor=?,notas=? WHERE id=?',
      [d.nombre,d.material,d.dimensiones,d.cantidad,d.unidad,d.costo_unitario,d.proveedor,d.notas,req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', async (req, res) => {
  try { await req.db.runAsync('DELETE FROM consumibles_cnc WHERE id=?',[req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;

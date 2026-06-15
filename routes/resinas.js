const express = require('express');
const router = express.Router();
const db = require('../database/db');
router.get('/', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM resinas ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const r = await db.getAsync('SELECT * FROM resinas WHERE id=?',[req.params.id]);
    if(!r) return res.status(404).json({error:'Not found'});
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const r = await db.runAsync(
      'INSERT INTO resinas (marca,nombre_comercial,tipo,color,volumen_ml,volumen_actual_ml,costo_total,costo_por_ml,proveedor,notas) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [d.marca,d.nombre_comercial,d.tipo,d.color,d.volumen_ml||1000,d.volumen_actual_ml||d.volumen_ml||1000,d.costo_total||0,(d.costo_total||0)/(d.volumen_ml||1000),d.proveedor,d.notas]
    );
    res.json({id:r.lastID});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await db.runAsync(
      'UPDATE resinas SET marca=?,nombre_comercial=?,tipo=?,color=?,volumen_ml=?,volumen_actual_ml=?,costo_total=?,costo_por_ml=?,proveedor=?,notas=? WHERE id=?',
      [d.marca,d.nombre_comercial,d.tipo,d.color,d.volumen_ml,d.volumen_actual_ml,d.costo_total,(d.costo_total||0)/(d.volumen_ml||1000),d.proveedor,d.notas,req.params.id]
    );
    res.json({success:true});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', async (req, res) => {
  try { await db.runAsync('DELETE FROM resinas WHERE id=?',[req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

router.get('/', async (req, res) => {
  try { res.json(await req.db.allAsync('SELECT * FROM resinas ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const r = await req.db.getAsync('SELECT * FROM resinas WHERE id=?',[req.params.id]);
    if(!r) return res.status(404).json({error:'Not found'});
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/', async (req, res) => {
  try {
    // Plan limit check
    if (req.tenant?.plan) {
      const count = await req.db.getAsync('SELECT COUNT(*) as cnt FROM resinas');
      if (count.cnt >= req.tenant.plan.max_resinas) return res.status(400).json({ error: `Límite de ${req.tenant.plan.max_resinas} resinas alcanzado para tu plan` });
    }
    const d = req.body;
    const r = await req.db.runAsync(
      'INSERT INTO resinas (marca,nombre_comercial,tipo,color,volumen_ml,volumen_actual_ml,costo_total,costo_por_ml,proveedor,notas) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [d.marca,d.nombre_comercial,d.tipo,d.color,d.volumen_ml||1000,d.volumen_actual_ml||d.volumen_ml||1000,d.costo_total||0,(d.costo_total||0)/(d.volumen_ml||1000),d.proveedor,d.notas]
    );
    res.json({id:r.lastID});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await req.db.runAsync(
      'UPDATE resinas SET marca=?,nombre_comercial=?,tipo=?,color=?,volumen_ml=?,volumen_actual_ml=?,costo_total=?,costo_por_ml=?,proveedor=?,notas=? WHERE id=?',
      [d.marca,d.nombre_comercial,d.tipo,d.color,d.volumen_ml,d.volumen_actual_ml,d.costo_total,(d.costo_total||0)/(d.volumen_ml||1000),d.proveedor,d.notas,req.params.id]
    );
    res.json({success:true});
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', async (req, res) => {
  try { await req.db.runAsync('DELETE FROM resinas WHERE id=?',[req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;

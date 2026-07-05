const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

function getTable(tipo) {
  if (tipo === 'externos') return 'consumibles_externos';
  if (tipo === 'internos') return 'consumibles_internos';
  return null;
}

router.get('/:tipo', async (req, res) => {
  const t = getTable(req.params.tipo);
  if (!t) return res.status(400).json({ error: 'Tipo inválido' });
  try { res.json(await req.db.allAsync(`SELECT * FROM ${t} ORDER BY nombre`)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:tipo', async (req, res) => {
  const t = getTable(req.params.tipo);
  if (!t) return res.status(400).json({ error: 'Tipo inválido' });
  const d = req.body;
  try {
    const r = await req.db.runAsync(
      `INSERT INTO ${t} (nombre,categoria,cantidad,unidad,costo_unitario,stock_minimo,proveedor,notas) VALUES (?,?,?,?,?,?,?,?)`,
      [d.nombre, d.categoria||'', d.cantidad||0, d.unidad||'pcs', d.costo_unitario||0, d.stock_minimo||0, d.proveedor||'', d.notas||'']
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:tipo/:id', async (req, res) => {
  const t = getTable(req.params.tipo);
  if (!t) return res.status(400).json({ error: 'Tipo inválido' });
  const d = req.body;
  try {
    await req.db.runAsync(
      `UPDATE ${t} SET nombre=?,categoria=?,cantidad=?,unidad=?,costo_unitario=?,stock_minimo=?,proveedor=?,notas=? WHERE id=?`,
      [d.nombre, d.categoria||'', d.cantidad||0, d.unidad||'pcs', d.costo_unitario||0, d.stock_minimo||0, d.proveedor||'', d.notas||'', req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:tipo/:id', async (req, res) => {
  const t = getTable(req.params.tipo);
  if (!t) return res.status(400).json({ error: 'Tipo inválido' });
  try { await req.db.runAsync(`DELETE FROM ${t} WHERE id=?`, [req.params.id]); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

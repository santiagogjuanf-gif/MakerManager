const express = require('express');
const router = express.Router();
const db = require('../database/db');

// List gastos with optional filters
router.get('/gastos', async (req, res) => {
  try {
    const { mes, categoria } = req.query;
    let sql = 'SELECT * FROM gastos WHERE 1=1';
    const params = [];
    if (mes) { sql += ' AND strftime(\'%Y-%m\', fecha) = ?'; params.push(mes); }
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria); }
    sql += ' ORDER BY fecha DESC, id DESC';
    const rows = await db.allAsync(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/gastos', async (req, res) => {
  try {
    const { fecha, categoria, descripcion, monto, proveedor, referencia_tipo, referencia_id, notas } = req.body;
    const r = await db.runAsync(
      'INSERT INTO gastos (fecha, categoria, descripcion, monto, proveedor, referencia_tipo, referencia_id, notas) VALUES (?,?,?,?,?,?,?,?)',
      [fecha || new Date().toISOString().slice(0,10), categoria||'General', descripcion, monto||0, proveedor||null, referencia_tipo||null, referencia_id||null, notas||null]
    );
    res.json({ id: r.lastID, success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/gastos/:id', async (req, res) => {
  try {
    const { fecha, categoria, descripcion, monto, proveedor, notas } = req.body;
    await db.runAsync(
      'UPDATE gastos SET fecha=?, categoria=?, descripcion=?, monto=?, proveedor=?, notas=? WHERE id=?',
      [fecha, categoria, descripcion, monto, proveedor||null, notas||null, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/gastos/:id', async (req, res) => {
  try {
    await db.runAsync('DELETE FROM gastos WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Main summary: ingresos + gastos + charts data
router.get('/resumen', async (req, res) => {
  try {
    const cfgRows = await db.allAsync('SELECT key, value FROM config');
    const cfg = {};
    cfgRows.forEach(r => cfg[r.key] = r.value);

    const mes = req.query.mes || new Date().toISOString().slice(0,7);

    // Month ingresos (closed jobs)
    const ingMes = await db.getAsync(
      `SELECT COALESCE(SUM(precio_final),0) as total, COUNT(*) as cnt
       FROM print_jobs WHERE strftime('%Y-%m', fecha)=? AND estado='Cierre' AND fallo=0`,
      [mes]
    );

    // Month gastos
    const gastMes = await db.getAsync(
      `SELECT COALESCE(SUM(monto),0) as total, COUNT(*) as cnt FROM gastos WHERE strftime('%Y-%m', fecha)=?`,
      [mes]
    );

    // Gastos por categoría (current month)
    const gastCat = await db.allAsync(
      `SELECT categoria, COALESCE(SUM(monto),0) as total FROM gastos WHERE strftime('%Y-%m', fecha)=? GROUP BY categoria ORDER BY total DESC`,
      [mes]
    );

    // Last 6 months: ingresos + gastos
    const meses6 = await db.allAsync(`
      SELECT m.mes,
        COALESCE(i.ingresos, 0) as ingresos,
        COALESCE(g.gastos, 0) as gastos
      FROM (
        SELECT strftime('%Y-%m', date('now', n || ' months')) as mes
        FROM (SELECT 0 as n UNION SELECT -1 UNION SELECT -2 UNION SELECT -3 UNION SELECT -4 UNION SELECT -5)
      ) m
      LEFT JOIN (
        SELECT strftime('%Y-%m', fecha) as mes, SUM(precio_final) as ingresos
        FROM print_jobs WHERE estado='Cierre' AND fallo=0
        GROUP BY mes
      ) i ON i.mes = m.mes
      LEFT JOIN (
        SELECT strftime('%Y-%m', fecha) as mes, SUM(monto) as gastos
        FROM gastos GROUP BY mes
      ) g ON g.mes = m.mes
      ORDER BY m.mes ASC
    `);

    // Pending jobs value (in production/levantamiento)
    const pending = await db.getAsync(
      `SELECT COALESCE(SUM(precio_final),0) as total, COUNT(*) as cnt
       FROM print_jobs WHERE estado IN ('Solicitud','Levantamiento','Producción') AND fallo=0`
    );

    // Top gastos categories all-time
    const topCat = await db.allAsync(
      `SELECT categoria, SUM(monto) as total FROM gastos GROUP BY categoria ORDER BY total DESC LIMIT 6`
    );

    // Recent transactions (ingresos + gastos combined), current month
    const recentIng = await db.allAsync(
      `SELECT 'ingreso' as tipo, fecha, nombre_proyecto as descripcion, precio_final as monto, 'Trabajo' as categoria
       FROM print_jobs WHERE strftime('%Y-%m', fecha)=? AND estado='Cierre' AND fallo=0 ORDER BY fecha DESC LIMIT 20`,
      [mes]
    );
    const recentGast = await db.allAsync(
      `SELECT 'gasto' as tipo, fecha, descripcion, monto, categoria FROM gastos WHERE strftime('%Y-%m', fecha)=? ORDER BY fecha DESC LIMIT 20`,
      [mes]
    );
    const movimientos = [...recentIng, ...recentGast].sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,30);

    res.json({ mes, ingresos: ingMes, gastos: gastMes, gastCat, meses6, pending, topCat, movimientos, config: cfg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const cfgRows = await db.allAsync('SELECT key, value FROM config');
    const cfg = {};
    cfgRows.forEach(r => cfg[r.key] = r.value);

    const lowFilaments = await db.allAsync(
      'SELECT id, marca, nombre_comercial, color, material, peso_actual_g, peso_inicial_g FROM filaments WHERE peso_actual_g < 150 ORDER BY peso_actual_g ASC'
    );
    const recentJobs = await db.allAsync(`
      SELECT pj.id, pj.nombre_proyecto, pj.fecha, pj.precio_final, c.nombre as cliente_nombre
      FROM print_jobs pj LEFT JOIN clients c ON pj.cliente_id = c.id
      ORDER BY pj.created_at DESC LIMIT 10
    `);
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const monthStats = await db.getAsync(
      `SELECT COUNT(*) as total_jobs, SUM(precio_final) as total_ingresos
       FROM print_jobs WHERE fecha >= ? AND fallo = 0`, [firstDay]
    );
    const counts = await db.getAsync(`
      SELECT
        (SELECT COUNT(*) FROM filaments) as filaments,
        (SELECT COUNT(*) FROM clients) as clients,
        (SELECT COUNT(*) FROM print_jobs) as jobs,
        (SELECT COUNT(*) FROM printers) as printers
    `);
    res.json({ lowFilaments, recentJobs, monthStats, stats: counts, config: cfg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

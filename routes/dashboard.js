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
    const cfgRows = await req.db.allAsync('SELECT key, value FROM config');
    const cfg = {};
    cfgRows.forEach(r => cfg[r.key] = r.value);

    const lowFilaments = await req.db.allAsync(
      'SELECT id, marca, nombre_comercial, color, material, peso_actual_g, peso_inicial_g, color_hex, acabado FROM filaments WHERE peso_actual_g < 150 ORDER BY peso_actual_g ASC'
    );
    const recentJobs = await req.db.allAsync(`
      SELECT pj.id, pj.nombre_proyecto, pj.fecha, pj.precio_final, pj.estado, c.nombre as cliente_nombre
      FROM print_jobs pj LEFT JOIN clients c ON pj.cliente_id = c.id
      ORDER BY pj.created_at DESC LIMIT 10
    `);
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    const monthStats = await req.db.getAsync(
      `SELECT COUNT(*) as total_jobs, SUM(precio_final) as total_ingresos,
       COALESCE((SELECT SUM(jf.gramos_pieza) FROM job_filaments jf
         JOIN print_jobs pj2 ON jf.print_job_id = pj2.id
         WHERE pj2.fecha >= ? AND pj2.fallo = 0 AND pj2.estado = 'Cierre'), 0) as total_gramos
       FROM print_jobs WHERE fecha >= ? AND fallo = 0 AND estado = 'Cierre' AND (cobrado IS NULL OR cobrado=1)`, [firstDay, firstDay]
    );
    const counts = await req.db.getAsync(`
      SELECT
        (SELECT COUNT(*) FROM filaments) as filaments,
        (SELECT COUNT(*) FROM clients) as clients,
        (SELECT COUNT(*) FROM print_jobs) as jobs,
        (SELECT COUNT(*) FROM printers) as printers
    `);

    const jobsByStage = await req.db.allAsync(
      'SELECT estado, COUNT(*) as cnt FROM print_jobs GROUP BY estado'
    );

    const monthlyRevenue = await req.db.allAsync(`
      SELECT strftime('%Y-%m', fecha) as mes,
             COALESCE(SUM(precio_final), 0) as ingresos,
             COUNT(*) as pedidos
      FROM print_jobs
      WHERE fecha >= date('now', '-5 months', 'start of month')
        AND fallo = 0 AND estado = 'Cierre' AND (cobrado IS NULL OR cobrado=1)
      GROUP BY mes ORDER BY mes ASC
    `);

    const topFilaments = await req.db.allAsync(`
      SELECT f.id, f.marca, f.material, f.color, f.color_hex, f.acabado,
             SUM(jf.gramos_pieza) as total_gramos
      FROM job_filaments jf
      JOIN filaments f ON jf.filamento_id = f.id
      JOIN print_jobs pj ON jf.print_job_id = pj.id
      WHERE pj.fecha >= ? AND pj.fallo = 0
      GROUP BY jf.filamento_id
      ORDER BY total_gramos DESC LIMIT 5
    `, [firstDay]);

    res.json({ lowFilaments, recentJobs, monthStats, stats: counts, config: cfg, jobsByStage, monthlyRevenue, topFilaments });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const lowFilaments = await db.allAsync(
      'SELECT id, marca, nombre_comercial, color, material, peso_actual_g, peso_inicial_g FROM filaments WHERE peso_actual_g < 150 ORDER BY peso_actual_g ASC'
    );
    const recentJobs = await db.allAsync(`
      SELECT pj.id, pj.nombre_proyecto, pj.fecha, pj.precio_final_cad, pj.gramos_total, c.nombre as cliente_nombre
      FROM print_jobs pj LEFT JOIN clients c ON pj.cliente_id = c.id
      ORDER BY pj.created_at DESC LIMIT 5
    `);
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const monthStats = await db.getAsync(
      `SELECT COUNT(*) as total_jobs, SUM(precio_final_cad) as total_ingresos, SUM(gramos_total) as total_gramos
       FROM print_jobs WHERE fecha >= ? AND fallo = 0`, [firstDay]
    );
    const filamentCount = await db.getAsync('SELECT COUNT(*) as count FROM filaments');
    const clientCount = await db.getAsync('SELECT COUNT(*) as count FROM clients');
    const jobCount = await db.getAsync('SELECT COUNT(*) as count FROM print_jobs');
    res.json({
      lowFilaments,
      recentJobs,
      monthStats,
      stats: { filaments: filamentCount.count, clients: clientCount.count, jobs: jobCount.count }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

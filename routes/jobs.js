const express = require('express');
const router = express.Router();
const db = require('../database/db');

async function getConfig() {
  const rows = await db.allAsync('SELECT key, value FROM config');
  const cfg = {};
  rows.forEach(r => cfg[r.key] = parseFloat(r.value) || r.value);
  return cfg;
}

function calcCosts(job, printer, filament, extras, cfg) {
  const horas = (job.tiempo_impresion_min || 0) / 60;
  const kwh = ((printer.consumo_promedio_watts || 0) / 1000) * horas;
  const costo_luz = kwh * (parseFloat(printer.costo_kwh_cad) || parseFloat(cfg.costo_kwh) || 0);
  const costo_filamento = (job.gramos_total || 0) * (filament.costo_por_gramo || 0);
  const costo_maquina = horas * (printer.costo_por_hora || 0);
  const minutos_mano = (job.tiempo_preparacion_min || 0) + (job.tiempo_postproceso_min || 0) + (job.tiempo_diseno_min || 0);
  const mano_obra = (minutos_mano / 60) * (parseFloat(cfg.tarifa_hora) || 0);
  const extras_total = extras.reduce((s, e) => s + (e.costo_total || 0), 0);
  const costo_real = costo_filamento + costo_luz + costo_maquina + mano_obra + extras_total;
  const margen = parseFloat(cfg.margen_default) || 2.5;
  const precio_sugerido = costo_real * margen;
  return {
    costo_filamento: +costo_filamento.toFixed(4),
    costo_luz: +costo_luz.toFixed(4),
    costo_maquina: +costo_maquina.toFixed(4),
    mano_obra: +mano_obra.toFixed(4),
    extras_total: +extras_total.toFixed(4),
    costo_real: +costo_real.toFixed(4),
    precio_sugerido: +precio_sugerido.toFixed(4),
    horas_impresion: +horas.toFixed(2),
    kwh_usados: +kwh.toFixed(4),
    margen,
  };
}

router.get('/', async (req, res) => {
  try {
    const jobs = await db.allAsync(`
      SELECT pj.*, c.nombre as cliente_nombre, p.nombre as impresora_nombre,
             f.nombre_comercial as filamento_nombre, f.color as filamento_color
      FROM print_jobs pj
      LEFT JOIN clients c ON pj.cliente_id = c.id
      LEFT JOIN printers p ON pj.impresora_id = p.id
      LEFT JOIN filaments f ON pj.filamento_id = f.id
      ORDER BY pj.created_at DESC
    `);
    res.json(jobs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await db.getAsync(`
      SELECT pj.*, c.nombre as cliente_nombre, p.nombre as impresora_nombre, f.nombre_comercial as filamento_nombre
      FROM print_jobs pj
      LEFT JOIN clients c ON pj.cliente_id = c.id
      LEFT JOIN printers p ON pj.impresora_id = p.id
      LEFT JOIN filaments f ON pj.filamento_id = f.id
      WHERE pj.id = ?`, [req.params.id]
    );
    if (!job) return res.status(404).json({ error: 'Not found' });
    const extras = await db.allAsync('SELECT * FROM job_extras WHERE print_job_id = ?', [req.params.id]);
    res.json({ ...job, extras });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/cost', async (req, res) => {
  try {
    const job = await db.getAsync('SELECT * FROM print_jobs WHERE id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const printer = await db.getAsync('SELECT * FROM printers WHERE id = ?', [job.impresora_id]);
    const filament = await db.getAsync('SELECT * FROM filaments WHERE id = ?', [job.filamento_id]);
    const extras = await db.allAsync('SELECT * FROM job_extras WHERE print_job_id = ?', [req.params.id]);
    const cfg = await getConfig();
    if (!printer || !filament) return res.status(400).json({ error: 'Printer or filament not found' });
    res.json(calcCosts(job, printer, filament, extras, cfg));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const gramos_total = (parseFloat(d.gramos_pieza) || 0) + (parseFloat(d.gramos_purga) || 0) + (parseFloat(d.gramos_perdidos) || 0);
    const r = await db.runAsync(`
      INSERT INTO print_jobs (nombre_proyecto, cliente_id, fecha, impresora_id, filamento_id, material, color,
        gramos_pieza, gramos_purga, gramos_perdidos, gramos_total, tiempo_impresion_min,
        tiempo_preparacion_min, tiempo_postproceso_min, tiempo_diseno_min, fallo, notas, precio_final_cad)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.nombre_proyecto, d.cliente_id || null, d.fecha || new Date().toISOString().slice(0,10),
       d.impresora_id || null, d.filamento_id || null, d.material, d.color,
       d.gramos_pieza || 0, d.gramos_purga || 0, d.gramos_perdidos || 0, gramos_total,
       d.tiempo_impresion_min || 0, d.tiempo_preparacion_min || 0,
       d.tiempo_postproceso_min || 0, d.tiempo_diseno_min || 0,
       d.fallo ? 1 : 0, d.notas, d.precio_final_cad || null]
    );

    if (d.filamento_id && gramos_total > 0 && !d.fallo) {
      await db.runAsync(
        'UPDATE filaments SET peso_actual_g = MAX(0, peso_actual_g - ?) WHERE id = ?',
        [gramos_total, d.filamento_id]
      );
    }

    if (d.extras && Array.isArray(d.extras)) {
      for (const e of d.extras) {
        await db.runAsync(
          'INSERT INTO job_extras (print_job_id, nombre_extra, cantidad, costo_unitario, costo_total) VALUES (?, ?, ?, ?, ?)',
          [r.lastID, e.nombre_extra, e.cantidad, e.costo_unitario, e.costo_total || (e.cantidad * e.costo_unitario)]
        );
      }
    }

    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const old = await db.getAsync('SELECT * FROM print_jobs WHERE id = ?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Not found' });

    const gramos_total = (parseFloat(d.gramos_pieza) || 0) + (parseFloat(d.gramos_purga) || 0) + (parseFloat(d.gramos_perdidos) || 0);

    if (old.filamento_id && old.gramos_total > 0 && !old.fallo) {
      await db.runAsync('UPDATE filaments SET peso_actual_g = peso_actual_g + ? WHERE id = ?', [old.gramos_total, old.filamento_id]);
    }

    await db.runAsync(`
      UPDATE print_jobs SET nombre_proyecto=?, cliente_id=?, fecha=?, impresora_id=?, filamento_id=?, material=?, color=?,
      gramos_pieza=?, gramos_purga=?, gramos_perdidos=?, gramos_total=?, tiempo_impresion_min=?,
      tiempo_preparacion_min=?, tiempo_postproceso_min=?, tiempo_diseno_min=?, fallo=?, notas=?, precio_final_cad=?
      WHERE id=?`,
      [d.nombre_proyecto, d.cliente_id || null, d.fecha, d.impresora_id || null, d.filamento_id || null,
       d.material, d.color, d.gramos_pieza || 0, d.gramos_purga || 0, d.gramos_perdidos || 0, gramos_total,
       d.tiempo_impresion_min || 0, d.tiempo_preparacion_min || 0, d.tiempo_postproceso_min || 0,
       d.tiempo_diseno_min || 0, d.fallo ? 1 : 0, d.notas, d.precio_final_cad || null, req.params.id]
    );

    if (d.filamento_id && gramos_total > 0 && !d.fallo) {
      await db.runAsync('UPDATE filaments SET peso_actual_g = MAX(0, peso_actual_g - ?) WHERE id = ?', [gramos_total, d.filamento_id]);
    }

    await db.runAsync('DELETE FROM job_extras WHERE print_job_id = ?', [req.params.id]);
    if (d.extras && Array.isArray(d.extras)) {
      for (const e of d.extras) {
        await db.runAsync(
          'INSERT INTO job_extras (print_job_id, nombre_extra, cantidad, costo_unitario, costo_total) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, e.nombre_extra, e.cantidad, e.costo_unitario, e.costo_total || (e.cantidad * e.costo_unitario)]
        );
      }
    }

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const job = await db.getAsync('SELECT * FROM print_jobs WHERE id = ?', [req.params.id]);
    if (job && job.filamento_id && job.gramos_total > 0 && !job.fallo) {
      await db.runAsync('UPDATE filaments SET peso_actual_g = peso_actual_g + ? WHERE id = ?', [job.gramos_total, job.filamento_id]);
    }
    await db.runAsync('DELETE FROM print_jobs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/extras', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM job_extras WHERE print_job_id = ?', [req.params.id])); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/extras', async (req, res) => {
  try {
    const d = req.body;
    const r = await db.runAsync(
      'INSERT INTO job_extras (print_job_id, nombre_extra, cantidad, costo_unitario, costo_total) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, d.nombre_extra, d.cantidad, d.costo_unitario, d.costo_total || (d.cantidad * d.costo_unitario)]
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

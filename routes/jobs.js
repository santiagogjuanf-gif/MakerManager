const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { updateClassification } = require('./clients');

async function getConfig() {
  const rows = await db.allAsync('SELECT key, value FROM config');
  const cfg = {};
  rows.forEach(r => cfg[r.key] = r.value);
  return cfg;
}

async function calcJobCost(jobId) {
  const job = await db.getAsync('SELECT * FROM print_jobs WHERE id=?', [jobId]);
  if (!job) return null;
  const printer = job.impresora_id ? await db.getAsync('SELECT * FROM printers WHERE id=?', [job.impresora_id]) : null;
  const jobFilaments = await db.allAsync(`
    SELECT jf.gramos_pieza, f.costo_por_gramo, f.color, f.material, f.nombre_comercial
    FROM job_filaments jf JOIN filaments f ON jf.filamento_id = f.id
    WHERE jf.print_job_id=?`, [jobId]);
  const extras = await db.allAsync('SELECT * FROM job_extras WHERE print_job_id=?', [jobId]);
  const products = await db.allAsync('SELECT * FROM job_products WHERE print_job_id=?', [jobId]);
  const cfg = await getConfig();

  const horas = (job.tiempo_impresion_min || 0) / 60;
  const totalGramos = jobFilaments.reduce((s, f) => s + (f.gramos_pieza || 0), 0)
    + (job.gramos_purga || 0) + (job.gramos_perdidos || 0);
  const costo_filamento = jobFilaments.reduce((s, f) => s + (f.gramos_pieza * f.costo_por_gramo), 0);
  const kwh = printer ? ((printer.consumo_promedio_watts || 0) / 1000) * horas : 0;
  const costo_luz = kwh * (parseFloat(cfg.costo_kwh) || 0);
  const costo_maquina = printer ? horas * (printer.costo_por_hora || 0) : 0;
  const minMano = (job.tiempo_preparacion_min||0)+(job.tiempo_postproceso_min||0)+(job.tiempo_diseno_min||0);
  const mano_obra = (minMano/60) * (parseFloat(cfg.tarifa_hora)||0);
  const extras_total = extras.reduce((s,e) => s+(e.costo_total||0), 0);
  const costo_real = costo_filamento + costo_luz + costo_maquina + mano_obra + extras_total;

  const totalPiezas = products.reduce((s,p) => s+(p.cantidad||0), 0) || 1;
  const mu = parseFloat(cfg.margen_unitario)||3.0;
  const mm = parseFloat(cfg.margen_menudeo)||2.5;
  const mmay = parseFloat(cfg.margen_mayoreo)||1.8;

  return {
    costo_filamento: +costo_filamento.toFixed(4),
    costo_luz: +costo_luz.toFixed(4),
    costo_maquina: +costo_maquina.toFixed(4),
    mano_obra: +mano_obra.toFixed(4),
    extras_total: +extras_total.toFixed(4),
    costo_real: +costo_real.toFixed(4),
    precio_unitario: +(costo_real * mu).toFixed(4),
    precio_menudeo: +(costo_real * mm).toFixed(4),
    precio_mayoreo: +(costo_real * mmay).toFixed(4),
    horas_impresion: +horas.toFixed(2),
    kwh_usados: +kwh.toFixed(4),
    total_gramos: +totalGramos.toFixed(2),
    total_piezas: totalPiezas,
    filaments: jobFilaments,
    products,
    extras,
    config: { margen_unitario: mu, margen_menudeo: mm, margen_mayoreo: mmay,
              minimo_menudeo: parseInt(cfg.minimo_menudeo)||2,
              minimo_mayoreo: parseInt(cfg.minimo_mayoreo)||10 }
  };
}

router.get('/', async (req, res) => {
  try {
    const jobs = await db.allAsync(`
      SELECT pj.*, c.nombre as cliente_nombre, p.nombre as impresora_nombre,
        (SELECT COUNT(*) FROM job_camas WHERE print_job_id=pj.id) as camas_total,
        (SELECT COUNT(*) FROM job_camas WHERE print_job_id=pj.id AND completada=1) as camas_done
      FROM print_jobs pj
      LEFT JOIN clients c ON pj.cliente_id=c.id
      LEFT JOIN printers p ON pj.impresora_id=p.id
      WHERE (pj.archivado IS NULL OR pj.archivado = 0)
      ORDER BY pj.created_at DESC
    `);
    for (const j of jobs) {
      j.filaments = await db.allAsync(
        'SELECT jf.gramos_pieza, f.color, f.material FROM job_filaments jf JOIN filaments f ON jf.filamento_id=f.id WHERE jf.print_job_id=?', [j.id]);
      j.products = await db.allAsync('SELECT * FROM job_products WHERE print_job_id=?', [j.id]);
    }
    res.json(jobs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await db.getAsync(`
      SELECT pj.*, c.nombre as cliente_nombre, p.nombre as impresora_nombre
      FROM print_jobs pj
      LEFT JOIN clients c ON pj.cliente_id=c.id
      LEFT JOIN printers p ON pj.impresora_id=p.id
      WHERE pj.id=?`, [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Not found' });
    job.filaments = await db.allAsync(
      'SELECT jf.*, f.color, f.material, f.nombre_comercial, f.costo_por_gramo, f.marca FROM job_filaments jf JOIN filaments f ON jf.filamento_id=f.id WHERE jf.print_job_id=?', [req.params.id]);
    job.products = await db.allAsync('SELECT * FROM job_products WHERE print_job_id=?', [req.params.id]);
    job.extras = await db.allAsync('SELECT * FROM job_extras WHERE print_job_id=?', [req.params.id]);
    job.camas = await db.allAsync('SELECT * FROM job_camas WHERE print_job_id=? ORDER BY numero ASC', [req.params.id]);
    res.json(job);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/cost', async (req, res) => {
  try {
    const cost = await calcJobCost(req.params.id);
    if (!cost) return res.status(404).json({ error: 'Not found' });
    res.json(cost);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function saveJobData(jobId, d) {
  // Save filaments
  await db.runAsync('DELETE FROM job_filaments WHERE print_job_id=?', [jobId]);
  if (d.filaments && Array.isArray(d.filaments)) {
    for (const f of d.filaments) {
      if (!f.filamento_id) continue;
      await db.runAsync(
        'INSERT INTO job_filaments (print_job_id,filamento_id,gramos_pieza) VALUES (?,?,?)',
        [jobId, f.filamento_id, f.gramos_pieza || 0]
      );
    }
  }
  // Save products
  await db.runAsync('DELETE FROM job_products WHERE print_job_id=?', [jobId]);
  if (d.products && Array.isArray(d.products)) {
    for (const p of d.products) {
      if (!p.descripcion) continue;
      await db.runAsync(
        'INSERT INTO job_products (print_job_id,descripcion,cantidad) VALUES (?,?,?)',
        [jobId, p.descripcion, parseInt(p.cantidad)||1]
      );
    }
  }
  // Save extras
  await db.runAsync('DELETE FROM job_extras WHERE print_job_id=?', [jobId]);
  if (d.extras && Array.isArray(d.extras)) {
    for (const e of d.extras) {
      if (!e.nombre_extra) continue;
      await db.runAsync(
        'INSERT INTO job_extras (print_job_id,nombre_extra,cantidad,costo_unitario,costo_total) VALUES (?,?,?,?,?)',
        [jobId, e.nombre_extra, e.cantidad||1, e.costo_unitario||0, e.costo_total||(e.cantidad*e.costo_unitario)||0]
      );
    }
  }
  // Save camas (print beds)
  if (d.camas && Array.isArray(d.camas)) {
    await db.runAsync('DELETE FROM job_camas WHERE print_job_id=?', [jobId]);
    for (const c of d.camas) {
      await db.runAsync(
        'INSERT INTO job_camas (print_job_id,numero,descripcion,tiempo_min,completada) VALUES (?,?,?,?,?)',
        [jobId, c.numero||1, c.descripcion||'', parseInt(c.tiempo_min)||60, c.completada?1:0]
      );
    }
  }
}

async function deductInventory(d, sign = -1) {
  if (!d.filaments || d.fallo) return;
  for (const f of d.filaments) {
    if (f.filamento_id && f.gramos_pieza > 0) {
      await db.runAsync(
        'UPDATE filaments SET peso_actual_g = MAX(0, peso_actual_g + ?) WHERE id=?',
        [sign * f.gramos_pieza, f.filamento_id]
      );
    }
  }
  // purga + perdidos on first filament
  if (d.filaments.length > 0 && d.filaments[0].filamento_id) {
    const extra = (parseFloat(d.gramos_purga)||0) + (parseFloat(d.gramos_perdidos)||0);
    if (extra > 0) {
      await db.runAsync('UPDATE filaments SET peso_actual_g = MAX(0, peso_actual_g + ?) WHERE id=?',
        [sign * extra, d.filaments[0].filamento_id]);
    }
  }
}

router.patch('/:id/camas/:camaId', async (req, res) => {
  try {
    const cama = await db.getAsync('SELECT * FROM job_camas WHERE id=? AND print_job_id=?', [req.params.camaId, req.params.id]);
    if (!cama) return res.status(404).json({ error: 'Not found' });
    const completada = cama.completada ? 0 : 1;
    await db.runAsync(
      'UPDATE job_camas SET completada=?, completada_at=? WHERE id=?',
      [completada, completada ? new Date().toISOString().slice(0,10) : null, req.params.camaId]
    );
    res.json({ success: true, completada });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const r = await db.runAsync(
      `INSERT INTO print_jobs (nombre_proyecto,cliente_id,fecha,descripcion,estado,levantamiento_datos,cotizacion_id,precio_final,tipo_precio,tiempo_impresion_min,tiempo_diseno_min)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [d.nombre_proyecto, d.cliente_id||null, d.fecha||new Date().toISOString().slice(0,10),
       d.descripcion||null, d.estado||'Solicitud',
       d.levantamiento_datos ? JSON.stringify(d.levantamiento_datos) : null,
       d.cotizacion_id||null,
       d.precio_final||null, d.tipo_precio||'unitario',
       d.tiempo_impresion_min||0, d.tiempo_diseno_min||0]
    );
    if (d.cliente_id) {
      await db.runAsync('UPDATE clients SET total_pedidos = total_pedidos + 1 WHERE id=?', [d.cliente_id]);
      await updateClassification(d.cliente_id);
    }
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const old = await db.getAsync('SELECT * FROM print_jobs WHERE id=?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Not found' });
    const oldFilaments = await db.allAsync('SELECT * FROM job_filaments WHERE print_job_id=?', [req.params.id]);

    // Merge: only fields explicitly sent in the body overwrite the existing record (partial-stage saves)
    const merged = { ...old, ...d };

    // Restore old inventory before re-deducting with the merged filament list
    await deductInventory({ filaments: oldFilaments.map(f=>({filamento_id:f.filamento_id,gramos_pieza:f.gramos_pieza})), gramos_purga: old.gramos_purga, gramos_perdidos: old.gramos_perdidos, fallo: old.fallo }, +1);
    // Restore printer hours
    if (old.impresora_id && old.tiempo_impresion_min > 0) {
      await db.runAsync('UPDATE printers SET horas_acumuladas = MAX(0, horas_acumuladas - ?) WHERE id=?',
        [old.tiempo_impresion_min/60, old.impresora_id]);
    }

    await db.runAsync(
      `UPDATE print_jobs SET nombre_proyecto=?,cliente_id=?,fecha=?,descripcion=?,estado=?,impresora_id=?,gramos_purga=?,gramos_perdidos=?,tiempo_impresion_min=?,tiempo_preparacion_min=?,tiempo_postproceso_min=?,tiempo_diseno_min=?,fallo=?,notas=?,notas_produccion=?,precio_unitario=?,precio_menudeo=?,precio_mayoreo=?,precio_final=?,tipo_precio=?,requiere_factura=?,levantamiento_datos=?,cotizacion_id=? WHERE id=?`,
      [merged.nombre_proyecto, merged.cliente_id||null, merged.fecha, merged.descripcion||null, merged.estado||'Solicitud', merged.impresora_id||null,
       merged.gramos_purga||0, merged.gramos_perdidos||0,
       merged.tiempo_impresion_min||0, merged.tiempo_preparacion_min||0,
       merged.tiempo_postproceso_min||0, merged.tiempo_diseno_min||0,
       merged.fallo?1:0, merged.notas, merged.notas_produccion,
       merged.precio_unitario||null, merged.precio_menudeo||null, merged.precio_mayoreo||null,
       merged.precio_final||null, merged.tipo_precio||'menudeo', merged.requiere_factura?1:0,
       d.levantamiento_datos !== undefined
         ? (d.levantamiento_datos ? JSON.stringify(d.levantamiento_datos) : null)
         : old.levantamiento_datos,
       merged.cotizacion_id||null, req.params.id]
    );
    if (d.filaments !== undefined || d.products !== undefined || d.extras !== undefined) {
      await saveJobData(req.params.id, d);
    }
    await deductInventory({ ...merged, filaments: d.filaments !== undefined ? d.filaments : oldFilaments.map(f=>({filamento_id:f.filamento_id,gramos_pieza:f.gramos_pieza})) }, -1);
    if (merged.impresora_id && merged.tiempo_impresion_min > 0) {
      await db.runAsync('UPDATE printers SET horas_acumuladas = horas_acumuladas + ? WHERE id=?',
        [merged.tiempo_impresion_min/60, merged.impresora_id]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const job = await db.getAsync('SELECT * FROM print_jobs WHERE id=?', [req.params.id]);
    if (job) {
      const filaments = await db.allAsync('SELECT * FROM job_filaments WHERE print_job_id=?', [req.params.id]);
      await deductInventory({ filaments: filaments.map(f=>({filamento_id:f.filamento_id,gramos_pieza:f.gramos_pieza})), gramos_purga: job.gramos_purga, gramos_perdidos: job.gramos_perdidos, fallo: job.fallo }, +1);
      if (job.impresora_id && job.tiempo_impresion_min > 0) {
        await db.runAsync('UPDATE printers SET horas_acumuladas = MAX(0, horas_acumuladas - ?) WHERE id=?',
          [job.tiempo_impresion_min/60, job.impresora_id]);
      }
      if (job.cliente_id) {
        await db.runAsync('UPDATE clients SET total_pedidos = MAX(0, total_pedidos - 1) WHERE id=?', [job.cliente_id]);
        await updateClassification(job.cliente_id);
      }
      // Soft-delete: keep record for revenue history, just hide from tablero
      await db.runAsync('UPDATE print_jobs SET archivado=1, archivado_at=? WHERE id=?',
        [new Date().toISOString().slice(0,10), req.params.id]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.calcJobCost = calcJobCost;

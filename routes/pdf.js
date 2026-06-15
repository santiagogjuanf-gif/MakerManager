const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const db = require('../database/db');

router.get('/:id', async (req, res) => {
  try {
    const job = await db.getAsync(`
      SELECT pj.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.email as cliente_email,
             p.nombre as impresora_nombre, p.consumo_promedio_watts, p.costo_por_hora, p.costo_kwh_cad,
             f.nombre_comercial as filamento_nombre, f.costo_por_gramo, f.material as filamento_material, f.color as filamento_color
      FROM print_jobs pj
      LEFT JOIN clients c ON pj.cliente_id = c.id
      LEFT JOIN printers p ON pj.impresora_id = p.id
      LEFT JOIN filaments f ON pj.filamento_id = f.id
      WHERE pj.id = ?`, [req.params.id]
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const extras = await db.allAsync('SELECT * FROM job_extras WHERE print_job_id = ?', [req.params.id]);
    const cfgRows = await db.allAsync('SELECT key, value FROM config');
    const cfg = {};
    cfgRows.forEach(r => cfg[r.key] = r.value);

    const horas = (job.tiempo_impresion_min || 0) / 60;
    const kwh = ((job.consumo_promedio_watts || 0) / 1000) * horas;
    const costo_luz = kwh * (parseFloat(job.costo_kwh_cad) || parseFloat(cfg.costo_kwh) || 0);
    const costo_filamento = (job.gramos_total || 0) * (job.costo_por_gramo || 0);
    const costo_maquina = horas * (job.costo_por_hora || 0);
    const minutos_mano = (job.tiempo_preparacion_min || 0) + (job.tiempo_postproceso_min || 0) + (job.tiempo_diseno_min || 0);
    const mano_obra = (minutos_mano / 60) * (parseFloat(cfg.tarifa_hora) || 0);
    const extras_total = extras.reduce((s, e) => s + (e.costo_total || 0), 0);
    const costo_real = costo_filamento + costo_luz + costo_maquina + mano_obra + extras_total;
    const tax = parseFloat(cfg.tax_rate) || 0;
    const impuesto = costo_real * tax;
    const total = job.precio_final_cad || (costo_real + impuesto);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${job.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(24).fillColor('#6c63ff').text(cfg.nombre_negocio || 'MakerManager', 50, 50);
    doc.fontSize(10).fillColor('#999').text('Cotización / Ticket de Trabajo', 50, 82);
    doc.fontSize(10).fillColor('#555').text(`Cotización #${job.id}`, 400, 50, { align: 'right' });
    doc.text(`Fecha: ${job.fecha}`, 400, 65, { align: 'right' });

    doc.moveTo(50, 100).lineTo(550, 100).strokeColor('#ddd').lineWidth(1).stroke();

    // Client & Project info
    let y = 115;
    doc.fontSize(11).fillColor('#333').text(`Cliente: ${job.cliente_nombre || 'Sin cliente'}`, 50, y);
    if (job.cliente_telefono) { y += 15; doc.fontSize(10).fillColor('#666').text(`Tel: ${job.cliente_telefono}`, 50, y); }
    y += 20;
    doc.fontSize(14).fillColor('#6c63ff').text(job.nombre_proyecto, 50, y);
    y += 18;
    doc.fontSize(10).fillColor('#555');
    doc.text(`Material: ${job.material || job.filamento_material || '-'}   Color: ${job.color || job.filamento_color || '-'}   Impresora: ${job.impresora_nombre || '-'}`, 50, y);
    y += 15;
    doc.text(`Filamento: ${job.filamento_nombre || '-'}`, 50, y);

    y += 20;
    doc.moveTo(50, y).lineTo(550, y).strokeColor('#eee').stroke();
    y += 12;

    // Time & material summary
    doc.fontSize(11).fillColor('#333').text('Detalle de producción', 50, y); y += 16;
    doc.fontSize(9).fillColor('#666');
    doc.text(`Tiempo impresión: ${job.tiempo_impresion_min}min (${horas.toFixed(2)}h)`, 60, y); y += 13;
    doc.text(`Preparación: ${job.tiempo_preparacion_min}min  |  Post-proceso: ${job.tiempo_postproceso_min}min  |  Diseño: ${job.tiempo_diseno_min}min`, 60, y); y += 13;
    doc.text(`Gramos: Pieza ${job.gramos_pieza}g + Purga ${job.gramos_purga}g + Pérdidas ${job.gramos_perdidos}g = Total ${job.gramos_total}g`, 60, y); y += 18;

    doc.moveTo(50, y).lineTo(550, y).strokeColor('#eee').stroke(); y += 12;

    // Cost breakdown
    doc.fontSize(11).fillColor('#333').text('Desglose de costos', 50, y); y += 16;
    doc.fontSize(9).fillColor('#555');

    const costRow = (label, value) => {
      doc.text(label, 60, y);
      doc.text(`$${parseFloat(value || 0).toFixed(2)} CAD`, 400, y, { width: 150, align: 'right' });
      y += 14;
    };

    costRow('Filamento', costo_filamento);
    costRow('Electricidad', costo_luz);
    costRow('Desgaste de máquina', costo_maquina);
    costRow('Mano de obra', mano_obra);

    if (extras.length > 0) {
      doc.text('Extras:', 60, y); y += 13;
      for (const e of extras) {
        doc.text(`  ${e.nombre_extra} ×${e.cantidad}`, 70, y);
        doc.text(`$${parseFloat(e.costo_total || 0).toFixed(2)} CAD`, 400, y, { width: 150, align: 'right' });
        y += 12;
      }
    }

    y += 5;
    doc.moveTo(50, y).lineTo(550, y).strokeColor('#999').lineWidth(1).stroke(); y += 10;

    doc.fontSize(10).fillColor('#333');
    doc.text('Subtotal (costo real)', 60, y);
    doc.text(`$${costo_real.toFixed(2)} CAD`, 400, y, { width: 150, align: 'right' });
    y += 16;

    if (tax > 0) {
      doc.text(`Impuesto (${(tax * 100).toFixed(0)}%)`, 60, y);
      doc.text(`$${impuesto.toFixed(2)} CAD`, 400, y, { width: 150, align: 'right' });
      y += 16;
    }

    doc.moveTo(50, y).lineTo(550, y).strokeColor('#6c63ff').lineWidth(2).stroke(); y += 10;
    doc.fontSize(14).fillColor('#6c63ff');
    doc.text('TOTAL', 60, y);
    doc.text(`$${total.toFixed(2)} CAD`, 400, y, { width: 150, align: 'right' });
    y += 30;

    if (job.notas) {
      doc.fontSize(9).fillColor('#888').text(`Notas: ${job.notas}`, 50, y);
    }

    doc.fontSize(8).fillColor('#bbb').text('Generado con MakerManager · Sistema de costos de impresión 3D', 50, 770, { align: 'center', width: 500 });
    doc.end();
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

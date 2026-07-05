const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { calcJobCost } = require('./jobs');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

router.get('/:id', async (req, res) => {
  try {
    const tipo = req.query.tipo || 'cliente'; // 'cliente' or 'interno'
    const job = await req.db.getAsync(`
      SELECT pj.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
             p.nombre as impresora_nombre
      FROM print_jobs pj
      LEFT JOIN clients c ON pj.cliente_id=c.id
      LEFT JOIN printers p ON pj.impresora_id=p.id
      WHERE pj.id=?`, [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Not found' });

    const cost = await calcJobCost(req.params.id, req.db);
    const cfgRows = await req.db.allAsync('SELECT key, value FROM config');
    const cfg = {};
    cfgRows.forEach(r => cfg[r.key] = r.value);

    const sym = cfg.simbolo_moneda || '$';
    const moneda = cfg.moneda || 'CAD';
    const fmt = (v) => `${sym}${parseFloat(v||0).toFixed(2)} ${moneda}`;
    const tax = parseFloat(cfg.tax_rate)||0;
    const precioBase = job.precio_final || cost.precio_menudeo || 0;
    const impuesto = job.requiere_factura ? precioBase * tax : 0;
    const total = precioBase + impuesto;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}-trabajo-${job.id}.pdf"`);
    doc.pipe(res);

    // Logo
    const logoPath = cfg.logo_path ? path.join(__dirname, '../public', cfg.logo_path) : null;
    let headerX = 50;
    if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 60 });
      headerX = 125;
    }

    // Header
    doc.fontSize(20).fillColor('#6c63ff').text(cfg.nombre_negocio || 'MakerManager', headerX, 50);
    doc.fontSize(9).fillColor('#888');
    if (cfg.telefono) doc.text(`Tel: ${cfg.telefono}`, headerX, 74);
    if (cfg.direccion) doc.text(cfg.direccion, headerX, cfg.telefono ? 86 : 74);
    doc.text(`Folio #${job.id} · ${job.fecha}`, 400, 50, { align: 'right' });

    doc.moveTo(50, 115).lineTo(550, 115).strokeColor('#ddd').lineWidth(1).stroke();

    let y = 128;
    doc.fontSize(10).fillColor('#333').text(`Cliente: ${job.cliente_nombre || 'General'}`, 50, y);
    if (job.cliente_telefono) doc.text(`Tel: ${job.cliente_telefono}`, 300, y);
    y += 20;
    doc.fontSize(14).fillColor('#6c63ff').text(job.nombre_proyecto, 50, y);
    y += 22;

    doc.moveTo(50, y).lineTo(550, y).strokeColor('#eee').stroke(); y += 12;

    doc.fontSize(10).fillColor('#333').text('Descripción', 50, y);
    doc.text('Cant.', 380, y); doc.text('Precio', 440, y); doc.text('Total', 490, y);
    y += 14;
    doc.moveTo(50,y).lineTo(550,y).strokeColor('#ddd').stroke(); y += 8;

    doc.fontSize(9).fillColor('#555');
    for (const p of (cost.products || [])) {
      const unitPrice = precioBase / Math.max(1, cost.total_piezas);
      const lineTotal = unitPrice * p.cantidad;
      doc.text(p.descripcion, 55, y);
      doc.text(String(p.cantidad), 385, y);
      doc.text(fmt(unitPrice), 435, y);
      doc.text(fmt(lineTotal), 485, y);
      y += 14;
    }

    if (tipo === 'cliente' && cost.extras && cost.extras.length > 0) {
      for (const e of cost.extras) {
        doc.text(`  + ${e.nombre_extra}`, 55, y);
        doc.text(String(e.cantidad), 385, y);
        doc.text(fmt(e.costo_unitario), 435, y);
        doc.text(fmt(e.costo_total), 485, y);
        y += 13;
      }
    }

    y += 6;
    doc.moveTo(50,y).lineTo(550,y).strokeColor('#999').lineWidth(1).stroke(); y += 10;

    if (tipo === 'interno') {
      doc.fontSize(10).fillColor('#333').text('Desglose de costos (interno)', 50, y); y += 16;
      doc.fontSize(9).fillColor('#555');
      const rows = [
        ['Filamento', cost.costo_filamento],
        ['Electricidad', cost.costo_luz],
        ['Desgaste máquina', cost.costo_maquina],
        ['Mano de obra', cost.mano_obra],
        ['Extras', cost.extras_total],
      ];
      for (const [label, val] of rows) {
        doc.text(label, 60, y); doc.text(fmt(val), 450, y, {align:'right',width:100}); y+=13;
      }
      doc.moveTo(50,y).lineTo(550,y).strokeColor('#999').stroke(); y+=8;
      doc.fontSize(10).text('Costo real', 60, y); doc.text(fmt(cost.costo_real), 450, y, {align:'right',width:100}); y+=14;
      doc.text(`Precio unitario (×${cfg.margen_unitario})`, 60, y); doc.text(fmt(cost.precio_unitario), 450, y, {align:'right',width:100}); y+=14;
      doc.text(`Precio menudeo (×${cfg.margen_menudeo})`, 60, y); doc.text(fmt(cost.precio_menudeo), 450, y, {align:'right',width:100}); y+=14;
      doc.text(`Precio mayoreo (×${cfg.margen_mayoreo})`, 60, y); doc.text(fmt(cost.precio_mayoreo), 450, y, {align:'right',width:100}); y+=14;
      doc.moveTo(50,y).lineTo(550,y).strokeColor('#6c63ff').lineWidth(2).stroke(); y+=10;
      doc.fontSize(13).fillColor('#6c63ff').text('PRECIO FINAL', 60, y);
      doc.text(fmt(job.precio_final), 450, y, {align:'right',width:100}); y+=30;
    } else {
      doc.fontSize(10).fillColor('#333');
      doc.text('Subtotal', 350, y); doc.text(fmt(precioBase), 450, y, {align:'right',width:100}); y+=14;
      if (job.requiere_factura && tax > 0) {
        doc.text(`IVA (${(tax*100).toFixed(0)}%)`, 350, y); doc.text(fmt(impuesto), 450, y, {align:'right',width:100}); y+=14;
      }
      doc.moveTo(300,y).lineTo(550,y).strokeColor('#6c63ff').lineWidth(2).stroke(); y+=10;
      doc.fontSize(14).fillColor('#6c63ff').text('TOTAL', 350, y);
      doc.text(fmt(total), 450, y, {align:'right',width:100}); y+=30;
    }

    if (job.notas) { doc.fontSize(9).fillColor('#888').text(`Notas: ${job.notas}`, 50, y); y+=16; }

    if (tipo === 'cliente' && cfg.terminos_condiciones) {
      y += 10;
      doc.moveTo(50,y).lineTo(550,y).strokeColor('#eee').stroke(); y+=10;
      doc.fontSize(8).fillColor('#aaa').text('Términos y condiciones:', 50, y); y+=11;
      doc.fontSize(7.5).fillColor('#bbb').text(cfg.terminos_condiciones, 50, y, {width:500,lineGap:2});
    }

    doc.fontSize(7.5).fillColor('#ccc').text('Generado con MakerManager', 50, 810, {align:'center',width:500});
    doc.end();
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database/db');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, `printer-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  try { res.json(await db.allAsync('SELECT * FROM printers ORDER BY created_at DESC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.getAsync('SELECT * FROM printers WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function buildPrinterParams(d) {
  const cph = d.costo_compra && d.horas_acumuladas > 0
    ? (parseFloat(d.costo_compra) / Math.max(1, parseFloat(d.horas_acumuladas) * 10))
    : 0;
  return [
    d.nombre, d.marca, d.modelo, d.tipo || 'FDM',
    d.costo_compra || 0, d.fecha_compra,
    d.consumo_promedio_watts || 120, cph,
    d.tiene_ams ? 1 : 0, d.ubicacion, d.estado || 'Activa',
    d.horas_acumuladas || 0, d.foto_path || null,
    d.area_trabajo, d.potencia_laser_w, d.tipo_laser, d.tipo_resina,
    d.fuente_luz, d.velocidad_max_mm, d.husillo_w,
    d.materiales_compatibles, d.notas
  ];
}

router.post('/', upload.single('foto'), async (req, res) => {
  try {
    const d = req.body;
    if (req.file) d.foto_path = `/uploads/${req.file.filename}`;
    const params = buildPrinterParams(d);
    const r = await db.runAsync(
      `INSERT INTO printers (nombre,marca,modelo,tipo,costo_compra,fecha_compra,consumo_promedio_watts,costo_por_hora,tiene_ams,ubicacion,estado,horas_acumuladas,foto_path,area_trabajo,potencia_laser_w,tipo_laser,tipo_resina,fuente_luz,velocidad_max_mm,husillo_w,materiales_compatibles,notas)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, params
    );
    res.json({ id: r.lastID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', upload.single('foto'), async (req, res) => {
  try {
    const d = req.body;
    if (req.file) d.foto_path = `/uploads/${req.file.filename}`;
    else {
      const existing = await db.getAsync('SELECT foto_path FROM printers WHERE id=?', [req.params.id]);
      d.foto_path = existing?.foto_path || null;
    }
    const params = [...buildPrinterParams(d), req.params.id];
    await db.runAsync(
      `UPDATE printers SET nombre=?,marca=?,modelo=?,tipo=?,costo_compra=?,fecha_compra=?,consumo_promedio_watts=?,costo_por_hora=?,tiene_ams=?,ubicacion=?,estado=?,horas_acumuladas=?,foto_path=?,area_trabajo=?,potencia_laser_w=?,tipo_laser=?,tipo_resina=?,fuente_luz=?,velocidad_max_mm=?,husillo_w=?,materiales_compatibles=?,notas=? WHERE id=?`, params
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const printer = await db.getAsync('SELECT tipo FROM printers WHERE id=?', [req.params.id]);
    if (!printer) return res.status(404).json({ error: 'Not found' });
    if (req.query.delete_inventory === 'true') {
      if (printer.tipo === 'FDM') await db.runAsync('DELETE FROM filaments');
      else if (printer.tipo === 'Resina') await db.runAsync('DELETE FROM resinas');
      else if (printer.tipo === 'Laser') await db.runAsync('DELETE FROM consumibles_laser');
      else if (printer.tipo === 'CNC') await db.runAsync('DELETE FROM consumibles_cnc');
    }
    await db.runAsync('DELETE FROM printers WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database/db');
const https = require('https');
const http = require('http');

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
    d.materiales_compatibles, d.notas,
    d.octoprint_url || null, d.octoprint_apikey || null, d.monitor_type || 'octoprint'
  ];
}

// Proxy OctoPrint / Bambu status (avoids CORS from browser)
router.get('/:id/live', async (req, res) => {
  try {
    const printer = await db.getAsync('SELECT * FROM printers WHERE id=?', [req.params.id]);
    if (!printer) return res.status(404).json({ error: 'Not found' });
    if (!printer.octoprint_url || !printer.octoprint_apikey) {
      return res.json({ configured: false });
    }

    const baseUrl = printer.octoprint_url.replace(/\/$/, '');
    const apiKey = printer.octoprint_apikey;

    const fetchOcto = (path) => new Promise((resolve, reject) => {
      const url = new URL(baseUrl + path);
      const mod = url.protocol === 'https:' ? https : http;
      const opts = {
        hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search, method: 'GET',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: 5000,
      };
      const r = mod.request(opts, (resp) => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => {
          try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: resp.statusCode, body: {} }); }
        });
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
      r.end();
    });

    const [printerResp, jobResp] = await Promise.all([
      fetchOcto('/api/printer').catch(() => null),
      fetchOcto('/api/job').catch(() => null),
    ]);

    const result = { configured: true, online: false, printer: null, job: null };

    if (printerResp && printerResp.status === 200) {
      result.online = true;
      const p = printerResp.body;
      result.printer = {
        state: p.state?.text || 'Unknown',
        flags: p.state?.flags || {},
        tool0: p.temperature?.tool0 || null,
        tool1: p.temperature?.tool1 || null,
        bed: p.temperature?.bed || null,
        chamber: p.temperature?.chamber || null,
      };
    } else if (printerResp && printerResp.status === 409) {
      result.online = true;
      result.printer = { state: 'Offline', flags: {} };
    }

    if (jobResp && jobResp.status === 200) {
      const j = jobResp.body;
      result.job = {
        file: j.job?.file?.name || null,
        progress: j.progress?.completion || 0,
        printTime: j.progress?.printTime || 0,
        printTimeLeft: j.progress?.printTimeLeft || null,
        state: j.state || 'Unknown',
      };
    }

    res.json(result);
  } catch (e) {
    res.json({ configured: true, online: false, error: e.message });
  }
});

router.post('/', upload.single('foto'), async (req, res) => {
  try {
    const d = req.body;
    if (req.file) d.foto_path = `/uploads/${req.file.filename}`;
    const params = buildPrinterParams(d);
    const r = await db.runAsync(
      `INSERT INTO printers (nombre,marca,modelo,tipo,costo_compra,fecha_compra,consumo_promedio_watts,costo_por_hora,tiene_ams,ubicacion,estado,horas_acumuladas,foto_path,area_trabajo,potencia_laser_w,tipo_laser,tipo_resina,fuente_luz,velocidad_max_mm,husillo_w,materiales_compatibles,notas,octoprint_url,octoprint_apikey,monitor_type)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, params
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
      `UPDATE printers SET nombre=?,marca=?,modelo=?,tipo=?,costo_compra=?,fecha_compra=?,consumo_promedio_watts=?,costo_por_hora=?,tiene_ams=?,ubicacion=?,estado=?,horas_acumuladas=?,foto_path=?,area_trabajo=?,potencia_laser_w=?,tipo_laser=?,tipo_resina=?,fuente_luz=?,velocidad_max_mm=?,husillo_w=?,materiales_compatibles=?,notas=?,octoprint_url=?,octoprint_apikey=?,monitor_type=? WHERE id=?`, params
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

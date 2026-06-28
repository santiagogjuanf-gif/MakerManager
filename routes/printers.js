const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database/db');
const https = require('https');
const http = require('http');
const mqtt = require('mqtt');

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
    d.octoprint_url || null, d.octoprint_apikey || null,
    d.monitor_type || 'none',
    d.bambu_ip || null, d.bambu_serial || null, d.bambu_access_code || null,
  ];
}

// ── OctoPrint helper ──────────────────────────────────────────────────────────
function fetchOctoPrint(baseUrl, apiKey) {
  const fetchOne = (urlPath) => new Promise((resolve, reject) => {
    const url = new URL(baseUrl.replace(/\/$/, '') + urlPath);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: { 'X-Api-Key': apiKey },
      timeout: 5000,
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: resp.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });

  return Promise.all([
    fetchOne('/api/printer').catch(() => null),
    fetchOne('/api/job').catch(() => null),
  ]).then(([pr, jr]) => {
    const result = { configured: true, source: 'octoprint', online: false, printer: null, job: null };
    if (pr && pr.status === 200) {
      result.online = true;
      result.printer = {
        state: pr.body.state?.text || 'Unknown',
        tool0: pr.body.temperature?.tool0 || null,
        bed:   pr.body.temperature?.bed   || null,
        chamber: pr.body.temperature?.chamber || null,
      };
    } else if (pr && pr.status === 409) {
      result.online = true;
      result.printer = { state: 'Printer offline' };
    }
    if (jr && jr.status === 200) {
      result.job = {
        file:          jr.body.job?.file?.name || null,
        progress:      jr.body.progress?.completion || 0,
        printTimeLeft: jr.body.progress?.printTimeLeft || null,
        state:         jr.body.state || 'Unknown',
      };
    }
    return result;
  });
}

// ── Bambu Lab MQTT helper ─────────────────────────────────────────────────────
function fetchBambu(ip, serial, accessCode) {
  return new Promise((resolve) => {
    const TIMEOUT = 8000;
    let done = false;
    const finish = (data) => { if (done) return; done = true; try { client.end(true); } catch {} resolve(data); };

    const client = mqtt.connect(`mqtts://${ip}:8883`, {
      username: 'bblp',
      password: accessCode,
      clientId: `mm_${Date.now()}`,
      rejectUnauthorized: false, // Bambu uses self-signed cert on LAN
      connectTimeout: 5000,
      reconnectPeriod: 0,
    });

    const timer = setTimeout(() => finish({ configured: true, source: 'bambu', online: false, error: 'timeout' }), TIMEOUT);

    client.on('error', () => {
      clearTimeout(timer);
      finish({ configured: true, source: 'bambu', online: false, error: 'connection refused' });
    });

    client.on('connect', () => {
      client.subscribe(`device/${serial}/report`, (err) => {
        if (err) { clearTimeout(timer); return finish({ configured: true, source: 'bambu', online: false, error: 'subscribe failed' }); }
        // Request full status push
        client.publish(`device/${serial}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
      });
    });

    client.on('message', (_topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString());
        const p = msg.print;
        if (!p) return;

        clearTimeout(timer);

        const stateMap = { IDLE: 'Libre', RUNNING: 'Imprimiendo', PAUSE: 'Pausado', FINISH: 'Terminado', FAILED: 'Error', PREPARE: 'Preparando' };
        const gcodeState = p.gcode_state || 'IDLE';

        // AMS slots
        let ams = null;
        if (p.ams && p.ams.ams && p.ams.ams.length > 0) {
          ams = p.ams.ams[0].tray?.map(t => ({
            id: t.id, color: t.tray_color ? `#${t.tray_color.substring(0,6)}` : null,
            material: t.tray_type || '-', remain: t.remain ?? null,
          })) || [];
        }

        finish({
          configured: true, source: 'bambu', online: true,
          printer: {
            state: stateMap[gcodeState] || gcodeState,
            gcodeState,
            tool0: p.nozzle_temper != null ? { actual: p.nozzle_temper, target: p.nozzle_target_temper || 0 } : null,
            bed:   p.bed_temper   != null ? { actual: p.bed_temper,    target: p.bed_target_temper    || 0 } : null,
            chamber: p.chamber_temper != null ? { actual: p.chamber_temper, target: 0 } : null,
            layer: p.layer_num != null ? { current: p.layer_num, total: p.total_layer_num } : null,
            spd_lvl: p.spd_lvl,
          },
          job: {
            file:          p.subtask_name || p.task_name || null,
            progress:      p.mc_percent   || 0,
            printTimeLeft: p.mc_remaining_time != null ? p.mc_remaining_time * 60 : null, // convert min→sec
            state:         stateMap[gcodeState] || gcodeState,
          },
          ams,
        });
      } catch { /* ignore malformed messages */ }
    });
  });
}

// ── Live status proxy endpoint ────────────────────────────────────────────────
router.get('/:id/live', async (req, res) => {
  try {
    const printer = await db.getAsync('SELECT * FROM printers WHERE id=?', [req.params.id]);
    if (!printer) return res.status(404).json({ error: 'Not found' });

    const type = printer.monitor_type || 'none';

    if (type === 'octoprint' && printer.octoprint_url && printer.octoprint_apikey) {
      const data = await fetchOctoPrint(printer.octoprint_url, printer.octoprint_apikey).catch(e => ({ configured: true, online: false, error: e.message }));
      return res.json(data);
    }

    if (type === 'bambu' && printer.bambu_ip && printer.bambu_serial && printer.bambu_access_code) {
      const data = await fetchBambu(printer.bambu_ip, printer.bambu_serial, printer.bambu_access_code).catch(e => ({ configured: true, source: 'bambu', online: false, error: e.message }));
      return res.json(data);
    }

    res.json({ configured: false });
  } catch (e) {
    res.json({ configured: false, error: e.message });
  }
});

router.post('/', upload.single('foto'), async (req, res) => {
  try {
    const d = req.body;
    if (req.file) d.foto_path = `/uploads/${req.file.filename}`;
    const params = buildPrinterParams(d);
    const r = await db.runAsync(
      `INSERT INTO printers (nombre,marca,modelo,tipo,costo_compra,fecha_compra,consumo_promedio_watts,costo_por_hora,tiene_ams,ubicacion,estado,horas_acumuladas,foto_path,area_trabajo,potencia_laser_w,tipo_laser,tipo_resina,fuente_luz,velocidad_max_mm,husillo_w,materiales_compatibles,notas,octoprint_url,octoprint_apikey,monitor_type,bambu_ip,bambu_serial,bambu_access_code)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, params
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
      `UPDATE printers SET nombre=?,marca=?,modelo=?,tipo=?,costo_compra=?,fecha_compra=?,consumo_promedio_watts=?,costo_por_hora=?,tiene_ams=?,ubicacion=?,estado=?,horas_acumuladas=?,foto_path=?,area_trabajo=?,potencia_laser_w=?,tipo_laser=?,tipo_resina=?,fuente_luz=?,velocidad_max_mm=?,husillo_w=?,materiales_compatibles=?,notas=?,octoprint_url=?,octoprint_apikey=?,monitor_type=?,bambu_ip=?,bambu_serial=?,bambu_access_code=? WHERE id=?`, params
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

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, `logo-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  try {
    const rows = await req.db.allAsync('SELECT key, value FROM config');
    const cfg = {};
    rows.forEach(r => cfg[r.key] = r.value);
    res.json(cfg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await req.db.runAsync('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const logoPath = `/uploads/${req.file.filename}`;
    await req.db.runAsync('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['logo_path', logoPath]);
    res.json({ logo_path: logoPath });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const rows = await db.allAsync('SELECT key, value FROM config');
    const config = {};
    rows.forEach(r => config[r.key] = r.value);
    res.json(config);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await db.runAsync('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, String(value)]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.delete('/:id', async (req, res) => {
  try {
    await db.runAsync('DELETE FROM job_extras WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

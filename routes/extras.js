const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Multi-tenant DB selector
router.use((req, res, next) => {
  req.db = (req.tenant && req.tenantDb) ? req.tenantDb : require('../database/db');
  next();
});

router.delete('/:id', async (req, res) => {
  try { await req.db.runAsync('DELETE FROM job_extras WHERE id=?',[req.params.id]); res.json({success:true}); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;

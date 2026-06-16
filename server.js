const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database/db');

fs.mkdirSync(path.join(__dirname, 'public/uploads'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/filaments', require('./routes/filaments'));
app.use('/api/resinas', require('./routes/resinas'));
app.use('/api/laser', require('./routes/laser'));
app.use('/api/cnc', require('./routes/cnc'));
app.use('/api/printers', require('./routes/printers'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/extras', require('./routes/extras'));
app.use('/api/config', require('./routes/config'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consumibles', require('./routes/consumibles'));

app.post('/api/seed', async (req, res) => {
  try {
    delete require.cache[require.resolve('./database/seed')];
    await require('./database/seed')();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reset', async (req, res) => {
  try {
    const tables = ['job_extras','job_products','job_filaments','print_jobs','filaments','resinas','consumibles_laser','consumibles_cnc','printers','clients'];
    for (const t of tables) await db.runAsync(`DELETE FROM ${t}`);
    await db.runAsync(`DELETE FROM sqlite_sequence WHERE name IN (${tables.map(()=>'?').join(',')})`, tables);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

db.ready.then(() => {
  app.listen(PORT, () => console.log(`MakerManager v2.0 → http://localhost:${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });

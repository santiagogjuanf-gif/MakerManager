const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/filaments', require('./routes/filaments'));
app.use('/api/printers', require('./routes/printers'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/extras', require('./routes/extras'));
app.use('/api/config', require('./routes/config'));
app.use('/api/pdf', require('./routes/pdf'));

app.post('/api/seed', (req, res) => {
  try {
    require('./database/seed');
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MakerManager running at http://localhost:${PORT}`);
});

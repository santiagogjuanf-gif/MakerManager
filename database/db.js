const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'makermanager.db');
const db = new sqlite3.Database(DB_PATH);

// Promise wrappers
db.runAsync = (sql, params = []) => new Promise((res, rej) => {
  db.run(sql, params, function(err) { if (err) rej(err); else res({ lastID: this.lastID, changes: this.changes }); });
});
db.getAsync = (sql, params = []) => new Promise((res, rej) => {
  db.get(sql, params, (err, row) => { if (err) rej(err); else res(row); });
});
db.allAsync = (sql, params = []) => new Promise((res, rej) => {
  db.all(sql, params, (err, rows) => { if (err) rej(err); else res(rows); });
});

// Initialize schema and defaults
async function init() {
  await db.runAsync('PRAGMA foreign_keys = ON');
  await db.runAsync('PRAGMA journal_mode = WAL');

  const schema = `
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT,
      nombre_comercial TEXT,
      material TEXT DEFAULT 'PLA',
      color TEXT,
      acabado TEXT DEFAULT 'Mate',
      diametro_mm REAL DEFAULT 1.75,
      peso_inicial_g REAL DEFAULT 1000,
      peso_actual_g REAL DEFAULT 1000,
      peso_bobina_vacia_g REAL DEFAULT 200,
      costo_total_cad REAL DEFAULT 0,
      costo_por_gramo REAL DEFAULT 0,
      fecha_compra TEXT,
      proveedor TEXT,
      tiene_rfid INTEGER DEFAULT 0,
      tiene_nfc INTEGER DEFAULT 0,
      uid_nfc TEXT,
      notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      modelo TEXT,
      costo_compra_cad REAL DEFAULT 0,
      fecha_compra TEXT,
      vida_util_horas REAL DEFAULT 1500,
      costo_por_hora REAL DEFAULT 0,
      consumo_promedio_watts REAL DEFAULT 120,
      costo_kwh_cad REAL DEFAULT 0.18,
      notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_proyecto TEXT NOT NULL,
      cliente_id INTEGER REFERENCES clients(id),
      fecha TEXT DEFAULT CURRENT_DATE,
      impresora_id INTEGER REFERENCES printers(id),
      filamento_id INTEGER REFERENCES filaments(id),
      material TEXT,
      color TEXT,
      gramos_pieza REAL DEFAULT 0,
      gramos_purga REAL DEFAULT 0,
      gramos_perdidos REAL DEFAULT 0,
      gramos_total REAL DEFAULT 0,
      tiempo_impresion_min REAL DEFAULT 0,
      tiempo_preparacion_min REAL DEFAULT 0,
      tiempo_postproceso_min REAL DEFAULT 0,
      tiempo_diseno_min REAL DEFAULT 0,
      fallo INTEGER DEFAULT 0,
      notas TEXT,
      precio_final_cad REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS job_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_job_id INTEGER REFERENCES print_jobs(id) ON DELETE CASCADE,
      nombre_extra TEXT,
      cantidad REAL DEFAULT 1,
      costo_unitario REAL DEFAULT 0,
      costo_total REAL DEFAULT 0
    );
  `;

  for (const stmt of schema.split(';').map(s => s.trim()).filter(s => s)) {
    await db.runAsync(stmt);
  }

  const defaults = {
    nombre_negocio: 'MakerManager Studio',
    moneda: 'CAD',
    tax_rate: '0.13',
    costo_kwh: '0.18',
    tarifa_hora: '25.00',
    margen_default: '2.5',
    vida_util_impresora_horas: '1500',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.runAsync('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', [key, value]);
  }
}

db.ready = init();

module.exports = db;

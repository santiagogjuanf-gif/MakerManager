const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'makermanager.db');
const db = new sqlite3.Database(DB_PATH);

db.runAsync = (sql, params = []) => new Promise((res, rej) => {
  db.run(sql, params, function(err) { if (err) rej(err); else res({ lastID: this.lastID, changes: this.changes }); });
});
db.getAsync = (sql, params = []) => new Promise((res, rej) => {
  db.get(sql, params, (err, row) => { if (err) rej(err); else res(row); });
});
db.allAsync = (sql, params = []) => new Promise((res, rej) => {
  db.all(sql, params, (err, rows) => { if (err) rej(err); else res(rows); });
});

async function init() {
  await db.runAsync('PRAGMA foreign_keys = ON');
  await db.runAsync('PRAGMA journal_mode = WAL');

  const tables = [
    `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`,

    `CREATE TABLE IF NOT EXISTS filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT, nombre_comercial TEXT,
      material TEXT DEFAULT 'PLA', color TEXT, acabado TEXT DEFAULT 'Mate',
      diametro_mm REAL DEFAULT 1.75,
      peso_inicial_g REAL DEFAULT 1000, peso_actual_g REAL DEFAULT 1000,
      peso_bobina_vacia_g REAL DEFAULT 200,
      costo_total REAL DEFAULT 0, costo_por_gramo REAL DEFAULT 0,
      proveedor TEXT, tiene_nfc INTEGER DEFAULT 0, uid_nfc TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS resinas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca TEXT, nombre_comercial TEXT,
      tipo TEXT DEFAULT 'Estándar', color TEXT,
      volumen_ml REAL DEFAULT 1000, volumen_actual_ml REAL DEFAULT 1000,
      costo_total REAL DEFAULT 0, costo_por_ml REAL DEFAULT 0,
      proveedor TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS consumibles_laser (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT, material TEXT, dimensiones TEXT,
      cantidad REAL DEFAULT 0, unidad TEXT DEFAULT 'pcs',
      costo_unitario REAL DEFAULT 0, proveedor TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS consumibles_cnc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT, material TEXT, dimensiones TEXT,
      cantidad REAL DEFAULT 0, unidad TEXT DEFAULT 'pcs',
      costo_unitario REAL DEFAULT 0, proveedor TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT, marca TEXT, modelo TEXT,
      tipo TEXT DEFAULT 'FDM',
      costo_compra REAL DEFAULT 0, fecha_compra TEXT,
      consumo_promedio_watts REAL DEFAULT 120,
      costo_por_hora REAL DEFAULT 0,
      tiene_ams INTEGER DEFAULT 0,
      ubicacion TEXT, estado TEXT DEFAULT 'Activa',
      horas_acumuladas REAL DEFAULT 0,
      foto_path TEXT,
      area_trabajo TEXT, potencia_laser_w REAL,
      tipo_laser TEXT, tipo_resina TEXT,
      fuente_luz TEXT, velocidad_max_mm REAL, husillo_w REAL,
      materiales_compatibles TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, telefono TEXT, email TEXT, direccion TEXT,
      clasificacion TEXT DEFAULT 'Nuevo',
      clasificacion_manual INTEGER DEFAULT 0,
      total_pedidos INTEGER DEFAULT 0,
      notas TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_proyecto TEXT NOT NULL,
      cliente_id INTEGER REFERENCES clients(id),
      fecha TEXT DEFAULT CURRENT_DATE,
      descripcion TEXT,
      estado TEXT DEFAULT 'Solicitud',
      impresora_id INTEGER REFERENCES printers(id),
      gramos_purga REAL DEFAULT 0, gramos_perdidos REAL DEFAULT 0,
      tiempo_impresion_min REAL DEFAULT 0,
      tiempo_preparacion_min REAL DEFAULT 0,
      tiempo_postproceso_min REAL DEFAULT 0,
      tiempo_diseno_min REAL DEFAULT 0,
      fallo INTEGER DEFAULT 0, notas TEXT, notas_produccion TEXT,
      precio_unitario REAL, precio_menudeo REAL, precio_mayoreo REAL,
      precio_final REAL, tipo_precio TEXT DEFAULT 'menudeo',
      requiere_factura INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS job_filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_job_id INTEGER REFERENCES print_jobs(id) ON DELETE CASCADE,
      filamento_id INTEGER REFERENCES filaments(id),
      gramos_pieza REAL DEFAULT 0)`,

    `CREATE TABLE IF NOT EXISTS job_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_job_id INTEGER REFERENCES print_jobs(id) ON DELETE CASCADE,
      descripcion TEXT, cantidad INTEGER DEFAULT 1)`,

    `CREATE TABLE IF NOT EXISTS job_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_job_id INTEGER REFERENCES print_jobs(id) ON DELETE CASCADE,
      nombre_extra TEXT, cantidad REAL DEFAULT 1,
      costo_unitario REAL DEFAULT 0, costo_total REAL DEFAULT 0)`,

    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'worker',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS consumibles_externos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, categoria TEXT,
      cantidad REAL DEFAULT 0, unidad TEXT DEFAULT 'pcs',
      costo_unitario REAL DEFAULT 0, stock_minimo REAL DEFAULT 0,
      proveedor TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS consumibles_internos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, categoria TEXT,
      cantidad REAL DEFAULT 0, unidad TEXT DEFAULT 'pcs',
      costo_unitario REAL DEFAULT 0, stock_minimo REAL DEFAULT 0,
      proveedor TEXT, notas TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,

    `CREATE TABLE IF NOT EXISTS filament_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_id INTEGER REFERENCES filaments(id) ON DELETE CASCADE,
      fecha TEXT DEFAULT CURRENT_TIMESTAMP,
      peso_anterior REAL,
      peso_nuevo REAL,
      nota TEXT)`,
  ];

  for (const sql of tables) await db.runAsync(sql);

  // Migrate older databases that already had print_jobs without these columns
  const jobColumns = ['descripcion TEXT', "estado TEXT DEFAULT 'Solicitud'", 'notas_produccion TEXT'];
  for (const colDef of jobColumns) {
    try { await db.runAsync(`ALTER TABLE print_jobs ADD COLUMN ${colDef}`); } catch (e) { /* column already exists */ }
  }

  // Migrate filaments table with new columns
  const filColumns = [
    "tipo_bobina TEXT DEFAULT 'Bobina completa'",
    'color_hex TEXT',
    "estado TEXT DEFAULT 'En uso'",
  ];
  for (const colDef of filColumns) {
    try { await db.runAsync(`ALTER TABLE filaments ADD COLUMN ${colDef}`); } catch (e) { /* column already exists */ }
  }

  // Fix costo_por_gramo: recalculate using peso_inicial_g directly (not minus spool weight)
  await db.runAsync(`
    UPDATE filaments SET costo_por_gramo = costo_total / peso_inicial_g
    WHERE costo_total > 0 AND peso_inicial_g > 0
  `);

  // Cotizaciones (saved calculator quotes)
  await db.runAsync(`CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    datos TEXT,
    precio_unitario REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  // Migrate printers table with live monitoring columns
  const printerColumns = [
    'octoprint_url TEXT', 'octoprint_apikey TEXT',
    "monitor_type TEXT DEFAULT 'none'",
    'bambu_ip TEXT', 'bambu_serial TEXT', 'bambu_access_code TEXT',
    'vida_util_horas INTEGER DEFAULT 3000',
  ];
  for (const colDef of printerColumns) {
    try { await db.runAsync(`ALTER TABLE printers ADD COLUMN ${colDef}`); } catch (e) { /* column already exists */ }
  }

  const defaults = {
    nombre_negocio: 'MakerManager Studio',
    telefono: '',
    direccion: '',
    moneda: 'CAD',
    simbolo_moneda: '$',
    tax_rate: '0.13',
    costo_kwh: '0.18',
    tarifa_hora: '25.00',
    margen_unitario: '2.2',
    margen_menudeo: '1.9',
    margen_mayoreo: '1.5',
    minimo_menudeo: '5',
    minimo_mayoreo: '10',
    nivel_nuevo: '1',
    nivel_regular: '3',
    nivel_frecuente: '7',
    nivel_vip: '15',
    logo_path: '',
    theme_color: 'morado',
    terminos_condiciones: 'Al recibir y aceptar el producto, el cliente confirma que está conforme con el trabajo realizado. Los productos cuentan con una garantía de 15 días naturales a partir de la fecha de entrega, aplicable únicamente a defectos de fabricación como mala fusión de capas o fallas estructurales del material. La garantía no cubre daños causados por mal uso, caídas, exposición al calor o negligencia del cliente. Cada caso será evaluado individualmente. Una vez aceptado el producto, no se aceptan devoluciones.',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.runAsync('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', [key, value]);
  }

  const bcrypt = require('bcryptjs');
  const userCount = await db.getAsync('SELECT COUNT(*) as cnt FROM users');
  if (userCount.cnt === 0) {
    const hash = await bcrypt.hash('admin', 10);
    await db.runAsync(
      'INSERT INTO users (username, display_name, password_hash, role) VALUES (?,?,?,?)',
      ['admin', 'Administrador', hash, 'admin']
    );
  }
}

db.ready = init();
module.exports = db;

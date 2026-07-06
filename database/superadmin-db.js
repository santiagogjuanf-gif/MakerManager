const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'superadmin.db');
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

  await db.runAsync(`CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    precio_mensual REAL DEFAULT 0,
    max_admins INTEGER DEFAULT 1,
    max_workers INTEGER DEFAULT 1,
    max_filamentos INTEGER DEFAULT 15,
    max_resinas INTEGER DEFAULT 5,
    max_clientes INTEGER DEFAULT 20,
    max_impresoras INTEGER DEFAULT 2,
    max_trabajos_activos INTEGER DEFAULT 10,
    feature_contabilidad INTEGER DEFAULT 0,
    feature_pdf INTEGER DEFAULT 0,
    feature_nfc INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.runAsync(`CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    nombre_negocio TEXT NOT NULL,
    email_contacto TEXT,
    plan_id INTEGER REFERENCES plans(id),
    estado TEXT DEFAULT 'trial',
    trial_inicio TEXT,
    trial_fin TEXT,
    fecha_activacion TEXT,
    fecha_vencimiento TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    notas_admin TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.runAsync(`CREATE TABLE IF NOT EXISTS superadmin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed plans
  const plans = [
    { nombre: 'Starter', slug: 'starter', precio_mensual: 5.99, max_admins: 1, max_workers: 1, max_filamentos: 15, max_resinas: 5, max_clientes: 20, max_impresoras: 2, max_trabajos_activos: 10, feature_contabilidad: 0, feature_pdf: 0, feature_nfc: 0 },
    { nombre: 'Pro', slug: 'pro', precio_mensual: 10.99, max_admins: 1, max_workers: 3, max_filamentos: 30, max_resinas: 15, max_clientes: 100, max_impresoras: 5, max_trabajos_activos: 50, feature_contabilidad: 1, feature_pdf: 1, feature_nfc: 1 },
    { nombre: 'Business', slug: 'business', precio_mensual: 19.99, max_admins: 2, max_workers: 10, max_filamentos: 100, max_resinas: 50, max_clientes: 9999, max_impresoras: 9999, max_trabajos_activos: 9999, feature_contabilidad: 1, feature_pdf: 1, feature_nfc: 1 },
  ];

  for (const p of plans) {
    await db.runAsync(
      `INSERT OR IGNORE INTO plans (nombre, slug, precio_mensual, max_admins, max_workers, max_filamentos, max_resinas, max_clientes, max_impresoras, max_trabajos_activos, feature_contabilidad, feature_pdf, feature_nfc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [p.nombre, p.slug, p.precio_mensual, p.max_admins, p.max_workers, p.max_filamentos, p.max_resinas, p.max_clientes, p.max_impresoras, p.max_trabajos_activos, p.feature_contabilidad, p.feature_pdf, p.feature_nfc]
    );
  }

  // Seed superadmin user — solo en primera instalación
  const existing = await db.getAsync('SELECT id FROM superadmin_users WHERE username=?', ['admin']);
  if (!existing) {
    const hash = await bcrypt.hash('admin', 10);
    await db.runAsync('INSERT OR IGNORE INTO superadmin_users (username, password_hash) VALUES (?,?)', ['admin', hash]);
    console.warn('[SECURITY] Se creó el usuario superadmin con contraseña por defecto "admin". Cámbiala inmediatamente en /superadmin → Cuenta.');
  }
}

db.ready = init();
module.exports = db;

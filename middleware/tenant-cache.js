const TTL_MS = 30 * 60 * 1000; // 30 minutos

const cache = new Map(); // slug → { db, expiresAt }

module.exports = {
  get(slug) {
    const entry = cache.get(slug);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      cache.delete(slug);
      return undefined;
    }
    return entry.db;
  },
  has(slug) {
    return this.get(slug) !== undefined;
  },
  set(slug, db) {
    cache.set(slug, { db, expiresAt: Date.now() + TTL_MS });
  },
  evict(slug) {
    const entry = cache.get(slug);
    if (entry && entry.db) {
      // Cerrar la conexión SQLite explícitamente para que el archivo se pueda borrar
      try { entry.db.close(); } catch(_) {}
    }
    cache.delete(slug);
  },
};

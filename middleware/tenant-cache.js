const tenantDbCache = new Map();

module.exports = {
  get: (slug) => tenantDbCache.get(slug),
  has: (slug) => tenantDbCache.has(slug),
  set: (slug, db) => tenantDbCache.set(slug, db),
  evict: (slug) => tenantDbCache.delete(slug),
};

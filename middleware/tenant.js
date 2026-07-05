const superadminDb = require('../database/superadmin-db');
const { initTenantDb } = require('../database/tenant-init');

// Cache: slug -> db instance
const tenantDbCache = new Map();

async function getTenantDb(slug) {
  if (tenantDbCache.has(slug)) return tenantDbCache.get(slug);
  const db = await initTenantDb(slug, 'admin', 'admin', 'Administrador');
  tenantDbCache.set(slug, db);
  return db;
}

async function tenantMiddleware(req, res, next) {
  let slug = null;
  const hostname = req.hostname || '';

  // Production: slug.makermanager.cerberusdev.pro (4+ parts)
  const parts = hostname.split('.');
  if (parts.length >= 4) {
    slug = parts[0];
  }

  // Development fallbacks
  if (!slug) {
    slug = req.headers['x-tenant-slug'] || req.query.tenant || null;
  }

  if (!slug) return next(); // no tenant context, continue normally

  try {
    await superadminDb.ready;
    const tenant = await superadminDb.getAsync(
      `SELECT t.*, p.nombre as plan_nombre, p.slug as plan_slug, p.precio_mensual,
              p.max_admins, p.max_workers, p.max_filamentos, p.max_resinas, p.max_clientes,
              p.max_impresoras, p.max_trabajos_activos, p.feature_contabilidad, p.feature_pdf, p.feature_nfc
       FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.slug = ?`,
      [slug]
    );

    if (!tenant) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>No encontrado</title><meta charset="UTF-8"></head><body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1>404</h1><p>Tenant no encontrado: ${slug}</p></body></html>`);
    }

    if (tenant.estado === 'cancelado') {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>No encontrado</title><meta charset="UTF-8"></head><body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1>Cuenta cancelada</h1><p>Esta cuenta ha sido cancelada.</p></body></html>`);
    }

    if (tenant.estado === 'suspendido') {
      return res.status(402).send(`<!DOCTYPE html><html><head><title>Cuenta suspendida</title><meta charset="UTF-8"></head><body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1 style="color:#f97316">&#9888;&#65039; Cuenta suspendida</h1><p>Tu cuenta ha sido suspendida. Contacta soporte.</p></body></html>`);
    }

    if (tenant.estado === 'trial' && tenant.trial_fin) {
      const now = new Date();
      const trialEnd = new Date(tenant.trial_fin);
      if (now > trialEnd) {
        await superadminDb.runAsync("UPDATE tenants SET estado='suspendido', updated_at=CURRENT_TIMESTAMP WHERE slug=?", [slug]);
        return res.status(402).send(`<!DOCTYPE html><html><head><title>Trial expirado</title><meta charset="UTF-8"></head><body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column"><h1 style="color:#f97316">&#9200;&#65039; Trial expirado</h1><p>Tu período de prueba ha terminado. Contacta soporte para activar tu cuenta.</p></body></html>`);
      }
    }

    // Build plan object
    const plan = tenant.plan_id ? {
      nombre: tenant.plan_nombre,
      slug: tenant.plan_slug,
      precio_mensual: tenant.precio_mensual,
      max_admins: tenant.max_admins,
      max_workers: tenant.max_workers,
      max_filamentos: tenant.max_filamentos,
      max_resinas: tenant.max_resinas,
      max_clientes: tenant.max_clientes,
      max_impresoras: tenant.max_impresoras,
      max_trabajos_activos: tenant.max_trabajos_activos,
      feature_contabilidad: !!tenant.feature_contabilidad,
      feature_pdf: !!tenant.feature_pdf,
      feature_nfc: !!tenant.feature_nfc,
    } : null;

    req.tenant = { id: tenant.id, slug, nombre_negocio: tenant.nombre_negocio, estado: tenant.estado, plan };
    req.tenantDb = await getTenantDb(slug);
    next();
  } catch(e) {
    console.error('Tenant middleware error:', e);
    next(e);
  }
}

module.exports = tenantMiddleware;

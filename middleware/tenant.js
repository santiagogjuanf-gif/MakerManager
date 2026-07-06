const superadminDb = require('../database/superadmin-db');
const { initTenantDb } = require('../database/tenant-init');

const tenantDbCache = new Map();

async function getTenantDb(slug) {
  if (tenantDbCache.has(slug)) return tenantDbCache.get(slug);
  const db = await initTenantDb(slug, 'admin', 'admin', 'Administrador');
  tenantDbCache.set(slug, db);
  return db;
}

function extractSlugFromPath(path) {
  const match = path.match(/^\/app\/([a-z0-9-]+)(\/|$)/);
  return match ? match[1] : null;
}

async function tenantMiddleware(req, res, next) {
  const slug = extractSlugFromPath(req.path);
  if (!slug) return next();

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
      return res.status(404).send(errorPage('Taller no encontrado', `No existe ningún taller con el nombre "${slug}".`));
    }
    if (tenant.estado === 'cancelado') {
      return res.status(404).send(errorPage('Cuenta cancelada', 'Esta cuenta ha sido cancelada.'));
    }
    if (tenant.estado === 'suspendido') {
      return res.status(402).send(errorPage('Cuenta suspendida', 'Tu cuenta está suspendida. Contacta a soporte.'));
    }
    if (tenant.estado === 'trial' && tenant.trial_fin) {
      if (new Date() > new Date(tenant.trial_fin)) {
        await superadminDb.runAsync("UPDATE tenants SET estado='suspendido', updated_at=CURRENT_TIMESTAMP WHERE slug=?", [slug]);
        return res.status(402).send(errorPage('Trial expirado', 'Tu período de prueba terminó. Contacta a soporte para activar tu cuenta.'));
      }
    }

    const plan = tenant.plan_id ? {
      nombre: tenant.plan_nombre,
      slug: tenant.plan_slug,
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

    req.tenantSlug = slug;
    req.tenant = { id: tenant.id, slug, nombre_negocio: tenant.nombre_negocio, estado: tenant.estado, plan };
    req.tenantDb = await getTenantDb(slug);
    next();
  } catch(e) {
    console.error('Tenant middleware error:', e);
    next(e);
  }
}

function errorPage(title, msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head>
  <body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px">
  <h1>${title}</h1><p style="color:#94a3b8">${msg}</p>
  <a href="/app" style="color:#7c3aed;margin-top:8px">← Volver</a>
  </body></html>`;
}

module.exports = tenantMiddleware;

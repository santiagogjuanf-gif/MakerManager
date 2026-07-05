async function createSubdomainDNS(slug) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID;

  console.log(`[Cloudflare] Intentando crear DNS para: ${slug}.makermanager.cerberusdev.pro`);
  console.log(`[Cloudflare] TOKEN: ${token ? token.slice(0,10) + '...' : 'NO DEFINIDO'}`);
  console.log(`[Cloudflare] ZONE_ID: ${zoneId || 'NO DEFINIDO'}`);
  console.log(`[Cloudflare] TUNNEL_ID: ${tunnelId || 'NO DEFINIDO'}`);

  if (token && zoneId) {
    const target = tunnelId ? `${tunnelId}.cfargotunnel.com` : `64a3df03-7796-4ed1-b1f9-f06b5a9cbe89.cfargotunnel.com`;
    console.log(`[Cloudflare] CNAME target: ${target}`);

    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CNAME', name: `${slug}.makermanager.cerberusdev.pro`, content: target, proxied: true, ttl: 1 })
    });
    const data = await resp.json();
    console.log(`[Cloudflare] Respuesta API:`, JSON.stringify(data).slice(0, 300));
    if (!data.success) throw new Error(JSON.stringify(data.errors));
    console.log(`[Cloudflare] CNAME creado exitosamente, id: ${data.result?.id}`);
    return { success: true, id: data.result?.id };
  }

  console.log(`[Cloudflare] Variables de entorno no definidas — modo simulado`);
  return { success: true, mock: true };
}

async function deleteSubdomainDNS(slug) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (token && zoneId) {
    const listResp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${slug}.makermanager.cerberusdev.pro`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listResp.json();
    if (listData.result?.length > 0) {
      const recordId = listData.result[0].id;
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`[Cloudflare] CNAME eliminado: ${slug}.makermanager.cerberusdev.pro`);
    }
    return { success: true };
  }
  console.log(`[Cloudflare] Eliminar CNAME (simulado): ${slug}.makermanager.cerberusdev.pro`);
  return { success: true, mock: true };
}

module.exports = { createSubdomainDNS, deleteSubdomainDNS };

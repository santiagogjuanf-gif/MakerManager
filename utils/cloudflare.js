async function createSubdomainDNS(slug) {
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID) {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CNAME', name: `${slug}.makermanager.cerberusdev.pro`, content: `${process.env.CLOUDFLARE_TUNNEL_ID}.cfargotunnel.com`, proxied: true, ttl: 1 })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(JSON.stringify(data.errors));
    return { success: true, id: data.result?.id };
  }
  console.log(`[Cloudflare] Crear CNAME: ${slug}.makermanager.cerberusdev.pro → tunnel`);
  return { success: true, mock: true };
}

async function deleteSubdomainDNS(slug) {
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID) {
    const listResp = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records?name=${slug}.makermanager.cerberusdev.pro`, {
      headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }
    });
    const listData = await listResp.json();
    if (listData.result?.length > 0) {
      const recordId = listData.result[0].id;
      await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }
      });
    }
    return { success: true };
  }
  console.log(`[Cloudflare] Eliminar CNAME: ${slug}.makermanager.cerberusdev.pro`);
  return { success: true, mock: true };
}

module.exports = { createSubdomainDNS, deleteSubdomainDNS };

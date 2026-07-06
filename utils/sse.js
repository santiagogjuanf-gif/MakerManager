// WebSocket-based broadcast registry, keyed by tenant slug.
// Replaces SSE — WebSockets work reliably through Cloudflare Tunnel.
const connections = new Map();

function subscribe(slug, ws) {
  if (!connections.has(slug)) connections.set(slug, new Set());
  connections.get(slug).add(ws);
}

function unsubscribe(slug, ws) {
  const set = connections.get(slug);
  if (!set) return;
  set.delete(ws);
  if (!set.size) connections.delete(slug);
}

function broadcast(slug, event, data) {
  const set = connections.get(slug);
  if (!set || !set.size) return;
  const msg = JSON.stringify({ event, data });
  for (const ws of set) {
    try {
      if (ws.readyState === 1 /* OPEN */) ws.send(msg);
    } catch(_) { set.delete(ws); }
  }
}

module.exports = { subscribe, unsubscribe, broadcast };

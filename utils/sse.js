// In-memory SSE connection registry, keyed by tenant slug
const connections = new Map();

function subscribe(slug, res) {
  if (!connections.has(slug)) connections.set(slug, new Set());
  connections.get(slug).add(res);
}

function unsubscribe(slug, res) {
  const set = connections.get(slug);
  if (!set) return;
  set.delete(res);
  if (!set.size) connections.delete(slug);
}

function broadcast(slug, event, data) {
  const set = connections.get(slug);
  if (!set || !set.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch(_) { set.delete(res); }
  }
}

module.exports = { subscribe, unsubscribe, broadcast };

// Upstash Redis REST subscriptions deliver published changes as an SSE stream.
// Only this authenticated server connection holds the database credential.
const CHANNEL = 'walkcards-visits';

function messageType(line) {
  if (!line.startsWith('data:')) return '';
  let value = line.slice(5).trim();
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') value = parsed;
    else if (typeof parsed?.result === 'string') value = parsed.result;
  } catch { /* Redis also sends unquoted SSE data. */ }
  if (value.startsWith(`subscribe,${CHANNEL},`)) return 'ready';
  if (value.startsWith(`message,${CHANNEL},`)) return 'change';
  return '';
}

async function stream(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Armazenamento não configurado.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let handshake = setTimeout(() => controller.abort(), 6000);
  const close = () => controller.abort();
  res.on('close', close);
  let reader;
  try {
    const upstream = await fetch(`${url.replace(/\/+$/, '')}/subscribe/${CHANNEL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: controller.signal, cache: 'no-store'
    });
    if (!upstream.ok || !upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('Conexão ao vivo indisponível.');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders?.();
    res.write('retry: 1000\n\n');
    reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        const event = messageType(line);
        if (event) {
          if (event === 'ready') { clearTimeout(handshake); handshake = null; }
          if (!res.destroyed) res.write(`event: ${event}\ndata: {}\n\n`);
        }
      }
      if (buffer.length > 65536) throw new Error('Evento inválido.');
    }
  } catch (error) {
    if (!res.headersSent) throw error;
    // EventSource reconnects automatically; the panel polls while disconnected.
  } finally {
    clearTimeout(timeout);
    clearTimeout(handshake);
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    res.off('close', close);
    if (res.headersSent && !res.destroyed) res.end();
  }
}

module.exports = { CHANNEL, messageType, stream };

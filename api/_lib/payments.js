const crypto = require('node:crypto');

const SETTINGS_KEY = 'walkcards:gateway-settings';
const ORDERS_KEY = 'walkcards:orders';
const LOCK_KEY = 'walkcards:store-write-lock';

async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Armazenamento não configurado.');
  const response = await fetch(url.replace(/\/+$/, ''), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(8000), cache: 'no-store'
  });
  if (!response.ok) throw new Error('Armazenamento indisponível.');
  const result = await response.json();
  if (result.error) throw new Error('Falha no armazenamento.');
  return result.result;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }));
}

function admin(req) {
  const secret = process.env.WALKCARDS_ADMIN_PASSWORD;
  const [expires, signature, extra] = (cookies(req).walkcards_admin || '').split('.');
  return Boolean(secret && !extra && /^\d+$/.test(expires || '') && Number(expires) > Date.now() / 1000
    && equal(signature, crypto.createHmac('sha256', secret).update(expires).digest('base64url')));
}

function csrf(req) {
  const token = req.headers['x-csrf-token'];
  return Boolean(token && equal(token, cookies(req).walkcards_csrf));
}

async function settings() {
  const raw = await redis(['GET', SETTINGS_KEY]);
  return { provider: 'blackcat', enabled: raw ? JSON.parse(raw).enabled === true : false };
}

async function blackcat(path, body) {
  const key = process.env.BLACKCAT_API_KEY;
  if (!key) throw new Error('Configure BLACKCAT_API_KEY no servidor.');
  const response = await fetch(`https://api.blackcatoficial.com/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok || result.success !== true || !result.data) {
    // Do not forward provider errors: they may contain credentials or customer data.
    throw new Error(response.status === 401 || response.status === 403
      ? 'A Blackcat recusou a chave. Confira a configuração no servidor.'
      : 'Não foi possível concluir a consulta à Blackcat.');
  }
  return result.data;
}

async function lock() {
  const token = crypto.randomUUID();
  if (await redis(['SET', LOCK_KEY, token, 'NX', 'EX', 90]) !== 'OK') return null;
  return token;
}

async function unlock(token) {
  await redis(['EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, LOCK_KEY, token]);
}

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const publicOrder = order => {
  const { paymentTokenHash, requestHash, ...visible } = order;
  return visible;
};

function validDocument(document) {
  if (!/^\d{11}$|^\d{14}$/.test(document) || /^(\d)\1+$/.test(document)) return false;
  const digits = document.split('').map(Number);
  const size = document.length === 11 ? 9 : 12;
  for (let offset = 0; offset < 2; offset++) {
    const length = size + offset;
    let sum = 0;
    for (let i = 0; i < length; i++) {
      const weight = size === 9 ? length + 1 - i : ((length - 1 - i) % 8) + 2;
      sum += digits[i] * weight;
    }
    const check = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (digits[length] !== check) return false;
  }
  return true;
}

async function reconcile(order) {
  const data = await blackcat(`/sales/${encodeURIComponent(order.payment.transactionId)}/status`);
  if (data.transactionId !== order.payment.transactionId || data.amount !== Math.round(order.amount * 100)
    || String(data.paymentMethod).toLowerCase() !== 'pix') throw new Error('Os dados da transação não correspondem ao pedido.');
  order.payment.status = data.status;
  if (data.status === 'PAID') {
    order.status = 'paid';
    order.paidAt = data.paidAt || new Date().toISOString();
    order.customerReportedPaid = false;
  }
  if (data.status === 'REFUNDED') order.status = 'refunded';
  if (data.status === 'CANCELLED' && order.status !== 'paid') {
    // The caller holds the store lock. Release inventory only on the first transition.
    if (order.status !== 'cancelled') {
      const products = JSON.parse(await redis(['GET', 'walkcards:products']) || '[]');
      for (const item of order.items || []) {
        const product = products.find(entry => entry.id === item.productId);
        if (product?.stockVerified === true && Number.isInteger(product.stock)) product.stock += item.quantity;
      }
      // Atomically persist stock and the transition so a retry cannot release inventory twice.
      order.status = 'cancelled';
      const orders = JSON.parse(await redis(['GET', ORDERS_KEY]) || '[]');
      const index = orders.findIndex(entry => entry.id === order.id);
      if (index < 0) throw new Error('Pedido não encontrado.');
      orders[index] = order;
      await redis(['EVAL', "redis.call('SET', KEYS[1], ARGV[1]); redis.call('SET', KEYS[2], ARGV[2]); return 1", 2,
        'walkcards:products', ORDERS_KEY, JSON.stringify(products), JSON.stringify(orders)]);
    }
    order.status = 'cancelled';
  }
  return order;
}

module.exports = { redis, json, admin, csrf, equal, settings, blackcat, lock, unlock, digest,
  publicOrder, validDocument, reconcile, SETTINGS_KEY, ORDERS_KEY };

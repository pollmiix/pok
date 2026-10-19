const crypto = require('node:crypto');

const AUTH_COOKIE = 'walkcards_admin';
const CSRF_COOKIE = 'walkcards_csrf';
const PRODUCTS_KEY = 'walkcards:products';
const ORDERS_KEY = 'walkcards:orders';
const INVENTORY_PRESET_KEY = 'walkcards:inventory-preset';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function authenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  const secret = process.env.WALKCARDS_ADMIN_PASSWORD || '';
  const cookie = cookies[AUTH_COOKIE] || '';
  if (!secret || !cookie) return false;
  const [expires, signature, extra] = cookie.split('.');
  if (extra !== undefined || !/^\d+$/.test(expires || '') || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', secret).update(String(expires)).digest('base64url');
  return safeEqual(signature, expected);
}

function csrfValid(req) {
  const cookies = parseCookies(req.headers.cookie);
  return safeEqual(req.headers['x-csrf-token'] || '', cookies[CSRF_COOKIE] || '');
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url: url.replace(/\/+$/, ''), token };
}

async function redisCommand(command) {
  const { url, token } = redisConfig();
  if (!url || !token) throw new Error('O armazenamento compartilhado ainda não foi configurado.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Falha no armazenamento compartilhado (${response.status}).`);
  const result = await response.json();
  if (result.error) throw new Error('Falha no armazenamento compartilhado.');
  return result.result;
}

async function readArray(key) {
  const stored = await redisCommand(['GET', key]);
  if (!stored) return null;
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error('Os dados compartilhados estão inválidos.');
  return parsed;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function createOrder(req, res) {
  const ip = cleanText(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown', 100).split(',')[0].trim();
  const rateKey = `walkcards:order-rate:${ip}`;
  const count = Number(await redisCommand(['INCR', rateKey]));
  if (count === 1) await redisCommand(['EXPIRE', rateKey, 60]);
  if (count > 12) return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const customer = cleanText(body.customer, 80);
  const email = cleanText(body.email, 120);
  const phone = cleanText(body.phone, 25);
  const delivery = body.delivery && typeof body.delivery === 'object' ? body.delivery : {};
  const postalCode = cleanText(delivery.postalCode, 8).replace(/\D/g, '');
  const address = {
    method: 'delivery', postalCode,
    street: cleanText(delivery.street, 120), number: cleanText(delivery.number, 20),
    complement: cleanText(delivery.complement, 120), neighborhood: cleanText(delivery.neighborhood, 80),
    city: cleanText(delivery.city, 80), state: cleanText(delivery.state, 2),
    recipient: cleanText(delivery.recipient, 80)
  };
  if (!customer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone
    || !/^\d{8}$/.test(postalCode) || !address.street || !address.number || !address.neighborhood
    || !address.city || !/^[A-Z]{2}$/.test(address.state) || !address.recipient) {
    return sendJson(res, 400, { error: 'Confira seus dados e o endereço de entrega.' });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
    return sendJson(res, 400, { error: 'O carrinho está inválido. Atualize a página e tente novamente.' });
  }

  const products = await readArray(PRODUCTS_KEY);
  if (!products) return sendJson(res, 503, { error: 'O catálogo compartilhado ainda está sendo configurado. Tente novamente mais tarde.' });
  const items = [];
  for (const requested of body.items) {
    const product = products.find((entry) => entry.id === requested.productId);
    const quantity = Number(requested.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 30) {
      return sendJson(res, 400, { error: 'Um produto do carrinho não está mais disponível. Atualize o carrinho.' });
    }
    if (product.stockVerified === true && Number.isInteger(product.stock)) {
      if (quantity > product.stock) return sendJson(res, 409, { error: `Estoque insuficiente para ${product.name}.` });
      product.stock -= quantity;
    }
    items.push({ productId: product.id, productName: cleanText(product.name, 160), quantity, unitPrice: Number(product.price) || 0 });
  }
  const sales = (await readArray(ORDERS_KEY)) || [];
  if (sales.length >= 5000) return sendJson(res, 507, { error: 'O histórico de pedidos atingiu o limite. Entre em contato com a loja.' });
  const subtotal = Number(items.reduce((total, item) => total + item.unitPrice * item.quantity, 0).toFixed(2));
  const order = {
    id: `PC-${Date.now().toString().slice(-8)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    source: 'store-checkout', productId: items[0].productId,
    productName: items.map((item) => `${item.quantity}× ${item.productName}`).join(', '),
    items, quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal, shipping: 0, amount: subtotal, customer, email, phone, delivery: address,
    createdAt: new Date().toISOString(), status: 'pending'
  };
  sales.push(order);
  await redisCommand(['SET', PRODUCTS_KEY, JSON.stringify(products)]);
  await redisCommand(['SET', ORDERS_KEY, JSON.stringify(sales)]);
  return sendJson(res, 201, { order, products });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET') {
      const products = await readArray(PRODUCTS_KEY);
      const inventoryPreset = await redisCommand(['GET', INVENTORY_PRESET_KEY]);
      if (!authenticated(req)) return sendJson(res, 200, { products, inventoryPreset });
      const sales = await readArray(ORDERS_KEY);
      return sendJson(res, 200, { products, sales: sales || [], inventoryPreset });
    }

    if (req.method === 'POST') return await createOrder(req, res);

    if (req.method === 'PUT') {
      if (!authenticated(req)) return sendJson(res, 401, { error: 'Entre no painel para salvar o catálogo.' });
      if (!csrfValid(req)) return sendJson(res, 403, { error: 'Sessão inválida. Atualize o painel e tente novamente.' });
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!Array.isArray(body.products) || body.products.length > 2000) return sendJson(res, 400, { error: 'O catálogo enviado é inválido.' });
      await redisCommand(['SET', PRODUCTS_KEY, JSON.stringify(body.products)]);
      if (body.inventoryPreset === '23-units-each') await redisCommand(['SET', INVENTORY_PRESET_KEY, '23-units-each']);
      if (Array.isArray(body.sales)) {
        const currentSales = await readArray(ORDERS_KEY);
        if (!currentSales?.length && body.sales.length) await redisCommand(['SET', ORDERS_KEY, JSON.stringify(body.sales.slice(-5000))]);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sales = (await readArray(ORDERS_KEY)) || [];
      const order = sales.find((item) => item.id === body.id);
      if (!order) return sendJson(res, 404, { error: 'Pedido não encontrado.' });
      if (body.action === 'reported') {
        order.customerReportedPaid = true;
        order.customerReportedPaidAt = new Date().toISOString();
      } else {
        if (!authenticated(req)) return sendJson(res, 401, { error: 'Entre no painel para atualizar o pedido.' });
        if (!csrfValid(req)) return sendJson(res, 403, { error: 'Sessão inválida. Atualize o painel e tente novamente.' });
        if (order.status !== 'pending' || !['paid', 'cancelled'].includes(body.action)) return sendJson(res, 409, { error: 'O pedido não pode mais ser alterado.' });
        order.status = body.action;
        if (body.action === 'paid') order.paidAt = new Date().toISOString();
        if (body.action === 'cancelled') {
          order.cancelledAt = new Date().toISOString();
          const products = (await readArray(PRODUCTS_KEY)) || [];
          for (const item of order.items || []) {
            const product = products.find((entry) => entry.id === item.productId);
            if (product?.stockVerified === true && Number.isInteger(product.stock)) product.stock += item.quantity;
          }
          await redisCommand(['SET', PRODUCTS_KEY, JSON.stringify(products)]);
        }
      }
      await redisCommand(['SET', ORDERS_KEY, JSON.stringify(sales)]);
      return sendJson(res, 200, { order });
    }

    if (req.method === 'DELETE') {
      if (!authenticated(req)) return sendJson(res, 401, { error: 'Entre no painel para limpar os pedidos.' });
      if (!csrfValid(req)) return sendJson(res, 403, { error: 'Sessão inválida. Atualize o painel e tente novamente.' });
      await redisCommand(['DEL', ORDERS_KEY]);
      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  } catch (error) {
    console.error('Falha ao acessar os dados compartilhados da loja.', error.message);
    return sendJson(res, 503, { error: 'Não foi possível acessar os dados compartilhados. Confira o Redis da Vercel.' });
  }
};

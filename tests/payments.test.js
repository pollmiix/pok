const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const p = require('../api/_lib/payments');
const store = require('../api/store-data');
const settings = require('../api/gateway-settings');
const status = require('../api/payment-status');
const webhook = require('../api/blackcat-webhook');
const adminPage = require('../api/admin');
const pricing = require('../pricing');

test('Blackcat payment lifecycle with mocked provider and storage', async t => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  const db = new Map();
  let remoteStatus = 'PENDING', remoteAmount = 2331, creates = 0, timeout = false;
  let expectedSaleAmount = 2331, expectedUnitAmount = 2331;
  process.env.BLACKCAT_API_KEY = 'test-server-secret';
  process.env.WALKCARDS_ADMIN_PASSWORD = 'test-admin-password';
  process.env.KV_REST_API_URL = 'https://redis.example';
  process.env.KV_REST_API_TOKEN = 'redis-test';
  process.env.WALKCARDS_PUBLIC_URL = 'https://loja.example';
  global.fetch = async (url, options) => {
    if (url === 'https://redis.example') {
      const [cmd, ...args] = JSON.parse(options.body);
      let result;
      if (cmd === 'GET') result = db.get(args[0]) ?? null;
      else if (cmd === 'SET') {
        if (args.includes('NX') && db.has(args[0])) result = null;
        else { db.set(args[0], args[1]); result = 'OK'; }
      } else if (cmd === 'DEL') result = db.delete(args[0]) ? 1 : 0;
      else if (cmd === 'INCR') { result = Number(db.get(args[0]) || 0) + 1; db.set(args[0], String(result)); }
      else if (cmd === 'EXPIRE') result = 1;
      else if (cmd === 'EVAL') {
        if (args[1] === 1) { if (db.get(args[2]) === args[3]) db.delete(args[2]); }
        else { db.set(args[2], args[4]); db.set(args[3], args[5]); }
        result = 1;
      } else throw new Error(`Unhandled Redis command ${cmd}`);
      return { ok: true, json: async () => ({ result }) };
    }
    assert.ok(url.startsWith('https://api.blackcatoficial.com/api/'));
    assert.equal(options.headers['X-API-Key'], 'test-server-secret');
    if (url.endsWith('/sales/seller')) return { ok: true, json: async () => ({ success: true, data: { name: 'Loja teste' } }) };
    if (url.endsWith('/create-sale')) {
      creates++;
      const body = JSON.parse(options.body);
      const isPanelTest = body.externalRef?.startsWith('TEST-');
      assert.ok(body.items.length > 0);
      for (const item of body.items) assert.equal(item.title, 'vasco pg');
      assert.equal(body.amount, isPanelTest ? 100 : expectedSaleAmount);
      assert.equal(body.items[0].unitPrice, isPanelTest ? 100 : expectedUnitAmount);
      assert.equal(body.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), body.amount);
      assert.equal(body.customer.document.type, 'cpf');
      if (isPanelTest) { assert.equal(body.items[0].tangible, false); assert.equal(body.shipping, undefined); }
      else {
        assert.equal(body.shipping.zipCode, '01001000');
        assert.equal(body.postbackUrl, 'https://loja.example/api/blackcat-webhook');
      }
      if (timeout) throw new Error('timeout');
      return { ok: true, json: async () => ({ success: true, data: {
        transactionId: 'TXN-test', amount: body.amount, status: 'PENDING', paymentData: { copyPaste: '000201-test-pix' }
      } }) };
    }
    if (url.endsWith('/status')) return { ok: true, json: async () => ({ success: true, data: {
      transactionId: 'TXN-test', amount: remoteAmount, paymentMethod: 'PIX', status: remoteStatus
    } }) };
    throw new Error(`Unexpected request ${url}`);
  };
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  const signature = crypto.createHmac('sha256', process.env.WALKCARDS_ADMIN_PASSWORD).update(expires).digest('base64url');
  const adminHeaders = { cookie: `walkcards_admin=${expires}.${signature}; walkcards_csrf=csrf-test`, 'x-csrf-token': 'csrf-test' };
  const token = crypto.randomUUID();
  const body = { customer: 'Cliente teste', email: 'teste@example.com', phone: '11999999999', document: '52998224725',
    items: [{ productId: 'p1', quantity: 1, unitPrice: 0.01 }],
    delivery: { postalCode: '01001000', street: 'Rua teste', number: '1', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', recipient: 'Cliente teste' }
  };
  function seed() {
    db.clear();
    db.set('walkcards:products', JSON.stringify([{ id: 'p1', name: 'Cartas', price: 25.90, stockVerified: true, stock: 4 }]));
    db.set(p.SETTINGS_KEY, JSON.stringify({ enabled: true }));
  }
  async function invoke(handler, method, data, headers = {}) {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.raw = value; } };
    await handler({ method, body: data, headers, socket: { remoteAddress: '127.0.0.1' } }, res);
    try { res.data = JSON.parse(res.raw); } catch { res.data = res.raw; }
    assert.ok(!String(res.raw).includes('test-server-secret'));
    return res;
  }
  try {
    await t.test('settings require authentication and CSRF; only the server holds the key', async () => {
      seed();
      assert.equal((await invoke(settings, 'GET')).statusCode, 401);
      assert.equal((await invoke(settings, 'POST', { enabled: false }, { cookie: adminHeaders.cookie })).statusCode, 403);
      const result = await invoke(settings, 'GET', null, adminHeaders);
      assert.equal(result.data.keyConfigured, true);
      assert.equal((await invoke(settings, 'POST', { action: 'test' }, adminHeaders)).data.seller, 'Loja teste');
    });
    await t.test('gateway option is rendered inside the authenticated admin page', async () => {
      const result = await invoke(adminPage, 'GET', null, adminHeaders);
      assert.ok(result.raw.includes('data-view="gateway"'));
      assert.ok(result.raw.includes('id="gateway-settings-form"'));
      assert.ok(result.raw.includes('id="clear-orders-button"'));
      const loggedOut = await invoke(adminPage, 'GET');
      assert.ok(!loggedOut.raw.includes('id="gateway-settings-form"'));
    });
    await t.test('CPF/CNPJ validation and missing key reject before creating an order', async () => {
      assert.equal(p.validDocument('52998224725'), true);
      assert.equal(p.validDocument('11222333000181'), true);
      assert.equal(p.validDocument('11111111111'), false);
      assert.equal(p.validDocument('52998224726'), false);
      seed();
      assert.equal((await invoke(store, 'POST', { ...body, document: '123' }, { 'x-order-token': token })).statusCode, 400);
      delete process.env.BLACKCAT_API_KEY;
      assert.equal((await invoke(store, 'POST', body, { 'x-order-token': token })).statusCode, 503);
      assert.equal(db.has(p.ORDERS_KEY), false);
      process.env.BLACKCAT_API_KEY = 'test-server-secret';
    });
    await t.test('unverified and legacy automatic stock cannot create charges or reserve inventory', async () => {
      seed();
      db.set('walkcards:inventory-preset', '23-units-each');
      const productsBefore = db.get('walkcards:products');
      const before = creates;
      assert.equal((await invoke(store, 'POST', body, { 'x-order-token': crypto.randomUUID() })).statusCode, 409);
      assert.equal(creates, before);
      assert.equal(db.has(p.ORDERS_KEY), false);
      assert.equal(db.get('walkcards:products'), productsBefore);
      assert.equal((await invoke(store, 'GET')).data.products[0].stockVerified, false);
      const confirmed = JSON.parse(productsBefore);
      confirmed[0].stockConfirmedAt = new Date().toISOString();
      db.set('walkcards:products', JSON.stringify(confirmed));
      assert.equal((await invoke(store, 'GET')).data.products[0].stockVerified, true);
    });
    let order;
    await t.test('server prices override client prices; repeated requests create one charge', async () => {
      seed();
      const first = await invoke(store, 'POST', body, { 'x-order-token': token });
      assert.equal(first.statusCode, 201);
      order = first.data.order;
      assert.equal(order.items[0].productName, 'Cartas');
      assert.equal(order.amount, 23.31);
      assert.equal(order.subtotal, 25.9);
      assert.equal(order.discountAmount, 2.59);
      assert.equal(order.items[0].originalUnitPrice, 25.9);
      assert.equal(order.items[0].unitPrice, 23.31);
      assert.equal(order.payment.copyPaste, '000201-test-pix');
      assert.equal(order.paymentTokenHash, undefined);
      assert.ok(!db.get(p.ORDERS_KEY).includes(body.document));
      assert.equal((await invoke(store, 'POST', body, { 'x-order-token': token })).statusCode, 200);
      assert.equal(creates, 1);
      assert.equal(JSON.parse(db.get('walkcards:products'))[0].stock, 3);
      assert.equal((await invoke(store, 'POST', { ...body, customer: 'Outro cliente' }, { 'x-order-token': token })).statusCode, 409);
    });
    await t.test('webhook claims cannot mark unpaid or wrong-value transactions as paid', async () => {
      const notify = { transactionId: 'TXN-test', status: 'PAID' };
      assert.equal((await invoke(webhook, 'POST', notify)).statusCode, 200);
      assert.equal(JSON.parse(db.get(p.ORDERS_KEY))[0].status, 'pending');
      remoteStatus = 'PAID'; remoteAmount = 1;
      assert.equal((await invoke(webhook, 'POST', notify)).statusCode, 503);
      assert.equal(JSON.parse(db.get(p.ORDERS_KEY))[0].status, 'pending');
      remoteAmount = 2331;
      assert.equal((await invoke(webhook, 'POST', notify)).statusCode, 200);
      assert.equal(JSON.parse(db.get(p.ORDERS_KEY))[0].status, 'paid');
    });
    await t.test('buyer status needs the order token; clearing archives gateway orders without changing payments or stock', async () => {
      assert.equal((await invoke(status, 'POST', { id: order.id })).statusCode, 404);
      const result = await invoke(status, 'POST', { id: order.id }, { 'x-order-token': token });
      assert.equal(result.data.status, 'paid');
      assert.equal((await invoke(store, 'PATCH', { id: order.id, action: 'paid' }, adminHeaders)).statusCode, 409);
      const stockBefore = db.get('walkcards:products');
      const createsBefore = creates;
      assert.equal((await invoke(store, 'DELETE')).statusCode, 401);
      assert.equal((await invoke(store, 'DELETE', null, { cookie: adminHeaders.cookie })).statusCode, 403);
      assert.equal((await invoke(store, 'DELETE', null, adminHeaders)).statusCode, 200);
      const archived = JSON.parse(db.get(p.ORDERS_KEY));
      assert.ok(archived[0].archivedAt);
      assert.equal(archived[0].status, 'paid');
      assert.equal(archived[0].payment.transactionId, order.payment.transactionId);
      assert.equal(db.get('walkcards:products'), stockBefore);
      assert.equal(creates, createsBefore);
      const dashboard = await invoke(store, 'GET', null, adminHeaders);
      assert.deepEqual(dashboard.data.sales, []);
      assert.equal(dashboard.data.orderHistoryInitialized, true);
      const repeated = await invoke(store, 'POST', body, { 'x-order-token': token });
      assert.equal(repeated.statusCode, 200);
      assert.equal(creates, createsBefore);
      assert.equal((await invoke(store, 'PUT', { products: JSON.parse(stockBefore), sales: [order] }, adminHeaders)).statusCode, 200);
      assert.ok(JSON.parse(db.get(p.ORDERS_KEY))[0].archivedAt);
      assert.equal((await invoke(status, 'POST', { id: order.id }, { 'x-order-token': token })).data.status, 'paid');
    });
    await t.test('cancelled payment returns inventory once, even with repeated notifications', async () => {
      const orders = JSON.parse(db.get(p.ORDERS_KEY));
      orders[0].status = 'pending'; db.set(p.ORDERS_KEY, JSON.stringify(orders)); remoteStatus = 'CANCELLED';
      await invoke(webhook, 'POST', { transactionId: 'TXN-test' });
      await invoke(webhook, 'POST', { transactionId: 'TXN-test' });
      assert.equal(JSON.parse(db.get('walkcards:products'))[0].stock, 4);
      assert.equal(JSON.parse(db.get(p.ORDERS_KEY))[0].status, 'cancelled');
      assert.deepEqual((await invoke(store, 'GET', null, adminHeaders)).data.sales, []);
    });
    await t.test('clearing an empty history prevents old browser imports while allowing new orders', async () => {
      seed();
      assert.equal((await invoke(store, 'DELETE', null, adminHeaders)).statusCode, 200);
      assert.equal((await invoke(store, 'PUT', {
        products: JSON.parse(db.get('walkcards:products')), sales: [order]
      }, adminHeaders)).statusCode, 200);
      assert.deepEqual(JSON.parse(db.get(p.ORDERS_KEY)), []);
      const fresh = await invoke(store, 'POST', body, { 'x-order-token': crypto.randomUUID() });
      assert.equal(fresh.statusCode, 201);
      const dashboard = await invoke(store, 'GET', null, adminHeaders);
      assert.equal(dashboard.data.sales.length, 1);
      assert.equal(dashboard.data.sales[0].id, fresh.data.order.id);
    });
    await t.test('ambiguous network failure preserves order; retry does not duplicate the charge', async () => {
      seed(); timeout = true;
      const previous = creates;
      const request = { 'x-order-token': crypto.randomUUID() };
      assert.equal((await invoke(store, 'POST', body, request)).statusCode, 503);
      assert.equal((await invoke(store, 'POST', body, request)).statusCode, 409);
      assert.equal(creates, previous + 1);
      assert.equal(JSON.parse(db.get(p.ORDERS_KEY)).length, 1);
    });
    await t.test('disabled gateway preserves manual Pix without requiring a document or provider key', async () => {
      seed(); db.set(p.SETTINGS_KEY, JSON.stringify({ enabled: false }));
      delete process.env.BLACKCAT_API_KEY;
      const before = creates;
      const result = await invoke(store, 'POST', { ...body, document: '' }, { 'x-order-token': crypto.randomUUID() });
      assert.equal(result.statusCode, 201);
      assert.equal(result.data.order.gateway, 'manual');
      assert.equal(result.data.order.amount, 23.31);
      assert.equal(creates, before);
      process.env.BLACKCAT_API_KEY = 'test-server-secret';
    });
    await t.test('discount rounds each unit identically in browser and server, including multiple quantities', async () => {
      assert.equal(pricing.pixPrice(100), 90);
      assert.equal(pricing.pixPrice(25.9), 23.31);
      assert.equal(pricing.pixPrice(19.99), 17.99);
      assert.equal(pricing.pixPrice(0.05), 0.05);
      const browser = { window: {} };
      vm.runInNewContext(fs.readFileSync(require.resolve('../pricing'), 'utf8'), browser);
      for (const price of [0.01, 0.05, 19.99, 25.9, 100, 599.99]) {
        assert.equal(browser.window.StorePricing.pixCents(price), pricing.pixCents(price));
      }
      seed(); timeout = false;
      db.set('walkcards:products', JSON.stringify([{ id: 'p1', name: 'Cartas', price: 19.99, stockVerified: true, stock: 4 }]));
      expectedSaleAmount = 5397; expectedUnitAmount = 1799;
      const result = await invoke(store, 'POST', { ...body, discountPercent: 99,
        items: [{ productId: 'p1', quantity: 3, unitPrice: 0.01 }] }, { 'x-order-token': crypto.randomUUID() });
      assert.equal(result.statusCode, 201);
      assert.equal(result.data.order.amount, 53.97);
      assert.equal(result.data.order.subtotal, 59.97);
      assert.equal(result.data.order.discountPercent, 10);
      assert.equal(result.data.order.discountAmount, 6);
      assert.equal(JSON.parse(db.get('walkcards:products'))[0].stock, 1);
      expectedSaleAmount = expectedUnitAmount = 2331;
    });
    const qrRequest = { action: 'test-qr', requestId: crypto.randomUUID(), amount: 100,
      name: body.customer, email: body.email, phone: body.phone, document: body.document };
    await t.test('panel QR generation is authenticated, validates data and never changes inventory', async () => {
      seed(); timeout = false;
      assert.equal((await invoke(settings, 'POST', qrRequest)).statusCode, 401);
      assert.equal((await invoke(settings, 'POST', qrRequest, { cookie: adminHeaders.cookie })).statusCode, 403);
      const before = creates;
      assert.equal((await invoke(settings, 'POST', { ...qrRequest, amount: 1 }, adminHeaders)).statusCode, 400);
      assert.equal((await invoke(settings, 'POST', { ...qrRequest, document: '123' }, adminHeaders)).statusCode, 400);
      assert.equal(creates, before);
      const result = await invoke(settings, 'POST', qrRequest, adminHeaders);
      assert.equal(result.statusCode, 201);
      assert.equal(result.data.charge.amount, 100);
      assert.equal(result.data.charge.copyPaste, '000201-test-pix');
      assert.equal(JSON.parse(db.get('walkcards:products'))[0].stock, 4);
      assert.equal(db.has(p.ORDERS_KEY), false);
      assert.ok(!JSON.stringify([...db.values()]).includes(body.document));
      assert.equal((await invoke(settings, 'POST', qrRequest, adminHeaders)).statusCode, 200);
      assert.equal(creates, before + 1);
      assert.equal((await invoke(settings, 'POST', { ...qrRequest, amount: 200 }, adminHeaders)).statusCode, 409);
      assert.equal((await invoke(settings, 'POST', { ...qrRequest, requestId: crypto.randomUUID() }, adminHeaders)).statusCode, 429);
      const loaded = await invoke(settings, 'GET', null, adminHeaders);
      assert.equal(loaded.data.testCharge.requestId, qrRequest.requestId);
    });
    await t.test('panel test payment status is verified with the provider', async () => {
      remoteStatus = 'PAID'; remoteAmount = 100;
      const result = await invoke(settings, 'POST', { action: 'test-qr-status', requestId: qrRequest.requestId, status: 'CANCELLED' }, adminHeaders);
      assert.equal(result.statusCode, 200);
      assert.equal(result.data.charge.status, 'PAID');
      assert.equal((await invoke(settings, 'GET', null, adminHeaders)).data.testCharge.status, 'PAID');
      assert.equal((await invoke(settings, 'POST', { action: 'test-qr-status', requestId: crypto.randomUUID() }, adminHeaders)).statusCode, 404);
    });
    await t.test('uncertain test charge is not submitted again after timeout', async () => {
      seed(); timeout = true;
      const before = creates;
      const request = { ...qrRequest, requestId: crypto.randomUUID() };
      assert.equal((await invoke(settings, 'POST', request, adminHeaders)).statusCode, 503);
      assert.equal((await invoke(settings, 'POST', request, adminHeaders)).statusCode, 409);
      assert.equal(creates, before + 1);
    });
    await t.test('frontend JavaScript parses', () => {
      for (const file of ['store.js', 'admin.js']) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    });
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

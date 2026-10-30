const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const p = require('../api/_lib/payments');
const v = require('../api/_lib/visits');
const handler = require('../api/visits');

test('visit metadata excludes query strings and unsafe links', () => {
  assert.equal(v.pagePath('//example.com'), '/');
  assert.equal(v.pagePath('/\\example.com'), '/');
  assert.equal(v.pagePath('/produto/p1?email=secret#private'), '/produto/p1');
  assert.equal(v.referrer('javascript:alert(1)'), '');
  assert.equal(v.referrer('https://example.com/ad?email=secret#private'), 'https://example.com/ad');
  assert.deepEqual(v.agent('Mozilla Windows Chrome/100 Edg/100'), { device: 'Windows', browser: 'Edge' });
  assert.deepEqual(v.agent('iPhone CriOS/100 Safari/100'), { device: 'iOS', browser: 'Chrome' });
  assert.equal(v.location({ headers: { 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country': 'BR' } }), 'São Paulo / BR');
  assert.equal(v.location({ headers: {} }), 'Indisponível');
});

test('visits require authentication, protect mutations and enforce IP blocks', async t => {
  const originalRedis = p.redis;
  const originalPassword = process.env.WALKCARDS_ADMIN_PASSWORD;
  const db = new Map(), index = new Map();
  process.env.WALKCARDS_ADMIN_PASSWORD = 'visits-test-password';
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  const signature = crypto.createHmac('sha256', process.env.WALKCARDS_ADMIN_PASSWORD).update(expires).digest('base64url');
  const admin = { cookie: `walkcards_admin=${expires}.${signature}; walkcards_csrf=csrf-test`, 'x-csrf-token': 'csrf-test' };
  const id = crypto.randomUUID();
  p.redis = async ([command, ...args]) => {
    if (command === 'GET') return db.get(args[0]) || null;
    if (command === 'INCR') { const value = Number(db.get(args[0]) || 0) + 1; db.set(args[0], value); return value; }
    if (command === 'EXPIRE') return 1;
    if (command === 'DEL') return Number(db.delete(args[0]));
    if (command === 'ZREMRANGEBYSCORE') return 0;
    if (command === 'ZCARD') return index.size;
    if (command === 'ZREVRANGE') return [...index.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key).slice(Number(args[1]), Number(args[2]) + 1);
    if (command === 'ZRANGEBYSCORE') return [...index.entries()].filter(([, score]) => score >= Number(args[1])).map(([key]) => key);
    if (command === 'MGET') return args.map(key => db.get(key) || null);
    if (command === 'EVAL') {
      const [script, keys, ...values] = args;
      if (keys === 2 && script.includes('row.firstSeen')) {
        const [recordKey, , raw, now, ttl] = values;
        assert.equal(ttl, v.RETENTION);
        const row = JSON.parse(raw), old = JSON.parse(db.get(recordKey) || 'null');
        if (old) { row.firstSeen = old.firstSeen; row.referrer = old.referrer; }
        db.set(recordKey, JSON.stringify(row)); index.set(row.id, Number(now));
      } else if (keys === 2) { db.delete(values[0]); index.delete(values[2]); }
      else {
        const [key, ip, action] = values;
        const blocked = JSON.parse(db.get(key) || '{}');
        if (action === 'block') blocked[ip] = true; else delete blocked[ip];
        db.set(key, JSON.stringify(blocked));
      }
      return 1;
    }
    throw new Error(`Unhandled command: ${command}`);
  };
  async function invoke(method, body = {}, headers = {}, query = {}) {
    const response = { setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
    await handler({ method, body, headers: { 'x-vercel-forwarded-for': '192.0.2.10', 'user-agent': 'Windows Chrome/100', ...headers }, query }, response);
    return response;
  }
  try {
    await t.test('public requests cannot read visits or modify blocks', async () => {
      for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await invoke(method, { id, action: 'block' })).statusCode, 401);
      assert.equal((await invoke('PATCH', { id, action: 'unblock-all' }, { cookie: admin.cookie })).statusCode, 403);
    });
    await t.test('records server metadata and preserves initial source', async () => {
      assert.equal((await invoke('POST', { id, page: '/?email=private', referrer: 'https://example.com/ad?token=secret', ip: 'attacker', stage: 'Checkout' })).statusCode, 200);
      await invoke('POST', { id, page: '/produto/p1', referrer: 'https://different.example/', stage: 'Visualizando produto', product: 'Cartas' });
      const result = await invoke('GET', {}, admin, { page: '999' });
      assert.equal(result.body.total, 1); assert.equal(result.body.online, 1); assert.equal(result.body.page, 1);
      const row = result.body.visits[0];
      assert.equal(row.ip, '192.0.2.10'); assert.equal(row.browser, 'Chrome');
      assert.equal(row.referrer, 'https://example.com/ad'); assert.equal(row.product, 'Cartas');
    });
    await t.test('hidden visitors are offline and blocks apply to server requests', async () => {
      await invoke('POST', { id, visible: false });
      assert.equal((await invoke('GET', {}, admin)).body.online, 0);
      assert.equal((await invoke('PATCH', { id, action: 'block' }, admin)).statusCode, 200);
      assert.equal(await v.isBlocked({ headers: { 'x-vercel-forwarded-for': '192.0.2.10' } }), true);
      assert.equal((await invoke('POST', { id })).statusCode, 403);
      const store = require('../api/store-data');
      const response = { setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
      await store({ method: 'POST', headers: { 'x-vercel-forwarded-for': '192.0.2.10' }, body: {} }, response);
      assert.equal(response.statusCode, 403); assert.equal(response.body.blocked, true);
      await invoke('PATCH', { action: 'unblock-all' }, admin);
      assert.equal(await v.isBlocked({ headers: { 'x-vercel-forwarded-for': '192.0.2.10' } }), false);
    });
    await t.test('deletes a visit and handles empty pages', async () => {
      assert.equal((await invoke('DELETE', { id }, admin)).statusCode, 200);
      const result = await invoke('GET', {}, admin);
      assert.equal(result.body.total, 0); assert.equal(result.body.pages, 1);
      assert.deepEqual(result.body.visits, []);
    });
    await t.test('storage failure returns an error instead of fabricated data', async () => {
      p.redis = async () => { throw new Error('offline'); };
      assert.equal((await invoke('GET', {}, admin)).statusCode, 503);
    });
  } finally {
    p.redis = originalRedis;
    if (originalPassword === undefined) delete process.env.WALKCARDS_ADMIN_PASSWORD;
    else process.env.WALKCARDS_ADMIN_PASSWORD = originalPassword;
  }
});

test('visitor and dashboard scripts parse and their controls exist', () => {
  for (const file of ['visits.js', 'admin-visits.js']) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  const panel = fs.readFileSync('api/_lib/admin-panel.html', 'utf8');
  for (const match of fs.readFileSync('admin-visits.js', 'utf8').matchAll(/\$\('#([^']+)'\)/g)) {
    assert.ok(panel.includes(`id="${match[1]}"`), match[1]);
  }
  assert.match(fs.readFileSync('index.html', 'utf8'), /src="\/visits.js/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const live = require('../api/_lib/visits-live');

test('live stream accepts only events on the visits channel', () => {
  assert.equal(live.messageType('data: subscribe,walkcards-visits,1'), 'ready');
  assert.equal(live.messageType('data: message,walkcards-visits,changed'), 'change');
  assert.equal(live.messageType('data: "message,walkcards-visits,changed"'), 'change');
  assert.equal(live.messageType('data: {"result":"message,walkcards-visits,changed"}'), 'change');
  assert.equal(live.messageType('data: message,other,secret'), '');
  assert.equal(live.messageType(': heartbeat'), '');
});

test('subscription forwards split Redis messages without exposing credentials or payloads', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.KV_REST_API_URL;
  const originalToken = process.env.KV_REST_API_TOKEN;
  process.env.KV_REST_API_URL = 'https://redis.example';
  process.env.KV_REST_API_TOKEN = 'server-only-test-credential';
  let signal;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://redis.example/subscribe/walkcards-visits');
    assert.equal(options.headers.Authorization, 'Bearer server-only-test-credential');
    signal = options.signal;
    return { ok: true, headers: new Headers({ 'content-type': 'text/event-stream' }), body: new ReadableStream({
      start(controller) {
        for (const text of ['data: sub', 'scribe,walkcards-visits,1\r\n\r\ndata: mess', 'age,walkcards-visits,private-payload\n\n']) {
          controller.enqueue(new TextEncoder().encode(text));
        }
        controller.close();
      }
    }) };
  };
  const res = new EventEmitter();
  const headers = {}, chunks = [];
  res.setHeader = (key, value) => { headers[key] = value; };
  res.flushHeaders = () => { res.headersSent = true; };
  res.write = chunk => { chunks.push(chunk); return true; };
  res.end = () => { res.ended = true; };
  try {
    await live.stream({}, res);
    assert.equal(headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.match(chunks.join(''), /event: ready\ndata: \{\}/);
    assert.match(chunks.join(''), /event: change\ndata: \{\}/);
    assert.doesNotMatch(chunks.join(''), /server-only|private-payload/);
    assert.equal(signal.aborted, true);
    assert.equal(res.ended, true);
    assert.equal(res.listenerCount('close'), 0);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = originalUrl;
    if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = originalToken;
  }
});

test('visitor reports entry immediately, observes checkout changes and reports departure', async () => {
  let stage = '', observe;
  const requests = [], beacons = [], timers = new Map(), events = new Map();
  let timerId = 0;
  const document = {
    hidden: false, readyState: 'complete', documentElement: {}, referrer: '',
    querySelector(selector) {
      if (selector === '#product-detail-title') return { textContent: 'Cartas Pokémon' };
      if (selector === '#product-detail-dialog[open]' && stage === 'product') return { getClientRects: () => [1] };
      if (selector === '#buyer-view' && stage === 'checkout') return { getClientRects: () => [1] };
      return null;
    },
    querySelectorAll: () => [{ textContent: 'Kit de cartas' }],
    addEventListener: (name, callback) => events.set(name, callback)
  };
  const context = {
    document, location: { protocol: 'https:', pathname: '/' },
    sessionStorage: { getItem: () => '12345678-1234-1234-1234-123456789abc', setItem() {} },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return { status: 200 }; },
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} },
    setInterval() {}, setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    window: { addEventListener: (name, callback) => events.set(name, callback) },
    navigator: { sendBeacon(_url, blob) { beacons.push(blob); return true; } }, Blob
  };
  const flush = async () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); await new Promise(setImmediate); };
  vm.runInNewContext(fs.readFileSync('visits.js', 'utf8'), context);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].visible, true);
  await flush();
  stage = 'product'; observe(); await flush();
  assert.equal(requests.at(-1).stage, 'Visualizando produto');
  assert.equal(requests.at(-1).product, 'Cartas Pokémon');
  stage = 'checkout'; observe(); await flush();
  assert.equal(requests.at(-1).stage, 'Checkout');
  document.hidden = true; events.get('visibilitychange')(); await flush();
  assert.equal(requests.at(-1).visible, false);
  events.get('pagehide')();
  assert.equal(JSON.parse(await beacons[0].text()).visible, false);
});

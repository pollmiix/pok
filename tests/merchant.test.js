const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const payments = require('../api/_lib/payments');
const catalog = require('../api/_lib/catalog');
const feed = require('../api/merchant-feed');
const productPage = require('../api/product');
const sitemap = require('../api/sitemap');

test('merchant feed and product pages use the same real inventory, Pix price and shipping', async t => {
  const originalRedis = payments.redis;
  const originalUrl = process.env.WALKCARDS_PUBLIC_URL;
  process.env.WALKCARDS_PUBLIC_URL = 'https://walkcards.online';
  let preset = '23-units-each';
  let shared = [{ id: 'imported-1', name: 'Produto <especial> & coleção', price: 25.90,
    image: '/assets/walk-cards-logo.jpg', stockVerified: true, stock: 23 }];
  payments.redis = async command => command[1] === 'walkcards:products' ? JSON.stringify(shared) : preset;
  async function invoke(handler, query = {}) {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
    await handler({ query }, response);
    return response;
  }
  const firstFeedItem = body => body.match(/<item>[\s\S]*?<\/item>/)[0];
  try {
    await t.test('legacy generated stock is never advertised as available', async () => {
      const response = await invoke(feed);
      assert.equal(response.statusCode, 200);
      const item = firstFeedItem(response.body);
      assert.match(item, /<g:availability>out_of_stock<\/g:availability>/);
      assert.match(item, /<g:price>23\.31 BRL<\/g:price>/);
      assert.match(item, /https:\/\/walkcards.online\/produto\/imported-1/);
      assert.match(item, /<g:shipping><g:country>BR<\/g:country><g:price>0\.00 BRL/);
      assert.match(item, /Produto &lt;especial&gt; &amp; coleção/);
      assert.equal(response.headers['Cache-Control'], 'no-store');
      const page = await invoke(productPage, { id: 'imported-1' });
      assert.equal(page.statusCode, 200);
      assert.match(page.body, /Disponibilidade sob consulta/);
      assert.ok(!page.body.includes('>Comprar no Pix<'));
    });
    await t.test('a stock count confirmed by the merchant enables the offer with matching price', async () => {
      shared[0].stockConfirmedAt = new Date().toISOString();
      const response = await invoke(feed);
      assert.match(firstFeedItem(response.body), /<g:availability>in_stock<\/g:availability>/);
      const page = await invoke(productPage, { id: 'imported-1' });
      const schema = JSON.parse(page.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.equal(schema.name, shared[0].name);
      assert.equal(schema.offers.price, '23.31');
      assert.equal(schema.offers.availability, 'https://schema.org/InStock');
      assert.equal(schema.offers.shippingDetails.shippingRate.value, 0);
      assert.match(page.body, /Comprar no Pix/);
      assert.match(page.body, /Frete grátis para todo o Brasil/);
      shared[0].stock = 0;
      assert.match(firstFeedItem((await invoke(feed)).body), /out_of_stock/);
      assert.match((await invoke(productPage, { id: 'imported-1' })).body, /Produto esgotado/);
    });
    await t.test('unknown local products remain unverified and missing products return 404', async () => {
      const products = await catalog.publishedCatalog();
      assert.equal(products.find(item => item.id === 'imported-2').stockVerified, false);
      assert.equal((await invoke(productPage, { id: 'does-not-exist' })).statusCode, 404);
      const response = await invoke(sitemap);
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /https:\/\/walkcards.online\/produto\/imported-1/);
      assert.ok(!response.body.includes('aposta'));
    });
    await t.test('provider failure does not publish stale availability or prices', async () => {
      payments.redis = async () => { throw new Error('storage unavailable'); };
      assert.equal((await invoke(feed)).statusCode, 503);
      assert.equal((await invoke(productPage, { id: 'imported-1' })).statusCode, 503);
    });
  } finally {
    payments.redis = originalRedis;
    if (originalUrl === undefined) delete process.env.WALKCARDS_PUBLIC_URL;
    else process.env.WALKCARDS_PUBLIC_URL = originalUrl;
  }
});

test('public pages provide consistent store identity and real purchasing terms', () => {
  const home = fs.readFileSync('index.html', 'utf8');
  assert.ok(!/RIHAPPY|PCI CERTIFIED|Confì|VTEX|assets\/credito|assets\/nupay|assets\/pix-parcelado/.test(home));
  assert.ok(!home.includes('aposta.html'));
  assert.ok(!home.includes('pix-welcome.js'));
  const pages = ['sobre-nos', 'contato', 'politica-de-envio', 'trocas-devolucoes', 'termos-de-uso', 'politica-de-privacidade'];
  for (const slug of pages) {
    const page = fs.readFileSync(`${slug}/index.html`, 'utf8');
    assert.ok(page.includes('19.271.540/0001-38'), slug);
    assert.ok(!/INFORMAÇÃO NECESSÁRIA|Loja em preparação|não processa pedidos|checkout.*desativado/.test(page), slug);
    assert.ok(page.includes(`https://walkcards.online/${slug}/`), slug);
  }
  assert.match(fs.readFileSync('trocas-devolucoes/index.html', 'utf8'), /7 dias corridos/);
  assert.match(fs.readFileSync('politica-de-envio/index.html', 'utf8'), /R\$ 0,00/);
});

test('interactive controls referenced by store and admin scripts exist in the HTML', () => {
  const sources = [
    ['store.js', fs.readFileSync('index.html', 'utf8')],
    ['admin.js', fs.readFileSync('api/_lib/admin-panel.html', 'utf8') + require('../api/_lib/gateway-panel')]
  ];
  for (const [file, html] of sources) {
    const source = fs.readFileSync(file, 'utf8');
    new vm.Script(source, { filename: file });
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    for (const match of source.matchAll(/\$\(['"]#([a-z][a-z0-9-]*)['"]\)/gi)) {
      assert.ok(ids.has(match[1]), `${file}: missing #${match[1]}`);
    }
  }
});

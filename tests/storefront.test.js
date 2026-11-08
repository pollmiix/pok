const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storefront = require('../api/storefront');
const productInfo = require('../product-info');
const payments = require('../api/_lib/payments');
const template = fs.readFileSync('index.html', 'utf8');

test('initial HTML includes inventory, Pix prices and crawlable product links without JavaScript', () => {
  const products = [
    { id: 'test-1', name: 'Blister Triplo Pokémon - Copag', price: 99.99, image: '/assets/pix.svg', stockVerified: true, stock: 2 },
    { id: 'test-2', name: 'Produto indisponível', price: 20, image: '/assets/pix.svg', stockVerified: true, stock: 0 }
  ];
  const html = storefront.renderHome(template, products);
  assert.match(html, /id="catalog-total">2 produtos/);
  assert.match(html, /id="minimum-price-label">R\$\s*18,00/);
  assert.match(html, /id="maximum-price-label">R\$\s*89,99/);
  assert.match(html, /href="\/produto\/test-1"/);
  assert.match(html, /2 unidades em estoque/);
  assert.match(html, /data-add-product="test-2" disabled/);
  assert.ok(html.includes(productInfo.describeProduct(products[0])));
  assert.ok(!html.includes('Preço de referência'));
  assert.ok(!html.includes('Preço e forma de pagamento sujeitos'));
  const script = html.match(/<script>window.STORE_PUBLISHED_CATALOG=([\s\S]*?);<\/script>/)[1];
  assert.deepEqual(JSON.parse(script), products);
});

test('catalog content cannot escape HTML or its initial data script', () => {
  const product = { id: 'unsafe', name: '</script><script>alert(1)</script>', price: 1, image: '" onerror="alert(1)', stockVerified: false };
  const html = storefront.renderHome(template, [product]);
  assert.ok(!html.includes(product.name));
  assert.ok(!html.includes('src="" onerror='));
  const script = html.match(/<script>(window.STORE_PUBLISHED_CATALOG=[\s\S]*?);<\/script>/)[1];
  const context = { window: {} };
  vm.runInNewContext(script, context);
  assert.equal(context.window.STORE_PUBLISHED_CATALOG[0].name, product.name);
});

test('server rejects a storage outage instead of publishing stale catalog data', async () => {
  const original = payments.redis;
  payments.redis = async () => { throw new Error('storage unavailable'); };
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
  try {
    await storefront({ headers: {} }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.ok(!response.body.includes('STORE_PUBLISHED_CATALOG'));
    assert.ok(!response.body.includes('R$ 0,00'));
  } finally { payments.redis = original; }
});

test('browser and server use identical product descriptions and technical data', () => {
  const context = { window: { StorePricing: require('../pricing') } };
  vm.runInNewContext(fs.readFileSync('product-info.js', 'utf8'), context);
  const product = { name: 'Blister Triplo Pokémon - Copag', price: 99.99, stockVerified: true, stock: 2, includedItems: 'Conteúdo informado pelo lojista' };
  assert.equal(context.window.StoreProductInfo.describeProduct(product), productInfo.describeProduct(product));
  assert.equal(JSON.stringify(context.window.StoreProductInfo.productSpecifications(product)), JSON.stringify(productInfo.productSpecifications(product)));
});

test('public catalog removes supplier details without changing stored inventory or image URLs', () => {
  const original = { id: 'imported-1', name: 'Blister Triplo - COPAG', brand: 'Copag',
    supplier: 'Copag', supplierCode: 'private-code', price: 99.99, stock: 21, stockVerified: true,
    image: '/product-Copag.jpg', description: 'Blister triplo - Copag' };
  const visible = productInfo.publicProduct(original);
  assert.equal(visible.name, 'Blister Triplo');
  assert.equal(visible.description, 'Blister triplo');
  assert.equal(visible.brand, undefined);
  assert.equal(visible.supplier, undefined);
  assert.equal(visible.supplierCode, undefined);
  assert.equal(visible.image, original.image);
  assert.equal(visible.stock, 21);
  assert.equal(original.brand, 'Copag');
  assert.equal(original.supplierCode, 'private-code');
});

test('customer order names follow the public naming without changing customer data or stored order', () => {
  const order = { id: 'order-1', productName: '1× Blister - Copag', customer: 'Cliente Copag',
    paymentTokenHash: 'private', items: [{ productName: 'Blister - Copag', productId: 'imported-1', quantity: 1 }] };
  const visible = payments.publicOrder(order);
  assert.ok(!/copag/i.test(visible.productName));
  assert.equal(visible.items[0].productName, 'Blister');
  assert.equal(visible.customer, order.customer);
  assert.equal(visible.paymentTokenHash, undefined);
  assert.equal(order.items[0].productName, 'Blister - Copag');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const source = fs.readFileSync('store.js', 'utf8');
const loadSource = source.slice(source.indexOf('  async function loadSharedProducts()'), source.indexOf('\n  function saveCart()'));
const renderSource = source.slice(source.indexOf('  function renderProductDetails('), source.indexOf('\n  function renderRelatedProducts('));

test('an already-open product updates from unverified stock when the server responds', async () => {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { open: false, dataset: {}, classList: { toggle() {}, remove() {} }, setAttribute() {} });
    return nodes.get(selector);
  };
  node('#product-detail-dialog').open = true;
  const initial = { id: 'imported-1', name: 'Kit de cartas', price: 149.99, stockVerified: false };
  let next = { ...initial, stock: 22, stockVerified: true }, resolveFetch;
  let renders = 0, cartRenders = 0, requests = 0;
  node('#product-detail-dialog').scrollTop = 640;
  node('#related-products').scrollLeft = 180;
  const context = {
    products: [initial], importedProducts: [initial], dashboardState: {}, cart: [], favorites: [],
    detailProductId: initial.id,
    sharedProductsLoading: false,
    $: node, getProduct: id => context.products.find(product => product.id === id),
    verifiedStock: product => product.stockVerified === true && Number.isInteger(product.stock),
    renderProductGallery() {}, renderRelatedProducts() { node('#related-products').scrollLeft = 0; },
    renderProducts() { renders++; }, renderCart() { cartRenders++; },
    productSpecifications: () => [], describeProduct: product => product.name,
    money: value => String(value), pixPrice: product => product.price * .9, escapeHtml: value => value,
    saveCart() { return false; }, openProductFromUrl() {},
    fetch: () => { requests++; return new Promise(resolve => { resolveFetch = resolve; }); }, console
  };
  vm.createContext(context);
  vm.runInContext(loadSource + '\n' + renderSource, context);
  context.renderProductDetails(initial);
  assert.equal(node('#product-detail-buy').disabled, true);
  const request = context.loadSharedProducts();
  await context.loadSharedProducts();
  assert.equal(requests, 1, 'overlapping refreshes must not race');
  resolveFetch({ ok: true, json: async () => ({ products: [next] }) });
  await request;
  assert.equal(node('#product-detail-buy').disabled, false);
  assert.equal(node('#product-detail-add').disabled, false);
  assert.equal(node('#product-detail-stock').textContent, '22 unidades em estoque.');
  assert.equal(node('#product-detail-dialog').scrollTop, 640);
  assert.equal(node('#related-products').scrollLeft, 180);
  assert.equal(renders, 1);
  const unchanged = context.loadSharedProducts();
  resolveFetch({ ok: true, json: async () => ({ products: [next] }) });
  await unchanged;
  assert.equal(renders, 1, 'unchanged inventory must not rebuild the catalog');
  assert.equal(cartRenders, 0, 'an unchanged empty cart must not rebuild');
  // A later stock update must also disable buying if the last units sell out.
  next = { ...next, stock: 0 };
  const refresh = context.loadSharedProducts();
  resolveFetch({ ok: true, json: async () => ({ products: [next] }) });
  await refresh;
  assert.equal(node('#product-detail-buy').disabled, true);
  assert.equal(node('#product-detail-add').disabled, true);
  assert.equal(node('#product-detail-stock').textContent, 'Produto indisponível no momento.');
});

test('a product opened from its URL does not reopen after the user closes it', () => {
  const urlSource = source.slice(source.indexOf('  function openProductFromUrl()'), source.indexOf('\n  function renderCart()'));
  let opens = 0, available = true;
  const context = {
    initialProductOpened: false, window: { location: { search: '?produto=imported-1' } }, URLSearchParams,
    getProduct: () => available ? { id: 'imported-1' } : null,
    document: { querySelector: () => null }, openProductDetails: () => { opens++; }
  };
  vm.createContext(context); vm.runInContext(urlSource, context);
  context.openProductFromUrl();
  assert.equal(opens, 1);
  context.openProductFromUrl(); context.openProductFromUrl();
  assert.equal(opens, 1, 'background refresh must not reopen a closed product');
  context.initialProductOpened = false; available = false;
  context.openProductFromUrl();
  assert.equal(context.initialProductOpened, false, 'a product known only to the server waits for its first load');
  available = true; context.openProductFromUrl(); context.openProductFromUrl();
  assert.equal(opens, 2);
});

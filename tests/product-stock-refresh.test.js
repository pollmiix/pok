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
  const context = {
    products: [initial], importedProducts: [initial], dashboardState: {}, cart: [], favorites: [],
    detailProductId: initial.id,
    $: node, getProduct: id => context.products.find(product => product.id === id),
    verifiedStock: product => product.stockVerified === true && Number.isInteger(product.stock),
    renderProductGallery() {}, renderRelatedProducts() {}, renderProducts() {}, renderCart() {},
    productSpecifications: () => [], describeProduct: product => product.name,
    money: value => String(value), pixPrice: product => product.price * .9, escapeHtml: value => value,
    saveCart() { return false; }, openProductFromUrl() {},
    fetch: () => new Promise(resolve => { resolveFetch = resolve; }), console
  };
  vm.createContext(context);
  vm.runInContext(loadSource + '\n' + renderSource, context);
  context.renderProductDetails(initial);
  assert.equal(node('#product-detail-buy').disabled, true);
  const request = context.loadSharedProducts();
  resolveFetch({ ok: true, json: async () => ({ products: [next] }) });
  await request;
  assert.equal(node('#product-detail-buy').disabled, false);
  assert.equal(node('#product-detail-add').disabled, false);
  assert.equal(node('#product-detail-stock').textContent, '22 unidades em estoque.');
  // A later stock update must also disable buying if the last units sell out.
  next = { ...next, stock: 0 };
  const refresh = context.loadSharedProducts();
  resolveFetch({ ok: true, json: async () => ({ products: [next] }) });
  await refresh;
  assert.equal(node('#product-detail-buy').disabled, true);
  assert.equal(node('#product-detail-add').disabled, true);
  assert.equal(node('#product-detail-stock').textContent, 'Produto indisponível no momento.');
});

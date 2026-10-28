const fs = require('node:fs');
const path = require('node:path');
const payments = require('./payments');
const INVENTORY_ADJUSTMENT_KEY = 'walkcards:inventory-adjustment:20261028-confirmed-22';
const INVENTORY_BACKUP_KEY = INVENTORY_ADJUSTMENT_KEY + ':before';

// One-time stock adjustment requested and confirmed by the store owner.
// The marker prevents later visits/deployments from replenishing sold stock.
async function applyConfirmedInventory() {
  if (await payments.redis(['GET', INVENTORY_ADJUSTMENT_KEY])) return;
  const lease = await payments.lock();
  if (!lease) throw new Error('Estoque em atualizacao. Tente novamente em alguns segundos.');
  try {
    if (await payments.redis(['GET', INVENTORY_ADJUSTMENT_KEY])) return;
    const raw = await payments.redis(['GET', 'walkcards:products']);
    const shared = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(shared)) throw new Error('Catalogo compartilhado invalido.');
    const byId = new Map(localCatalog().map(product => [product.id, product]));
    for (const product of shared) byId.set(product.id, { ...byId.get(product.id), ...product });
    const stockConfirmedAt = new Date().toISOString();
    const products = [...byId.values()].map(product => ({ ...product,
      stock: 22, stockVerified: true, stockConfirmedAt }));
    const adjustment = JSON.stringify({ stock: 22, count: products.length, confirmedAt: stockConfirmedAt });
    await payments.redis(['EVAL',
      "if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end; "
      + "redis.call('SET', KEYS[2], redis.call('GET', KEYS[1]) or '[]', 'NX'); "
      + "redis.call('SET', KEYS[1], ARGV[1]); redis.call('SET', KEYS[3], ARGV[2]); return 1",
      3, 'walkcards:products', INVENTORY_BACKUP_KEY, INVENTORY_ADJUSTMENT_KEY, JSON.stringify(products), adjustment]);
  } finally {
    await payments.unlock(lease);
  }
}

function normalizeInventory(products, preset) {
  return products.map(product => ({
    ...product,
    stockVerified: product.stockVerified === true && Number.isInteger(product.stock) && product.stock >= 0
      && (preset !== '23-units-each' || Number.isFinite(Date.parse(product.stockConfirmedAt)))
  }));
}

function localCatalog() {
  const source = fs.readFileSync(path.join(__dirname, '../../catalog.js'), 'utf8');
  const match = source.match(/window\.STORE_CATALOG\s*=\s*(\[[\s\S]*\]);?\s*$/);
  const gallerySource = fs.readFileSync(path.join(__dirname, '../../catalog-galleries.js'), 'utf8');
  const galleryMatch = gallerySource.match(/window\.STORE_PRODUCT_GALLERIES\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match || !galleryMatch) throw new Error('Catalogo indisponivel.');
  const galleries = JSON.parse(galleryMatch[1]);
  return JSON.parse(match[1]).map((product, index) => ({
    ...product, id: `imported-${index + 1}`, images: galleries[`imported-${index + 1}`] || [], stockVerified: false
  }));
}

async function publishedCatalog() {
  await applyConfirmedInventory();
  const [raw, preset] = await Promise.all([
    payments.redis(['GET', 'walkcards:products']), payments.redis(['GET', 'walkcards:inventory-preset'])
  ]);
  const shared = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(shared)) throw new Error('Catalogo compartilhado invalido.');
  const byId = new Map(localCatalog().map(product => [product.id, product]));
  for (const product of normalizeInventory(shared, preset)) {
    const local = byId.get(product.id) || {};
    byId.set(product.id, { ...local, ...product,
      images: Array.isArray(product.images) && product.images.length ? product.images : local.images || [] });
  }
  return [...byId.values()];
}

const siteUrl = () => {
  const url = new URL(process.env.WALKCARDS_PUBLIC_URL || 'https://walkcards.online/');
  if (url.protocol !== 'https:') throw new Error('Configure um dominio HTTPS.');
  return url.origin + '/';
};

const productUrl = id => new URL(`produto/${encodeURIComponent(id)}`, siteUrl()).href;
module.exports = { normalizeInventory, publishedCatalog, siteUrl, productUrl,
  applyConfirmedInventory, INVENTORY_ADJUSTMENT_KEY, INVENTORY_BACKUP_KEY };

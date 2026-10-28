const fs = require('node:fs');
const path = require('node:path');
const payments = require('./payments');

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
module.exports = { normalizeInventory, publishedCatalog, siteUrl, productUrl };

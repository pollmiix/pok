const fs = require('node:fs');
const path = require('node:path');

const PRODUCTS_KEY = 'walkcards:products';
const SITE_URL = 'https://walkcards.online/';
const AVAILABLE_PRODUCT_IDS = new Set(Array.from({ length: 23 }, (_, index) => `imported-${index + 1}`));

function xml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function localCatalog() {
  const source = fs.readFileSync(path.join(process.cwd(), 'catalog.js'), 'utf8');
  const match = source.match(/window\.STORE_CATALOG\s*=\s*(\[[\s\S]*\]);?\s*$/);
  if (!match) throw new Error('O catálogo local não pôde ser lido.');
  const gallerySource = fs.readFileSync(path.join(process.cwd(), 'catalog-galleries.js'), 'utf8');
  const galleryMatch = gallerySource.match(/window\.STORE_PRODUCT_GALLERIES\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!galleryMatch) throw new Error('As imagens do catálogo não puderam ser lidas.');
  const galleries = JSON.parse(galleryMatch[1]);
  return JSON.parse(match[1]).map((product, index) => ({
    ...product,
    id: `imported-${index + 1}`,
    images: galleries[`imported-${index + 1}`] || []
  }));
}

async function sharedProducts() {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) throw new Error('O Redis compartilhado não está configurado.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', PRODUCTS_KEY]),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Não foi possível carregar o catálogo compartilhado.');
  const result = await response.json();
  if (result.error) throw new Error('Não foi possível carregar o catálogo compartilhado.');
  if (!result.result) return [];
  const parsed = JSON.parse(result.result);
  if (!Array.isArray(parsed)) throw new Error('O catálogo compartilhado está inválido.');
  return parsed;
}

function productXml(product) {
  const id = String(product.id || '').trim();
  const title = String(product.name || '').trim();
  const price = Number(product.price);
  if (!id || !title || !Number.isFinite(price) || price <= 0) return '';
  const imageSources = [...new Set([product.image, ...(Array.isArray(product.images) ? product.images : [])]
    .filter((value) => typeof value === 'string' && value.trim()))].slice(0, 11);
  const images = imageSources.map((source) => {
    try { return new URL(source, SITE_URL).href; } catch { return ''; }
  }).filter(Boolean);
  if (!images.length) return '';
  const description = String(product.description || `${title}. Confira os detalhes e a disponibilidade na página do produto.`).trim();
  const link = new URL('/', SITE_URL);
  link.searchParams.set('produto', id);
  return `    <item>\n`
    + `      <g:id>${xml(id)}</g:id>\n`
    + `      <g:title>${xml(title)}</g:title>\n`
    + `      <g:description>${xml(description)}</g:description>\n`
    + `      <g:link>${xml(link.href)}</g:link>\n`
    + `      <g:image_link>${xml(images[0])}</g:image_link>\n`
    + images.slice(1).map((image) => `      <g:additional_image_link>${xml(image)}</g:additional_image_link>\n`).join('')
    + `      <g:availability>${product.stockVerified === true && Number.isInteger(product.stock) && product.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>\n`
    + `      <g:price>${price.toFixed(2)} BRL</g:price>\n`
    + `      <g:condition>new</g:condition>\n`
    + (product.brand ? `      <g:brand>${xml(product.brand)}</g:brand>\n` : '')
    + (product.barcode || product.ean ? `      <g:gtin>${xml(product.barcode || product.ean)}</g:gtin>\n` : '')
    + `    </item>`;
}

module.exports = async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const catalog = localCatalog();
    const byId = new Map(catalog.map((product) => [product.id, product]));
    for (const product of await sharedProducts()) {
      const local = byId.get(product.id) || {};
      const merged = {
        ...local,
        ...product,
        images: Array.isArray(product.images) && product.images.length ? product.images : local.images
      };
      if (AVAILABLE_PRODUCT_IDS.has(product.id)
        && !(merged.stockVerified === true && Number.isInteger(merged.stock))) {
        merged.stock = 1;
        merged.stockVerified = true;
      }
      byId.set(product.id, merged);
    }
    for (const id of AVAILABLE_PRODUCT_IDS) {
      const product = byId.get(id);
      if (product && !(product.stockVerified === true && Number.isInteger(product.stock))) {
        product.stock = 1;
        product.stockVerified = true;
      }
    }
    const items = [...byId.values()].map(productXml).filter(Boolean).join('\n');
    res.statusCode = 200;
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`
      + `  <channel>\n`
      + `    <title>Walk Cards</title>\n`
      + `    <link>${xml(SITE_URL)}</link>\n`
      + `    <description>Produtos disponíveis da loja Walk Cards</description>\n`
      + (items ? `${items}\n` : '')
      + `  </channel>\n`
      + `</rss>`);
  } catch (error) {
    console.error('Falha ao gerar feed do Merchant Center.', error.message);
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.end('<?xml version="1.0" encoding="UTF-8"?><error>Feed temporariamente indisponível.</error>');
  }
};

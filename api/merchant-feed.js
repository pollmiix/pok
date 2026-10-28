const { publishedCatalog, siteUrl, productUrl } = require('./_lib/catalog');
const pricing = require('../pricing');

function xml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function productXml(product) {
  const id = String(product.id || '').trim();
  const title = String(product.name || '').trim();
  const price = pricing.pixPrice(product.price);
  if (!id || !title || !Number.isFinite(price) || price <= 0) return '';
  const imageSources = [...new Set([product.image, ...(Array.isArray(product.images) ? product.images : [])]
    .filter((value) => typeof value === 'string' && value.trim()))].slice(0, 11);
  const images = imageSources.map((source) => {
    try { return new URL(source, siteUrl()).href; } catch { return ''; }
  }).filter(Boolean);
  if (!images.length) return '';
  const description = String(product.description || `${title}. Confira os detalhes e a disponibilidade na página do produto.`).trim();
  const link = new URL(productUrl(id));
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
    + `      <g:shipping><g:country>BR</g:country><g:price>0.00 BRL</g:price></g:shipping>\n`
    + (product.brand ? `      <g:brand>${xml(product.brand)}</g:brand>\n` : '')
    + (product.barcode || product.ean ? `      <g:gtin>${xml(product.barcode || product.ean)}</g:gtin>\n` : '')
    + `    </item>`;
}

module.exports = async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const items = (await publishedCatalog()).map(productXml).filter(Boolean).join('\n');
    res.statusCode = 200;
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`
      + `  <channel>\n`
      + `    <title>Walk Cards</title>\n`
      + `    <link>${xml(siteUrl())}</link>\n`
      + `    <description>Catálogo Walk Cards. Preços em reais com desconto no Pix.</description>\n`
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

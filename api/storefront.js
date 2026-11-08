const fs = require('node:fs');
const path = require('node:path');
const { publishedCatalog } = require('./_lib/catalog');
const pricing = require('../pricing');
const productInfo = require('../product-info');

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function renderHome(template, products) {
  const prices = products.map(p => pricing.pixPrice(p.price)).filter(p => Number.isFinite(p) && p > 0);
  const minimum = prices.length ? Math.min(...prices) : null;
  const maximum = prices.length ? Math.max(...prices) : null;
  const shown = products.slice(0, 32);
  const cards = shown.map(product => {
    const available = product.stockVerified === true && Number.isInteger(product.stock) && product.stock > 0;
    const stock = available ? `${product.stock} unidades em estoque` : product.stockVerified ? 'Produto esgotado' : 'Disponibilidade sob consulta';
    const url = `/produto/${encodeURIComponent(product.id)}`;
    return `<article class="store-product"><div class="store-product-image"><a class="product-detail-trigger" href="${url}"><img src="${escape(product.image)}" alt="${escape(product.name)}" loading="lazy"></a></div>
<div class="store-product-info"><a class="store-product-title" href="${url}">${escape(product.name)}</a>
<small class="store-price-note">Preço base: ${money(product.price)}</small><strong class="store-product-price">${money(pricing.pixPrice(product.price))}</strong><small class="store-price-note">no Pix, com 10% de desconto</small>
<span class="store-stock">${stock}</span><p>${escape(productInfo.describeProduct(product))}</p>
<div class="product-card-actions"><a class="view-product" href="${url}">VER PRODUTO</a><button class="add-to-cart" type="button" data-add-product="${escape(product.id)}" ${available ? '' : 'disabled'}>${available ? 'ADICIONAR' : 'INDISPONÍVEL'}</button></div></div></article>`;
  }).join('');
  let output = template.replace(/(id="catalog-total">)[^<]*/, (_, prefix) => `${prefix}${products.length} ${products.length === 1 ? 'produto' : 'produtos'}`);
  for (const [id, price] of [['minimum-price-label', minimum], ['maximum-price-label', maximum], ['price-floor-label', minimum], ['price-ceiling-label', maximum]]) {
    output = output.replace(new RegExp(`(id="${id}">)[^<]*`), (_, prefix) => prefix + (price === null ? 'Sem preços disponíveis' : money(price)));
  }
  output = output.replace('<div class="product-grid" id="store-products"></div>', `<div class="product-grid" id="store-products">${cards}</div>`);
  if (products.length > shown.length) output = output.replace('class="load-more hidden"', 'class="load-more"');
  if (!products.length) output = output.replace('class="no-products hidden"', 'class="no-products"').replace('Não encontramos produtos com essa busca.', 'Nenhum produto disponível no catálogo.');
  const data = JSON.stringify(products).replace(/</g, '\\u003c');
  return output.replace('</head>', `<script>window.STORE_PUBLISHED_CATALOG=${data};</script></head>`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!require('./_lib/payments').admin({ headers: req.headers || {} }) && await require('./_lib/visits').isBlocked(req)) {
      res.statusCode = 403;
      return res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Acesso bloqueado</title><h1>Acesso bloqueado</h1><a href="/contato/">Entre em contato com a loja</a></html>');
    }
    const products = await publishedCatalog();
    const template = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    res.statusCode = 200;
    res.end(renderHome(template, products));
  } catch (error) {
    console.error('Falha ao carregar a loja.', error.message);
    res.statusCode = 503;
    res.setHeader('Retry-After', '60');
    res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catálogo temporariamente indisponível | Walk Cards</title><h1>Não foi possível carregar o catálogo</h1><p>Tente novamente em alguns instantes.</p><a href="/contato/">Fale com a Walk Cards</a></html>');
  }
};
module.exports.renderHome = renderHome;

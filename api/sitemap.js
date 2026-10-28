const { publishedCatalog, siteUrl, productUrl } = require('./_lib/catalog');
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
module.exports = async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pages = ['', 'sobre-nos/', 'contato/', 'politica-de-envio/', 'trocas-devolucoes/', 'politica-de-privacidade/', 'termos-de-uso/'];
    const urls = [...pages.map(page => new URL(page, siteUrl()).href), ...(await publishedCatalog()).map(product => productUrl(product.id))];
    res.statusCode = 200;
    res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + urls.map(url => `<url><loc>${xml(url)}</loc></url>`).join('') + '</urlset>');
  } catch {
    res.statusCode = 503;
    res.end('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap temporariamente indisponível.</error>');
  }
};

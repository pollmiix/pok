const { publishedCatalog, siteUrl, productUrl } = require('./_lib/catalog');
const pricing = require('../pricing');

const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!require('./_lib/payments').admin({ headers: req.headers || {} }) && await require('./_lib/visits').isBlocked(req)) { res.statusCode = 403; return res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Acesso bloqueado</title><h1>Acesso bloqueado</h1><p>Entre em contato com a loja.</p></html>'); }
    const id = typeof req.query?.id === 'string' ? req.query.id : '';
    const product = (await publishedCatalog()).find(item => item.id === id);
    if (!product) {
      res.statusCode = 404;
      return res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Produto não encontrado | Walk Cards</title><h1>Produto não encontrado</h1><a href="/">Voltar à loja</a></html>');
    }
    const price = pricing.pixPrice(product.price);
    const available = product.stockVerified && product.stock > 0;
    const description = product.description || `${product.name}. Consulte as características e a disponibilidade na página do produto.`;
    const images = [...new Set([product.image, ...(product.images || [])].filter(Boolean))]
      .map(source => new URL(source, siteUrl())).filter(url => /^https?:$/.test(url.protocol)).map(url => url.href);
    const url = productUrl(id);
    const structured = {
      '@context': 'https://schema.org', '@type': 'Product', name: product.name, description,
      image: images, sku: id, url,
      ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
      ...(/^\d{8}$|^\d{12,14}$/.test(product.barcode || product.ean || '') ? { gtin: product.barcode || product.ean } : {}),
      offers: { '@type': 'Offer', url, price: price.toFixed(2), priceCurrency: 'BRL',
        itemCondition: 'https://schema.org/NewCondition',
        availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'Walk Cards' },
        shippingDetails: { '@type': 'OfferShippingDetails',
          shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'BRL' },
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'BR' } } }
    };
    const checkout = new URL('/', siteUrl());
    checkout.searchParams.set('produto', id);
    res.statusCode = 200;
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(product.name)} | Walk Cards</title><meta name="description" content="${html(description)}"><link rel="canonical" href="${html(url)}">
<meta property="og:type" content="product"><meta property="og:title" content="${html(product.name)}"><meta property="og:url" content="${html(url)}">
<meta property="og:image" content="${html(images[0] || '')}"><link rel="stylesheet" href="/institucional.css">
<style>.product-page{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}.product-photo{width:100%;max-height:480px;object-fit:contain}.product-price{font-size:30px;font-weight:700}.product-gallery{display:flex;gap:10px;overflow:auto}.product-gallery img{width:90px;height:90px;object-fit:contain}@media(max-width:680px){.product-page{grid-template-columns:1fr}}</style>
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script><script src="/visits.js?v=20261030" defer></script></head><body>
<header class="info-header"><a href="/"><img src="/assets/walk-cards-logo.jpg" alt="Walk Cards"></a><nav aria-label="Navegação"><a href="/">Loja</a><a href="/contato/">Contato</a><a href="/trocas-devolucoes/">Devoluções</a></nav></header>
<main class="info-main"><p><a href="/">Início</a> / Produto</p><div class="product-page"><section aria-label="Imagens do produto">${images[0] ? `<img class="product-photo" src="${html(images[0])}" alt="${html(product.name)}">` : ''}<div class="product-gallery">${images.slice(1, 9).map(image => `<img src="${html(image)}" alt="Outra imagem de ${html(product.name)}" loading="lazy">`).join('')}</div></section>
<section><h1>${html(product.name)}</h1><p>Preço base: ${money(product.price)}</p><p class="product-price">${money(price)} <small>no Pix</small></p><p>10% de desconto no Pix já aplicado ao preço acima.</p><p>${available ? `${product.stock} unidades em estoque.` : product.stockVerified ? 'Produto esgotado.' : 'Disponibilidade sob consulta.'}</p>
<p>${html(description)}</p><p>Frete grátis para todo o Brasil. Entrega estimada em 7 a 9 dias úteis após a confirmação do pagamento.</p>${available ? `<a class="info-button" href="${html(checkout.href)}">Comprar no Pix</a>` : '<a class="info-button" href="/contato/">Consultar disponibilidade</a>'}
<p><a href="/politica-de-envio/">Política de envio</a> · <a href="/trocas-devolucoes/">Trocas, devoluções e reembolsos</a></p></section></div></main>
<footer class="info-footer"><a href="/"><img src="/assets/walk-cards-logo.jpg" alt="Walk Cards"></a><nav><a href="/sobre-nos/">Sobre nós</a><a href="/contato/">Contato</a><a href="/politica-de-privacidade/">Privacidade</a><a href="/politica-de-envio/">Envio</a><a href="/trocas-devolucoes/">Devoluções</a><a href="/termos-de-uso/">Termos</a></nav><div class="info-footer-contact"><strong>Time Walk Cards Colecionaveis LTDA · CNPJ 19.271.540/0001-38</strong><span>Avenida Antonio Carlos Costa, 1001, Setor 2, Bela Vista, Osasco/SP · CEP 06053-014</span><a href="mailto:timewcolecionaveis@gmail.com">timewcolecionaveis@gmail.com</a><a href="https://wa.me/5511993983387">WhatsApp (11) 99398-3387</a></div></footer></body></html>`);
  } catch (error) {
    console.error('Falha ao carregar produto.', error.message);
    res.statusCode = 503;
    res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Produto temporariamente indisponível | Walk Cards</title><h1>Não foi possível carregar o produto</h1><p>Tente novamente mais tarde.</p><a href="/">Voltar à loja</a></html>');
  }
};

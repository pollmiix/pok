(() => {
  'use strict';
  if (!/^https?:$/.test(location.protocol)) return;
  let id;
  try {
    id = sessionStorage.getItem('walkcards-visit');
    if (!/^[a-f0-9-]{36}$/i.test(id || '')) {
      id = crypto.randomUUID();
      sessionStorage.setItem('walkcards-visit', id);
    }
  } catch { id = crypto.randomUUID(); }
  let pending = false;
  let blocked = false;
  const shown = selector => {
    const node = document.querySelector(selector);
    return Boolean(node && node.getClientRects().length);
  };
  function activity() {
    const product = document.querySelector('#product-detail-title')?.textContent || document.querySelector('main h1')?.textContent || '';
    let stage = 'Navegando';
    if (shown('#product-detail-dialog[open]') || location.pathname.startsWith('/produto/')) stage = 'Visualizando produto';
    if (shown('#cart-view') || shown('#mini-cart-dialog[open]')) stage = 'Carrinho';
    if (shown('#buyer-view')) stage = 'Checkout';
    if (shown('#payment-view')) stage = shown('#payment-thanks') && document.querySelector('#payment-thanks strong')?.textContent === 'Pagamento confirmado!'
      ? 'Pagamento confirmado' : 'Pix gerado · Aguardando pagamento';
    const cartNames = [...document.querySelectorAll('#cart-lines .cart-line-copy h3')].map(node => node.textContent).join(', ');
    return { stage, product: stage === 'Visualizando produto' ? product : ['Carrinho', 'Checkout', 'Pix gerado · Aguardando pagamento'].includes(stage) ? cartNames : '' };
  }
  function deny() {
    if (blocked) return;
    blocked = true;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f6f7fb;display:grid;place-content:center;text-align:center;padding:24px;font:16px Segoe UI,sans-serif;color:#20233a';
    const title = document.createElement('h1'); title.textContent = 'Acesso bloqueado';
    const copy = document.createElement('p'); copy.textContent = 'Entre em contato com a loja para solicitar a liberação do acesso.';
    const link = document.createElement('a'); link.href = '/contato/'; link.textContent = 'Contato da loja';
    overlay.append(title, copy, link);
    document.body.append(overlay);
  }
  async function send() {
    if (pending || blocked) return;
    pending = true;
    try {
      const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, page: location.pathname, referrer: document.referrer, visible: !document.hidden, ...activity() }), keepalive: true });
      if (response.status === 403 && (await response.json()).blocked) deny();
    } catch { /* Tracking never prevents shopping when the service is unavailable. */ }
    finally { pending = false; }
  }
  send();
  setInterval(() => { if (!document.hidden) send(); }, 15000);
  document.addEventListener('visibilitychange', send);
  window.addEventListener('pagehide', send);
  document.addEventListener('click', () => setTimeout(send, 500));
})();

(function (root) {
  'use strict';
  const cents = price => Math.round(Number(price) * 100);
  // Round the discounted unit once, then multiply by quantity in every checkout.
  const pixCents = price => Math.floor((cents(price) * 90 + 50) / 100);
  const pricing = { cents, pixCents, pixPrice: price => pixCents(price) / 100 };
  if (typeof module === 'object' && module.exports) module.exports = pricing;
  else root.StorePricing = pricing;
})(typeof window === 'undefined' ? globalThis : window);

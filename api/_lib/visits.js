const crypto = require('node:crypto');
const p = require('./payments');

const INDEX = 'walkcards:visits:index';
const BLOCKS = 'walkcards:visits:blocks';
const PREFIX = 'walkcards:visit:';
const RETENTION = 30 * 24 * 60 * 60;
const text = (value, limit = 200) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
function ipOf(req) {
  return text(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress, 200).split(',')[0].trim();
}
const ipKey = ip => crypto.createHash('sha256').update(ip).digest('hex');
async function blocks() { return JSON.parse(await p.redis(['GET', BLOCKS]) || '{}'); }
async function isBlocked(req) {
  const ip = ipOf(req);
  return Boolean(ip && (await blocks())[ipKey(ip)]);
}
function agent(ua) {
  const device = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /macintosh|mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Desconhecido';
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Desconhecido';
  return { device, browser };
}
function location(req) {
  return ['x-vercel-ip-city', 'x-vercel-ip-country-region', 'x-vercel-ip-country'].map(key => {
    const value = text(req.headers?.[key], 100);
    try { return decodeURIComponent(value); } catch { return value; }
  }).filter(Boolean).join(' / ') || 'Indisponível';
}
function pagePath(value) {
  const path = text(value, 400);
  return path.startsWith('/') && !path.startsWith('//') ? path.split(/[?#]/)[0] : '/';
}
function referrer(value) {
  try { const url = new URL(text(value, 1000)); return /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}`.slice(0, 400) : ''; } catch { return ''; }
}
module.exports = { INDEX, BLOCKS, PREFIX, RETENTION, text, ipOf, ipKey, blocks, isBlocked, agent, location, pagePath, referrer };

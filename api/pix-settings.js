const crypto = require('node:crypto');
const payments = require('./_lib/payments');

const AUTH_COOKIE = 'walkcards_admin';
const CSRF_COOKIE = 'walkcards_csrf';
const PIX_SETTINGS_KEY = 'walkcards:pix-settings';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAuthenticated(cookie, secret) {
  if (!cookie || !secret) return false;
  const [expires, signature, extra] = cookie.split('.');
  if (extra !== undefined || !/^\d+$/.test(expires || '') || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', secret).update(String(expires)).digest('base64url');
  return safeEqual(signature, expected);
}

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url: url.replace(/\/+$/, ''), token };
}

async function redisCommand(command) {
  const { url, token } = redisConfig();
  if (!url || !token) throw new Error('O armazenamento compartilhado ainda não foi configurado.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Falha no armazenamento compartilhado (${response.status}).`);
  const result = await response.json();
  if (result.error) throw new Error('Falha no armazenamento compartilhado.');
  return result.result;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') {
    try {
      const stored = await redisCommand(['GET', PIX_SETTINGS_KEY]);
      const settings = stored ? JSON.parse(stored) : { key: '', owner: '' };
      return sendJson(res, 200, { key: settings.key || '', owner: settings.owner || '', gateway: (await payments.settings()).enabled ? 'blackcat' : 'manual' });
    } catch (error) {
      console.error('Não foi possível ler as configurações PIX compartilhadas.', error.message);
      return sendJson(res, 503, { error: 'O armazenamento compartilhado da chave Pix ainda não foi configurado.' });
    }
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  const cookies = parseCookies(req.headers.cookie);
  const adminSecret = process.env.WALKCARDS_ADMIN_PASSWORD || '';
  if (!isAuthenticated(cookies[AUTH_COOKIE], adminSecret)) return sendJson(res, 401, { error: 'Entre no painel para alterar a chave Pix.' });
  const csrfToken = req.headers['x-csrf-token'] || '';
  if (!safeEqual(csrfToken, cookies[CSRF_COOKIE] || '')) return sendJson(res, 403, { error: 'Sessão inválida. Atualize o painel e tente novamente.' });

  try {
    if (req.method === 'DELETE') {
      await redisCommand(['DEL', PIX_SETTINGS_KEY]);
      return sendJson(res, 200, { key: '', owner: '' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    const owner = typeof body.owner === 'string' ? body.owner.trim() : '';
    if (!key || key.length > 180 || owner.length > 100) return sendJson(res, 400, { error: 'Informe uma chave Pix válida e um titular com até 100 caracteres.' });
    const settings = { key, owner };
    await redisCommand(['SET', PIX_SETTINGS_KEY, JSON.stringify(settings)]);
    return sendJson(res, 200, settings);
  } catch (error) {
    console.error('Não foi possível atualizar as configurações PIX compartilhadas.', error.message);
    return sendJson(res, 503, { error: 'Não foi possível salvar a chave Pix compartilhada. Confira a conexão Redis da Vercel.' });
  }
};

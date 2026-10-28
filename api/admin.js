const crypto = require('node:crypto');

const LOGIN_TEMPLATE = Buffer.from('PCFET0NUWVBFIGh0bWw+DQo8aHRtbCBsYW5nPSJwdC1CUiI+DQo8aGVhZD4NCiAgPG1ldGEgY2hhcnNldD0idXRmLTgiPg0KICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEiPg0KICA8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9Im5vaW5kZXgsbm9mb2xsb3ciPg0KICA8bWV0YSBuYW1lPSJ0aGVtZS1jb2xvciIgY29udGVudD0iI2Y1ZjZmYSI+DQogIDx0aXRsZT5QYWluZWwgZGEgbG9qYSB8IFdhbGsgQ2FyZHM8L3RpdGxlPg0KICA8bGluayByZWw9InN0eWxlc2hlZXQiIGhyZWY9Ii4vYWRtaW4uY3NzIj4NCiAgPHNjcmlwdCBzcmM9Ii4vY2F0YWxvZy5qcyIgZGVmZXI+PC9zY3JpcHQ+DQogIDxzY3JpcHQgc3JjPSJodHRwczovL2NkbmpzLmNsb3VkZmxhcmUuY29tL2FqYXgvbGlicy9xcmNvZGUvMS40LjQvcXJjb2RlLm1pbi5qcyIgZGVmZXI+PC9zY3JpcHQ+DQogIDxzY3JpcHQgc3JjPSIuL3BpeC1xci5qcyIgZGVmZXI+PC9zY3JpcHQ+DQogIDxzY3JpcHQgc3JjPSIuL2FkbWluLmpzIiBkZWZlcj48L3NjcmlwdD4NCjwvaGVhZD4NCjxib2R5Pg0KDQogIDxtYWluIGNsYXNzPSJsb2dpbi1zY3JlZW4iIGlkPSJsb2dpbi1zY3JlZW4iPg0KICAgIDxmb3JtIGNsYXNzPSJsb2dpbi1jYXJkIiBpZD0ibG9naW4tZm9ybSIgbWV0aG9kPSJwb3N0IiBhY3Rpb249ImFkbWluLnBocCI+DQogICAgICA8aW1nIGNsYXNzPSJicmFuZC1pbWFnZSBsb2dpbi1tYXJrIiBzcmM9Ii4vYXNzZXRzL3dhbGstY2FyZHMtbG9nby5qcGciIGFsdD0iV2FsayBDYXJkcyI+DQogICAgICA8ZGl2IGNsYXNzPSJsb2dpbi1raWNrZXIiPsOBUkVBIFJFU1RSSVRBPC9kaXY+DQogICAgICA8aDE+QWNlc3NhciBwYWluZWw8L2gxPg0KICAgICAgPHA+RGlnaXRlIGEgc2VuaGEgcGFyYSBlbnRyYXIgbm8gcGFpbmVsIGRhIGxvamEuPC9wPg0KICAgICAgPGlucHV0IHR5cGU9ImhpZGRlbiIgbmFtZT0iY3NyZl90b2tlbiIgdmFsdWU9Int7Q1NSRl9UT0tFTn19Ij4NCiAgICAgIDxsYWJlbCBjbGFzcz0iZmllbGQtbGFiZWwiIGZvcj0icGFuZWwtcGFzc3dvcmQiPlNlbmhhPC9sYWJlbD4NCiAgICAgIDxpbnB1dCBpZD0icGFuZWwtcGFzc3dvcmQiIG5hbWU9ImFkbWluX3Bhc3N3b3JkIiB0eXBlPSJwYXNzd29yZCIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZCBhdXRvZm9jdXMge3tESVNBQkxFRH19Pg0KICAgICAge3tMT0dJTl9FUlJPUn19DQogICAgICA8YnV0dG9uIGNsYXNzPSJidXR0b24gYnV0dG9uLXByaW1hcnkgbG9naW4tc3VibWl0IiB0eXBlPSJzdWJtaXQiIHt7RElTQUJMRUR9fT5FbnRyYXIgbm8gcGFpbmVsPC9idXR0b24+DQogICAgICA8c21hbGw+QWNlc3NvIHByb3RlZ2lkbyBwZWxvIHNlcnZpZG9yLiBDb25maWd1cmUgYSB2YXJpw6F2ZWwgV0FMS0NBUkRTX0FETUlOX1BBU1NXT1JEIG5hIGhvc3BlZGFnZW0gUEhQLjwvc21hbGw+DQogICAgPC9mb3JtPg0KICA8L21haW4+DQoNCjwvYm9keT4NCjwvaHRtbD4NCg==', 'base64').toString('utf8').replace('<body>', '<body class="locked">');
const PANEL_TEMPLATE = require('node:fs').readFileSync(require('node:path').join(__dirname, '_lib/admin-panel.html'), 'utf8');
const AUTH_COOKIE = 'walkcards_admin';
const CSRF_COOKIE = 'walkcards_csrf';
const SESSION_SECONDS = 8 * 60 * 60;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function signedSession(secret, expires) {
  const payload = String(expires);
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isAuthenticated(cookie, secret) {
  if (!cookie || !secret) return false;
  const [expires, signature, extra] = cookie.split('.');
  if (extra !== undefined || !/^\d+$/.test(expires || '') || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, signedSession(secret, Number(expires)).split('.')[1]);
}

function cookiesFor(req, csrfToken, session = null) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  const values = [`${CSRF_COOKIE}=${csrfToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`];
  if (session) values.push(`${AUTH_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`);
  return values;
}

function render(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key] || '');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const parsed = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  return Object.fromEntries(parsed.entries());
}

function sendHtml(res, status, html, cookies) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (cookies) res.setHeader('Set-Cookie', cookies);
  res.end(html);
}

module.exports = async function handler(req, res) {
  const secret = process.env.WALKCARDS_ADMIN_PASSWORD || '';
  const cookies = parseCookies(req.headers.cookie);

  if (req.method === 'GET') {
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const authenticated = isAuthenticated(cookies[AUTH_COOKIE], secret);
    const html = authenticated
      ? render(PANEL_TEMPLATE
        .replace('</nav>', '<button class="nav-item" type="button" data-view="gateway"><span class="nav-icon">◈</span>Gateway</button></nav>')
        .replace('<section class="view-panel hidden" id="view-pix">', require('./_lib/gateway-panel') + '<section class="view-panel hidden" id="view-pix">'), { CSRF_TOKEN: csrfToken })
      : render(LOGIN_TEMPLATE, {
          CSRF_TOKEN: csrfToken,
          DISABLED: secret ? '' : 'disabled',
          LOGIN_ERROR: secret ? '' : '<p class="login-error" id="login-error" role="alert">O painel ainda não foi configurado no servidor.</p>'
        });
    return sendHtml(res, 200, html, cookiesFor(req, csrfToken));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.statusCode = 405;
    return res.end('Método não permitido.');
  }

  const body = await readBody(req);
  const csrfToken = typeof body.csrf_token === 'string' ? body.csrf_token : '';
  if (!safeEqual(csrfToken, cookies[CSRF_COOKIE] || '')) {
    return sendHtml(res, 400, 'Solicitação inválida. Atualize a página e tente novamente.', null);
  }

  if (body.logout) {
    res.statusCode = 303;
    res.setHeader('Location', '/admin.php');
    res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`);
    return res.end();
  }

  if (secret && safeEqual(body.admin_password, secret)) {
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const csrf = crypto.randomBytes(32).toString('hex');
    res.statusCode = 303;
    res.setHeader('Location', '/admin.php');
    res.setHeader('Set-Cookie', cookiesFor(req, csrf, signedSession(secret, expires)));
    return res.end();
  }

  const freshCsrf = crypto.randomBytes(32).toString('hex');
  const html = render(LOGIN_TEMPLATE, {
    CSRF_TOKEN: freshCsrf,
    DISABLED: secret ? '' : 'disabled',
    LOGIN_ERROR: secret
      ? '<p class="login-error" id="login-error" role="alert">Senha incorreta. Tente novamente.</p>'
      : '<p class="login-error" id="login-error" role="alert">O painel ainda não foi configurado no servidor.</p>'
  });
  return sendHtml(res, 401, html, cookiesFor(req, freshCsrf));
};

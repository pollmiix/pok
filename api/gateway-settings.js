const p = require('./_lib/payments');
const qrTest = require('./_lib/gateway-test');

module.exports = async function handler(req, res) {
  if (!p.admin(req)) return p.json(res, 401, { error: 'Entre no painel para configurar o gateway.' });
  try {
    if (req.method === 'GET') {
      return p.json(res, 200, { ...await p.settings(), keyConfigured: Boolean(process.env.BLACKCAT_API_KEY), testCharge: await qrTest.latest() });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return p.json(res, 405, { error: 'Método não permitido.' });
    }
    if (!p.csrf(req)) return p.json(res, 403, { error: 'Sessão inválida. Atualize o painel.' });
    if (['test-qr', 'test-qr-status'].includes(req.body?.action)) return await qrTest.handle(req, res);
    if (req.body?.action === 'test') {
      const seller = await p.blackcat('/sales/seller');
      return p.json(res, 200, { connected: true, seller: String(seller.name || seller.legalName || 'Conta Blackcat') });
    }
    if (typeof req.body?.enabled !== 'boolean') return p.json(res, 400, { error: 'Escolha ativar ou desativar o gateway.' });
    if (req.body.enabled) await p.blackcat('/sales/seller');
    const settings = { provider: 'blackcat', enabled: req.body.enabled };
    await p.redis(['SET', p.SETTINGS_KEY, JSON.stringify(settings)]);
    return p.json(res, 200, { ...settings, keyConfigured: Boolean(process.env.BLACKCAT_API_KEY) });
  } catch (error) {
    return p.json(res, 503, { error: error.message === 'Configure BLACKCAT_API_KEY no servidor.'
      ? error.message : 'Não foi possível conectar. Confira a chave Blackcat e o Redis na hospedagem.' });
  }
};

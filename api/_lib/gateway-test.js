const p = require('./payments');
const LATEST = 'walkcards:blackcat-test:latest';
const PREFIX = 'walkcards:blackcat-test:request:';
const TTL = 7 * 24 * 60 * 60;

async function latest() {
  return JSON.parse(await p.redis(['GET', LATEST]) || 'null');
}

async function handle(req, res) {
  const body = req.body || {};
  if (body.action === 'test-qr-status') {
    if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) return p.json(res, 400, { error: 'Identificador inválido.' });
    const key = PREFIX + body.requestId;
    const record = JSON.parse(await p.redis(['GET', key]) || 'null');
    if (!record?.charge) return p.json(res, 404, { error: 'Cobrança de teste não encontrada.' });
    const charge = record.charge;
    if (await p.redis(['SET', key + ':check', '1', 'NX', 'EX', 10]) !== 'OK') return p.json(res, 200, { charge });
    const data = await p.blackcat(`/sales/${encodeURIComponent(charge.transactionId)}/status`);
    if (data.transactionId !== charge.transactionId || data.amount !== charge.amount || String(data.paymentMethod).toLowerCase() !== 'pix') throw new Error('Resposta de pagamento inválida.');
    charge.status = data.status;
    await p.redis(['SET', key, JSON.stringify(record), 'EX', TTL]);
    const current = await latest();
    if (current?.requestId === charge.requestId) await p.redis(['SET', LATEST, JSON.stringify(charge), 'EX', TTL]);
    return p.json(res, 200, { charge });
  }

  const amount = body.amount;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  const document = typeof body.document === 'string' ? body.document.replace(/\D/g, '') : '';
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10000 || name.length < 3 || name.length > 80
    || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{10,13}$/.test(phone) || !p.validDocument(document)
    || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) {
    return p.json(res, 400, { error: 'Informe valor entre R$ 1,00 e R$ 100,00, nome, e-mail, telefone e CPF/CNPJ válido.' });
  }
  const key = PREFIX + body.requestId;
  const fingerprint = p.digest(JSON.stringify({ amount, name, email, phone, document }));
  const previous = JSON.parse(await p.redis(['GET', key]) || 'null');
  if (previous) {
    if (previous.fingerprint !== fingerprint) return p.json(res, 409, { error: 'Os dados desta tentativa mudaram. Confira a cobrança anterior na Blackcat antes de gerar outra.' });
    if (previous.charge) return p.json(res, 200, { charge: previous.charge });
    return p.json(res, 409, { error: `A tentativa ${body.requestId} precisa ser conferida no painel Blackcat. Não gere outra cobrança antes de conferir.` });
  }
  if (!process.env.BLACKCAT_API_KEY) return p.json(res, 503, { error: 'Configure BLACKCAT_API_KEY no servidor.' });
  if (await p.redis(['SET', PREFIX + 'rate', '1', 'NX', 'EX', 15]) !== 'OK') return p.json(res, 429, { error: 'Aguarde 15 segundos antes de gerar outra cobrança.' });
  // Reserve before calling the provider. Retain ambiguous attempts to prevent automatic duplicate charges.
  if (await p.redis(['SET', key, JSON.stringify({ fingerprint }), 'NX', 'EX', TTL]) !== 'OK') return p.json(res, 409, { error: 'Esta tentativa já está em processamento.' });
  try {
    const data = await p.blackcat('/sales/create-sale', {
      amount, currency: 'BRL', paymentMethod: 'pix',
      items: [{ title: 'Teste de integração Pix — painel Walk Cards', unitPrice: amount, quantity: 1, tangible: false }],
      customer: { name, email, phone, document: { number: document, type: document.length === 11 ? 'cpf' : 'cnpj' } },
      pix: { expiresInDays: 1 }, externalRef: `TEST-${body.requestId}`
    });
    if (typeof data.transactionId !== 'string' || data.amount !== amount) throw new Error('Resposta inválida.');
    const charge = {
      requestId: body.requestId, transactionId: data.transactionId, amount,
      status: data.status, copyPaste: data.paymentData?.copyPaste || data.paymentData?.qrCode || '',
      expiresAt: data.paymentData?.expiresAt || null, createdAt: new Date().toISOString()
    };
    await p.redis(['SET', key, JSON.stringify({ fingerprint, charge }), 'EX', TTL]);
    await p.redis(['SET', LATEST, JSON.stringify(charge), 'EX', TTL]);
    return p.json(res, 201, { charge });
  } catch {
    return p.json(res, 503, { error: `Não foi possível concluir a geração. Confira a referência TEST-${body.requestId} na Blackcat antes de tentar outra cobrança.` });
  }
}

module.exports = { latest, handle };

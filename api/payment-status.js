const p = require('./_lib/payments');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return p.json(res, 405, { error: 'Método não permitido.' });
  }
  let lease;
  try {
    const orders = JSON.parse(await p.redis(['GET', p.ORDERS_KEY]) || '[]');
    const order = orders.find(item => item.id === req.body?.id);
    const token = req.headers['x-order-token'];
    const isAdmin = p.admin(req) && p.csrf(req);
    if (!order?.payment?.transactionId || (!isAdmin && !(typeof token === 'string' && token.length >= 32
      && p.equal(p.digest(token), order.paymentTokenHash)))) return p.json(res, 404, { error: 'Pedido não encontrado.' });
    const rateKey = `walkcards:payment-check:${order.id}`;
    if (await p.redis(['SET', rateKey, '1', 'NX', 'EX', 10]) !== 'OK') {
      return p.json(res, 200, { status: order.status, paymentStatus: order.payment.status });
    }
    lease = await p.lock();
    if (!lease) return p.json(res, 409, { error: 'Pedido em atualização. Tente novamente.' });
    const latest = JSON.parse(await p.redis(['GET', p.ORDERS_KEY]) || '[]');
    const current = latest.find(item => item.id === order.id);
    if (!current) return p.json(res, 404, { error: 'Pedido não encontrado.' });
    await p.reconcile(current);
    await p.redis(['SET', p.ORDERS_KEY, JSON.stringify(latest)]);
    return p.json(res, 200, { status: current.status, paymentStatus: current.payment.status });
  } catch {
    return p.json(res, 503, { error: 'Não foi possível consultar o pagamento agora.' });
  } finally {
    if (lease) await p.unlock(lease).catch(() => {});
  }
};

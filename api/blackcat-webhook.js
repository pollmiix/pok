const p = require('./_lib/payments');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return p.json(res, 405, { error: 'Método não permitido.' });
  }
  const transactionId = req.body?.transactionId;
  if (typeof transactionId !== 'string' || transactionId.length > 150) return p.json(res, 400, { error: 'Transação inválida.' });
  let lease;
  try {
    const initial = JSON.parse(await p.redis(['GET', p.ORDERS_KEY]) || '[]');
    if (!initial.some(order => order.payment?.transactionId === transactionId)) return p.json(res, 200, { received: true });
    lease = await p.lock();
    if (!lease) return p.json(res, 503, { error: 'Tente novamente.' });
    const orders = JSON.parse(await p.redis(['GET', p.ORDERS_KEY]) || '[]');
    const order = orders.find(item => item.payment?.transactionId === transactionId);
    // Webhook headers and body are untrusted. Always fetch the authoritative status using the server key.
    if (order) {
      await p.reconcile(order);
      await p.redis(['SET', p.ORDERS_KEY, JSON.stringify(orders)]);
    }
    return p.json(res, 200, { received: true });
  } catch {
    return p.json(res, 503, { error: 'Não foi possível verificar a transação.' });
  } finally {
    if (lease) await p.unlock(lease).catch(() => {});
  }
};

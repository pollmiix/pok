const p = require('./_lib/payments');
const v = require('./_lib/visits');
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (req.method === 'POST') {
      if (req.headers['sec-fetch-site'] === 'cross-site') return p.json(res, 403, { error: 'Origem inválida.' });
      if (p.admin(req)) return p.json(res, 200, { ok: true });
      if (await v.isBlocked(req)) return p.json(res, 403, { blocked: true, error: 'Acesso bloqueado pela loja.' });
      if (!validId(body.id)) return p.json(res, 400, { error: 'Visita inválida.' });
      const ip = v.ipOf(req);
      const rateKey = `walkcards:visits:rate:${v.ipKey(ip)}`;
      const count = Number(await p.redis(['INCR', rateKey]));
      if (count === 1) await p.redis(['EXPIRE', rateKey, 60]);
      if (count > 90) return p.json(res, 429, { error: 'Aguarde um minuto.' });
      const now = Date.now();
      const record = { id: body.id, ip: ip || 'Indisponível', ...v.agent(v.text(req.headers['user-agent'], 500)),
        location: v.location(req), page: v.pagePath(body.page), referrer: v.referrer(body.referrer),
        stage: ['Navegando', 'Visualizando produto', 'Carrinho', 'Checkout', 'Pix gerado · Aguardando pagamento', 'Pagamento confirmado'].includes(body.stage) ? body.stage : 'Navegando',
        product: v.text(body.product, 160), lastSeen: now, firstSeen: now, visible: body.visible !== false };
      await p.redis(['EVAL', `local old = redis.call('GET', KEYS[1]); local row = cjson.decode(ARGV[1]);
        if old then local prev = cjson.decode(old); row.firstSeen = prev.firstSeen; row.referrer = prev.referrer end;
        redis.call('SET', KEYS[1], cjson.encode(row), 'EX', ARGV[3]);
        redis.call('ZADD', KEYS[2], ARGV[2], row.id);
        redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[4]); return 1`, 2,
      v.PREFIX + body.id, v.INDEX, JSON.stringify(record), now, v.RETENTION, now - v.RETENTION * 1000]);
      return p.json(res, 200, { ok: true });
    }
    if (!p.admin(req)) return p.json(res, 401, { error: 'Entre no painel para consultar as visitas.' });
    if (req.method === 'GET') {
      const now = Date.now();
      await p.redis(['ZREMRANGEBYSCORE', v.INDEX, '-inf', now - v.RETENTION * 1000]);
      const total = Number(await p.redis(['ZCARD', v.INDEX]));
      const pages = Math.max(1, Math.ceil(total / 20));
      const page = Math.min(pages, Math.max(1, Math.floor(Number(req.query?.page) || 1)));
      const ids = await p.redis(['ZREVRANGE', v.INDEX, (page - 1) * 20, page * 20 - 1]);
      const raw = ids.length ? await p.redis(['MGET', ...ids.map(id => v.PREFIX + id)]) : [];
      const blocked = await v.blocks();
      const visits = raw.filter(Boolean).map(row => {
        const visit = JSON.parse(row);
        visit.blocked = Boolean(blocked[v.ipKey(visit.ip)]);
        visit.online = !visit.blocked && visit.visible && now - visit.lastSeen < 45000;
        return visit;
      });
      // Online includes only foreground sessions with a recent heartbeat.
      const activeIds = await p.redis(['ZRANGEBYSCORE', v.INDEX, now - 45000, '+inf']);
      const active = activeIds.length ? await p.redis(['MGET', ...activeIds.map(id => v.PREFIX + id)]) : [];
      const online = active.filter(Boolean).map(JSON.parse).filter(row => row.visible && !blocked[v.ipKey(row.ip)]).length;
      return p.json(res, 200, { visits, total, online, page, pages, updatedAt: now });
    }
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (!p.csrf(req)) return p.json(res, 403, { error: 'Atualize o painel e tente novamente.' });
      if (req.method === 'PATCH' && body.action === 'unblock-all') {
        await p.redis(['DEL', v.BLOCKS]);
        return p.json(res, 200, { ok: true });
      }
      if (!validId(body.id)) return p.json(res, 400, { error: 'Visita inválida.' });
      if (req.method === 'DELETE') {
        await p.redis(['EVAL', "redis.call('DEL', KEYS[1]); redis.call('ZREM', KEYS[2], ARGV[1]); return 1", 2, v.PREFIX + body.id, v.INDEX, body.id]);
        return p.json(res, 200, { ok: true });
      }
      if (!['block', 'unblock'].includes(body.action)) return p.json(res, 400, { error: 'Ação inválida.' });
      const raw = await p.redis(['GET', v.PREFIX + body.id]);
      if (!raw) return p.json(res, 404, { error: 'Visita não encontrada.' });
      const ip = JSON.parse(raw).ip;
      if (!ip || ip === 'Indisponível') return p.json(res, 400, { error: 'IP indisponível.' });
      await p.redis(['EVAL', `local data = cjson.decode(redis.call('GET', KEYS[1]) or '{}');
        if ARGV[2] == 'block' then data[ARGV[1]] = true else data[ARGV[1]] = nil end;
        redis.call('SET', KEYS[1], cjson.encode(data)); return 1`, 1, v.BLOCKS, v.ipKey(ip), body.action]);
      return p.json(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return p.json(res, 405, { error: 'Método não permitido.' });
  } catch (error) {
    console.error('Falha nas visitas:', error.message);
    return p.json(res, 503, { error: 'Não foi possível acessar as visitas. Confira a configuração do Redis na hospedagem.' });
  }
};

(() => {
  'use strict';
  const root = document.querySelector('#visits-panel');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  let page = 1, pages = 1, busy = false;
  let events = null, connected = false, refreshQueued = false, refreshTimer;
  const liveStatus = document.createElement('span');
  liveStatus.className = 'visit-live-status';
  liveStatus.setAttribute('role', 'status');
  $('#visits-refresh').before(liveStatus);
  function showConnection(label, online = false) {
    liveStatus.textContent = label;
    liveStatus.classList.toggle('connected', online);
  }
  function scheduleRefresh() {
    if (!$('#visits-auto').checked || document.hidden) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (busy) refreshQueued = true; else load(); }, 80);
  }
  function stopLive() {
    events?.close(); events = null; connected = false;
  }
  function startLive() {
    stopLive();
    if (!$('#visits-auto').checked) { showConnection('Atualização pausada'); return; }
    if (document.hidden) return;
    if (!window.EventSource) { showConnection('Atualizando a cada 2 segundos'); return; }
    showConnection('Conectando ao vivo…');
    events = new EventSource('/api/visits?live=1');
    events.addEventListener('ready', () => {
      connected = true;
      showConnection('● Ao vivo', true);
      scheduleRefresh();
    });
    events.addEventListener('change', scheduleRefresh);
    events.onerror = () => { connected = false; showConnection('Reconectando · atualização a cada 2 segundos'); };
  }
  const csrf = () => document.querySelector('input[name="csrf_token"]')?.value || '';
  const date = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  function cell(row, value, className = '') {
    const td = row.insertCell(); td.textContent = value; td.className = className; return td;
  }
  function button(label, action, id) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'text-button'; node.textContent = label;
    node.dataset.visitAction = action; node.dataset.visitId = id;
    if (action === 'delete' || action === 'block') node.classList.add('danger-text-button');
    return node;
  }
  async function request(method = 'GET', body) {
    const response = await fetch(`/api/visits?page=${page}`, { method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar as visitas.');
    return result;
  }
  function render(data) {
    page = data.page; pages = data.pages;
    $('#visits-total').textContent = data.total;
    $('#visits-online').textContent = data.online;
    $('#visits-pagination').textContent = `Página ${page} de ${pages} (${data.total} registros)`;
    $('#visits-prev').disabled = page <= 1;
    $('#visits-next').disabled = page >= pages;
    $('#visits-updated').textContent = `Atualizado em ${date(data.updatedAt)}`;
    $('#visits-empty').classList.toggle('hidden', data.visits.length > 0);
    const fragment = document.createDocumentFragment();
    data.visits.forEach(visit => {
      const row = document.createElement('tr');
      cell(row, '').append(button(visit.blocked ? 'Desbloquear IP' : 'Bloquear IP', visit.blocked ? 'unblock' : 'block', visit.id));
      cell(row, '').append(button('Excluir', 'delete', visit.id));
      cell(row, date(visit.lastSeen));
      cell(row, visit.ip);
      cell(row, visit.device);
      cell(row, visit.browser);
      const status = document.createElement('span');
      status.className = `visit-status ${visit.blocked ? 'blocked' : visit.online ? 'online' : 'offline'}`;
      status.textContent = visit.blocked ? 'Bloqueado' : visit.online ? '● Online' : 'Offline';
      cell(row, '').append(status);
      const stage = cell(row, visit.stage, 'visit-stage');
      if (visit.product) { const product = document.createElement('small'); product.textContent = visit.product; stage.append(product); }
      const identifier = document.createElement('small'); identifier.textContent = `Visitante ${visit.id.slice(0, 8)}`; stage.append(identifier);
      const pageCell = cell(row, '');
      const link = document.createElement('a'); link.href = visit.page; link.textContent = visit.page;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; pageCell.append(link);
      const ref = cell(row, visit.referrer || 'Acesso direto', 'visit-origin'); ref.title = visit.referrer || 'Acesso direto';
      cell(row, visit.location);
      fragment.append(row);
    });
    $('#visits-body').replaceChildren(fragment);
  }
  async function load(action) {
    if (busy) { if (!action) refreshQueued = true; return; }
    busy = true; root.setAttribute('aria-busy', 'true');
    $('#visits-error').textContent = '';
    try {
      if (action) await request(action.action === 'delete' ? 'DELETE' : 'PATCH', action);
      render(await request());
    } catch (error) { $('#visits-error').textContent = error.message; }
    finally {
      busy = false; root.setAttribute('aria-busy', 'false');
      if (refreshQueued) { refreshQueued = false; scheduleRefresh(); }
    }
  }
  $('#visits-refresh').addEventListener('click', () => load());
  $('#visits-prev').addEventListener('click', () => { if (!busy && page > 1) { page--; load(); } });
  $('#visits-next').addEventListener('click', () => { if (!busy && page < pages) { page++; load(); } });
  $('#visits-unblock-all').addEventListener('click', () => {
    if (confirm('Desbloquear todos os IPs da loja?')) load({ action: 'unblock-all' });
  });
  root.addEventListener('click', event => {
    const node = event.target.closest('[data-visit-action]');
    if (!node || busy) return;
    const action = node.dataset.visitAction;
    if (action === 'block' && !confirm('Bloquear este IP? Todos os visitantes que usam este IP perderão acesso à loja e ao checkout.')) return;
    if (action === 'delete' && !confirm('Excluir este registro de visita? Se o visitante continuar navegando, uma nova atividade poderá aparecer.')) return;
    load({ action, id: node.dataset.visitId });
  });
  load();
  startLive();
  $('#visits-auto').addEventListener('change', startLive);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopLive(); else { startLive(); scheduleRefresh(); } });
  window.addEventListener('pagehide', stopLive);
  window.addEventListener('pageshow', event => { if (event.persisted) { startLive(); scheduleRefresh(); } });
  // Recover dropped events and expire visitors whose connection ended abruptly.
  setInterval(() => { if ($('#visits-auto').checked && !document.hidden) load(); }, 2000);
})();

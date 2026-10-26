module.exports = `<section class="view-panel hidden" id="view-gateway">
  <div class="section-heading"><div><h2>Gateway de pagamento</h2><p>Configure o Pix automático da sua loja.</p></div></div>
  <article class="panel settings-card">
    <div class="settings-icon" aria-hidden="true">◈</div>
    <div class="settings-copy"><h3>Blackcat</h3><p>Gera um Pix por pedido e confirma o recebimento pela API.</p>
      <a href="https://docs.blackcatoficial.com/" target="_blank" rel="noopener noreferrer">Ver documentação</a></div>
    <form class="settings-form" id="gateway-settings-form">
      <p id="gateway-status" role="status">Carregando configuração…</p>
      <p id="gateway-key-status"></p>
      <label class="stock-verified-label"><input id="gateway-enabled" type="checkbox" disabled> Usar Blackcat para novos pagamentos Pix</label>
      <p class="form-hint">Com a Blackcat desativada, o checkout usa a chave Pix manual cadastrada na aba PIX.</p>
      <button class="button button-primary" id="gateway-save" type="submit" disabled>Salvar configuração</button>
      <button class="button button-secondary" id="gateway-test" type="button" disabled>Testar conexão</button>
    </form>
  </article>
</section>`;

module.exports = `<section class="view-panel hidden" id="view-gateway">
  <div class="section-heading"><div><h2>Gateway de pagamento</h2><p>Configure o Pix automático da sua loja.</p></div></div>
  <article class="panel settings-card">
    <div class="settings-icon" aria-hidden="true">◈</div>
    <div class="settings-copy"><h3>Blackcat</h3><p>Gera um Pix por pedido e confirma o recebimento pela API.</p></div>
    <form class="settings-form" id="gateway-settings-form">
      <p id="gateway-status" role="status">Carregando configuração…</p>
      <p id="gateway-key-status"></p>
      <label class="stock-verified-label"><input id="gateway-enabled" type="checkbox" disabled> Usar Blackcat para novos pagamentos Pix</label>
      <p class="form-hint">Com a Blackcat desativada, o checkout usa a chave Pix manual cadastrada na aba PIX.</p>
      <button class="button button-primary" id="gateway-save" type="submit" disabled>Salvar configuração</button>
      <button class="button button-secondary" id="gateway-test" type="button" disabled>Testar conexão</button>
    </form>
  </article>
  <article class="panel settings-card gateway-qr-card">
    <div class="settings-icon" aria-hidden="true">▦</div>
    <div class="settings-copy"><h3>Testar QR Code Blackcat</h3><p>Crie uma cobrança Pix para conferir o QR Code e a confirmação do pagamento.</p>
      <p><strong>Este teste cria uma cobrança real na sua conta Blackcat.</strong> Se pagar o Pix, haverá movimentação financeira e poderão ser cobradas taxas. Use seus próprios dados.</p>
      <p>Este teste não cria pedido de produto nem altera o estoque da loja.</p></div>
    <form class="settings-form" id="gateway-qr-form">
      <label class="field-label" for="gateway-qr-amount">Valor (R$)</label>
      <input id="gateway-qr-amount" type="number" min="1" max="100" step="0.01" value="1.00" required>
      <label class="field-label" for="gateway-qr-name">Nome completo</label>
      <input id="gateway-qr-name" type="text" maxlength="80" autocomplete="name" required>
      <label class="field-label" for="gateway-qr-email">E-mail</label>
      <input id="gateway-qr-email" type="email" maxlength="120" autocomplete="email" required>
      <label class="field-label" for="gateway-qr-phone">Telefone com DDD</label>
      <input id="gateway-qr-phone" type="tel" maxlength="25" autocomplete="tel" required>
      <label class="field-label" for="gateway-qr-document">CPF ou CNPJ</label>
      <input id="gateway-qr-document" type="text" inputmode="numeric" maxlength="18" autocomplete="off" required>
      <label class="stock-verified-label"><input id="gateway-qr-consent" type="checkbox" required> Entendo que será criada uma cobrança real.</label>
      <button class="button button-primary" id="gateway-qr-generate" type="submit" disabled>Gerar QR Code de teste</button>
      <p id="gateway-qr-status" role="status"></p>
      <div id="gateway-qr-result" class="hidden">
        <p id="gateway-qr-details"></p>
        <canvas id="gateway-qr-canvas" aria-label="QR Code Pix de teste Blackcat"></canvas>
        <label class="field-label" for="gateway-qr-code">Pix copia e cola</label>
        <textarea id="gateway-qr-code" rows="4" readonly></textarea>
        <button class="button button-secondary" id="gateway-qr-copy" type="button">Copiar Pix</button>
        <button class="button button-secondary" id="gateway-qr-check" type="button">Consultar pagamento</button>
      </div>
    </form>
  </article>
</section>`;

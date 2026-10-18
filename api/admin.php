<?php
$adminPassword = getenv('WALKCARDS_ADMIN_PASSWORD');
$configured = is_string($adminPassword) && $adminPassword !== '';
$secureCookie = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params(['httponly' => true, 'secure' => $secureCookie, 'samesite' => 'Strict', 'path' => '/']);
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
if (!isset($_SESSION['admin_csrf'])) { $_SESSION['admin_csrf'] = bin2hex(random_bytes(32)); }
$csrfToken = $_SESSION['admin_csrf'];
$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedToken = $_POST['csrf_token'] ?? '';
    if (!is_string($submittedToken) || !hash_equals($csrfToken, $submittedToken)) { http_response_code(400); exit('Solicitação inválida. Atualize a página e tente novamente.'); }
    if (isset($_POST['logout'])) { $_SESSION = []; session_regenerate_id(true); header('Location: admin.php', true, 303); exit; }
    $submittedPassword = $_POST['admin_password'] ?? '';
    if ($configured && is_string($submittedPassword) && hash_equals($adminPassword, $submittedPassword)) {
        session_regenerate_id(true); $_SESSION['admin_authenticated'] = true; $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
        header('Location: admin.php', true, 303); exit;
    }
    $loginError = $configured ? 'Senha incorreta. Tente novamente.' : 'O painel ainda não foi configurado no servidor.';
}
$authenticated = ($_SESSION['admin_authenticated'] ?? false) === true;
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#f5f6fa">
  <title>Painel da loja | Walk Cards</title>
  <link rel="stylesheet" href="./admin.css">
  <script src="./catalog.js" defer></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.4.4/qrcode.min.js" defer></script>
  <script src="./pix-qr.js" defer></script>
  <script src="./admin.js" defer></script>
</head>
<body>
  <?php if (!$authenticated): ?>
  <main class="login-screen" id="login-screen">
    <form class="login-card" id="login-form" method="post" action="admin.php">
      <img class="brand-image login-mark" src="./assets/walk-cards-logo.jpg" alt="Walk Cards">
      <div class="login-kicker">ÁREA RESTRITA</div>
      <h1>Acessar painel</h1>
      <p>Digite a senha para entrar no painel da loja.</p>
      <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
      <label class="field-label" for="panel-password">Senha</label>
      <input id="panel-password" name="admin_password" type="password" autocomplete="current-password" required autofocus <?= $configured ? '' : 'disabled' ?>>
      <?php if ($loginError !== ''): ?><p class="login-error" id="login-error" role="alert"><?= htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>
      <button class="button button-primary login-submit" type="submit" <?= $configured ? '' : 'disabled' ?>>Entrar no painel</button>
      <small>Acesso protegido pelo servidor. Configure a variável WALKCARDS_ADMIN_PASSWORD na hospedagem PHP.</small>
    </form>
  </main>
  <?php else: ?>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#inicio" aria-label="Walk Cards, início">
        <img class="brand-image" src="./assets/walk-cards-logo.jpg" alt="Walk Cards">
        <span><strong>Walk Cards</strong><small>PAINEL DA LOJA</small></span>
      </a>

      <div class="nav-label">MENU PRINCIPAL</div>
      <nav class="navigation" aria-label="Menu principal">
        <button class="nav-item active" type="button" data-view="overview"><span class="nav-icon">⌂</span>Visão geral</button>
        <button class="nav-item" type="button" data-view="sales"><span class="nav-icon">↗</span>Vendas <span class="nav-count" id="sales-nav-count">0</span></button>
        <button class="nav-item" type="button" data-view="products"><span class="nav-icon">▦</span>Produtos <span class="nav-count" id="products-nav-count">0</span></button>
        <button class="nav-item" type="button" data-view="pix"><span class="nav-icon">◇</span>PIX</button>
      </nav>

      <div class="sidebar-bottom">
        <div class="local-card">
          <span class="local-indicator"></span>
          <div><strong>Modo local</strong><small>Dados neste navegador</small></div>
        </div>
        <p>Este painel é uma demonstração. Não está conectado a pagamentos nem a um servidor.</p>
        <form method="post" action="admin.php"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>"><button class="logout-button" type="submit" name="logout" value="1">Sair do painel</button></form>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div>
          <div class="eyebrow">LOJA DE CARTAS POKÉMON</div>
          <h1 id="page-title">Visão geral</h1>
        </div>
        <div class="topbar-actions">
          <span class="demo-chip"><span></span>DEMONSTRAÇÃO</span>
          <form method="post" action="admin.php"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>"><button class="button button-secondary" type="submit" name="logout" value="1">Sair</button></form>
        </div>
      </header>

      <div class="page-content">
        <section class="notice" aria-label="Aviso sobre os dados">
          <span class="notice-icon" aria-hidden="true">i</span>
          <p><strong>Modo de teste local.</strong> Pedidos feitos na loja neste navegador aparecem aqui como aguardando confirmação. Confira o pagamento no seu banco antes de confirmar; pagamentos não são verificados automaticamente. Pedidos de outros aparelhos não chegam a este painel sem um servidor.</p>
          <button class="notice-close" type="button" aria-label="Fechar aviso" id="notice-close">×</button>
        </section>

        <section class="view-panel" id="view-overview">
          <div class="section-heading">
            <div><h2>Resumo da loja</h2><p>Acompanhe os registros feitos neste painel.</p></div>
            <span class="date-label" id="today-label"></span>
          </div>

          <div class="stats-grid">
            <article class="stat-card">
              <div class="stat-top"><span>Faturamento confirmado</span><span class="stat-icon violet">R$</span></div>
              <strong id="stat-revenue">R$ 0,00</strong>
              <small>Confirmado manualmente no banco</small>
              <div class="stat-finance-details"><div><span>Total gerado</span><strong id="stat-generated-total">R$ 0,00</strong></div><div><span>Aguardando confirmação</span><strong id="stat-pending-total">R$ 0,00</strong></div></div>
            </article>
            <article class="stat-card">
              <div class="stat-top"><span>Pedidos recebidos</span><span class="stat-icon blue">↗</span></div>
              <strong id="stat-sales">0</strong>
              <small>Pedidos feitos pelo checkout</small>
            </article>
            <article class="stat-card">
              <div class="stat-top"><span>Ticket médio</span><span class="stat-icon green">◎</span></div>
              <strong id="stat-average">R$ 0,00</strong>
              <small>Pagamentos confirmados manualmente</small>
            </article>
            <article class="stat-card">
              <div class="stat-top"><span>Produtos no catálogo</span><span class="stat-icon orange">▦</span></div>
              <strong id="stat-products">0</strong>
              <small id="stat-stock-note">Estoque não informado</small>
            </article>
          </div>

          <div class="dashboard-grid">
            <article class="panel privacy-panel">
              <div class="privacy-symbol" aria-hidden="true">◇</div>
              <h3>Privacidade por padrão</h3>
              <p>Este painel demonstrativo salva dados no armazenamento local deste navegador. A hospedagem do site pode registrar dados técnicos de acesso, conforme a configuração do provedor.</p>
              <div class="privacy-details"><span>IP</span><strong>Não coletado</strong></div>
              <div class="privacy-details"><span>Endereço</span><strong>Usado para entrega</strong></div>
            </article>
          </div>

          <article class="panel table-panel">
            <div class="panel-heading">
              <div><h3>Pedidos recentes</h3><p>Pedidos do checkout local; confirme no banco antes de marcar como pago.</p></div>
              <div class="panel-heading-actions"><button class="text-button danger-text-button" type="button" id="clear-orders-button">Limpar pedidos</button><button class="text-button" type="button" data-open-view="sales">Ver todas <span aria-hidden="true">→</span></button></div>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>DATA</th><th>VALOR</th><th>STATUS</th></tr></thead>
                <tbody id="recent-sales-body"></tbody>
              </table>
            </div>
            <div class="empty-state hidden" id="recent-sales-empty">Ainda não há pedidos do checkout.</div>
          </article>
        </section>

        <section class="view-panel hidden" id="view-sales">
          <div class="section-heading">
            <div><h2>Pedidos</h2><p>Pedidos feitos no checkout deste navegador; confira o PIX no banco antes de confirmar.</p></div>
          </div>
          <article class="panel table-panel">
            <div class="panel-heading">
              <div><h3>Pedidos do checkout</h3><p id="sales-total-label">0 pedidos</p></div>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>PEDIDO</th><th>PRODUTO</th><th>CLIENTE / WHATSAPP</th><th>DATA</th><th>VALOR</th><th>STATUS</th><th></th></tr></thead>
                <tbody id="sales-body"></tbody>
              </table>
            </div>
            <div class="empty-state hidden" id="sales-empty">Nenhum pedido recebido neste navegador.</div>
          </article>
        </section>

        <section class="view-panel hidden" id="view-pix">
          <div class="section-heading">
            <div><h2>Pagamento por PIX</h2><p>Cadastre uma chave pública para exibir na finalização do pedido.</p></div>
          </div>
          <article class="panel settings-card">
            <div class="settings-icon">◇</div>
            <div class="settings-copy">
              <h3>Chave PIX da loja</h3>
              <p>Salve sua chave para gerar um QR Code PIX de teste no painel e exibi-lo no checkout. Confira o recebimento no banco antes de confirmar o pedido.</p>
            </div>
            <form id="pix-settings-form" class="settings-form">
              <label class="field-label" for="pix-owner">Nome que aparecerá para o cliente (opcional)</label>
              <input id="pix-owner" type="text" maxlength="100" placeholder="Nome do titular">
              <label class="field-label" for="pix-key">Sua chave PIX</label>
              <input id="pix-key" type="text" maxlength="180" autocomplete="off" placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória" required>
              <p class="form-hint">A chave é pública e ficará visível aos clientes. A configuração é salva só neste navegador.</p>
              <button class="button button-primary" type="submit">Salvar chave PIX</button>
              <button class="button button-secondary hidden" type="button" id="remove-pix-button">Remover chave</button>
            </form>
          </article>
          <article class="panel pix-test-card">
            <div><h3>Testar QR Code PIX</h3><p>Gere uma prévia com a chave preenchida acima. Escaneie para conferir os dados do recebedor; não faça um pagamento de teste.</p></div>
            <button class="button button-secondary" type="button" id="test-pix-button">Gerar QR Code de teste</button>
            <div class="pix-test-preview hidden" id="pix-test-preview"><canvas id="pix-test-canvas" aria-label="QR Code PIX de teste"></canvas><p id="pix-test-status" role="status">QR Code gerado a partir da chave PIX informada.</p></div>
          </article>
          <div class="notice settings-warning"><span class="notice-icon" aria-hidden="true">!</span><p>O QR Code do checkout informa o valor do pedido, mas não confirma o pagamento. Confira o recebimento no banco e marque o pedido manualmente no painel. Os pedidos continuam salvos apenas neste navegador; para usar em outros aparelhos, publique a loja e conecte um servidor.</p></div>
        </section>

        <section class="view-panel hidden" id="view-products">
          <div class="section-heading">
            <div><h2>Produtos</h2><p>Catálogo local importado do arquivo de referência; preços e estoque precisam ser conferidos.</p></div>
            <button class="button button-primary" type="button" id="new-product-button"><span aria-hidden="true">＋</span> Novo produto</button>
          </div>
          <article class="panel table-panel">
            <div class="product-toolbar">
              <label class="search-box"><span aria-hidden="true">⌕</span><input id="product-search" type="search" placeholder="Buscar produto..." aria-label="Buscar produto"></label>
              <span class="product-count" id="product-count-label">0 produtos</span>
            </div>
            <div class="table-wrap">
              <table class="product-table">
                <thead><tr><th>PRODUTO</th><th>PREÇO</th><th>ESTOQUE</th><th>STATUS</th><th></th></tr></thead>
                <tbody id="products-body"></tbody>
              </table>
            </div>
            <div class="empty-state hidden" id="products-empty">Nenhum produto encontrado.</div>
          </article>
        </section>

        <footer class="page-footer">Walk Cards · painel demonstrativo · alterações salvas apenas neste navegador</footer>
      </div>
    </main>
  </div>

  <dialog class="modal" id="product-dialog">
    <form id="product-form">
      <div class="modal-heading"><div><span class="modal-kicker" id="product-form-kicker">CATÁLOGO</span><h2 id="product-form-title">Novo produto</h2></div><button class="modal-close" type="button" data-close-dialog aria-label="Fechar">×</button></div>
      <label class="field-label" for="product-name">Nome do produto</label><input id="product-name" type="text" maxlength="160" required>
      <div class="field-row">
        <div><label class="field-label" for="product-price">Preço (R$)</label><input id="product-price" type="number" min="0" step="0.01" required></div>
        <div><label class="field-label" for="product-stock">Estoque real conferido</label><input id="product-stock" type="number" min="0" step="1" placeholder="Não informado"></div>
      </div>
      <label class="stock-verified-label"><input id="stock-verified" type="checkbox"> Confirmo que conferi a quantidade disponível.</label>
      <label class="stock-verified-label"><input id="product-best-seller" type="checkbox"> Marcar como Mais Vendido.</label>
      <p class="form-hint">Ao editar um item importado, a alteração vale somente neste navegador.</p>
      <div class="modal-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancelar</button><button class="button button-primary" type="submit">Salvar produto</button></div>
    </form>
  </dialog>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <?php endif; ?>
</body>
</html>

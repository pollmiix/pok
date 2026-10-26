
function initializeDashboard() {
  "use strict";

  const storageKey = "poke-central-dashboard-v1";
  const pixStorageKey = "poke-central-pix-settings-v1";
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const catalog = Array.isArray(window.STORE_CATALOG) ? window.STORE_CATALOG : [];
  // Correspondências marcadas como mais vendidas na página de Pokémon da Ri Happy.
  const riHappyBestSellerIds = new Set(Array.from({ length: 19 }, (_, index) => `imported-${index + 1}`));
  const sourceProducts = catalog.map((product, index) => ({
    ...product,
    id: `imported-${index + 1}`,
    name: product.name,
    price: product.price,
    image: product.image,
    stockVerified: true,
    stock: 23,
    bestSeller: riHappyBestSellerIds.has(`imported-${index + 1}`)
  }));

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => currency.format(Number(value) || 0);
  const dateTime = (value) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  const safeText = (value) => String(value ?? "");

  function loadState() {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) {
      return { products: sourceProducts, sales: [] };
    }

    try {
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.products) || !Array.isArray(saved.sales)) {
        throw new TypeError("Formato de dados salvo inválido.");
      }
      const savedProducts = saved.products.map((product) => {
          const sourceProduct = sourceProducts.find((entry) => entry.id === product.id);
          const match = /^imported-(\d+)$/.exec(product.id);
          const mergedProduct = sourceProduct
            ? { ...sourceProduct, ...product, name: sourceProduct.name, image: sourceProduct.image }
            : product;
          if (match) {
            mergedProduct.stockVerified = mergedProduct.stockVerified === true && Number.isInteger(mergedProduct.stock);
            if (!mergedProduct.stockVerified) delete mergedProduct.stock;
          }
          return mergedProduct;
        });
      const savedProductIds = new Set(savedProducts.map((product) => product.id));
      const missingProducts = sourceProducts.filter((product) => !savedProductIds.has(product.id));
      const mergedState = {
        products: [...savedProducts, ...missingProducts],
        sales: saved.sales.filter((sale) => sale.source === "store-checkout")
      };
      if (missingProducts.length) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(mergedState));
        } catch (error) {
          console.error("Não foi possível completar o catálogo salvo no navegador.", error);
        }
      }
      return mergedState;
    } catch (error) {
      console.error("Não foi possível ler os dados locais do painel.", error);
      showToast("Os dados salvos estão inválidos. Recarregue ou limpe os dados deste site no navegador.");
      return { products: sourceProducts, sales: [] };
    }
  }

  let state;
  try {
    state = loadState();
  } catch (error) {
    console.error("O armazenamento local do navegador não está disponível.", error);
    state = { products: sourceProducts, sales: [] };
    setTimeout(() => showToast("O armazenamento local não está disponível; as alterações não serão salvas."), 0);
  }

  let editingProductId = null;
  let toastTimer;
  let pixSettings = { key: "", owner: "" };
  try {
    const savedPix = JSON.parse(localStorage.getItem(pixStorageKey) || "null");
    if (savedPix && typeof savedPix.key === "string" && typeof savedPix.owner === "string") pixSettings = savedPix;
  } catch (error) {
    console.error("Não foi possível carregar a chave Pix antiga deste navegador.", error);
  }

  const csrfToken = () => document.querySelector('input[name="csrf_token"]')?.value || "";
  async function gatewayRequest(body) {
    const response = await fetch('/api/gateway-settings', body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: JSON.stringify(body)
    } : { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível configurar o gateway.');
    return result;
  }
  let gatewayQrCharge = null;
  let gatewayQrRequestId = null;
  let gatewayQrBusy = false;
  async function renderGatewayQr(charge) {
    gatewayQrCharge = charge;
    const labels = { PENDING: 'Aguardando pagamento', PAID: 'Pagamento confirmado', CANCELLED: 'Cancelada ou expirada', REFUNDED: 'Estornada' };
    const expired = charge.expiresAt && new Date(charge.expiresAt).getTime() <= Date.now();
    const payable = charge.status === 'PENDING' && !expired && Boolean(charge.copyPaste);
    $('#gateway-qr-result').classList.remove('hidden');
    $('#gateway-qr-status').textContent = expired && charge.status === 'PENDING' ? 'Cobrança expirada. Consulte a situação na Blackcat.' : labels[charge.status] || 'Consulte a situação do pagamento.';
    $('#gateway-qr-details').textContent = `${charge.transactionId} • ${money(charge.amount / 100)}${charge.expiresAt && Number.isFinite(new Date(charge.expiresAt).getTime()) ? ` • Validade: ${dateTime(charge.expiresAt)}` : ''}`;
    $('#gateway-qr-code').value = payable ? charge.copyPaste : '';
    $('#gateway-qr-copy').disabled = !payable;
    $('#gateway-qr-canvas').classList.toggle('hidden', !payable);
    if (payable) {
      try { await window.PixQr.render($('#gateway-qr-canvas'), charge.copyPaste, 240); }
      catch { $('#gateway-qr-status').textContent = 'Cobrança criada. O QR Code não carregou; use o Pix copia e cola abaixo.'; }
    }
  }
  $('#gateway-qr-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (gatewayQrBusy) return;
    gatewayQrBusy = true;
    $('#gateway-qr-generate').disabled = true;
    $('#gateway-qr-status').textContent = 'Gerando cobrança na Blackcat…';
    gatewayQrRequestId ||= crypto.randomUUID();
    try {
      const result = await gatewayRequest({
        action: 'test-qr', requestId: gatewayQrRequestId,
        amount: Math.round(Number($('#gateway-qr-amount').value) * 100),
        name: $('#gateway-qr-name').value.trim(), email: $('#gateway-qr-email').value.trim(),
        phone: $('#gateway-qr-phone').value, document: $('#gateway-qr-document').value
      });
      await renderGatewayQr(result.charge);
      gatewayQrRequestId = null;
      $('#gateway-qr-document').value = '';
      $('#gateway-qr-consent').checked = false;
      $('#gateway-qr-generate').textContent = 'Gerar outra cobrança de teste';
    } catch (error) { $('#gateway-qr-status').textContent = error.message; }
    finally { gatewayQrBusy = false; $('#gateway-qr-generate').disabled = false; }
  });
  $('#gateway-qr-check')?.addEventListener('click', async () => {
    if (!gatewayQrCharge) return;
    $('#gateway-qr-check').disabled = true;
    try {
      const result = await gatewayRequest({ action: 'test-qr-status', requestId: gatewayQrCharge.requestId });
      await renderGatewayQr(result.charge);
    } catch (error) { $('#gateway-qr-status').textContent = error.message; }
    finally { $('#gateway-qr-check').disabled = false; }
  });
  $('#gateway-qr-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#gateway-qr-code').value);
      showToast('Pix copiado.');
    } catch {
      $('#gateway-qr-code').select();
      showToast('Selecione e copie o código Pix.');
    }
  });
  async function loadGateway() {
    if (!$('#gateway-settings-form')) return;
    try {
      const settings = await gatewayRequest();
      $('#gateway-enabled').checked = settings.enabled;
      $('#gateway-status').textContent = settings.enabled ? 'Blackcat ativada para novos pedidos Pix.' : 'Blackcat desativada. O checkout usa Pix manual.';
      $('#gateway-key-status').textContent = settings.keyConfigured
        ? 'Chave privada configurada no servidor.' : 'Configure a variável BLACKCAT_API_KEY na hospedagem para conectar sua conta.';
      $('#gateway-enabled').disabled = !settings.keyConfigured && !settings.enabled;
      $('#gateway-save').disabled = false;
      $('#gateway-test').disabled = !settings.keyConfigured;
      if ($('#gateway-qr-generate')) $('#gateway-qr-generate').disabled = !settings.keyConfigured || gatewayQrBusy;
      if (settings.testCharge && !gatewayQrCharge) await renderGatewayQr(settings.testCharge);
    } catch (error) {
      $('#gateway-status').textContent = error.message;
    }
  }
  $('#gateway-settings-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    $('#gateway-save').disabled = true;
    try {
      await gatewayRequest({ enabled: $('#gateway-enabled').checked });
      await loadGateway();
      showToast('Configuração do gateway salva.');
    } catch (error) {
      $('#gateway-status').textContent = error.message;
      $('#gateway-save').disabled = false;
    }
  });
  $('#gateway-test')?.addEventListener('click', async () => {
    $('#gateway-test').disabled = true;
    $('#gateway-status').textContent = 'Testando conexão…';
    try {
      const result = await gatewayRequest({ action: 'test' });
      $('#gateway-status').textContent = `Conexão confirmada: ${result.seller}. Nenhuma cobrança foi criada.`;
    } catch (error) {
      $('#gateway-status').textContent = error.message;
    } finally { $('#gateway-test').disabled = false; }
  });
  loadGateway();
  async function loadSharedPixSettings() {
    try {
      const response = await fetch("/api/pix-settings", { cache: "no-store" });
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.error || "Não foi possível carregar a chave Pix.");
      if (!settings.key && pixSettings.key) {
        const migration = await fetch("/api/pix-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
          body: JSON.stringify(pixSettings)
        });
        const migrated = await migration.json();
        if (migration.ok) Object.assign(settings, migrated);
      }
      pixSettings = settings;
      localStorage.setItem(pixStorageKey, JSON.stringify(settings));
      $("#pix-owner").value = settings.owner;
      $("#pix-key").value = settings.key;
      $("#remove-pix-button").classList.toggle("hidden", !settings.key);
    } catch (error) {
      console.error("Não foi possível carregar as configurações PIX compartilhadas.", error);
      $("#pix-owner").value = pixSettings.owner;
      $("#pix-key").value = pixSettings.key;
      $("#remove-pix-button").classList.toggle("hidden", !pixSettings.key);
      showToast(error.message || "Não foi possível carregar a chave Pix compartilhada.");
    }
  }
  loadSharedPixSettings();
  async function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      const response = await fetch("/api/store-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({ products: state.products })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível sincronizar o catálogo.");
      return true;
    } catch (error) {
      console.error("Não foi possível salvar os dados compartilhados do painel.", error);
      showToast(error.message || "Não foi possível compartilhar os dados. Confira o Redis da Vercel.");
      return false;
    }
  }

  async function loadSharedDashboardData() {
    try {
      const response = await fetch("/api/store-data", { cache: "no-store" });
      const shared = await response.json();
      if (!response.ok) throw new Error(shared.error || "Não foi possível carregar os dados compartilhados.");
      if (!Array.isArray(shared.products)) {
        state.products = state.products.map((product) => ({ ...product, stock: 23, stockVerified: true }));
        const initialize = await fetch("/api/store-data", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
          body: JSON.stringify({ products: state.products, sales: state.sales, inventoryPreset: "23-units-each" })
        });
        const result = await initialize.json();
        if (!initialize.ok) throw new Error(result.error || "Não foi possível iniciar o catálogo compartilhado.");
        return;
      }
      const localSales = state.sales;
      const sharedProducts = shared.products.map((product) => {
        const base = sourceProducts.find((entry) => entry.id === product.id);
        const refreshEtbPrice = base?.id === "imported-4" && Number(product.price) === 599.99;
        const merged = base ? { ...base, ...product, ...(refreshEtbPrice ? { price: base.price } : {}), name: base.name, image: base.image } : product;
        return shared.inventoryPreset === "23-units-each"
          ? merged
          : { ...merged, stock: 23, stockVerified: true };
      });
      const sharedProductIds = new Set(sharedProducts.map((product) => product.id));
      const missingProducts = sourceProducts.filter((product) => !sharedProductIds.has(product.id));
      const catalogNeedsSync = shared.products.some((product) => {
        const base = sourceProducts.find((entry) => entry.id === product.id);
        return base && (product.name !== base.name || product.image !== base.image
          || (base.id === "imported-4" && Number(product.price) === 599.99));
      });
      state.products = [...sharedProducts, ...missingProducts].map((product) => shared.inventoryPreset === "23-units-each"
        ? product
        : { ...product, stock: 23, stockVerified: true });
      state.sales = Array.isArray(shared.sales) ? shared.sales : [];
      const inventoryNeedsSync = shared.inventoryPreset !== "23-units-each";
      if (missingProducts.length || catalogNeedsSync || inventoryNeedsSync || (!state.sales.length && localSales.length)) {
        const migration = await fetch("/api/store-data", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
          body: JSON.stringify({
            products: state.products,
            sales: state.sales.length ? state.sales : localSales,
            ...(inventoryNeedsSync ? { inventoryPreset: "23-units-each" } : {})
          })
        });
        if (migration.ok && !state.sales.length) state.sales = localSales;
      }
      localStorage.setItem(storageKey, JSON.stringify(state));
      render();
    } catch (error) {
      console.error("Não foi possível carregar os dados compartilhados do painel.", error);
      showToast(error.message || "Os dados ainda não foram sincronizados com o servidor.");
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  function escapeHtml(value) {
    return safeText(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function getProduct(productId) {
    return state.products.find((product) => product.id === productId);
  }

  function renderSummary() {
    const paidSales = state.sales.filter((sale) => sale.status === "paid");
    const pendingSales = state.sales.filter((sale) => sale.status === "pending");
    const generatedSales = state.sales.filter((sale) => sale.status !== "cancelled");
    const revenue = paidSales.reduce((total, sale) => total + Number(sale.amount || 0), 0);
    const generatedTotal = generatedSales.reduce((total, sale) => total + Number(sale.amount || 0), 0);
    const pendingTotal = pendingSales.reduce((total, sale) => total + Number(sale.amount || 0), 0);
    const stockKnown = state.products.filter((product) => product.stockVerified === true && Number.isInteger(product.stock));
    const average = paidSales.length ? revenue / paidSales.length : 0;

    $("#stat-revenue").textContent = money(revenue);
    $("#stat-generated-total").textContent = money(generatedTotal);
    $("#stat-pending-total").textContent = money(pendingTotal);
    $("#stat-sales").textContent = String(state.sales.length);
    $("#stat-average").textContent = money(average);
    $("#stat-products").textContent = String(state.products.length);
    $("#stat-stock-note").textContent = stockKnown.length
      ? `${stockKnown.length} com estoque informado`
      : "Estoque ainda não informado";
    $("#sales-nav-count").textContent = String(state.sales.length);
    $("#products-nav-count").textContent = String(state.products.length);
    $("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(new Date());
  }

  function saleRow(sale, compact) {
    const paid = sale.status === "paid";
    const cancelled = sale.status === "cancelled" || sale.status === 'refunded';
    const customerReportedPaid = sale.customerReportedPaid && sale.status === "pending";
    const badge = `<span class="pill ${paid || customerReportedPaid ? "" : cancelled ? "cancelled" : "example"} ${customerReportedPaid ? "reported-payment" : ""}">${paid ? "Pago" : sale.status === 'refunded' ? 'Estornado' : cancelled ? "Cancelado" : customerReportedPaid ? "Cliente informou pagamento" : "Aguardando PIX"}</span>`;
    const amountClass = `money-cell${customerReportedPaid ? " reported-payment-value" : ""}`;
    const delivery = sale.delivery?.method === "delivery"
      ? `${sale.delivery.street}, ${sale.delivery.number}${sale.delivery.complement ? `, ${sale.delivery.complement}` : ""} - ${sale.delivery.neighborhood}, ${sale.delivery.city}/${sale.delivery.state} - CEP ${String(sale.delivery.postalCode || "").replace(/^(\d{5})(\d{3})$/, "$1-$2")}`
      : "";
    if (compact) {
      return `<tr>
        <td class="sale-id">#${escapeHtml(sale.id)}</td>
        <td>${escapeHtml(sale.customer || "Venda avulsa")}</td>
        <td>${escapeHtml(dateTime(sale.createdAt))}</td>
        <td class="${amountClass}">${money(sale.amount)}</td>
        <td>${badge}</td>
      </tr>`;
    }
    return `<tr>
      <td class="sale-id">#${escapeHtml(sale.id)}</td>
      <td>${escapeHtml(sale.productName || getProduct(sale.productId)?.name || "Produto removido")}</td>
      <td>${escapeHtml(sale.customer || "Cliente")}<small class="customer-contact">${escapeHtml(sale.phone || "WhatsApp não informado")}</small>${delivery ? `<small class="customer-contact">Entrega: ${escapeHtml(delivery)}. Destinatário: ${escapeHtml(sale.delivery.recipient || sale.customer || "—")}</small>` : ""}</td>
      <td>${escapeHtml(dateTime(sale.createdAt))}</td>
      <td class="${amountClass}">${money(sale.amount)}</td>
      <td>${badge}</td>
      <td>${sale.gateway === 'blackcat' ? sale.payment?.transactionId
        ? `<button class="product-action" type="button" data-check-gateway="${escapeHtml(sale.id)}">Consultar Blackcat</button>`
        : 'Conferir cobrança no painel Blackcat'
        : sale.status !== "pending" ? "—" : `<div class="order-actions"><button class="product-action" type="button" data-confirm-payment="${escapeHtml(sale.id)}">Confirmar PIX</button><button class="product-action cancel-order" type="button" data-cancel-order="${escapeHtml(sale.id)}">Cancelar</button></div>`}</td>
    </tr>`;
  }

  function renderSales() {
    const sorted = [...state.sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#recent-sales-body").innerHTML = sorted.slice(0, 5).map((sale) => saleRow(sale, true)).join("");
    $("#sales-body").innerHTML = sorted.map((sale) => saleRow(sale, false)).join("");
    $("#recent-sales-empty").classList.toggle("hidden", sorted.length > 0);
    $("#sales-empty").classList.toggle("hidden", sorted.length > 0);
    $("#sales-total-label").textContent = `${sorted.length} ${sorted.length === 1 ? "registro" : "registros"}`;
    $("#clear-orders-button").disabled = sorted.length === 0;
  }

  $('#sales-body').addEventListener('click', async event => {
    const button = event.target.closest('[data-check-gateway]');
    if (!button) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/payment-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
        body: JSON.stringify({ id: button.dataset.checkGateway })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o pagamento.');
      await loadSharedDashboardData();
      showToast('Situação do pagamento consultada.');
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });

  function productRow(product) {
    const stockLabel = product.stockVerified === true && Number.isInteger(product.stock) ? String(product.stock) : "—";
    const status = !(product.stockVerified === true && Number.isInteger(product.stock))
      ? '<span class="pill example">Informar estoque</span>'
      : product.stock === 0
        ? '<span class="pill" style="color:#b35454;background:#fff0f0">Sem estoque</span>'
        : '<span class="pill">Disponível</span>';
    const image = product.image
      ? `<img class="product-thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy">`
      : '<span class="product-thumb product-placeholder" aria-hidden="true">TCG</span>';
    return `<tr>
      <td><div class="product-name-cell">${image}<span title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span></div></td>
      <td class="money-cell">${money(product.price)}</td>
      <td>${stockLabel}</td>
      <td>${status}</td>
      <td><button class="product-action" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button></td>
    </tr>`;
  }

  function renderProducts() {
    const query = $("#product-search").value.trim().toLocaleLowerCase("pt-BR");
    const filtered = state.products.filter((product) => product.name.toLocaleLowerCase("pt-BR").includes(query));
    $("#products-body").innerHTML = filtered.map(productRow).join("");
    $("#products-empty").classList.toggle("hidden", filtered.length > 0);
    $("#product-count-label").textContent = `${filtered.length} de ${state.products.length} produtos`;
  }

  function render() {
    renderSummary();
    renderSales();
    renderProducts();
  }

  function switchView(view) {
    const titles = { overview: "Visão geral", sales: "Pedidos", products: "Produtos", pix: "Pagamento PIX", gateway: "Gateway de pagamento" };
    document.querySelectorAll(".view-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== `view-${view}`);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    $("#page-title").textContent = titles[view] || titles.overview;
    if (view === "products") $("#product-search").focus();
    if (view === "gateway") loadGateway();
    if (view === "pix") {
      $("#pix-owner").value = pixSettings.owner;
      $("#pix-key").value = pixSettings.key;
      $("#remove-pix-button").classList.toggle("hidden", !pixSettings.key);
      $("#pix-test-preview").classList.add("hidden");
    }
  }

  function openProductDialog(product = null) {
    editingProductId = product?.id || null;
    $("#product-form-title").textContent = product ? "Editar produto" : "Novo produto";
    $("#product-form-kicker").textContent = product ? "ATUALIZAR CATÁLOGO" : "ADICIONAR AO CATÁLOGO";
    $("#product-name").value = product?.name || "";
    $("#product-price").value = product ? String(product.price) : "";
    $("#product-stock").value = product?.stockVerified === true && Number.isInteger(product.stock) ? String(product.stock) : "";
    $("#stock-verified").checked = product?.stockVerified === true && Number.isInteger(product.stock);
    $("#product-best-seller").checked = product?.bestSeller === true;
    $("#product-dialog").showModal();
  }

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.openView));
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  $("#new-product-button").addEventListener("click", () => openProductDialog());
  $("#clear-orders-button").addEventListener("click", async () => {
    if (!state.sales.length) return;
    if (!window.confirm(`Apagar os ${state.sales.length} pedidos e zerar os valores deste painel? O catálogo e o estoque serão mantidos.`)) return;
    try {
      const response = await fetch("/api/store-data", { method: "DELETE", headers: { "X-CSRF-Token": csrfToken() } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível limpar os pedidos compartilhados.");
      state.sales = [];
      localStorage.setItem(storageKey, JSON.stringify(state));
      render();
      showToast("Pedidos e valores do painel foram limpos em todos os navegadores.");
    } catch (error) {
      showToast(error.message || "Não foi possível limpar os pedidos.");
    }
  });  $("#product-search").addEventListener("input", renderProducts);
  $("#notice-close").addEventListener("click", () => $(".notice").classList.add("hidden"));

  $("#product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#product-name").value.trim();
    const price = Number($("#product-price").value);
    const stockRaw = $("#product-stock").value;
    const stock = stockRaw === "" ? null : Number(stockRaw);
    const stockVerified = $("#stock-verified").checked && stock !== null;
    const bestSeller = $("#product-best-seller").checked;
    if (!name || !Number.isFinite(price) || price < 0 || (stock !== null && (!Number.isInteger(stock) || stock < 0))) {
      showToast("Confira o nome, preço e quantidade em estoque.");
      return;
    }
    if (stock !== null && !stockVerified) {
      showToast("Marque a confirmação depois de conferir o estoque real.");
      return;
    }

    if (editingProductId) {
      const product = getProduct(editingProductId);
      if (product) Object.assign(product, { name, price, stock: stockVerified ? stock : undefined, stockVerified, bestSeller });
    } else {
      state.products.unshift({
        id: `local-${Date.now()}`,
        name,
        price,
        image: "",
        stock: stockVerified ? stock : undefined,
        stockVerified,
        bestSeller
      });
    }
    if (await persist()) {
      render();
      $("#product-dialog").close();
      showToast(editingProductId ? "Produto atualizado e compartilhado com todos os navegadores." : "Produto adicionado e compartilhado com todos os navegadores.");
      editingProductId = null;
    }
  });

  $("#products-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-product]");
    if (button) openProductDialog(getProduct(button.dataset.editProduct));
  });

  $("#sales-body").addEventListener("click", async (event) => {
    const confirmButton = event.target.closest("[data-confirm-payment]");
    const cancelButton = event.target.closest("[data-cancel-order]");
    const saleId = confirmButton?.dataset.confirmPayment || cancelButton?.dataset.cancelOrder;
    if (!saleId) return;
    const sale = state.sales.find((item) => item.id === saleId);
    if (!sale || sale.status !== "pending") return;
    const action = confirmButton ? "paid" : "cancelled";
    const prompt = confirmButton
      ? `Confirme somente depois de conferir o PIX de ${money(sale.amount)} no aplicativo do banco. Marcar o pedido ${sale.id} como pago?`
      : `Cancelar o pedido ${sale.id}? Confira primeiro que nenhum pagamento foi recebido.`;
    if (!window.confirm(prompt)) return;
    try {
      const response = await fetch("/api/store-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({ id: saleId, action })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o pedido compartilhado.");
      Object.assign(sale, result.order);
      if (action === "cancelled") {
        for (const item of sale.items || []) {
          const product = getProduct(item.productId);
          if (product?.stockVerified === true && Number.isInteger(product.stock)) product.stock += item.quantity;
        }
      }
      localStorage.setItem(storageKey, JSON.stringify(state));
      render();
      showToast(action === "paid" ? "Pedido atualizado em todos os navegadores." : "Pedido cancelado em todos os navegadores.");
    } catch (error) {
      showToast(error.message || "Não foi possível atualizar o pedido.");
    }
  });
  $("#pix-settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const key = $("#pix-key").value.trim();
    const owner = $("#pix-owner").value.trim();
    if (!key) {
      showToast("Informe a chave PIX da loja.");
      return;
    }
    fetch("/api/pix-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
      body: JSON.stringify({ key, owner })
    }).then(async (response) => {
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.error || "Não foi possível salvar a chave Pix compartilhada.");
      pixSettings = settings;
      localStorage.setItem(pixStorageKey, JSON.stringify(settings));
      $("#remove-pix-button").classList.remove("hidden");
      showToast("Chave Pix salva para todos os navegadores.");
    }).catch((error) => {
      console.error("Não foi possível salvar a configuração PIX compartilhada.", error);
      pixSettings = { key, owner };
      try {
        localStorage.setItem(pixStorageKey, JSON.stringify(pixSettings));
        showToast("Chave salva apenas neste navegador. Configure o Redis da Vercel para compartilhar.");
      } catch (storageError) {
        showToast(error.message || "Não foi possível salvar a chave Pix.");
      }
    });
  });
  $("#test-pix-button").addEventListener("click", async () => {
    const key = $("#pix-key").value.trim();
    if (!key) {
      showToast("Informe a chave PIX antes de gerar o teste.");
      $("#pix-key").focus();
      return;
    }
    try {
      const payload = window.PixQr.buildPixPayload({ key, owner: $("#pix-owner").value.trim() });
      $("#pix-test-preview").classList.remove("hidden");
      await window.PixQr.render($("#pix-test-canvas"), payload, 240);
      $("#pix-test-status").textContent = "QR Code gerado. Confira o nome e a chave no aplicativo do banco; não faça um pagamento de teste.";
    } catch (error) {
      console.error("Não foi possível gerar o QR Code PIX.", error);
      $("#pix-test-status").textContent = error.message || "Não foi possível gerar o QR Code PIX.";
      showToast(error.message || "Não foi possível gerar o QR Code PIX.");
    }
  });

  $("#remove-pix-button").addEventListener("click", () => {
    fetch("/api/pix-settings", {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrfToken() }
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível remover a chave Pix.");
      pixSettings = { key: "", owner: "" };
      localStorage.removeItem(pixStorageKey);
      $("#pix-key").value = "";
      $("#pix-owner").value = "";
      $("#pix-test-preview").classList.add("hidden");
      $("#remove-pix-button").classList.add("hidden");
      showToast("Chave Pix removida do site.");
    }).catch((error) => {
      console.error("Não foi possível remover a configuração PIX compartilhada.", error);
      showToast(error.message || "Não foi possível remover a chave Pix.");
    });
  });
  $("#today-label").textContent = "";
  $("#product-search").value = "";
  document.querySelectorAll(".modal").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  if (!catalog.length) {
    showToast("O catálogo de referência não foi carregado. Confira se catalog.js está na mesma pasta.");
  }
  render();
  loadSharedDashboardData();
  window.setInterval(() => { if (document.visibilityState === 'visible') loadSharedDashboardData(); }, 15000);
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey && event.newValue) {
      try {
        const updated = JSON.parse(event.newValue);
        if (Array.isArray(updated.products) && Array.isArray(updated.sales)) {
          state = { products: updated.products, sales: updated.sales.filter((sale) => sale.source === "store-checkout") };
          render();
        }
      } catch (error) {
        console.error("Não foi possível atualizar pedidos de outra aba.", error);
        showToast("Não foi possível atualizar pedidos de outra aba.");
      }
    }
  });
}

initializeDashboard();

(() => {
  "use strict";

  const dashboardStorageKey = "poke-central-dashboard-v1";
  const pixStorageKey = "poke-central-pix-settings-v1";
  const cartStorageKey = "poke-central-cart-v1";
  const favoritesStorageKey = "poke-central-favorites-v1";
  const pageSize = 32;
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
  const money = (value) => currency.format(Number(value) || 0);
  const whatsappNumber = "5511993983387";
  function verifiedStock(product) {
    return product.stockVerified === true && Number.isInteger(product.stock);
  }
  function productCategory(name) {
    const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    if (/gift card|cartao presente/.test(normalized)) return "Gift card digital";
    if (/pelucia|figura|boneco|miniatura|mimkyum/.test(normalized)) return "Brinquedo ou item colecionável";
    if (/mochila|estojo|chaveiro|garrafa|acessorio/.test(normalized)) return "Acessório Pokémon";
    if (/bloco|construcao|montar/.test(normalized)) return "Blocos de montar";
    if (/tabuleiro|monopoly|adivinha quem|jogo de acao/.test(normalized)) return "Jogo";
    if (/deck|baralho/.test(normalized)) return "Deck de Pokémon TCG";
    if (/booster|blister|pacote de cartas/.test(normalized)) return "Pacote de cartas Pokémon TCG";
    if (/box|colecao/.test(normalized)) return "Box ou coleção Pokémon TCG";
    if (/carta|cartas|lote/.test(normalized)) return "Cartas Pokémon TCG";
    return "Produto do universo Pokémon";
  }
  function describeProduct(product) {
    if (typeof product.description === "string" && product.description.trim()) return product.description.trim();
    const category = productCategory(product.name);
    const normalized = product.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    if (category === "Gift card digital") {
      return `${product.name} é um código digital para conteúdo ou crédito indicado no título do produto. Confira a plataforma, região e valor antes da compra, pois a ativação e as regras de uso dependem do serviço indicado.`;
    }
    if (category === "Brinquedo ou item colecionável") {
      return `${product.name} é um item colecionável ou brinquedo inspirado em Pokémon. O título identifica o personagem e o fabricante quando essas informações foram fornecidas. Confira as imagens e os dados da embalagem para verificar tamanho, material e recomendação etária.`;
    }
    if (category === "Acessório Pokémon") {
      return `${product.name} é um acessório temático Pokémon para uso ou coleção. O modelo e o personagem são os informados no título; consulte as imagens e a embalagem para confirmar medidas, material e detalhes de fabricação.`;
    }
    if (category === "Blocos de montar") {
      return `${product.name} é um conjunto de construção temático Pokémon. A quantidade de peças e a idade recomendada não constam no catálogo; confira essas informações na embalagem do fabricante.`;
    }
    if (category === "Jogo") {
      return `${product.name} é um jogo para momentos de lazer com tema Pokémon. Consulte a embalagem para verificar número de participantes, regras, conteúdo e idade recomendada.`;
    }
    if (category === "Deck de Pokémon TCG") {
      return `${product.name} é um deck do Pokémon Trading Card Game para jogar ou colecionar. A composição exata das cartas e os acessórios podem variar por edição; confira os detalhes indicados pelo fabricante na embalagem.`;
    }
    if (category === "Pacote de cartas Pokémon TCG") {
      const format = /triplo/.test(normalized) ? "formato triplo" : /duplo/.test(normalized) ? "formato duplo" : /quadruplo/.test(normalized) ? "formato quádruplo" : /unitario/.test(normalized) ? "formato unitário" : "formato indicado no título";
      return `${product.name} é um produto de cartas colecionáveis do Pokémon TCG, no ${format}. A edição, a quantidade e a seleção de cartas dependem da versão; consulte a embalagem do fabricante para confirmar o conteúdo exato.`;
    }
    if (category === "Cartas Pokémon TCG") {
      return `${product.name} reúne cartas colecionáveis de Pokémon TCG. A seleção, o idioma e a condição das cartas dependem do lote descrito no título; confira as imagens e as informações do anúncio antes da compra.`;
    }
    if (category === "Box ou coleção Pokémon TCG") {
      return `${product.name} é uma box ou coleção temática de Pokémon TCG para jogar ou colecionar. A edição e os itens incluídos são os identificados no título; como o conteúdo varia entre coleções, consulte a embalagem para confirmar cada componente.`;
    }
    return `${product.name} é um produto temático do universo Pokémon. Consulte o título, as imagens e as informações da embalagem para confirmar o modelo, o conteúdo e as recomendações de uso.`;
  }
  function productSpecifications(product) {
    const specs = [
      ["Produto", product.name],
      ["Categoria", productCategory(product.name)],
      ["Marca", product.brand || "Confira a embalagem do produto"],
      ["Preço de referência (confirmar)", money(product.price)],
      ["Disponibilidade", verifiedStock(product) ? (product.stock > 0 ? `${product.stock} unidades em estoque` : "Indisponível") : "Consulte a loja"]
    ];
    const optionalSpecs = [
      ["Código de barras", product.barcode || product.ean],
      ["Código do fabricante", product.manufacturerCode || product.mpn],
      ["Restrição de idade", product.ageRecommendation],
      ["Peso", product.weight],
      ["Dimensões", product.dimensions],
      ["Itens inclusos", product.includedItems]
    ];
    optionalSpecs.forEach(([label, value]) => { if (value) specs.push([label, String(value)]); });
    return specs;
  }

  // Produtos do catálogo local que correspondem aos itens destacados na página Pokémon da Ri Happy.
  const riHappyBestSellerIds = new Set(Array.from({ length: 19 }, (_, index) => `imported-${index + 1}`));
  const importedProducts = (Array.isArray(window.STORE_CATALOG) ? window.STORE_CATALOG : []).map((product, index) => {
    const id = `imported-${index + 1}`;
    const gallery = window.STORE_PRODUCT_GALLERIES?.[id];
    return {
      ...product,
      id,
      name: product.name,
      price: Number(product.price),
      image: product.image || "",
      images: Array.isArray(gallery) ? gallery.filter((image) => typeof image === "string" && image) : [],
      stockVerified: false,
      bestSeller: riHappyBestSellerIds.has(id)
    };
  });

  let products = importedProducts;
  let pixSettings = { key: "", owner: "" };
  let cart = [];
  let favorites = [];
  let showFavoritesOnly = false;
  let dashboardState = { products, sales: [] };
  const catalogFilters = { lowestPrice: false, bestSellers: false };
  let catalogSort = "relevance";
  let minimumPrice = null;
  let maximumPrice = null;
  let visibleCount = pageSize;
  const showcaseSections = ["lancamentos", "mais-vendidos", "bonecos", "blocos", "gift-card"];
  let activeShowcase = showcaseSections.includes(window.location.hash.slice(1))
    ? window.location.hash.slice(1)
    : "lancamentos";
  let toastTimer;
  let detailProductId = "";
  let detailGalleryImages = [];
  let detailGalleryIndex = 0;

  function showToast(message) {
    const toast = $("#store-toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  function readLocalData() {
    try {
      const storedDashboard = localStorage.getItem(dashboardStorageKey);
      if (storedDashboard) {
        const parsed = JSON.parse(storedDashboard);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.sales)) {
          const savedProducts = parsed.products.map((product) => {
            const match = /^imported-(\d+)$/.exec(product.id);
            const catalogProduct = match ? importedProducts[Number(match[1]) - 1] : null;
            const normalizedProduct = {
              ...product,
              name: catalogProduct?.name || product.name,
              image: catalogProduct?.image || product.image,
              bestSeller: typeof product.bestSeller === "boolean" ? product.bestSeller : catalogProduct?.bestSeller === true,
              ...(match ? { stockVerified: product.stockVerified === true && Number.isInteger(product.stock) } : {}),
              images: catalogProduct?.images.length
                ? catalogProduct.images
                : (Array.isArray(product.images) && product.images.length
                  ? product.images
                  : (product.image ? [product.image] : []))
            };
            if (match && !normalizedProduct.stockVerified) delete normalizedProduct.stock;
            return normalizedProduct;
          });
          const savedProductIds = new Set(savedProducts.map((product) => product.id));
          const newCatalogProducts = importedProducts.filter((product) => !savedProductIds.has(product.id));
          dashboardState = {
            products: [...savedProducts, ...newCatalogProducts],
            sales: parsed.sales.filter((sale) => sale.source === "store-checkout")
          };
          products = dashboardState.products;
          if (dashboardState.products.length !== parsed.products.length
            || dashboardState.products.some((product, index) => product !== parsed.products[index])) {
            localStorage.setItem(dashboardStorageKey, JSON.stringify(dashboardState));
          }
        }
      }
      const storedPix = localStorage.getItem(pixStorageKey);
      if (storedPix) {
        const parsedPix = JSON.parse(storedPix);
        if (parsedPix && typeof parsedPix.key === "string" && typeof parsedPix.owner === "string") {
          pixSettings = parsedPix;
        }
      }
      const storedCart = localStorage.getItem(cartStorageKey);
      if (storedCart) {
        const parsedCart = JSON.parse(storedCart);
        if (Array.isArray(parsedCart)) {
          cart = parsedCart.filter((item) =>
            products.some((product) => product.id === item.productId)
            && Number.isInteger(item.quantity)
            && item.quantity > 0
          );
        }
      }
      const storedFavorites = localStorage.getItem(favoritesStorageKey);
      if (storedFavorites) {
        const parsedFavorites = JSON.parse(storedFavorites);
        if (Array.isArray(parsedFavorites)) {
          favorites = parsedFavorites.filter((productId) => products.some((product) => product.id === productId));
        }
      }
    } catch (error) {
      console.error("Não foi possível carregar os dados locais da loja.", error);
      showToast("O navegador não conseguiu ler os dados locais. Confira as permissões e recarregue.");
    }
  }

  async function loadSharedProducts() {
    try {
      const response = await fetch("/api/store-data", { cache: "no-store" });
      const shared = await response.json();
      if (!response.ok) throw new Error(shared.error || "Não foi possível carregar o catálogo atualizado.");
      if (!Array.isArray(shared.products)) return;
      const sharedProducts = shared.products.map((product) => {
        const source = importedProducts.find((entry) => entry.id === product.id);
        return source ? { ...source, ...product, name: source.name, image: source.image, images: source.images } : product;
      });
      const sharedProductIds = new Set(sharedProducts.map((product) => product.id));
      const newCatalogProducts = importedProducts.filter((product) => !sharedProductIds.has(product.id));
      products = [...sharedProducts, ...newCatalogProducts];
      dashboardState.products = products;
      cart = cart.filter((item) => products.some((product) => product.id === item.productId));
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      renderProducts();
      renderCart();
    } catch (error) {
      console.error("Não foi possível carregar o catálogo compartilhado.", error);
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      return true;
    } catch (error) {
      console.error("Não foi possível salvar o carrinho.", error);
      showToast("Não foi possível salvar o carrinho neste navegador.");
      return false;
    }
  }

  function getProduct(productId) {
    return products.find((product) => product.id === productId);
  }

  function cartQuantity() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function cartTotal() {
    return cart.reduce((sum, item) => sum + (getProduct(item.productId)?.price || 0) * item.quantity, 0);
  }

  function shippingTotal() {
    return 0;
  }

  function orderTotal() {
    return Number((cartTotal() + shippingTotal()).toFixed(2));
  }

  function productSalesCount(productId) {
    return dashboardState.sales.reduce((total, sale) => total + (sale.items || []).reduce((saleTotal, item) =>
      saleTotal + (item.productId === productId ? Number(item.quantity) || 0 : 0), 0), 0);
  }

  function renderDeliverySummary() {
    $("#checkout-order-lines").innerHTML = cart.map((item) => {
      const product = getProduct(item.productId);
      if (!product) return "";
      const image = product.image
        ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy">`
        : '<span class="checkout-order-placeholder" aria-hidden="true">TCG</span>';
      return `<div class="checkout-order-line">${image}<span class="checkout-order-line-name">${escapeHtml(product.name)} × ${item.quantity}</span><strong>${money(product.price * item.quantity)}</strong></div>`;
    }).join("");
    $("#delivery-subtotal").textContent = money(cartTotal());
    $("#delivery-method-price").textContent = "A confirmar";
    $("#delivery-shipping").textContent = $("#delivery-method-price").textContent;
    $("#delivery-total").textContent = money(cartTotal());
  }

  function renderProductCard(product, isLaunch = false, isBestSeller = false, isToy = false, isBlock = false, isGiftCard = false) {
    const image = product.image
      ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">`
      : '<span class="store-placeholder" aria-hidden="true">TCG</span>';
    const soldOut = verifiedStock(product) && product.stock < 1;
    const isFavorite = favorites.includes(product.id);
    const stockTag = soldOut ? "INDISPONÍVEL" : verifiedStock(product) ? `${product.stock} EM ESTOQUE` : "CONSULTE ESTOQUE";
    const primaryTag = soldOut && (isLaunch || isBestSeller)
      ? "ESGOTADO"
      : isLaunch
        ? "SELEÇÃO DA LOJA"
        : isBestSeller
        ? "POKÉMON TCG"
          : soldOut
            ? "INDISPONÍVEL"
            : "POKÉMON TCG";
    const productTags = isToy || isBlock || isGiftCard
      ? (product.bestSeller === true ? '<div class="product-tags"><span class="product-tag">MAIS VENDIDO!</span></div>' : "")
      : `<div class="product-tags">${product.bestSeller === true ? '<span class="product-tag">MAIS VENDIDO!</span>' : ""}<span class="product-tag">${primaryTag}</span>${isLaunch ? "" : `<span class="product-tag stock-tag">${stockTag}</span>`}</div>`;
    return `<article class="store-product${isLaunch ? " launch-product" : ""}${isBestSeller ? " best-seller-product" : ""}${isToy ? " toy-product" : ""}${isBlock ? " block-product" : ""}${isGiftCard ? " gift-card-product" : ""}">
      <div class="store-product-image">
        ${productTags}
        <button class="favorite-button ${isFavorite ? "is-favorite" : ""}" type="button" data-favorite-product="${escapeHtml(product.id)}" aria-label="${isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}" aria-pressed="${isFavorite}">${isFavorite ? "♥" : "♡"}</button>
        <button class="product-detail-trigger" type="button" data-product-details="${escapeHtml(product.id)}" aria-label="Ver detalhes de ${escapeHtml(product.name)}">${image}</button>
      </div>
      <div class="store-product-info">
        <button class="store-product-title" type="button" data-product-details="${escapeHtml(product.id)}">${escapeHtml(product.name)}</button>
        <div class="store-product-rating" aria-label="Avaliações ainda não cadastradas"><span aria-hidden="true">☆☆☆☆☆</span></div>
        <strong class="store-product-price">${money(product.price)}</strong>
        <small class="store-price-note">Preço de referência</small>
        ${verifiedStock(product) ? `<span class="store-stock">${soldOut ? "Produto indisponível" : `${product.stock} unidades em estoque`}</span>` : ""}
        <span class="pix-payment-label">DESCONTO NO PIX</span>
        <button class="add-to-cart" type="button" data-add-product="${escapeHtml(product.id)}" ${soldOut ? "disabled" : ""}><span aria-hidden="true">⊕</span>${soldOut ? "ESGOTADO" : "ADICIONAR"}</button>
      </div>
    </article>`;
  }

  function renderLaunchProducts() {
    const query = $("#store-search").value.trim();
    $("#lancamentos").classList.toggle("hidden", showFavoritesOnly || Boolean(query) || activeShowcase !== "lancamentos");
    if (query) return;
    const launchIds = ["imported-1", "imported-2", "imported-3", "imported-4", "imported-5", "imported-6", "imported-7", "imported-10", "imported-16", "imported-21", "imported-238"];
    const launchProducts = launchIds.map(getProduct).filter(Boolean);
    const track = $("#launch-products");
    const previousScroll = track.scrollLeft;
    track.innerHTML = launchProducts.map((product) => renderProductCard(product, true)).join("");
    track.scrollLeft = previousScroll;
  }

  function renderBestSellerProducts() {
    const query = $("#store-search").value.trim();
    $("#mais-vendidos").classList.toggle("hidden", showFavoritesOnly || Boolean(query) || activeShowcase !== "mais-vendidos");
    if (query) return;
    const bestSellerProducts = products.filter((product) => product.bestSeller === true);
    const track = $("#best-seller-products");
    const previousScroll = track.scrollLeft;
    track.innerHTML = bestSellerProducts.map((product) => renderProductCard(product, false, true)).join("");
    track.scrollLeft = previousScroll;
  }

  function renderToyProducts() {
    const query = $("#store-search").value.trim();
    $("#bonecos").classList.toggle("hidden", showFavoritesOnly || Boolean(query) || activeShowcase !== "bonecos");
    if (query) return;
    const toyIds = ["imported-240", "imported-241", "imported-242", "imported-243", "imported-244", "imported-245", "imported-246", "imported-247", "imported-248"];
    const toyProducts = toyIds.map(getProduct).filter(Boolean);
    const track = $("#toy-products");
    const previousScroll = track.scrollLeft;
    track.innerHTML = toyProducts.map((product) => renderProductCard(product, false, false, true)).join("");
    track.scrollLeft = previousScroll;
  }

  function renderBlockProducts() {
    const query = $("#store-search").value.trim();
    $("#blocos").classList.toggle("hidden", showFavoritesOnly || Boolean(query) || activeShowcase !== "blocos");
    if (query) return;
    const blockIds = ["imported-249", "imported-250"];
    const blockProducts = blockIds.map(getProduct).filter(Boolean);
    const track = $("#block-products");
    const previousScroll = track.scrollLeft;
    track.innerHTML = blockProducts.map((product) => renderProductCard(product, false, false, false, true)).join("");
    track.scrollLeft = previousScroll;
  }

  function renderGiftCardProducts() {
    const query = $("#store-search").value.trim();
    $("#gift-card").classList.toggle("hidden", showFavoritesOnly || Boolean(query) || activeShowcase !== "gift-card");
    if (query) return;
    const giftCardIds = ["imported-251", "imported-252", "imported-253", "imported-254", "imported-255", "imported-256", "imported-257", "imported-258"];
    const giftCards = giftCardIds.map(getProduct).filter(Boolean);
    const track = $("#gift-card-products");
    const previousScroll = track.scrollLeft;
    track.innerHTML = giftCards.map((product) => renderProductCard(product, false, false, false, false, true)).join("");
    track.scrollLeft = previousScroll;
  }

  function renderProducts() {
    const query = $("#catalog-search").value.trim().toLocaleLowerCase("pt-BR");
    const catalogPrices = products.map((product) => Number(product.price)).filter(Number.isFinite);
    const priceFloor = catalogPrices.length ? Math.min(...catalogPrices) : 0;
    const priceCeiling = catalogPrices.length ? Math.max(...catalogPrices) : 0;
    if (minimumPrice === null) minimumPrice = priceFloor;
    if (maximumPrice === null) maximumPrice = priceCeiling;
    minimumPrice = Math.max(priceFloor, Math.min(minimumPrice, priceCeiling));
    maximumPrice = Math.max(minimumPrice, Math.min(maximumPrice, priceCeiling));
    const minSlider = $("#minimum-price");
    const maxSlider = $("#maximum-price");
    minSlider.min = maxSlider.min = String(priceFloor);
    minSlider.max = maxSlider.max = String(priceCeiling);
    minSlider.value = String(minimumPrice);
    maxSlider.value = String(maximumPrice);
    $("#minimum-price-label").textContent = money(minimumPrice);
    $("#maximum-price-label").textContent = money(maximumPrice);
    $("#price-floor-label").textContent = money(priceFloor);
    $("#price-ceiling-label").textContent = money(priceCeiling);
    const filtered = products.filter((product) => (!showFavoritesOnly || favorites.includes(product.id))
      && (!catalogFilters.bestSellers || product.bestSeller === true)
      && product.name.toLocaleLowerCase("pt-BR").includes(query)
      && Number(product.price) >= minimumPrice && Number(product.price) <= maximumPrice);
    $("#favorites-count").textContent = String(favorites.length);
    $("#detail-favorites-count").textContent = String(favorites.length);
    $("#show-favorites").classList.toggle("is-active", showFavoritesOnly);
    $("#show-favorites").setAttribute("aria-pressed", String(showFavoritesOnly));
    $("#detail-show-favorites").classList.toggle("is-active", showFavoritesOnly);
    $("#detail-show-favorites").setAttribute("aria-pressed", String(showFavoritesOnly));
    const relevance = (product) => {
      if (!query) return 0;
      const name = product.name.toLocaleLowerCase("pt-BR");
      return name === query ? 3 : name.startsWith(query) ? 2 : name.includes(query) ? 1 : 0;
    };
    filtered.sort((a, b) => {
      if (catalogSort === "relevance") return relevance(b) - relevance(a);
      if (catalogSort === "price-asc") return a.price - b.price;
      if (catalogSort === "price-desc") return b.price - a.price;
      if (catalogSort === "best-sellers") return productSalesCount(b.id) - productSalesCount(a.id) || a.price - b.price;
      if (catalogSort === "name") return a.name.localeCompare(b.name, "pt-BR");
      return 0;
    });
    const shown = filtered.slice(0, visibleCount);
    $("#catalog-total").textContent = `${new Intl.NumberFormat("pt-BR").format(filtered.length)} ${filtered.length === 1 ? "produto" : "produtos"}`;
    $("#no-products").textContent = catalogFilters.bestSellers
      ? "Nenhum produto marcado como Mais Vendido corresponde aos filtros atuais."
      : "Não encontramos produtos com essa busca.";
    $("#no-products").classList.toggle("hidden", filtered.length > 0);
    $("#load-more").classList.toggle("hidden", filtered.length <= shown.length);
    $("#store-products").innerHTML = shown.map((product) => renderProductCard(product)).join("");
    renderLaunchProducts();
    renderBestSellerProducts();
    renderToyProducts();
    renderBlockProducts();
    renderGiftCardProducts();
  }

  function syncShowcaseFromLocation() {
    const sectionId = window.location.hash.slice(1);
    if (!showcaseSections.includes(sectionId)) return;
    activeShowcase = sectionId;
    $(".mobile-categories").querySelectorAll("a").forEach((category) => {
      const isCurrent = category.hash === window.location.hash;
      category.classList.toggle("is-current", isCurrent);
      if (isCurrent) category.setAttribute("aria-current", "page");
      else category.removeAttribute("aria-current");
    });
    renderProducts();
  }

  function renderProductDetails(product) {
    const soldOut = verifiedStock(product) && product.stock < 1;
    renderProductGallery(product);
    $("#product-detail-title").textContent = product.name;
    const favoriteButton = $("#product-detail-favorite");
    const isFavorite = favorites.includes(product.id);
    favoriteButton.classList.toggle("is-favorite", isFavorite);
    favoriteButton.setAttribute("aria-label", isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos");
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.textContent = isFavorite ? "♥" : "♡";
    $("#product-detail-price").textContent = money(product.price);
    $("#product-detail-stock").textContent = soldOut ? "Produto indisponível no momento." : verifiedStock(product) ? `${product.stock} unidades em estoque.` : "";
    $("#product-detail-stock").classList.toggle("hidden", !verifiedStock(product));
    $("#product-detail-description").textContent = describeProduct(product);
    $("#product-detail-specifications").innerHTML = productSpecifications(product)
      .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join("");
    renderRelatedProducts(product);
    $("#product-detail-buy").disabled = soldOut;
    $("#product-detail-add").disabled = soldOut;
    $("#product-detail-buy").dataset.productId = product.id;
    $("#product-detail-add").dataset.productId = product.id;
  }

  function renderRelatedProducts(product) {
    const sameCategory = products.filter((candidate) => candidate.id !== product.id && productCategory(candidate.name) === productCategory(product.name));
    const otherProducts = products.filter((candidate) => candidate.id !== product.id && !sameCategory.includes(candidate));
    const recommendations = [...sameCategory, ...otherProducts].slice(0, 12);
    $("#related-products").innerHTML = recommendations.map((candidate) => renderProductCard(candidate)).join("");
    $("#related-products").scrollLeft = 0;
  }

  function renderProductGallery(product) {
    detailGalleryImages = Array.isArray(product.images) && product.images.length
      ? [...new Set(product.images.filter((image) => typeof image === "string" && image))]
      : (product.image ? [product.image] : []);
    detailGalleryIndex = Math.min(detailGalleryIndex, Math.max(0, detailGalleryImages.length - 1));
    const hasMultipleImages = detailGalleryImages.length > 1;
    const currentImage = detailGalleryImages[detailGalleryIndex];
    $("#product-detail-photo").innerHTML = `
      ${currentImage ? `<img class="product-gallery-main-image" src="${escapeHtml(currentImage)}" alt="${escapeHtml(product.name)}">` : '<span class="store-placeholder" aria-hidden="true">TCG</span>'}
      ${hasMultipleImages ? `
        <button class="product-gallery-arrow product-gallery-previous" type="button" data-gallery-step="-1" aria-label="Ver foto anterior">‹</button>
        <button class="product-gallery-arrow product-gallery-next" type="button" data-gallery-step="1" aria-label="Ver próxima foto">›</button>
      ` : ""}
    `;
    $("#product-detail-gallery").classList.toggle("has-multiple-images", hasMultipleImages);
    $("#product-gallery-thumbnails").classList.toggle("hidden", !hasMultipleImages);
    $("#product-gallery-thumbnails").innerHTML = hasMultipleImages ? detailGalleryImages.map((image, index) => `
      <button class="product-gallery-thumbnail ${index === detailGalleryIndex ? "is-selected" : ""}" type="button" data-gallery-index="${index}" aria-label="Ver foto ${index + 1} de ${detailGalleryImages.length}" aria-current="${index === detailGalleryIndex}">
        <img src="${escapeHtml(image)}" alt="">
      </button>
    `).join("") : "";
  }

  function openProductDetails(productId) {
    const product = getProduct(productId);
    if (!product) return;
    if (detailProductId !== productId) detailGalleryIndex = 0;
    detailProductId = productId;
    renderProductDetails(product);
    $("#detail-store-search").value = $("#store-search").value;
    $("#detail-open-account").innerHTML = $("#open-account").innerHTML;
    $("#detail-open-account").setAttribute("aria-label", $("#open-account").getAttribute("aria-label"));
    $("#detail-cart-count").textContent = String(cartQuantity());
    const detailDialog = $("#product-detail-dialog");
    if (!detailDialog.open) detailDialog.showModal();
    detailDialog.scrollTop = 0;
  }

  function renderCart() {
    $("#cart-count").textContent = String(cartQuantity());
    $("#detail-cart-count").textContent = String(cartQuantity());
    $("#cart-checkout-count").textContent = String(cartQuantity());
    $(".cart-header-indicator").setAttribute("aria-label", `Carrinho com ${cartQuantity()} ${cartQuantity() === 1 ? "item" : "itens"}`);
    const lines = cart.map((item) => {
      const product = getProduct(item.productId);
      if (!product) return "";
      return `<div class="cart-line">
        <div class="cart-product-cell"><img src="${escapeHtml(product.image)}" alt="" loading="lazy"><div class="cart-line-info"><div class="cart-line-title" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div><small>Walk Cards</small></div></div>
        <span class="cart-delivery-estimate">Prazo a confirmar</span>
        <strong class="cart-unit-price">${money(product.price)}</strong>
        <div class="cart-line-controls">
          <button class="cart-quantity-button" type="button" data-cart-step="-1" data-cart-product="${escapeHtml(product.id)}" aria-label="Diminuir quantidade de ${escapeHtml(product.name)}" ${item.quantity <= 1 ? "disabled" : ""}>−</button>
          <span class="cart-line-qty" aria-label="Quantidade: ${item.quantity}">${item.quantity}</span>
          <button class="cart-quantity-button" type="button" data-cart-step="1" data-cart-product="${escapeHtml(product.id)}" aria-label="Aumentar quantidade de ${escapeHtml(product.name)}" ${verifiedStock(product) && item.quantity >= product.stock ? "disabled" : ""}>+</button>
        </div>
        <strong class="cart-line-price">${money(product.price * item.quantity)}</strong>
        <button class="remove-cart-item" type="button" data-remove-product="${escapeHtml(product.id)}" aria-label="Remover ${escapeHtml(product.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v6m4-6v6"/></svg>
        </button>
      </div>`;
    }).join("");
    $("#cart-lines").innerHTML = lines;
    $("#mini-cart-lines").innerHTML = cart.map((item) => {
      const product = getProduct(item.productId);
      if (!product) return "";
      return `<article class="mini-cart-line">
        <img src="${escapeHtml(product.image)}" alt="" loading="lazy">
        <div class="mini-cart-line-info"><strong>${escapeHtml(product.name)}</strong><div class="mini-cart-line-controls">
          ${item.quantity <= 1
            ? `<button class="mini-cart-remove" type="button" data-remove-product="${escapeHtml(product.id)}" aria-label="Remover ${escapeHtml(product.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v6m4-6v6"/></svg></button>`
            : `<button type="button" data-cart-step="-1" data-cart-product="${escapeHtml(product.id)}" aria-label="Diminuir quantidade de ${escapeHtml(product.name)}">−</button>`}
          <span>${item.quantity}</span>
          <button type="button" data-cart-step="1" data-cart-product="${escapeHtml(product.id)}" aria-label="Aumentar quantidade de ${escapeHtml(product.name)}" ${verifiedStock(product) && item.quantity >= product.stock ? "disabled" : ""}>+</button>
        </div></div>
        <div class="mini-cart-line-price"><strong>${money(product.price * item.quantity)}</strong></div>
      </article>`;
    }).join("");
    $("#cart-empty").classList.toggle("hidden", cart.length > 0);
    $("#mini-cart-empty").classList.toggle("hidden", cart.length > 0);
    $("#mini-cart-lines").classList.toggle("hidden", cart.length === 0);
    $("#view-full-cart").disabled = cart.length === 0;
    const subtotal = cartTotal();
    $("#cart-subtotal").textContent = money(subtotal);
    $("#cart-shipping").textContent = "A combinar";
    $("#cart-delivery-price").textContent = "A combinar";
    $("#mini-cart-subtotal").textContent = money(subtotal);
    $("#mini-cart-shipping").textContent = "A combinar";
    $("#mini-cart-total").textContent = money(subtotal);
    $("#cart-total").textContent = money(subtotal);
    $("#continue-checkout").disabled = cart.length === 0;
    $("#mini-shipping-message").textContent = "Você ganhou Frete Grátis na entrega Econômica!";
  }

  function addProduct(productId) {
    const product = getProduct(productId);
    if (!product) {
      showToast("Este produto não está mais disponível no catálogo.");
      return false;
    }
    const existing = cart.find((item) => item.productId === productId);
    if (verifiedStock(product) && (existing?.quantity || 0) >= product.stock) {
      showToast("A quantidade no carrinho já atingiu o estoque informado.");
      return false;
    }
    if (existing) existing.quantity = Math.min(existing.quantity + 1, 99);
    else cart.push({ productId, quantity: 1 });
    if (saveCart()) {
      renderCart();
      showToast("Produto adicionado ao carrinho.");
      return true;
    }
    return false;
  }

  function contactAboutCart() {
    if (!cart.length) return;
    const productsText = cart.map((item) => {
      const product = getProduct(item.productId);
      return product ? `${item.quantity}x ${product.name}` : "";
    }).filter(Boolean).join("\n");
    const message = `Olá! Gostaria de confirmar o preço atualizado, a disponibilidade e o frete destes produtos:\n${productsText}`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function contactAboutProduct(productId) {
    const product = getProduct(productId);
    if (!product) return;
    const message = `Olá! Gostaria de confirmar o preço atualizado, a disponibilidade e o frete do produto: ${product.name}`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function openCart() {
    if ($("#mini-cart-dialog").open) $("#mini-cart-dialog").close();
    $("#checkout-dialog").classList.remove("checkout-fullscreen");
    $("#checkout-dialog").classList.add("cart-fullscreen");
    $("#cart-view").classList.remove("hidden");
    $("#buyer-view").classList.add("hidden");
    $("#payment-view").classList.add("hidden");
    renderCart();
    $("#checkout-dialog").showModal();
  }

  function openMiniCart() {
    renderCart();
    if (!$("#mini-cart-dialog").open) $("#mini-cart-dialog").showModal();
  }

  async function createOrder(event) {
    event.preventDefault();
    if (!cart.length) {
      showToast("Adicione um produto ao carrinho antes de continuar.");
      return;
    }
    try {
      const response = await fetch("/api/pix-settings", { cache: "no-store" });
      const settings = await response.json();
      if (!response.ok) throw new Error(settings.error || "Não foi possível carregar as configurações de pagamento.");
      if (settings.key) pixSettings = settings;
    } catch (error) {
      console.error("Não foi possível carregar a chave Pix compartilhada.", error);
      if (!pixSettings.key.trim()) {
        showToast(error.message || "Não foi possível carregar a chave Pix. Tente novamente mais tarde.");
        return;
      }
    }
    if (!pixSettings.key.trim()) {
      showToast("A loja ainda não cadastrou a chave Pix. Entre em contato com a loja.");
      return;
    }

    const customer = $("#buyer-name").value.trim();
    const email = $("#buyer-email").value.trim();
    const phone = $("#buyer-phone").value.trim();
    if (!customer || !email || !phone) {
      showToast("Informe seu nome, e-mail e WhatsApp para identificar o pedido.");
      return;
    }
    const postalCode = $("#delivery-postal-code").value.replace(/\D/g, "");
    if (!/^\d{8}$/.test(postalCode)) {
      showToast("Informe um CEP válido com 8 números.");
      $("#delivery-postal-code").focus();
      return;
    }
    const delivery = {
      method: "delivery", postalCode,
      street: $("#delivery-street").value.trim(), number: $("#delivery-number").value.trim(),
      complement: $("#delivery-complement").value.trim(), neighborhood: $("#delivery-neighborhood").value.trim(),
      city: $("#delivery-city").value.trim(), state: $("#delivery-state").value,
      recipient: $("#delivery-recipient").value.trim()
    };
    if (!delivery.street || !delivery.number || !delivery.neighborhood || !delivery.city || !delivery.state || !delivery.recipient) {
      showToast("Preencha todos os campos obrigatórios do endereço de entrega.");
      return;
    }
    const deliveryAddress = `${delivery.street}, ${delivery.number}${delivery.complement ? `, ${delivery.complement}` : ""} - ${delivery.neighborhood}, ${delivery.city}/${delivery.state} - CEP ${postalCode.replace(/^(\d{5})(\d{3})$/, "$1-$2")}`;
    const items = cart.map((item) => {
      const product = getProduct(item.productId);
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.price
      };
    });
    const outOfStock = cart.some((item) => {
      const product = getProduct(item.productId);
      return Number.isInteger(product?.stock) && item.quantity > product.stock;
    });
    if (outOfStock) {
      showToast("Um dos produtos não tem estoque suficiente para essa quantidade. Atualize o carrinho.");
      return;
    }
    let amount = orderTotal();
    let order = {
      source: "store-checkout", items, customer, email, phone, delivery
    };
    try {
      window.PixQr.buildPixPayload({ key: pixSettings.key, owner: pixSettings.owner, amount });
    } catch (error) {
      console.error("Não foi possível validar a chave PIX.", error);
      showToast(error.message || "Não foi possível gerar o QR Code PIX.");
      return;
    }
    let sharedOrder;
    try {
      const response = await fetch("/api/store-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order)
      });
      sharedOrder = await response.json();
      if (!response.ok) throw new Error(sharedOrder.error || "Não foi possível registrar o pedido compartilhado.");
      order = sharedOrder.order;
      amount = Number(order.amount);
      if (Array.isArray(sharedOrder.products)) {
        products = sharedOrder.products;
        dashboardState.products = products;
        renderProducts();
      }
    } catch (error) {
      console.error("Não foi possível salvar o pedido no servidor.", error);
      showToast(error.message || "Não foi possível registrar o pedido. Tente novamente.");
      return;
    }

    try {
      const pixPayload = window.PixQr.buildPixPayload({ key: pixSettings.key, owner: pixSettings.owner, amount });
      await window.PixQr.render($("#payment-pix-qr"), pixPayload, 220);
      $("#payment-pix-code").value = pixPayload;
    } catch (error) {
      console.error("Não foi possível gerar o QR Code PIX do pedido.", error);
      showToast(error.message || "O pedido foi registrado, mas não foi possível gerar o QR Code PIX.");
      return;
    }
    cart = [];
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    $("#payment-order-id").textContent = `Pedido ${order.id}`;
    $("#payment-reported-button").dataset.orderId = order.id;
    $("#payment-total").textContent = money(amount);
    $("#payment-delivery").textContent = `Entrega para ${delivery.recipient}: ${deliveryAddress}`;
    $("#payment-pending-banner").classList.remove("hidden");
    $("#payment-qr-wrap").classList.remove("hidden");
    $("#payment-reported-button").classList.remove("hidden");
    $("#payment-thanks").classList.add("hidden");
    $("#cart-view").classList.add("hidden");
    $("#buyer-view").classList.add("hidden");
    $("#payment-view").classList.remove("hidden");
    $("#buyer-name").value = "";
    $("#buyer-email").value = "";
    $("#buyer-phone").value = "";
    $("#checkout-form").reset();
    renderCart();
  }

  $("#payment-pix-copy").addEventListener("click", async () => {
    const code = $("#payment-pix-code").value;
    if (!code) {
      showToast("Gere o QR Code antes de copiar o código PIX.");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const input = $("#payment-pix-code");
      input.focus();
      input.select();
      if (!document.execCommand("copy")) {
        showToast("Não foi possível copiar automaticamente. Selecione e copie o código PIX.");
        return;
      }
    }
    showToast("Código PIX copiado. Cole no aplicativo do seu banco.");
  });

  readLocalData();
  syncShowcaseFromLocation();
  renderProducts();
  renderCart();
  loadSharedProducts();
  window.setInterval(() => {
    if (document.visibilityState === "visible") loadSharedProducts();
  }, 15000);

  const accountDialog = $("#account-dialog");
  const accountStatus = $("#account-status");
  let googleSignInInitialized = false;
  function onGoogleCredential(response) {
    if (!response?.credential) {
      accountStatus.textContent = "Não foi possível entrar com o Google. Tente novamente.";
      return;
    }
    try {
      const tokenPayload = response.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const profile = JSON.parse(decodeURIComponent(escape(atob(tokenPayload))));
      accountStatus.textContent = profile.name
        ? `Conta Google selecionada: ${profile.name}. A validação da sessão da loja ainda precisa ser configurada.`
        : "Conta Google selecionada. A validação da sessão da loja ainda precisa ser configurada.";
    } catch {
      accountStatus.textContent = "Conta Google selecionada. A validação da sessão da loja ainda precisa ser configurada.";
    }
  }
  function startGoogleLogin() {
    const clientId = window.POKE_CENTRAL_GOOGLE_CLIENT_ID;
    if (!clientId) {
      accountStatus.textContent = "O login do Google ainda precisa ser configurado para esta loja.";
      if (!accountDialog.open) accountDialog.showModal();
      return;
    }
    if (!window.google?.accounts?.id) {
      accountStatus.textContent = "O serviço do Google não carregou. Verifique sua conexão e tente novamente.";
      if (!accountDialog.open) accountDialog.showModal();
      return;
    }
    if (!googleSignInInitialized) {
      window.google.accounts.id.initialize({ client_id: clientId, callback: onGoogleCredential });
      googleSignInInitialized = true;
    }
    const button = $("#google-signin-button");
    if (!button.hasChildNodes()) {
      window.google.accounts.id.renderButton(button, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 280 });
    }
    accountStatus.textContent = "";
    if (!accountDialog.open) accountDialog.showModal();
    window.google.accounts.id.prompt();
  }
  $("#open-account").addEventListener("click", () => {
    startGoogleLogin();
  });
  document.querySelectorAll("[data-close-account]").forEach((button) => button.addEventListener("click", () => accountDialog.close()));
  accountDialog.addEventListener("click", (event) => { if (event.target === accountDialog) accountDialog.close(); });

  $("#store-search").addEventListener("input", () => {
    $("#catalog-search").value = $("#store-search").value;
    visibleCount = pageSize;
    renderProducts();
  });
  $("#detail-store-search").addEventListener("input", () => {
    $("#store-search").value = $("#detail-store-search").value;
    $("#store-search").dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("#detail-store-search").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("#product-detail-dialog").close();
    window.location.hash = "catalogo";
    $("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#catalog-search").addEventListener("input", () => {
    $("#store-search").value = $("#catalog-search").value;
    visibleCount = pageSize;
    renderProducts();
  });
  document.querySelectorAll("[data-catalog-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.catalogFilter;
      if (filter === "best-sellers") {
        catalogFilters.bestSellers = !catalogFilters.bestSellers;
        catalogFilters.lowestPrice = false;
        catalogSort = catalogFilters.bestSellers ? "best-sellers" : "relevance";
      } else {
        catalogFilters.lowestPrice = !catalogFilters.lowestPrice;
        catalogFilters.bestSellers = false;
        catalogSort = catalogFilters.lowestPrice ? "price-asc" : "relevance";
      }
      $("#catalog-sort").value = catalogSort;
      document.querySelectorAll("[data-catalog-filter]").forEach((filterButton) => {
        const active = filterButton.dataset.catalogFilter === "lowest-price" ? catalogFilters.lowestPrice : catalogFilters.bestSellers;
        filterButton.classList.toggle("is-active", active);
        filterButton.setAttribute("aria-pressed", String(active));
      });
      visibleCount = pageSize;
      renderProducts();
    });
  });
  $("#catalog-sort").addEventListener("change", (event) => {
    catalogSort = event.currentTarget.value;
    catalogFilters.lowestPrice = catalogSort === "price-asc";
    catalogFilters.bestSellers = catalogSort === "best-sellers";
    document.querySelectorAll("[data-catalog-filter]").forEach((filterButton) => {
      const active = filterButton.dataset.catalogFilter === "lowest-price" ? catalogFilters.lowestPrice : catalogFilters.bestSellers;
      filterButton.classList.toggle("is-active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });
    visibleCount = pageSize;
    renderProducts();
  });
  $("#minimum-price").addEventListener("input", (event) => {
    minimumPrice = Math.min(Number(event.currentTarget.value), maximumPrice);
    renderProducts();
  });
  $("#maximum-price").addEventListener("input", (event) => {
    maximumPrice = Math.max(Number(event.currentTarget.value), minimumPrice);
    renderProducts();
  });
  $("#load-more").addEventListener("click", () => {
    visibleCount += pageSize;
    renderProducts();
  });
  $(".mobile-categories").addEventListener("click", (event) => {
    const selectedCategory = event.target.closest("a");
    if (!selectedCategory) return;
    const targetSection = selectedCategory.hash.slice(1);
    if (showcaseSections.includes(targetSection)) {
        event.preventDefault();
        $("#store-search").value = "";
        visibleCount = pageSize;
        if (window.location.hash !== selectedCategory.hash) {
          window.history.pushState(null, "", selectedCategory.hash);
        }
        syncShowcaseFromLocation();
        document.getElementById(targetSection).scrollIntoView({ behavior: "smooth", block: "start" });
    }
    $(".mobile-categories").querySelectorAll("a").forEach((category) => {
      const isCurrent = category === selectedCategory;
      category.classList.toggle("is-current", isCurrent);
      if (isCurrent) category.setAttribute("aria-current", "page");
      else category.removeAttribute("aria-current");
    });
  });
  window.addEventListener("hashchange", syncShowcaseFromLocation);
  window.addEventListener("popstate", syncShowcaseFromLocation);
  function handleProductCardClick(event) {
    const detailsButton = event.target.closest("[data-product-details]");
    if (detailsButton) {
      openProductDetails(detailsButton.dataset.productDetails);
      return;
    }
    const favoriteButton = event.target.closest("[data-favorite-product]");
    if (favoriteButton) {
      const productId = favoriteButton.dataset.favoriteProduct;
      favorites = favorites.includes(productId)
        ? favorites.filter((favoriteId) => favoriteId !== productId)
        : [...favorites, productId];
      try {
        localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites));
        renderProducts();
      } catch (error) {
        console.error("Não foi possível salvar os favoritos.", error);
        showToast("Não foi possível salvar os favoritos neste navegador.");
      }
      return;
    }
    const button = event.target.closest("[data-add-product]");
    if (button) addProduct(button.dataset.addProduct);
  }
  $("#store-products").addEventListener("click", handleProductCardClick);
  $("#launch-products").addEventListener("click", handleProductCardClick);
  $("#best-seller-products").addEventListener("click", handleProductCardClick);
  $("#toy-products").addEventListener("click", handleProductCardClick);
  $("#block-products").addEventListener("click", handleProductCardClick);
  $("#gift-card-products").addEventListener("click", handleProductCardClick);
  $("#related-products").addEventListener("click", handleProductCardClick);
  $("#product-detail-dialog").addEventListener("click", (event) => {
    const relatedArrow = event.target.closest("[data-related-scroll]");
    if (!relatedArrow) return;
    $("#related-products").scrollBy({ left: Number(relatedArrow.dataset.relatedScroll) * 330, behavior: "smooth" });
  });
  document.querySelectorAll(".launch-carousel, .best-sellers-carousel, .toy-carousel, .blocks-carousel, .gift-card-carousel").forEach((carousel) => {
    carousel.addEventListener("click", (event) => {
      const arrow = event.target.closest("[data-carousel-step]");
      if (!arrow) return;
      const track = $(`#${arrow.dataset.carouselTarget}`);
      track.scrollBy({
        left: Number(arrow.dataset.carouselStep) * track.clientWidth * 0.85,
        behavior: "smooth"
      });
    });
  });
  $("#product-detail-dialog").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-product]")) {
      $("#product-detail-dialog").close();
      return;
    }
    const galleryThumbnail = event.target.closest("[data-gallery-index]");
    if (galleryThumbnail) {
      detailGalleryIndex = Number(galleryThumbnail.dataset.galleryIndex);
      const product = getProduct(detailProductId);
      if (product) renderProductGallery(product);
      return;
    }
    const galleryArrow = event.target.closest("[data-gallery-step]");
    if (galleryArrow && detailGalleryImages.length > 1) {
      detailGalleryIndex = (detailGalleryIndex + Number(galleryArrow.dataset.galleryStep) + detailGalleryImages.length) % detailGalleryImages.length;
      const product = getProduct(detailProductId);
      if (product) renderProductGallery(product);
      return;
    }
    const favoriteButton = event.target.closest("[data-detail-favorite]");
    if (favoriteButton && detailProductId) {
      favorites = favorites.includes(detailProductId)
        ? favorites.filter((favoriteId) => favoriteId !== detailProductId)
        : [...favorites, detailProductId];
      try {
        localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites));
        renderProducts();
        const product = getProduct(detailProductId);
        if (product) renderProductDetails(product);
      } catch (error) {
        console.error("Não foi possível salvar os favoritos.", error);
        showToast("Não foi possível salvar os favoritos neste navegador.");
      }
      return;
    }
  });
  $("#product-detail-add").addEventListener("click", (event) => {
    addProduct(event.currentTarget.dataset.productId);
  });
  $("#product-detail-buy").addEventListener("click", (event) => {
    const productId = event.currentTarget.dataset.productId;
    if (!addProduct(productId)) return;
    $("#product-detail-dialog").close();
    openCart();
  });
  $("#product-detail-dialog").addEventListener("close", () => {
    detailProductId = "";
    detailGalleryImages = [];
    detailGalleryIndex = 0;
  });
  $("#detail-open-account").addEventListener("click", () => {
    $("#product-detail-dialog").close();
    $("#open-account").click();
  });
  $("#detail-open-cart").addEventListener("click", () => {
    $("#product-detail-dialog").close();
    $("#open-cart").click();
  });
  $("#detail-show-favorites").addEventListener("click", () => {
    $("#product-detail-dialog").close();
    $("#show-favorites").click();
  });
  $("#open-cart").addEventListener("click", openMiniCart);
  $("#show-favorites").addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;
    if (showFavoritesOnly) window.location.hash = "catalogo";
    renderProducts();
    $("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $(".cart-header-indicator").addEventListener("click", openMiniCart);
  $("#view-full-cart").addEventListener("click", openCart);
  $("#cart-coupon-toggle").addEventListener("click", (event) => {
    const row = $("#cart-coupon-row");
    const willOpen = row.classList.contains("hidden");
    row.classList.toggle("hidden", !willOpen);
    event.currentTarget.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) $("#cart-coupon-code").focus();
  });
  $("#cart-coupon-apply").addEventListener("click", () => {
    const code = $("#cart-coupon-code").value.trim();
    showToast(code ? "Cupons de desconto ainda não foram configurados." : "Digite o código do cupom.");
  });
  $("#mini-cart-more").addEventListener("click", () => $("#mini-cart-dialog").close());
  $("#mini-shipping-rules").addEventListener("click", () => showToast("Consulte as regras e a disponibilidade da entrega econômica com a loja."));
  $("#mini-coupon-apply").addEventListener("click", () => {
    const code = $("#mini-coupon-code").value.trim();
    showToast(code ? "Cupons de desconto ainda não foram configurados." : "Digite o código do cupom.");
  });
  $("#continue-checkout").addEventListener("click", () => {
    if (!cart.length) return;
    $("#checkout-dialog").classList.remove("cart-fullscreen");
    $("#checkout-dialog").classList.add("checkout-fullscreen");
    $("#cart-view").classList.add("hidden");
    $("#buyer-view").classList.remove("hidden");
    $("#payment-view").classList.add("hidden");
    renderDeliverySummary();
  });
  $("#back-to-cart").addEventListener("click", () => {
    $("#checkout-dialog").classList.remove("checkout-fullscreen");
    $("#checkout-dialog").classList.add("cart-fullscreen");
    $("#buyer-view").classList.add("hidden");
    $("#cart-view").classList.remove("hidden");
  });
  $("#delivery-postal-code").addEventListener("input", (event) => {
    const input = event.currentTarget;
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  });
  $("#add-more-items").addEventListener("click", () => $("#checkout-dialog").close());
  $("#checkout-form").addEventListener("submit", createOrder);
  $("#payment-reported-button").addEventListener("click", async () => {
    const orderId = $("#payment-reported-button").dataset.orderId;
    try {
      const response = await fetch("/api/store-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, action: "reported" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível avisar a loja.");
    } catch (error) {
      console.error("Não foi possível registrar o aviso de pagamento.", error);
      showToast(error.message || "Não foi possível avisar a loja. Tente novamente.");
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(dashboardStorageKey) || "{}");
      const order = Array.isArray(saved.sales) ? saved.sales.find((sale) => sale.id === orderId) : null;
      if (order) {
        order.customerReportedPaid = true;
        order.customerReportedPaidAt = new Date().toISOString();
        localStorage.setItem(dashboardStorageKey, JSON.stringify(saved));
      }
    } catch (error) {
      console.error("Não foi possível registrar o aviso de pagamento.", error);
    }
    $("#payment-pending-banner").classList.add("hidden");
    $("#payment-qr-wrap").classList.add("hidden");
    $("#payment-reported-button").classList.add("hidden");
    $("#payment-thanks").classList.remove("hidden");
  });
  function handleCartLineAction(event) {
    const removeButton = event.target.closest("[data-remove-product]");
    if (removeButton) {
      cart = cart.filter((item) => item.productId !== removeButton.dataset.removeProduct);
      if (saveCart()) renderCart();
      return;
    }
    const quantityButton = event.target.closest("[data-cart-step]");
    if (!quantityButton) return;
    const item = cart.find((entry) => entry.productId === quantityButton.dataset.cartProduct);
    const product = getProduct(quantityButton.dataset.cartProduct);
    if (!item || !product) return;
    const maxQuantity = Math.min(99, verifiedStock(product) ? product.stock : 99);
    const nextQuantity = item.quantity + Number(quantityButton.dataset.cartStep);
    if (nextQuantity < 1 || nextQuantity > maxQuantity) {
      if (nextQuantity > maxQuantity) showToast(`A quantidade máxima disponível é ${maxQuantity}.`);
      return;
    }
    item.quantity = nextQuantity;
    if (saveCart()) renderCart();
  }
  $("#cart-lines").addEventListener("click", handleCartLineAction);
  $("#mini-cart-lines").addEventListener("click", handleCartLineAction);
  document.querySelectorAll("[data-close-checkout]").forEach((button) => {
    button.addEventListener("click", () => $("#checkout-dialog").close());
  });
  document.querySelectorAll("[data-close-mini-cart]").forEach((button) => {
    button.addEventListener("click", () => $("#mini-cart-dialog").close());
  });
  $("#mini-cart-dialog").addEventListener("click", (event) => {
    if (event.target === $("#mini-cart-dialog")) $("#mini-cart-dialog").close();
  });
  $("#checkout-dialog").addEventListener("click", (event) => {
    if (event.target === $("#checkout-dialog")) $("#checkout-dialog").close();
  });
})();






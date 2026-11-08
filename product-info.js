(function (root) {
  'use strict';
  const pricing = typeof module === 'object' && module.exports ? require('./pricing') : root.StorePricing;
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
  const pixPrice = product => pricing.pixPrice(product.price);
  const verifiedStock = product => product.stockVerified === true && Number.isInteger(product.stock) && product.stock >= 0;
  function publicText(value) {
    return String(value ?? '').replace(/\bcopag\b/gi, '')
      .replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ')
      .replace(/^(?:\s*[-–—|]\s*)+|(?:\s*[-–—|]\s*)+$/g, '').trim();
  }
  function publicProduct(product) {
    const visible = { ...product };
    for (const key of Object.keys(visible)) {
      if (/supplier|fornecedor/i.test(key)) delete visible[key];
    }
    for (const key of ['name', 'description', 'brand', 'manufacturer', 'manufacturerName', 'includedItems', 'category', 'model']) {
      if (typeof visible[key] === 'string') {
        visible[key] = publicText(visible[key]);
        if (!visible[key]) delete visible[key];
      }
    }
    return visible;
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
      ["Preço base", money(product.price)],
      ["Preço no Pix (10% de desconto)", money(pixPrice(product))],
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

  const info = { productCategory, describeProduct, productSpecifications, publicText, publicProduct };
  if (typeof module === 'object' && module.exports) module.exports = info;
  else root.StoreProductInfo = info;
})(typeof window === 'undefined' ? globalThis : window);

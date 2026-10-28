# Revisão da loja para o Google Merchant Center

Revisão em 28/10/2026. As mudanças corrigem inconsistências técnicas e de conteúdo. A aprovação da conta depende da avaliação do Google e da operação real da empresa.

## Informações confirmadas pelo responsável

- Domínio: https://walkcards.online/
- Empresa exibida: Time Walk Cards Colecionaveis LTDA, CNPJ 19.271.540/0001-38, com endereço em Osasco já cadastrado no site.
- Entrega para todo o Brasil com frete grátis, sem mínimo informado.
- Atendimento em horário comercial.
- Em 28/10/2026, o responsável confirmou estoque para todos os produtos. Aplicado ajuste único para 22 unidades por produto, com cópia do catálogo anterior no banco e marcador para não repor automaticamente unidades vendidas.
- Prazo estimado total de entrega de 7 a 9 dias úteis após a confirmação do pagamento, incluindo preparação e transporte.
- Direito de arrependimento em compras online por 7 dias após o recebimento. Os direitos relativos a defeitos não ficam limitados a esse prazo.

## Correções realizadas

- Removidos selos de Confì/Ri Happy, VTEX/PCI e Tuna, que não tinham comprovação para a Walk Cards.
- O rodapé anuncia somente o Pix disponível no checkout. Removidas marcas de cartão, NuPay e Pix parcelado sem implementação.
- Atualizadas as seis páginas institucionais para refletir pedidos no servidor, Pix, atendimento, entrega, devoluções e tratamento de dados. Removidas declarações antigas de loja demonstrativa ou checkout desativado.
- Frete gratuito nacional consistente no carrinho, checkout, página de produto, termos, política e feed.
- Removida a atribuição automática de 23 unidades em estoque. Produtos do preset antigo precisam de conferência individual no painel; só saldos confirmados manualmente são anunciados como disponíveis e aceitos para novos pedidos.
- O feed usa o mesmo preço no Pix e arredondamento do checkout, em reais. As páginas de produto mostram o preço base como referência do cálculo, sem apresentá-lo como histórico de preço anterior.
- Criadas páginas individuais `/produto/ID`, com título, imagens, preço, disponibilidade e dados estruturados gerados no servidor a partir do catálogo compartilhado. O feed direciona para essas páginas.
- Adicionados sitemap e URLs canônicas. Removido o link de loteria do rodapé comercial e excluídas páginas de ferramentas/prévias do rastreamento no robots.txt.
- Desativada a abertura automática do pop-up de promoção. Atendimento e compra sem cadastro substituem a tentativa de login Google não configurada.
- Mantidos os registros de pagamentos e a integração da gateway. A descrição de transação solicitada anteriormente não foi alterada.

## Antes de pedir uma nova análise

1. No aviso exibido pelo Google, concluir **Verificar identidade**. O nome e o endereço dos documentos precisam corresponder aos dados no Merchant Center e no perfil de pagamentos. A confirmação do responsável no chat não substitui a validação documental do Google.
2. Conferir razão social, CNPJ, endereço e telefone reais no site, no Merchant Center e nos documentos. Verificar o telefone e a propriedade do domínio onde o Google solicitar.
3. Em **Painel → Produtos**, manter os saldos reais atualizados. O ajuste único para 22 unidades por produto registra a confirmação do responsável; o catálogo importado não comprova estoque físico, procedência, GTIN, autorização de imagens ou características do produto.
4. O prazo estimado total confirmado pelo responsável e publicado é de 7 a 9 dias úteis após a confirmação do pagamento, incluindo preparação e transporte. Configurar no Merchant Center prazos de processamento e transporte cuja soma corresponda a essa estimativa. A divisão entre postagem e transporte e a transportadora não foram informadas; não foi inventada uma divisão desses prazos no feed.
5. Configurar frete para o Brasil a R$ 0,00 no Merchant Center e cadastrar a política de devolução: https://walkcards.online/trocas-devolucoes/. Usar os mesmos prazos reais de envio da operação.
6. Atualizar a fonte de produtos: https://walkcards.online/merchant-feed.xml. Esperar o processamento e conferir os links, preços e disponibilidade. Sitemap: https://walkcards.online/sitemap.xml.
7. Conferir o recebedor efetivo do Pix e sua relação com a empresa, o atendimento, uma compra controlada e um procedimento real de reembolso. Não gerar avaliações ou certificações fictícias para solicitar reanálise.
8. Pedir revisão apenas depois de verificar a publicação e resolver as pendências exibidas na conta. Esta revisão não acessa nem altera o Merchant Center ou conclui a verificação de identidade.

## Validação técnica

Testes com gateway e armazenamento simulados cobrem preço, frete, estoque legado, prevenção de cobrança sem saldo confirmado, pagamentos e conciliação após arquivamento. Os testes de conteúdo verificam identidade, políticas, páginas individuais e controles do painel. Não substituem teste financeiro real nem comprovam a capacidade logística.

## Referências

- [Política de deturpação](https://support.google.com/merchants/answer/6150127?hl=pt-BR)
- [Documentos da empresa e identidade](https://support.google.com/merchants/answer/17123687?hl=pt-BR)
- [Requisitos da página de destino](https://support.google.com/merchants/answer/4752265?hl=pt-BR)
- [Preço no feed, página e checkout](https://support.google.com/merchants/answer/6324371?hl=pt-BR)
- [Configurações de frete](https://support.google.com/merchants/answer/12577710?hl=pt-BR)
- [CDC, incluindo art. 49](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html)

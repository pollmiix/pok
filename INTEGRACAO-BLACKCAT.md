# Blackcat — Pix

A opção **Gateway** fica no painel autenticado da loja. O comprador continua escolhendo Pix no checkout; o provedor é configurado pela loja.

## Configuração na Vercel

1. Redefina a chave privada que apareceu na captura enviada ao chat.
2. Em **Settings → Environment Variables**, cadastre `BLACKCAT_API_KEY` com a nova chave privada e `WALKCARDS_PUBLIC_URL` com a origem pública HTTPS da loja (exemplo: `https://loja.example`). Não inclua caminhos.
3. Preserve as variáveis existentes de senha administrativa e Redis. Veja os nomes em `.env.example`.
4. Publique novamente o projeto para aplicar as variáveis. Abra `/admin.php`, entre em **Gateway**, teste a conexão e ative a Blackcat.

O teste consulta os dados do vendedor e não cria pagamentos. A chave pública e o código de split não são necessários nesta integração. Nenhum split é enviado.

## Comportamento

- O servidor calcula os valores pelo catálogo compartilhado; a API recebe valores em centavos.
- O checkout solicita CPF ou CNPJ válido quando o gateway está ativo e envia o endereço de entrega exigido para produtos físicos. O documento não é salvo no histórico local da loja.
- O QR Code vem da cobrança Blackcat. Sua validade é de um dia. O frete continua combinado à parte, como no checkout existente.
- O endpoint `/api/blackcat-webhook` recebe notificações. O servidor consulta a transação na API antes de aceitar qualquer status recebido. Confira o cadastro e a entrega das notificações no painel do provedor após publicar.
- Enquanto a tela de pagamento estiver aberta, o site consulta a confirmação a cada 15 segundos. O painel também oferece **Consultar Blackcat** por pedido.
- A desativação vale para novos pedidos. Cobranças existentes continuam sendo consultadas. Pedidos do gateway não permitem confirmação manual nem exclusão do histórico.
- Cancelamentos confirmados pela API devolvem o estoque uma vez. Estornos aparecem como **Estornado**; a reposição física deve ser conferida pela loja.

## Falhas e conferência

Se a conexão falhar durante a criação da cobrança, o pedido e a reserva de estoque são preservados. Novas tentativas com o mesmo identificador não criam outra cobrança. Confira o pedido pela referência `PC-…` no painel Blackcat antes de iniciar outra compra. Se uma cobrança foi criada e a resposta não chegou à loja, será necessária conciliação pelo operador; não há repetição automática dessa chamada.

Após publicar, valide uma compra controlada com a conta configurada, o recebimento do webhook e a mudança do pedido para **Pago**. O código foi preparado sem usar a chave exposta. Cartão, boleto, saques e divisão de recebíveis não foram implementados.

Documentação: https://docs.blackcatoficial.com/

Verificação automatizada (Node 20+): `node --test tests/payments.test.js`.

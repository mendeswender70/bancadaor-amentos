# esquadro — orçamentos de móveis planejados

<img src="public/icons/esquadro.svg" width="72" alt="Logo do esquadro">

Orçamentos rápidos para marcenaria: o móvel inteiro é avaliado por uma medida
comercial (metro linear, metro quadrado ou unidade) e o sistema multiplica pelo
preço cadastrado. Nada de calcular peça por peça.

> **Regra de ouro:** o preço por metro é uma ferramenta de cálculo interna. O
> cliente vê apenas a descrição e o valor final de cada móvel.

## Publicar na Vercel (via GitHub)

A Vercel roda o sistema como funções serverless, que não guardam arquivos.
Por isso os dados ficam em um banco **Turso** (SQLite na nuvem, com plano grátis),
conectado pela própria Vercel.

1. Em <https://vercel.com>, entre com sua conta do GitHub.
2. **Add New… → Project** → escolha o repositório `bancadaor-amentos` → **Import**.
   Não é preciso mudar nada nas opções de build (o `vercel.json` já configura tudo).
   Clique em **Deploy**. O primeiro deploy abre o site, mas avisa que o banco não
   está configurado — é o próximo passo.
3. No projeto, abra a aba **Storage → Create Database → Turso** (ou
   *Browse Marketplace → Turso Cloud*). Crie o banco e conecte ao projeto,
   marcando os ambientes *Production* e *Preview*. As variáveis de conexão
   (`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` ou com outro prefixo) são criadas
   automaticamente — o sistema encontra qualquer prefixo.
4. **Deployments → ⋯ no último deploy → Redeploy**, para o site pegar as variáveis.
5. Abra o endereço do projeto (ex.: `https://bancadaor-amentos.vercel.app`) e crie
   o administrador. As tabelas são criadas sozinhas no primeiro acesso.

A cada `git push` no branch de produção, a Vercel publica a nova versão.
O branch de produção fica em **Settings → Git → Production Branch**.

Se preferir criar o banco direto no site do Turso (<https://turso.tech>), cadastre
em **Settings → Environment Variables** da Vercel:
`TURSO_DATABASE_URL` (ex.: `libsql://meu-banco-usuario.turso.io`) e `TURSO_AUTH_TOKEN`.

## Rodar no computador

Requisitos: **Node.js 22 ou mais novo**.

```bash
npm install
npm start
```

Abra <http://localhost:3000>. Sem configuração, os dados ficam no arquivo
`data/orcamentos.db`. Para usar o mesmo banco da Vercel, defina
`TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` antes do `npm start`.

| Variável                               | Para que serve                                            |
| -------------------------------------- | --------------------------------------------------------- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Banco Turso (também aceita `DATABASE_URL` ou outro prefixo) |
| `PORT`                                 | Porta HTTP local (padrão `3000`)                          |
| `TZ_EMPRESA`                           | Fuso usado para "hoje" (padrão `America/Sao_Paulo`)       |
| `COOKIE_SECURE`                        | `1` para cookie `Secure` fora da Vercel (HTTPS)           |
| `TRUST_PROXY`                          | Ex.: `1` atrás de proxy reverso (automático na Vercel)    |

Testes: `npm test`.

## Fluxo

1. **+ NOVO ORÇAMENTO** → escolher ou cadastrar o cliente.
2. **Adicionar ambiente** (ex.: Quarto do casal) → **Adicionar móvel** → tocar no tipo
   (ex.: Guarda-roupa) → informar `3,20`.
   O valor aparece na hora: `3,20 m × R$ 1.800,00/m = R$ 5.760,00`.
3. Adicionar outros móveis, serviços (frete, montagem…), desconto ou acréscimo.
4. Conferir o total → **Salvar** → **Gerar PDF** / **Enviar ao cliente**
   (compartilha o PDF ou abre o WhatsApp com a mensagem pronta).

## Funcionalidades (primeira versão)

- Login com administrador (sessão por cookie `HttpOnly`, senha com scrypt,
  limite de tentativas erradas).
- Painel: orçamentos do mês, em aberto, aprovados, valor orçado e recentes.
- Clientes: cadastro simples e busca por nome, telefone ou WhatsApp.
- Tipos de móveis com método de cálculo e preço padrão; tela de **Preços**
  para ajustar todos de uma vez.
- **Ambientes**: os móveis ficam agrupados por cômodo (Quarto do casal, Sala,
  Cozinha…), com detalhes do ambiente (materiais, cores) e subtotal no PDF.
  Dá para renomear, duplicar, reordenar e mover móveis entre ambientes.
- Cálculo por **metro linear**, **metro quadrado** (largura × altura) e **por unidade**;
  quantidade; **preço personalizado** por orçamento.
- Serviços adicionais, desconto e acréscimo em R$ ou %.
- Condições de pagamento cadastráveis (entrada em R$ ou %, parcelas do restante),
  prazo de entrega, validade com data calculada, observações para o cliente e
  observações internas.
- Status: Rascunho, Enviado, Em negociação, Aprovado, Recusado, Cancelado e
  Expirado (enviados/em negociação expiram sozinhos quando a validade passa).
- Histórico de orçamentos com busca por cliente, número, data, status e valor.
- **Duplicar** orçamento (novo número, mesmos itens e preços).
- **Histórico de alterações** de cada orçamento (evento, data e total), com uma
  cópia completa do orçamento guardada em cada registro.
- PDF profissional com logo e dados da empresa.
- Configurações da empresa: dados, logo, validade/prazo/condição padrão,
  texto padrão das observações e mensagem do WhatsApp.

## Decisões importantes

- **Preço congelado no orçamento.** Cada item grava o preço usado
  (`preco_unitario_interno_cents`) e o nome do tipo. Alterar o cadastro de
  preços depois não muda orçamentos já feitos — nem ao reabri-los e salvá-los.
- **O servidor recalcula tudo.** Os valores enviados pelo navegador são
  ignorados; o servidor refaz as contas com o mesmo módulo
  (`public/shared/calc.js`) usado na tela.
- **Sem erro de arredondamento.** Dinheiro é guardado em centavos inteiros,
  medidas em milímetros e percentuais em centésimos de ponto. O valor de uma
  unidade é arredondado para centavos e depois multiplicado pela quantidade.
- **Separação interno × cliente.** O PDF é gerado só a partir de
  `server/visaoCliente.js`, que monta o objeto por lista de campos permitidos
  (descrição, quantidade e valor final de cada item, totais, condições e
  observações). Preço por metro/m², medidas, fórmulas, preço padrão e
  observações internas nunca entram nele — há teste automatizado para isso.
  Um futuro link público do orçamento deve usar essa mesma função.
- Desconto e acréscimo percentuais incidem sobre o subtotal (móveis + serviços).
  No PDF o desconto aparece como valor em reais, sem o percentual.

## Estrutura

```
public/                 interface (HTML, CSS e JavaScript sem etapa de build)
public/shared/calc.js   cálculos e formatação (servidor e navegador)
api/index.js            entrada da função serverless na Vercel
server/app.js           rotas da API (Express)
server/db.js            conexão libSQL/Turso e migrações
server/orcamentos.js    salvar, duplicar, histórico, busca, painel
server/visaoCliente.js  dados que o cliente pode ver
server/pdf.js           geração do PDF (PDFKit)
server/auth.js          senhas, sessões, proteção CSRF, limite de tentativas
server/index.js         servidor local (npm start)
tests/                  testes (node --test)
vercel.json             configuração da Vercel
```

## Backup

Na Vercel, os dados ficam no Turso (o painel do Turso permite exportar o banco).
Rodando no computador sem Turso, copie periodicamente o arquivo `data/orcamentos.db`.

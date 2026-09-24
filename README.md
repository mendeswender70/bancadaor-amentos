# Sistema de Orçamentos para Móveis Planejados

Orçamentos rápidos para marcenaria: o móvel inteiro é avaliado por uma medida
comercial (metro linear, metro quadrado ou unidade) e o sistema multiplica pelo
preço cadastrado. Nada de calcular peça por peça.

> **Regra de ouro:** o preço por metro é uma ferramenta de cálculo interna. O
> cliente vê apenas a descrição e o valor final de cada móvel.

## Como rodar

Requisitos: **Node.js 22.13 ou mais novo** (o banco usa o SQLite embutido no Node).

```bash
npm install
npm start
```

Abra <http://localhost:3000>. No primeiro acesso o sistema pede para criar o
administrador (nome da empresa, seu nome, e-mail e senha).

| Variável         | Padrão                 | Para que serve                                            |
| ---------------- | ---------------------- | --------------------------------------------------------- |
| `PORT`           | `3000`                 | Porta HTTP                                                |
| `DB_PATH`        | `data/orcamentos.db`   | Arquivo do banco SQLite (faça backup deste arquivo)       |
| `TZ_EMPRESA`     | `America/Sao_Paulo`    | Fuso usado para "hoje" (data do orçamento, validade)      |
| `COOKIE_SECURE`  | —                      | `1` para marcar o cookie de sessão como `Secure` (HTTPS)  |
| `TRUST_PROXY`    | —                      | Ex.: `1` quando estiver atrás de um proxy reverso (HTTPS) |

Testes: `npm test`.

## Fluxo

1. **+ NOVO ORÇAMENTO** → escolher ou cadastrar o cliente.
2. **+ ADICIONAR MÓVEL** → tocar no tipo (ex.: Guarda-roupa) → informar `3,20`.
   O valor aparece na hora: `3,20 m × R$ 1.800,00/m = R$ 5.760,00`.
3. Adicionar outros móveis, serviços (frete, montagem…), desconto ou acréscimo.
4. Conferir o total → **Salvar** → **Gerar PDF** / **Enviar ao cliente**
   (compartilha o PDF ou abre o WhatsApp com a mensagem pronta).

## Funcionalidades (primeira versão)

- Login com administrador (sessão por cookie `HttpOnly`, senha com scrypt).
- Painel: orçamentos do mês, em aberto, aprovados, valor orçado e recentes.
- Clientes: cadastro simples e busca por nome, telefone ou WhatsApp.
- Tipos de móveis com método de cálculo e preço padrão; tela de **Preços**
  para ajustar todos de uma vez.
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
  (`shared/calc.js`) usado na tela.
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
shared/calc.js          cálculos e formatação (servidor e navegador)
server/app.js           rotas da API (Express)
server/db.js            banco SQLite e migrações
server/orcamentos.js    salvar, duplicar, histórico, busca, painel
server/visaoCliente.js  dados que o cliente pode ver
server/pdf.js           geração do PDF (PDFKit)
server/auth.js          senhas, sessões, proteção CSRF, limite de tentativas
public/                 interface (HTML, CSS e JavaScript sem etapa de build)
tests/                  testes (node --test)
```

## Backup

Todos os dados ficam no arquivo indicado em `DB_PATH` (por padrão
`data/orcamentos.db`). Copie esse arquivo periodicamente.

# esquadro — orçamentos de móveis planejados

<img src="public/icons/esquadro.svg" width="72" alt="Logo do esquadro">

**Endereço:** <https://esquadro.site>

Orçamentos rápidos para marcenaria: o móvel inteiro é avaliado por uma medida
comercial (metro linear, metro quadrado ou unidade) e o sistema multiplica pelo
preço cadastrado. Nada de calcular peça por peça.

> **Regra de ouro:** o preço por metro é uma ferramenta de cálculo interna. O
> cliente vê apenas a descrição e o valor final de cada móvel.

## Publicar na Vercel (via GitHub) com banco Supabase

Os dados ficam em um banco **Postgres no Supabase** (projeto `esquadro`, região
São Paulo). A Vercel roda o sistema como função serverless na região `gru1`
(São Paulo), perto do banco.

1. **Supabase → projeto esquadro → botão Connect → Transaction pooler**: copie o
   endereço (`postgresql://postgres.<ref>:[YOUR-PASSWORD]@…pooler.supabase.com:6543/postgres`).
2. Troque `[YOUR-PASSWORD]` pela senha do banco. Se não souber a senha, gere uma
   nova em **Project Settings → Database → Reset database password** (use só
   letras e números).
3. **Vercel → projeto → Settings → Environment Variables**: crie `DATABASE_URL`
   com esse endereço, marcando *Production* e *Preview*.
4. **Deployments → ⋯ → Redeploy**. As tabelas são criadas sozinhas se ainda não
   existirem.

Também funciona com a integração Supabase ↔ Vercel, que cria `POSTGRES_URL`
automaticamente — o sistema reconhece essa variável.

A cada `git push` no branch de produção a Vercel publica a nova versão, e os
dados continuam no Supabase.

## Rodar no computador

Requisitos: **Node.js 22 ou mais novo**.

```bash
npm install
npm start
```

Abra <http://localhost:3000>. Sem configuração, os dados ficam em um Postgres
embutido (PGlite) na pasta `data/pglite`. Para usar o banco do Supabase, defina
`DATABASE_URL` antes do `npm start`.

| Variável        | Para que serve                                                |
| --------------- | ------------------------------------------------------------- |
| `DATABASE_URL`  | Endereço Postgres (Supabase). Também aceita `POSTGRES_URL`    |
| `PORT`          | Porta HTTP local (padrão `3000`)                              |
| `TZ_EMPRESA`    | Fuso usado para "hoje" (padrão `America/Sao_Paulo`)           |
| `COOKIE_SECURE` | `1` para cookie `Secure` fora da Vercel (HTTPS)               |
| `TRUST_PROXY`   | Ex.: `1` atrás de proxy reverso (automático na Vercel)        |

Testes: `npm test` — roda a API duas vezes: no Postgres embutido e com o driver
de produção (`postgres`) conectado pela rede.

## Fluxo

1. **+ NOVO ORÇAMENTO** → escolher ou cadastrar o cliente.
2. **Adicionar ambiente** (ex.: Quarto do casal) → **Adicionar móvel** → tocar no tipo
   (ex.: Guarda-roupa) → informar `3,20`.
   O valor aparece na hora: `3,20 m × R$ 1.800,00/m = R$ 5.760,00`.
3. Adicionar outros móveis, serviços (frete, montagem…), desconto ou acréscimo.
4. Conferir o total (o orçamento **salva sozinho** a cada alteração) →
   **Enviar ao cliente**: abre o WhatsApp com a mensagem e o **link da proposta**
   (ou manda o PDF).
5. O cliente abre o link (`/p/<código>`), vê ambientes, valores e condições e
   toca em **Aprovar proposta**. O orçamento vira "Aprovado" na hora e aparece
   em **Precisa de atenção** no painel.

## Funcionalidades (primeira versão)

- Login com administrador (sessão por cookie `HttpOnly`, senha com scrypt,
  limite de tentativas erradas).
- Painel: **Precisa de atenção** (aprovações pelo link, propostas vencendo,
  cliente que abriu a proposta, enviados sem resposta, rascunhos parados),
  valor orçado e aprovado no mês com comparação ao mês anterior, taxa de
  aprovação (90 dias), valor médio e recentes.
- **Link da proposta** para o cliente, com botão de aprovar. Mostra só o que o
  PDF mostra (sem telefone/documento do cliente) e conta as visitas — as da
  própria empresa, logada, não contam.
- Clientes: cadastro simples e busca por nome, telefone ou WhatsApp.
- **Móveis e preços**: tipos de móveis com método de cálculo e preço padrão,
  editáveis na mesma lista.
- **Ambientes**: os móveis ficam agrupados por cômodo (Quarto do casal, Sala,
  Cozinha…), com detalhes do ambiente (materiais, cores) e subtotal no PDF.
  Dá para renomear, duplicar, reordenar e mover móveis entre ambientes.
- **Sugestões de ambiente** próprias: em **Novo ambiente → Editar sugestões**
  dá para adicionar e remover nomes (ou marcar “Guardar nas sugestões” ao criar
  um ambiente novo). A lista fica salva no banco e vale em todos os aparelhos.
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
server/db.js            conexão Postgres (Supabase ou PGlite) e migrações
server/orcamentos.js    salvar, duplicar, histórico, busca, painel
server/visaoCliente.js  dados que o cliente pode ver
server/pdf.js           geração do PDF (PDFKit)
server/auth.js          senhas, sessões, proteção CSRF, limite de tentativas
server/index.js         servidor local (npm start)
tests/                  testes (node --test)
vercel.json             configuração da Vercel
```

## Backup

Os dados ficam no Supabase, que faz cópias diárias no plano pago (no plano grátis,
exporte pelo painel: **Database → Backups** ou `pg_dump`). Rodando no computador
sem Supabase, copie a pasta `data/pglite`.

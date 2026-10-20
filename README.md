# esquadro — orçamentos de móveis planejados

<img src="public/icons/esquadro.svg" width="72" alt="Logo do esquadro">

**Endereço:** <https://esquadro.site>

Orçamentos rápidos para marcenaria: o móvel inteiro é avaliado por uma medida
comercial (metro linear, metro quadrado ou unidade) e o sistema multiplica pelo
preço cadastrado. Nada de calcular peça por peça.

> **Regra de ouro:** o preço por metro é uma ferramenta de cálculo interna. O
> cliente vê apenas a descrição e o valor final de cada móvel.

## Publicar na Vercel (via GitHub) com banco Neon

Os dados ficam em um banco **Postgres na Neon**. A Vercel roda o sistema como
função serverless na região `gru1` (São Paulo), perto do banco.

Configuração conferida na Neon em 20/10/2026:

| Recurso | Configuração |
| --- | --- |
| Projeto | `esquadro` |
| ID do projeto | `mute-math-04478709` |
| Região | São Paulo — AWS `aws-sa-east-1` |
| PostgreSQL | 18 |
| Branch principal | `production` |
| Banco | `neondb` |

O banco contém as 13 tabelas da aplicação, incluindo clientes, orçamentos,
itens, histórico, usuários, sessões e controle de migrações. Na conferência,
a última migração aplicada era a versão **3**, correspondente às migrações
definidas em `server/db.js`.

1. **Neon Console → projeto esquadro → Connect**: selecione a branch
   `production`, o banco `neondb` e a role usada pela aplicação.
2. Ative **Connection pooling** e copie a connection string fornecida pela Neon.
   O hostname da conexão com pool contém `-pooler`. Preserve os parâmetros de
   segurança fornecidos no endereço; não publique a string com senha no GitHub.
3. **Vercel → projeto → Settings → Environment Variables**: configure
   `DATABASE_URL` com esse endereço no ambiente **Production**.
   Para **Preview**, use a conexão de uma branch separada na Neon, evitando
   que testes alterem os dados de produção.
4. **Deployments → ⋯ → Redeploy**. O servidor aplica automaticamente as
   migrações pendentes na primeira requisição que acessa a API.

O servidor usa o driver `postgres` e conecta diretamente ao Postgres; não
depende do SDK nem do serviço de autenticação da Neon. O login da aplicação
continua sendo controlado pelas tabelas `usuarios` e `sessoes`.

`DATABASE_URL` tem prioridade sobre `POSTGRES_URL`, que também é aceita
por compatibilidade. Confira o ambiente selecionado antes de publicar.

A cada `git push` no branch de produção configurado na Vercel, uma nova versão
é publicada e os dados continuam na Neon.

### Avisar os usuários sobre mudanças

Quando uma atualização trouxer mudanças que o usuário deve conhecer, inclua
uma entrada no início de `public/js/novidades.js`, com um `id` novo, data,
título e lista curta do que mudou. O aviso aparece uma vez por navegador após o
login; o botão **Novidades** permite consultar as entradas anteriores. O aviso
é marcado como lido no armazenamento local do navegador.

### Notificações no site e no PWA

Uma aba aberta consulta a versão publicada a cada 45 segundos e mostra um botão
para atualizar, sem recarregar uma tela de orçamento por conta própria. O PWA
recebe notificações push após deploys de produção e quando um cliente abre uma
proposta pela primeira vez ou a aprova. Os avisos vão para os dispositivos
inscritos da conta, ativados em **Ajustes → Minha conta → Avisos no PWA**. No
iPhone, é necessário instalar o site na Tela de Início e
permitir notificações.

Para habilitar o push, gere um par VAPID uma vez no computador:

```bash
node -e "import('web-push').then(({ default: w }) => console.log(JSON.stringify(w.generateVAPIDKeys(), null, 2)))"
openssl rand -hex 32
```

Copie a chave pública e privada para as variáveis **Production** da Vercel como
`VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`. Configure também `VAPID_SUBJECT` com
`https://esquadro.site` e `DEPLOY_NOTIFICATION_SECRET` com o valor gerado pelo
`openssl`. Adicione o mesmo `DEPLOY_NOTIFICATION_SECRET` em **GitHub → Settings
→ Secrets and variables → Actions → New repository secret**. O workflow
`.github/workflows/notificar-deploy.yml` usa esse segredo para autorizar o envio
após deploys de produção. Sem essas variáveis, o aviso dentro do site continua
funcionando, mas o navegador não pode receber push.

Referência: [connection pooling na Neon](https://neon.com/docs/connect/connection-pooling).

## Rodar no computador

Requisitos: **Node.js 22 ou mais novo**.

```bash
npm install
npm start
```

Abra <http://localhost:3000>. Sem configuração, os dados ficam em um Postgres
embutido (PGlite) na pasta `data/pglite`. Para usar um banco da Neon, defina
`DATABASE_URL` antes do `npm start`.

| Variável        | Para que serve                                                |
| --------------- | ------------------------------------------------------------- |
| `DATABASE_URL`  | Endereço Postgres (Neon). Também aceita `POSTGRES_URL`    |
| `PORT`          | Porta HTTP local (padrão `3000`)                              |
| `TZ_EMPRESA`    | Fuso usado para "hoje" (padrão `America/Sao_Paulo`)           |
| `COOKIE_SECURE` | `1` para cookie `Secure` fora da Vercel (HTTPS)               |
| `TRUST_PROXY`   | Ex.: `1` atrás de proxy reverso (automático na Vercel)        |

Testes: `npm test` roda a API no Postgres embutido. Para validar também o driver
de produção e os casos de gravação simultânea, inicie um Postgres local vazio e
execute `TEST_POSTGRES_URL='postgres://usuario:senha@127.0.0.1:5432/esquadro_test?sslmode=disable' node tests/api-postgres.test.js`.
O teste recusa conexões que não sejam locais e cria as tabelas nesse banco; use
um banco descartável, exclusivo para testes.

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
server/db.js            conexão Postgres (Neon ou PGlite) e migrações
server/orcamentos.js    salvar, duplicar, histórico, busca, painel
server/visaoCliente.js  dados que o cliente pode ver
server/pdf.js           geração do PDF (PDFKit)
server/auth.js          senhas, sessões, proteção CSRF, limite de tentativas
server/index.js         servidor local (npm start)
tests/                  testes (node --test)
vercel.json             configuração da Vercel
```

## Backup

Os dados de produção ficam na Neon. A restauração para um ponto no tempo
depende da janela de histórico configurada no projeto. Confira essa janela
no console antes de contar com a recuperação de uma alteração antiga.

Para manter cópias independentes, use `pg_dump` com a conexão **direta**
da Neon (hostname sem `-pooler`) e guarde os arquivos em local seguro.
O mesmo tipo de conexão deve ser usado com `pg_restore` e ferramentas
externas de migração que dependam de estado de sessão. As migrações internas
da aplicação continuam sendo executadas automaticamente por `server/db.js`.

Rodando no computador com o Postgres embutido, pare o servidor antes de copiar
a pasta `data/pglite` para obter uma cópia consistente.

Referência: [restauração na Neon](https://neon.com/docs/introduction/branch-restore).

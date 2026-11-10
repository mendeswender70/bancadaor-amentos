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

O banco contém as tabelas de clientes, orçamentos, itens, histórico, usuários,
sessões e notificações, chapas, fitas, planos de corte, retalhos e a
configuração da serra e anexos do projeto, além do controle de migrações e da
marca de configuração inicial. As migrações atuais estão na versão **15**
(`server/db.js`) e são aplicadas automaticamente ao acessar a API.

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

Em uma instalação nova, a criação do primeiro administrador exige a variável
`INITIAL_ADMIN_SETUP_SECRET` no ambiente **Production** da Vercel. Use uma
chave aleatória com pelo menos 32 caracteres. Depois do deploy, informe essa
chave uma única vez na tela de configuração inicial. O banco grava que a
configuração terminou; a chave pode então ser removida da Vercel. A migração
marca automaticamente como configurados os bancos que já têm usuários, então
essa etapa não interrompe instalações existentes.

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
proposta pela primeira vez ou a aprova. Também envia lembretes diários às 10h
(horário de Brasília) para propostas enviadas há pelo menos cinco dias sem
resposta e para propostas com vencimento nos próximos dois dias. Cada lembrete
é enviado uma vez por proposta e evento; o aviso abre o orçamento correspondente.
Os avisos vão para os dispositivos inscritos da conta, ativados em
**Ajustes → Minha conta → Avisos no PWA**. No iPhone, é necessário instalar o
site na Tela de Início e permitir notificações.

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

O workflow `.github/workflows/lembretes-propostas.yml` usa o mesmo segredo para
acionar os lembretes uma vez ao dia. Ele não exige uma variável adicional.

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

Em um banco novo, defina também `INITIAL_ADMIN_SETUP_SECRET` antes de criar o
primeiro acesso; a chave pode ser removida depois que o administrador for
cadastrado.

| Variável        | Para que serve                                                |
| --------------- | ------------------------------------------------------------- |
| `DATABASE_URL`  | Endereço Postgres (Neon). Também aceita `POSTGRES_URL`    |
| `INITIAL_ADMIN_SETUP_SECRET` | Autoriza uma única vez a criação inicial do administrador |
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
- A lista de clientes carrega 50 por vez e informa quantos já foram exibidos;
  use **Carregar mais** para continuar sem trazer todo o histórico de uma vez.
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
- A numeração usa uma sequência do Postgres para evitar colisões em criações
  simultâneas e não reutilizar números excluídos. Ela pode ter lacunas quando
  uma gravação é cancelada.
- **Histórico de alterações** de cada orçamento (evento, data e total), com uma
  cópia completa do orçamento guardada em cada registro.
- PDF profissional com logo e dados da empresa.
- Configurações da empresa: dados, logo, validade/prazo/condição padrão,
  texto padrão das observações e mensagem do WhatsApp.
- Trocar a senha encerra sessões dos outros dispositivos; em **Ajustes → Minha
  conta** também é possível encerrar todas as sessões, inclusive a atual.

## Produção (plano de corte)

Área separada para quem corta na oficina, em **`/producao/`** (mesmo servidor e
mesmo banco, login próprio). Feita para o celular ao lado da esquadrejadeira.

**Acesso.** Em **Ajustes → Equipe**, o escritório cria o usuário e a senha de
cada funcionário (`usuarios.tipo = 'producao'`). Funcionário entra com o
usuário (ou e-mail), é levado para `/producao/` se abrir o endereço do
escritório e só acessa as rotas `/api/producao/*` e a troca de senha; qualquer
outra rota responde 403. Ele vê só os planos dele e **nunca recebe preços**: o
servidor tira os preços de chapas e fitas e não manda totais do orçamento.
Desativar o funcionário derruba as sessões na hora.

**Trabalhos.** No editor do orçamento, **Mandar para a produção** escolhe o
funcionário e as instruções; um orçamento pode virar mais de um trabalho. O
funcionário vê cliente, ambientes, móveis e medidas (sem valores) e monta o
plano. Ele também pode criar planos próprios. O cartão **Produção** do editor
mostra o andamento e o custo de material (só para o escritório).

**Plano.** Entrada rápida de peças (`720 x 550 x 2 Lateral`, ou colar de
planilha), com móvel, chapa, veio e fita por lado. O cálculo
(`public/shared/corte.js`, em Web Worker) usa só cortes de ponta a ponta, com a
espessura do disco, o refilo e o veio, e devolve até **três soluções**: menos
chapas novas; corte mais simples (menos giros e cortes); maior sobra inteira.
Chapas com o mesmo desenho saem agrupadas. Retalhos do estoque entram (sem
refilo) quando economizam chapa nova. O servidor confere cada solução antes de
guardar e **reserva** os retalhos da solução escolhida.

**Modo serra.** Passo a passo em tela cheia: pegar a chapa ou o retalho,
esquadrejar, cada corte com a medida grande, a guia (paralela até a largura
configurada, 900 mm na Baldan SE-3200/38; acima disso, no carro), o aviso de
girar a peça e o que o corte separa. "Estragou" anota a peça e, no fim, gera o
plano de recorte. No fim de cada chapa, as sobras boas vão para o estoque de
retalhos. O andamento é salvo a cada passo e a tela fica acesa enquanto corta.

**Medidas em centímetros.** A oficina trabalha em cm: peças, chapas, retalhos,
sobras, guia, refilo e o passo a passo aparecem e são digitados em cm, com até
uma casa decimal (72,5). Ficam em mm só a espessura da chapa, a largura da fita
e a espessura do disco. O sistema guarda milímetros inteiros e converte na
tela; uma medida maior que a maior chapa (ou, no retalho, maior que a chapa
dele) gera o aviso "confira se não digitou em milímetros". Também aceita
"455 mm" escrito assim e o ponto de milhar ("1.200").

**Projeto anexado.** O escritório anexa o PDF do arquiteto e fotos no
orçamento (cartão Produção do editor ou ao mandar para a produção); quem tem um
trabalho daquele orçamento vê. O funcionário também anexa fotos no próprio
plano. Na produção, **Medir no projeto** prende o desenho na metade de cima da
tela (com zoom de pinça e páginas do PDF) e deixa a entrada de peças embaixo.
Cada peça digitada assim guarda de qual anexo e página veio a medida
(migração 15); na lista aparece "medida: Planta.pdf, pág. 2" e a peça tem o
botão **Ver no projeto**, que abre o desenho naquela página. Em prancha grande
(A1/A0), ao parar o zoom o trecho visível é redesenhado na resolução da tela.
O PDF abre no próprio site com o pdf.js (`public/js/vendor/pdfjs`, Apache-2.0),
sem WebAssembly (a CSP não permite): imagens JPEG 2000 e JBIG2 de PDF escaneado
usam os decodificadores em JavaScript da pasta `wasm/`, e o worker passa por
`public/js/pdf-worker.mjs`, que completa o que falta no Safari antes do 17.4.
Os arquivos ficam no banco (`anexos` e `anexo_partes`), em partes de 3 MB,
porque a Vercel limita cada requisição e cada resposta a 4,5 MB; o limite é
25 MB por arquivo e as fotos são reduzidas no celular antes do envio (planta
em PNG ou WebP de até 12 MB vai como está). O nome do arquivo sempre termina
com a extensão do tipo conferido, e envio que não termina em 6 horas é apagado. Anexos
ocupam espaço no Postgres da Neon: se o volume crescer, vale mudar para um
armazenamento de arquivos (ex.: Vercel Blob).

**Retalhos e serra.** O estoque é da oficina (todos veem). A configuração da
serra (disco, refilo, guia paralela, curso do carro e sobra mínima) fica em
**Ajustes** da produção e só o escritório altera.

PDF para a serra (`server/pdfCorte.js`) e exportação da lista em CSV. Nada da
produção entra na proposta, no PDF do cliente ou no link `/p/`.

Pesquisa e próximas fases: [`docs/plano-de-corte.md`](docs/plano-de-corte.md).

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
server/producao.js      equipe, trabalhos, planos de corte, retalhos e serra
server/anexos.js        projeto anexado (PDF e fotos), em partes de 3 MB
server/pdfCorte.js      PDF de produção do plano de corte
public/shared/corte.js  otimizador de corte, roteiro, passo a passo e conferência
public/producao/        área da produção (/producao/), com folha própria em css/producao.css
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

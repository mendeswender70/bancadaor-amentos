# Esquadro AI Dev Team | Manual operacional

Este fluxo oferece **controle direto do dono do projeto**: cada agente é uma sessão independente do Claude Code, com seu próprio branch e Git worktree. Não depende de Agent Teams experimentais nem cria agentes automaticamente.

## 1. Antes de começar

- Node.js 22+, Git, Claude Code CLI instalado e autenticado.
- Clone o repositório e abra-o em um terminal (ou VS Code).
- Primeiro confira a branch padrão do GitHub: o nome atual é `claude/compassionate-albattani-vxymdy` (não presuma `main`).
- Use o fluxo apenas depois de integrar este PR à branch de referência, ou na branch de configuração caso esteja testando antes.
- Leia `CLAUDE.md` e o `README.md` do projeto. Não altere produção.

Comandos iniciais:

~~~bash
git clone https://github.com/mendeswender70/bancadaor-amentos.git
cd bancadaor-amentos
node --version
git status
git branch --show-current
npm ci
npm test
claude --version
~~~

## 2. Abrir os agentes em worktrees separadas

Abra um terminal na pasta principal para **cada** criação abaixo. O script usa o commit atual (HEAD) como base. Atualize sua branch-base antes de criar a equipe.

~~~bash
node scripts/ai-team.mjs create frontend nova-interface
node scripts/ai-team.mjs create backend nova-api
node scripts/ai-team.mjs create qa revisao
node scripts/ai-team.mjs create integrador integracao
node scripts/ai-team.mjs status
~~~

O script cria branches com padrão `ai/<papel>/<tarefa>` e pastas **irmãs** da pasta principal em `../bancadaor-amentos-worktrees/`. Ele não instala dependências nem inicia processos automaticamente.

Em quatro terminais separados, entre na pasta de cada agente, instale dependências e abra Claude Code em modo de planejamento:

~~~bash
cd "../bancadaor-amentos-worktrees/frontend-nova-interface"
npm ci
claude --permission-mode plan
~~~

Repita usando `backend-nova-api`, `qa-revisao` e `integrador-integracao`. No VS Code, abra cada pasta em sua própria janela/terminal. Cada sessão é independente: cada agente recebe sua tarefa diretamente de você.

**Primeiro prompt para cada terminal:**

> Leia CLAUDE.md e docs/ai-team/roles/<papel>.md. Seu papel é <papel>. Não altere nenhum arquivo antes de eu aprovar seu plano. Não faça push, merge ou deploy. Minha tarefa é: [descreva o objetivo, arquivos permitidos e critérios de aceite].

Depois que você aprovar o plano, altere o modo de permissão da sessão para permitir implementação (por exemplo, usando Shift+Tab). Continue revisando alterações e comandos antes de autorizar ações sensíveis.

## 3. Divisão de responsabilidades

| Papel | Edita por padrão | Evita |
| --- | --- | --- |
| frontend | `public/` (HTML, CSS, JS de tela) | `server/`, banco e `public/shared/calc.js` |
| backend | `server/`, `api/` | interface e produção |
| qa | `tests/` e relatórios autorizados | reescrever implementação sem permissão |
| integrador | integra branches aprovadas e prepara PR | novas funcionalidades e merge/deploy autônomos |

**Atenção:** uma worktree evita colisões locais, mas duas branches podem alterar o mesmo arquivo e gerar conflito no momento da integração. Reserve explicitamente a propriedade de arquivos. Frontend e backend devem combinar contratos antes de programar alterações dependentes. Se a tarefa for pequena, use apenas 1 ou 2 agentes.

## 4. Exemplo de rodada controlada

1. Você cria tarefas em `docs/ai-team/TAREFA-MODELO.md` ou descreve nos terminais.
2. Frontend: desenvolve uma tela sem modificar rotas; Backend: cria uma API independente; QA: define critérios, investiga riscos e propõe testes.
3. Cada agente **primeiro envia o plano**, depois implementa se você autorizar.
4. Em cada worktree, execute `npm test`, examine `git diff` e faça um commit local somente quando aprovar.
5. Você autoriza um push para branch remota e PR de cada alteração. QA pode revisar os diffs/PRs sem escrever na branch alheia.
6. Com sua autorização, integrador reúne as branches aprovadas, resolve os conflitos combinados e roda `npm test` na versão integrada.
7. Só você autoriza o merge do PR final. Deploy na Vercel é uma autorização **separada**, principalmente se a branch de publicação aciona produção automaticamente.

## 5. Comandos úteis

~~~bash
git status
git diff
npm test
git worktree list
git branch --show-current
~~~

Para publicar uma branch **somente após sua autorização**:

~~~bash
git push -u origin ai/frontend/nova-interface
~~~

Abra o Pull Request no GitHub, apontando para a branch padrão ou para uma branch de integração explicitamente escolhida. Confira o workflow `Esquadro - validação de PR`. O workflow usa Node 22 e testes locais; ele **não** certifica integrações com Neon de produção nem revisão visual.

Para remover uma worktree **depois de confirmar que as mudanças foram integradas e o diretório está limpo**, volte à pasta principal e use `git worktree remove <caminho-da-worktree>`. Não use `--force` sem verificar alterações pendentes. Não apague branches que ainda tenham trabalho não integrado.

## 6. Segurança e qualidade do Esquadro

- **Nunca** passar DATABASE_URL de produção para agentes, testes ou previews. A suite local usa PGlite isolado em `data/pglite` de cada worktree.
- Preservar `public/shared/calc.js` e regras de centavos/milímetros. O servidor deve sempre recalcular.
- Não mostrar cálculos internos, fórmulas, medidas e preços por metro ao cliente; revisar `server/visaoCliente.js`.
- Alterações de auth, sessões, CSRF, migrações, propostas públicas e PDF precisam de revisão adicional.
- O workflow de PR não publica em produção. Configure no GitHub uma regra de proteção de branch exigindo aprovação humana e CI (se o plano do repositório disponibilizar isso).
- Revise também configurações da Vercel: previews não devem apontar para o banco Neon de produção.
- Se a interface mudar para usuários finais, planeje atualização de `public/js/novidades.js` na publicação.

## 7. Agent Teams nativos (opcional, em outro momento)

Claude Code também oferece Agent Teams com comunicação e tarefas compartilhadas. Porém é experimental e **não substitui automaticamente as worktrees individuais** deste manual. Para seu objetivo de dar ordens e revisar cada agente, inicie com sessões independentes.

Documentação oficial: https://code.claude.com/docs/en/common-workflows e https://code.claude.com/docs/en/agent-teams

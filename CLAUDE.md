# Esquadro | Regras para agentes de desenvolvimento

Leia o README.md e o guia docs/ai-team/GUIA.md antes de executar tarefas.

## Projeto e arquitetura
- Produto: Esquadro, sistema de orçamentos para marcenaria.
- Stack atual: HTML/CSS/JavaScript em public/, Node.js 22+, Express 5 em server/, Postgres (Neon em produção e PGlite local), PDFKit, deploy na Vercel.
- Mantenha a arquitetura atual. Não instale framework, troque banco, migre stack nem adicione dependências sem aprovação explícita.
- API serverless: api/index.js; rotas: server/app.js; banco/migrações: server/db.js; propostas e PDF: server/visaoCliente.js e server/pdf.js.

## Regras de negócio inegociáveis
- Dinheiro em centavos inteiros; medidas em milímetros inteiros; percentuais em centésimos de ponto. Respeite public/shared/calc.js como lógica compartilhada.
- O servidor recalcula os valores: nunca confie em totais enviados pelo navegador.
- Preços de cálculo internos (por metro/m², fórmulas, medidas e observações internas) NÃO podem aparecer em PDF, link público ou dados do cliente. Use server/visaoCliente.js como lista explícita de campos públicos.
- Preserve orçamentos existentes, histórico, autenticação, sessões, proteção CSRF, PDF, propostas e notificações.
- Migrações devem ser incrementais, retrocompatíveis e revisadas; nunca aplique migração ou teste em produção.

## Operação multiagente
- O usuário é o único responsável por distribuir prioridades e autorizar integração.
- Uma tarefa = uma branch ai/<papel>/<slug> = uma git worktree isolada.
- Identifique seu papel pelo arquivo docs/ai-team/roles/<papel>.md informado no início da sessão.
- Antes de escrever código, apresente objetivo, arquivos que pretende alterar, riscos e critérios de aceite. Aguarde aprovação do usuário.
- Respeite os limites de arquivos definidos para sua tarefa. Se outro agente precisar alterar o mesmo arquivo, avise e aguarde redistribuição.
- Não faça push, merge, deploy, alterações de configurações remotas ou operações destrutivas sem autorização do usuário.
- Nunca altere DATABASE_URL para produção, nunca acesse ou exponha segredos nem use banco real para testes.
- Use instalação e banco local isolados por worktree. Teste com npm test; testes externos de Postgres exigem banco local descartável e instrução explícita.

## Definição de pronto
Ao finalizar, informe: arquivos alterados, resumo das mudanças, testes executados e resultado, riscos/pendências, commit/branch e instruções para revisão.
O integrador só reúne alterações após aprovação de cada tarefa. Revisão + CI + aprovação humana são obrigatórias antes de merge.

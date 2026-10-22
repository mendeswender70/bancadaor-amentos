# Revisão de interface — 22/10/2026

Referência visual: [arquivo aprovado no Figma](https://www.figma.com/design/4dG7c23I15PfkGhqT3TZwR).
Os frames estão relacionados em [referencias-visuais.md](referencias-visuais.md).

## Cobertura

Conferência local no Chromium, com a aplicação e a API reais, um banco temporário
em memória e dados fictícios. Capturas em 320, 390, 430, 768, 1024 e 1440 px.

| Área | Estados conferidos |
| --- | --- |
| Acesso | Login e primeiro acesso |
| Início | Indicadores, acompanhamento e propostas recentes |
| Orçamentos | Lista, filtros, busca vazia, menus e paginação |
| Clientes | Lista, ficha, edição e seleção para um novo orçamento |
| Editor | Orçamento novo, salvo e extenso, ambientes e edição de móvel |
| Ajustes | Visão geral, empresa, padrões, móveis, pagamento, conta e senha |
| Avisos | Central de avisos e mensagens de lista vazia |
| Proposta pública | Capa, itens, condições, ações e aprovação |
| PDF | Proposta simples e proposta com seis ambientes e 48 itens |

Foram feitas 126 capturas para a conferência de layout, além das capturas de
login, menus e diálogos. Nessa conferência não houve rolagem horizontal,
ícones fora dos seus contêineres nem erros de JavaScript ou CSP.

## Refinamentos

- Centralização dos avatares, textos e setas dos cartões de clientes.
- Área maior para o nome do cliente nos cartões de orçamento, reservando o botão de ações.
- Indicador e texto de acompanhamento na mesma linha.
- Valores e situações se acomodam em mais de uma linha quando necessário.
- Divisórias entre os móveis do ambiente, conforme o frame `8:104`.
- Barra pública com quebra de linha entre total e ações quando faltar espaço.
- Saída direta de um orçamento novo que ainda não recebeu alterações.
- Uma única confirmação de descarte em navegações sucessivas; cancelar mantém os dados.
- Busca de orçamentos e clientes protegida contra respostas fora de ordem.
- Nova tentativa de carregamento após falha de rede, inclusive na paginação.
- Menus com setas, Home, End, Tab e Escape; foco devolvido ao controle de origem.
- Diálogos identificados pelo título para tecnologias assistivas.

## Verificações dos fluxos

- Descarte e cancelamento de alterações parciais; saída de orçamento intocado.
- Criação de orçamento até o primeiro móvel e seu salvamento automático.
- Consultas com uma resposta antiga atrasada e uma resposta nova mais rápida.
- Erros temporários em três buscas e recuperação com “Tentar novamente”.
- Falha na paginação preservando os cartões já carregados.
- Uso de menu e diálogo pelo teclado e formulário em janela móvel de 390 × 430 px.
- Totais extensos na lista e na barra pública em telas pequenas.
- Aprovação exigindo aceite e persistindo o resultado na API.
- PDF extenso: todos os 48 itens presentes e nenhuma palavra fora da página A4.
- `npm test`: 114 testes aprovados; dois testes de concorrência que exigem
  Postgres dedicado foram ignorados.

A conferência móvel usa emulação de viewport no Chromium. Gestos e teclado do
Safari em um aparelho físico continuam sujeitos à conferência no preview.

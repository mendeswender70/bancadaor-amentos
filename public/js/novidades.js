// Inclua uma entrada aqui em cada publicação com mudanças que valem avisar.
// O id deve ser único e mudar quando a entrada for publicada.
//
// Cada entrada tem: id, data, titulo, itens e, se quiser, resumo (uma frase que abre a novidade)
// e acao ({ rotulo, href }) para levar a pessoa direto ao que mudou.
// Um item é um texto simples ou { icone, titulo, texto }: título curto e uma frase de explicação.
export const novidades = [
  {
    id: '2026-11-painel-frase-e-meta',
    data: '10 de novembro de 2026',
    titulo: 'O painel agora conta como vai o mês',
    resumo: 'O app ganhou a cara do livro da proposta, e o painel abre dizendo em uma frase quanto você já aprovou.',
    itens: [
      { icone: 'grafico', titulo: 'Uma frase no lugar das caixas', texto: 'O painel abre com o valor aprovado do período, e orçado, taxa de aprovação, pendentes e ticket médio ficam numa faixa logo abaixo.' },
      { icone: 'regua', titulo: 'Meta do mês em régua', texto: 'Defina quanto quer aprovar por mês. A régua mostra quanto já foi, quanto falta e se você está à frente ou atrás do ritmo.' },
      { icone: 'projeto', titulo: 'Visual do livro no app', texto: 'O menu lateral virou a capa do livro e os títulos usam a mesma letra da proposta.' },
    ],
    acao: { rotulo: 'Definir a meta do mês', href: '#/' },
  },
  {
    id: '2026-11-proposta-em-livro',
    data: '10 de novembro de 2026',
    titulo: 'A proposta do cliente virou um livro',
    resumo: 'O link que o cliente recebe agora abre como um livro, com o nome dele na capa.',
    itens: [
      { icone: 'projeto', titulo: 'Páginas que viram', texto: 'O cliente arrasta ou usa as setas, no celular e no computador. Cada ambiente tem a sua página, com o valor de cada móvel.' },
      { icone: 'pagamento', titulo: 'Simulador de cartão', texto: 'Ele escolhe o número de parcelas e vê o valor na hora. A forma escolhida aparece no histórico do orçamento.' },
      { icone: 'aprovado', titulo: 'Aprovação segurando o botão', texto: 'Dois segundos com o dedo no botão e você recebe o aviso na hora.' },
      { icone: 'pdf', titulo: 'PDF com a cara do livro', texto: 'As mesmas páginas em A4, com selo de aprovação quando a proposta já foi aceita.' },
    ],
    acao: { rotulo: 'Ver meus orçamentos', href: '#/orcamentos' },
  },
  {
    id: '2026-11-ja-esta-incluso',
    data: '9 de novembro de 2026',
    titulo: 'Mostre o que já está incluso',
    resumo: 'Uma nova etapa do orçamento para mostrar o que você entrega sem custo extra.',
    itens: [
      { icone: 'check', titulo: 'Marque o que vale para cada proposta', texto: 'Medição, montagem, garantia e o que mais fizer parte do seu serviço.' },
      { icone: 'editar', titulo: 'A lista é sua', texto: 'Edite os textos, crie itens e escolha quais já entram marcados nos próximos orçamentos.' },
      { icone: 'alerta', titulo: 'Aviso de cobrança em dobro', texto: 'Se um item marcado também estiver cobrado como serviço, o esquadro avisa. Os itens aparecem na proposta e no PDF.' },
    ],
  },
  {
    id: '2026-11-indicadores-consistentes',
    data: '9 de novembro de 2026',
    titulo: 'Indicadores mais fiéis às vendas',
    itens: [
      'O valor orçado considera apenas propostas apresentadas ao cliente. Rascunhos e cancelados ficam de fora no painel e nos relatórios.',
      'O ticket médio agora é o valor médio das propostas aprovadas, igual em todas as telas.',
      'A janela de novidades mostra só as mais recentes; as anteriores continuam em Avisos.',
    ],
  },
  {
    id: '2026-11-relatorios-comerciais',
    data: '6 de novembro de 2026',
    titulo: 'Relatórios para entender seus resultados',
    itens: [
      'Escolha o período e acompanhe valores orçados, aprovações, conversão e ticket médio com comparação real.',
      'Veja a evolução mensal, os clientes em destaque e as oportunidades ainda em aberto.',
      'Confira cada aprovação, filtre por mês ou cliente e exporte o resumo ou o detalhamento em CSV.',
    ],
  },
  {
    id: '2026-11-painel-comercial',
    data: '6 de novembro de 2026',
    titulo: 'Seu novo painel comercial',
    itens: [
      'Acompanhe valor orçado, valor aprovado, taxa de aprovação, pendências e ticket médio com períodos selecionáveis.',
      'Veja os orçamentos que precisam de atenção, a distribuição por ambiente, as últimas atividades e os próximos vencimentos.',
      'Acesse propostas, catálogo e relatórios pelo menu. O PDF e o link público continuam com o visual aprovado.',
    ],
  },
  {
    id: '2026-11-tema-aparelho-filtros',
    data: '6 de novembro de 2026',
    titulo: 'O tema acompanha seu aparelho',
    itens: [
      'Em Aparência, escolha Seguir o aparelho para alternar automaticamente com o celular ou computador, sem recarregar.',
      'Claro e Escuro continuam disponíveis como escolhas fixas. A preferência fica salva neste navegador.',
      'Os filtros de orçamentos e os indicadores de status ficaram mais legíveis no modo claro.',
    ],
  },
  {
    id: '2026-11-modo-claro',
    data: '6 de novembro de 2026',
    titulo: 'O Esquadro também em modo claro',
    itens: [
      'Escolha entre Claro e Escuro em Aparência, nos ajustes da conta. A preferência fica salva neste navegador.',
      'O modo claro usa marfim, cartões brancos e detalhes em bronze, com gráficos e formulários adaptados.',
      'Troque o tema também no acesso, mantendo o fundo de madeira e os dados digitados.',
      'A aparência do PDF e do link público da proposta foi preservada.',
    ],
  },
  {
    id: '2026-11-refino-gestao',
    data: '6 de novembro de 2026',
    titulo: 'Mais clareza na gestão do dia a dia',
    itens: [
      'Indicadores, valores e textos de apoio ficaram mais legíveis, com um acabamento consistente entre as telas.',
      'Consulte cada mês no gráfico pelo toque, teclado ou seletor de mês.',
      'No celular, a busca geral abre pela lupa e as atividades ficam organizadas em linhas, sem tabela para arrastar.',
      'Os contatos e o atalho de WhatsApp voltaram a aparecer na ficha do cliente no celular.',
    ],
  },
  {
    id: '2026-11-gestao-dashboard-acoes',
    data: '6 de novembro de 2026',
    titulo: 'Uma nova visão da sua marcenaria',
    itens: [
      'O início agora traz valores aprovados, propostas em aberto, clientes e taxa de aprovação, com gráficos e atividades reais.',
      'Clientes, orçamentos e ajustes ganharam uma navegação adaptada ao computador e ao celular.',
      'Exclua móveis diretamente no orçamento e altere a situação pelo botão ao lado do número da proposta.',
      'Aprovações manuais e pelo cliente entram no mês em que foram aceitas, mesmo em orçamentos antigos.',
    ],
  },
  {
    id: '2026-10-cartao-nu-empresas',
    data: '22 de outubro de 2026',
    titulo: 'Novas opções de pagamento no cartão',
    itens: [
      'Escolha entre Tap to Pay presencial e Link de pagamento ao preparar um orçamento.',
      'O cliente vê as taxas e os valores à vista ou parcelados no link da proposta e no PDF.',
      'O total original do orçamento continua separado das opções de cartão.',
    ],
  },
  {
    id: '2026-10-proposta-desktop-fundo-continuo',
    data: '22 de outubro de 2026',
    titulo: 'Proposta adaptada ao computador',
    itens: [
      'O link enviado ao cliente aproveita a largura do computador, com apresentação, resumo e condições em colunas.',
      'O fundo de madeira continua entre a capa e os detalhes, sem o corte na imagem.',
      'Nomes maiores da marcenaria se ajustam ao cabeçalho da proposta.',
    ],
  },
  {
    id: '2026-10-refino-interface-navegacao',
    data: '22 de outubro de 2026',
    titulo: 'Mais cuidado nos detalhes do esquadro',
    itens: [
      'Cartões de clientes, indicadores dos orçamentos e divisórias dos móveis ganharam ajustes de alinhamento.',
      'Valores maiores e botões da proposta se acomodam sem sobreposição em telas pequenas.',
      'As buscas mantêm o resultado mais recente e permitem tentar novamente quando a conexão falha.',
      'Orçamentos novos sem alterações podem ser fechados diretamente; os que têm alterações continuam protegidos contra descarte.',
      'Menus e diálogos ficaram mais fáceis de usar pelo teclado.',
    ],
  },
  {
    id: '2026-10-icones-estados-vazios',
    data: '21 de outubro de 2026',
    titulo: 'Correção nas telas sem resultados',
    itens: [
      'A lupa permanece centralizada no ícone ao filtrar orçamentos ou buscar clientes sem resultados.',
      'As mensagens e os botões dessas telas ficam livres de sobreposição.',
    ],
  },
  {
    id: '2026-10-figma-proposta-madeira',
    data: '21 de outubro de 2026',
    titulo: 'Novo visual do Esquadro e das propostas',
    itens: [
      'Login, painel, orçamentos, clientes, avisos e ajustes seguem a identidade aprovada, com novos ícones e botões de vidro.',
      'O PDF e o link de aprovação compartilham o fundo de madeira e a mesma apresentação do projeto.',
      'As abas do editor, os formulários e os menus se adaptam ao celular sem cortar os móveis ou sobrepor as ações.',
    ],
  },
  {
    id: '2026-10-login-vidro-escuro',
    data: '20 de outubro de 2026',
    titulo: 'Tema escuro e vidro líquido no acesso',
    itens: [
      'O esquadro mantém o tema escuro mesmo quando o celular ou computador está configurado no claro.',
      'O cartão ganha transparência, desfoque e reflexos sutis de vidro líquido.',
      'Linhas de planta baixa, cantoneiras e um símbolo de esquadro trazem detalhes de marcenaria ao login.',
      'Uma régua acompanha o preenchimento dos campos e partículas douradas flutuam discretamente.',
      'O cartão continua como único elemento de entrada, e os movimentos respeitam a opção de reduzir movimento.',
    ],
  },
  {
    id: '2026-10-login-premium-madeira',
    data: '20 de outubro de 2026',
    titulo: 'Novo visual para entrar no esquadro',
    itens: [
      'A tela de acesso ganhou fundo de madeira escura com detalhes em bronze e cartão de vidro fumê.',
      'O visual se adapta ao tema claro ou escuro do dispositivo.',
      'A marca e os campos do login mantêm a leitura clara no celular e no computador.',
    ],
  },
  {
    id: '2026-10-login-capslock-serra',
    data: '20 de outubro de 2026',
    titulo: 'Login com retorno mais claro',
    itens: [
      'O login avisa quando o Caps Lock está ativado.',
      'Uma serra de marcenaria gira enquanto o sistema verifica a senha.',
    ],
  },
  {
    id: '2026-10-senha-visivel',
    data: '20 de outubro de 2026',
    titulo: 'Mais clareza ao entrar',
    itens: ['Agora você pode mostrar ou ocultar a senha enquanto digita.'],
  },
  {
    id: '2026-10-validade-orcamento',
    data: '20 de outubro de 2026',
    titulo: 'Validade renovada nos orçamentos',
    itens: [
      'Renovar a validade reabre uma proposta expirada e preserva o status Enviado ou Em negociação.',
      'Propostas já salvas com a data nova são corrigidas automaticamente ao abrir o orçamento ou o link.',
    ],
  },
  {
    id: '2026-10-modo-escuro',
    data: '20 de outubro de 2026',
    titulo: 'Modo escuro mais confortável',
    itens: [
      'Fundos, cartões, menus e campos agora têm níveis mais claros entre si, sem perder o tom acolhedor da marca.',
      'Botões e avisos ganharam cores com melhor contraste no tema escuro.',
    ],
  },
  {
    id: '2026-10-visual-premium',
    data: '20 de outubro de 2026',
    titulo: 'Visual mais acolhedor no esquadro',
    itens: [
      'Painel, orçamentos, clientes, editor e ajustes ganharam uma hierarquia visual mais clara.',
      'Títulos, cartões e filtros agora seguem melhor a identidade premium da marcenaria.',
    ],
  },
  {
    id: '2026-10-proposta-mobile',
    data: '20 de outubro de 2026',
    titulo: 'Propostas mais claras no celular',
    itens: [
      'A barra de ações da proposta não cobre mais o valor total em telas estreitas.',
      'Os botões se ajustam ao espaço disponível para facilitar a leitura e a aprovação.',
    ],
  },
  {
    id: '2026-10-excluir-orcamentos',
    data: '20 de outubro de 2026',
    titulo: 'Exclusão segura de orçamentos',
    itens: [
      'Exclua um orçamento pela lista ou pela tela de edição.',
      'A exclusão remove apenas o orçamento escolhido; o original e as outras cópias permanecem.',
    ],
  },
  {
    id: '2026-10-lembretes-propostas',
    data: '20 de outubro de 2026',
    titulo: 'Lembretes de acompanhamento',
    itens: [
      'Receba um aviso se uma proposta enviada ficar 5 dias sem resposta.',
      'Receba outro aviso quando uma proposta estiver a até 2 dias do vencimento.',
      'Toque no aviso para abrir o orçamento correspondente.',
    ],
  },
  {
    id: '2026-10-notificacoes-propostas',
    data: '20 de outubro de 2026',
    titulo: 'Avisos sobre propostas',
    itens: [
      'Você recebe um aviso quando o cliente abre uma proposta pela primeira vez.',
      'Quando o cliente aprova, a notificação abre o orçamento correspondente.',
    ],
  },
  {
    id: '2026-10-notificacoes-pwa',
    data: '20 de outubro de 2026',
    titulo: 'Avisos de atualização no site e no PWA',
    itens: [
      'O site avisa quando há uma nova versão enquanto você está trabalhando.',
      'O PWA pode enviar uma notificação mesmo fechado, depois que você ativar os avisos neste dispositivo.',
    ],
  },
  {
    id: '2026-10-aprovacao-segura',
    data: '20 de outubro de 2026',
    titulo: 'Aprovação de propostas mais segura',
    itens: [
      'O sistema evita que uma proposta seja aprovada com uma versão antiga enquanto ela está sendo editada.',
      'Se o orçamento mudar depois que o cliente abrir o link, ele verá a versão atualizada antes de aprovar.',
    ],
  },
];

import { formatarDinheiro, formatarNumero } from '/shared/calc.js';
import { api, cache } from '../api.js';
import { h, icone, vazioIlustrado, haQuanto, diasAte, iniciais } from '../ui.js';
import { listaOrcamentos, modalNovoCliente } from '../comum.js';
import { usuarioAtual, irPara } from '../main.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const formatarIndicador = (centavos) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
}).format((centavos || 0) / 100);

function indicador(nomeIcone, cor, rotulo, valor, href, detalhe) {
  return h(
    'a',
    { href, class: 'indicador' },
    h('span', { class: 'indicador-topo' }, h('span', { class: `selo-icone ${cor}` }, icone(nomeIcone)), h('span', { class: 'indicador-rotulo' }, rotulo)),
    h('strong', { class: 'indicador-valor' }, valor),
    detalhe ? h('span', { class: 'indicador-detalhe' }, detalhe) : null,
  );
}

/** "↑ 20% vs agosto" (ou nada quando não há mês anterior para comparar). */
function comparacao(atual, anterior, mesAnterior) {
  if (!anterior) return null;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  const classe = pct > 0 ? 'subiu' : pct < 0 ? 'desceu' : '';
  return h('span', { class: `variacao ${classe}` }, `${pct > 0 ? '↑' : pct < 0 ? '↓' : '='} ${Math.abs(pct)}% vs ${mesAnterior}`);
}

function atalho(nomeIcone, titulo, texto, href) {
  return h(
    'a',
    { href, class: 'atalho' },
    h('span', { class: 'selo-icone' }, icone(nomeIcone)),
    h('div', {}, h('strong', {}, titulo), h('span', {}, texto)),
    icone('seta', 'icone linha-seta'),
  );
}

function saudacao() {
  const hora = new Date().getHours();
  const nome = (usuarioAtual()?.nome || '').split(/\s+/)[0];
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${periodo}, ${nome}.` : `${periodo}.`;
}

const diasDesde = (iso) => Math.max(0, -diasAte(new Date(iso).toISOString().slice(0, 10)));

// Texto e ícone de cada motivo do bloco "Precisa de atenção".
const MOTIVOS = {
  aprovado: (a) => ['aprovado', 'sucesso', `${a.cliente_nome.split(/\s+/)[0]} aprovou a proposta`, formatarDinheiro(a.total_cents)],
  vence: (a) => {
    const d = diasAte(a.data_validade);
    const primeiroNome = a.cliente_nome.split(/\s+/)[0];
    return ['relogio', 'alerta', `Proposta de ${primeiroNome} ${d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`}`, 'Bom momento para um lembrete'];
  },
  visto: (a) => ['olho', 'info', `${a.cliente_nome} abriu a proposta ${haQuanto(a.quando)}`, 'Chame enquanto está fresco na memória'],
  sem_resposta: (a) => ['whatsapp', '', `${a.cliente_nome} ainda não respondeu`, `enviado há ${diasDesde(a.quando)} dias`],
  rascunho: (a) => ['editar', '', `Rascunho de ${a.cliente_nome} parado`, `sem mexer há ${diasDesde(a.quando)} dias`],
};

function blocoAtencao(d) {
  const linhas = d.atencao.slice(0, 2).map((a) => {
    const [ic, cor, titulo, detalhe] = MOTIVOS[a.motivo](a);
    return h(
      'a',
      { href: `#/orcamentos/${a.id}`, class: 'atencao-linha' },
      h('span', { class: `selo-icone ${cor}` }, icone(ic)),
      h('div', { class: 'linha-principal' }, h('strong', {},
        h('span', { class: 'atencao-titulo-mobile' }, titulo),
        h('span', { class: 'atencao-titulo-desktop' }, a.motivo === 'aprovado' ? `${titulo} nº ${formatarNumero(a.numero)}` : a.motivo === 'vence' ? `A ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}` : titulo),
      ), a.motivo === 'vence' ? null : h('span', { class: 'suave' }, a.motivo === 'aprovado' ? detalhe : `nº ${formatarNumero(a.numero)} · ${detalhe}`)),
      h('strong', { class: 'valor atencao-valor' }, formatarDinheiro(a.total_cents)),
      icone('seta', 'icone linha-seta'),
    );
  });
  return h(
    'section',
    { class: `cartao cartao-atencao cartao-atencao-${linhas.length}` },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Acompanhar hoje'),
      d.em_aberto
        ? h('a', { href: '#/avisos' }, 'Ver todas →')
        : null,
    ),
    linhas.length
      ? h('div', { class: 'atencao-lista' }, linhas)
      : h(
          'div',
          { class: 'tudo-em-dia' },
          h('span', { class: 'selo-icone sucesso' }, icone('check')),
          h('div', {}, h('strong', {}, 'Tudo em dia'), h('span', { class: 'suave' }, 'Nenhuma proposta vencendo ou esperando resposta.')),
        ),
  );
}

export async function paginaDashboard() {
  const [d, empresa] = await Promise.all([api.get('/dashboard'), cache.carregarEmpresa()]);
  const agora = new Date();
  const mes = MESES[agora.getMonth()];
  const mesAnterior = MESES[(agora.getMonth() + 11) % 12];
  const dataHoje = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const taxa = d.conversao.enviados ? Math.round((d.conversao.aprovados / d.conversao.enviados) * 100) : null;
  const medio = d.mes.validos ? Math.round(d.mes.valor_cents / d.mes.validos) : 0;
  const recarregar = () => {
    location.hash = `#/?${Date.now()}`;
  };
  const novoCliente = async () => {
    const cliente = await modalNovoCliente();
    if (cliente) irPara(`#/clientes/${cliente.id}`);
  };
  const proximos = [...d.atencao.filter((a) => a.motivo !== 'aprovado'), ...d.recentes.filter((o) => o.status === 'rascunho').map((o) => ({ ...o, motivo: 'rascunho' }))]
    .filter((a, i, lista) => lista.findIndex((b) => b.id === a.id) === i).slice(0, 3);

  return h(
    'div',
    { class: 'pagina pagina-dashboard' },
    h(
      'div',
      { class: 'saudacao' },
      h('span', { class: 'page-eyebrow' },
        h('span', { class: 'dashboard-texto-mobile' }, `${dataHoje.charAt(0).toUpperCase()}${dataHoje.slice(1)}`),
        h('span', { class: 'dashboard-texto-desktop' }, 'Painel de controle'),
      ),
      h('h1', {}, saudacao()),
      h('p', {}, h('span', { class: 'dashboard-texto-mobile' }, 'Veja o que precisa da sua atenção hoje.'), h('span', { class: 'dashboard-texto-desktop' }, `${dataHoje.charAt(0).toUpperCase()}${dataHoje.slice(1)}${empresa?.nome ? ` · ${empresa.nome}` : ''}`)),
    ),
    h('a', { class: 'dashboard-usuario', href: '#/config/conta', 'aria-label': 'Minha conta' }, iniciais(usuarioAtual()?.nome)),
    h('div', { class: 'dashboard-destaques' },
      blocoAtencao(d),
      h('section', { class: 'cartao dashboard-atalhos' }, h('h2', {}, 'Atalhos'),
        h('div', { class: 'dashboard-atalho' }, h('span', { class: 'dashboard-atalho-icone' }, icone('mais')), h('button', { type: 'button', class: 'botao', onclick: novoCliente }, 'Novo cliente')),
        h('div', { class: 'dashboard-atalho' }, h('span', { class: 'dashboard-atalho-icone' }, icone('busca')), h('a', { href: '#/orcamentos', class: 'botao' }, 'Consultar orçamento')),
      ),
    ),
    h(
      'div',
      { class: 'indicadores' },
      indicador(
        'orcamentos',
        '',
        `Orçado em ${mes}`,
        formatarIndicador(d.mes.valor_cents),
        '#/orcamentos',
        d.mes.quantidade === 1 ? '1 orçamento' : `${d.mes.quantidade} orçamentos`,
      ),
      indicador(
        'aprovado',
        'sucesso',
        'Aprovado',
        formatarIndicador(d.mes.aprovados_cents),
        '#/orcamentos?status=aprovado',
        d.mes.aprovados === 1 ? '1 proposta' : `${d.mes.aprovados} propostas`,
      ),
      indicador(
        'check',
        'info',
        'Taxa de aprovação',
        taxa === null ? '—' : `${taxa}%`,
        '#/orcamentos?status=aprovado',
        d.conversao.enviados ? `${d.conversao.aprovados} de ${d.conversao.enviados} nos últimos 90 dias` : 'Envie propostas para medir',
      ),
      indicador('dinheiro', 'alerta', 'Valor médio', formatarIndicador(medio), '#/orcamentos', `por orçamento em ${mes}`),
    ),
    h(
      'div',
      { class: 'colunas colunas-2-1' },
      h(
        'section',
        { class: 'cartao' },
        h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Orçamentos recentes'), h('a', { href: '#/orcamentos' }, 'Ver todos')),
        d.recentes.length
          ? listaOrcamentos(d.recentes.slice(0, 3), { aoMudar: recarregar })
          : vazioIlustrado(
              'orcamentos',
              'Nenhum orçamento ainda',
              'Crie o primeiro: escolha o cliente, adicione os ambientes e informe as medidas.',
              h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario' }, icone('mais'), 'Criar orçamento'),
            ),
      ),
      h(
        'section',
        { class: 'cartao dashboard-proximos' },
        h('h2', {}, 'Próximos passos'),
        proximos.length ? h('ol', {}, proximos.map((a, i) => h('li', {}, h('a', { href: `#/orcamentos/${a.id}` }, h('span', {}, String(i + 1).padStart(2, '0')), `${a.motivo === 'rascunho' ? 'Retomar rascunho' : 'Revisar proposta'} de ${a.cliente_nome.split(/\s+/)[0]}`)))) : h('p', { class: 'suave' }, 'Tudo em dia por aqui.'),
      ),
    ),
  );
}

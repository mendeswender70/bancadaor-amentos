import { formatarDinheiro, formatarNumero } from '/shared/calc.js';
import { api, cache } from '../api.js';
import { h, icone, vazioIlustrado, haQuanto, diasAte } from '../ui.js';
import { listaOrcamentos } from '../comum.js';
import { usuarioAtual } from '../main.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

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
  return nome ? `${periodo}, ${nome}!` : `${periodo}!`;
}

const diasDesde = (iso) => Math.max(0, -diasAte(new Date(iso).toISOString().slice(0, 10)));

// Texto e ícone de cada motivo do bloco "Precisa de atenção".
const MOTIVOS = {
  aprovado: (a) => ['aprovado', 'sucesso', `${a.cliente_nome} aprovou a proposta`, `pelo link, ${haQuanto(a.quando)}`],
  vence: (a) => {
    const d = diasAte(a.data_validade);
    return ['relogio', 'alerta', `A proposta de ${a.cliente_nome} ${d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`}`, 'Bom momento para um lembrete'];
  },
  visto: (a) => ['olho', 'info', `${a.cliente_nome} abriu a proposta ${haQuanto(a.quando)}`, 'Chame enquanto está fresco na memória'],
  sem_resposta: (a) => ['whatsapp', '', `${a.cliente_nome} ainda não respondeu`, `enviado há ${diasDesde(a.quando)} dias`],
  rascunho: (a) => ['editar', '', `Rascunho de ${a.cliente_nome} parado`, `sem mexer há ${diasDesde(a.quando)} dias`],
};

function blocoAtencao(d) {
  const linhas = d.atencao.map((a) => {
    const [ic, cor, titulo, detalhe] = MOTIVOS[a.motivo](a);
    return h(
      'a',
      { href: `#/orcamentos/${a.id}`, class: 'atencao-linha' },
      h('span', { class: `selo-icone ${cor}` }, icone(ic)),
      h('div', { class: 'linha-principal' }, h('strong', {}, titulo), h('span', { class: 'suave' }, `nº ${formatarNumero(a.numero)} · ${detalhe}`)),
      h('strong', { class: 'valor atencao-valor' }, formatarDinheiro(a.total_cents)),
      icone('seta', 'icone linha-seta'),
    );
  });
  return h(
    'section',
    { class: 'cartao cartao-atencao' },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Precisa de atenção'),
      d.em_aberto
        ? h('a', { href: '#/orcamentos?status=abertos' }, d.em_aberto === 1 ? '1 orçamento em aberto' : `${d.em_aberto} orçamentos em aberto`)
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
  const d = await api.get('/dashboard');
  const agora = new Date();
  const mes = MESES[agora.getMonth()];
  const mesAnterior = MESES[(agora.getMonth() + 11) % 12];
  const dataHoje = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const taxa = d.conversao.enviados ? Math.round((d.conversao.aprovados / d.conversao.enviados) * 100) : null;
  const medio = d.mes.validos ? Math.round(d.mes.valor_cents / d.mes.validos) : 0;
  const recarregar = () => {
    location.hash = `#/?${Date.now()}`;
  };

  return h(
    'div',
    { class: 'pagina' },
    h(
      'div',
      { class: 'saudacao' },
      h('h1', {}, saudacao()),
      h('p', {}, `${dataHoje.charAt(0).toUpperCase()}${dataHoje.slice(1)} · ${cache.empresa?.nome || ''}`),
    ),
    blocoAtencao(d),
    h(
      'div',
      { class: 'indicadores' },
      indicador(
        'orcamentos',
        '',
        `Orçado em ${mes}`,
        formatarDinheiro(d.mes.valor_cents),
        '#/orcamentos',
        h(
          'span',
          {},
          d.mes.quantidade === 1 ? '1 orçamento' : `${d.mes.quantidade} orçamentos`,
          comparacao(d.mes.valor_cents, d.mes_anterior.valor_cents, mesAnterior) ? ' · ' : '',
          comparacao(d.mes.valor_cents, d.mes_anterior.valor_cents, mesAnterior),
        ),
      ),
      indicador(
        'aprovado',
        'sucesso',
        `Aprovado em ${mes}`,
        formatarDinheiro(d.mes.aprovados_cents),
        '#/orcamentos?status=aprovado',
        d.mes.aprovados === 1 ? '1 aprovado' : `${d.mes.aprovados} aprovados`,
      ),
      indicador(
        'check',
        'info',
        'Taxa de aprovação',
        taxa === null ? '—' : `${taxa}%`,
        '#/orcamentos?status=aprovado',
        d.conversao.enviados ? `${d.conversao.aprovados} de ${d.conversao.enviados} nos últimos 90 dias` : 'Envie propostas para medir',
      ),
      indicador('dinheiro', 'alerta', 'Valor médio', formatarDinheiro(medio), '#/orcamentos', `por orçamento em ${mes}`),
    ),
    h(
      'div',
      { class: 'colunas colunas-2-1' },
      h(
        'section',
        { class: 'cartao' },
        h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Orçamentos recentes'), h('a', { href: '#/orcamentos' }, 'Ver todos')),
        d.recentes.length
          ? listaOrcamentos(d.recentes, { aoMudar: recarregar })
          : vazioIlustrado(
              'orcamentos',
              'Nenhum orçamento ainda',
              'Crie o primeiro: escolha o cliente, adicione os ambientes e informe as medidas.',
              h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario' }, icone('mais'), 'Criar orçamento'),
            ),
      ),
      h(
        'section',
        { class: 'cartao' },
        h('h2', {}, 'Atalhos'),
        h(
          'div',
          { class: 'atalhos' },
          atalho('clientes', 'Clientes', 'Cadastrar e procurar clientes', '#/clientes'),
          atalho('preco', 'Móveis e preços', 'Guarda-roupa, cozinha, painel…', '#/config/moveis'),
          atalho('pagamento', 'Condições de pagamento', 'À vista, entrada, parcelas', '#/config/pagamento'),
          atalho('empresa', 'Dados da empresa', 'Logo e informações da proposta', '#/config/empresa'),
        ),
      ),
    ),
  );
}

import { h, icone, substituir, haQuanto } from './ui.js';
import { formatarDinheiro, formatarData, formatarNumero, STATUS } from '/shared/calc.js';
import { usuarioAtual, irPara } from './main.js';
import { modalNovoCliente } from './comum.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CORES = ['#b39a7e', '#cfac79', '#e2bb88', '#8cb9a2', '#b48579', '#80756b', '#a38e74'];
let desenho = 0;
const compacto = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v / 100);
const moeda = (v) => formatarDinheiro(v || 0);
const svg = (tag, atributos, ...filhos) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, String(valor));
  el.append(...filhos.flat().map((f) => typeof f === 'string' ? document.createTextNode(f) : f));
  return el;
};
const cabecalho = (titulo, descricao, extra) => h('div', { class: 'gestao-painel-titulo' }, h('div', {}, h('h2', {}, titulo), h('p', {}, descricao)), extra || null);
const vazio = (texto) => h('p', { class: 'gestao-sem-dados' }, texto);

function indicador(iconeNome, titulo, valor, detalhe, destino, variacao) {
  return h('a', { class: 'gestao-metrica', href: destino },
    h('span', { class: 'gestao-metrica-icone' }, icone(iconeNome)),
    h('div', {}, h('span', { class: 'gestao-metrica-titulo' }, titulo), h('strong', { class: 'gestao-metrica-valor' }, valor),
      h('span', { class: 'gestao-metrica-detalhe' }, variacao || null, detalhe)),
  );
}

function evolucao(serie) {
  const total = serie.reduce((s, m) => s + m.valor_cents, 0);
  const selecionado = h('p', { class: 'gestao-grafico-leitura', role: 'status', 'aria-live': 'polite' });
  const pontosEl = h('div', { class: `gestao-chart-pontos${serie.length > 6 ? ' gestao-pontos-densos' : ''}` });
  const escolha = h('select', { 'aria-label': 'Consultar mês no gráfico', onchange: (e) => mostrar(Number(e.target.value)) },
    serie.map((m, i) => h('option', { value: String(i) }, `${MESES[Number(m.mes.slice(5)) - 1]}/${m.mes.slice(0, 4)}`)));
  function mostrar(indice) {
    const m = serie[indice];
    escolha.value = String(indice);
    substituir(selecionado, h('strong', {}, moeda(m.valor_cents)), h('span', {}, `${m.quantidade} ${m.quantidade === 1 ? 'aprovação' : 'aprovações'} no mês`));
    pontosEl.querySelectorAll('button').forEach((p, i) => p.setAttribute('aria-pressed', String(i === indice)));
  }
  const maximo = Math.max(100, ...serie.map((m) => m.valor_cents));
  const pontos = serie.map((m, i) => [24 + i * 552 / Math.max(1, serie.length - 1), 168 - m.valor_cents / maximo * 150]);
  const id = `gestao-evolucao-${++desenho}`;
  const grafico = svg('svg', { viewBox: '0 0 600 180', preserveAspectRatio: 'none', class: 'gestao-linha-svg', 'aria-hidden': 'true' },
    svg('defs', {}, svg('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' }, svg('stop', { offset: '0%', 'stop-color': '#caa371', 'stop-opacity': '.25' }), svg('stop', { offset: '100%', 'stop-color': '#caa371', 'stop-opacity': '0' }))),
    [18, 68, 118, 168].map((y) => svg('line', { x1: 0, y1: y, x2: 600, y2: y, stroke: '#ffffff0d', 'vector-effect': 'non-scaling-stroke' })),
    ...(total ? [svg('path', { d: `M${pontos.map((p) => p.join(',')).join(' L')} L576,180 L24,180 Z`, fill: `url(#${id})` }),
      svg('polyline', { points: pontos.map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#d5b17e', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' })] : []),
  );
  if (total) pontos.forEach(([x, y], i) => {
    const m = serie[i];
    const ponto = h('button', { type: 'button', class: 'gestao-chart-ponto', title: `${m.mes}: ${moeda(m.valor_cents)}`, 'aria-label': `${m.mes}: ${moeda(m.valor_cents)}`, 'aria-pressed': 'false', onclick: () => mostrar(i), onfocus: () => mostrar(i), onkeydown: (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      pontosEl.children[(i + (e.key === 'ArrowRight' ? 1 : -1) + serie.length) % serie.length].focus();
    } });
    ponto.style.left = `${x / 6}%`;
    ponto.style.top = `${y / 1.8}%`;
    pontosEl.append(ponto);
  });
  mostrar(serie.length - 1);
  return h('section', { class: 'gestao-painel gestao-evolucao' },
    cabecalho('Evolução das aprovações', 'Valor aprovado por mês.', h('div', { class: 'gestao-chart-total' }, h('small', {}, 'Total no período'), h('strong', {}, moeda(total)))),
    h('div', { class: 'gestao-chart-area' }, h('div', { class: 'gestao-eixo-y', 'aria-hidden': 'true' }, [1, 2 / 3, 1 / 3, 0].map((n) => h('span', {}, compacto(maximo * n)))),
      h('div', { class: 'gestao-chart-plot' }, h('div', { class: 'gestao-chart-canvas' }, grafico, pontosEl, total ? null : vazio('Nenhuma aprovação neste período.')),
        h('div', { class: `gestao-eixo-x${serie.length > 6 ? ' gestao-eixo-denso' : ''}`, 'aria-hidden': 'true' }, serie.map((m) => h('span', {}, MESES[Number(m.mes.slice(5)) - 1]))))),
    h('div', { class: 'gestao-chart-consulta' }, escolha, selecionado),
  );
}

function barras(situacoes) {
  const maior = Math.max(1, ...situacoes.map((s) => s.quantidade));
  const nomes = ['Rasc.', 'Enviado', 'Negoc.', 'Aprov.', 'Recus.', 'Cancel.', 'Expir.'];
  return h('section', { class: 'gestao-painel' }, cabecalho('Orçamentos por status', 'Visão de todos os orçamentos.'),
    h('div', { class: 'gestao-barras' }, situacoes.map((s, i) => {
      const barra = h('span', { class: 'gestao-barra' });
      barra.style.height = `${s.quantidade / maior * 100}%`;
      barra.style.backgroundColor = CORES[i];
      return h('a', { href: `#/orcamentos?status=${s.status}`, class: 'gestao-barra-coluna', 'aria-label': `${STATUS[s.status]}: ${s.quantidade} orçamentos, ${moeda(s.valor_cents)}` },
        h('span', { class: 'gestao-barra-pista' }, h('strong', {}, String(s.quantidade)), barra), h('small', {}, nomes[i]));
    })),
    h('p', { class: 'gestao-grafico-leitura' }, 'Selecione um status para ver as propostas.'),
  );
}

function distribuicao(situacoes) {
  const somar = (estados) => situacoes.filter((s) => estados.includes(s.status)).reduce((n, s) => n + s.quantidade, 0);
  const dados = [
    { nome: 'Aprovadas', n: somar(['aprovado']), cor: '#8cb9a2', filtro: 'aprovado' },
    { nome: 'Em aberto', n: somar(['rascunho', 'enviado', 'negociacao']), cor: '#d5b17e', filtro: 'abertos' },
    { nome: 'Encerradas', n: somar(['cancelado', 'recusado', 'expirado']), cor: '#75695e', filtro: 'perdidos' },
  ];
  const total = dados.reduce((n, d) => n + d.n, 0);
  const circunferencia = 2 * Math.PI * 61;
  let acumulado = 0;
  const arcos = dados.map((d) => {
    const arco = svg('circle', { cx: 80, cy: 80, r: 61, fill: 'none', stroke: d.cor, 'stroke-width': 21, 'stroke-dasharray': `${total ? d.n / total * circunferencia : 0} ${circunferencia}`, 'stroke-dashoffset': -acumulado, transform: 'rotate(-90 80 80)' });
    acumulado += total ? d.n / total * circunferencia : 0;
    return arco;
  });
  return h('section', { class: 'gestao-painel' }, cabecalho('Resultado das propostas', 'Distribuição da sua carteira.'),
    h('div', { class: 'gestao-distribuicao' },
      h('div', { class: 'gestao-donut' }, svg('svg', { viewBox: '0 0 160 160', 'aria-hidden': 'true' }, svg('circle', { cx: 80, cy: 80, r: 61, fill: 'none', stroke: '#ffffff0b', 'stroke-width': 21 }), arcos), h('div', {}, h('strong', {}, String(total)), h('small', {}, 'orçamentos'))),
      h('div', { class: 'gestao-legenda' }, dados.map((d) => {
        const ponto = h('span', { class: 'gestao-legenda-ponto', 'aria-hidden': 'true' }); ponto.style.backgroundColor = d.cor;
        return h('a', { href: `#/orcamentos?status=${d.filtro}` }, ponto, h('span', {}, d.nome, h('small', {}, `${d.n} ${d.n === 1 ? 'orçamento' : 'orçamentos'}`)), h('strong', {}, `${total ? Math.round(d.n / total * 100) : 0}%`));
      }))),
    h('p', { class: 'gestao-grafico-leitura' }, 'Encerradas: recusadas, canceladas e expiradas.'),
  );
}

function atividades(linhas) {
  return h('section', { class: 'gestao-painel gestao-atividades' }, cabecalho('Atividades recentes', 'O que mudou nas suas propostas.', h('a', { href: '#/orcamentos', class: 'gestao-link' }, 'Ver propostas →')),
    linhas.length ? h('div', { class: 'gestao-tabela-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Atividade', 'Cliente / proposta', 'Responsável', 'Quando'].map((s) => h('th', { scope: 'col' }, s)))),
      h('tbody', {}, linhas.map((a) => h('tr', {},
        h('td', {}, h('a', { href: `#/orcamentos/${a.orcamento_id}`, title: a.evento }, h('span', { class: 'gestao-atividade-icone' }, icone(/aprovad/i.test(a.evento) ? 'aprovado' : /criado/i.test(a.evento) ? 'mais' : 'historico')), h('span', {}, a.evento.startsWith('Status:') ? `Orçamento ${a.evento.split('→').at(-1).trim().toLocaleLowerCase('pt-BR')}` : a.evento))),
        h('td', {}, h('strong', {}, a.cliente_nome), h('small', {}, `Nº ${formatarNumero(a.numero)}`)),
        h('td', {}, a.usuario_nome || (a.evento.includes('cliente') ? 'Cliente' : 'Sistema')),
        h('td', { title: new Date(a.data_hora).toLocaleString('pt-BR') }, haQuanto(a.data_hora)),
      ))))) : vazio('As primeiras movimentações aparecerão aqui quando você criar um orçamento.'),
  );
}

function agenda(vencimentos, hoje) {
  let mes = new Date(`${hoje.slice(0, 7)}-01T12:00:00`);
  let diaEscolhido = null;
  const lista = h('div', { class: 'gestao-prazos-lista' });
  const calendario = h('div', { class: 'gestao-calendario' });
  const atualizar = () => {
    const visiveis = diaEscolhido ? vencimentos.filter((v) => v.data_validade === diaEscolhido) : vencimentos.slice(0, 4);
    substituir(lista, visiveis.length ? visiveis.map((v) => {
      const dias = Math.round((Date.parse(`${v.data_validade}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
      return h('a', { href: `#/orcamentos/${v.id}`, class: 'gestao-prazo' }, h('span', { class: 'gestao-prazo-icone' }, icone('calendario')),
        h('span', {}, h('strong', {}, v.cliente_nome), h('small', {}, `Proposta ${formatarNumero(v.numero)} · ${moeda(v.total_cents)}`)),
        h('span', { class: `gestao-prazo-data${dias <= 2 ? ' perto' : ''}` }, dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : formatarData(v.data_validade).slice(0, 5)));
    }) : vazio(diaEscolhido ? 'Nenhuma proposta desta lista vence no dia selecionado.' : 'Nenhuma proposta enviada ou em negociação perto de vencer.'),
    diaEscolhido ? h('button', { type: 'button', class: 'gestao-link', onclick: () => { diaEscolhido = null; atualizar(); } }, 'Mostrar próximos vencimentos') : null);
    const ano = mes.getFullYear(), numeroMes = mes.getMonth();
    const diasNoMes = new Date(ano, numeroMes + 1, 0).getDate();
    const deslocar = (n) => {
      mes = new Date(ano, numeroMes + n, 1, 12);
      atualizar();
      calendario.querySelector(`.gestao-calendario-topo button:${n < 0 ? 'first' : 'last'}-child`)?.focus({ preventScroll: true });
    };
    substituir(calendario,
      h('div', { class: 'gestao-calendario-topo' }, h('button', { type: 'button', 'aria-label': 'Mês anterior', onclick: () => deslocar(-1) }, icone('voltar')), h('strong', {}, `${MESES[numeroMes]} ${ano}`), h('button', { type: 'button', 'aria-label': 'Próximo mês', onclick: () => deslocar(1) }, icone('seta'))),
      h('div', { class: 'gestao-calendario-grade' }, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => h('small', { 'aria-hidden': 'true' }, d)),
        Array.from({ length: new Date(ano, numeroMes, 1).getDay() }, () => h('span', {})),
        Array.from({ length: diasNoMes }, (_, i) => {
          const iso = `${ano}-${String(numeroMes + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          const tem = vencimentos.some((v) => v.data_validade === iso);
          return h('button', { type: 'button', class: `${iso === hoje ? 'hoje ' : ''}${tem ? 'tem-vencimento' : ''}`, 'data-dia': iso, 'aria-label': formatarData(iso), 'aria-pressed': String(iso === diaEscolhido), onclick: () => {
            diaEscolhido = iso === diaEscolhido ? null : iso;
            atualizar();
            calendario.querySelector(`[data-dia="${iso}"]`)?.focus({ preventScroll: true });
          } }, String(i + 1));
        })),
    );
  };
  atualizar();
  return h('section', { class: 'gestao-painel gestao-agenda' }, cabecalho('Próximos vencimentos', 'Validade das propostas em aberto.', h('a', { href: '#/orcamentos?status=abertos', class: 'gestao-link' }, 'Ver em aberto →')), h('div', { class: 'gestao-agenda-conteudo' }, lista, calendario));
}

export function desenharDashboard(d, empresa, meses, aoMudarPeriodo) {
  const mesAtual = MESES[Number(d.data_hoje.slice(5, 7)) - 1];
  const taxa = d.conversao.enviados ? Math.round(d.conversao.aprovados / d.conversao.enviados * 100) : null;
  const anterior = d.mes_anterior.aprovados_cents;
  const variacao = anterior ? (d.mes.aprovados_cents - anterior) / anterior * 100 : null;
  const comparacao = variacao === null ? null : h('span', { title: 'Comparação com o mês anterior', 'aria-label': 'Variação sobre o mês anterior', class: `gestao-variacao${variacao < 0 ? ' queda' : ''}` }, `${variacao >= 0 ? '↑' : '↓'} ${Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const periodo = h('select', { 'aria-label': 'Período do gráfico de aprovações', onchange: (e) => aoMudarPeriodo(Number(e.target.value)) }, h('option', { value: '6', selected: meses === 6 }, 'Últimos 6 meses'), h('option', { value: '12', selected: meses === 12 }, 'Últimos 12 meses'));
  const nome = (usuarioAtual()?.nome || '').split(/\s+/)[0];
  return h('div', { class: 'pagina pagina-dashboard gestao-dashboard' },
    h('div', { class: 'gestao-dashboard-cabecalho' }, h('div', {}, h('span', { class: 'gestao-eyebrow' }, empresa?.nome || 'Sua marcenaria'), h('h1', {}, 'Dashboard'), h('p', {}, `${nome ? `${nome}, veja` : 'Veja'} como está sua marcenaria hoje.`)),
      h('div', { class: 'gestao-dashboard-acoes' }, h('label', { class: 'gestao-periodo' }, icone('calendario'), periodo), h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario' }, icone('mais'), 'Novo orçamento'))),
    h('div', { class: 'gestao-metricas' },
      indicador('dinheiro', `Aprovado em ${mesAtual}`, moeda(d.mes.aprovados_cents), `${d.mes.aprovados} ${d.mes.aprovados === 1 ? 'proposta aceita' : 'propostas aceitas'}`, '#/orcamentos?status=aprovado', comparacao),
      indicador('orcamentos', 'Orçamentos em aberto', String(d.em_aberto), `${compacto(d.em_aberto_cents)} · inclui rascunhos`, '#/orcamentos?status=abertos'),
      indicador('clientes', 'Clientes cadastrados', String(d.clientes_total), 'Ver contatos e histórico', '#/clientes'),
      indicador('aprovado', 'Taxa de aprovação', taxa === null ? '—' : `${taxa}%`, taxa === null ? 'Envie propostas para acompanhar' : `${d.conversao.aprovados} de ${d.conversao.enviados} · últimos 90 dias`, '#/orcamentos?status=aprovado')),
    h('div', { class: 'gestao-graficos' }, evolucao(d.evolucao.slice(-meses)), barras(d.situacoes), distribuicao(d.situacoes)),
    h('div', { class: 'gestao-operacao' }, atividades(d.atividades), agenda(d.vencimentos, d.data_hoje)),
    h('section', { class: 'gestao-resumo-rodape' }, h('div', {}, h('strong', {}, `${moeda(d.mes.valor_cents)} em propostas neste mês`), h('span', {}, `${d.mes.quantidade} ${d.mes.quantidade === 1 ? 'orçamento' : 'orçamentos'} · valores aprovados representam propostas aceitas, não recebimentos.`)),
      h('button', { type: 'button', class: 'botao', onclick: async () => { const c = await modalNovoCliente(); if (c) irPara(`#/clientes/${c.id}`); } }, icone('usuarioMais'), 'Cadastrar cliente')),
  );
}

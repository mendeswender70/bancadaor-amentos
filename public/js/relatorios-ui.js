import { h, icone, substituir, iniciais } from './ui.js';
import { formatarDinheiro, formatarData, formatarNumero } from '/shared/calc.js';

const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const moeda=v=>formatarDinheiro(v||0);
const numero=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:1});
const mesNome=m=>`${MESES[Number(m.slice(5,7))-1]}/${m.slice(0,4)}`;
const compacto=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',notation:'compact',maximumFractionDigits:1}).format(v/100);
const titulo=(nome,texto,extra)=>h('header',{class:'rpt-titulo'},h('div',{},h('h2',{},nome),texto?h('p',{},texto):null),extra);
const painel=(classe,...filhos)=>h('section',{class:`rpt-painel ${classe}`},...filhos);
const semDados=(ic,nome,texto)=>h('div',{class:'rpt-sem-dados'},h('span',{},icone(ic)),h('strong',{},nome),h('p',{},texto));
const total=(n,singular,plural)=>`${n} ${n===1?singular:plural}`;

function comparacao(atual,anterior,periodo,pontos=false) {
  const descricao=`Comparação com ${formatarData(periodo.anterior_de)} a ${formatarData(periodo.anterior_ate)}: mesmo número de dias.`;
  if (atual===null || anterior===null || (!pontos&&!anterior)) return h('span',{class:'rpt-comparacao rpt-neutra',title:descricao},'Sem base de comparação');
  const valor=pontos?atual-anterior:(atual-anterior)/anterior*100;
  return h('span',{class:`rpt-comparacao ${valor<0?'rpt-queda':''}`,title:descricao},icone(valor<0?'baixo':'cima'),h('b',{},`${valor>0?'+':''}${numero(valor)}${pontos?' p.p.':'%'}`),h('span',{},'vs. período anterior'));
}
function metrica(ic,nome,valor,detalhe,variacao,classe='') {
  return h('article',{class:`rpt-metrica ${classe}`},h('div',{class:'rpt-metrica-topo'},h('span',{},nome),h('span',{class:'rpt-icone'},icone(ic))),h('strong',{},valor),h('p',{},detalhe),variacao);
}

export function limitesPreset(hoje,preset) {
  const [ano,mes]=hoje.slice(0,7).split('-').map(Number);
  const deslocar=n=>new Date(Date.UTC(ano,mes-1+n,1)).toISOString().slice(0,10);
  return {de:preset==='ano'?`${ano}-01-01`:deslocar(preset==='mes'?0:preset==='trimestre'?-2:preset==='doze'?-11:-5),ate:hoje};
}
function filtros(d,acoes) {
  const p=d.periodo;
  const presetAtual=['mes','trimestre','semestre','ano','doze'].find(v=>limitesPreset(d.hoje,v).de===p.de&&p.ate===d.hoje)||'personalizado';
  const select=h('select',{'aria-label':'Período do relatório'},[['mes','Este mês'],['trimestre','Últimos 3 meses'],['semestre','Últimos 6 meses'],['ano','Este ano'],['doze','Últimos 12 meses'],['personalizado','Personalizado']].map(([v,t])=>h('option',{value:v,selected:v===presetAtual},t)));
  const de=h('input',{type:'date',value:p.de,max:d.hoje,required:true,'aria-label':'Data inicial'});
  const ate=h('input',{type:'date',value:p.ate,max:d.hoje,required:true,'aria-label':'Data final'});
  const aplicar=()=>acoes.aoAplicar(de.value,ate.value);
  select.addEventListener('change',()=>{if(select.value==='personalizado'){de.focus();return;}const datas=limitesPreset(d.hoje,select.value);de.value=datas.de;ate.value=datas.ate;aplicar();});
  for(const el of [de,ate]) el.addEventListener('input',()=>{select.value='personalizado';});
  return h('div',{class:'rpt-filtros'},h('form',{onsubmit:e=>{e.preventDefault();aplicar();}},
    h('label',{},h('span',{},'PERÍODO'),h('span',{class:'rpt-select-periodo'},icone('calendario'),select)),
    h('div',{class:'rpt-datas'},h('label',{},h('span',{},'DE'),de),h('span',{'aria-hidden':'true'},'→'),h('label',{},h('span',{},'ATÉ'),ate)),
    h('button',{type:'submit',class:'botao rpt-aplicar'},'Aplicar período')),
    h('div',{class:'rpt-contexto'},h('span',{},icone('historico'),`Comparado a ${formatarData(p.anterior_de)} – ${formatarData(p.anterior_ate)}`),h('p',{class:'rpt-filtro-erro',role:'alert',hidden:true})));
}

function grafico(d,acoes) {
  if(!d.atual.orcamentos&&!d.atual.aprovados) return painel('rpt-evolucao',titulo('Evolução comercial','Valores orçados e aprovados no período.'),semDados('tendencia','Nenhuma movimentação neste período','Escolha outro intervalo para consultar os resultados da sua marcenaria.'));
  let modo='ambos';
  const serie=d.serie,maior=Math.max(10000,...serie.flatMap(m=>[m.orcado_cents,m.aprovado_cents]));
  const ordem=10**Math.floor(Math.log10(maior)),max=Math.ceil(maior/ordem)*ordem;
  const colunas=h('div',{class:'rpt-chart-colunas'});
  const leitura=h('div',{class:'rpt-chart-leitura','aria-live':'polite'});
  const legenda=h('div',{class:'rpt-legenda'},h('span',{},h('i',{class:'rpt-amostra-orcado'}),'Orçado pela emissão'),h('span',{},h('i',{class:'rpt-amostra-aprovado'}),'Aprovado pelo aceite'));
  const mostrar=(m)=>substituir(leitura,h('span',{},mesNome(m.mes)),h('span',{},h('i',{class:'rpt-amostra-orcado'}),'Orçado ',h('strong',{},moeda(m.orcado_cents))),h('span',{},h('i',{class:'rpt-amostra-aprovado'}),'Aprovado ',h('strong',{},moeda(m.aprovado_cents))));
  const select=h('select',{'aria-label':'Valores exibidos no gráfico',onchange:e=>{modo=e.target.value;plot.dataset.modo=modo;plot.closest('.rpt-evolucao').dataset.modo=modo;}},h('option',{value:'ambos'},'Orçado e aprovado'),h('option',{value:'aprovado'},'Somente aprovado'),h('option',{value:'orcado'},'Somente orçado'));
  serie.forEach((m,i)=>{
    const orcado=h('span',{class:'rpt-chart-barra rpt-chart-orcado'}),aprovado=h('span',{class:'rpt-chart-barra rpt-chart-aprovado'});
    orcado.style.height=`${m.orcado_cents/max*100}%`;aprovado.style.height=`${m.aprovado_cents/max*100}%`;
    const b=h('button',{type:'button',class:'rpt-mes','data-mes':m.mes,'aria-pressed':'false',title:`${mesNome(m.mes)} — ${moeda(m.orcado_cents)} orçados, ${moeda(m.aprovado_cents)} aprovados`,'aria-label':`${mesNome(m.mes)}: ${moeda(m.orcado_cents)} orçados e ${moeda(m.aprovado_cents)} aprovados. Filtrar aprovações deste mês.`,onmouseenter:()=>mostrar(m),onfocus:()=>mostrar(m),onclick:()=>acoes.aoMes(m.mes),onkeydown:e=>{
      if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();colunas.children[(i+(e.key==='ArrowRight'?1:-1)+serie.length)%serie.length].focus();
    }},h('span',{class:'rpt-chart-barras','aria-hidden':'true'},orcado,aprovado),h('span',{class:'rpt-chart-mes'},mesNome(m.mes)));
    colunas.append(b);
  });
  const plot=h('div',{class:'rpt-chart-plot','data-modo':modo},h('div',{class:'rpt-chart-grade','aria-hidden':'true'},[1,.75,.5,.25,0].map(()=>h('span',{}))),colunas);
  plot.style.setProperty('--rpt-meses',serie.length);
  mostrar(serie.at(-1));
  return painel('rpt-evolucao',titulo('Evolução comercial','Compare o valor orçado com as aprovações de cada mês.',select),legenda,
    h('div',{class:'rpt-chart'},h('div',{class:'rpt-chart-eixo','aria-hidden':'true'},[1,.75,.5,.25,0].map(n=>h('span',{},compacto(max*n)))),h('div',{class:'rpt-chart-scroll',tabindex:'0','aria-label':'Gráfico mensal. Selecione um mês para filtrar as aprovações.'},plot)),leitura,
    h('p',{class:'rpt-ajuda-grafico'},icone('olho'),'Selecione um mês para consultar suas aprovações.'));
}
function clientes(d) {
  const maior=Math.max(1,...d.clientes.map(c=>c.valor_cents));
  const linhas=d.clientes.map((c,i)=>{
    const progresso=h('span',{class:'rpt-ranking-barra'});
    progresso.style.width=`${c.valor_cents/maior*100}%`;
    return h('li',{},h('a',{href:`#/clientes/${c.id}`},
      h('span',{class:'rpt-rank-posicao'},String(i+1).padStart(2,'0')),
      h('span',{class:'rpt-avatar'},iniciais(c.nome)),
      h('div',{class:'rpt-ranking-dados'},
        h('div',{},h('strong',{title:c.nome},c.nome),h('b',{},moeda(c.valor_cents))),
        h('div',{class:'rpt-ranking-pista'},progresso),
        h('small',{},`${total(c.aprovados,'aprovação','aprovações')} · ${numero(d.atual.aprovado_cents?c.valor_cents/d.atual.aprovado_cents*100:0)}% do aprovado`))));
  });
  return painel('rpt-clientes',titulo('Clientes em destaque','Maior valor aprovado no período.'),
    linhas.length?h('ol',{class:'rpt-ranking'},linhas):semDados('clientes','Seus melhores clientes aparecerão aqui','As primeiras aprovações do período formam este ranking.'));
}
function oportunidades(d) {
  const melhor=d.serie.reduce((a,m)=>m.aprovado_cents>a.aprovado_cents?m:a,d.serie[0]);
  return h('div',{class:'rpt-leituras'},
    h('a',{href:`#/propostas?status=abertos&de=${d.periodo.de}&ate=${d.periodo.ate}`,class:'rpt-leitura'},h('span',{class:'rpt-icone'},icone('enviar')),h('div',{},h('span',{},'Oportunidades em aberto'),h('strong',{},moeda(d.atual.pendente_cents)),h('small',{},`${total(d.atual.pendentes,'proposta enviada ou em negociação','propostas enviadas ou em negociação')}`)),icone('seta')),
    h('div',{class:'rpt-leitura'},h('span',{class:'rpt-icone'},icone('tendencia')),h('div',{},h('span',{},'Melhor mês em aprovações'),h('strong',{},melhor.aprovado_cents?mesNome(melhor.mes):'—'),h('small',{},melhor.aprovado_cents?`${moeda(melhor.aprovado_cents)} em ${total(melhor.aprovados,'proposta','propostas')}`:'Aguardando a primeira aprovação'))),
    h('div',{class:'rpt-leitura'},h('span',{class:'rpt-icone'},icone('clientes')),h('div',{},h('span',{},'Clientes com aprovações'),h('strong',{},d.atual.clientes_aprovados),h('small',{},'Clientes únicos neste período'))));
}
function resumoMensal(d,acoes) {
  const tabela=h('table',{class:'rpt-tabela rpt-tabela-mensal'},h('thead',{},h('tr',{},['Mês','Orçamentos','Valor orçado','Aprovações','Valor aprovado','Ticket aprovado'].map(t=>h('th',{scope:'col'},t)))),h('tbody',{},d.serie.toReversed().map(m=>h('tr',{},h('th',{scope:'row'},h('button',{type:'button','data-mes':m.mes,'aria-pressed':'false',onclick:()=>acoes.aoMes(m.mes)},mesNome(m.mes))),h('td',{},m.orcamentos),h('td',{},moeda(m.orcado_cents)),h('td',{},m.aprovados),h('td',{},moeda(m.aprovado_cents)),h('td',{},moeda(m.ticket_cents))))),h('tfoot',{},h('tr',{},h('th',{scope:'row'},'Total do período'),h('td',{},d.atual.orcamentos),h('td',{},moeda(d.atual.orcado_cents)),h('td',{},d.atual.aprovados),h('td',{},moeda(d.atual.aprovado_cents)),h('td',{},moeda(d.atual.ticket_cents)))));
  return h('details',{class:'rpt-painel rpt-mensal'},h('summary',{},icone('orcamentos'),h('span',{},'Resumo mês a mês',h('small',{},`${d.serie.length} ${d.serie.length===1?'mês':'meses'} · valores e quantidades`)),icone('baixo')),h('div',{class:'rpt-tabela-scroll',tabindex:'0','aria-label':'Resumo mensal'},tabela));
}
export function desenharAprovacoes(d,acoes) {
  const primeira=d.quantidade?d.deslocamento+1:0,ultima=Math.min(d.deslocamento+d.linhas.length,d.quantidade);
  const tabela=d.linhas.length?h('div',{class:'rpt-tabela-scroll rpt-detalhe-tabela',tabindex:'0','aria-label':'Orçamentos aprovados'},h('table',{class:'rpt-tabela rpt-tabela-aprovacoes'},
    h('thead',{},h('tr',{},['Orçamento / cliente','Ambientes','Emissão','Aprovação','Aceite','Valor aprovado',''].map(t=>h('th',{scope:'col'},t||h('span',{class:'sr-only'},'Abrir orçamento'))))),
    h('tbody',{},d.linhas.map(o=>h('tr',{},
      h('td',{},h('a',{class:'rpt-orcamento',href:`#/orcamentos/${o.id}`},h('span',{class:'rpt-avatar'},iniciais(o.cliente_nome)),h('span',{},h('strong',{},o.cliente_nome),h('small',{},`Nº ${formatarNumero(o.numero)}`)))),
      h('td',{},h('span',{class:'rpt-ambientes',title:o.ambientes||'Sem ambiente'},o.ambientes||'Sem ambiente')),
      h('td',{},formatarData(o.data)),h('td',{},h('strong',{},formatarData(o.aprovado_dia))),h('td',{},h('span',{class:'rpt-origem'},icone(o.aprovado_pelo_link?'link':'usuario'),o.aprovado_pelo_link?'Cliente':'Manual')),
      h('td',{class:'rpt-valor'},moeda(o.total_cents)),h('td',{},h('a',{class:'rpt-abrir',href:`#/orcamentos/${o.id}`,'aria-label':`Abrir orçamento ${formatarNumero(o.numero)} de ${o.cliente_nome}`},icone('seta')))))))):
    semDados('orcamentos','Nenhuma aprovação encontrada','Tente outro período ou limpe a busca. As propostas aprovadas por você e pelo cliente aparecem aqui.');
  const cartoes=d.linhas.length?h('div',{class:'rpt-aprovacoes-cards'},d.linhas.map(o=>h('article',{class:'rpt-aprovacao-card'},
    h('div',{class:'rpt-card-topo'},h('span',{},`Nº ${formatarNumero(o.numero)}`),h('span',{class:'rpt-origem'},icone(o.aprovado_pelo_link?'link':'usuario'),o.aprovado_pelo_link?'Aceite do cliente':'Aceite manual')),
    h('div',{class:'rpt-card-cliente'},h('span',{class:'rpt-avatar'},iniciais(o.cliente_nome)),h('div',{},h('strong',{},o.cliente_nome),h('span',{},o.ambientes||'Sem ambiente'))),
    h('div',{class:'rpt-card-datas'},h('div',{},h('span',{},'Emissão'),h('strong',{},formatarData(o.data))),h('div',{},h('span',{},'Aprovado em'),h('strong',{},formatarData(o.aprovado_dia)))),
    h('div',{class:'rpt-card-rodape'},h('strong',{},moeda(o.total_cents)),h('a',{href:`#/orcamentos/${o.id}`},'Ver orçamento',icone('seta')))))):null;
  return h('div',{},h('div',{class:'rpt-detalhe-resumo',role:'status'},h('span',{},total(d.quantidade,'aprovação','aprovações')),h('span',{},'Total filtrado ',h('strong',{},moeda(d.valor_cents)))),tabela,cartoes,
    d.quantidade?h('div',{class:'rpt-paginacao'},h('span',{},`${primeira}–${ultima} de ${d.quantidade}`),h('div',{},h('button',{type:'button',class:'botao',disabled:d.deslocamento===0,onclick:()=>acoes.aoPagina(Math.max(0,d.deslocamento-d.limite))},icone('voltar'),'Anterior'),h('button',{type:'button',class:'botao',disabled:ultima>=d.quantidade,onclick:()=>acoes.aoPagina(d.deslocamento+d.limite)},'Próxima',icone('seta')))):null);
}
export function desenharRelatorio(d,acoes) {
  const a=d.atual,b=d.anterior,p=d.periodo;
  const busca=h('input',{type:'search',placeholder:'Buscar cliente ou nº do orçamento','aria-label':'Buscar aprovações por cliente ou número',oninput:e=>acoes.aoBuscar(e.target.value)});
  return h('div',{class:'pagina pagina-relatorios'},
    h('header',{class:'rpt-cabecalho'},h('div',{},h('span',{class:'rpt-eyebrow'},'VISÃO DE RESULTADOS'),h('h1',{},'Relatórios comerciais'),h('p',{},'Entenda seus resultados e encontre as próximas oportunidades.')),acoes.exportar),
    filtros(d,acoes),
    h('div',{class:'rpt-metricas'},metrica('orcamentos','Valor orçado',moeda(a.orcado_cents),`${total(a.orcamentos,'orçamento emitido','orçamentos emitidos')} · inclui rascunhos`,comparacao(a.orcado_cents,b.orcado_cents,p)),
      metrica('aprovado','Valor aprovado',moeda(a.aprovado_cents),`${total(a.aprovados,'proposta aceita','propostas aceitas')} no período`,comparacao(a.aprovado_cents,b.aprovado_cents,p),'rpt-destaque'),
      metrica('grafico','Taxa de aprovação',a.taxa===null?'—':`${numero(a.taxa)}%`,`${a.coorte_aprovados} de ${total(a.apresentadas,'proposta apresentada','propostas apresentadas')}`,comparacao(a.taxa,b.taxa,p,true)),
      metrica('moedas','Ticket médio aprovado',moeda(a.ticket_cents),'Valor médio por proposta aprovada',comparacao(a.ticket_cents,b.ticket_cents,p))),
    h('div',{class:'rpt-visao'},grafico(d,acoes),clientes(d)),oportunidades(d),
    painel('rpt-aprovacoes',titulo('Aprovações do período','Os orçamentos que compõem o valor aprovado.',h('div',{class:'rpt-busca'},icone('busca'),busca)),h('div',{class:'rpt-filtro-mes',hidden:true}),h('p',{class:'rpt-detalhe-erro',role:'alert',hidden:true}),h('div',{class:'rpt-detalhe-corpo'},desenharAprovacoes(d.aprovacoes,acoes))),
    resumoMensal(d,acoes),
    h('footer',{class:'rpt-metodologia'},h('strong',{},icone('olho'),'Como ler este relatório'),h('p',{},'Orçado considera a emissão e exclui cancelados. Aprovado considera a data do aceite, inclusive de orçamentos antigos. A taxa de aprovação acompanha as propostas apresentadas emitidas no período; rascunhos e cancelados ficam fora da taxa. Os valores aprovados representam propostas aceitas, não recebimentos.')));
}

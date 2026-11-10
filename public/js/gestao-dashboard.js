import { h, icone, substituir, haQuanto, abrirModal, campo, aviso } from './ui.js';
import { formatarDinheiro, formatarData, formatarNumero, STATUS, lerDinheiro, dinheiroParaCampo } from '/shared/calc.js';
import { api } from './api.js';
import { selo, menuOrcamento } from './comum.js';

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_LONGOS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const CORES = ['#95612f','#c89454','#76ad91','#aa8abd','#b8b3aa'];
const moeda = (v) => formatarDinheiro(v || 0);
const compacto = (v) => new Intl.NumberFormat('pt-BR', { style:'currency',currency:'BRL',notation:'compact',maximumFractionDigits:0 }).format(v / 100);
const numero = (v) => v.toLocaleString('pt-BR',{maximumFractionDigits:1});
const taxa = (c) => c.enviados ? c.aprovados / c.enviados * 100 : null;
let desenho = 0;
const svg = (tag, attrs, ...filhos) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,String(v));
  el.append(...filhos.flat()); return el;
};
const link = (texto,href) => h('a',{class:'pc-link',href},texto,' →');
const titulo = (nome,ic,extra) => h('header',{class:'pc-titulo'},h('h2',{},icone(ic),nome),extra);
const painel = (classe,nome,ic,extra,...filhos) => h('section',{class:`pc-painel ${classe}`},titulo(nome,ic,extra),...filhos);
const vazio = (texto) => h('p',{class:'pc-vazio'},texto);
const iconeFundo = (nome,classe='') => h('span',{class:`pc-icone ${classe}`},icone(nome));

function variacao(atual,anterior,rotulo='em relação ao período anterior',pontos=false) {
  if (atual === null || anterior === null || (!pontos && !anterior)) return h('span',{class:'pc-comparacao pc-neutra'},atual === null ? 'Envie propostas para acompanhar' : 'Sem base no período anterior');
  const v = pontos ? atual-anterior : (atual-anterior)/anterior*100;
  return h('span',{class:`pc-comparacao${v < 0 ? ' pc-queda' : ''}`},h('b',{},`${v < 0 ? '▼' : '▲'} ${v > 0 ? '+' : ''}${numero(v)}${pontos ? ' p.p.' : '%'}`),' ',rotulo);
}
function atencao(c) {
  const linhas = [
    ['visualizadas','olho','Propostas visualizadas\nsem resposta','pc-perigo'],
    ['vencimentos','relogio','Propostas próximas\ndo vencimento','pc-aviso'],
    ['aprovados','check','Orçamentos aprovados\nrecentemente','pc-sucesso'],
    ['sem_resposta','enviar','Enviados sem resposta\n(há mais de 5 dias)',''],
  ];
  return painel('pc-atencao','Precisa de atenção','alerta',null,h('div',{class:'pc-atencao-lista'},linhas.map(([tipo,ic,nome,cor]) => h('a',{href:`#/orcamentos?atencao=${tipo}`,title:tipo==='aprovados'?'Aprovados nos últimos 7 dias':nome.replace('\n',' ')},iconeFundo(ic,cor),h('span',{},nome),h('b',{class:`pc-contagem ${cor}`},c.atencao[tipo]),icone('seta')))));
}

function evolucao(c,metrica,aoMudar) {
  const serie = c.serie;
  const campo = metrica==='aprovado'?'aprovados_cents':'orcado_cents';
  const maior = Math.max(...serie.map(m=>m[campo]),10000);
  const ordem = 10 ** Math.floor(Math.log10(maior));
  const max = Math.ceil(maior / ordem) * ordem;
  const pontos = serie.map((m,i)=>[i*100/5,100-m[campo]/max*90]);
  const caminho = pontos.reduce((d,[x,y],i)=> i ? `${d} C${(pontos[i-1][0]+x)/2},${pontos[i-1][1]} ${(pontos[i-1][0]+x)/2},${y} ${x},${y}` : `M${x},${y}`,'');
  const id = `pc-area-${++desenho}`;
  const plot = h('div',{class:'pc-linha-plot'});
  const tooltip = h('output',{class:'pc-chart-tooltip','aria-live':'polite'});
  const pontosEl = h('div',{class:'pc-pontos'});
  const mostrar = (i) => {
    tooltip.textContent=moeda(serie[i][campo]);
    tooltip.style.left=`${Math.min(78,Math.max(22,pontos[i][0]))}%`;
    tooltip.style.top=`${Math.max(0,pontos[i][1]-17)}%`;
    pontosEl.querySelectorAll('button').forEach((b,n)=>b.setAttribute('aria-pressed',String(i===n)));
  };
  pontos.forEach(([x,y],i)=>{
    const m=serie[i],mes=`${MESES[Number(m.mes.slice(5))-1]}/${m.mes.slice(0,4)}`;
    const b=h('button',{type:'button',class:'pc-ponto','aria-label':`${mes}: ${moeda(m[campo])}`,'aria-pressed':'false',title:`${mes}: ${moeda(m[campo])}`,onclick:()=>mostrar(i),onfocus:()=>mostrar(i),onmouseenter:()=>mostrar(i),onkeydown:(e)=>{
      if (!['ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault(); pontosEl.children[(i+(e.key==='ArrowRight'?1:-1)+6)%6].focus();
    }}); b.style.left=`${x}%`;b.style.top=`${y}%`;pontosEl.append(b);
  });
  plot.append(svg('svg',{viewBox:'0 0 100 100',preserveAspectRatio:'none','aria-hidden':'true'},
    svg('defs',{},svg('linearGradient',{id,x1:'0',y1:'0',x2:'0',y2:'1'},svg('stop',{offset:'0%','stop-color':'#ba884b','stop-opacity':'.38'}),svg('stop',{offset:'100%','stop-color':'#ba884b','stop-opacity':'.03'}))),
    [10,28,46,64,82,100].map(y=>svg('line',{x1:0,x2:100,y1:y,y2:y,class:'pc-grade','vector-effect':'non-scaling-stroke'})),
    svg('path',{d:`${caminho} L100,100 L0,100 Z`,fill:`url(#${id})`}),
    svg('path',{d:caminho,fill:'none',stroke:'var(--pc-acento)','stroke-width':2.3,'vector-effect':'non-scaling-stroke'})),pontosEl,tooltip);
  mostrar(5);
  const select=h('select',{'aria-label':'Valor exibido no gráfico',onchange:e=>aoMudar(e.target.value)},h('option',{value:'orcado',selected:metrica==='orcado'},'Valor orçado'),h('option',{value:'aprovado',selected:metrica==='aprovado'},'Valor aprovado'));
  return painel('pc-evolucao',metrica==='aprovado'?'Evolução do valor aprovado':'Evolução do valor orçado','tendencia',select,
    h('div',{class:'pc-linha-area'},h('div',{class:'pc-eixo-y','aria-hidden':'true'},[1,.8,.6,.4,.2,0].map(n=>h('span',{},compacto(max*n)))),h('div',{class:'pc-linha-conteudo'},plot,h('div',{class:'pc-eixo-x','aria-hidden':'true'},serie.map(m=>h('span',{},`${MESES[Number(m.mes.slice(5))-1]}/${m.mes.slice(2,4)}`))))));
}

function barras(situacoes) {
  const estados=['rascunho','enviado','negociacao','aprovado','recusado','expirado'];
  const nomes=['Rascunho','Enviado','Em negociação','Aprovado','Recusado','Expirado'];
  const maior=Math.max(5,...situacoes.filter(s=>estados.includes(s.status)).map(s=>s.quantidade));
  const max=Math.ceil(maior/5)*5;
  const cancelados=situacoes.find(s=>s.status==='cancelado').quantidade;
  return painel('pc-status','Orçamentos por status','grafico',null,
    h('div',{class:'pc-barras-area'},h('div',{class:'pc-barras-eixo','aria-hidden':'true'},[1,.8,.6,.4,.2,0].map(n=>h('span',{},Math.round(max*n)))),
      h('div',{class:'pc-barras'},estados.map((status,i)=>{
        const s=situacoes.find(s=>s.status===status),barra=h('span',{class:`pc-barra pc-barra-${status}`});
        barra.style.height=`${s.quantidade/max*100}%`;
        const quantidade=h('b',{},s.quantidade);quantidade.style.bottom=`calc(${s.quantidade/max*100}% + 3px)`;
        return h('a',{href:`#/orcamentos?status=${status}`,'aria-label':`${STATUS[status]}: ${s.quantidade} orçamentos`,title:`${STATUS[status]}: ${s.quantidade}`},h('div',{class:'pc-barra-pista'},barra,quantidade),h('small',{},nomes[i]));
      }))),cancelados ? h('a',{href:'#/orcamentos?status=cancelado',class:'pc-cancelados'},`${cancelados} ${cancelados===1?'cancelado':'cancelados'}`):null);
}

function distribuicao(ambientes) {
  const nomes=['Cozinha','Quarto','Sala','Banheiro','Outros'];
  const dados=nomes.map((nome,i)=>({nome,n:ambientes.find(a=>a.nome===nome)?.quantidade||0,cor:CORES[i]}));
  const total=dados.reduce((n,d)=>n+d.n,0),circ=2*Math.PI*51;
  let acumulado=0;
  const arcos=dados.map(d=>{
    const arco=svg('circle',{cx:66,cy:66,r:51,fill:'none',stroke:d.cor,'stroke-width':21,'stroke-dasharray':`${total?d.n/total*circ:0} ${circ}`,'stroke-dashoffset':-acumulado,transform:'rotate(-90 66 66)'});
    acumulado+=total?d.n/total*circ:0; return arco;
  });
  return painel('pc-distribuicao','Distribuição por ambiente','caixa',null,
    h('div',{class:'pc-distribuicao-conteudo',title:'Cada orçamento é classificado pelo primeiro ambiente; cancelados não entram na distribuição.'},
      h('div',{class:'pc-donut'},svg('svg',{viewBox:'0 0 132 132','aria-hidden':'true'},svg('circle',{cx:66,cy:66,r:51,fill:'none',stroke:'var(--pc-grade)','stroke-width':21}),arcos),h('div',{},h('strong',{},total),h('span',{},'orçamentos'))),
      h('ul',{class:'pc-legenda'},dados.map(d=>{const ponto=h('i',{'aria-hidden':'true'});ponto.style.background=d.cor;return h('li',{},ponto,h('span',{},d.nome),h('b',{},`${numero(total?d.n/total*100:0)}%`));}))));
}
function descreverAtividade(a) {
  const e=a.evento;
  if (/Cliente cadastrado/i.test(e)) return ['usuarioMais','Cliente cadastrado',a.cliente_nome,''];
  if (/Cliente abriu/i.test(e)) return ['olho','Cliente abriu a proposta',`${a.cliente_nome} · ${a.ambiente_nome||'Proposta'}`,''];
  if (/aprovad/i.test(e) && !/→.*(?:rascunho|enviado|negocia|recus|cancel|expir)/i.test(e)) return ['check','Proposta aprovada',`${a.cliente_nome} · ${a.ambiente_nome||'Proposta'}`,'pc-sucesso'];
  if (/duplicad/i.test(e)) return ['copiar','Orçamento duplicado',`${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`,''];
  if (/enviad/i.test(e)) return ['enviar',`Proposta enviada para ${a.cliente_nome}`,`${a.ambiente_nome||'Proposta'} · Nº ${formatarNumero(a.numero)}`,''];
  return ['historico',e.startsWith('Status:')?`Orçamento ${e.split('→').at(-1).trim().toLocaleLowerCase('pt-BR')}`:e,`${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`,''];
}
function atividades(linhas) {
  return painel('pc-atividades','Atividades recentes','atividade',link('Ver todas','#/avisos'),linhas.length ? h('div',{class:'pc-feed'},linhas.map(a=>{
    const [ic,titulo,detalhe,classe]=descreverAtividade(a);
    return h('a',{href:a.orcamento_id?`#/orcamentos/${a.orcamento_id}`:`#/clientes/${a.contato_id}`,class:'pc-feed-linha',title:`${titulo} · ${detalhe}`},iconeFundo(ic,classe),h('span',{class:'pc-feed-texto'},h('strong',{},titulo),h('small',{},detalhe)),h('time',{datetime:a.data_hora,title:new Date(a.data_hora).toLocaleString('pt-BR')},haQuanto(a.data_hora)));
  })):vazio('As movimentações da sua marcenaria aparecerão aqui.'));
}
function recentes(linhas,aoAtualizar) {
  const linhasTabela=linhas.slice(0,5).map(o=>h('tr',{},
    h('td',{},h('a',{href:`#/orcamentos/${o.id}`},`#${formatarNumero(o.numero)}`)),
    h('td',{},h('a',{href:`#/clientes/${o.cliente_id}`,title:o.cliente_nome},o.cliente_nome)),
    h('td',{},h('a',{href:`#/orcamentos/${o.id}`,title:o.ambiente_nome||'Sem ambiente'},icone('ambiente'),h('span',{},o.ambiente_nome||'Sem ambiente'))),
    h('td',{},selo(o.status)),h('td',{class:'pc-valor'},moeda(o.total_cents)),
    h('td',{},formatarData(o.data)),h('td',{},menuOrcamento(o,aoAtualizar))));
  const tabela=h('div',{class:'pc-tabela-scroll'},h('table',{class:'pc-tabela'},
    h('thead',{},h('tr',{},['Nº','Cliente','Ambiente / Projeto','Status','Valor','Data',''].map(t=>h('th',{scope:'col'},t||h('span',{class:'sr-only'},'Ações'))))),
    h('tbody',{},linhasTabela)));
  return painel('pc-recentes','Orçamentos recentes','orcamentos',link('Ver todas','#/orcamentos'),linhas.length ? tabela : vazio('Crie seu primeiro orçamento para acompanhar as propostas.'));
}
function agenda(linhas,hoje) {
  return painel('pc-agenda','Próximos vencimentos','calendario',link('Ver agenda','#/orcamentos?atencao=vencimentos'),linhas.length ? h('div',{class:'pc-vencimentos'},linhas.slice(0,3).map(v=>{
    const dias=Math.round((Date.parse(`${v.data_validade}T12:00Z`)-Date.parse(`${hoje}T12:00Z`))/86400000);
    return h('a',{class:'pc-vencimento',href:`#/orcamentos/${v.id}`},iconeFundo('ambiente'),h('span',{class:'pc-vencimento-texto'},h('strong',{},`Proposta #${formatarNumero(v.numero)}`,v.ambiente_nome?` – ${v.ambiente_nome}`:''),h('small',{},`Cliente: ${v.cliente_nome}`)),h('span',{class:`pc-prazo ${dias===0?'pc-perigo':dias===1?'pc-aviso':''}`,title:formatarData(v.data_validade)},dias===0?'Vence hoje':dias===1?'Amanhã':`${v.data_validade.slice(8)} ${MESES[Number(v.data_validade.slice(5,7))-1]}`));
  })):vazio('Nenhuma proposta em aberto com vencimento futuro.'));
}

// Abertura do painel: como vai o período, em uma frase. O valor aprovado leva à lista das aprovações.
function abertura(d, c, periodo, filtro) {
  const hoje = new Date(`${d.data_hoje}T12:00:00`);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = document.querySelector('.gestao-conta strong, .lateral-usuario strong')?.textContent.trim().split(/\s+/)[0];
  const mes = MESES_LONGOS[Number(c.periodo.inicio.slice(5, 7)) - 1];
  const mesMaiusculo = mes.charAt(0).toLocaleUpperCase('pt-BR') + mes.slice(1);
  const inicio = periodo === 'mes' ? `${mesMaiusculo} vai em ` : periodo === 'anterior' ? `${mesMaiusculo} fechou em ` : `Os últimos ${c.periodo.meses} meses somam `;
  const m = c.meta, aprovado = c.atual.aprovados_cents, falta = m.valor_cents - aprovado;
  const pct = m.valor_cents ? Math.round((aprovado / m.valor_cents) * 100) : null;
  const complemento = pct === null ? 'Defina a meta do mês para acompanhar o ritmo.'
    : falta <= 0 ? `Meta batida, com ${moeda(-falta)} a mais.`
    : m.dias_restantes > 0 ? `Faltam ${moeda(falta)} e ainda há ${m.dias_restantes} ${m.dias_restantes === 1 ? 'dia' : 'dias'}.`
    : `Faltaram ${moeda(falta)} para a meta.`;
  return h('header', { class: 'pc-cabecalho pc-abertura' },
    h('div', { class: 'pc-abertura-texto' },
      h('p', { class: 'pc-sobre' }, `${DIAS[hoje.getDay()]}, ${hoje.getDate()} de ${MESES_LONGOS[hoje.getMonth()]}`),
      h('h1', { class: 'pc-frase' }, inicio, h('a', { href: `#/orcamentos?status=aprovado&aprovados_periodo=${periodo}` }, h('em', {}, moeda(aprovado))), pct === null ? ' aprovados. ' : ` aprovados, ${pct}% da meta. `, h('small', {}, complemento)),
      h('p', { class: 'pc-saudacao' }, `${saudacao}${nome ? `, ${nome}` : ''}. `,
        c.pendentes ? h('a', { href: '#/propostas?status=abertos' }, `${c.pendentes} ${c.pendentes === 1 ? 'proposta aguarda' : 'propostas aguardam'} resposta`) : 'Nenhuma proposta aguardando resposta', '.')),
    filtro);
}

// Números de apoio da frase de abertura, numa faixa só. Cada um leva à lista correspondente.
const apoio = (itens) => h('div', { class: 'pc-apoio' }, itens.map(([nome, valor, detalhe, href]) =>
  h('a', { class: 'pc-apoio-item', href }, h('span', { class: 'pc-apoio-rotulo' }, nome), h('strong', {}, valor), detalhe)));

function definirMeta(atualCents, aoAtualizar) {
  abrirModal('Meta de vendas', (fechar) => {
    const entrada = h('input', { type: 'text', inputmode: 'decimal', value: atualCents ? dinheiroParaCampo(atualCents) : '', placeholder: 'Ex.: 90.000,00', autocomplete: 'off', autofocus: true });
    const erro = h('p', { class: 'aviso-caixa aviso-atencao', role: 'alert', hidden: true });
    const salvar = async (cents) => {
      try {
        await api.put('/empresa/meta', { meta_mensal_cents: cents });
        fechar(true);
        aviso(cents ? 'Meta atualizada.' : 'Meta removida.');
        aoAtualizar();
      } catch (falha) {
        erro.textContent = falha.message || 'Não foi possível salvar a meta.';
        erro.hidden = false;
      }
    };
    return h('form', {
      class: 'formulario',
      onsubmit: (e) => {
        e.preventDefault();
        const cents = lerDinheiro(entrada.value);
        if (cents === null || cents <= 0) { erro.textContent = 'Digite o valor que você quer aprovar por mês.'; erro.hidden = false; return; }
        salvar(cents);
      },
    },
      campo('Valor aprovado por mês (R$)', entrada, { dica: 'O painel compara o que foi aprovado com esta meta. Em períodos de 3 ou 6 meses, ele soma as metas mensais.' }),
      erro,
      atualCents ? h('button', { type: 'button', class: 'link-botao incluso-remover', onclick: () => salvar(0) }, 'Remover a meta') : null,
      h('div', { class: 'acoes-modal' }, h('button', { type: 'button', class: 'botao', onclick: () => fechar(undefined) }, 'Cancelar'), h('button', { type: 'submit', class: 'botao botao-primario' }, 'Salvar meta')));
  });
}

// A meta é uma régua: a parte cheia é o que já foi aprovado e o tracejado é onde o período deveria estar hoje.
function metaPeriodo(c, periodo, aoAtualizar) {
  const m = c.meta;
  const ajustar = h('button', { type: 'button', class: 'pc-meta-ajustar', onclick: () => definirMeta(m.mensal_cents, aoAtualizar) }, icone('editar'), m.mensal_cents ? 'Ajustar meta' : 'Definir meta');
  if (!m.valor_cents) {
    return h('section', { class: 'pc-painel pc-meta pc-meta-vazia' },
      h('div', {}, h('h2', {}, 'Meta do mês'), h('p', {}, 'Defina quanto você quer aprovar por mês. O painel passa a mostrar quanto falta e se o ritmo está bom.')), ajustar);
  }
  const pct = Math.round((m.aprovados_cents / m.valor_cents) * 100), cheio = Math.min(100, pct), diferenca = pct - m.ritmo;
  const em = (el, propriedade, valor) => { el.style[propriedade] = `${valor}%`; return el; };
  const nomeMeta = c.periodo.meses === 1 ? `Meta de ${MESES_LONGOS[Number(c.periodo.inicio.slice(5, 7)) - 1]}` : `Meta dos últimos ${c.periodo.meses} meses`;
  const nota = periodo === 'anterior'
    ? h('p', { class: 'pc-regua-nota' }, pct >= 100 ? 'O mês fechou com a meta batida.' : `O mês fechou ${100 - pct} ${100 - pct === 1 ? 'ponto' : 'pontos'} abaixo da meta.`)
    : h('p', { class: 'pc-regua-nota' }, h('i', { 'aria-hidden': 'true' }), `Ritmo ideal para hoje: ${m.ritmo}%. Você está `, h('b', {}, `${Math.abs(diferenca)} ${Math.abs(diferenca) === 1 ? 'ponto' : 'pontos'} ${diferenca >= 0 ? 'à frente' : 'atrás'}`), '.');
  return h('section', { class: 'pc-painel pc-meta' },
    h('div', {}, h('h2', {}, nomeMeta), h('div', { class: 'pc-meta-numero' }, h('strong', {}, `${pct}%`), h('span', {}, `${moeda(m.aprovados_cents)} de ${moeda(m.valor_cents)}`)), ajustar),
    h('div', { class: 'pc-regua', role: 'img', 'aria-label': `${pct}% da meta atingida${periodo === 'anterior' ? '' : `; o ritmo ideal para hoje é ${m.ritmo}%`}` },
      h('div', { class: 'pc-regua-fita' }, em(h('span', { class: 'pc-regua-cheio' }), 'width', cheio), periodo === 'anterior' ? null : em(h('i', { class: 'pc-regua-ritmo' }), 'left', m.ritmo), em(h('i', { class: 'pc-regua-ponteiro' }), 'left', cheio)),
      h('div', { class: 'pc-regua-marcas' }),
      h('div', { class: 'pc-regua-numeros' }, h('span', {}, 'R$ 0'), h('span', {}, compacto(m.valor_cents / 2)), h('span', {}, compacto(m.valor_cents))),
      nota));
}

export function desenharDashboard(d,{periodo,metrica,aoMudarPeriodo,aoMudarMetrica,aoAtualizar}) {
  const c=d.comercial,p=c.periodo;
  const taxaAtual=taxa(c.conversao),taxaAnterior=taxa(c.conversao_anterior);
  const mesUnico=p.meses===1;
  const periodoTexto=periodo==='mes'?'no mês':periodo==='anterior'?'no mês anterior':'no período';
  const comparacao=mesUnico?'em relação ao mês anterior':'em relação ao período anterior';
  const fimMes=new Date(Number(d.data_hoje.slice(0,4)),Number(d.data_hoje.slice(5,7)),0).getDate();
  const opcoes=[['mes',`Este mês (1 – ${fimMes} ${MESES[Number(d.data_hoje.slice(5,7))-1]} ${d.data_hoje.slice(0,4)})`],['anterior','Mês anterior'],['trimestre','Últimos 3 meses'],['semestre','Últimos 6 meses']];
  const filtro=h('label',{class:'pc-periodo'},icone('calendario'),h('select',{'aria-label':'Período dos indicadores',onchange:e=>aoMudarPeriodo(e.target.value)},opcoes.map(([v,t])=>h('option',{value:v,selected:periodo===v},t))));
  const deAte=`de=${p.inicio}&ate=${p.ate}`;
  return h('div',{class:'pagina painel-comercial'},
    abertura(d,c,periodo,filtro),
    apoio([
      [`Valor orçado ${periodoTexto}`,moeda(c.atual.valor_cents),variacao(c.atual.valor_cents,c.anterior.valor_cents,comparacao),`#/propostas?status=apresentados&${deAte}`],
      ['Taxa de aprovação (90 dias)',taxaAtual===null?'—':`${numero(taxaAtual)}%`,variacao(taxaAtual,taxaAnterior,'em relação ao período anterior',true),'#/orcamentos?status=aprovado'],
      ['Propostas pendentes',String(c.pendentes),h('span',{class:`pc-comparacao ${c.atencao.vencimentos?'pc-aviso':'pc-neutra'}`},icone('relogio'),`${c.atencao.vencimentos} ${c.atencao.vencimentos===1?'vence':'vencem'} nos próximos 7 dias`),'#/propostas?status=abertos'],
      ['Ticket médio aprovado',moeda(c.ticket_cents),variacao(c.ticket_cents,c.ticket_anterior_cents,comparacao),`#/orcamentos?status=aprovado&aprovados_periodo=${periodo}`],
    ]),
    metaPeriodo(c,periodo,aoAtualizar),
    h('div',{class:'pc-linha-central'},atencao(c),evolucao(c,metrica,aoMudarMetrica),barras(d.situacoes),atividades(c.atividades)),
    h('div',{class:'pc-linha-inferior'},distribuicao(c.ambientes),recentes(d.recentes,aoAtualizar),agenda(d.vencimentos,d.data_hoje)),
    h('nav',{class:'pc-mobile-atalhos','aria-label':'Mais opções do painel'},h('a',{href:'#/config/moveis'},icone('caixa'),'Móveis e preços'),h('a',{href:'#/relatorios'},icone('grafico'),'Relatórios')),
    h('p',{class:'pc-nota'},'Valor orçado considera propostas apresentadas ao cliente, sem rascunhos e cancelados. Valores aprovados representam propostas aceitas, não recebimentos. Distribuição por primeiro ambiente de cada orçamento.'));
}

import { h, icone, substituir, haQuanto, abrirModal, campo, aviso } from './ui.js';
import { formatarDinheiro, formatarData, formatarNumero, STATUS, lerDinheiro, dinheiroParaCampo } from '/shared/calc.js';
import { api } from './api.js';
import { listaOrcamentos } from './comum.js';

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_LONGOS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const CORES = ['#95612f','#c89454','#76ad91','#aa8abd','#b8b3aa'];
const moeda = (v) => formatarDinheiro(v || 0);
const compacto = (v) => new Intl.NumberFormat('pt-BR', { style:'currency',currency:'BRL',notation:'compact',maximumFractionDigits:0 }).format(v / 100);
const numero = (v) => v.toLocaleString('pt-BR',{maximumFractionDigits:1});
const taxa = (c) => c.enviados ? c.aprovados / c.enviados * 100 : null;
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
// Barras deitadas: o nome cabe inteiro em qualquer largura e o comprimento compara os status.
function barras(situacoes) {
  const estados=['rascunho','enviado','negociacao','aprovado','recusado','expirado'];
  const nomes=['Rascunho','Enviado','Em negociação','Aprovado','Recusado','Expirado'];
  const qtd=(st)=>situacoes.find(s=>s.status===st)?.quantidade||0;
  const maior=Math.max(1,...estados.map(qtd));
  const cancelados=qtd('cancelado');
  return painel('pc-status','Orçamentos por status','grafico',null,
    h('div',{class:'pc-status-lista'},estados.map((status,i)=>{
      const n=qtd(status),barra=h('span',{class:`pc-barra pc-barra-${status}`});
      barra.style.width=`${n/maior*100}%`;
      return h('a',{href:`#/orcamentos?status=${status}`,class:'pc-status-linha','data-zero':n?null:'','aria-label':`${STATUS[status]}: ${n} ${n===1?'orçamento':'orçamentos'}`},
        h('span',{class:'pc-status-nome'},nomes[i]),h('span',{class:'pc-status-pista'},barra),h('b',{},n));
    })),cancelados ? h('a',{href:'#/orcamentos?status=cancelado',class:'pc-cancelados'},`${cancelados} ${cancelados===1?'cancelado':'cancelados'}`):null);
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
// Mudança de status vale pelo destino: "Status: Enviado → Recusado" é uma recusa, não um envio.
const DESTINOS = {
  enviado: ['enviar', 'Proposta enviada para {c}', ''],
  'em negociação': ['historico', 'Em negociação com {c}', ''],
  aprovado: ['check', 'Proposta aprovada', 'pc-sucesso'],
  recusado: ['alerta', 'Proposta recusada', 'pc-perigo'],
  expirado: ['relogio', 'Proposta expirada', ''],
  cancelado: ['historico', 'Orçamento cancelado', ''],
  rascunho: ['editar', 'Voltou para rascunho', ''],
};
function descreverAtividade(a) {
  const e = a.evento, ambiente = `${a.cliente_nome} · ${a.ambiente_nome || 'Proposta'}`, numero = `${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`;
  if (/^Status:/.test(e)) {
    const destino = e.split('→').at(-1).trim().toLocaleLowerCase('pt-BR');
    const [ic, titulo, classe] = DESTINOS[destino] || ['historico', `Orçamento ${destino}`, ''];
    return [ic, titulo.replace('{c}', a.cliente_nome), titulo.includes('{c}') ? `${a.ambiente_nome || 'Proposta'} · Nº ${formatarNumero(a.numero)}` : ambiente, classe];
  }
  if (/Cliente cadastrado/i.test(e)) return ['usuarioMais', 'Cliente cadastrado', a.cliente_nome, ''];
  if (/Cliente abriu/i.test(e)) return ['olho', 'Cliente abriu a proposta', ambiente, ''];
  if (/aprovad/i.test(e)) return ['check', 'Proposta aprovada', ambiente, 'pc-sucesso'];
  if (/duplicad|criado a partir/i.test(e)) return ['copiar', 'Orçamento duplicado', numero, ''];
  return ['historico', e, numero, ''];
}
function atividades(linhas) {
  return painel('pc-atividades','Atividades recentes','atividade',link('Ver todas','#/avisos'),linhas.length ? h('div',{class:'pc-feed'},linhas.map(a=>{
    const [ic,titulo,detalhe,classe]=descreverAtividade(a);
    return h('a',{href:a.orcamento_id?`#/orcamentos/${a.orcamento_id}`:`#/clientes/${a.contato_id}`,class:'pc-feed-linha',title:`${titulo} · ${detalhe}`},iconeFundo(ic,classe),h('span',{class:'pc-feed-texto'},h('strong',{},titulo),h('small',{},detalhe)),h('time',{datetime:a.data_hora,title:new Date(a.data_hora).toLocaleString('pt-BR')},haQuanto(a.data_hora)));
  })):vazio('As movimentações da sua marcenaria aparecerão aqui.'));
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

// Régua da meta, dentro da abertura: a parte cheia é o aprovado; o tracejado, onde o período deveria estar hoje.
function reguaMeta(c, periodo, aoAtualizar) {
  const m = c.meta;
  const ajustar = h('button', { type: 'button', class: 'pc-meta-ajustar', onclick: () => definirMeta(m.mensal_cents, aoAtualizar) }, icone('editar'), m.mensal_cents ? 'Ajustar meta' : 'Definir a meta do mês');
  if (!m.valor_cents) return h('div', { class: 'pc-meta pc-meta-vazia' }, ajustar);
  const pct = Math.round((m.aprovados_cents / m.valor_cents) * 100), cheio = Math.min(100, pct), diferenca = pct - m.ritmo;
  const em = (el, propriedade, valor) => { el.style[propriedade] = `${valor}%`; return el; };
  const nota = periodo === 'anterior'
    ? h('p', { class: 'pc-regua-nota' }, pct >= 100 ? 'O mês fechou com a meta batida.' : `O mês fechou ${100 - pct} ${100 - pct === 1 ? 'ponto' : 'pontos'} abaixo da meta.`)
    : h('p', { class: 'pc-regua-nota' }, h('i', { 'aria-hidden': 'true' }), `Ritmo ideal para hoje: ${m.ritmo}%. Você está `, h('b', {}, `${Math.abs(diferenca)} ${Math.abs(diferenca) === 1 ? 'ponto' : 'pontos'} ${diferenca >= 0 ? 'à frente' : 'atrás'}`), '.');
  return h('div', { class: 'pc-meta' },
    h('div', { class: 'pc-regua', role: 'img', 'aria-label': `${pct}% da meta de ${moeda(m.valor_cents)}${periodo === 'anterior' ? '' : `; o ritmo ideal para hoje é ${m.ritmo}%`}` },
      h('div', { class: 'pc-regua-fita' }, em(h('span', { class: 'pc-regua-cheio' }), 'width', cheio), periodo === 'anterior' ? null : em(h('i', { class: 'pc-regua-ritmo' }), 'left', m.ritmo), em(h('i', { class: 'pc-regua-ponteiro' }), 'left', cheio)),
      h('div', { class: 'pc-regua-marcas' }),
      h('div', { class: 'pc-regua-numeros' }, h('span', {}, 'R$ 0'), h('span', {}, compacto(m.valor_cents / 2)), h('span', {}, `Meta ${compacto(m.valor_cents)}`))),
    h('div', { class: 'pc-meta-rodape' }, nota, ajustar));
}

// 1. Como vai o período: data e saudação, a frase do aprovado e a régua da meta.
function abertura(d, c, periodo, filtro, aoAtualizar) {
  const hoje = new Date(`${d.data_hoje}T12:00:00`);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = document.querySelector('.gestao-conta strong, .lateral-usuario strong')?.textContent.trim().split(/\s+/)[0];
  const mes = MESES_LONGOS[Number(c.periodo.inicio.slice(5, 7)) - 1];
  const mesMaiusculo = mes.charAt(0).toLocaleUpperCase('pt-BR') + mes.slice(1);
  const inicio = periodo === 'mes' ? `${mesMaiusculo} vai em ` : periodo === 'anterior' ? `${mesMaiusculo} fechou em ` : `Os últimos ${c.periodo.meses} meses somam `;
  const m = c.meta, aprovado = c.atual.aprovados_cents, falta = m.valor_cents - aprovado;
  const pct = m.valor_cents ? Math.round((aprovado / m.valor_cents) * 100) : null;
  const complemento = pct === null ? ''
    : falta <= 0 ? `Meta batida, com ${moeda(-falta)} a mais.`
    : m.dias_restantes > 0 ? `Faltam ${moeda(falta)} e ainda há ${m.dias_restantes} ${m.dias_restantes === 1 ? 'dia' : 'dias'}.`
    : `Faltaram ${moeda(falta)} para a meta.`;
  return h('header', { class: 'pc-abertura' },
    h('div', { class: 'pc-abertura-topo' },
      h('p', { class: 'pc-sobre' }, `${DIAS[hoje.getDay()]}, ${hoje.getDate()} de ${MESES_LONGOS[hoje.getMonth()]} · ${saudacao}${nome ? `, ${nome}` : ''}`),
      filtro),
    h('h1', { class: 'pc-frase' }, inicio, h('a', { href: `#/orcamentos?status=aprovado&aprovados_periodo=${periodo}` }, h('em', {}, moeda(aprovado))), pct === null ? ' aprovados.' : ` aprovados, ${pct}% da meta. `, complemento ? h('small', {}, complemento) : null),
    reguaMeta(c, periodo, aoAtualizar));
}

// 3. O que pede ação: os alertas viram números grandes, e os vencimentos vêm logo abaixo.
function acompanhar(c, vencimentos, hoje) {
  const alertas = [
    ['vencimentos', 'Vencem nos próximos 7 dias', 'pc-aviso'],
    ['visualizadas', 'Abertas pelo cliente, sem resposta', 'pc-perigo'],
    ['sem_resposta', 'Enviadas há mais de 5 dias, sem resposta', ''],
    ['aprovados', 'Aprovadas nos últimos 7 dias', 'pc-sucesso'],
  ];
  const lista = vencimentos.slice(0, 3).map((v) => {
    const dias = Math.round((Date.parse(`${v.data_validade}T12:00Z`) - Date.parse(`${hoje}T12:00Z`)) / 86400000);
    return h('a', { class: 'pc-vencimento', href: `#/orcamentos/${v.id}` },
      h('span', { class: 'pc-vencimento-texto' }, h('strong', {}, v.cliente_nome), h('small', {}, `Nº ${formatarNumero(v.numero)}${v.ambiente_nome ? ` · ${v.ambiente_nome}` : ''} · ${moeda(v.total_cents)}`)),
      h('span', { class: `pc-prazo ${dias === 0 ? 'pc-perigo' : dias === 1 ? 'pc-aviso' : ''}`, title: formatarData(v.data_validade) }, dias === 0 ? 'Vence hoje' : dias === 1 ? 'Amanhã' : `${v.data_validade.slice(8)} ${MESES[Number(v.data_validade.slice(5, 7)) - 1]}`));
  });
  return painel('pc-acompanhar', 'Para acompanhar', 'alerta', link('Ver propostas em aberto', '#/propostas?status=abertos'),
    h('div', { class: 'pc-contadores' }, alertas.map(([tipo, nome, cor]) => {
      const n = c.atencao[tipo];
      return h('a', { href: `#/orcamentos?atencao=${tipo}`, class: 'pc-contador', 'data-zero': n ? null : '', 'aria-label': `${n} — ${nome}` }, h('strong', { class: n ? cor : '' }, n), h('span', {}, nome));
    })),
    h('h3', { class: 'pc-subtitulo' }, 'Próximos vencimentos'),
    lista.length ? h('div', { class: 'pc-vencimentos' }, lista) : vazio('Nenhuma proposta em aberto com vencimento marcado.'));
}

export function desenharDashboard(d,{periodo,aoMudarPeriodo,aoAtualizar}) {
  const c=d.comercial,p=c.periodo;
  const taxaAtual=taxa(c.conversao),taxaAnterior=taxa(c.conversao_anterior);
  const mesUnico=p.meses===1;
  const periodoTexto=periodo==='mes'?'no mês':periodo==='anterior'?'no mês anterior':'no período';
  const comparacao=mesUnico?'em relação ao mês anterior':'em relação ao período anterior';
  const fimMes=new Date(Number(d.data_hoje.slice(0,4)),Number(d.data_hoje.slice(5,7)),0).getDate();
  const opcoes=[['mes',`Este mês (1 – ${fimMes} ${MESES[Number(d.data_hoje.slice(5,7))-1]} ${d.data_hoje.slice(0,4)})`],['anterior','Mês anterior'],['trimestre','Últimos 3 meses'],['semestre','Últimos 6 meses']];
  const filtro=h('label',{class:'pc-periodo'},icone('calendario'),h('select',{'aria-label':'Período dos indicadores',onchange:e=>aoMudarPeriodo(e.target.value)},opcoes.map(([v,t])=>h('option',{value:v,selected:periodo===v},t))));
  const deAte=`de=${p.inicio}&ate=${p.ate}`;
  const recentes=painel('pc-recentes','Orçamentos recentes','orcamentos',link('Ver todos','#/orcamentos'),
    d.recentes.length ? listaOrcamentos(d.recentes.slice(0,5),{variante:'tabela',aoMudar:aoAtualizar}) : vazio('Crie seu primeiro orçamento para acompanhar as propostas.'));
  return h('div',{class:'pagina painel-comercial'},
    abertura(d,c,periodo,filtro,aoAtualizar),
    // 2. Os números do período numa faixa só
    apoio([
      [`Valor orçado ${periodoTexto}`,moeda(c.atual.valor_cents),variacao(c.atual.valor_cents,c.anterior.valor_cents,comparacao),`#/propostas?status=apresentados&${deAte}`],
      ['Taxa de aprovação (90 dias)',taxaAtual===null?'—':`${numero(taxaAtual)}%`,variacao(taxaAtual,taxaAnterior,'em relação ao período anterior',true),'#/orcamentos?status=aprovado'],
      ['Propostas pendentes',String(c.pendentes),h('span',{class:'pc-comparacao pc-neutra'},'enviadas ou em negociação'),'#/propostas?status=abertos'],
      ['Ticket médio aprovado',moeda(c.ticket_cents),variacao(c.ticket_cents,c.ticket_anterior_cents,comparacao),`#/orcamentos?status=aprovado&aprovados_periodo=${periodo}`],
    ]),
    // 3. O que fazer agora e o que acabou de acontecer
    h('div',{class:'pc-faixa pc-faixa-acao'},acompanhar(c,d.vencimentos,d.data_hoje),atividades(c.atividades)),
    // 4. Os orçamentos mais novos
    recentes,
    // 5. Panorama: para onde vão os orçamentos
    h('div',{class:'pc-faixa pc-faixa-panorama'},barras(d.situacoes),distribuicao(c.ambientes)),
    h('nav',{class:'pc-mobile-atalhos','aria-label':'Mais opções do painel'},h('a',{href:'#/config/moveis'},icone('caixa'),'Móveis e preços'),h('a',{href:'#/relatorios'},icone('grafico'),'Relatórios')),
    h('p',{class:'pc-nota'},'Valor orçado considera propostas apresentadas ao cliente, sem rascunhos e cancelados. Valores aprovados representam propostas aceitas, não recebimentos. A evolução mês a mês está em ',h('a',{href:'#/relatorios'},'Relatórios'),'.'));
}

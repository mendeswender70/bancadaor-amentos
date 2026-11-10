// Página da proposta que o cliente recebe por link (sem login): um livro.
// Mostra apenas o que vem de /api/publico — a mesma visão do PDF — e deixa o cliente
// simular o pagamento e aprovar segurando um botão.
//
// A CSP do esquadro não aceita atributos style: o que varia por elemento vai em data-*
// e é aplicado por CSSOM em vestir().

import { formatarData, formatarDinheiro as brl, formatarPercentual } from '/shared/calc.js';

const raiz = document.getElementById('proposta');
const medidor = document.getElementById('medidor');
const token = decodeURIComponent(location.pathname.split('/p/')[1] || location.hash.slice(1) || '').replace(/\/$/, '');
const base = `/api/publico/propostas/${encodeURIComponent(token)}`;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const semMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const pad2 = (n) => String(n).padStart(2, '0');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ICONES = ['check', 'regua', 'projeto', 'dobradica', 'montagem', 'caminhao', 'escudo', 'limpeza', 'chave', 'ambiente'];

async function pedir(metodo, caminho = '', corpo) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'X-Requested-With': 'fetch', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = new Error(dados.erro || 'Não foi possível carregar a proposta.');
    erro.status = r.status;
    throw erro;
  }
  return dados;
}

// Navegadores sem unidades de container (Safari antes do 16): a medida-base das páginas
// vem da largura real de cada folha.
const semCq = !window.CSS?.supports?.('width', '1cqw');
function medirFolhas(el = document) {
  if (semCq) $$('.folha', el).forEach((f) => f.style.setProperty('--cq', `${f.clientWidth / 380}px`));
}
function vestir(el) {
  medirFolhas(el);
  $$('[data-z]', el).forEach((e) => e.style.setProperty('--z', e.dataset.z));
  $$('[data-v]', el).forEach((e) => e.style.setProperty('--v', e.dataset.v));
  $$('[data-escala]', el).forEach((e) => { e.style.fontSize = `calc(var(--u) * ${e.dataset.escala})`; });
}
function por(el, html) {
  el.innerHTML = html;
  vestir(el);
}

// Texturas geradas por SVG: grão do papel, bancada de madeira e relevo em espinha de peixe.
const urlSvg = (svg) => `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
const estiloRaiz = document.documentElement.style;
estiloRaiz.setProperty('--grao', urlSvg('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  1.4 0 0 0 -.55"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>'));
estiloRaiz.setProperty('--bancada', urlSvg('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1500"><filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.0018 0.0007" numOctaves="2" seed="5" result="onda"/><feTurbulence type="fractalNoise" baseFrequency="0.008 0.0005" numOctaves="3" seed="10" result="banda"/><feTurbulence type="fractalNoise" baseFrequency="0.24 0.0035" numOctaves="2" seed="14" result="fibra"/><feComposite in="banda" in2="fibra" operator="arithmetic" k1="0" k2=".8" k3=".42" k4="-.12" result="mix"/><feDisplacementMap in="mix" in2="onda" scale="34" xChannelSelector="R" yChannelSelector="G" result="veio"/><feColorMatrix in="veio" type="matrix" values="1.7 0 0 0 -.4  1.7 0 0 0 -.4  1.7 0 0 0 -.4  0 0 0 0 1"/><feComponentTransfer><feFuncR type="table" tableValues=".07 .14 .22 .29 .34"/><feFuncG type="table" tableValues=".045 .085 .135 .18 .215"/><feFuncB type="table" tableValues=".028 .05 .078 .1 .125"/></feComponentTransfer></filter><rect x="-80" y="-80" width="920" height="1660" filter="url(#f)"/></svg>'));
estiloRaiz.setProperty('--espinha', urlSvg('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><g fill="none" stroke-width="1"><path d="M-2 11 10 -1 20 9 30 -1 42 11M-2 21 10 9 20 19 30 9 42 21" stroke="#000" stroke-opacity=".5"/><path d="M-2 10 10 -2 20 8 30 -2 42 10M-2 20 10 8 20 18 30 8 42 20" stroke="#fff" stroke-opacity=".07"/></g></svg>'));

// ------------------------------------------------------------------ Dados

let P = null; // a proposta, como veio de /api/publico
let D = null; // o que se deriva dela para montar as páginas
const estado = { forma: 'combinado', parcelas: 1, nome: '', editandoNome: false, enviando: false };

const numeroWhatsApp = (texto) => {
  let d = String(texto || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
};
function linkWhatsApp(mensagem) {
  const numero = numeroWhatsApp(P.empresa.whatsapp || P.empresa.telefone);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}` : '';
}
function dataHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
const nomeValido = (n) => String(n || '').trim().length >= 3;
const parcelaDe = (opcao) => (opcao.valores_parcelas_cents?.length ? Math.max(...opcao.valores_parcelas_cents) : opcao.total_cents);

function carregar(p) {
  P = p;
  const s = p.situacao || {};
  const situacao = s.pode_aprovar ? 'aberta' : s.status === 'aprovado' ? 'aprovada' : s.status === 'expirado' ? 'vencida' : 'indisponivel';
  const empresa = String(p.empresa.nome || '').trim() || 'Móveis planejados';
  const cliente = String(p.cliente.nome || '').trim() || 'Cliente';
  const palavras = cliente.split(/\s+/);
  const resto = palavras.slice(1).join(' ');
  const nomes = p.ambientes.map((a) => String(a.nome || '').toLowerCase()).filter(Boolean);
  const lista = nomes.length > 3
    ? `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2} ambientes`
    : nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0] || 'móveis planejados';
  const linhas = p.pagamento.linhas || [];
  const entrada = linhas.find((l) => /^entrada\s*:/i.test(l));
  const parcelamento = linhas.find((l) => /^parcelamento\s*:/i.test(l));
  const descricao = String(p.pagamento.descricao || '').trim();
  const combinado = entrada
    ? { seg: 'Com entrada', rotulo: 'Entrada', valor: entrada.replace(/^entrada\s*:\s*/i, ''), linhas: [...linhas.filter((l) => l !== entrada), `Total: ${brl(p.total_cents)}`] }
    : parcelamento
      ? { seg: 'Parcelado', rotulo: 'Total parcelado', valor: brl(p.total_cents), linhas: [parcelamento.replace(/^parcelamento\s*:\s*/i, '')] }
      : { seg: /vista/i.test(descricao) ? 'À vista' : 'Combinado', rotulo: descricao || 'Total', valor: brl(p.total_cents), linhas: [] };
  const credito = p.pagamento.cartao?.credito || [];
  const observacoes = String(p.observacoes || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    // Um parágrafo enorme é quebrado em frases para poder continuar na página seguinte.
    .flatMap((par) => (par.length > 420 ? par.match(/[^.!?]+[.!?]*\s*/g).reduce((blocos, frase) => {
      if (blocos.length && (blocos.at(-1) + frase).length <= 420) blocos[blocos.length - 1] += frase;
      else blocos.push(frase);
      return blocos;
    }, []).map((b) => b.trim()) : [par]));
  D = {
    situacao,
    empresa,
    sigla: empresa.charAt(0).toLocaleUpperCase('pt-BR'),
    cliente,
    clienteCurto: palavras.length > 2 && cliente.length > 24 ? `${palavras[0]} ${palavras.at(-1)}` : cliente,
    primeiro: palavras[0],
    nomeB: palavras.length > 2 && resto.length > 16 ? palavras.at(-1) : resto,
    subtitulo: lista.charAt(0).toLocaleUpperCase('pt-BR') + lista.slice(1),
    listaAmbientes: lista,
    totalMoveis: p.ambientes.reduce((soma, a) => soma + a.itens.length, 0),
    local: [p.cliente.cidade, p.cliente.estado].filter(Boolean).join(' – '),
    descricaoPagamento: descricao,
    combinado,
    credito,
    debito: p.pagamento.cartao?.debito || null,
    observacoes,
    linhasInvestimento: [
      ...p.ambientes.map((a) => ({ nome: a.nome, valor: brl(a.subtotal_cents) })),
      ...p.servicos.map((sv) => ({ nome: `${sv.descricao}${(sv.quantidade || 1) > 1 ? ` (${sv.quantidade}x)` : ''}`, valor: brl(sv.valor_cents) })),
      ...(p.acrescimo ? [{ nome: p.acrescimo.descricao, valor: brl(p.acrescimo.valor_cents) }] : []),
      ...(p.desconto_cents ? [{ nome: 'Desconto', valor: `− ${brl(p.desconto_cents)}`, especial: true }] : []),
    ],
    whatsDuvida: linkWhatsApp(`Olá! Tenho uma dúvida sobre a proposta nº ${p.numero}.`),
  };
  if (!estado.nome) estado.nome = String(p.cliente.nome || '').trim();
  if (!credito.length) estado.forma = 'combinado';
  estado.parcelas = Math.min(Math.max(1, estado.parcelas), Math.max(1, credito.length));
  document.title = `Proposta nº ${p.numero} · ${empresa}`;
}
function textoForma() {
  if (estado.forma === 'cartao' && D.credito.length) {
    const o = D.credito[estado.parcelas - 1];
    return estado.parcelas === 1 ? `Cartão de crédito à vista · ${brl(o.total_cents)}` : `Cartão em ${estado.parcelas}x de ${brl(parcelaDe(o))}`;
  }
  return D.descricaoPagamento || (P.pagamento.linhas || []).join(' · ') || 'Conforme combinado';
}

// ------------------------------------------------------------------ Páginas

function seloSvg(id, ouro) {
  const nome = D.empresa.length <= 22 ? D.empresa.toLocaleUpperCase('pt-BR') : 'PROPOSTA APROVADA';
  const cor = ouro ? `url(#ouro-${id})` : 'currentColor';
  return `<svg class="selo" viewBox="0 0 190 190" aria-hidden="true">
    <defs><path id="circ-${id}" d="M95 95 m-70 0 a70 70 0 1 1 140 0 a70 70 0 1 1 -140 0"/><linearGradient id="ouro-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dcae"/><stop offset=".55" stop-color="#d9b77e"/><stop offset="1" stop-color="#9c7339"/></linearGradient></defs>
    <g class="anel"><circle cx="95" cy="95" r="89" fill="none" stroke="${cor}" stroke-width="1.5"/><circle cx="95" cy="95" r="57" fill="none" stroke="${cor}" stroke-width="1.5"/>
      <text font-family="Inter, sans-serif" font-size="11.5" font-weight="600" fill="${cor}"><textPath href="#circ-${id}" textLength="428" lengthAdjust="spacing">PROPOSTA APROVADA · ${esc(nome)} ·</textPath></text></g>
    <g class="centro"><circle cx="95" cy="95" r="47" fill="url(#ouro-${id})"/><path d="M74 96l14 14 28-30" fill="none" stroke="#1c1407" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}

const cab = (t, comQuadro = true) => `${comQuadro ? '<i class="quadro" aria-hidden="true"></i>' : ''}<div class="pag-cab"><span>${esc(D.empresa)}</span><span>${t}</span></div>`;
const pe = (n) => `<div class="pag-pe num"><span>Proposta Nº ${esc(P.numero)}</span><b>${n}</b><span>${esc(D.clienteCurto)}</span></div>`;
const mono = () => `<span class="mono">${esc(D.sigla)}</span>`;
const marca = () => (P.tem_logo ? `<img class="capa-logo" src="${base}/logo" alt="${esc(D.empresa)}">` : mono());
const moldura = '<div class="capa-moldura" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
const filete = '<div class="filete" aria-hidden="true"><i></i></div>';

function pgCapa() {
  const [, mes, ano] = formatarData(P.data).split('/');
  return `<div class="pag capa">${moldura}
    <div class="capa-topo">${marca()}</div>
    <div class="capa-meio"><p class="sobre">Proposta de móveis planejados</p>
      <h1 aria-label="${esc(D.cliente)}"><span class="ouro" aria-hidden="true">${esc(D.primeiro)}</span>${D.nomeB ? `<span class="ouro" aria-hidden="true"><em>${esc(D.nomeB)}</em></span>` : ''}</h1>
      ${filete}<p class="capa-sub">${esc(D.subtitulo)}</p></div>
    <div class="capa-base num"><b>${esc(D.empresa)}</b>Nº ${esc(P.numero)}${mes ? ` · ${MESES[Number(mes) - 1]} de ${ano}` : ''}</div></div>`;
}
function pgCarta(n) {
  const partes = ['cada móvel com o seu valor', ...(P.inclusos.length ? ['o que já está incluso'] : []), 'o investimento total e as formas de pagamento'];
  const contato = [P.empresa.telefone, P.empresa.email].filter(Boolean).join(' · ');
  return `<div class="pag carta">${cab('Carta')}
    <p class="sobre t-topo">Uma palavra antes</p><h2>Olá,<br><em>${esc(D.primeiro)}.</em></h2>
    <p class="destaque">Esta proposta foi preparada para o seu espaço, móvel por móvel.</p>
    <p class="corpo">Nas próximas páginas você encontra ${esc(D.listaAmbientes)}: ${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}. A proposta vale até ${formatarData(P.data_validade)}. Se quiser ajustar algum detalhe antes de aprovar, é só chamar.</p>
    <div class="assina">${mono()}<div><b>${esc(D.empresa)}</b>${contato ? `<small>${esc(contato)}</small>` : ''}</div></div>${pe(n)}</div>`;
}
function pgSumario(n, mapa, { comFatos = true, denso = false } = {}) {
  const fatos = [
    ['Ambientes', `${P.ambientes.length} · ${D.totalMoveis} ${D.totalMoveis === 1 ? 'móvel' : 'móveis'}`],
    D.local ? ['Local', D.local] : ['Emissão', formatarData(P.data)],
    ['Entrega', P.prazo_entrega || 'A combinar'],
    ['Válida até', formatarData(P.data_validade)],
  ];
  return `<div class="pag sumario${denso ? ' denso' : ''}">${cab('Sumário')}
    <p class="sobre t-topo">Neste livro</p><h2>O seu <em>projeto</em></h2>
    <div>${mapa.map(([rot, titulo, pg]) => `<div class="sum" role="link" tabindex="0" data-ir-pagina="${pg}"><span class="n">${rot}</span><span class="t">${esc(titulo)}</span><i aria-hidden="true"></i><span class="p num">${pg}</span></div>`).join('')}</div>
    ${comFatos ? `<dl class="fatos num">${fatos.map(([t, v]) => `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}${pe(n)}</div>`;
}
function pgAmbiente(n, a, i, itens, continua, ultima) {
  const linhas = itens.length
    ? itens.map((item) => `<li><span class="nome">${esc(item.descricao)}${(item.quantidade || 1) > 1 ? `<small class="qtd num">${item.quantidade} un.</small>` : ''}</span><i aria-hidden="true"></i><b class="num">${brl(item.valor_cents)}</b></li>`).join('')
    : '<li><span class="nome vazio">Itens a definir</span></li>';
  return `<div class="pag amb"><i class="quadro" aria-hidden="true"></i>
    <div class="bloco-cor${continua ? ' curto' : ''}">${cab(`Ambiente ${pad2(i + 1)} de ${pad2(P.ambientes.length)}`, false)}
      <span class="amb-n" aria-hidden="true">${pad2(i + 1)}</span>
      <p class="sobre">${continua ? 'Continuação' : 'Ambiente'}</p><h3>${esc(a.nome)}</h3>
      ${continua || !a.descricao ? '' : `<p class="amb-mat">${esc(a.descricao)}</p>`}</div>
    <ul class="itens">${linhas}</ul>
    ${ultima ? `<div class="amb-total num"><span>Total do ambiente</span><b>${brl(a.subtotal_cents)}</b></div>` : '<p class="segue">continua na próxima página</p>'}${pe(n)}</div>`;
}
function pgIncluso(n, itens, continua, inicio = 0) {
  return `<div class="pag incluso">${cab('Incluso')}
    <p class="sobre t-topo">${continua ? 'Continuação' : 'Sem custo extra'}</p><h2>Já está <em>incluso</em></h2>
    <ul class="incl">${itens.map((item, k) => `<li><span class="caixa">${ico(ICONES.includes(item.icone) ? item.icone : 'check')}</span><b>${esc(item.titulo)}</b><span class="ord num" aria-hidden="true">${pad2(inicio + k + 1)}</span><p>${esc(item.descricao)}</p></li>`).join('')}</ul>${pe(n)}</div>`;
}
function pgInvestimento(n, linhas, continua, ultima) {
  const maior = D.credito.length > 1 ? D.credito.at(-1) : null;
  const nota = maior ? `ou ${D.credito.length}x de ${brl(parcelaDe(maior))} no cartão` : D.descricaoPagamento;
  return `<div class="pag inv${ultima && !semMovimento() ? ' espera' : ''}">${cab('Investimento')}
    <p class="sobre t-topo">${continua ? 'Continuação' : 'Valores'}</p><h2>O seu <em>investimento</em></h2>
    <ul class="inv-linhas num">${linhas.map((l) => `<li${l.especial ? ' class="especial"' : ''}><span>${esc(l.nome)}</span><b>${l.valor}</b></li>`).join('')}</ul>
    ${ultima ? `<div class="inv-total">${filete}<small>Total da proposta</small><b class="num" id="total-odo" data-odo="${brl(P.total_cents)}">${brl(P.total_cents)}</b><p>${esc(nota)}</p></div>` : '<p class="segue">continua na próxima página</p>'}${pe(n)}</div>`;
}
const textoTaxa = (o) => (o.taxa_cents > 0 ? `Inclui a taxa do cartão: ${formatarPercentual(o.taxa_centesimos_percentual)}% (+ ${brl(o.taxa_cents)})` : 'Sem acréscimo');
function htmlCartao() {
  const n = estado.parcelas, o = D.credito[n - 1], total = D.credito.length;
  return `<p class="sim-rotulo" id="sim-rotulo">${n === 1 ? 'Crédito à vista' : `${n} parcelas de`}</p><b class="sim-valor num" id="sim-parcela" data-odo="${brl(parcelaDe(o))}">${brl(parcelaDe(o))}</b>
    ${total > 1 ? `<div class="faixa sem-virar"><label class="oculto" for="faixa-parcelas">Número de parcelas</label><input id="faixa-parcelas" type="range" min="1" max="${total}" step="1" value="${n}" data-v="${((n - 1) / (total - 1)).toFixed(3)}"><div class="faixa-marcas num" aria-hidden="true">${D.credito.map((_, i) => `<span>${i + 1}x</span>`).join('')}</div></div>` : ''}
    <p class="sim-linha empilha"><span>Total no cartão <b id="sim-total">${brl(o.total_cents)}</b></span><span id="sim-taxa">${textoTaxa(o)}</span>${D.debito ? `<span>Débito à vista <b>${brl(D.debito.total_cents)}</b></span>` : ''}</p>`;
}
function pgPagamento(n) {
  const c = D.combinado;
  const fatos = `<dl class="fatos fatos-pag num"><div><dt>Entrega</dt><dd>${esc(P.prazo_entrega || 'A combinar')}</dd></div><div><dt>Válida até</dt><dd>${formatarData(P.data_validade)}</dd></div></dl>`;
  const painelCombinado = `<p class="sim-rotulo">${esc(c.rotulo)}</p><b class="sim-valor num" id="sim-combinado" data-odo="${esc(c.valor)}">${esc(c.valor)}</b>
    <p class="sim-linha empilha">${c.linhas.map((l) => `<span>${esc(l)}</span>`).join('')}</p>${D.descricaoPagamento && D.descricaoPagamento !== c.rotulo ? `<p class="sim-menor">${esc(D.descricaoPagamento)}</p>` : ''}`;
  if (!D.credito.length) {
    return `<div class="pag pagto">${cab('Pagamento')}<p class="sobre t-topo">Condições</p><h2>Pagamento e <em>prazo</em></h2>
      <div class="sim-unica">${painelCombinado}</div>${fatos}${pe(n)}</div>`;
  }
  const cartao = P.pagamento.cartao;
  const canal = cartao.nome ? ` (${esc(cartao.nome.charAt(0).toLocaleLowerCase('pt-BR') + cartao.nome.slice(1))})` : '';
  const nota = `No cartão${canal}, o valor já inclui a taxa; o pagamento é combinado direto com ${esc(D.empresa)}.${D.situacao === 'aberta' ? ' A forma escolhida aqui vai junto com a sua aprovação.' : ''}`;
  return `<div class="pag pagto">${cab('Pagamento')}<p class="sobre t-topo">Simule</p><h2>Como você <em>prefere</em> pagar</h2>
    <div class="seg sem-virar" role="radiogroup" aria-label="Forma de pagamento" data-forma="${estado.forma}"><span class="seg-marca" aria-hidden="true"></span>
      <button type="button" role="radio" data-forma="combinado" aria-checked="${estado.forma === 'combinado'}">${esc(c.seg)}</button><button type="button" role="radio" data-forma="cartao" aria-checked="${estado.forma === 'cartao'}">${D.credito.length > 1 ? `Cartão em até ${D.credito.length}x` : 'Cartão de crédito'}</button></div>
    <div class="sim">
      <div class="sim-painel" data-painel="combinado" aria-hidden="${estado.forma !== 'combinado'}" ${estado.forma !== 'combinado' ? 'inert' : ''}>${painelCombinado}</div>
      <div class="sim-painel" data-painel="cartao" aria-hidden="${estado.forma !== 'cartao'}" ${estado.forma !== 'cartao' ? 'inert' : ''}>${htmlCartao()}</div>
    </div>
    ${fatos}<p class="nota">${nota}</p>${pe(n)}</div>`;
}
function pgObservacoes(n, paragrafos, continua) {
  return `<div class="pag observ">${cab('Observações')}
    <p class="sobre t-topo">${continua ? 'Continuação' : 'Antes de aprovar'}</p><h2>Vale <em>saber</em></h2>
    <div class="obs-lista">${paragrafos.map((t) => `<p>${esc(t)}</p>`).join('')}</div>${pe(n)}</div>`;
}
function htmlQuem(erro = '') {
  const aviso = erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : '';
  if (!nomeValido(estado.nome) || estado.editandoNome) {
    return `<form class="nome-form sem-virar" data-form-nome><label class="oculto" for="nome-aprovacao">Seu nome completo</label><input id="nome-aprovacao" autocomplete="name" maxlength="100" placeholder="Seu nome completo" value="${esc(estado.nome)}"><button type="submit">Confirmar</button></form>${aviso}`;
  }
  return `<p class="quem">Aprovando como <b>${esc(estado.nome)}</b> · <button type="button" class="link sem-virar" data-trocar-nome>Não é você?</button></p>${aviso}`;
}
function pgAprovacao(n) {
  const topo = `<div class="pag aprova">${cab('Aprovação')}<div class="aprova-meio">`;
  const fim = `</div>${pe(n)}</div>`;
  const botaoWhats = (texto, mensagem) => {
    const link = linkWhatsApp(mensagem);
    return link ? `<a class="botao-papel sem-virar" href="${esc(link)}" target="_blank" rel="noopener">${ico('whats')}${texto}</a>` : '';
  };
  if (D.situacao === 'aprovada') {
    const s = P.situacao;
    const quando = s.aprovado_em ? dataHora(s.aprovado_em) : '';
    return `${topo}<p class="sobre">Aprovação registrada</p><h2>Proposta <em>aprovada</em></h2>${seloSvg('livro', false)}
      <p class="aprovada-info">${s.aprovado_por ? `Aprovada por <b>${esc(s.aprovado_por)}</b><br>` : ''}${quando ? `em ${quando}<br>` : ''}Total aprovado: <b class="num">${brl(P.total_cents)}</b></p>${fim}`;
  }
  if (D.situacao === 'vencida') {
    return `${topo}<p class="sobre">Venceu em ${formatarData(P.data_validade)}</p><h2>Esta proposta <em>venceu</em></h2>
      <p class="aprovada-info">Os valores podem ter mudado. Peça uma versão atualizada para ${esc(D.empresa)}.</p>
      ${botaoWhats('Pedir proposta atualizada', `Olá! A proposta nº ${P.numero} venceu. Pode me enviar uma versão atualizada?`)}${fim}`;
  }
  if (D.situacao === 'indisponivel') {
    return `${topo}<p class="sobre">Proposta Nº ${esc(P.numero)}</p><h2>Aprovação <em>indisponível</em></h2>
      <p class="aprovada-info">Esta proposta não pode ser aprovada por aqui agora. Para retomar, fale com ${esc(D.empresa)}.</p>
      ${botaoWhats('Falar no WhatsApp', `Olá! Quero falar sobre a proposta nº ${P.numero}.`)}${fim}`;
  }
  return `${topo}<p class="sobre">Válida até ${formatarData(P.data_validade)}</p><h2>Vamos <em>começar</em>,<br>${esc(D.primeiro)}?</h2>
    <dl class="resumo num"><div><dt>Total</dt><dd>${brl(P.total_cents)}</dd></div><div><dt>Pagamento</dt><dd id="resumo-forma">${esc(textoForma())}</dd></div></dl>
    <button type="button" class="segurar sem-virar" id="segurar" aria-describedby="segurar-ajuda"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trilha" cx="50" cy="50" r="48"/><circle class="anel" cx="50" cy="50" r="48" pathLength="1"/></svg><span class="segurar-texto" id="segurar-texto">Segure para<br>aprovar</span></button>
    <p class="ajuda" id="segurar-ajuda">Toque e segure por 2 segundos. Ao aprovar, você concorda com os móveis, os valores e as condições deste livro.</p>
    <div id="quem">${htmlQuem()}</div>${fim}`;
}
const pgGuarda = () => `<div class="pag guarda">${mono()}</div>`;
function pgContra() {
  const e = P.empresa;
  const contatos = [
    [e.telefone, e.whatsapp && e.whatsapp !== e.telefone ? `WhatsApp ${e.whatsapp}` : ''].filter(Boolean).join(' · '),
    e.email,
    [e.endereco, [e.cidade, e.estado].filter(Boolean).join(' – ')].filter(Boolean).join(' · '),
    e.cnpj ? `CNPJ ${e.cnpj}` : '',
  ].filter(Boolean);
  return `<div class="pag capa contra">${moldura}<div class="capa-meio"><div class="capa-topo">${marca()}</div><h3 class="ouro">${esc(D.empresa)}</h3>${filete}
    <p class="num">${contatos.map(esc).join('<br>')}</p></div>
    <div class="capa-base"><a href="/" rel="noopener">Proposta feita com esquadro</a></div></div>`;
}

// Cabe na folha? Mede numa página invisível do tamanho-base (380 de largura, --u = 1px).
function cabe(html) {
  por(medidor, `<div class="folha">${html}</div>`);
  const pg = $('.pag', medidor), rodape = $('.pag-pe', pg), r = pg.getBoundingClientRect();
  const limite = rodape ? rodape.getBoundingClientRect().top - 3 : r.bottom - parseFloat(getComputedStyle(pg).paddingBottom) * 0.5;
  const fundo = Math.max(...[...pg.children].filter((c) => !c.matches('.pag-pe, .quadro, .capa-moldura')).map((c) => c.getBoundingClientRect().bottom));
  return fundo <= limite + 0.5;
}
// Antes de dividir uma lista em duas páginas, aceita a letra até 12% menor.
const cabeReduzindo = (html) => [1, 0.94, 0.88].some((z) => cabe(z === 1 ? html : html.replace('class="pag ', `data-z="${z}" class="pag `)));
function ajustar(html) {
  for (let z = 1; z > 0.74; z -= 0.03) {
    const h = z === 1 ? html : html.replace('class="pag ', `data-z="${z.toFixed(2)}" class="pag `);
    if (cabe(h)) return h;
  }
  return html.replace('class="pag ', 'data-z="0.74" class="pag ');
}
function fatias(lista, montar) {
  if (!lista.length) return [[0, 0]];
  const out = [];
  let ini = 0;
  while (ini < lista.length) {
    let fim = lista.length;
    while (fim > ini + 1 && !cabeReduzindo(montar(lista.slice(ini, fim), ini > 0, fim === lista.length))) fim--;
    out.push([ini, fim]);
    ini = fim;
  }
  return out;
}
function paginas() {
  medidor.style.height = `${alturaBase()}px`;
  const lista = [{ chave: 'capa', dura: true, titulo: 'Capa', fazer: () => pgCapa() }, { chave: 'carta', titulo: 'Carta', fazer: (n) => pgCarta(n) }, { chave: 'sumario', titulo: 'Sumário' }];
  P.ambientes.forEach((a, i) => fatias(a.itens, (it, cont, ult) => pgAmbiente(0, a, i, it, cont, ult)).forEach(([x, y], k, todas) =>
    lista.push({ chave: k ? '' : `amb-${i}`, titulo: a.nome, fazer: (n) => pgAmbiente(n, a, i, a.itens.slice(x, y), k > 0, k === todas.length - 1) })));
  if (P.inclusos.length) {
    fatias(P.inclusos, (it, cont) => pgIncluso(0, it, cont)).forEach(([x, y], k) =>
      lista.push({ chave: k ? '' : 'incluso', titulo: 'Já está incluso', fazer: (n) => pgIncluso(n, P.inclusos.slice(x, y), k > 0, x) }));
  }
  fatias(D.linhasInvestimento, (ls, cont, ult) => pgInvestimento(0, ls, cont, ult)).forEach(([x, y], k, todas) =>
    lista.push({ chave: k ? '' : 'investimento', titulo: 'Investimento', fazer: (n) => pgInvestimento(n, D.linhasInvestimento.slice(x, y), k > 0, k === todas.length - 1) }));
  lista.push({ chave: 'pagamento', titulo: 'Pagamento', fazer: (n) => pgPagamento(n) });
  if (D.observacoes.length) {
    fatias(D.observacoes, (ps, cont) => pgObservacoes(0, ps, cont)).forEach(([x, y], k) =>
      lista.push({ chave: k ? '' : 'observacoes', titulo: 'Observações', fazer: (n) => pgObservacoes(n, D.observacoes.slice(x, y), k > 0) }));
  }
  lista.push({ chave: 'aprovacao', titulo: 'Aprovação', fazer: (n) => pgAprovacao(n) });
  // Total par de páginas para o livro aberto em duas folhas.
  if (duplo() && lista.length % 2 === 0) lista.push({ chave: 'guarda', titulo: '', fazer: () => pgGuarda() });
  lista.push({ chave: 'contra', dura: true, titulo: 'Contracapa', fazer: () => pgContra() });
  const onde = (c) => lista.findIndex((p) => p.chave === c);
  const resto = [
    ...(onde('incluso') > 0 ? [['Já está incluso', onde('incluso')]] : []),
    ['Investimento', onde('investimento')],
    ['Pagamento', onde('pagamento')],
    ...(onde('observacoes') > 0 ? [['Observações', onde('observacoes')]] : []),
    ['Aprovação', onde('aprovacao')],
  ];
  const mapa = [...P.ambientes.map((a, i) => [pad2(i + 1), a.nome, onde(`amb-${i}`)]), ...resto.map(([t, pg], k) => [pad2(P.ambientes.length + k + 1), t, pg])];
  const opcoesSumario = [{}, { comFatos: false }, { comFatos: false, denso: true }];
  const sumario = opcoesSumario.find((o) => cabeReduzindo(pgSumario(2, mapa, o))) || opcoesSumario.at(-1);
  lista[2].fazer = (n) => pgSumario(n, mapa, sumario);
  return lista.map((p, n) => ({ ...p, html: ajustar(p.fazer(n)) }));
}

// ------------------------------------------------------------------ Livro

const fontesProntas = Promise.race([
  Promise.all(['400 16px Fraunces', 'italic 400 16px Fraunces', '300 16px Fraunces', 'italic 300 16px Fraunces', '400 16px Inter', '600 16px Inter'].map((f) => document.fonts.load(f).catch(() => null))),
  new Promise((ok) => setTimeout(ok, 2500)),
]);
let PageFlip = null; // carregada só quando o livro abre em duas páginas
let flip = null, lista = [], atual = 0, totalVisto = false, jaVirou = false, montagem = 0;
const paisagem = () => !flip?.simples && flip?.getOrientation() === 'landscape';
const RAZAO = 380 / 537.4;
const areaLivro = () => ({ W: $('#palco').clientWidth, H: $('.livro-area').clientHeight - 14 });
const duplo = () => { const { W, H } = areaLivro(); return W >= 900 && 2 * H * RAZAO > 600; };
// No celular a página fica mais alta que A4 para o livro ocupar a tela.
function alturaBase() {
  if (duplo()) return 537.4;
  const { W, H } = areaLivro();
  const w = Math.min(W - 12, 520);
  return Math.round(380 * Math.min(1.92, Math.max(1.414, H / w)));
}
let eraDuplo = null, baseAntes = 0;
function dimensionar() {
  const { W, H } = areaLivro(), r = 380 / alturaBase();
  let w = Math.min(W - 12, H * r, 520);
  if (duplo()) w = Math.max(601, Math.min(W - 96, 2 * H * r, 1040));
  eraDuplo = duplo();
  baseAntes = alturaBase();
  $('#livro-caixa').style.width = `${Math.floor(w)}px`;
}
// Controles dentro da página não podem iniciar a virada.
function blindar(el) {
  $$('button, a, input, form, .sem-virar', el).forEach((c) => ['mousedown', 'touchstart'].forEach((t) => c.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true })));
}
async function montarLivro() {
  const vez = ++montagem;
  if (duplo() && !PageFlip) {
    try {
      ({ PageFlip } = await import('/js/vendor/page-flip.module.js'));
    } catch {
      PageFlip = null; // sem a biblioteca, o livro abre uma página por vez
    }
    if (vez !== montagem) return;
  }
  lista = paginas();
  // Nome comprido na capa: mede no tamanho-base e reduz a letra até caber.
  medidor.style.height = `${alturaBase()}px`;
  por(medidor, `<div class="folha">${lista[0].html}</div>`);
  const h1 = $('h1', medidor), maior = Math.max(...$$('span', h1).map((l) => l.scrollWidth));
  const escalaNome = maior > h1.clientWidth ? ` data-escala="${(68 * (h1.clientWidth / maior) * 0.97).toFixed(1)}"` : '';
  medidor.innerHTML = '';
  flip?.destroy();
  $('#aba')?.remove();
  atual = Math.min(atual, lista.length - 1);
  por($('#livro-caixa'), `<div class="janela"><div id="livro">${lista.map((p) => `<div class="pagina"${p.dura ? ' data-density="hard"' : ''}><div class="folha">${p.html.replace('<h1 ', `<h1${escalaNome} `)}</div></div>`).join('')}</div></div>`);
  dimensionar();
  const hb = alturaBase();
  if (!duplo() || !PageFlip) {
    flip = livroSimples();
    medirFolhas();
    aoVirar();
    return;
  }
  flip = new PageFlip($('#livro'), { width: 380, height: hb, size: 'stretch', minWidth: 240, maxWidth: 520, minHeight: Math.round((240 * hb) / 380), maxHeight: Math.round((520 * hb) / 380), showCover: true, usePortrait: false, mobileScrollSupport: false, maxShadowOpacity: 0.55, flippingTime: semMovimento() ? 10 : 850, swipeDistance: 24, disableFlipByClick: true, showPageCorners: true, drawShadow: true, startPage: atual });
  flip.loadFromHTML($$('#livro .pagina'));
  flip.on('flip', (e) => { atual = e.data; jaVirou = true; aoVirar(); });
  blindar($('#livro'));
  medirFolhas();
  aoVirar();
}
// Celular: uma página por vez, com dobra própria. A folha é recortada numa linha de dobra que
// acompanha o dedo, e uma aba (o verso do papel) cobre o trecho já virado.
function livroSimples() {
  const el = $('#livro'), pgs = $$('.pagina', el);
  el.classList.add('simples');
  el.style.aspectRatio = `380 / ${alturaBase()}`;
  const dobra = document.createElement('div');
  dobra.className = 'dobra';
  dobra.hidden = true;
  el.append(dobra);
  let anim = 0, turno = null, gesto = null;
  const pintar = () => {
    pgs.forEach((pg, i) => {
      const v = !!turno && i === turno.vira, b = turno ? i === turno.baixo : i === atual;
      pg.classList.toggle('virando', v);
      pg.classList.toggle('mostra', v || b);
      pg.inert = !!turno || i !== atual;
    });
    dobra.hidden = !turno;
    if (turno) {
      el.style.setProperty('--p', turno.p.toFixed(2));
      dobra.classList.toggle('escura', !!$('.capa', pgs[turno.vira]));
    }
  };
  // dir > 0: a página atual dobra para a esquerda (p vai de 100 a 0). dir < 0: a anterior volta por cima (p de 0 a 100).
  const comecar = (dir) => {
    if (turno) return false;
    const alvo = atual + dir;
    if (alvo < 0 || alvo >= pgs.length) return false;
    turno = dir > 0 ? { dir, vira: atual, baixo: alvo, alvo, p: 100 } : { dir, vira: alvo, baixo: atual, alvo, p: 0 };
    pintar();
    return true;
  };
  const concluir = (completa, dur) => {
    const t = turno;
    if (!t) return;
    const fim = (t.dir > 0) === completa ? 0 : 100, ini = t.p, t0 = performance.now();
    const d = semMovimento() ? 1 : Math.max(140, (dur * Math.abs(fim - ini)) / 100);
    const passo = (agora) => {
      const k = Math.min(1, (agora - t0) / d), e = 1 - Math.pow(1 - k, 3);
      t.p = ini + (fim - ini) * e;
      el.style.setProperty('--p', t.p.toFixed(2));
      if (k < 1) { anim = requestAnimationFrame(passo); return; }
      turno = null;
      if (completa) { atual = t.alvo; jaVirou = true; }
      pintar();
      if (completa) aoVirar();
    };
    anim = requestAnimationFrame(passo);
  };
  const virarAnim = (dir) => { if (comecar(dir)) concluir(true, 640); };
  const ir = (i) => {
    i = Math.max(0, Math.min(pgs.length - 1, i));
    if (i === atual || turno) return;
    if (Math.abs(i - atual) === 1) { virarAnim(i - atual); return; }
    atual = i;
    jaVirou = true;
    pintar();
    aoVirar();
  };
  const ponto = (ev) => ev.touches?.[0] || ev.changedTouches?.[0] || ev;
  const inicio = (ev) => {
    if (turno || ev.target.closest('button, a, input, .sem-virar')) { gesto = null; return; }
    const t = ponto(ev);
    gesto = { x: t.clientX, y: t.clientY, t: performance.now(), ativo: false, w: el.clientWidth };
  };
  const mover = (ev) => {
    if (!gesto) return;
    const t = ponto(ev), dx = t.clientX - gesto.x, dy = t.clientY - gesto.y;
    if (!gesto.ativo) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) || !comecar(dx < 0 ? 1 : -1)) { gesto = null; return; }
      gesto.ativo = true;
    }
    if (ev.cancelable) ev.preventDefault();
    const noSentido = (dx < 0) === (turno.dir > 0);
    const prog = noSentido ? Math.min(100, (Math.abs(dx) / gesto.w) * 115) : 0;
    turno.p = turno.dir > 0 ? 100 - prog : prog;
    el.style.setProperty('--p', turno.p.toFixed(2));
  };
  const soltar = () => {
    if (!gesto) return;
    const g = gesto;
    gesto = null;
    if (!g.ativo || !turno) return;
    const prog = turno.dir > 0 ? 100 - turno.p : turno.p;
    concluir(prog > 28 || (performance.now() - g.t < 300 && prog > 8), 520);
  };
  el.addEventListener('touchstart', inicio, { passive: true });
  el.addEventListener('touchmove', mover, { passive: false });
  el.addEventListener('touchend', soltar);
  el.addEventListener('touchcancel', soltar);
  el.addEventListener('mousedown', inicio);
  el.addEventListener('mousemove', (ev) => { if (ev.buttons) mover(ev); });
  el.addEventListener('mouseup', soltar);
  el.addEventListener('mouseleave', soltar);
  pintar();
  return { simples: true, flipNext: () => virarAnim(1), flipPrev: () => virarAnim(-1), flip: ir, turnToPage: ir, getOrientation: () => 'portrait', update() {}, destroy() { cancelAnimationFrame(anim); }, getSettings: () => ({}) };
}
function visiveis() {
  const out = [atual];
  if (paisagem() && atual > 0 && atual < lista.length - 1) out.push(atual + 1);
  return out;
}
function aoVirar() {
  const els = $$('#livro .pagina'), vis = visiveis();
  const noMiolo = atual > 0 && vis.at(-1) < lista.length - 1;
  $('#livro-caixa').classList.toggle('aberto', noMiolo);
  $('#livro-caixa').classList.toggle('duplo', paisagem());
  els.forEach((el, i) => el.classList.toggle('ativa', vis.includes(i)));
  const nomes = vis.map((i) => lista[i].titulo).filter(Boolean);
  $('#nav-onde').innerHTML = atual === 0 ? (jaVirou ? 'Capa' : 'Abrir →') : `<span class="oculto">${esc(nomes.join(' e '))}, página </span><b>${vis[0]}${vis[1] ? `–${vis[1]}` : ''}</b> de ${lista.length - 1}`;
  $('[data-virar="-1"]').disabled = atual === 0;
  $('[data-virar="1"]').disabled = vis.at(-1) >= lista.length - 1;
  const iApr = lista.findIndex((p) => p.chave === 'aprovacao');
  vis.forEach((i) => {
    const pg = $('.inv.espera', els[i]);
    if (pg) { pg.classList.remove('espera'); odometro($('[data-odo]', pg)); }
    if ($('.inv-total', els[i])) totalVisto = true;
  });
  // Aba dourada que sai do livro, como um marcador.
  const zap = D.situacao === 'aprovada' ? linkWhatsApp(`Olá! Aprovei a proposta nº ${P.numero}. Qual o próximo passo?`) : D.situacao === 'vencida' ? linkWhatsApp(`Olá! A proposta nº ${P.numero} venceu. Pode me enviar uma versão atualizada?`) : '';
  const htmlAba = D.situacao === 'aberta'
    ? `<button type="button" class="aba" id="aba" data-ir-pagina="${iApr}">${ico('check')}Aprovar</button>`
    : zap ? `<a class="aba" id="aba" href="${esc(zap)}" target="_blank" rel="noopener">${ico('whats')}${D.situacao === 'aprovada' ? 'Falar' : 'Atualizar'}</a>` : '';
  let aba = $('#aba');
  if (!aba || aba.dataset.sit !== D.situacao) {
    aba?.remove();
    $('#livro-caixa').insertAdjacentHTML('beforeend', htmlAba);
    aba = $('#aba');
    if (aba) aba.dataset.sit = D.situacao;
  }
  const mostrarAba = noMiolo && (D.situacao !== 'aberta' || (totalVisto && !vis.includes(iApr)));
  if (aba) requestAnimationFrame(() => aba.classList.toggle('visivel', mostrarAba));
}
function virar(d) {
  if (!flip) return;
  const cfg = flip.getSettings();
  cfg.disableFlipByClick = false;
  if (d > 0) flip.flipNext(); else flip.flipPrev();
  cfg.disableFlipByClick = true;
}
function irPara(i) {
  if (!flip || i === atual || !(i >= 0)) return;
  if (semMovimento()) { flip.turnToPage(i); atual = i; aoVirar(); return; }
  const cfg = flip.getSettings();
  cfg.disableFlipByClick = false;
  flip.flip(i);
  cfg.disableFlipByClick = true;
}
let redimT;
addEventListener('resize', () => {
  clearTimeout(redimT);
  redimT = setTimeout(() => {
    // Com o teclado aberto (nome da aprovação) ou a aprovação em curso, o livro não é remontado.
    if (!P || !$('#palco') || estado.enviando || document.activeElement?.matches?.('#livro input')) return;
    if (duplo() !== eraDuplo || alturaBase() !== baseAntes) montarLivro();
    else { dimensionar(); flip?.update(); medirFolhas(); aoVirar(); }
  }, 120);
});

// Toque simples numa linha do sumário (a biblioteca cancela o clique no toque, então detectamos aqui).
let toque = null, ultimoToqueSumario = 0;
const pontoToque = (ev) => { const t = ev.touches?.[0] || ev.changedTouches?.[0] || ev; return { x: t.clientX, y: t.clientY }; };
addEventListener('touchstart', (ev) => { toque = { ...pontoToque(ev), t: performance.now(), moveu: false, alvo: ev.target.closest?.('#livro .sum') }; }, { capture: true, passive: true });
addEventListener('mousedown', (ev) => { toque = { ...pontoToque(ev), t: performance.now(), moveu: false, alvo: null }; }, { capture: true });
const toqueMove = (ev) => { if (!toque) return; const pt = pontoToque(ev); if (Math.hypot(pt.x - toque.x, pt.y - toque.y) > 10) toque.moveu = true; };
addEventListener('touchmove', toqueMove, { capture: true, passive: true });
addEventListener('mousemove', toqueMove, { capture: true });
addEventListener('touchend', () => {
  if (!toque?.alvo || toque.moveu || performance.now() - toque.t > 500) return;
  ultimoToqueSumario = Date.now();
  irPara(Number(toque.alvo.dataset.irPagina));
}, { capture: true });

// Abertura: toda vez que o cliente abre o link.
let fimAbertura = 0;
function tocarAbertura() {
  if (semMovimento()) return;
  const palco = $('#palco');
  palco.classList.remove('abrindo');
  void palco.offsetWidth;
  palco.classList.add('abrindo');
  clearTimeout(fimAbertura);
  fimAbertura = setTimeout(encerrarAbertura, 2300);
}
function encerrarAbertura() {
  clearTimeout(fimAbertura);
  $('#palco')?.classList.remove('abrindo');
}

// ------------------------------------------------------------------ Contador que gira

let telaMedida = null;
function odometro(el, de) {
  if (!el) return;
  const texto = el.dataset.odo || el.textContent;
  if (semMovimento()) { el.textContent = texto; return; }
  const a = (de ?? texto.replace(/\d/g, '0')).padStart(texto.length, ' ').slice(-texto.length);
  el.classList.remove('rolando');
  el.setAttribute('aria-label', texto);
  el.innerHTML = [...texto].map((ch, i) => (/\d/.test(ch)
    ? `<span class="odo-col" aria-hidden="true"><span class="odo-fita" data-de="${/\d/.test(a[i]) ? a[i] : 0}" data-para="${ch}" data-i="${i}">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`
    : `<span class="odo-fixo" aria-hidden="true">${esc(ch)}</span>`)).join('');
  const cs = getComputedStyle(el);
  telaMedida ||= document.createElement('canvas').getContext('2d');
  telaMedida.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing) || 0;
  $$('.odo-fita', el).forEach((f) => {
    f.style.setProperty('--de', f.dataset.de);
    f.style.setProperty('--para', f.dataset.para);
    f.style.setProperty('--i', f.dataset.i);
    f.parentElement.style.width = `${(telaMedida.measureText(f.dataset.para).width + ls).toFixed(2)}px`;
  });
  void el.offsetWidth;
  el.classList.add('rolando');
  clearTimeout(el._odo);
  el._odo = setTimeout(() => { el.classList.remove('rolando'); el.textContent = texto; el.removeAttribute('aria-label'); }, 1450 + texto.length * 45);
}

// ------------------------------------------------------------------ Simulador

function escolherForma(f) {
  if (estado.forma === f || !D.credito.length) return;
  estado.forma = f;
  const seg = $('.seg');
  if (seg) seg.dataset.forma = f;
  $$('.seg [data-forma]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.forma === f)));
  $$('.sim-painel').forEach((p) => { const on = p.dataset.painel === f; p.setAttribute('aria-hidden', String(!on)); p.inert = !on; });
  odometro(f === 'combinado' ? $('#sim-combinado') : $('#sim-parcela'));
  if ($('#resumo-forma')) $('#resumo-forma').textContent = textoForma();
  navigator.vibrate?.(6);
}
function mudarParcelas(n) {
  if (n === estado.parcelas || !D.credito[n - 1]) return;
  estado.parcelas = n;
  const o = D.credito[n - 1], el = $('#sim-parcela'), de = el.dataset.odo;
  el.dataset.odo = brl(parcelaDe(o));
  odometro(el, de);
  $('#sim-total').textContent = brl(o.total_cents);
  $('#sim-taxa').textContent = textoTaxa(o);
  $('#sim-rotulo').textContent = n === 1 ? 'Crédito à vista' : `${n} parcelas de`;
  $('#faixa-parcelas').style.setProperty('--v', ((n - 1) / (D.credito.length - 1)).toFixed(3));
  if ($('#resumo-forma')) $('#resumo-forma').textContent = textoForma();
  navigator.vibrate?.(4);
}

// ------------------------------------------------------------------ Segurar para aprovar

const SEGURAR_MS = 2000;
let segurando = null, voltando = 0, avisoT;
function avisar(t) {
  const a = $('#aviso');
  a.textContent = t;
  a.classList.add('visivel');
  clearTimeout(avisoT);
  avisoT = setTimeout(() => a.classList.remove('visivel'), 2800);
}
function definirH(h) {
  const btn = $('#segurar');
  if (!btn) return;
  btn.style.setProperty('--h', h.toFixed(3));
  btn.classList.toggle('escuro', h > 0.6);
  const txt = $('#segurar-texto'), novo = h >= 1 ? 'Registrando…' : h > 0.01 ? `Segure<span class="num">${Math.ceil((1 - h) * 2)}</span>` : 'Segure para<br>aprovar';
  if (txt.dataset.texto !== novo) { txt.dataset.texto = novo; txt.innerHTML = novo; }
}
function mostrarQuem(erro = '', extra = '') {
  const quem = $('#quem');
  if (!quem) return;
  quem.innerHTML = htmlQuem(erro) + extra;
  if (!flip?.simples) blindar(quem);
}
function comecarSegurar() {
  const btn = $('#segurar');
  if (!btn || segurando || estado.enviando || D.situacao !== 'aberta') return;
  if (!nomeValido(estado.nome) || estado.editandoNome) {
    mostrarQuem('Antes de aprovar, confirme seu nome completo.');
    $('#nome-aprovacao')?.focus();
    return;
  }
  cancelAnimationFrame(voltando);
  const h0 = Number(btn.style.getPropertyValue('--h')) || 0;
  segurando = { t0: performance.now() - h0 * SEGURAR_MS };
  btn.classList.add('segurando');
  navigator.vibrate?.(8);
  const passo = (t) => {
    if (!segurando) return;
    const h = Math.min(1, (t - segurando.t0) / SEGURAR_MS);
    definirH(h);
    if (h >= 1) { segurando = null; enviarAprovacao(); return; }
    segurando.raf = requestAnimationFrame(passo);
  };
  segurando.raf = requestAnimationFrame(passo);
}
function soltarSegurar() {
  if (!segurando) return;
  cancelAnimationFrame(segurando.raf);
  segurando = null;
  recolherSegurar(true);
}
function recolherSegurar(comAviso) {
  const btn = $('#segurar');
  if (!btn) return;
  btn.classList.remove('segurando', 'enviando');
  const h0 = Number(btn.style.getPropertyValue('--h')) || 0, t0 = performance.now();
  if (comAviso && h0 > 0.08) avisar('Continue segurando até o círculo completar.');
  const volta = (t) => { const h = Math.max(0, h0 * (1 - (t - t0) / 380)); definirH(h); if (h > 0) voltando = requestAnimationFrame(volta); };
  voltando = requestAnimationFrame(volta);
}
async function enviarAprovacao() {
  const btn = $('#segurar'), r = btn.getBoundingClientRect();
  estado.enviando = true;
  btn.classList.add('enviando');
  try {
    const corpo = { nome: estado.nome, aceite: true, versao_proposta: P.versao_proposta };
    if (D.credito.length) corpo.preferencia_pagamento = estado.forma === 'cartao' ? { forma: 'cartao', parcelas: estado.parcelas } : { forma: 'combinado' };
    const aprovada = await pedir('POST', '/aprovar', corpo);
    navigator.vibrate?.([14, 50, 28]);
    const luz = document.createElement('div');
    luz.className = 'explosao';
    luz.style.left = `${r.left + r.width / 2}px`;
    luz.style.top = `${r.top + r.height / 2}px`;
    document.body.append(luz);
    setTimeout(() => luz.remove(), 1000);
    setTimeout(async () => {
      estado.enviando = false;
      carregar(aprovada);
      await montarLivro();
      mostrarSucesso();
    }, 520);
  } catch (falha) {
    estado.enviando = false;
    recolherSegurar(false);
    mostrarQuem(falha.message, falha.status === 409 ? '<button type="button" class="botao-papel sem-virar" data-recarregar>Atualizar proposta</button>' : '');
  }
}
function mostrarSucesso() {
  const tela = document.createElement('div');
  tela.className = 'sucesso';
  tela.setAttribute('role', 'dialog');
  tela.setAttribute('aria-modal', 'true');
  tela.setAttribute('aria-labelledby', 'titulo-sucesso');
  const zap = linkWhatsApp(`Olá! Acabei de aprovar a proposta nº ${P.numero}.`);
  const quem = String(P.situacao.aprovado_por || estado.nome || D.cliente).trim().split(/\s+/)[0];
  tela.innerHTML = `<div class="fundo" aria-hidden="true"><div class="bancada"></div><div class="luz"><div class="luz-mov"><div class="ripas"></div></div></div><div class="penumbra"></div><div class="grao"></div></div><div class="sucesso-conteudo">${seloSvg('tela', true)}
    <p class="sobre">Proposta Nº ${esc(P.numero)} aprovada</p><h2 id="titulo-sucesso">Obrigado, <em>${esc(quem)}</em>.</h2>
    <p>Sua aprovação foi registrada e ${esc(D.empresa)} já foi avisada.</p>
    <div class="sucesso-passos"><b>Próximo passo</b>${esc(D.empresa)} vai falar com você para combinar os próximos passos.</div>
    <div class="sucesso-acoes">${zap ? `<a class="botao botao-ouro" href="${esc(zap)}" target="_blank" rel="noopener">${ico('whats')}Avisar pelo WhatsApp</a>` : ''}<a class="botao${zap ? ' botao-vidro' : ' botao-ouro'}" href="${base}/pdf">${ico('baixar')}Baixar PDF</a><button type="button" class="botao botao-vidro" data-sucesso-fechar>Voltar ao livro</button></div></div>`;
  document.body.append(tela);
  setTimeout(() => $('a, button', tela)?.focus(), 80);
}
function salvarNome() {
  const v = $('#nome-aprovacao').value.trim().replace(/\s+/g, ' ');
  if (!nomeValido(v)) { estado.editandoNome = true; mostrarQuem('Escreva seu nome completo.'); $('#nome-aprovacao')?.focus(); return; }
  estado.nome = v;
  estado.editandoNome = false;
  mostrarQuem();
}

// ------------------------------------------------------------------ Eventos

document.addEventListener('click', (ev) => {
  const alvo = ev.target.closest('button, [data-ir-pagina]');
  if (alvo?.matches('.sum') && (toque?.moveu || Date.now() - ultimoToqueSumario < 600)) return;
  if ($('#palco')?.classList.contains('abrindo')) encerrarAbertura();
  if (!alvo) return;
  const ds = alvo.dataset;
  if (ds.virar) virar(Number(ds.virar));
  else if (ds.irPagina) irPara(Number(ds.irPagina));
  else if (ds.forma) escolherForma(ds.forma);
  else if ('trocarNome' in ds) { estado.editandoNome = true; mostrarQuem(); $('#nome-aprovacao')?.focus(); }
  else if ('recarregar' in ds) location.reload();
  else if ('sucessoFechar' in ds) $('.sucesso')?.remove();
});
document.addEventListener('pointerdown', (ev) => {
  if ($('#palco')?.classList.contains('abrindo')) encerrarAbertura();
  const b = ev.target.closest('#segurar');
  if (!b || ev.button > 0) return;
  ev.preventDefault();
  b.setPointerCapture?.(ev.pointerId);
  comecarSegurar();
});
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, soltarSegurar));
document.addEventListener('contextmenu', (ev) => { if (ev.target.closest('#segurar')) ev.preventDefault(); });
document.addEventListener('keydown', (ev) => {
  if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.id === 'segurar') { ev.preventDefault(); if (!ev.repeat) comecarSegurar(); return; }
  if (ev.key === 'Enter' && ev.target.matches?.('.sum')) { irPara(Number(ev.target.dataset.irPagina)); return; }
  if (ev.key === 'Escape') { $('.sucesso')?.remove(); return; }
  if (!flip || ev.target.matches?.('input, textarea') || $('.sucesso')) return;
  if (ev.key === 'ArrowRight') virar(1); else if (ev.key === 'ArrowLeft') virar(-1);
});
document.addEventListener('keyup', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.id === 'segurar') soltarSegurar(); });
document.addEventListener('submit', (ev) => { if (ev.target.matches('[data-form-nome]')) { ev.preventDefault(); salvarNome(); } });
document.addEventListener('input', (ev) => { if (ev.target.id === 'faixa-parcelas') mudarParcelas(Number(ev.target.value)); });

// ------------------------------------------------------------------ Página

function mostrar(p) {
  carregar(p);
  if (D.credito.length) estado.parcelas = D.credito.length;
  raiz.className = '';
  raiz.removeAttribute('aria-busy');
  raiz.innerHTML = `<div class="palco" id="palco">
    <div class="fundo" aria-hidden="true"><div class="bancada"></div><div class="luz"><div class="luz-mov"><div class="ripas"></div></div></div><div class="penumbra"></div><div class="grao"></div></div>
    <div class="livro-area"><div id="livro-caixa" role="region" aria-label="Livro da proposta"></div></div>
    <nav class="livro-nav" aria-label="Páginas do livro">
      <a class="nav-lado esq" href="${base}/pdf" aria-label="Baixar a proposta em PDF">${ico('baixar')}<span>Baixar PDF</span></a>
      <button type="button" class="nav-botao" data-virar="-1" aria-label="Página anterior">${ico('esq')}</button>
      <p class="nav-onde" id="nav-onde" aria-live="polite"></p>
      <button type="button" class="nav-botao" data-virar="1" aria-label="Próxima página">${ico('dir')}</button>
      ${D.whatsDuvida ? `<a class="nav-lado dir" href="${esc(D.whatsDuvida)}" target="_blank" rel="noopener" aria-label="Tirar dúvidas pelo WhatsApp">${ico('whats')}<span>Tirar dúvidas</span></a>` : ''}
    </nav>
  </div>`;
  return fontesProntas.then(() => montarLivro()).then(() => tocarAbertura());
}
function falha(mensagem) {
  raiz.className = 'estado';
  raiz.removeAttribute('aria-busy');
  raiz.innerHTML = `${ico('alerta')}<h1>Não foi possível abrir a proposta</h1><p>${esc(mensagem)}</p><p>Se precisar, peça um novo link para quem enviou.</p>`;
}

pedir('GET')
  .then((p) => mostrar(p))
  .catch((e) => {
    if (!e.status) console.error(e);
    falha(e.status ? e.message : 'Tente de novo em instantes.');
  });

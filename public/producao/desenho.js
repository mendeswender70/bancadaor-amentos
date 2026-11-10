// Desenho das chapas em SVG: peças com a cor do móvel, número da linha e
// medida, fita marcada nas bordas, sobras hachuradas e as cotas das faixas.
// O mesmo desenho serve para o plano, para a tela cheia (com zoom) e para o
// modo de corte (com a parte da vez destacada).
import { formatarMm, ladosNoDesenho } from '/shared/corte.js';
import { h, icone } from '/js/ui.js';

const SVG = 'http://www.w3.org/2000/svg';

export function s(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

// Cores distintas nos dois temas (o preenchimento usa transparência).
export const CORES = ['#c28838', '#3f8db5', '#5f9e4f', '#c9603f', '#8a6cc0', '#b0961f', '#3aa18b', '#b8577b', '#7d8792', '#a0743f'];

/** Cor de cada móvel (grupo), na ordem em que aparece na lista. */
export function coresDosMoveis(pecas) {
  const cores = new Map();
  for (const p of pecas) if (!cores.has(p.grupo || '')) cores.set(p.grupo || '', CORES[cores.size % CORES.length]);
  return cores;
}

export const corDaPeca = (cores, peca) => cores.get(peca?.grupo || '') || CORES[0];

/**
 * @param detalhe um item de detalharSolucao()
 * @param opcoes { pecas, cores, feitas:Set, estragadas:Set, regiao, parte, corte:{eixo,pos,de,ate}, cotas, aoTocar }
 */
export function desenharFolha(detalhe, opcoes) {
  const { pecas, cores, feitas = new Set(), estragadas = new Set(), cotas = true, fita = true } = opcoes;
  const { medidas, colocadas, sobras, chapa } = detalhe;
  const C = medidas.comprimento_mm;
  const L = medidas.largura_mm;
  const r = medidas.refilo_mm;
  const base = Math.max(C, L) / 42;
  const margem = cotas ? base * 2.6 : 0;
  const raiz = detalhe.roteiro?.[0];
  const svg = s('svg', {
    viewBox: `${-margem} 0 ${C + margem} ${L}`,
    class: 'desenho',
    role: 'img',
    'aria-label': `${chapa?.nome || 'Chapa'}: ${colocadas.length} peças`,
  });
  const id = `h${Math.random().toString(36).slice(2, 8)}`;
  svg.append(
    s('defs', {}, s('pattern', { id, width: base * 0.9, height: base * 0.9, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('line', { x1: 0, y1: 0, x2: 0, y2: base * 0.9, class: 'd-hachura' }))),
    s('rect', { x: 0, y: 0, width: C, height: L, class: 'd-refilo' }),
    s('rect', { x: r, y: r, width: C - 2 * r, height: L - 2 * r, class: 'd-util' }),
  );
  if (chapa?.veio) {
    const linhas = s('g', {});
    for (let y = r + base; y < L - r; y += base * 1.4) linhas.append(s('line', { x1: r, y1: y, x2: C - r, y2: y, class: 'd-veio' }));
    svg.append(linhas);
  }
  for (const sb of sobras) {
    svg.append(
      s('rect', { x: sb.x, y: sb.y, width: sb.w, height: sb.h, class: 'd-sobra', fill: `url(#${id})` }),
      sb.w > base * 7 && sb.h > base * 1.6 ? s('text', { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 + base * 0.35, 'font-size': base * 0.95, class: 'd-medida' }, `sobra ${formatarMm(sb.w)}×${formatarMm(sb.h)}`) : null,
    );
  }
  for (const p of colocadas) {
    const peca = pecas[p.indice];
    const cor = corDaPeca(cores, peca);
    const lados = fita && peca.fita_id ? ladosNoDesenho(peca, p.girada) : {};
    const fs = Math.min(p.h * 0.32, p.w * 0.2, base * 1.7);
    const cabeMedida = fs > base * 0.75 && p.h > base * 3.2 && p.w > base * 5.5;
    const classe = ['d-peca', feitas.has(p.numero) ? 'd-feita' : '', estragadas.has(p.numero) ? 'd-estragada' : ''].join(' ');
    const g = s(
      'g',
      { class: classe, style: null, 'data-numero': p.numero, tabindex: opcoes.aoTocar ? '0' : null, role: opcoes.aoTocar ? 'button' : null, 'aria-label': `#${p.indice + 1} ${peca.descricao || 'peça'}` },
      s('rect', { x: p.x, y: p.y, width: p.w, height: p.h, class: 'd-fundo' }),
      lados.topo ? s('line', { x1: p.x, y1: p.y, x2: p.x + p.w, y2: p.y, class: 'd-fita' }) : null,
      lados.base ? s('line', { x1: p.x, y1: p.y + p.h, x2: p.x + p.w, y2: p.y + p.h, class: 'd-fita' }) : null,
      lados.esquerda ? s('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y + p.h, class: 'd-fita' }) : null,
      lados.direita ? s('line', { x1: p.x + p.w, y1: p.y, x2: p.x + p.w, y2: p.y + p.h, class: 'd-fita' }) : null,
      fs > base * 0.55 ? s('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 + (cabeMedida ? -fs * 0.12 : fs * 0.36), 'font-size': fs, class: 'd-rotulo' }, `#${p.indice + 1}`) : null,
      cabeMedida ? s('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 + fs * 0.95, 'font-size': fs * 0.6, class: 'd-medida' }, `${peca.comprimento_mm}×${peca.largura_mm}`) : null,
    );
    // Cor pelo CSSOM: atributo style é bloqueado pela política de segurança.
    g.style.setProperty('--cor', cor);
    if (opcoes.aoTocar) {
      const tocar = (e) => {
        e.stopPropagation();
        opcoes.aoTocar(p, peca, g);
      };
      g.addEventListener('click', tocar);
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tocar(e)));
    }
    svg.append(g);
  }
  // Cotas das faixas (primeiro corte), à esquerda da chapa.
  if (cotas && raiz && raiz.eixo === 'y') {
    for (const parte of raiz.partes) {
      if (parte.regiao.h < base * 1.2) continue;
      const meio = parte.regiao.y + parte.regiao.h / 2;
      svg.append(
        s('line', { x1: -margem * 0.25, y1: parte.regiao.y, x2: -margem * 0.25, y2: parte.regiao.y + parte.regiao.h, class: 'd-cota-linha' }),
        s('text', { x: -margem * 0.62, y: meio, 'font-size': base * 0.85, class: 'd-cota', transform: `rotate(-90 ${-margem * 0.62} ${meio})` }, formatarMm(parte.medida)),
      );
    }
  }
  if (opcoes.regiao) svg.append(s('rect', { x: opcoes.regiao.x, y: opcoes.regiao.y, width: opcoes.regiao.w, height: opcoes.regiao.h, class: 'd-regiao' }));
  if (opcoes.parte) svg.append(s('rect', { x: opcoes.parte.x, y: opcoes.parte.y, width: opcoes.parte.w, height: opcoes.parte.h, class: 'd-parte' }));
  if (opcoes.corte) {
    const { eixo, pos, de, ate } = opcoes.corte;
    svg.append(eixo === 'y' ? s('line', { x1: de, y1: pos, x2: ate, y2: pos, class: 'd-corte' }) : s('line', { x1: pos, y1: de, x2: pos, y2: ate, class: 'd-corte' }));
  }
  return svg;
}

/** Texto de uma peça tocada no desenho. */
export function descreverPeca(p, peca) {
  const lados = peca.fita_id ? ['fita_c1', 'fita_c2', 'fita_l1', 'fita_l2'].filter((k) => peca[k]).map((k) => k.slice(5).toUpperCase()).join(' ') : '';
  return [`#${p.indice + 1}`, peca.descricao || 'Peça sem nome', peca.grupo, `${peca.comprimento_mm} × ${peca.largura_mm} mm`, p.girada ? 'girada' : '', lados ? `fita ${lados}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** Tela cheia com zoom de pinça, arrastar e toque duplo. */
export function abrirVisualizador(titulo, montarSvg) {
  const rodape = h('div', { class: 'p-visualizador-rodape', 'aria-live': 'polite' }, 'Afaste dois dedos para aproximar. Toque numa peça para ver o que é.');
  const area = h('div', { class: 'p-visualizador-area' });
  const fechar = () => {
    painel.remove();
    document.removeEventListener('keydown', teclas);
  };
  const teclas = (e) => e.key === 'Escape' && fechar();
  const painel = h(
    'div',
    { class: 'p-visualizador', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('div', { class: 'p-visualizador-topo' }, h('strong', {}, titulo), h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Fechar', onclick: fechar }, icone('mais', 'icone girar45'))),
    area,
    rodape,
  );
  const svg = montarSvg((p, peca, g) => {
    for (const el of svg.querySelectorAll('.selecionada')) el.classList.remove('selecionada');
    g.classList.add('selecionada');
    rodape.textContent = descreverPeca(p, peca);
  });
  area.append(svg);
  document.body.append(painel);
  document.addEventListener('keydown', teclas);

  const [x0, y0, w0, h0] = svg.getAttribute('viewBox').split(' ').map(Number);
  let vista = { x: x0, y: y0, w: w0, h: h0 };
  const aplicar = () => svg.setAttribute('viewBox', `${vista.x} ${vista.y} ${vista.w} ${vista.h}`);
  const ponto = (cx, cy) => {
    const caixa = svg.getBoundingClientRect();
    // preserveAspectRatio padrão (xMidYMid meet): calcula a escala usada.
    const escala = Math.min(caixa.width / vista.w, caixa.height / vista.h);
    const sobraX = (caixa.width - vista.w * escala) / 2;
    const sobraY = (caixa.height - vista.h * escala) / 2;
    return { x: vista.x + (cx - caixa.left - sobraX) / escala, y: vista.y + (cy - caixa.top - sobraY) / escala, escala };
  };
  const zoom = (fator, cx, cy) => {
    const novoW = Math.min(w0, Math.max(w0 / 12, vista.w / fator));
    const f = vista.w / novoW;
    const p = ponto(cx, cy);
    vista = { x: p.x - (p.x - vista.x) / f, y: p.y - (p.y - vista.y) / f, w: novoW, h: vista.h / f };
    if (novoW >= w0) vista = { x: x0, y: y0, w: w0, h: h0 };
    aplicar();
  };
  const toques = new Map();
  let distancia = 0;
  let ultimoToque = 0;
  area.addEventListener('pointerdown', (e) => {
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      distancia = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (e.pointerType === 'touch' && toques.size === 1) {
      const agora = Date.now();
      if (agora - ultimoToque < 300) zoom(vista.w < w0 ? 0.01 : 2.5, e.clientX, e.clientY);
      ultimoToque = agora;
    }
  });
  area.addEventListener('pointermove', (e) => {
    const anterior = toques.get(e.pointerId);
    if (!anterior) return;
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      const nova = Math.hypot(a.x - b.x, a.y - b.y);
      if (distancia) zoom(nova / distancia, (a.x + b.x) / 2, (a.y + b.y) / 2);
      distancia = nova;
    } else if (toques.size === 1 && vista.w < w0 && (e.buttons || e.pointerType === 'touch')) {
      const { escala } = ponto(e.clientX, e.clientY);
      vista.x -= (e.clientX - anterior.x) / escala;
      vista.y -= (e.clientY - anterior.y) / escala;
      aplicar();
    }
  });
  const soltar = (e) => {
    toques.delete(e.pointerId);
    if (toques.size < 2) distancia = 0;
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointercancel', soltar);
  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
  }, { passive: false });
  return fechar;
}

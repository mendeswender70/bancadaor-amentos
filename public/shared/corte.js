// Plano de corte: distribui peças retangulares em chapas usando só cortes de
// ponta a ponta (guilhotina), que é o que a esquadrejadeira e a seccionadora
// conseguem fazer. Roda no navegador (Web Worker) para calcular e no servidor
// para conferir o resultado recebido.
//
// Medidas em milímetros. A chapa tem o comprimento no eixo x (sentido do veio)
// e a largura no eixo y. A espessura da serra é guardada em décimos de mm.

export const MODOS_CORTE = {
  aproveitamento: {
    nome: 'Menos chapas',
    descricao: 'Gasta o mínimo de chapas que encontrar. Entre planos com as mesmas chapas, fica com o roteiro mais simples.',
  },
  faixas: {
    nome: 'Só faixas',
    descricao: 'Só faixas no comprimento e peças cortadas de cada faixa. Mais simples na serra, mas pode gastar mais chapa.',
  },
};

export const LIMITES_CORTE = {
  linhas: 400,
  instancias: 2000,
  quantidade: 500,
  medidaMax: 6000,
  chapaMin: 100,
  chapaMax: 6000,
  espessuraMax: 100,
  serraDecimosMax: 100,
  refiloMax: 100,
  margemFitaMax: 100,
};

/** Sobras menores que isto (em qualquer lado) não entram na lista de sobras. */
export const SOBRA_MINIMA_MM = 100;

export const AJUSTES_PADRAO = { serra_decimos_mm: 40, refilo_mm: 10, modo: 'aproveitamento', margem_fita_pct: 10 };

export const LADOS_FITA = [
  ['fita_c1', 'C1'],
  ['fita_c2', 'C2'],
  ['fita_l1', 'L1'],
  ['fita_l2', 'L2'],
];

const EPS = 0.05;
const arred = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ Utilidades

export function formatarMm(valor) {
  const n = arred(Number(valor) || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/** "2,75 m²" a partir de mm². */
export function formatarArea(mm2) {
  return `${(mm2 / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

export function formatarMetros(metros) {
  return `${metros.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

function mapaPorId(lista) {
  if (lista instanceof Map) return lista;
  return new Map((lista || []).map((item) => [item.id, item]));
}

/** Uma entrada por peça física, na ordem da lista. O número vai no desenho e nas etiquetas. */
export function expandirPecas(pecas) {
  const lista = [];
  pecas.forEach((peca, indice) => {
    for (let copia = 1; copia <= peca.quantidade; copia++) lista.push({ numero: lista.length + 1, indice, copia, peca });
  });
  return lista;
}

/** A peça só não pode girar quando a chapa tem veio e a peça precisa seguir o veio. */
export const podeGirar = (peca, chapa) => !(chapa?.veio && peca.veio);

/** Hash curto (FNV-1a) para saber se o resultado guardado ainda vale para a lista atual. */
function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function assinaturaPlano(pecas, chapas, ajustes) {
  const mapa = mapaPorId(chapas);
  const usadas = [...new Set(pecas.map((p) => p.chapa_id))]
    .sort((a, b) => (a ?? 0) - (b ?? 0))
    .map((id) => {
      const c = mapa.get(id);
      return c ? [id, c.comprimento_mm, c.largura_mm, c.veio ? 1 : 0] : [id];
    });
  return hashTexto(
    JSON.stringify([
      ajustes.serra_decimos_mm,
      ajustes.refilo_mm,
      ajustes.modo,
      pecas.map((p) => [p.chapa_id, p.comprimento_mm, p.largura_mm, p.quantidade, p.veio ? 1 : 0]),
      usadas,
    ]),
  );
}

/** Gerador pseudoaleatório com semente, para o resultado ser reproduzível. */
function aleatorio(semente) {
  let a = semente >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ Entrada rápida

/**
 * Lê linhas como "720 x 550 x 2 Lateral" ou colunas coladas de planilha
 * ("Lateral	720	550	2"). Os dois primeiros números são comprimento e
 * largura; o terceiro, a quantidade (1 se faltar). O resto é a descrição.
 */
export function lerLinhasPecas(texto) {
  const pecas = [];
  const erros = [];
  String(texto || '')
    .split(/\r?\n/)
    .forEach((linha, i) => {
      const limpa = linha.trim();
      if (!limpa) return;
      const numeros = [];
      const palavras = [];
      for (const parte of limpa.split(/[\t;]|\s+|(?<=\d)\s*[x×*]\s*(?=\d)/i)) {
        const token = (parte || '').trim();
        if (!token || /^[x×*]$/i.test(token)) continue;
        if (/^\d+([.,]\d+)?$/.test(token) && numeros.length < 3) numeros.push(Math.round(Number(token.replace(',', '.'))));
        else palavras.push(token);
      }
      if (numeros.length < 2) {
        erros.push({ linha: i + 1, texto: limpa });
        return;
      }
      pecas.push({
        descricao: palavras.join(' ').slice(0, 120),
        comprimento_mm: numeros[0],
        largura_mm: numeros[1],
        quantidade: numeros[2] || 1,
      });
    });
  return { pecas, erros };
}

// ---------------------------------------------------------------- Otimização

const ORDENS = {
  area: (a, b) => b.c * b.l - a.c * a.l || Math.max(b.c, b.l) - Math.max(a.c, a.l),
  maior_lado: (a, b) => Math.max(b.c, b.l) - Math.max(a.c, a.l) || Math.min(b.c, b.l) - Math.min(a.c, a.l),
  menor_lado: (a, b) => Math.min(b.c, b.l) - Math.min(a.c, a.l) || Math.max(b.c, b.l) - Math.max(a.c, a.l),
  perimetro: (a, b) => b.c + b.l - (a.c + a.l) || Math.max(b.c, b.l) - Math.max(a.c, a.l),
};

const ESCOLHAS = {
  area: (livre, or) => livre.w * livre.h - or.w * or.h,
  lado_curto: (livre, or) => Math.min(livre.w - or.w, livre.h - or.h),
  lado_longo: (livre, or) => Math.max(livre.w - or.w, livre.h - or.h),
};

// true = a sobra de cima fica com a largura inteira do espaço livre.
const DIVISOES = {
  sobra_curta: (livre, or, sw, sh) => sw <= sh,
  sobra_longa: (livre, or, sw, sh) => sw > sh,
  menor_area: (livre, or, sw, sh) => or.w * sh > sw * or.h,
  maior_area: (livre, or, sw, sh) => or.w * sh <= sw * or.h,
  eixo_curto: (livre) => livre.w <= livre.h,
  eixo_longo: (livre) => livre.w > livre.h,
};

/** Guilhotina por espaços livres (Jylänki, "A Thousand Ways to Pack the Bin"). */
function empacotarGuilhotina(itens, U, V, { escolha, divisao, menorLado }) {
  const pontuar = ESCOLHAS[escolha];
  const dividir = DIVISOES[divisao];
  const folhas = [];
  for (const item of itens) {
    let melhor = null;
    for (const folha of folhas) {
      for (let i = 0; i < folha.livres.length; i++) {
        const livre = folha.livres[i];
        for (const or of item.ors) {
          if (or.w > livre.w + EPS || or.h > livre.h + EPS) continue;
          const pontos = pontuar(livre, or);
          if (!melhor || pontos < melhor.pontos) melhor = { folha, i, or, pontos };
        }
      }
    }
    if (!melhor) {
      const folha = { livres: [{ x: 0, y: 0, w: U, h: V }], colocadas: [] };
      folhas.push(folha);
      for (const or of item.ors) {
        const pontos = pontuar(folha.livres[0], or);
        if (!melhor || pontos < melhor.pontos) melhor = { folha, i: 0, or, pontos };
      }
    }
    const { folha, i, or } = melhor;
    const livre = folha.livres[i];
    folha.colocadas.push({ item, x: livre.x, y: livre.y, w: or.w, h: or.h, girada: or.girada });
    folha.livres.splice(i, 1);
    const sw = livre.w - or.w;
    const sh = livre.h - or.h;
    const novas = dividir(livre, or, sw, sh)
      ? [
          { x: livre.x + or.w, y: livre.y, w: sw, h: or.h },
          { x: livre.x, y: livre.y + or.h, w: livre.w, h: sh },
        ]
      : [
          { x: livre.x + or.w, y: livre.y, w: sw, h: livre.h },
          { x: livre.x, y: livre.y + or.h, w: or.w, h: sh },
        ];
    for (const nova of novas) if (nova.w >= menorLado - EPS && nova.h >= menorLado - EPS) folha.livres.push(nova);
  }
  return folhas;
}

function orientacoesFaixa(item, preferencia) {
  if (item.ors.length < 2 || preferencia === 'livre') return item.ors;
  const deitada = item.ors.find((or) => or.w >= or.h) || item.ors[0];
  const emPe = item.ors.find((or) => or.h >= or.w) || item.ors[0];
  return [preferencia === 'deitada' ? deitada : emPe];
}

/**
 * Faixas no comprimento (cortes paralelos ao eixo x); dentro de cada faixa,
 * colunas; dentro de cada coluna, peças empilhadas. Sempre guilhotina.
 */
function empacotarFaixas(itens, U, V, { preferencia }) {
  const folhas = [];
  for (const item of itens) {
    const ors = orientacoesFaixa(item, preferencia);
    let melhor = null;
    const considerar = (candidato) => {
      if (!melhor || candidato.pontos < melhor.pontos) melhor = candidato;
    };
    for (const folha of folhas) {
      for (const faixa of folha.faixas) {
        for (const or of ors) {
          for (const coluna of faixa.colunas) {
            if (or.w <= coluna.w + EPS && coluna.usado + or.h <= faixa.h + EPS) {
              considerar({ tipo: 'pilha', folha, faixa, coluna, or, pontos: (coluna.w - or.w) * or.h });
            }
          }
          if (or.h <= faixa.h + EPS && faixa.usado + or.w <= U + EPS) {
            considerar({ tipo: 'coluna', folha, faixa, or, pontos: (faixa.h - or.h) * or.w });
          }
        }
      }
    }
    if (!melhor) {
      for (const folha of folhas) {
        for (const or of ors) {
          if (folha.usado + or.h <= V + EPS) considerar({ tipo: 'faixa', folha, or, pontos: preferencia === 'livre' ? -or.h : or.h });
        }
      }
    }
    if (!melhor) {
      const folha = { faixas: [], usado: 0, colocadas: [] };
      folhas.push(folha);
      for (const or of ors) considerar({ tipo: 'faixa', folha, or, pontos: preferencia === 'livre' ? -or.h : or.h });
    }
    let { folha, faixa, coluna, or } = melhor;
    if (melhor.tipo === 'faixa') {
      faixa = { y: folha.usado, h: or.h, usado: 0, colunas: [] };
      folha.faixas.push(faixa);
      folha.usado += or.h;
    }
    if (melhor.tipo !== 'pilha') {
      coluna = { x: faixa.usado, w: or.w, usado: 0 };
      faixa.colunas.push(coluna);
      faixa.usado += or.w;
    }
    folha.colocadas.push({ item, x: coluna.x, y: faixa.y + coluna.usado, w: or.w, h: or.h, girada: or.girada });
    coluna.usado += or.h;
  }
  return folhas;
}

/** Quantas vezes a peça é reposicionada (peso maior) e quantos cortes a serra faz. */
function trabalhoDeCorte(folhas, chapa, ajustes, k, r) {
  let total = 0;
  for (const folha of folhas) {
    const colocadas = folha.colocadas.map((c, numero) => ({ numero, x: r + c.x, y: r + c.y, w: c.w - k, h: c.h - k }));
    const arvore = arvoreDeCortes(colocadas, chapa, ajustes);
    if (!arvore) return Infinity;
    const contar = (no) => {
      if (no.tipo !== 'cortes') return;
      total += 1000 + no.partes.length - 1;
      no.partes.forEach(contar);
    };
    contar(arvore);
  }
  return total;
}

function avaliar(folhas) {
  const ultima = folhas[folhas.length - 1];
  const areaUltima = ultima ? ultima.colocadas.reduce((s, c) => s + c.w * c.h, 0) : 0;
  return folhas.length * 1e14 + areaUltima;
}

function rodar(config, itens, U, V, menorLado) {
  return config.algoritmo === 'faixas'
    ? empacotarFaixas(itens, U, V, config)
    : empacotarGuilhotina(itens, U, V, { ...config, menorLado });
}

function configuracoes(modo) {
  const lista = [];
  for (const preferencia of ['deitada', 'em_pe', 'livre']) {
    for (const ordem of ['faixa', ...Object.keys(ORDENS)]) lista.push({ algoritmo: 'faixas', preferencia, ordem });
  }
  if (modo === 'aproveitamento') {
    for (const escolha of Object.keys(ESCOLHAS)) {
      for (const divisao of Object.keys(DIVISOES)) {
        for (const ordem of Object.keys(ORDENS)) lista.push({ algoritmo: 'guilhotina', escolha, divisao, ordem });
      }
    }
  }
  return lista;
}

function ordenar(itens, config) {
  if (config.ordem !== 'faixa') return [...itens].sort(ORDENS[config.ordem]);
  // Altura da faixa que a peça abriria, maior primeiro.
  const altura = (it) => Math.max(...orientacoesFaixa(it, config.preferencia === 'livre' ? 'deitada' : config.preferencia).map((o) => o.h));
  const largura = (it) => Math.max(...it.ors.map((o) => o.w));
  return [...itens].sort((a, b) => altura(b) - altura(a) || largura(b) - largura(a));
}

/** Otimiza as peças de uma chapa (material). */
function otimizarGrupo(instancias, chapa, ajustes, { iteracoes, prazo, sortear }) {
  const k = ajustes.serra_decimos_mm / 10;
  const r = ajustes.refilo_mm;
  const U = chapa.comprimento_mm - 2 * r + k;
  const V = chapa.largura_mm - 2 * r + k;
  const itens = [];
  const naoCabem = [];
  for (const inst of instancias) {
    const c = inst.peca.comprimento_mm + k;
    const l = inst.peca.largura_mm + k;
    const ors = [];
    if (c <= U + EPS && l <= V + EPS) ors.push({ w: c, h: l, girada: false });
    if (podeGirar(inst.peca, chapa) && c !== l && l <= U + EPS && c <= V + EPS) ors.push({ w: l, h: c, girada: true });
    if (ors.length) itens.push({ inst, c, l, ors });
    else naoCabem.push(inst);
  }
  if (!itens.length) return { folhas: [], naoCabem };
  const menorLado = Math.min(...itens.map((it) => Math.min(it.c, it.l)));

  const candidatos = [];
  for (const config of configuracoes(ajustes.modo)) {
    const ordem = ordenar(itens, config);
    const folhas = rodar(config, ordem, U, V, menorLado);
    candidatos.push({ config, ordem, folhas, nota: avaliar(folhas) });
  }
  candidatos.sort((a, b) => a.nota - b.nota);

  // Ajuste fino: troca a ordem de algumas peças nas melhores configurações.
  if (itens.length > 2) {
    const sementes = candidatos.slice(0, 4).map((t) => ({ ...t }));
    for (let n = 0; n < iteracoes && Date.now() < prazo; n++) {
      const base = sementes[n % sementes.length];
      const ordem = [...base.ordem];
      const i = Math.floor(sortear() * ordem.length);
      const j = Math.floor(sortear() * ordem.length);
      if (i === j) continue;
      if (sortear() < 0.5) [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      else ordem.splice(j, 0, ...ordem.splice(i, 1));
      const folhas = rodar(base.config, ordem, U, V, menorLado);
      const nota = avaliar(folhas);
      if (nota <= base.nota) {
        Object.assign(base, { ordem, folhas, nota });
        candidatos.push({ config: base.config, ordem, folhas, nota });
      }
    }
  }

  // Menos chapas primeiro. Com as mesmas chapas, o roteiro com menos
  // reposicionamentos e cortes na serra; depois, a maior sobra na última chapa.
  const minimo = Math.min(...candidatos.map((c) => c.folhas.length));
  const finalistas = candidatos
    .filter((c) => c.folhas.length === minimo)
    .sort((a, b) => a.nota - b.nota)
    .slice(0, 40);
  let melhor = null;
  for (const candidato of finalistas) {
    const trabalho = trabalhoDeCorte(candidato.folhas, chapa, ajustes, k, r);
    if (!melhor || trabalho < melhor.trabalho || (trabalho === melhor.trabalho && candidato.nota < melhor.nota)) {
      melhor = { ...candidato, trabalho };
    }
  }

  const folhas = melhor.folhas
    .map((folha) => ({
      area: folha.colocadas.reduce((s, c) => s + (c.w - k) * (c.h - k), 0),
      pecas: folha.colocadas.map((c) => ({
        indice: c.item.inst.indice,
        copia: c.item.inst.copia,
        x: arred(r + c.x),
        y: arred(r + c.y),
        girada: c.girada,
      })),
    }))
    .sort((a, b) => b.area - a.area)
    .map(({ pecas }) => pecas);
  return { folhas, naoCabem };
}

/**
 * Calcula o plano. `pecas` na ordem da lista; `chapas` com id, medidas e veio.
 * Peças sem chapa cadastrada precisam ser resolvidas antes (a tela avisa).
 */
export function otimizarPlano({ pecas, chapas, ajustes, iteracoes = 1500, tempoMaximoMs = 2500, semente = 7 }) {
  const mapa = mapaPorId(chapas);
  const sortear = aleatorio(semente);
  const prazo = Date.now() + tempoMaximoMs;
  const grupos = new Map();
  for (const inst of expandirPecas(pecas)) {
    if (!mapa.has(inst.peca.chapa_id)) throw new Error(`A peça ${inst.indice + 1} está sem chapa.`);
    if (!grupos.has(inst.peca.chapa_id)) grupos.set(inst.peca.chapa_id, []);
    grupos.get(inst.peca.chapa_id).push(inst);
  }
  const resultado = { versao: 1, assinatura: assinaturaPlano(pecas, mapa, ajustes), chapas: [], nao_cabem: [] };
  const porGrupo = Math.max(1, Math.floor(iteracoes / Math.max(1, grupos.size)));
  for (const [chapaId, instancias] of grupos) {
    const { folhas, naoCabem } = otimizarGrupo(instancias, mapa.get(chapaId), ajustes, { iteracoes: porGrupo, prazo, sortear });
    for (const folha of folhas) resultado.chapas.push({ chapa_id: chapaId, pecas: folha });
    for (const inst of naoCabem) resultado.nao_cabem.push({ indice: inst.indice, copia: inst.copia });
  }
  return resultado;
}

// ---------------------------------------------------------- Roteiro de corte

const outroEixo = (eixo) => (eixo === 'y' ? 'x' : 'y');
const contido = (p, reg) =>
  p.x >= reg.x - EPS && p.y >= reg.y - EPS && p.x + p.w <= reg.x + reg.w + EPS && p.y + p.h <= reg.y + reg.h + EPS;

/** Posições de corte de ponta a ponta na região que não atravessam nenhuma peça. */
function cortesValidos(reg, pecas, eixo, k) {
  const ini = eixo === 'y' ? reg.y : reg.x;
  const fim = eixo === 'y' ? reg.y + reg.h : reg.x + reg.w;
  const pos = (p) => (eixo === 'y' ? p.y : p.x);
  const tam = (p) => (eixo === 'y' ? p.h : p.w);
  const candidatos = new Set();
  for (const p of pecas) {
    const depois = pos(p) + tam(p);
    if (depois < fim - EPS) candidatos.add(arred(depois));
    // Corte logo antes da peça. Pode começar antes da região quando sobra só
    // uma tira mais fina que a serra: a lâmina come essa tira.
    if (pos(p) > ini + EPS) candidatos.add(arred(pos(p) - k));
  }
  const validos = [...candidatos]
    .filter((c) => pecas.every((q) => pos(q) + tam(q) <= c + EPS || pos(q) >= c + k - EPS))
    .sort((a, b) => a - b);
  // Cortes mais próximos que a espessura da serra são o mesmo corte.
  const cortes = [];
  for (const c of validos) if (!cortes.length || c >= cortes[cortes.length - 1] + k - EPS) cortes.push(c);
  return cortes;
}

function decompor(reg, pecas, eixo, k, nivel) {
  if (!pecas.length) return { tipo: 'sobra', ...reg };
  if (pecas.length === 1) {
    const p = pecas[0];
    if (Math.abs(p.x - reg.x) < EPS && Math.abs(p.y - reg.y) < EPS && Math.abs(p.w - reg.w) < EPS && Math.abs(p.h - reg.h) < EPS) {
      return { tipo: 'peca', ...reg, numero: p.numero };
    }
  }
  if (nivel > 60) return null;
  for (const e of [eixo, outroEixo(eixo)]) {
    const cortes = cortesValidos(reg, pecas, e, k);
    if (!cortes.length) continue;
    const fim = e === 'y' ? reg.y + reg.h : reg.x + reg.w;
    const partes = [];
    let inicio = e === 'y' ? reg.y : reg.x;
    let distribuidas = 0;
    for (const c of [...cortes, fim]) {
      const tamanho = c - inicio;
      if (tamanho > EPS) {
        const sub = e === 'y' ? { x: reg.x, y: inicio, w: reg.w, h: tamanho } : { x: inicio, y: reg.y, w: tamanho, h: reg.h };
        const dentro = pecas.filter((p) => contido(p, sub));
        distribuidas += dentro.length;
        const no = decompor(sub, dentro, outroEixo(e), k, nivel + 1);
        if (!no) return null;
        partes.push(no);
      }
      inicio = c + k;
    }
    if (distribuidas !== pecas.length) return null;
    return { tipo: 'cortes', eixo: e, ...reg, partes };
  }
  return null;
}

/**
 * Árvore de cortes da chapa (começando pelas faixas no comprimento) ou null se
 * as peças não puderem ser separadas só com cortes de ponta a ponta.
 * `colocadas`: [{ numero, x, y, w, h }] em medidas reais.
 */
export function arvoreDeCortes(colocadas, chapa, ajustes) {
  const k = ajustes.serra_decimos_mm / 10;
  const r = ajustes.refilo_mm;
  const regiao = { x: r, y: r, w: chapa.comprimento_mm - 2 * r, h: chapa.largura_mm - 2 * r };
  if (colocadas.some((p) => !contido(p, regiao))) return null;
  return decompor(regiao, colocadas, 'y', k, 0);
}

function rotuloParte(prefixo, nivel, i) {
  if (nivel === 0) {
    let n = i;
    let s = '';
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  }
  return nivel % 2 === 1 ? `${prefixo}${i + 1}` : `${prefixo}${String.fromCharCode(97 + (i % 26))}`;
}

/**
 * Passos para a serra, na ordem: primeiro as faixas da chapa, depois o que se
 * corta em cada faixa, e assim por diante. Cada parte traz a medida a marcar
 * na guia.
 */
export function roteiroDeCorte(arvore) {
  const passos = [];
  const visitar = (no, rotulo, nivel) => {
    if (no.tipo !== 'cortes') return;
    const partes = no.partes.map((parte, i) => ({
      tipo: parte.tipo === 'cortes' ? 'parte' : parte.tipo,
      rotulo: parte.tipo === 'cortes' ? rotuloParte(rotulo, nivel, i) : '',
      medida: arred(no.eixo === 'y' ? parte.h : parte.w),
      numero: parte.numero,
      no: parte,
    }));
    passos.push({
      rotulo,
      eixo: no.eixo,
      sentido: no.eixo === 'y' ? 'comprimento' : 'largura',
      tamanho: [arred(no.w), arred(no.h)],
      partes: partes.map(({ no: _no, ...p }) => p),
    });
    for (const parte of partes) if (parte.tipo === 'parte') visitar(parte.no, parte.rotulo, nivel + 1);
  };
  visitar(arvore, '', 0);
  return passos;
}

/** Texto de um passo do roteiro, igual na tela e no PDF. */
export function textoPasso(passo) {
  const onde = passo.rotulo ? `Parte ${passo.rotulo}` : 'Chapa inteira';
  const sentido = passo.eixo === 'y' ? 'cortes no comprimento' : 'cortes na largura';
  const partes = passo.partes.map((p) =>
    p.tipo === 'peca' ? `nº ${p.numero} · ${formatarMm(p.medida)}` : p.tipo === 'sobra' ? `sobra ${formatarMm(p.medida)}` : `${p.rotulo} · ${formatarMm(p.medida)}`,
  );
  return { titulo: `${onde}: ${sentido}`, partes };
}

/** Lados com fita no desenho (y para baixo). C1/C2 acompanham o comprimento da peça. */
export function ladosNoDesenho(peca, girada) {
  return girada
    ? { topo: peca.fita_l1, base: peca.fita_l2, esquerda: peca.fita_c1, direita: peca.fita_c2 }
    : { topo: peca.fita_c1, base: peca.fita_c2, esquerda: peca.fita_l1, direita: peca.fita_l2 };
}

/** "C1 C2 L1" para a lista de peças. */
export function ladosComFita(peca) {
  if (!peca.fita_id) return '';
  return LADOS_FITA.filter(([campo]) => peca[campo]).map(([, nome]) => nome).join(' ');
}

/** Tudo o que a tela e o PDF desenham de uma chapa do resultado. */
export function detalharChapas(plano) {
  const { pecas, chapas, ajustes, resultado } = plano;
  if (!resultado) return [];
  const mapa = mapaPorId(chapas);
  const numeros = numerosDasPecas(pecas);
  return resultado.chapas.map((folha, i) => {
    const chapa = mapa.get(folha.chapa_id);
    const colocadas = pecasDaChapa(folha, pecas, numeros);
    const arvore = arvoreDeCortes(colocadas, chapa, ajustes);
    const area = colocadas.reduce((s, p) => s + p.w * p.h, 0);
    return {
      ordem: i + 1,
      chapa,
      colocadas,
      roteiro: arvore ? roteiroDeCorte(arvore) : [],
      sobras: arvore ? sobrasDaArvore(arvore) : [],
      aproveitamento: Math.round((area / (chapa.comprimento_mm * chapa.largura_mm)) * 1000) / 10,
    };
  });
}

/** Sobras de bom tamanho (para guardar e usar em outro móvel). */
export function sobrasDaArvore(arvore, minimo = SOBRA_MINIMA_MM) {
  const sobras = [];
  const visitar = (no) => {
    if (no.tipo === 'sobra' && Math.min(no.w, no.h) >= minimo) sobras.push({ x: no.x, y: no.y, w: arred(no.w), h: arred(no.h) });
    if (no.tipo === 'cortes') no.partes.forEach(visitar);
  };
  visitar(arvore);
  return sobras.sort((a, b) => b.w * b.h - a.w * a.h);
}

// ---------------------------------------------------------------- Conferência

/** Peças de uma chapa do resultado com número, medidas reais e posição. */
export function pecasDaChapa(folha, pecas, numeros) {
  return folha.pecas.map((p) => {
    const peca = pecas[p.indice];
    return {
      numero: numeros.get(`${p.indice}:${p.copia}`),
      indice: p.indice,
      copia: p.copia,
      x: p.x,
      y: p.y,
      w: p.girada ? peca.largura_mm : peca.comprimento_mm,
      h: p.girada ? peca.comprimento_mm : peca.largura_mm,
      girada: Boolean(p.girada),
    };
  });
}

export function numerosDasPecas(pecas) {
  return new Map(expandirPecas(pecas).map((inst) => [`${inst.indice}:${inst.copia}`, inst.numero]));
}

const cabeNaChapa = (peca, chapa, ajustes) => {
  const k = ajustes.serra_decimos_mm / 10;
  const U = chapa.comprimento_mm - 2 * ajustes.refilo_mm + k;
  const V = chapa.largura_mm - 2 * ajustes.refilo_mm + k;
  const c = peca.comprimento_mm + k;
  const l = peca.largura_mm + k;
  return (c <= U + EPS && l <= V + EPS) || (podeGirar(peca, chapa) && l <= U + EPS && c <= V + EPS);
};

/**
 * Confere um resultado vindo do navegador: cada peça uma vez, na chapa certa,
 * com a medida certa, sem girar contra o veio, dentro da área útil, com a
 * espessura da serra entre as peças e separável só com cortes de ponta a ponta.
 * Devolve o resultado normalizado ou lança um Error com o motivo.
 */
export function validarResultado(resultado, { pecas, chapas, ajustes }) {
  const mapa = mapaPorId(chapas);
  if (!resultado || typeof resultado !== 'object' || !Array.isArray(resultado.chapas) || !Array.isArray(resultado.nao_cabem ?? [])) {
    throw new Error('Resultado do plano em formato inválido.');
  }
  const instancias = expandirPecas(pecas);
  if (resultado.chapas.length > instancias.length) throw new Error('Resultado com chapas demais.');
  const porChave = new Map(instancias.map((inst) => [`${inst.indice}:${inst.copia}`, inst]));
  const vistas = new Set();
  const marcar = (indice, copia) => {
    const chave = `${indice}:${copia}`;
    const inst = porChave.get(chave);
    if (!inst) throw new Error('O resultado tem uma peça que não está na lista. Calcule de novo.');
    if (vistas.has(chave)) throw new Error(`A peça ${inst.numero} aparece mais de uma vez.`);
    vistas.add(chave);
    return inst;
  };

  const chapasNormalizadas = resultado.chapas.map((folha, n) => {
    const chapa = mapa.get(folha?.chapa_id);
    if (!chapa || !Array.isArray(folha.pecas) || !folha.pecas.length) throw new Error(`Chapa ${n + 1} do resultado é inválida.`);
    const colocadas = folha.pecas.map((p) => {
      const inst = marcar(p?.indice, p?.copia);
      if (inst.peca.chapa_id !== chapa.id) throw new Error(`A peça ${inst.numero} está na chapa errada.`);
      const girada = p.girada === true;
      if (girada && !podeGirar(inst.peca, chapa)) throw new Error(`A peça ${inst.numero} foi girada contra o veio.`);
      const x = Number(p.x);
      const y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Posição inválida na peça ${inst.numero}.`);
      return {
        numero: inst.numero,
        indice: inst.indice,
        copia: inst.copia,
        girada,
        x: arred(x),
        y: arred(y),
        w: girada ? inst.peca.largura_mm : inst.peca.comprimento_mm,
        h: girada ? inst.peca.comprimento_mm : inst.peca.largura_mm,
      };
    });
    const arvore = arvoreDeCortes(colocadas, chapa, ajustes);
    let folhas = 0;
    const contar = (no) => {
      if (no.tipo === 'peca') folhas++;
      if (no.tipo === 'cortes') no.partes.forEach(contar);
    };
    if (arvore) contar(arvore);
    if (!arvore || folhas !== colocadas.length) {
      throw new Error(`As peças da chapa ${n + 1} se sobrepõem, saem da área útil ou não podem ser cortadas de ponta a ponta.`);
    }
    return { chapa_id: chapa.id, pecas: colocadas.map(({ indice, copia, x, y, girada }) => ({ indice, copia, x, y, girada })) };
  });

  const naoCabem = (resultado.nao_cabem || []).map((p) => {
    const inst = marcar(p?.indice, p?.copia);
    const chapa = mapa.get(inst.peca.chapa_id);
    if (!chapa) throw new Error(`A peça ${inst.numero} está sem chapa.`);
    if (cabeNaChapa(inst.peca, chapa, ajustes)) throw new Error(`A peça ${inst.numero} cabe na chapa e ficou de fora.`);
    return { indice: inst.indice, copia: inst.copia };
  });

  if (vistas.size !== instancias.length) throw new Error('Faltam peças no resultado. Calcule de novo.');
  return { versao: 1, assinatura: assinaturaPlano(pecas, mapa, ajustes), chapas: chapasNormalizadas, nao_cabem: naoCabem };
}

// -------------------------------------------------------------------- Resumo

/** Metros de fita por tipo, contando os lados marcados de cada peça. */
export function metrosDeFita(pecas, fitas, margemPct = 0) {
  const mapa = mapaPorId(fitas);
  const porFita = new Map();
  for (const p of pecas) {
    if (!p.fita_id) continue;
    const mm = (p.comprimento_mm * ((p.fita_c1 ? 1 : 0) + (p.fita_c2 ? 1 : 0)) + p.largura_mm * ((p.fita_l1 ? 1 : 0) + (p.fita_l2 ? 1 : 0))) * p.quantidade;
    if (!mm) continue;
    porFita.set(p.fita_id, (porFita.get(p.fita_id) || 0) + mm);
  }
  return [...porFita].map(([fitaId, mm]) => {
    const fita = mapa.get(fitaId);
    const metros = mm / 1000;
    const comMargem = metros * (1 + margemPct / 100);
    return {
      fita_id: fitaId,
      nome: fita?.nome || 'Fita removida',
      metros: Math.round(metros * 10) / 10,
      metros_com_margem: Math.ceil(comMargem * 10) / 10,
      custo_cents: fita ? Math.round(fita.preco_metro_cents * comMargem) : 0,
    };
  });
}

/** Números do plano: chapas por material, aproveitamento, fita e custo de material. */
export function resumirPlano({ pecas, chapas, fitas, ajustes, resultado }) {
  const mapa = mapaPorId(chapas);
  const materiais = new Map();
  for (const p of pecas) {
    const chapa = mapa.get(p.chapa_id);
    if (!materiais.has(p.chapa_id)) {
      materiais.set(p.chapa_id, {
        chapa_id: p.chapa_id,
        nome: chapa?.nome || 'Sem chapa',
        espessura_mm: chapa?.espessura_mm || 0,
        pecas: 0,
        area_pecas: 0,
        folhas: 0,
        area_chapas: 0,
        aproveitamento: 0,
        custo_cents: 0,
      });
    }
    const m = materiais.get(p.chapa_id);
    m.pecas += p.quantidade;
    m.area_pecas += p.comprimento_mm * p.largura_mm * p.quantidade;
  }
  if (resultado) {
    for (const folha of resultado.chapas) {
      const m = materiais.get(folha.chapa_id);
      const chapa = mapa.get(folha.chapa_id);
      if (!m || !chapa) continue;
      m.folhas++;
      m.area_chapas += chapa.comprimento_mm * chapa.largura_mm;
      m.custo_cents += chapa.preco_cents || 0;
    }
  }
  const lista = [...materiais.values()].map((m) => ({
    ...m,
    aproveitamento: m.area_chapas ? Math.round((m.area_pecas / m.area_chapas) * 1000) / 10 : 0,
  }));
  const listaFitas = metrosDeFita(pecas, fitas, ajustes.margem_fita_pct || 0);
  const areaChapas = lista.reduce((s, m) => s + m.area_chapas, 0);
  const areaPecas = lista.reduce((s, m) => s + m.area_pecas, 0);
  return {
    materiais: lista,
    fitas: listaFitas,
    total_pecas: lista.reduce((s, m) => s + m.pecas, 0),
    total_chapas: resultado ? resultado.chapas.length : 0,
    nao_cabem: resultado ? resultado.nao_cabem.length : 0,
    aproveitamento: areaChapas ? Math.round((areaPecas / areaChapas) * 1000) / 10 : 0,
    custo_chapas_cents: lista.reduce((s, m) => s + m.custo_cents, 0),
    custo_fitas_cents: listaFitas.reduce((s, f) => s + f.custo_cents, 0),
  };
}

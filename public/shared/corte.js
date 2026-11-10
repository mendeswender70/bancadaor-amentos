// Plano de corte: distribui peças retangulares em chapas e retalhos usando só
// cortes de ponta a ponta (guilhotina), que é o que a esquadrejadeira faz.
// Roda no navegador (Web Worker) para calcular e no servidor para conferir o
// resultado recebido antes de guardá-lo.
//
// Medidas em milímetros. A chapa tem o comprimento no eixo x (sentido do veio)
// e a largura no eixo y. A espessura da serra é guardada em décimos de mm.
// Retalhos seguem a mesma convenção (comprimento no sentido do veio) e não
// levam refilo: as bordas já vêm de um corte.

export const LIMITES_CORTE = {
  linhas: 400,
  instancias: 2000,
  quantidade: 500,
  medidaMax: 6000,
  chapaMin: 100,
  chapaMax: 6000,
  retalhoMin: 50,
  espessuraMax: 100,
  serraDecimosMax: 100,
  refiloMax: 100,
  margemFitaMax: 100,
  retalhosNoCalculo: 300,
};

/** Padrões da oficina. A guia paralela e o curso são os da Baldan SE-3200/38. */
export const CONFIG_PADRAO = {
  serra_decimos_mm: 40,
  refilo_mm: 10,
  guia_paralela_mm: 900,
  curso_carro_mm: 3200,
  sobra_min_largura_mm: 100,
  sobra_min_comprimento_mm: 300,
};

export const AJUSTES_PADRAO = { serra_decimos_mm: 40, refilo_mm: 10, modo: 'aproveitamento', margem_fita_pct: 10 };

export const MODOS_CORTE = {
  aproveitamento: { nome: 'Livre', descricao: 'Testa faixas e cortes em qualquer ordem.' },
  faixas: { nome: 'Só faixas', descricao: 'Só faixas no comprimento e peças cortadas de cada faixa.' },
};

export const SOLUCOES = {
  menos_chapas: { nome: 'Menos chapas', descricao: 'O mínimo de chapas novas. No empate, o corte mais simples.' },
  corte_simples: { nome: 'Corte simples', descricao: 'Menos giros e cortes na serra, mesmo que gaste um pouco mais.' },
  maior_sobra: { nome: 'Maior sobra', descricao: 'As mesmas chapas, deixando a maior sobra inteira para guardar.' },
};

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
  const [inteira, decimal] = n.toFixed(1).split('.');
  const milhar = Number(inteira).toLocaleString('pt-BR');
  return decimal === '0' ? milhar : `${milhar},${decimal}`;
}

/**
 * A marcenaria trabalha em centímetros. O sistema guarda milímetros inteiros
 * (sem erro de arredondamento) e mostra e lê em cm, com até uma casa decimal.
 */
export function formatarCm(mm) {
  return (Math.round(Number(mm) || 0) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "72,5", "72.5" ou "72" (cm) → 725 (mm). Devolve null se não for um número positivo. */
export function lerCm(texto) {
  const s = String(texto ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const mm = Math.round(Number(s) * 10);
  return mm > 0 ? mm : null;
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

/** Uma entrada por peça física, na ordem da lista. */
export function expandirPecas(pecas) {
  const lista = [];
  pecas.forEach((peca, indice) => {
    for (let copia = 1; copia <= peca.quantidade; copia++) lista.push({ numero: lista.length + 1, indice, copia, peca });
  });
  return lista;
}

export function numerosDasPecas(pecas) {
  return new Map(expandirPecas(pecas).map((inst) => [`${inst.indice}:${inst.copia}`, inst.numero]));
}

/** A peça só não pode girar quando a chapa tem veio e a peça precisa seguir o veio. */
export const podeGirar = (peca, chapa) => !(chapa?.veio && peca.veio);

/** A sobra vale guardar quando os dois lados passam do mínimo da oficina. */
export const sobraAproveitavel = (w, h, minimo = CONFIG_PADRAO) =>
  Math.min(w, h) >= minimo.sobra_min_largura_mm && Math.max(w, h) >= minimo.sobra_min_comprimento_mm;

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
 * Lê linhas em centímetros como "72 x 55 x 2 Lateral", "72,5 × 55" ou colunas
 * coladas de planilha ("Lateral	72	55	2"). Os dois primeiros números são
 * comprimento e largura (cm, devolvidos em mm); o terceiro, a quantidade
 * (1 se faltar). O resto é a descrição.
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
        if (/^\d+([.,]\d+)?$/.test(token) && numeros.length < 3) numeros.push(Number(token.replace(',', '.')));
        else palavras.push(token);
      }
      if (numeros.length < 2) {
        erros.push({ linha: i + 1, texto: limpa });
        return;
      }
      pecas.push({
        descricao: palavras.join(' ').slice(0, 120),
        comprimento_mm: Math.round(numeros[0] * 10),
        largura_mm: Math.round(numeros[1] * 10),
        quantidade: numeros[2] ? Math.max(1, Math.round(numeros[2])) : 1,
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

const novaFolha = (U, V, retalho = null) => ({ U, V, retalho, colocadas: [] });

/** Guilhotina por espaços livres (Jylänki, "A Thousand Ways to Pack the Bin"). */
function empacotarGuilhotina(itens, U, V, { escolha, divisao, menorLado }, iniciais) {
  const pontuar = ESCOLHAS[escolha];
  const dividir = DIVISOES[divisao];
  const folhas = iniciais.map((i) => ({ ...novaFolha(i.U, i.V, i.retalho), livres: [{ x: 0, y: 0, w: i.U, h: i.V }] }));
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
      const folha = { ...novaFolha(U, V), livres: [{ x: 0, y: 0, w: U, h: V }] };
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
function empacotarFaixas(itens, U, V, { preferencia }, iniciais) {
  const folhas = iniciais.map((i) => ({ ...novaFolha(i.U, i.V, i.retalho), faixas: [], usado: 0 }));
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
          if (or.h <= faixa.h + EPS && faixa.usado + or.w <= folha.U + EPS) {
            considerar({ tipo: 'coluna', folha, faixa, or, pontos: (faixa.h - or.h) * or.w });
          }
        }
      }
    }
    if (!melhor) {
      for (const folha of folhas) {
        for (const or of ors) {
          if (or.w <= folha.U + EPS && folha.usado + or.h <= folha.V + EPS) {
            considerar({ tipo: 'faixa', folha, or, pontos: preferencia === 'livre' ? -or.h : or.h });
          }
        }
      }
    }
    if (!melhor) {
      const folha = { ...novaFolha(U, V), faixas: [], usado: 0 };
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

const folhasNovas = (folhas) => folhas.filter((f) => !f.retalho);

function avaliar(folhas) {
  const novas = folhasNovas(folhas);
  const ultima = novas[novas.length - 1];
  const areaUltima = ultima ? ultima.colocadas.reduce((s, c) => s + c.w * c.h, 0) : 0;
  return novas.length * 1e14 + areaUltima;
}

function rodar(config, itens, U, V, menorLado, iniciais) {
  const folhas =
    config.algoritmo === 'faixas'
      ? empacotarFaixas(itens, U, V, config, iniciais)
      : empacotarGuilhotina(itens, U, V, { ...config, menorLado }, iniciais);
  return folhas.filter((f) => !f.retalho || f.colocadas.length);
}

function configuracoes(modo) {
  const lista = [];
  for (const preferencia of ['deitada', 'em_pe', 'livre']) {
    for (const ordem of ['faixa', ...Object.keys(ORDENS)]) lista.push({ algoritmo: 'faixas', preferencia, ordem });
  }
  if (modo !== 'faixas') {
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

/** Medidas e refilo de uma folha: chapa nova (com refilo) ou retalho (sem refilo). */
function medidasFolha(chapa, retalho, ajustes) {
  return {
    comprimento_mm: retalho ? retalho.comprimento_mm : chapa.comprimento_mm,
    largura_mm: retalho ? retalho.largura_mm : chapa.largura_mm,
    serra_decimos_mm: ajustes.serra_decimos_mm,
    refilo_mm: retalho ? 0 : ajustes.refilo_mm,
  };
}

/** Giros, cortes e maior sobra de um conjunto de folhas (para escolher entre os candidatos). */
function analisar(folhas, chapa, ajustes, sobraMinima) {
  const k = ajustes.serra_decimos_mm / 10;
  const resumo = { trabalho: 0, cortes: 0, giros: 0, maiorSobra: 0, retalhos: 0 };
  for (const folha of folhas) {
    if (folha.retalho) resumo.retalhos++;
    const medidas = medidasFolha(chapa, folha.retalho, ajustes);
    const r = medidas.refilo_mm;
    const colocadas = folha.colocadas.map((c, numero) => ({ numero, x: r + c.x, y: r + c.y, w: c.w - k, h: c.h - k }));
    const arvore = arvoreDeCortes(colocadas, medidas);
    if (!arvore) return null;
    const visitar = (no) => {
      if (no.tipo === 'sobra' && sobraAproveitavel(no.w, no.h, sobraMinima)) resumo.maiorSobra = Math.max(resumo.maiorSobra, no.w * no.h);
      if (no.tipo !== 'cortes') return;
      resumo.giros++;
      resumo.cortes += no.cortes.length;
      no.partes.forEach(visitar);
    };
    visitar(arvore);
  }
  resumo.trabalho = resumo.giros * 1000 + resumo.cortes;
  return resumo;
}

/** Folhas do candidato no formato guardado: medidas reais e posição na chapa ou retalho. */
function exportarFolhas(folhas, chapa, ajustes) {
  const k = ajustes.serra_decimos_mm / 10;
  const lista = folhas.map((folha) => {
    const r = folha.retalho ? 0 : ajustes.refilo_mm;
    const pecas = folha.colocadas.map((c) => ({
      indice: c.item.inst.indice,
      copia: c.item.inst.copia,
      x: arred(r + c.x),
      y: arred(r + c.y),
      girada: c.girada,
    }));
    return {
      chapa_id: chapa.id,
      ...(folha.retalho ? { retalho_id: folha.retalho.id } : {}),
      pecas,
      area: folha.colocadas.reduce((s, c) => s + (c.w - k) * (c.h - k), 0),
      desenho: JSON.stringify(
        folha.colocadas
          .map((c) => [c.item.inst.indice, arred(c.x), arred(c.y), c.girada ? 1 : 0])
          .sort((a, b) => a[1] - b[1] || a[2] - b[2]),
      ),
    };
  });
  // Retalhos primeiro; chapas iguais lado a lado, as mais cheias antes.
  const retalhos = lista.filter((f) => f.retalho_id);
  const novas = lista.filter((f) => !f.retalho_id).sort((a, b) => b.area - a.area);
  const grupos = new Map();
  for (const f of novas) {
    if (!grupos.has(f.desenho)) grupos.set(f.desenho, []);
    grupos.get(f.desenho).push(f);
  }
  return [...retalhos, ...[...grupos.values()].flat()].map(({ area: _a, desenho: _d, ...f }) => f);
}

/** Otimiza as peças de uma chapa (material), com e sem os retalhos dela. */
function otimizarGrupo(instancias, chapa, retalhos, ajustes, sobraMinima, { iteracoes, prazo, sortear }) {
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
  if (!itens.length) return { solucoes: null, naoCabem };
  const menorLado = Math.min(...itens.map((it) => Math.min(it.c, it.l)));
  const iniciais = retalhos
    .filter((rt) => itens.some((it) => it.ors.some((or) => or.w <= rt.comprimento_mm + k + EPS && or.h <= rt.largura_mm + k + EPS)))
    .map((rt) => ({ U: rt.comprimento_mm + k, V: rt.largura_mm + k, retalho: rt }));

  const candidatos = [];
  for (const config of configuracoes(ajustes.modo)) {
    const ordem = ordenar(itens, config);
    for (const usar of iniciais.length ? [false, true] : [false]) {
      const folhas = rodar(config, ordem, U, V, menorLado, usar ? iniciais : []);
      candidatos.push({ config, usar, ordem, folhas, nota: avaliar(folhas) });
    }
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
      const folhas = rodar(base.config, ordem, U, V, menorLado, base.usar ? iniciais : []);
      const nota = avaliar(folhas);
      if (nota <= base.nota) {
        Object.assign(base, { ordem, folhas, nota });
        candidatos.push({ config: base.config, usar: base.usar, ordem, folhas, nota });
      }
    }
  }

  const novas = (c) => folhasNovas(c.folhas).length;
  const minimo = Math.min(...candidatos.map(novas));
  // Finalistas com e sem retalho separados: com retalho a última chapa fica mais
  // vazia e a nota é sempre melhor, então eles tomariam todas as vagas.
  const analisados = (n, limite) =>
    [false, true].flatMap((usar) =>
      candidatos
        .filter((c) => c.usar === usar && novas(c) === n)
        .sort((a, b) => a.nota - b.nota)
        .slice(0, limite)
        .map((c) => ({ ...c, analise: analisar(c.folhas, chapa, ajustes, sobraMinima) }))
        .filter((c) => c.analise),
    );
  let A = analisados(minimo, 40);
  const B = analisados(minimo + 1, 15);
  // Não deve acontecer (todo candidato é guilhotina), mas nunca fica sem resposta.
  if (!A.length) A = [{ ...candidatos[0], analise: { trabalho: 0, cortes: 0, giros: 0, maiorSobra: 0, retalhos: 0 } }];
  const melhor = (lista, comparar) => lista.reduce((m, c) => (!m || comparar(c, m) < 0 ? c : m), null);
  const porTrabalho = (a, b) => a.analise.trabalho - b.analise.trabalho || a.nota - b.nota;
  // Retalho só entra quando economiza chapa nova: no empate, o candidato sem retalho ganha.
  const menos = melhor(A, (a, b) => a.analise.retalhos - b.analise.retalhos || porTrabalho(a, b));
  const sobra = melhor(A, (a, b) => b.analise.maiorSobra - a.analise.maiorSobra || porTrabalho(a, b));
  const simplesA = melhor(A, porTrabalho);
  const simplesB = melhor(B, porTrabalho);
  const simples = simplesB && simplesB.analise.trabalho <= simplesA.analise.trabalho * 0.75 ? simplesB : simplesA;
  return {
    solucoes: {
      menos_chapas: exportarFolhas(menos.folhas, chapa, ajustes),
      corte_simples: exportarFolhas(simples.folhas, chapa, ajustes),
      maior_sobra: exportarFolhas(sobra.folhas, chapa, ajustes),
    },
    naoCabem,
  };
}

/**
 * Calcula o plano: até três soluções (menos chapas, corte simples, maior sobra),
 * sem repetir soluções iguais. `retalhos`: os disponíveis para este plano.
 * Peças sem chapa precisam ser resolvidas antes (a tela avisa).
 */
export function otimizarPlano({ pecas, chapas, ajustes, retalhos = [], sobraMinima = CONFIG_PADRAO, iteracoes = 1500, tempoMaximoMs = 2500, semente = 7 }) {
  const mapa = mapaPorId(chapas);
  const sortear = aleatorio(semente);
  const prazo = Date.now() + tempoMaximoMs;
  const grupos = new Map();
  for (const inst of expandirPecas(pecas)) {
    if (!mapa.has(inst.peca.chapa_id)) throw new Error(`A linha ${inst.indice + 1} está sem chapa.`);
    if (!grupos.has(inst.peca.chapa_id)) grupos.set(inst.peca.chapa_id, []);
    grupos.get(inst.peca.chapa_id).push(inst);
  }
  const porTipo = Object.fromEntries(Object.keys(SOLUCOES).map((t) => [t, { tipo: t, chapas: [], nao_cabem: [] }]));
  const porGrupo = Math.max(1, Math.floor(iteracoes / Math.max(1, grupos.size)));
  for (const [chapaId, instancias] of grupos) {
    const daChapa = retalhos.filter((rt) => rt.chapa_id === chapaId);
    const { solucoes, naoCabem } = otimizarGrupo(instancias, mapa.get(chapaId), daChapa, ajustes, sobraMinima, { iteracoes: porGrupo, prazo, sortear });
    for (const tipo of Object.keys(SOLUCOES)) {
      if (solucoes) porTipo[tipo].chapas.push(...solucoes[tipo]);
      porTipo[tipo].nao_cabem.push(...naoCabem.map((inst) => ({ indice: inst.indice, copia: inst.copia })));
    }
  }
  const vistas = new Set();
  const solucoes = Object.values(porTipo).filter((s) => {
    const chave = JSON.stringify(s.chapas);
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  return { versao: 2, assinatura: assinaturaPlano(pecas, mapa, ajustes), escolhida: 0, solucoes };
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
    return { tipo: 'cortes', eixo: e, ...reg, cortes, partes };
  }
  return null;
}

/**
 * Árvore de cortes da folha (começando pelas faixas no comprimento) ou null se
 * as peças não puderem ser separadas só com cortes de ponta a ponta.
 * `colocadas`: [{ numero, x, y, w, h }] em medidas reais.
 * `medidas`: { comprimento_mm, largura_mm, serra_decimos_mm, refilo_mm }.
 */
export function arvoreDeCortes(colocadas, medidas) {
  const k = medidas.serra_decimos_mm / 10;
  const r = medidas.refilo_mm;
  const regiao = { x: r, y: r, w: medidas.comprimento_mm - 2 * r, h: medidas.largura_mm - 2 * r };
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
 * Roteiro da serra: primeiro as faixas da folha, depois o que se corta em cada
 * faixa, e assim por diante. Cada parte traz a medida a marcar na guia.
 */
export function roteiroDeCorte(arvore) {
  const passos = [];
  const visitar = (no, rotulo, nivel, eixoPai) => {
    if (no.tipo !== 'cortes') return;
    const partes = no.partes.map((parte, i) => ({
      tipo: parte.tipo === 'cortes' ? 'parte' : parte.tipo,
      rotulo: parte.tipo === 'cortes' ? rotuloParte(rotulo, nivel, i) : '',
      medida: arred(no.eixo === 'y' ? parte.h : parte.w),
      numero: parte.numero,
      regiao: { x: parte.x, y: parte.y, w: parte.w, h: parte.h },
      no: parte,
    }));
    passos.push({
      rotulo,
      eixo: no.eixo,
      cortes: no.cortes.length,
      girar: eixoPai !== null && eixoPai !== no.eixo,
      regiao: { x: no.x, y: no.y, w: no.w, h: no.h },
      partes: partes.map(({ no: _no, ...p }) => p),
    });
    for (const parte of partes) if (parte.tipo === 'parte') visitar(parte.no, parte.rotulo, nivel + 1, no.eixo);
  };
  visitar(arvore, '', 0, null);
  return passos;
}

/** Sobras que valem guardar (para usar em outro trabalho). */
export function sobrasDaArvore(arvore, minimo = CONFIG_PADRAO) {
  const sobras = [];
  const visitar = (no) => {
    if (no.tipo === 'sobra' && sobraAproveitavel(no.w, no.h, minimo)) sobras.push({ x: no.x, y: no.y, w: arred(no.w), h: arred(no.h) });
    if (no.tipo === 'cortes') no.partes.forEach(visitar);
  };
  visitar(arvore);
  return sobras.sort((a, b) => b.w * b.h - a.w * a.h);
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

// ---------------------------------------------------------------- Conferência

/** Peças de uma folha do resultado com número, medidas reais e posição. */
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

const cabeNaChapa = (peca, chapa, ajustes) => {
  const k = ajustes.serra_decimos_mm / 10;
  const U = chapa.comprimento_mm - 2 * ajustes.refilo_mm + k;
  const V = chapa.largura_mm - 2 * ajustes.refilo_mm + k;
  const c = peca.comprimento_mm + k;
  const l = peca.largura_mm + k;
  return (c <= U + EPS && l <= V + EPS) || (podeGirar(peca, chapa) && l <= U + EPS && c <= V + EPS);
};

function validarSolucao(solucao, { pecas, mapa, retalhosPermitidos, ajustes }, n) {
  if (!solucao || typeof solucao !== 'object' || !Array.isArray(solucao.chapas) || !Array.isArray(solucao.nao_cabem ?? [])) {
    throw new Error('Resultado do plano em formato inválido.');
  }
  const tipo = Object.hasOwn(SOLUCOES, solucao.tipo) ? solucao.tipo : null;
  if (!tipo) throw new Error('Tipo de solução inválido.');
  const instancias = expandirPecas(pecas);
  if (solucao.chapas.length > instancias.length) throw new Error('Resultado com chapas demais.');
  const porChave = new Map(instancias.map((inst) => [`${inst.indice}:${inst.copia}`, inst]));
  const vistas = new Set();
  const retalhosUsados = new Set();
  const marcar = (indice, copia) => {
    const chave = `${indice}:${copia}`;
    const inst = porChave.get(chave);
    if (!inst) throw new Error('O resultado tem uma peça que não está na lista. Calcule de novo.');
    if (vistas.has(chave)) throw new Error(`Uma peça da linha ${inst.indice + 1} aparece mais de uma vez.`);
    vistas.add(chave);
    return inst;
  };

  const chapasNormalizadas = solucao.chapas.map((folha, f) => {
    const chapa = mapa.get(folha?.chapa_id);
    if (!chapa || !Array.isArray(folha.pecas) || !folha.pecas.length) throw new Error(`Chapa ${f + 1} do resultado é inválida.`);
    let retalho = null;
    if (folha.retalho_id !== undefined && folha.retalho_id !== null) {
      retalho = retalhosPermitidos.get(folha.retalho_id);
      if (!retalho || retalho.chapa_id !== chapa.id) throw new Error('Um retalho do plano não está mais disponível. Calcule de novo.');
      if (retalhosUsados.has(retalho.id)) throw new Error('O mesmo retalho aparece duas vezes no plano.');
      retalhosUsados.add(retalho.id);
    }
    const colocadas = folha.pecas.map((p) => {
      const inst = marcar(p?.indice, p?.copia);
      if (inst.peca.chapa_id !== chapa.id) throw new Error(`Uma peça da linha ${inst.indice + 1} está na chapa errada.`);
      const girada = p.girada === true;
      if (girada && !podeGirar(inst.peca, chapa)) throw new Error(`Uma peça da linha ${inst.indice + 1} foi girada contra o veio.`);
      const x = Number(p.x);
      const y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Posição inválida na linha ${inst.indice + 1}.`);
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
    const arvore = arvoreDeCortes(colocadas, medidasFolha(chapa, retalho, ajustes));
    let folhas = 0;
    const contar = (no) => {
      if (no.tipo === 'peca') folhas++;
      if (no.tipo === 'cortes') no.partes.forEach(contar);
    };
    if (arvore) contar(arvore);
    if (!arvore || folhas !== colocadas.length) {
      throw new Error(`As peças da chapa ${f + 1} se sobrepõem, saem da área útil ou não podem ser cortadas de ponta a ponta.`);
    }
    return {
      chapa_id: chapa.id,
      ...(retalho ? { retalho_id: retalho.id } : {}),
      pecas: colocadas.map(({ indice, copia, x, y, girada }) => ({ indice, copia, x, y, girada })),
    };
  });

  const naoCabem = (solucao.nao_cabem || []).map((p) => {
    const inst = marcar(p?.indice, p?.copia);
    const chapa = mapa.get(inst.peca.chapa_id);
    if (!chapa) throw new Error(`A linha ${inst.indice + 1} está sem chapa.`);
    if (cabeNaChapa(inst.peca, chapa, ajustes)) throw new Error(`Uma peça da linha ${inst.indice + 1} cabe na chapa e ficou de fora.`);
    return { indice: inst.indice, copia: inst.copia };
  });

  if (vistas.size !== instancias.length) throw new Error(`Faltam peças na solução ${n + 1}. Calcule de novo.`);
  return { tipo, chapas: chapasNormalizadas, nao_cabem: naoCabem };
}

/**
 * Confere um resultado vindo do navegador: em cada solução, cada peça uma vez,
 * na chapa certa, com a medida certa, sem girar contra o veio, dentro da área
 * útil, com a serra entre as peças, separável só com cortes de ponta a ponta,
 * e só com retalhos permitidos. Devolve o resultado normalizado ou lança Error.
 */
export function validarResultado(resultado, { pecas, chapas, ajustes, retalhos = [] }) {
  const mapa = mapaPorId(chapas);
  if (!resultado || typeof resultado !== 'object' || !Array.isArray(resultado.solucoes) || !resultado.solucoes.length || resultado.solucoes.length > 3) {
    throw new Error('Resultado do plano em formato inválido.');
  }
  const retalhosPermitidos = mapaPorId(retalhos);
  const solucoes = resultado.solucoes.map((s, n) => validarSolucao(s, { pecas, mapa, retalhosPermitidos, ajustes }, n));
  const escolhida = Number.isInteger(resultado.escolhida) && resultado.escolhida >= 0 && resultado.escolhida < solucoes.length ? resultado.escolhida : 0;
  return { versao: 2, assinatura: assinaturaPlano(pecas, mapa, ajustes), escolhida, solucoes };
}

/** Ids dos retalhos que uma solução usa. */
export const retalhosDaSolucao = (solucao) => (solucao?.chapas || []).filter((f) => f.retalho_id).map((f) => f.retalho_id);

// --------------------------------------------------------------- Apresentação

/**
 * Tudo o que a tela, o modo de corte e o PDF mostram de cada folha de uma
 * solução: medidas, peças, árvore, roteiro, sobras e quantas chapas iguais.
 * `plano`: { pecas, chapas, ajustes, retalhos, config }.
 */
export function detalharSolucao(plano, solucao) {
  const { pecas, ajustes } = plano;
  if (!solucao) return [];
  const mapa = mapaPorId(plano.chapas);
  const retalhos = mapaPorId(plano.retalhos || []);
  const config = { ...CONFIG_PADRAO, ...(plano.config || {}) };
  const numeros = numerosDasPecas(pecas);
  const folhas = solucao.chapas.map((folha, i) => {
    const chapa = mapa.get(folha.chapa_id);
    const retalho = folha.retalho_id ? retalhos.get(folha.retalho_id) || null : null;
    const medidas = medidasFolha(chapa, folha.retalho_id ? retalho || { comprimento_mm: 0, largura_mm: 0 } : null, ajustes);
    const colocadas = pecasDaChapa(folha, pecas, numeros);
    const arvore = folha.retalho_id && !retalho ? null : arvoreDeCortes(colocadas, medidas);
    const area = colocadas.reduce((s, p) => s + p.w * p.h, 0);
    const desenho = JSON.stringify(colocadas.map((p) => [p.indice, p.x, p.y, p.girada ? 1 : 0]).sort((a, b) => a[1] - b[1] || a[2] - b[2]));
    return {
      ordem: i + 1,
      chapa,
      retalho,
      retalho_id: folha.retalho_id || null,
      medidas,
      colocadas,
      arvore,
      roteiro: arvore ? roteiroDeCorte(arvore) : [],
      sobras: arvore ? sobrasDaArvore(arvore, config) : [],
      aproveitamento: medidas.comprimento_mm ? Math.round((area / (medidas.comprimento_mm * medidas.largura_mm)) * 1000) / 10 : 0,
      desenho: folha.retalho_id ? `r${i}` : `${folha.chapa_id}:${desenho}`,
    };
  });
  // Chapas iguais seguidas: "chapa 2 de 3 iguais".
  for (let i = 0; i < folhas.length; ) {
    let j = i;
    while (j + 1 < folhas.length && folhas[j + 1].desenho === folhas[i].desenho) j++;
    for (let n = i; n <= j; n++) Object.assign(folhas[n], { iguais: j - i + 1, posicaoIgual: n - i + 1, primeiraIgual: i });
    i = j + 1;
  }
  return folhas;
}

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
    const preco = fita?.preco_metro_cents;
    return {
      fita_id: fitaId,
      nome: fita?.nome || 'Fita removida',
      metros: Math.round(metros * 10) / 10,
      metros_com_margem: Math.ceil(comMargem * 10) / 10,
      ...(preco === undefined ? {} : { custo_cents: Math.round((preco || 0) * comMargem) }),
    };
  });
}

/**
 * Números de uma solução: chapas novas e retalhos por material, aproveitamento,
 * cortes, giros, fita e (só quando as chapas trazem preço) custo de material.
 */
export function resumirSolucao(plano, solucao, detalhes = detalharSolucao(plano, solucao)) {
  const { pecas, ajustes } = plano;
  const mapa = mapaPorId(plano.chapas);
  const comPreco = plano.chapas.some((c) => c.preco_cents !== undefined);
  const materiais = new Map();
  for (const p of pecas) {
    if (!materiais.has(p.chapa_id)) {
      const chapa = mapa.get(p.chapa_id);
      materiais.set(p.chapa_id, {
        chapa_id: p.chapa_id,
        nome: chapa?.nome || 'Sem chapa',
        espessura_mm: chapa?.espessura_mm || 0,
        pecas: 0,
        area_pecas: 0,
        novas: 0,
        retalhos: 0,
        area_usada: 0,
        ...(comPreco ? { custo_cents: 0 } : {}),
      });
    }
    const m = materiais.get(p.chapa_id);
    m.pecas += p.quantidade;
    m.area_pecas += p.comprimento_mm * p.largura_mm * p.quantidade;
  }
  let cortes = 0;
  let giros = 0;
  for (const d of detalhes) {
    const m = materiais.get(d.chapa?.id);
    if (!m) continue;
    if (d.retalho_id) m.retalhos++;
    else {
      m.novas++;
      if (comPreco) m.custo_cents += d.chapa.preco_cents || 0;
    }
    m.area_usada += d.medidas.comprimento_mm * d.medidas.largura_mm;
    for (const passo of d.roteiro) {
      giros++;
      cortes += passo.cortes;
    }
  }
  const lista = [...materiais.values()].map((m) => ({
    ...m,
    aproveitamento: m.area_usada ? Math.round((m.area_pecas / m.area_usada) * 1000) / 10 : 0,
  }));
  const fitas = metrosDeFita(pecas, plano.fitas || [], ajustes.margem_fita_pct || 0);
  const areaUsada = lista.reduce((s, m) => s + m.area_usada, 0);
  const areaPecas = lista.reduce((s, m) => s + m.area_pecas, 0);
  return {
    tipo: solucao?.tipo || null,
    materiais: lista,
    fitas,
    total_pecas: lista.reduce((s, m) => s + m.pecas, 0),
    chapas_novas: lista.reduce((s, m) => s + m.novas, 0),
    retalhos: lista.reduce((s, m) => s + m.retalhos, 0),
    nao_cabem: solucao ? solucao.nao_cabem.length : 0,
    cortes,
    giros,
    maior_sobra: Math.max(0, ...detalhes.flatMap((d) => d.sobras.map((s) => s.w * s.h))),
    aproveitamento: areaUsada ? Math.round((areaPecas / areaUsada) * 1000) / 10 : 0,
    ...(comPreco
      ? {
          custo_chapas_cents: lista.reduce((s, m) => s + m.custo_cents, 0),
          custo_fitas_cents: fitas.reduce((s, f) => s + (f.custo_cents || 0), 0),
        }
      : {}),
  };
}

// --------------------------------------------------------------- Modo serra

/**
 * Passo a passo para quem está na serra: pegar a chapa, refilar, cada corte
 * com a medida e a guia, quando girar a peça, o fim de cada chapa (sobras para
 * guardar) e o fim do plano. `produz` lista os números das peças que ficam
 * prontas naquele passo.
 */
export function passosDaSerra(detalhes, { guiaParalelaMm = CONFIG_PADRAO.guia_paralela_mm } = {}) {
  const passos = [];
  detalhes.forEach((d, f) => {
    passos.push({ tipo: 'chapa', folha: f, produz: d.arvore?.tipo === 'peca' && !(d.medidas.refilo_mm > 0) ? [d.arvore.numero] : [] });
    if (d.medidas.refilo_mm > 0) {
      passos.push({ tipo: 'refilo', folha: f, refilo: d.medidas.refilo_mm, produz: d.arvore?.tipo === 'peca' ? [d.arvore.numero] : [] });
    }
    const pecasDe = (parte) => {
      const numeros = [];
      const visitar = (no) => {
        if (no.tipo === 'peca') numeros.push(no.numero);
        if (no.tipo === 'cortes') no.partes.forEach(visitar);
      };
      visitar(parte);
      return numeros;
    };
    const k = d.medidas.serra_decimos_mm / 10;
    const visitar = (no, rotulo, nivel, eixoPai) => {
      if (no.tipo !== 'cortes') return;
      const rotulos = no.partes.map((p, i) => (p.tipo === 'cortes' ? rotuloParte(rotulo, nivel, i) : ''));
      const tamanho = (p) => arred(no.eixo === 'y' ? p.h : p.w);
      const descrever = (p, i) => ({ tipo: p.tipo === 'cortes' ? 'parte' : p.tipo, rotulo: rotulos[i], numero: p.numero, regiao: { x: p.x, y: p.y, w: p.w, h: p.h }, medida: tamanho(p), pecas: pecasDe(p) });
      // Corte ao longo do lado comprido da região é longitudinal (guia paralela,
      // até a capacidade dela); atravessado ou mais largo que a guia, no carro.
      const comprido = no.eixo === 'y' ? no.w >= no.h : no.h >= no.w;
      const fimEixo = no.eixo === 'y' ? no.y + no.h : no.x + no.w;
      let inicio = no.eixo === 'y' ? no.y : no.x;
      let proxima = 0;
      no.cortes.forEach((c, j) => {
        const separada = c - inicio > EPS ? proxima++ : null;
        const ultimo = j === no.cortes.length - 1;
        const resto = ultimo && fimEixo - (c + k) > EPS ? proxima : null;
        const base = { tipo: 'corte', folha: f, eixo: no.eixo, girar: j === 0 && eixoPai !== null && eixoPai !== no.eixo, regiao: { x: no.x, y: no.y, w: no.w, h: no.h } };
        const produz = [];
        if (separada !== null && no.partes[separada].tipo === 'peca') produz.push(no.partes[separada].numero);
        if (resto !== null && no.partes[resto].tipo === 'peca') produz.push(no.partes[resto].numero);
        if (separada === null) {
          // Tira mais fina que o disco junto à borda: um corte de acerto.
          passos.push({ ...base, acerto: true, medida: arred(c + k - inicio), guia: 'carro', parte: null, resto: resto !== null ? descrever(no.partes[resto], resto) : null, produz });
        } else {
          const parte = no.partes[separada];
          const medida = tamanho(parte);
          passos.push({
            ...base,
            medida,
            guia: comprido && medida <= guiaParalelaMm + EPS ? 'paralela' : 'carro',
            parte: descrever(parte, separada),
            resto: resto !== null ? descrever(no.partes[resto], resto) : null,
            produz,
          });
        }
        inicio = c + k;
      });
      no.partes.forEach((p, i) => p.tipo === 'cortes' && visitar(p, rotulos[i], nivel + 1, no.eixo));
    };
    if (d.arvore) visitar(d.arvore, '', 0, null);
    passos.push({ tipo: 'fim_chapa', folha: f, sobras: d.sobras, produz: [] });
  });
  passos.push({ tipo: 'fim', produz: [] });
  return passos;
}

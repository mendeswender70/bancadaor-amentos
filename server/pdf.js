import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { formatarData, formatarDinheiro } from '../public/shared/calc.js';

// O PDF são as páginas do livro da proposta (public/js/proposta.js), uma por folha A4.
// As medidas seguem as do livro: 1 u = 1/380 da largura da página.
const K = 595.28 / 380;
const u = (n) => n * K;
const LARGURA = 380;
const ALTURA = 841.89 / K;
const ESQ = 30;
const DIR = LARGURA - 30;
const UTIL = DIR - ESQ;
const LIMITE = ALTURA - 46; // o conteúdo termina acima do rodapé
const MEIO = LARGURA / 2;

const COR = {
  papel: '#f2ecdf',
  tinta: '#1d1813',
  tinta2: '#5b5246',
  tinta3: '#8c8273',
  capa: '#13100d',
  ouro: '#d9b77e',
  creme: '#f1e9dc',
  creme2: '#b8ac9b',
  acento: '#8a5a2b',
  acentoForte: '#714a23',
  acentoFundo: '#613f1e',
  claro: '#fbf5ea',
  ok: '#2f7a52',
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const fonte = (arquivo) => readFileSync(new URL(`./fontes/${arquivo}`, import.meta.url));
const FONTES = {
  display: fonte('fraunces-display-400-normal.ttf'),
  displayItalica: fonte('fraunces-display-300-italic.ttf'),
  serif: fonte('fraunces-texto-400-normal.ttf'),
  serifItalica: fonte('fraunces-texto-300-italic.ttf'),
  sans: fonte('inter-latin-400-normal.woff'),
  sansMedia: fonte('inter-latin-500-normal.woff'),
  sansForte: fonte('inter-latin-600-normal.woff'),
};

// Ícones dos itens inclusos, os mesmos da página pública (traço em caixa de 24).
const ICONES = {
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  regua: ['M3.5 16 16 3.5 20.5 8 8 20.5z', 'm7.4 12.1 1.8 1.8M10.3 9.2l1.3 1.3M13.1 6.4l1.8 1.8'],
  projeto: [['rect', 4, 3.5, 16, 17, 2], 'M8 8h8M8 12h8M8 16h5'],
  dobradica: [['rect', 4, 4, 7, 16, 1.5], ['rect', 13, 4, 7, 16, 1.5], 'M11 8h2M11 16h2'],
  montagem: ['m14.5 6.5 3-3 3 3-3 3M17.5 3.5 9 12', 'M4 20l5-5 2 2-5 5z'],
  caminhao: ['M3 6.5h11v9.5H3zM14 10h4l3 3.2V16h-7', ['circ', 7, 17.5, 1.8], ['circ', 17, 17.5, 1.8]],
  escudo: ['M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z', 'm9 12 2.2 2.2L15.5 10'],
  limpeza: ['M14 3.5 11 11M7 11h8l1.5 9.5h-11z', 'M9.5 15v3M12.5 15v3'],
  chave: ['M15.5 4a4.5 4.5 0 0 0-4.3 5.9L4.5 16.6a1.4 1.4 0 0 0 0 2l.9.9a1.4 1.4 0 0 0 2 0l6.7-6.7A4.5 4.5 0 0 0 20 8.5l-2.8 1.4-2.1-2.1L16.5 5A4.5 4.5 0 0 0 15.5 4z'],
  ambiente: ['M3.5 20.5V10.2L12 3.5l8.5 6.7v10.3', 'M9 20.5v-6h6v6'],
};

const pad2 = (n) => String(n).padStart(2, '0');
const maiusculas = (s) => String(s || '').toLocaleUpperCase('pt-BR');

/** Quebra um parágrafo enorme em blocos de frases, para poder continuar na página seguinte. */
function blocosDeTexto(texto) {
  return String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .flatMap((par) => {
      if (par.length <= 420) return [par];
      const blocos = [];
      for (const frase of par.match(/[^.!?]+[.!?]*\s*/g) || [par]) {
        if (blocos.length && (blocos.at(-1) + frase).length <= 420) blocos[blocos.length - 1] += frase;
        else blocos.push(frase);
      }
      return blocos.map((b) => b.trim());
    });
}

/**
 * Gera o PDF do cliente a partir da visão do cliente (ver visaoCliente.js).
 * Este módulo não recebe — e portanto não consegue mostrar — preços internos.
 *
 * @param {ReturnType<import('./visaoCliente.js').visaoCliente>} v
 * @param {Buffer|null} logo PNG ou JPEG
 * @param {{aprovado_por?: string, aprovado_em?: string|Date}|null} [aprovacao] preenchido quando a proposta já foi aprovada
 * @returns {Promise<Buffer>}
 */
export function gerarPdf(v, logo, aprovacao = null) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: 0,
    autoFirstPage: false,
    info: { Title: `Proposta nº ${v.numero}`, Author: v.empresa.nome || '', Creator: 'esquadro' },
  });
  for (const [nome, dados] of Object.entries(FONTES)) doc.registerFont(nome, dados);
  const partes = [];
  doc.on('data', (p) => partes.push(p));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  // ------------------------------------------------------------------ Dados
  const empresa = String(v.empresa?.nome || '').trim() || 'Móveis planejados';
  const cliente = String(v.cliente?.nome || '').trim() || 'Cliente';
  const palavras = cliente.split(/\s+/);
  const resto = palavras.slice(1).join(' ');
  const nomeB = palavras.length > 2 && resto.length > 16 ? palavras.at(-1) : resto;
  const clienteCurto = palavras.length > 2 && cliente.length > 24 ? `${palavras[0]} ${palavras.at(-1)}` : cliente;
  const ambientes = v.ambientes || [];
  const servicos = v.servicos || [];
  const inclusos = Array.isArray(v.inclusos) ? v.inclusos : [];
  const nomes = ambientes.map((a) => String(a.nome || '').toLowerCase()).filter(Boolean);
  const lista = nomes.length > 3
    ? `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2} ambientes`
    : nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0] || 'móveis planejados';
  const totalMoveis = ambientes.reduce((soma, a) => soma + (a.itens || []).length, 0);
  const local = [v.cliente?.cidade, v.cliente?.estado].filter(Boolean).join(' – ');
  const validade = v.data_validade ? formatarData(v.data_validade) : `${v.validade_dias} dias`;
  const linhasPagamento = v.pagamento?.linhas || [];
  const descricaoPagamento = String(v.pagamento?.descricao || '').trim();
  const cartao = v.pagamento?.cartao || null;
  const credito = cartao?.credito || [];
  const parcelaDe = (o) => (o.valores_parcelas_cents?.length ? Math.max(...o.valores_parcelas_cents) : o.total_cents);
  const observacoes = blocosDeTexto(v.observacoes);
  const linhasInvestimento = [
    ...ambientes.map((a) => ({ nome: a.nome, valor: formatarDinheiro(a.subtotal_cents) })),
    ...servicos.map((s) => ({ nome: `${s.descricao}${(s.quantidade || 1) > 1 ? ` (${s.quantidade}x)` : ''}`, valor: formatarDinheiro(s.valor_cents) })),
    ...(v.acrescimo ? [{ nome: v.acrescimo.descricao, valor: formatarDinheiro(v.acrescimo.valor_cents) }] : []),
    ...(v.desconto_cents ? [{ nome: 'Desconto', valor: `− ${formatarDinheiro(v.desconto_cents)}`, especial: true }] : []),
  ];

  // ------------------------------------------------------------------ Desenho
  const usar = (f, t) => doc.font(f).fontSize(u(t));
  const opcoesTexto = ({ t = 10, espac = 0, w, alinhar = 'left', lh, maxLinhas }) => {
    const o = { characterSpacing: u(espac), lineBreak: w !== undefined };
    if (w !== undefined) Object.assign(o, { width: u(w), align: alinhar });
    if (lh) o.lineGap = u(t) * lh - doc.currentLineHeight(true);
    if (maxLinhas) Object.assign(o, { height: maxLinhas * (doc.currentLineHeight(true) + (o.lineGap || 0)) + 0.5, ellipsis: true });
    return o;
  };
  /** Texto com o topo em (x, y). Com `w`, quebra linhas e respeita `alinhar` e `lh`. */
  const escrever = (texto, x, y, o = {}) => {
    const { f = 'sans', t = 10, cor = COR.tinta, opacidade = 1 } = o;
    usar(f, t).fillColor(cor, opacidade);
    doc.text(String(texto ?? ''), u(x), u(y), opcoesTexto({ ...o, t }));
  };
  const altura = (texto, o = {}) => {
    const { f = 'sans', t = 10 } = o;
    usar(f, t);
    return doc.heightOfString(String(texto || ' '), opcoesTexto({ ...o, t })) / K;
  };
  const largura = (texto, { f = 'sans', t = 10, espac = 0 } = {}) => usar(f, t).widthOfString(String(texto ?? ''), { characterSpacing: u(espac) }) / K;
  const aDireita = (texto, xDireita, y, o = {}) => escrever(texto, xDireita - largura(texto, o), y, o);
  const centrado = (texto, y, o = {}) => escrever(texto, (o.centro ?? MEIO) - largura(texto, o) / 2, y, o);
  /** Rótulo em caixa alta, espaçado. */
  const rotulo = (texto, x, y, o = {}) => escrever(maiusculas(texto), x, y, { f: 'sansForte', t: 8, cor: COR.tinta3, ...o, espac: (o.t || 8) * (o.tracking ?? 0.2) });
  const larguraRotulo = (texto, o = {}) => largura(maiusculas(texto), { f: 'sansForte', t: 8, ...o, espac: (o.t || 8) * (o.tracking ?? 0.2) });
  const fio = (x1, y1, x2, y2, { cor = COR.tinta, opacidade = 0.15, espessura = 0.8, tracejado = null } = {}) => {
    doc.save();
    doc.moveTo(u(x1), u(y1)).lineTo(u(x2), u(y2)).lineWidth(u(espessura)).strokeColor(cor, opacidade);
    if (tracejado) doc.dash(u(tracejado[0]), { space: u(tracejado[1]) });
    doc.stroke();
    doc.restore();
  };
  /**
   * Título com trechos em fontes e cores diferentes ([texto, fonte, cor]), com quebra de linha
   * própria. Devolve a altura ocupada; com `desenhar: false`, só mede.
   */
  const titulo = (trechos, x, y, { t, lh = 1, w = UTIL, centro = false, tracking = -0.035, desenhar = true } = {}) => {
    const espac = t * tracking;
    const linhas = [[]];
    for (const [texto, f, cor] of trechos) {
      String(texto).split('\n').forEach((pedaco, i) => {
        if (i) linhas.push([]);
        for (const palavra of pedaco.split(/\s+/).filter(Boolean)) {
          const item = { palavra, f, cor, larg: largura(palavra, { f, t, espac }), espaco: largura(' ', { f, t, espac }) + espac };
          const atual = linhas.at(-1);
          const ocupado = atual.reduce((soma, p, k) => soma + p.larg + (k ? p.espaco : 0), 0);
          if (atual.length && ocupado + item.espaco + item.larg > w) linhas.push([item]);
          else atual.push(item);
        }
      });
    }
    if (desenhar) {
      linhas.forEach((linha, i) => {
        const total = linha.reduce((soma, p, k) => soma + p.larg + (k ? p.espaco : 0), 0);
        let cx = centro ? x + (w - total) / 2 : x;
        usar('display', t);
        const topo = y + i * t * lh + (t * lh - doc.currentLineHeight(true) / K) / 2;
        linha.forEach((p, k) => {
          if (k) cx += p.espaco;
          escrever(p.palavra, cx, topo, { f: p.f, t, cor: p.cor, espac });
          cx += p.larg;
        });
      });
    }
    return linhas.length * t * lh;
  };
  const T = (texto) => [texto, 'display', COR.tinta];
  const E = (texto) => [texto, 'displayItalica', COR.acento];

  /** Relevo em espinha de peixe dentro de um retângulo (que já deve estar recortado, se preciso). */
  const espinha = (x, y, w, h, intensidade = 1) => {
    doc.save();
    doc.rect(u(x), u(y), u(w), u(h)).clip();
    const passo = 7.5;
    for (const [dy, cor, opacidade] of [[0.75, '#000000', 0.5 * intensidade], [0, '#ffffff', 0.07 * intensidade]]) {
      for (let linha = y - passo; linha < y + h + passo; linha += passo) {
        doc.moveTo(u(x), u(linha + passo + dy));
        for (let cx = x, k = 0; cx <= x + w + passo; cx += passo, k++) doc.lineTo(u(cx), u(linha + (k % 2 ? 0 : passo) + dy));
      }
      doc.lineWidth(u(0.75)).strokeColor(cor, opacidade).stroke();
    }
    doc.restore();
  };
  const filete = (cx, y, cor = COR.ouro) => {
    fio(cx - 48, y, cx - 8, y, { cor, opacidade: 0.7 });
    fio(cx + 8, y, cx + 48, y, { cor, opacidade: 0.7 });
    doc.save();
    doc.rotate(45, { origin: [u(cx), u(y)] }).rect(u(cx - 2.5), u(y - 2.5), u(5), u(5)).fill(cor);
    doc.restore();
  };
  const monograma = (cx, cy, raio, cor, tamanho) => {
    doc.save();
    doc.circle(u(cx), u(cy), u(raio)).lineWidth(u(0.8)).strokeColor(cor).stroke();
    doc.restore();
    usar('displayItalica', tamanho);
    const letra = empresa.charAt(0).toLocaleUpperCase('pt-BR');
    escrever(letra, cx - largura(letra, { f: 'displayItalica', t: tamanho }) / 2, cy - doc.currentLineHeight(true) / K / 2, { f: 'displayItalica', t: tamanho, cor });
  };
  /** Logo da empresa centralizada numa caixa; devolve false se a imagem for inválida. */
  const desenharLogo = (cx, y, maxW, maxH) => {
    if (!logo) return false;
    try {
      const imagem = doc.openImage(logo);
      const escala = Math.min(u(maxW) / imagem.width, u(maxH) / imagem.height);
      doc.image(imagem, u(cx) - (imagem.width * escala) / 2, u(y) + (u(maxH) - imagem.height * escala) / 2, { width: imagem.width * escala });
      return true;
    } catch {
      return false; // logo inválida: fica o monograma
    }
  };
  const icone = (nome, x, y, tamanho, cor) => {
    doc.save();
    doc.translate(u(x), u(y)).scale(u(tamanho) / 24);
    for (const parte of ICONES[nome] || ICONES.check) {
      if (typeof parte === 'string') doc.path(parte);
      else if (parte[0] === 'rect') doc.roundedRect(parte[1], parte[2], parte[3], parte[4], parte[5]);
      else doc.circle(parte[1], parte[2], parte[3]);
    }
    doc.lineWidth(1.7).lineCap('round').lineJoin('round').strokeColor(cor).stroke();
    doc.restore();
  };

  // ------------------------------------------------------------------ Moldura das páginas
  const novaPagina = () => doc.addPage({ size: 'A4', margins: 0 });
  /** Folha de papel com moldura fina, cabeçalho centrado e rodapé com o número da página. */
  const folha = (n, { quadroClaro = false } = {}) => {
    novaPagina();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COR.papel);
    return () => {
      // A moldura e o rodapé entram por último, por cima do que a página desenhou.
      doc.save();
      doc.rect(u(11), u(11), u(LARGURA - 22), u(ALTURA - 22)).lineWidth(u(0.8)).strokeColor(quadroClaro ? COR.claro : COR.acento, quadroClaro ? 0.26 : 0.42).stroke();
      if (!quadroClaro) doc.rect(u(14), u(14), u(LARGURA - 28), u(ALTURA - 28)).lineWidth(u(0.5)).strokeColor(COR.acento, 0.2).stroke();
      doc.restore();
      const y = ALTURA - 30;
      rotulo(`Proposta Nº ${v.numero}`, ESQ, y + 3, { t: 7.6, tracking: 0.16 });
      const nome = maiusculas(clienteCurto);
      const larg = Math.min(larguraRotulo(nome, { t: 7.6, tracking: 0.16 }), 120);
      rotulo(nome.length > 30 ? `${nome.slice(0, 29)}…` : nome, DIR - larg, y + 3, { t: 7.6, tracking: 0.16 });
      const numero = String(n);
      const ln = largura(numero, { f: 'serifItalica', t: 17 });
      escrever(numero, MEIO - ln / 2, y - 4, { f: 'serifItalica', t: 17, cor: COR.acento });
      fio(MEIO - ln / 2 - 21, y + 7, MEIO - ln / 2 - 7, y + 7, { cor: COR.acento, opacidade: 0.6 });
      fio(MEIO + ln / 2 + 7, y + 7, MEIO + ln / 2 + 21, y + 7, { cor: COR.acento, opacidade: 0.6 });
    };
  };
  const cabecalho = (secao, cor = COR.tinta3, opacidade = 1) => {
    const a = maiusculas(empresa.length > 34 ? `${empresa.slice(0, 33)}…` : empresa);
    const b = maiusculas(secao);
    const o = { t: 7.6, tracking: 0.22, cor, opacidade };
    const total = larguraRotulo(a, o) + 20 + larguraRotulo(b, o);
    const x = MEIO - total / 2;
    rotulo(a, x, 34, o);
    rotulo('·', x + larguraRotulo(a, o) + 7, 34, o);
    rotulo(b, x + larguraRotulo(a, o) + 20, 34, o);
  };
  /** Topo padrão das páginas de papel: cabeçalho, sobretítulo e título. Devolve o y logo abaixo do título. */
  const abertura = (secao, sobre, trechos, t, margem = 10) => {
    cabecalho(secao);
    rotulo(sobre, ESQ, 72, { t: 8.4, tracking: 0.24, cor: COR.acentoForte });
    return 72 + 12 + 8 + titulo(trechos, ESQ, 92, { t, lh: 0.98 }) + margem;
  };
  const capaEscura = (espelhada = false) => {
    novaPagina();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COR.capa);
    espinha(0, 0, LARGURA, ALTURA);
    const luz = doc.radialGradient(u(LARGURA * 0.55), u(ALTURA * 0.22), 0, u(LARGURA * 0.55), u(ALTURA * 0.22), u(ALTURA * 0.5));
    luz.stop(0, '#ffd7a0', 0.13).stop(1, '#ffd7a0', 0);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(luz);
    const [esq, dir] = espelhada ? [15, LARGURA - 26] : [26, LARGURA - 15];
    doc.save();
    doc.rect(u(esq), u(15), u(dir - esq), u(ALTURA - 30)).lineWidth(u(0.8)).strokeColor(COR.ouro, 0.55).stroke();
    doc.rect(u(esq + 4), u(19), u(dir - esq - 8), u(ALTURA - 38)).lineWidth(u(0.5)).strokeColor(COR.ouro, 0.28).stroke();
    for (const [cx, cy, sx, sy] of [[esq - 3, 12, 1, 1], [dir + 3, 12, -1, 1], [esq - 3, ALTURA - 12, 1, -1], [dir + 3, ALTURA - 12, -1, -1]]) {
      doc.moveTo(u(cx), u(cy + 13 * sy)).lineTo(u(cx), u(cy)).lineTo(u(cx + 13 * sx), u(cy)).lineWidth(u(1.4)).strokeColor(COR.ouro, 1).stroke();
    }
    doc.restore();
    return (esq + dir) / 2;
  };
  const ouroHorizontal = (x, w) => {
    const g = doc.linearGradient(u(x), 0, u(x + w), 0);
    g.stop(0, '#b98b4c').stop(0.22, '#ecd09c').stop(0.42, '#d9b77e').stop(0.5, '#fff3d6').stop(0.58, '#d9b77e').stop(0.78, '#ecd09c').stop(1, '#b98b4c');
    return g;
  };

  // ------------------------------------------------------------------ Páginas
  const pgCapa = () => {
    const cx = capaEscura();
    if (!desenharLogo(cx, 52, 150, 54)) {
      doc.save();
      doc.circle(u(cx), u(79), u(30.7)).lineWidth(u(0.7)).strokeColor(COR.ouro, 0.45).stroke();
      doc.restore();
      monograma(cx, 79, 27, COR.ouro, 26);
    }
    const util = 300;
    const linhasNome = [[palavras[0], 'display'], ...(nomeB ? [[nomeB, 'displayItalica']] : [])];
    const maior = Math.max(...linhasNome.map(([s, f]) => largura(s, { f, t: 68, espac: 68 * -0.045 })));
    const t = Math.min(68, (68 * util) / maior);
    const subtitulo = lista.charAt(0).toLocaleUpperCase('pt-BR') + lista.slice(1);
    const hSub = altura(subtitulo, { f: 'serifItalica', t: 18, w: util, lh: 1.25, alinhar: 'center' });
    const bloco = 12 + 16 + linhasNome.length * t * 0.94 + 26 + hSub;
    let y = 130 + (ALTURA - 130 - 90 - bloco) / 2;
    const sobre = 'Proposta de móveis planejados';
    rotulo(sobre, cx - larguraRotulo(sobre, { t: 8.4, tracking: 0.3 }) / 2, y, { t: 8.4, tracking: 0.3, cor: COR.ouro, opacidade: 0.9 });
    y += 28;
    for (const [s, f] of linhasNome) {
      const larg = largura(s, { f, t, espac: t * -0.045 });
      usar(f, t);
      const topo = y + (t * 0.94 - doc.currentLineHeight(true) / K) / 2;
      escrever(s, cx - larg / 2, topo, { f, t, espac: t * -0.045, cor: ouroHorizontal(cx - larg / 2, larg) });
      y += t * 0.94;
    }
    filete(cx, y + 13);
    escrever(subtitulo, cx - util / 2, y + 26, { f: 'serifItalica', t: 18, cor: COR.creme, w: util, lh: 1.25, alinhar: 'center' });
    centrado(empresa, ALTURA - 82, { f: 'serif', t: 14.5, cor: COR.ouro, centro: cx });
    const [, mes, ano] = formatarData(v.data).split('/');
    const base = `Nº ${v.numero}${mes ? ` · ${MESES[Number(mes) - 1]} de ${ano}` : ''}`;
    rotulo(base, cx - larguraRotulo(base, { t: 8.6 }) / 2, ALTURA - 60, { t: 8.6, cor: COR.creme2 });
  };

  const pgCarta = (n) => {
    const fechar = folha(n);
    cabecalho('Carta');
    rotulo('Uma palavra antes', ESQ, 72, { t: 8.4, tracking: 0.24, cor: COR.acentoForte });
    let y = 92 + titulo([T('Olá,\n'), E(`${palavras[0]}.`)], ESQ, 92, { t: 54, lh: 0.92 }) + 20;
    const destaque = 'Esta proposta foi preparada para o seu espaço, móvel por móvel.';
    const hDestaque = altura(destaque, { f: 'serifItalica', t: 20.5, w: UTIL - 14, lh: 1.28 });
    doc.rect(u(ESQ), u(y), u(2.4), u(hDestaque)).fill(COR.acento);
    escrever(destaque, ESQ + 14, y, { f: 'serifItalica', t: 20.5, w: UTIL - 14, lh: 1.28 });
    y += hDestaque + 18;
    const itens = ['cada móvel com o seu valor', ...(inclusos.length ? ['o que já está incluso'] : []), 'o investimento total e as formas de pagamento'];
    const corpo = `Nas próximas páginas você encontra ${lista}: ${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}. A proposta vale até ${validade}. Se quiser ajustar algum detalhe antes de aprovar, é só chamar.`;
    const yAssina = LIMITE - 46;
    const estiloCorpo = [[13.4, 1.7], [12.4, 1.6], [11.4, 1.5]].find(([t, lh]) => y + altura(corpo, { t, w: UTIL, lh }) <= yAssina - 30) || [10.6, 1.45];
    escrever(corpo, ESQ, y, { t: estiloCorpo[0], cor: COR.tinta2, w: UTIL, lh: estiloCorpo[1] });
    fio(ESQ, yAssina - 14, DIR, yAssina - 14);
    monograma(ESQ + 20, yAssina + 20, 20, COR.acento, 19);
    const contato = [v.empresa?.telefone, v.empresa?.email].filter(Boolean).join(' · ');
    escrever(empresa, ESQ + 54, yAssina + (contato ? 5 : 12), { f: 'sansForte', t: 13 });
    if (contato) escrever(contato, ESQ + 54, yAssina + 23, { t: 10.8, cor: COR.tinta3 });
    fechar();
  };

  const pgSumario = (n, mapa) => {
    const fechar = folha(n);
    let y = abertura('Sumário', 'Neste livro', [T('O seu '), E('projeto')], 46);
    const yFatos = LIMITE - 96;
    const passo = Math.min(37, (yFatos - 12 - y) / mapa.length);
    const escala = Math.min(1, passo / 30);
    for (const [ordem, nome, pagina] of mapa) {
      const meio = y + passo / 2;
      const t = 19 * escala;
      escrever(ordem, ESQ, meio - t * 0.62, { f: 'serifItalica', t: 18 * escala, cor: COR.acento });
      let texto = String(nome);
      while (texto.length > 4 && largura(texto, { f: 'serif', t, espac: t * -0.015 }) > UTIL - 80) texto = `${texto.slice(0, -2).trimEnd()}…`;
      escrever(texto, ESQ + 32, meio - t * 0.66, { f: 'serif', t, espac: t * -0.015 });
      const fimNome = ESQ + 32 + largura(texto, { f: 'serif', t, espac: t * -0.015 }) + 8;
      const numero = String(pagina);
      const ln = largura(numero, { f: 'serif', t: 15 * escala });
      if (DIR - ln - 8 > fimNome) fio(fimNome, meio + t * 0.28, DIR - ln - 8, meio + t * 0.28, { opacidade: 0.35, espessura: 1, tracejado: [0.2, 2.4] });
      escrever(numero, DIR - ln, meio - t * 0.5, { f: 'serif', t: 15 * escala });
      fio(ESQ, y + passo, DIR, y + passo);
      y += passo;
    }
    fio(ESQ, yFatos, DIR, yFatos, { opacidade: 1, espessura: 1.6 });
    const fatos = [
      ['Ambientes', `${ambientes.length} · ${totalMoveis} ${totalMoveis === 1 ? 'móvel' : 'móveis'}`],
      local ? ['Local', local] : ['Emissão', formatarData(v.data)],
      ['Entrega', v.prazo_entrega || 'A combinar'],
      ['Válida até', validade],
    ];
    fatos.forEach(([dt, dd], i) => {
      const x = ESQ + (i % 2) * (UTIL / 2 + 8);
      const fy = yFatos + 12 + Math.floor(i / 2) * 43;
      rotulo(dt, x, fy, { t: 8, tracking: 0.18 });
      escrever(dd, x, fy + 11, { f: 'sansMedia', t: 12.2, w: UTIL / 2 - 12, lh: 1.25, maxLinhas: 2 });
    });
    fechar();
  };

  // Ambiente: bloco na cor da marca com numeral gigante, depois os móveis com o valor de cada um.
  const medidasBloco = (a, continua) => {
    const tTitulo = continua ? 26 : 40;
    const hTitulo = titulo([[a.nome, 'display', COR.claro]], 0, 0, { t: tTitulo, lh: 0.94, w: UTIL * 0.8, tracking: -0.04, desenhar: false });
    const descricao = continua ? '' : String(a.descricao || '').trim();
    const hDescricao = descricao ? altura(descricao, { t: 11, w: UTIL * 0.76, lh: 1.5 }) : 0;
    const pilha = 12 + 6 + hTitulo + (hDescricao ? 8 + hDescricao : 0);
    // Continuação: faixa baixa, só para lembrar de qual ambiente são os móveis.
    const minimo = continua ? 0 : ALTURA * 0.31;
    const topo = continua ? 64 : Math.max(62, minimo - 20 - pilha);
    return { tTitulo, hTitulo, descricao, pilha, topo, tNumeral: continua ? 120 : 176, altura: Math.max(minimo, topo + pilha + (continua ? 14 : 20)) };
  };
  // Cada móvel numa linha: nome, pontilhado e valor. Nome comprido quebra e o valor acompanha a última linha.
  // `e` é a escala da lista: antes de dividir em duas páginas, a letra pode ficar até 14% menor.
  const estiloItem = (e) => ({ f: 'serif', t: 16 * e, lh: 1.22, espac: 16 * e * -0.012 });
  const textoItem = (item) => `${item.descricao}${(item.quantidade || 1) > 1 ? `  ·  ${item.quantidade} un.` : ''}`;
  const larguraNomeItem = (item, e) => UTIL - largura(formatarDinheiro(item.valor_cents), { f: 'sansForte', t: 12.6 * e }) - 14;
  const alturaItem = (item, e = 1) => 19 * e + altura(textoItem(item), { ...estiloItem(e), w: larguraNomeItem(item, e) });
  const pgAmbiente = (n, a, i, itens, continua, ultima, e = 1) => {
    const fechar = folha(n, { quadroClaro: true });
    const m = medidasBloco(a, continua);
    const fundo = doc.linearGradient(0, 0, u(LARGURA * 0.6), u(m.altura));
    fundo.stop(0, COR.acento).stop(1, COR.acentoFundo);
    doc.rect(0, 0, doc.page.width, u(m.altura)).fill(fundo);
    espinha(0, 0, LARGURA, m.altura, 0.55);
    doc.save();
    doc.rect(0, 0, doc.page.width, u(m.altura)).clip();
    const numeral = pad2(i + 1);
    const tn = m.tNumeral;
    const ln = largura(numeral, { f: 'displayItalica', t: tn, espac: tn * -0.06 });
    usar('displayItalica', tn);
    escrever(numeral, LARGURA - 14 - ln, m.altura + tn * 0.27 - doc.currentLineHeight(true) / K, { f: 'displayItalica', t: tn, espac: tn * -0.06, cor: '#ffffff', opacidade: 0.17 });
    doc.restore();
    cabecalho(`Ambiente ${pad2(i + 1)} de ${pad2(ambientes.length)}`, COR.claro, 0.72);
    rotulo(continua ? 'Continuação' : 'Ambiente', ESQ, m.topo, { t: 8.4, tracking: 0.24, cor: COR.claro, opacidade: 0.8 });
    titulo([[a.nome, 'display', COR.claro]], ESQ, m.topo + 18, { t: m.tTitulo, lh: 0.94, w: UTIL * 0.8, tracking: -0.04 });
    if (m.descricao) escrever(m.descricao, ESQ, m.topo + 18 + m.hTitulo + 8, { t: 11, cor: COR.claro, opacidade: 0.82, w: UTIL * 0.76, lh: 1.5 });

    let y = m.altura + 4;
    if (!itens.length) escrever('Itens a definir', ESQ, y + 13, { f: 'serifItalica', t: 15, cor: COR.tinta3 });
    for (const item of itens) {
      const nome = textoItem(item);
      const w = larguraNomeItem(item, e);
      const estilo = estiloItem(e);
      const hNome = altura(nome, { ...estilo, w });
      escrever(nome, ESQ, y + 9.5 * e, { ...estilo, w });
      const valor = formatarDinheiro(item.valor_cents);
      const lv = largura(valor, { f: 'sansForte', t: 12.6 * e });
      const yValor = y + 9.5 * e + hNome - 16 * e * 1.22 + 3.4 * e; // na altura da última linha do nome
      aDireita(valor, DIR, yValor, { f: 'sansForte', t: 12.6 * e });
      const fimNome = ESQ + largura(nome, estilo) + 8;
      if (hNome < 16 * e * 1.22 + 2 && DIR - lv - 8 - fimNome > 8) fio(fimNome, yValor + 10.6 * e, DIR - lv - 8, yValor + 10.6 * e, { opacidade: 0.35, espessura: 1, tracejado: [0.2, 2.4] });
      y += 19 * e + hNome;
      fio(ESQ, y, DIR, y);
    }
    if (ultima) {
      const yTotal = LIMITE - 40;
      fio(ESQ, yTotal, DIR, yTotal, { opacidade: 1, espessura: 1.6 });
      rotulo('Total do ambiente', ESQ, yTotal + 24, { t: 8.2 });
      aDireita(formatarDinheiro(a.subtotal_cents), DIR, yTotal + 8, { f: 'display', t: 33, espac: 33 * -0.035 });
    } else {
      aDireita('continua na próxima página', DIR, LIMITE - 16, { f: 'serifItalica', t: 13, cor: COR.tinta3 });
    }
    fechar();
  };
  /** Divide os móveis de um ambiente em páginas: [[inicio, fim], ...]. */
  const fatiasAmbiente = (a) => {
    const itens = a.itens || [];
    if (!itens.length) return [[0, 0]];
    const fatias = [];
    let inicio = 0;
    while (inicio < itens.length) {
      const topo = medidasBloco(a, inicio > 0).altura + 4;
      const cabem = (limite, e = 1) => {
        let y = topo, k = inicio;
        while (k < itens.length && y + alturaItem(itens[k], e) <= limite) y += alturaItem(itens[k++], e);
        return k;
      };
      // O que falta cabe nesta página, com o total do ambiente, se a letra diminuir um pouco?
      const escala = [1, 0.93, 0.86].find((e) => cabem(LIMITE - 52, e) === itens.length);
      const fim = escala ? itens.length : Math.max(inicio + 1, cabem(LIMITE - 24)); // senão, "continua"
      fatias.push([inicio, fim, escala || 1]);
      inicio = fim;
    }
    return fatias;
  };

  const alturaIncluso = (item) => {
    const w = UTIL - 46 - 30;
    return Math.max(34, altura(item.titulo, { f: 'sansForte', t: 13.2, w }) + (item.descricao ? 2 + altura(item.descricao, { t: 10.8, w, lh: 1.4 }) : 0)) + 14;
  };
  const TOPO_INCLUSO = 150;
  const pgIncluso = (n, itens, continua, inicio) => {
    const fechar = folha(n);
    abertura('Incluso', continua ? 'Continuação' : 'Sem custo extra', [T('Já está '), E('incluso')], 40);
    const ocupado = itens.reduce((soma, item) => soma + alturaIncluso(item), 0);
    const folga = Math.min(16, Math.max(0, (LIMITE - TOPO_INCLUSO - ocupado) / (itens.length + 1)));
    let y = TOPO_INCLUSO + folga;
    itens.forEach((item, k) => {
      const h = alturaIncluso(item);
      const w = UTIL - 46 - 30;
      doc.circle(u(ESQ + 17), u(y + 17), u(17)).fill(COR.acento);
      icone(item.icone, ESQ + 9, y + 9, 16, COR.claro);
      const hTitulo = altura(item.titulo, { f: 'sansForte', t: 13.2, w });
      const hTexto = hTitulo + (item.descricao ? 2 + altura(item.descricao, { t: 10.8, w, lh: 1.4 }) : 0);
      const topo = y + Math.max(0, (34 - hTexto) / 2);
      escrever(item.titulo, ESQ + 46, topo, { f: 'sansForte', t: 13.2, w });
      if (item.descricao) escrever(item.descricao, ESQ + 46, topo + hTitulo + 2, { t: 10.8, cor: COR.tinta2, w, lh: 1.4 });
      aDireita(pad2(inicio + k + 1), DIR, y + 7, { f: 'serifItalica', t: 18, cor: COR.acento });
      fio(ESQ, y + h - 4, DIR, y + h - 4);
      y += h + folga;
    });
    fechar();
  };

  const TOPO_INVESTIMENTO = 158;
  const ALTURA_TOTAL = 132;
  const alturaLinha = (l, e = 1) => altura(l.nome, { t: 12.6 * e, w: UTIL - 110 }) + 20 * e;
  const pgInvestimento = (n, linhas, continua, ultima, e = 1) => {
    const fechar = folha(n);
    abertura('Investimento', continua ? 'Continuação' : 'Valores', [T('O seu '), E('investimento')], 44);
    let y = TOPO_INVESTIMENTO;
    for (const l of linhas) {
      const h = alturaLinha(l, e);
      escrever(l.nome, ESQ, y + 10 * e, { t: 12.6 * e, cor: l.especial ? COR.ok : COR.tinta2, w: UTIL - 110 });
      aDireita(l.valor, DIR, y + 10 * e, { f: 'sansForte', t: 12.6 * e, cor: l.especial ? COR.ok : COR.tinta });
      fio(ESQ, y + h, DIR, y + h);
      y += h;
    }
    if (ultima) {
      const yCaixa = LIMITE - ALTURA_TOTAL;
      doc.save();
      doc.roundedRect(u(ESQ), u(yCaixa), u(UTIL), u(ALTURA_TOTAL), u(14)).clip();
      doc.rect(u(ESQ), u(yCaixa), u(UTIL), u(ALTURA_TOTAL)).fill('#15120f');
      espinha(ESQ, yCaixa, UTIL, ALTURA_TOTAL);
      doc.restore();
      filete(MEIO, yCaixa + 24);
      const texto = 'Total da proposta';
      rotulo(texto, MEIO - larguraRotulo(texto, { t: 8.6, tracking: 0.26 }) / 2, yCaixa + 38, { t: 8.6, tracking: 0.26, cor: COR.ouro });
      const total = formatarDinheiro(v.total_cents);
      const t = Math.min(43, (43 * (UTIL - 40)) / largura(total, { f: 'display', t: 43, espac: 43 * -0.045 }));
      const lt = largura(total, { f: 'display', t, espac: t * -0.045 });
      const ouro = doc.linearGradient(0, u(yCaixa + 54), 0, u(yCaixa + 54 + t * 1.1));
      ouro.stop(0, '#fff6e6').stop(0.58, '#ecc994').stop(1, '#b88a4c');
      escrever(total, MEIO - lt / 2, yCaixa + 52, { f: 'display', t, espac: t * -0.045, cor: ouro });
      const maior = credito.length > 1 ? credito.at(-1) : null;
      const nota = maior ? `ou ${credito.length}x de ${formatarDinheiro(parcelaDe(maior))} no cartão` : descricaoPagamento;
      if (nota) centrado(nota.length > 60 ? `${nota.slice(0, 59)}…` : nota, yCaixa + 104, { t: 11, cor: COR.creme2 });
    } else {
      aDireita('continua na próxima página', DIR, LIMITE - 16, { f: 'serifItalica', t: 13, cor: COR.tinta3 });
    }
    fechar();
  };
  const fatiasInvestimento = () => {
    // Tudo numa página só, com o total, se a letra puder diminuir um pouco.
    const tudo = (e) => linhasInvestimento.reduce((soma, l) => soma + alturaLinha(l, e), 0);
    const escala = [1, 0.92, 0.84, 0.76].find((e) => TOPO_INVESTIMENTO + tudo(e) <= LIMITE - ALTURA_TOTAL - 12);
    if (escala) return [[0, linhasInvestimento.length, escala]];
    const fatias = [];
    let inicio = 0;
    do {
      const cabem = (limite) => {
        let y = TOPO_INVESTIMENTO, k = inicio;
        while (k < linhasInvestimento.length && y + alturaLinha(linhasInvestimento[k]) <= limite) y += alturaLinha(linhasInvestimento[k++]);
        return k;
      };
      let fim = cabem(LIMITE - ALTURA_TOTAL - 12);
      if (fim < linhasInvestimento.length) fim = Math.max(inicio + 1, cabem(LIMITE - 24));
      fatias.push([inicio, fim]);
      inicio = fim;
    } while (inicio < linhasInvestimento.length);
    // O total nunca fica espremido: se a última fatia não deixou espaço, ele vai sozinho na página seguinte.
    const [x, y] = fatias.at(-1);
    const usado = linhasInvestimento.slice(x, y).reduce((soma, l) => soma + alturaLinha(l), 0);
    if (TOPO_INVESTIMENTO + usado > LIMITE - ALTURA_TOTAL - 12) fatias.push([y, y]);
    return fatias;
  };

  const pgPagamento = (n) => {
    const fechar = folha(n);
    let y = abertura('Pagamento', 'Formas de pagamento', [T('Como '), E('pagar')], 38, 12);
    const caixa = (tituloCaixa, desenharConteudo, hConteudo) => {
      const h = 14 + 20 + hConteudo + 12;
      doc.save();
      doc.roundedRect(u(ESQ), u(y), u(UTIL), u(h), u(12)).lineWidth(u(0.8)).strokeColor(COR.tinta, 0.15).stroke();
      doc.restore();
      escrever(tituloCaixa, ESQ + 14, y + 11, { f: 'serif', t: 16, espac: 16 * -0.015 });
      desenharConteudo(y + 14 + 20);
      y += h + 10;
    };
    const pares = [
      ...(descricaoPagamento ? [['Condição', descricaoPagamento]] : []),
      ...linhasPagamento.map((l) => { const [rot, ...restoLinha] = l.split(':'); return restoLinha.length ? [rot.trim(), restoLinha.join(':').trim()] : ['', l]; }),
      ['Total', formatarDinheiro(v.total_cents)],
    ];
    const alturaPar = ([rot, valor]) => Math.max(15, altura(valor, { f: 'sansMedia', t: 10.6, w: rot ? UTIL - 28 - 90 : UTIL - 28, alinhar: rot ? 'right' : 'left' }) + 4);
    caixa('Condição combinada', (topo) => {
      let py = topo;
      for (const par of pares) {
        const [rot, valor] = par;
        if (rot) escrever(rot, ESQ + 14, py, { t: 10.6, cor: COR.tinta2 });
        escrever(valor, rot ? ESQ + 14 + 90 : ESQ + 14, py, { f: 'sansMedia', t: 10.6, w: rot ? UTIL - 28 - 90 : UTIL - 28, alinhar: rot ? 'right' : 'left' });
        py += alturaPar(par);
      }
    }, pares.reduce((soma, par) => soma + alturaPar(par), 0));
    if (cartao) {
      // Opções do cartão em duas colunas: parcelas à esquerda, total com a taxa à direita.
      const opcoes = [...(cartao.debito ? [cartao.debito] : []), ...credito];
      const porColuna = Math.ceil(opcoes.length / 2);
      const passo = Math.min(16, (LIMITE - 54 - 44 - y - 46 - 14) / porColuna);
      const t = Math.min(9, passo * 0.6);
      const vao = 18;
      const largCol = (UTIL - 28 - vao) / 2;
      caixa(`Cartão${cartao.nome ? ` · ${cartao.nome}` : ''}`, (topo) => {
        for (const coluna of [0, 1]) {
          const x = ESQ + 14 + coluna * (largCol + vao);
          if (coluna && opcoes.length < 2) break;
          rotulo('Parcelas', x, topo, { t: 7.2, tracking: 0.12 });
          rotulo('Total', x + largCol - larguraRotulo('Total', { t: 7.2, tracking: 0.12 }), topo, { t: 7.2, tracking: 0.12 });
        }
        opcoes.forEach((o, i) => {
          const x = ESQ + 14 + Math.floor(i / porColuna) * (largCol + vao);
          const py = topo + 14 + (i % porColuna) * passo;
          fio(x, py - 1, x + largCol, py - 1);
          const vezes = o.valores_parcelas_cents?.length || 1;
          const yTexto = py + (passo - t * 1.25) / 2;
          escrever(vezes > 1 ? `${vezes}x de ${formatarDinheiro(parcelaDe(o))}` : o.tipo, x, yTexto, { t, cor: COR.tinta2 });
          aDireita(formatarDinheiro(o.total_cents), x + largCol, yTexto, { f: 'sansForte', t });
        });
      }, 14 + porColuna * passo);
      escrever(`No cartão, o valor já inclui a taxa; o pagamento é combinado direto com ${empresa}.`, ESQ, y, { t: 9.6, cor: COR.tinta3, w: UTIL, lh: 1.5 });
    }
    const yFatos = LIMITE - 54;
    fio(ESQ, yFatos, DIR, yFatos);
    [['Entrega', v.prazo_entrega || 'A combinar'], ['Válida até', validade]].forEach(([dt, dd], i) => {
      const x = ESQ + i * (UTIL / 2 + 8);
      rotulo(dt, x, yFatos + 11, { t: 8, tracking: 0.18 });
      escrever(dd, x, yFatos + 22, { f: 'sansMedia', t: 12.2, w: UTIL / 2 - 12, lh: 1.25, maxLinhas: 2 });
    });
    fechar();
  };

  const TOPO_OBSERVACOES = 150;
  const alturaObservacao = (texto) => altura(texto, { t: 12.4, w: UTIL, lh: 1.6 }) + 11;
  const pgObservacoes = (n, paragrafos, continua) => {
    const fechar = folha(n);
    abertura('Observações', continua ? 'Continuação' : 'Antes de aprovar', [T('Vale '), E('saber')], 40);
    let y = TOPO_OBSERVACOES;
    for (const texto of paragrafos) {
      escrever(texto, ESQ, y, { t: 12.4, cor: COR.tinta2, w: UTIL, lh: 1.6 });
      y += alturaObservacao(texto);
    }
    fechar();
  };
  const fatiasObservacoes = () => {
    const fatias = [];
    let inicio = 0;
    while (inicio < observacoes.length) {
      let y = TOPO_OBSERVACOES, fim = inicio;
      while (fim < observacoes.length && (fim === inicio || y + alturaObservacao(observacoes[fim]) <= LIMITE)) y += alturaObservacao(observacoes[fim++]);
      fatias.push([inicio, fim]);
      inicio = fim;
    }
    return fatias;
  };

  const selo = (cx, cy) => {
    doc.save();
    doc.circle(u(cx), u(cy), u(75)).lineWidth(u(1.3)).strokeColor(COR.acentoForte).stroke();
    doc.circle(u(cx), u(cy), u(48)).lineWidth(u(1.3)).strokeColor(COR.acentoForte).stroke();
    const ouro = doc.linearGradient(u(cx - 40), u(cy - 40), u(cx + 40), u(cy + 40));
    ouro.stop(0, '#f3dcae').stop(0.55, '#d9b77e').stop(1, '#9c7339');
    doc.circle(u(cx), u(cy), u(40)).fill(ouro);
    doc.moveTo(u(cx - 18), u(cy + 1)).lineTo(u(cx - 6), u(cy + 13)).lineTo(u(cx + 18), u(cy - 13)).lineWidth(u(6)).lineCap('round').lineJoin('round').strokeColor('#1c1407').stroke();
    // Texto em volta do selo, letra a letra.
    const texto = `PROPOSTA APROVADA · ${empresa.length <= 22 ? maiusculas(empresa) : 'PROPOSTA APROVADA'} · `;
    const raio = 59;
    usar('sansForte', 9.6).fillColor(COR.acentoForte);
    const passo = 360 / texto.length;
    [...texto].forEach((letra, i) => {
      doc.save();
      doc.rotate(-90 + i * passo + passo / 2, { origin: [u(cx), u(cy)] });
      doc.text(letra, u(cx) - doc.widthOfString(letra) / 2, u(cy - raio) - doc.currentLineHeight(true) / 2, { lineBreak: false });
      doc.restore();
    });
    doc.restore();
  };
  const pgAprovacao = (n) => {
    const fechar = folha(n);
    cabecalho('Aprovação');
    const sobre = (texto, y) => rotulo(texto, MEIO - larguraRotulo(texto, { t: 8.4, tracking: 0.24 }) / 2, y, { t: 8.4, tracking: 0.24, cor: COR.acentoForte });
    if (aprovacao) {
      const y = 108;
      sobre('Aprovação registrada', y);
      const h = titulo([T('Proposta '), E('aprovada')], ESQ, y + 20, { t: 38, lh: 1, centro: true });
      selo(MEIO, y + 20 + h + 100);
      const em = aprovacao.aprovado_em ? new Date(aprovacao.aprovado_em) : null;
      const quando = em && !Number.isNaN(em.getTime())
        ? `em ${em.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${em.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`
        : '';
      let yInfo = y + 20 + h + 196;
      for (const [texto, forte] of [[aprovacao.aprovado_por ? `Aprovada por ${aprovacao.aprovado_por}` : '', true], [quando, false], [`Total aprovado: ${formatarDinheiro(v.total_cents)}`, true]]) {
        if (!texto) continue;
        centrado(texto, yInfo, { f: forte ? 'sansMedia' : 'sans', t: 12, cor: forte ? COR.tinta : COR.tinta2 });
        yInfo += 20;
      }
    } else {
      const y = 132;
      sobre(`Válida até ${validade}`, y);
      const h = titulo([T('Para '), E('aprovar')], ESQ, y + 20, { t: 38, lh: 1, centro: true });
      const texto = `Abra o link da proposta no celular para simular o pagamento e aprovar em poucos segundos. Se preferir, assine abaixo e envie uma foto para ${empresa}.`;
      escrever(texto, ESQ + 30, y + 20 + h + 18, { t: 12, cor: COR.tinta2, w: UTIL - 60, lh: 1.6, alinhar: 'center' });
      const yResumo = y + 20 + h + 110;
      const total = formatarDinheiro(v.total_cents);
      const larg = Math.max(largura(total, { f: 'sansMedia', t: 11.4 }), larguraRotulo('Total', { t: 7.8 })) + 24;
      doc.save();
      doc.roundedRect(u(MEIO - larg / 2), u(yResumo), u(larg), u(38), u(10)).lineWidth(u(0.8)).strokeColor(COR.tinta, 0.15).stroke();
      doc.restore();
      rotulo('Total', MEIO - larg / 2 + 12, yResumo + 8, { t: 7.8, tracking: 0.16 });
      escrever(total, MEIO - larg / 2 + 12, yResumo + 19, { f: 'sansMedia', t: 11.4 });
      const yAss = LIMITE - 70;
      const meioCol = ESQ + UTIL * 0.62;
      fio(ESQ, yAss, meioCol - 7, yAss, { opacidade: 1 });
      fio(meioCol + 7, yAss, DIR, yAss, { opacidade: 1 });
      escrever(`Assinatura de ${clienteCurto}`, ESQ, yAss + 6, { t: 8.8, cor: COR.tinta3 });
      escrever('Data', meioCol + 7, yAss + 6, { t: 8.8, cor: COR.tinta3 });
    }
    fechar();
  };

  const pgContra = () => {
    const cx = capaEscura(true);
    const e = v.empresa || {};
    const contatos = [
      [e.telefone, e.whatsapp && e.whatsapp !== e.telefone ? `WhatsApp ${e.whatsapp}` : ''].filter(Boolean).join(' · '),
      e.email,
      [e.endereco, [e.cidade, e.estado].filter(Boolean).join(' – ')].filter(Boolean).join(' · '),
      e.cnpj ? `CNPJ ${e.cnpj}` : '',
    ].filter(Boolean);
    const util = 290;
    const tNome = Math.min(30, (30 * util) / largura(empresa, { f: 'display', t: 30, espac: 30 * -0.02 }));
    const hContatos = contatos.reduce((soma, c) => soma + altura(c, { t: 11, w: util, lh: 1.8, alinhar: 'center' }), 0);
    let y = (ALTURA - (54 + 16 + tNome * 1.05 + 30 + hContatos)) / 2;
    if (!desenharLogo(cx, y, 150, 54)) monograma(cx, y + 27, 27, COR.ouro, 26);
    y += 54 + 16;
    const ln = largura(empresa, { f: 'display', t: tNome, espac: tNome * -0.02 });
    escrever(empresa, cx - ln / 2, y, { f: 'display', t: tNome, espac: tNome * -0.02, cor: ouroHorizontal(cx - ln / 2, ln) });
    y += tNome * 1.05 + 14;
    filete(cx, y);
    y += 16;
    for (const c of contatos) {
      escrever(c, cx - util / 2, y, { t: 11, cor: COR.creme2, w: util, lh: 1.8, alinhar: 'center' });
      y += altura(c, { t: 11, w: util, lh: 1.8, alinhar: 'center' });
    }
    const base = 'Proposta feita com esquadro';
    rotulo(base, cx - larguraRotulo(base, { t: 8.6 }) / 2, ALTURA - 58, { t: 8.6, cor: COR.creme2 });
  };

  // ------------------------------------------------------------------ Montagem
  // Primeiro o roteiro (para o sumário saber em que página cada parte começa), depois o desenho.
  doc.addPage({ size: 'A4', margins: 0 }); // página de rascunho: as medições precisam de uma página aberta
  const roteiro = [{ chave: 'capa', fazer: () => pgCapa() }, { chave: 'carta', fazer: (n) => pgCarta(n) }, { chave: 'sumario' }];
  ambientes.forEach((a, i) => fatiasAmbiente(a).forEach(([x, y, e], k, todas) =>
    roteiro.push({ chave: k ? '' : `amb-${i}`, fazer: (n) => pgAmbiente(n, a, i, (a.itens || []).slice(x, y), k > 0, k === todas.length - 1, e) })));
  if (inclusos.length) {
    let inicio = 0;
    while (inicio < inclusos.length) {
      let y = TOPO_INCLUSO, fim = inicio;
      while (fim < inclusos.length && (fim === inicio || y + alturaIncluso(inclusos[fim]) <= LIMITE)) y += alturaIncluso(inclusos[fim++]);
      const [x, primeiro] = [inicio, inicio === 0];
      const itens = inclusos.slice(inicio, fim);
      roteiro.push({ chave: primeiro ? 'incluso' : '', fazer: (n) => pgIncluso(n, itens, !primeiro, x) });
      inicio = fim;
    }
  }
  fatiasInvestimento().forEach(([x, y, e], k, todas) =>
    roteiro.push({ chave: k ? '' : 'investimento', fazer: (n) => pgInvestimento(n, linhasInvestimento.slice(x, y), k > 0, k === todas.length - 1, e) }));
  roteiro.push({ chave: 'pagamento', fazer: (n) => pgPagamento(n) });
  fatiasObservacoes().forEach(([x, y], k) =>
    roteiro.push({ chave: k ? '' : 'observacoes', fazer: (n) => pgObservacoes(n, observacoes.slice(x, y), k > 0) }));
  roteiro.push({ chave: 'aprovacao', fazer: (n) => pgAprovacao(n) }, { chave: 'contra', fazer: () => pgContra() });

  const onde = (chave) => roteiro.findIndex((p) => p.chave === chave);
  const partesFinais = [
    ...(onde('incluso') > 0 ? [['Já está incluso', onde('incluso')]] : []),
    ['Investimento', onde('investimento')],
    ['Pagamento', onde('pagamento')],
    ...(onde('observacoes') > 0 ? [['Observações', onde('observacoes')]] : []),
    ['Aprovação', onde('aprovacao')],
  ];
  const mapa = [
    ...ambientes.map((a, i) => [pad2(i + 1), a.nome, onde(`amb-${i}`)]),
    ...partesFinais.map(([nome, pagina], k) => [pad2(ambientes.length + k + 1), nome, pagina]),
  ];
  roteiro[2].fazer = (n) => pgSumario(n, mapa);

  // A página de rascunho vira a capa: novaPagina() só acrescenta páginas a partir da segunda.
  let primeira = true;
  const acrescentar = doc.addPage.bind(doc);
  doc.addPage = (opcoes) => {
    if (primeira) {
      primeira = false;
      return doc;
    }
    return acrescentar(opcoes);
  };
  roteiro.forEach((pagina, n) => pagina.fazer(n));

  doc.end();
  return pronto;
}

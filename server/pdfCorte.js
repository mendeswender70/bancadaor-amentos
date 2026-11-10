import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { formatarDinheiro } from '../public/shared/calc.js';
import { MODOS_CORTE, detalharChapas, expandirPecas, formatarMetros, formatarMm, ladosComFita, ladosNoDesenho, textoPasso } from '../public/shared/corte.js';

// PDF de produção para levar à serra: A4 deitado, pensado para imprimir em
// preto e branco. Primeiro o resumo e a lista de peças; depois uma página por
// chapa, com o desenho à esquerda e o roteiro de cortes à direita.

const fonte = (arquivo) => readFileSync(new URL(`./fontes/${arquivo}`, import.meta.url));
const FONTES = {
  normal: fonte('inter-latin-400-normal.woff'),
  media: fonte('inter-latin-500-normal.woff'),
  forte: fonte('inter-latin-600-normal.woff'),
};

const COR = { tinta: '#1d1813', suave: '#5b5246', fraco: '#8c8273', linha: '#cfc6b8', peca: '#efe7da', sobra: '#ffffff', refilo: '#d9d2c6', fita: '#1d1813' };
const W = 841.89;
const H = 595.28;
const M = 30;
const BASE = H - M - 14;

/** @returns {Promise<Buffer>} */
export function gerarPdfCorte(plano, nomeEmpresa = '') {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: M,
    info: { Title: `Plano de corte — ${plano.nome}`, Author: nomeEmpresa || 'esquadro' },
    bufferPages: true,
  });
  doc.registerFont('normal', FONTES.normal);
  doc.registerFont('media', FONTES.media);
  doc.registerFont('forte', FONTES.forte);
  const pedacos = [];
  doc.on('data', (p) => pedacos.push(p));
  const pronto = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(pedacos))));

  const detalhes = detalharChapas(plano);
  const chapasPorId = new Map(plano.chapas.map((c) => [c.id, c]));
  const fitasPorId = new Map(plano.fitas.map((f) => [f.id, f]));

  // Com `ellipsis` e sem quebra de linha, o texto é cortado com "…" para caber na largura.
  const texto = (t, x, y, { f = 'normal', s = 9, cor = COR.tinta, ellipsis, ...opcoes } = {}) => {
    let conteudo = String(t ?? '');
    doc.font(f).fontSize(s).fillColor(cor);
    if (ellipsis && opcoes.width && doc.widthOfString(conteudo) > opcoes.width) {
      while (conteudo.length > 1 && doc.widthOfString(`${conteudo}…`) > opcoes.width) conteudo = conteudo.slice(0, -1);
      conteudo = `${conteudo.trimEnd()}…`;
    }
    doc.text(conteudo, x, y, { lineBreak: false, ...opcoes });
  };

  // --------------------------------------------------------------- Resumo
  texto('PLANO DE CORTE', M, M, { f: 'media', s: 8, cor: COR.fraco, characterSpacing: 1.2 });
  texto(plano.nome, M, M + 12, { f: 'forte', s: 18, width: W - 2 * M, ellipsis: true });
  const sub = [nomeEmpresa, plano.cliente_nome ? `Cliente: ${plano.cliente_nome}` : '', `Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`]
    .filter(Boolean)
    .join('   ·   ');
  texto(sub, M, M + 36, { s: 9, cor: COR.suave });

  const a = plano.ajustes;
  const r = plano.resumo;
  let y = M + 62;
  const blocos = [
    ['Chapas', plano.resultado ? String(r.total_chapas) : '—'],
    ['Aproveitamento', plano.resultado ? `${String(r.aproveitamento).replace('.', ',')}%` : '—'],
    ['Peças', String(r.total_pecas)],
    ['Serra / refilo', `${formatarMm(a.serra_decimos_mm / 10)} mm / ${a.refilo_mm} mm`],
    ['Modo', MODOS_CORTE[a.modo]?.nome || a.modo],
  ];
  const larguraBloco = (W - 2 * M) / blocos.length;
  blocos.forEach(([rotulo, valor], i) => {
    texto(rotulo.toUpperCase(), M + i * larguraBloco, y, { f: 'media', s: 7, cor: COR.fraco, characterSpacing: 0.8 });
    texto(valor, M + i * larguraBloco, y + 11, { f: 'forte', s: 14 });
  });
  y += 40;

  if (!plano.resultado) {
    texto('O plano ainda não foi calculado com esta lista. Abra o plano no esquadro e toque em "Calcular".', M, y, { s: 10, cor: COR.suave });
    y += 22;
  }

  // Compras: chapas e fitas.
  const compras = [
    ...r.materiais.filter((m) => m.folhas).map((m) => [`${m.nome}${m.espessura_mm ? ` ${m.espessura_mm} mm` : ''}`, `${m.folhas} ${m.folhas === 1 ? 'chapa' : 'chapas'}`, m.custo_cents ? formatarDinheiro(m.custo_cents) : '']),
    ...r.fitas.map((f) => [f.nome, `${formatarMetros(f.metros_com_margem)}${a.margem_fita_pct ? ` (com ${a.margem_fita_pct}% de margem)` : ''}`, f.custo_cents ? formatarDinheiro(f.custo_cents) : '']),
  ];
  if (compras.length) {
    texto('Para comprar', M, y, { f: 'forte', s: 11 });
    y += 17;
    for (const [nome, qtd, valor] of compras) {
      texto(nome, M, y, { s: 9, width: 330, ellipsis: true });
      texto(qtd, M + 340, y, { f: 'media', s: 9 });
      texto(valor, M + 560, y, { s: 9, cor: COR.suave });
      y += 14;
    }
    y += 10;
  }

  // Lista de peças.
  const colunas = [
    ['Nº', 0, 34],
    ['Móvel', 34, 150],
    ['Peça', 184, 150],
    ['C × L (mm)', 334, 90],
    ['Qtd', 424, 30],
    ['Chapa', 454, 170],
    ['Veio', 624, 34],
    ['Fita', 658, 124],
  ];
  const cabecalhoTabela = () => {
    texto('Lista de peças', M, y, { f: 'forte', s: 11 });
    y += 17;
    colunas.forEach(([rotulo, x, w]) => texto(rotulo, M + x, y, { f: 'media', s: 7.5, cor: COR.fraco, width: w }));
    y += 12;
    doc.moveTo(M, y - 3).lineTo(W - M, y - 3).lineWidth(0.5).strokeColor(COR.linha).stroke();
  };
  cabecalhoTabela();
  const inicioNumero = new Map();
  for (const inst of expandirPecas(plano.pecas)) if (inst.copia === 1) inicioNumero.set(inst.indice, inst.numero);
  plano.pecas.forEach((p, i) => {
    if (y > BASE - 12) {
      doc.addPage();
      y = M;
      cabecalhoTabela();
    }
    const n0 = inicioNumero.get(i);
    const chapa = chapasPorId.get(p.chapa_id);
    const fita = fitasPorId.get(p.fita_id);
    const lados = ladosComFita(p);
    const valores = [
      p.quantidade > 1 ? `${n0}–${n0 + p.quantidade - 1}` : String(n0),
      p.grupo,
      p.descricao,
      `${p.comprimento_mm} × ${p.largura_mm}`,
      String(p.quantidade),
      chapa ? `${chapa.nome} ${chapa.espessura_mm} mm` : 'sem chapa',
      p.veio && chapa?.veio ? 'sim' : '',
      lados ? `${lados}${fita ? ` · ${fita.nome}` : ''}` : '',
    ];
    colunas.forEach(([, x, w], c) => texto(valores[c], M + x, y, { s: 8.5, width: w - 6, ellipsis: true, f: c === 3 ? 'media' : 'normal' }));
    y += 13;
  });

  // ------------------------------------------------------- Uma página por chapa
  for (const d of detalhes) {
    doc.addPage();
    const { chapa } = d;
    texto(`CHAPA ${d.ordem} DE ${detalhes.length}`, M, M, { f: 'media', s: 8, cor: COR.fraco, characterSpacing: 1.2 });
    texto(`${chapa.nome} ${chapa.espessura_mm} mm  ·  ${chapa.comprimento_mm} × ${chapa.largura_mm} mm`, M, M + 12, { f: 'forte', s: 14 });
    texto(`${d.colocadas.length} ${d.colocadas.length === 1 ? 'peça' : 'peças'}  ·  aproveitamento ${String(d.aproveitamento).replace('.', ',')}%${chapa.veio ? '  ·  veio no sentido do comprimento →' : ''}`, M, M + 31, { s: 9, cor: COR.suave });

    // Desenho
    const topo = M + 52;
    const larguraMax = 540;
    const alturaMax = BASE - topo - 10;
    const escala = Math.min(larguraMax / chapa.comprimento_mm, alturaMax / chapa.largura_mm);
    const X = (mm) => M + mm * escala;
    const Y = (mm) => topo + mm * escala;
    doc.rect(X(0), Y(0), chapa.comprimento_mm * escala, chapa.largura_mm * escala).fillColor(COR.refilo).fill();
    const r0 = plano.ajustes.refilo_mm;
    doc.rect(X(r0), Y(r0), (chapa.comprimento_mm - 2 * r0) * escala, (chapa.largura_mm - 2 * r0) * escala).fillColor(COR.sobra).fill();
    for (const s of d.sobras) {
      doc.save().rect(X(s.x), Y(s.y), s.w * escala, s.h * escala).clip();
      for (let t = -s.h; t < s.w; t += 60) {
        doc.moveTo(X(s.x + t), Y(s.y + s.h)).lineTo(X(s.x + t + s.h), Y(s.y)).lineWidth(0.3).strokeColor(COR.linha).stroke();
      }
      doc.restore();
      if (s.w * escala > 60 && s.h * escala > 16) texto(`sobra ${formatarMm(s.w)} × ${formatarMm(s.h)}`, X(s.x) + 3, Y(s.y) + 3, { s: 6.5, cor: COR.fraco });
    }
    for (const p of d.colocadas) {
      const peca = plano.pecas[p.indice];
      const px = X(p.x);
      const py = Y(p.y);
      const pw = p.w * escala;
      const ph = p.h * escala;
      doc.rect(px, py, pw, ph).fillColor(COR.peca).fill();
      doc.rect(px, py, pw, ph).lineWidth(0.6).strokeColor(COR.tinta).stroke();
      const lados = ladosNoDesenho(peca, p.girada);
      doc.lineWidth(2).strokeColor(COR.fita);
      if (peca.fita_id) {
        if (lados.topo) doc.moveTo(px, py + 1).lineTo(px + pw, py + 1).stroke();
        if (lados.base) doc.moveTo(px, py + ph - 1).lineTo(px + pw, py + ph - 1).stroke();
        if (lados.esquerda) doc.moveTo(px + 1, py).lineTo(px + 1, py + ph).stroke();
        if (lados.direita) doc.moveTo(px + pw - 1, py).lineTo(px + pw - 1, py + ph).stroke();
      }
      if (pw > 14 && ph > 9) {
        const tamanho = Math.max(5.5, Math.min(9, ph / 3, pw / 5));
        texto(String(p.numero), px, py + ph / 2 - tamanho * (pw > 46 && ph > 22 ? 1.1 : 0.55), { f: 'forte', s: tamanho, width: pw, align: 'center' });
        if (pw > 46 && ph > 22) {
          texto(`${peca.comprimento_mm} × ${peca.largura_mm}`, px, py + ph / 2 + 1, { s: Math.max(5.5, tamanho - 1.5), cor: COR.suave, width: pw, align: 'center' });
        }
      }
    }

    // Roteiro de cortes
    const colunaX = M + larguraMax + 22;
    const colunaW = W - M - colunaX;
    let ry = topo;
    texto('Roteiro de cortes', colunaX, ry, { f: 'forte', s: 11 });
    ry += 15;
    texto(`Refile ${r0} mm em cada borda antes de começar. A medida é a que vai na guia.`, colunaX, ry, { s: 7.5, cor: COR.suave, width: colunaW, lineBreak: true });
    ry = doc.y + 8;
    let continuacao = false;
    d.roteiro.forEach((passo, i) => {
      const { titulo, partes } = textoPasso(passo);
      const linha = partes.join('   ');
      doc.font('normal').fontSize(8);
      const altura = doc.heightOfString(linha, { width: colunaW }) + 14;
      if (ry + altura > BASE) {
        doc.addPage();
        texto(`CHAPA ${d.ordem} — ROTEIRO (CONTINUAÇÃO)`, M, M, { f: 'media', s: 8, cor: COR.fraco, characterSpacing: 1.2 });
        ry = M + 18;
        continuacao = true;
      }
      const x = continuacao ? M : colunaX;
      const largura = continuacao ? W - 2 * M : colunaW;
      texto(`${i + 1}. ${titulo}`, x, ry, { f: 'media', s: 8.5, width: largura });
      ry += 11;
      texto(linha, x + 10, ry, { s: 8, cor: COR.suave, width: largura - 10, lineBreak: true });
      ry = doc.y + 6;
    });
  }

  // Rodapé com numeração
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // o rodapé fica na margem; sem isto o PDFKit abriria outra página
    texto(`${plano.nome}  ·  página ${i + 1} de ${paginas.count}  ·  confira as medidas antes de cortar`, M, H - M - 4, { s: 7, cor: COR.fraco, width: W - 2 * M, align: 'right' });
  }
  doc.end();
  return pronto;
}

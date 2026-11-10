import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { formatarDinheiro } from '../public/shared/calc.js';
import { SOLUCOES, detalharSolucao, formatarCm, formatarMetros, formatarMm, ladosComFita, ladosNoDesenho, resumirSolucao } from '../public/shared/corte.js';

// PDF de produção para levar à serra: A4 deitado, pensado para imprimir em
// preto e branco. Primeiro o resumo e a lista de peças; depois uma página por
// desenho de chapa (chapas iguais saem juntas), com o roteiro ao lado.
// Preço só aparece para o escritório (quando o plano vem com custo).

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

  const mostrarPrecos = Boolean(plano.custo);
  const solucao = plano.resultado ? plano.resultado.solucoes[plano.resultado.escolhida] : null;
  const vista = { pecas: plano.pecas, chapas: plano.chapas, fitas: plano.fitas, ajustes: plano.ajustes, retalhos: plano.retalhos, config: plano.config };
  const detalhes = solucao ? detalharSolucao(vista, solucao) : [];
  const resumo = solucao ? resumirSolucao(vista, solucao, detalhes) : null;
  const chapasPorId = new Map(plano.chapas.map((c) => [c.id, c]));
  const fitasPorId = new Map(plano.fitas.map((f) => [f.id, f]));
  const linhaDoNumero = new Map(detalhes.flatMap((d) => d.colocadas.map((p) => [p.numero, p.indice + 1])));

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
  const sub = [
    nomeEmpresa,
    plano.funcionario_nome ? `Responsável: ${plano.funcionario_nome}` : '',
    plano.cliente_nome ? `Cliente: ${plano.cliente_nome}` : '',
    `Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ]
    .filter(Boolean)
    .join('   ·   ');
  texto(sub, M, M + 36, { s: 9, cor: COR.suave, width: W - 2 * M, ellipsis: true });

  const a = plano.ajustes;
  let y = M + 60;
  const blocos = [
    ['Chapas novas', resumo ? String(resumo.chapas_novas) : '—'],
    ['Retalhos', resumo ? String(resumo.retalhos) : '—'],
    ['Aproveitamento', resumo ? `${String(resumo.aproveitamento).replace('.', ',')}%` : '—'],
    ['Cortes / giros', resumo ? `${resumo.cortes} / ${resumo.giros}` : '—'],
    ['Disco / refilo', `${formatarMm(a.serra_decimos_mm / 10)} mm / ${formatarCm(a.refilo_mm)} cm`],
    ['Solução', solucao ? SOLUCOES[solucao.tipo].nome : '—'],
  ];
  const larguraBloco = (W - 2 * M) / blocos.length;
  blocos.forEach(([rotulo, valor], i) => {
    texto(rotulo.toUpperCase(), M + i * larguraBloco, y, { f: 'media', s: 7, cor: COR.fraco, characterSpacing: 0.8 });
    texto(valor, M + i * larguraBloco, y + 11, { f: 'forte', s: 14, width: larguraBloco - 8, ellipsis: true });
  });
  y += 40;

  if (plano.instrucoes) {
    texto('Instruções do escritório', M, y, { f: 'forte', s: 10 });
    texto(plano.instrucoes, M, y + 14, { s: 9, cor: COR.suave, width: W - 2 * M, lineBreak: true });
    y = doc.y + 10;
  }

  if (!solucao) {
    texto('O plano ainda não foi calculado com esta lista. Abra o plano na produção e toque em "Calcular".', M, y, { s: 10, cor: COR.suave });
    y += 22;
  }

  const separar = [
    ...(resumo ? resumo.materiais.filter((m) => m.novas || m.retalhos) : []).map((m) => [
      `${m.nome}${m.espessura_mm ? ` ${m.espessura_mm} mm` : ''}`,
      [m.novas ? `${m.novas} ${m.novas === 1 ? 'chapa nova' : 'chapas novas'}` : '', m.retalhos ? `${m.retalhos} ${m.retalhos === 1 ? 'retalho' : 'retalhos'}` : ''].filter(Boolean).join(' + '),
      mostrarPrecos && m.custo_cents ? formatarDinheiro(m.custo_cents) : '',
    ]),
    ...(resumo ? resumo.fitas : []).map((f) => [
      f.nome,
      `${formatarMetros(f.metros_com_margem)}${a.margem_fita_pct ? ` (com ${a.margem_fita_pct}% de margem)` : ''}`,
      mostrarPrecos && f.custo_cents ? formatarDinheiro(f.custo_cents) : '',
    ]),
  ];
  if (separar.length) {
    texto('Separar para o corte', M, y, { f: 'forte', s: 11 });
    y += 17;
    for (const [nome, qtd, valor] of separar) {
      texto(nome, M, y, { s: 9, width: 330, ellipsis: true });
      texto(qtd, M + 340, y, { f: 'media', s: 9, width: 220, ellipsis: true });
      if (valor) texto(valor, M + 570, y, { s: 9, cor: COR.suave });
      y += 14;
    }
    y += 10;
  }

  // Lista de peças (o "#" é o número da linha, o mesmo do desenho).
  const colunas = [
    ['#', 0, 30],
    ['Móvel', 30, 150],
    ['Peça', 180, 150],
    ['C × L (cm)', 330, 90],
    ['Qtd', 420, 30],
    ['Chapa', 450, 170],
    ['Não gira', 620, 34],
    ['Fita', 654, 128],
  ];
  const cabecalhoTabela = () => {
    texto('Lista de peças', M, y, { f: 'forte', s: 11 });
    y += 17;
    colunas.forEach(([rotulo, x, w]) => texto(rotulo, M + x, y, { f: 'media', s: 7.5, cor: COR.fraco, width: w }));
    y += 12;
    doc.moveTo(M, y - 3).lineTo(W - M, y - 3).lineWidth(0.5).strokeColor(COR.linha).stroke();
  };
  cabecalhoTabela();
  plano.pecas.forEach((p, i) => {
    if (y > BASE - 12) {
      doc.addPage();
      y = M;
      cabecalhoTabela();
    }
    const chapa = chapasPorId.get(p.chapa_id);
    const fita = fitasPorId.get(p.fita_id);
    const lados = ladosComFita(p);
    const valores = [
      String(i + 1),
      p.grupo,
      p.descricao,
      `${formatarCm(p.comprimento_mm)} × ${formatarCm(p.largura_mm)}`,
      String(p.quantidade),
      chapa ? `${chapa.nome} ${chapa.espessura_mm} mm` : 'sem chapa',
      p.veio ? 'sim' : '',
      lados ? `${lados}${fita ? ` · ${fita.nome}` : ''}` : '',
    ];
    colunas.forEach(([, x, w], c) => texto(valores[c], M + x, y, { s: 8.5, width: w - 6, ellipsis: true, f: c === 3 || c === 0 ? 'media' : 'normal' }));
    y += 13;
  });

  // ------------------------------------------- Uma página por desenho de chapa
  const paginas = detalhes.filter((d) => d.posicaoIgual === 1);
  for (const d of paginas) {
    doc.addPage();
    const { chapa, medidas } = d;
    const titulo = d.retalho_id
      ? `RETALHO R${d.retalho_id}${d.retalho?.local ? ` · ${d.retalho.local}` : ''}`
      : d.iguais > 1
        ? `CHAPAS ${d.ordem} A ${d.ordem + d.iguais - 1} DE ${detalhes.length} · ${d.iguais} IGUAIS`
        : `CHAPA ${d.ordem} DE ${detalhes.length}`;
    texto(titulo, M, M, { f: 'media', s: 8, cor: COR.fraco, characterSpacing: 1.2 });
    texto(`${chapa.nome} ${chapa.espessura_mm} mm  ·  ${formatarCm(medidas.comprimento_mm)} × ${formatarCm(medidas.largura_mm)} cm${d.iguais > 1 ? `  ·  corte ${d.iguais} vezes` : ''}`, M, M + 12, { f: 'forte', s: 14, width: W - 2 * M, ellipsis: true });
    texto(
      `${d.colocadas.length} ${d.colocadas.length === 1 ? 'peça' : 'peças'} por chapa  ·  aproveitamento ${String(d.aproveitamento).replace('.', ',')}%${chapa.veio ? '  ·  veio no sentido do comprimento →' : ''}${d.retalho_id ? '  ·  retalho: sem refilo' : ''}`,
      M,
      M + 31,
      { s: 9, cor: COR.suave },
    );

    const topo = M + 52;
    const larguraMax = 540;
    const alturaMax = BASE - topo - 10;
    const escala = Math.min(larguraMax / medidas.comprimento_mm, alturaMax / medidas.largura_mm);
    const X = (mm) => M + mm * escala;
    const Y = (mm) => topo + mm * escala;
    const r0 = medidas.refilo_mm;
    doc.rect(X(0), Y(0), medidas.comprimento_mm * escala, medidas.largura_mm * escala).fillColor(COR.refilo).fill();
    doc.rect(X(r0), Y(r0), (medidas.comprimento_mm - 2 * r0) * escala, (medidas.largura_mm - 2 * r0) * escala).fillColor(COR.sobra).fill();
    for (const s of d.sobras) {
      doc.save().rect(X(s.x), Y(s.y), s.w * escala, s.h * escala).clip();
      for (let t = -s.h; t < s.w; t += 60) {
        doc.moveTo(X(s.x + t), Y(s.y + s.h)).lineTo(X(s.x + t + s.h), Y(s.y)).lineWidth(0.3).strokeColor(COR.linha).stroke();
      }
      doc.restore();
      if (s.w * escala > 60 && s.h * escala > 16) texto(`sobra ${formatarCm(s.w)} × ${formatarCm(s.h)}`, X(s.x) + 3, Y(s.y) + 3, { s: 6.5, cor: COR.fraco });
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
        const comMedida = pw > 46 && ph > 22;
        texto(`#${p.indice + 1}`, px, py + ph / 2 - tamanho * (comMedida ? 1.1 : 0.55), { f: 'forte', s: tamanho, width: pw, align: 'center' });
        if (comMedida) {
          texto(`${formatarCm(peca.comprimento_mm)} × ${formatarCm(peca.largura_mm)}`, px, py + ph / 2 + 1, { s: Math.max(5.5, tamanho - 1.5), cor: COR.suave, width: pw, align: 'center' });
        }
      }
    }

    // Roteiro de cortes
    const colunaX = M + larguraMax + 22;
    const colunaW = W - M - colunaX;
    let ry = topo;
    texto('Roteiro de cortes', colunaX, ry, { f: 'forte', s: 11 });
    ry += 15;
    texto(
      r0
        ? `Medidas em cm, já finais (a fita não é descontada). Refile ${formatarCm(r0)} cm de um lado comprido no carro, gire e refile um lado curto. Meça cada parte a partir da borda que acabou de cortar.`
        : 'Medidas em cm, já finais (a fita não é descontada). Retalho: as bordas já vêm cortadas. Meça cada parte a partir da borda reta.',
      colunaX,
      ry,
      { s: 7.5, cor: COR.suave, width: colunaW, lineBreak: true },
    );
    ry = doc.y + 8;
    let continuacao = false;
    d.roteiro.forEach((passo, i) => {
      const titulo = `${passo.rotulo ? `Parte ${passo.rotulo}` : 'Chapa inteira'}${passo.girar ? ' (gire 90°)' : ''}: ${passo.eixo === 'y' ? 'cortes no comprimento' : 'cortes na largura'}`;
      const linha = passo.partes
        .map((p) => (p.tipo === 'peca' ? `#${linhaDoNumero.get(p.numero)} ${formatarCm(p.medida)}` : p.tipo === 'sobra' ? `sobra ${formatarCm(p.medida)}` : `${p.rotulo} ${formatarCm(p.medida)}`))
        .join('   ');
      doc.font('normal').fontSize(8);
      const altura = doc.heightOfString(linha, { width: colunaW }) + 14;
      if (ry + altura > BASE) {
        doc.addPage();
        texto(`${titulo.split(':')[0]} — ROTEIRO (CONTINUAÇÃO)`.toUpperCase(), M, M, { f: 'media', s: 8, cor: COR.fraco, characterSpacing: 1.2 });
        ry = M + 18;
        continuacao = true;
      }
      const x = continuacao ? M : colunaX;
      const largura = continuacao ? W - 2 * M : colunaW;
      texto(`${i + 1}. ${titulo}`, x, ry, { f: 'media', s: 8.5, width: largura, ellipsis: true });
      ry += 11;
      texto(linha, x + 10, ry, { s: 8, cor: COR.suave, width: largura - 10, lineBreak: true });
      ry = doc.y + 6;
    });
  }

  // Rodapé com numeração
  const total = doc.bufferedPageRange();
  for (let i = 0; i < total.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // o rodapé fica na margem; sem isto o PDFKit abriria outra página
    texto(`${plano.nome}  ·  página ${i + 1} de ${total.count}  ·  confira as medidas antes de cortar`, M, H - M - 4, { s: 7, cor: COR.fraco, width: W - 2 * M, align: 'right' });
  }
  doc.end();
  return pronto;
}

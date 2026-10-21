import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { formatarData, formatarDinheiro } from '../public/shared/calc.js';

const COR = {
  fundo: '#100d0b',
  tinta: '#f5efe6',
  texto: '#dfd3c4',
  suave: '#b9ad9e',
  linha: '#514031',
  acento: '#c39a69',
  dourado: '#e2c397',
  verde: '#92cba5',
};

const MARGEM = 40;
const RODAPE_Y = 798;
const LIMITE_CONTEUDO = 774;

const fonte = (arquivo) => readFileSync(new URL(`./fontes/${arquivo}`, import.meta.url));
const FONTES = {
  serif: fonte('playfair-display-latin-600-normal.woff'),
  serifMedia: fonte('playfair-display-latin-500-normal.woff'),
  serifItalica: fonte('playfair-display-latin-500-italic.woff'),
  sans: fonte('inter-latin-400-normal.woff'),
  sansMedia: fonte('inter-latin-500-normal.woff'),
  sansForte: fonte('inter-latin-600-normal.woff'),
  sansItalica: fonte('inter-latin-400-italic.woff'),
};
const MADEIRA = readFileSync(new URL('../public/images/login-fundo.jpg', import.meta.url));

/**
 * Gera o PDF do cliente a partir da visão do cliente (ver visaoCliente.js).
 * Este módulo não recebe — e portanto não consegue mostrar — preços internos.
 *
 * @param {ReturnType<import('./visaoCliente.js').visaoCliente>} v
 * @param {Buffer|null} logo PNG ou JPEG
 * @returns {Promise<Buffer>}
 */
export function gerarPdf(v, logo) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: 0,
    bufferPages: true,
    info: { Title: `Proposta nº ${v.numero}`, Author: v.empresa.nome || '', Creator: 'esquadro' },
  });
  for (const [nome, dados] of Object.entries(FONTES)) doc.registerFont(nome, dados);

  const partes = [];
  doc.on('data', (p) => partes.push(p));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const largura = doc.page.width - MARGEM * 2;
  const esq = MARGEM;
  const dir = MARGEM + largura;
  const empresa = v.empresa || {};
  const cliente = v.cliente || {};
  const quantidadeMoveis = (v.ambientes || []).reduce((soma, a) => soma + (a.itens || []).length, 0);

  const escrever = (texto, x, y, { f = 'sans', t = 9, cor = COR.texto, ...opcoes } = {}) => {
    if (texto === undefined || texto === null || texto === '') return y;
    doc.font(f).fontSize(t).fillColor(cor).text(String(texto), x, y, { lineGap: 1.5, ...opcoes });
    return doc.y;
  };
  const alturaTexto = (texto, w, { f = 'sans', t = 9, ...opcoes } = {}) =>
    doc.font(f).fontSize(t).heightOfString(String(texto || ' '), { width: w, lineGap: 1.5, ...opcoes });
  const rotulo = (texto, x, y, { cor = COR.suave, t = 6.5, espacamento = 1.1, ...opcoes } = {}) =>
    escrever(String(texto || '').toUpperCase(), x, y, {
      f: 'sansForte', t, cor, characterSpacing: espacamento, lineBreak: false, ...opcoes,
    });
  const fio = (y, x1 = esq, x2 = dir, cor = COR.linha, espessura = 0.65) => {
    doc.save();
    const rgba = String(cor).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
    if (rgba) {
      doc.strokeColor([Number(rgba[1]), Number(rgba[2]), Number(rgba[3])]);
      if (rgba[4] !== undefined) doc.strokeOpacity(Number(rgba[4]));
    } else doc.strokeColor(cor);
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(espessura).stroke();
    doc.restore();
  };
  const painel = (x, y, w, h, raio = 13, opacidade = 0.72) => {
    doc.save();
    doc.roundedRect(x, y, w, h, raio).fillOpacity(opacidade).fill('#1c1713');
    doc.roundedRect(x, y, w, h, raio).lineWidth(0.65).strokeColor(COR.linha).stroke();
    doc.restore();
  };
  const fundo = (opacidade = 0.43) => {
    const imagem = doc.openImage(MADEIRA);
    const escala = Math.max(doc.page.width / imagem.width, doc.page.height / imagem.height);
    const larguraImagem = imagem.width * escala;
    const alturaImagem = imagem.height * escala;
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).clip();
    doc.image(imagem, (doc.page.width - larguraImagem) / 2, (doc.page.height - alturaImagem) / 2, {
      width: larguraImagem,
      height: alturaImagem,
    });
    doc.rect(0, 0, doc.page.width, doc.page.height).fillOpacity(opacidade).fill(COR.fundo);
    doc.restore();
  };
  const marca = (x, y, maxW = 320, { tamanho = 23, comSubtitulo = true } = {}) => {
    if (logo) {
      try {
        const imagem = doc.openImage(logo);
        const escala = Math.min(maxW / imagem.width, 42 / imagem.height, 1);
        doc.image(imagem, x, y, { width: imagem.width * escala, height: imagem.height * escala });
        return;
      } catch {
        // Logo inválida: mantém a marca tipográfica da proposta.
      }
    }
    const nome = String(empresa.nome || 'Móveis planejados').trim();
    const principal = nome.replace(/\s+planejados?$/i, '').trim() || nome;
    escrever(principal.toLocaleUpperCase('pt-BR'), x, y, {
      f: 'serifMedia', t: tamanho, cor: COR.tinta, width: maxW, lineBreak: false,
    });
    if (comSubtitulo) rotulo('P L A N E J A D O S', x, y + 30, { t: 9, cor: COR.dourado, espacamento: 0.3, width: maxW });
  };
  const cabecalho = (y = 37) => {
    marca(esq, y, largura * 0.54, { tamanho: 14, comSubtitulo: false });
    rotulo(`Proposta nº ${v.numero}`, dir - 169, y, {
      t: 8, cor: COR.dourado, espacamento: 0.45, width: 169, align: 'right',
    });
    fio(y + 39, esq, dir, 'rgba(226,195,151,0.22)', 0.65);
  };
  const rodape = (pagina, total) => {
    fio(RODAPE_Y - 11, esq, dir, 'rgba(226,195,151,0.28)', 0.65);
    escrever(String(empresa.nome || '').toLocaleUpperCase('pt-BR'), esq, RODAPE_Y, {
      t: 5.7, cor: COR.suave, width: largura * 0.55, lineBreak: false,
    });
    escrever(`Nº ${v.numero}  ·  ${String(pagina).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, dir - 112, RODAPE_Y, {
      t: 5.7, cor: COR.suave, width: 112, align: 'right', lineBreak: false,
    });
  };
  const novaPaginaDetalhes = () => {
    doc.addPage({ size: 'A4', margins: 0 });
    fundo(0.72);
    cabecalho(37);
    doc.y = 100;
  };
  const garantir = (altura) => {
    if (doc.y + altura > LIMITE_CONTEUDO) novaPaginaDetalhes();
  };

  fundo();

  // Capa editorial: marca, apresentação do projeto e um resumo em vidro.
  marca(esq + 12, 47, 320, { tamanho: 23 });
  rotulo('Proposta', dir - 52 - 124, 52, { t: 10, cor: COR.dourado, espacamento: 0.8, width: 124, align: 'right' });
  escrever(`Nº ${v.numero}`, dir - 52 - 124, 69, {
    f: 'serifMedia', t: 13, cor: COR.tinta, width: 124, align: 'right', lineBreak: false,
  });

  rotulo('Móveis feitos para o seu espaço', esq + 12, 216, { t: 9, cor: COR.dourado, espacamento: 0.8 });
  escrever('Seu projeto,\nem cada detalhe.', esq + 12, 246, {
    f: 'serif', t: 43, cor: COR.tinta, width: 491, lineGap: -1.5,
  });
  fio(377, esq + 12, esq + 57, COR.acento, 2);
  escrever('Uma proposta de móveis planejados\nfeita sob medida para o seu espaço.', esq + 12, 400, {
    f: 'sans', t: 13, cor: COR.tinta, width: 405, lineGap: 2,
  });

  const resumoY = 505;
  const resumoH = 253;
  painel(esq, resumoY, largura, resumoH, 20, 0.48);
  rotulo('Preparado para', esq + 23, resumoY + 19, { t: 8.5, cor: COR.dourado, espacamento: 0.6 });
  escrever(cliente.nome || 'Cliente', esq + 23, resumoY + 39, {
    f: 'serifMedia', t: 25, cor: COR.tinta, width: largura - 46, lineBreak: false,
  });
  fio(resumoY + 90, esq + 23, dir - 23, 'rgba(226,195,151,0.18)', 0.6);

  const colunas = [
    ['Emissão', formatarData(v.data)],
    ['Válida até', formatarData(v.data_validade)],
    ['Entrega', v.prazo_entrega || 'A combinar'],
  ];
  const colW = 146;
  colunas.forEach(([titulo, valor], i) => {
    const x = esq + 23 + i * (colW + 14);
    rotulo(titulo, x, resumoY + 109, { t: 8.5, espacamento: 0.45, width: colW });
    escrever(valor, x, resumoY + 125, {
      f: 'sansMedia', t: 12, cor: COR.tinta, width: colW, lineBreak: false,
    });
  });
  fio(resumoY + 168, esq + 23, dir - 23, 'rgba(226,195,151,0.18)', 0.6);
  rotulo('Investimento total', esq + 23, resumoY + 186, { t: 8.5, cor: COR.dourado, espacamento: 0.65 });
  escrever(formatarDinheiro(v.total_cents), esq + 23, resumoY + 206, {
    f: 'sansForte', t: 29, cor: COR.tinta, width: 300, lineBreak: false, features: ['lnum'],
  });
  escrever(`${v.ambientes.length} ${v.ambientes.length === 1 ? 'ambiente' : 'ambientes'} · ${quantidadeMoveis} ${quantidadeMoveis === 1 ? 'móvel' : 'móveis'}`,
    dir - 242, resumoY + 219, { t: 10, cor: COR.suave, width: 177, align: 'right', lineBreak: false });

  // Segunda página: ambientes, investimento, forma de pagamento e observações.
  novaPaginaDetalhes();
  rotulo('O que está incluído', esq, 100, { t: 8.5, cor: COR.dourado, espacamento: 0.9 });
  escrever('O seu projeto', esq, 121, { f: 'serif', t: 31, cor: COR.tinta, lineBreak: false });
  doc.y = 180;

  const grupos = (v.ambientes || [])
    .filter((a) => (a.itens || []).length)
    .map((a) => ({ titulo: a.nome, subtotal: a.subtotal_cents, itens: a.itens }));
  if ((v.servicos || []).length) {
    grupos.push({
      titulo: 'Serviços adicionais',
      subtotal: v.servicos.reduce((soma, item) => soma + item.valor_cents, 0),
      itens: v.servicos,
    });
  }

  let indiceGrupo = 0;
  const desenharGrupo = (grupo, continua = false) => {
    const itens = grupo.itens || [];
    const topo = doc.y;
    const alturaGrupo = 102 + itens.length * 65;
    garantir(alturaGrupo);
    const y = doc.y;
    painel(esq, y, largura, alturaGrupo, 20, 0.86);
    escrever(String(indiceGrupo).padStart(2, '0'), esq + 23, y + 17, {
      f: 'sansForte', t: 10, cor: COR.dourado, width: 25, lineBreak: false,
    });
    escrever(`${grupo.titulo}${continua ? ' · continuação' : ''}`, esq + 60, y + 17, {
      f: 'serifMedia', t: 19, cor: COR.tinta, width: largura - 90, lineBreak: false,
    });
    fio(y + 66, esq + 23, dir - 23, 'rgba(226,195,151,0.24)', 0.65);

    const itemAltura = 65;
    const inicioItens = y + 73;
    itens.forEach((item, i) => {
      const yItem = inicioItens + i * itemAltura;
      const nome = item.quantidade > 1 ? `${item.descricao} × ${item.quantidade}` : item.descricao;
      escrever(nome, esq + 23, yItem + 10, {
        f: 'sansMedia', t: 12, cor: COR.tinta, width: largura - 170, lineBreak: false,
      });
      const quantidade = item.quantidade || 1;
      escrever(`${quantidade} ${quantidade === 1 ? 'unidade' : 'unidades'}`, esq + 23, yItem + 29, {
        f: 'sans', t: 9.5, cor: COR.suave, width: largura - 170, lineBreak: false,
      });
      escrever(formatarDinheiro(item.valor_cents), dir - 145, yItem + 20, {
        f: 'sansForte', t: 12.5, cor: COR.dourado, width: 120, align: 'right', lineBreak: false,
      });
    });
    fio(y + alturaGrupo - 32, esq + 23, dir - 23, 'rgba(226,195,151,0.18)', 0.65);
    const yTotal = y + alturaGrupo - 22;
    rotulo(`Total do ambiente`, esq + 23, yTotal, { t: 8, espacamento: 0.65, width: 250 });
    escrever(formatarDinheiro(grupo.subtotal), dir - 230, yTotal - 1, {
      f: 'sansForte', t: 10.5, cor: COR.dourado, width: 205, align: 'right', lineBreak: false,
    });
    doc.y = y + alturaGrupo;
    return topo;
  };

  for (const grupo of grupos) {
    indiceGrupo += 1;
    // Propostas longas continuam em novas páginas no mesmo estilo visual.
    if (doc.y + 102 + grupo.itens.length * 65 > LIMITE_CONTEUDO) novaPaginaDetalhes();
    desenharGrupo(grupo);
    doc.y += 20;
  }

  const ajustes = [];
  if (v.acrescimo || v.desconto_cents) ajustes.push(['Subtotal', formatarDinheiro(v.subtotal_cents)]);
  if (v.acrescimo) ajustes.push([v.acrescimo.descricao, formatarDinheiro(v.acrescimo.valor_cents)]);
  if (v.desconto_cents) ajustes.push(['Desconto', `− ${formatarDinheiro(v.desconto_cents)}`]);
  if (ajustes.length) {
    const hAjustes = ajustes.length * 17;
    garantir(hAjustes + 76);
    for (const [nome, valor] of ajustes) {
      escrever(nome, dir - 230, doc.y, { t: 7.5, cor: COR.suave, width: 120, lineBreak: false });
      escrever(valor, dir - 110, doc.y, { f: 'sansMedia', t: 7.5, cor: COR.texto, width: 110, align: 'right', lineBreak: false });
      doc.y += 17;
    }
    doc.y += 6;
  }

  garantir(85);
  const totalY = doc.y;
  painel(esq, totalY, largura, 72, 20, 0.48);
  rotulo('Investimento total', esq + 23, totalY + 16, { t: 9, cor: COR.dourado, espacamento: 0.65 });
  escrever(formatarDinheiro(v.total_cents), dir - 258, totalY + 16, {
    f: 'sansForte', t: 27, cor: COR.tinta, width: 235, align: 'right', lineBreak: false, features: ['lnum'],
  });
  doc.y = totalY + 92;

  const entrada = (v.pagamento?.linhas || []).find((linha) => /^entrada\s*:/i.test(linha));
  const restante = (v.pagamento?.linhas || []).find((linha) => !/^entrada\s*:/i.test(linha));
  const pagamentoLabel = v.pagamento?.descricao || 'Condição combinada';
  const entradaValor = entrada ? entrada.replace(/^entrada\s*:\s*/i, '') : pagamentoLabel;
  const validade = v.data_validade ? `Até ${formatarData(v.data_validade)}` : `${v.validade_dias} dias`;

  garantir(190);
  const pagamentoY = doc.y;
  const pagamentoH = 170;
  painel(esq, pagamentoY, largura, pagamentoH, 20, 0.86);
  escrever('Pagamento e prazo', esq + 23, pagamentoY + 15, { f: 'serifMedia', t: 19, cor: COR.tinta });
  const colunaGap = 24;
  const metade = (largura - 46 - colunaGap) / 2;
  const x1 = esq + 23;
  const x2 = x1 + metade + colunaGap;
  const campoResumo = (label, valor, x, y) => {
    rotulo(label, x, y, { t: 8.5, espacamento: 0.35, width: metade });
    escrever(valor || 'A combinar', x, y + 16, { f: 'sansMedia', t: 12, cor: COR.tinta, width: metade, lineBreak: false });
  };
  const percentualEntrada = pagamentoLabel.match(/(\d{1,3}%)(?=\s+de entrada)/i)?.[1];
  const entradaRotulo = percentualEntrada ? `Entrada · ${percentualEntrada}` : 'Entrada';
  campoResumo(entradaRotulo, entradaValor, x1, pagamentoY + 60);
  campoResumo('Restante', restante || 'Conforme combinado', x2, pagamentoY + 60);
  campoResumo('Entrega', v.prazo_entrega || 'A combinar', x1, pagamentoY + 114);
  campoResumo('Validade', validade, x2, pagamentoY + 114);
  doc.y = pagamentoY + pagamentoH + 23;

  const observacoes = String(v.observacoes || '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  if (observacoes.length) {
    const textoObs = observacoes.join('\n');
    const alturaObs = alturaTexto(textoObs, largura - 8, { t: 7.2 }) + 28;
    garantir(alturaObs);
    rotulo('Observações', esq, doc.y, { t: 5.5, cor: COR.dourado, espacamento: 1 });
    escrever(textoObs, esq, doc.y + 21, { t: 7.2, cor: COR.texto, width: largura - 8 });
    doc.y += alturaObs;
  }

  // Numeração e rodapé são desenhados depois que todas as páginas existem.
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    rodape(i + 1, paginas.count);
  }

  doc.end();
  return pronto;
}

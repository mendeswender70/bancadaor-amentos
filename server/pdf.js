import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { formatarData, formatarDinheiro, formatarPercentual } from '../public/shared/calc.js';

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
const MADEIRA = readFileSync(new URL('../public/images/figma-madeira-original.jpg', import.meta.url));
const MADEIRA_VIDRO = readFileSync(new URL('../public/images/figma-madeira-vidro.jpg', import.meta.url));

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
  let opacidadeFundoAtual;
  const sombraFundo = (opacidade) => {
    if (opacidade === undefined) {
      const sombra = doc.linearGradient(0, 0, doc.page.width, doc.page.height * 0.36);
      sombra.stop(0, '#080706', 0.22).stop(0.42, '#080706', 0.18).stop(1, '#080706', 0.63);
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(sombra);
    } else doc.rect(0, 0, doc.page.width, doc.page.height).fillOpacity(opacidade).fill(COR.fundo);
  };

  const escrever = (texto, x, y, { f = 'sans', t = 9, cor = COR.texto, ...opcoes } = {}) => {
    if (texto === undefined || texto === null || texto === '') return y;
    if (opcoes.lineBreak === false && opcoes.width) {
      const medida = doc.font(f).fontSize(t).widthOfString(String(texto));
      if (medida > opcoes.width) t *= opcoes.width / medida;
    }
    doc.font(f).fontSize(t).fillColor(cor).text(String(texto), x, y, { lineGap: 1.5, ...opcoes });
    return doc.y;
  };
  const alturaTexto = (texto, w, { f = 'sans', t = 9, ...opcoes } = {}) =>
    doc.font(f).fontSize(t).heightOfString(String(texto || ' '), { width: w, lineGap: 1.5, ...opcoes });
  const rotulo = (texto, x, y, { cor = COR.suave, t = 6.5, espacamento = 1.1, ...opcoes } = {}) =>
    escrever(String(texto || '').toUpperCase(), x, y, {
      f: 'sansForte', t, cor, characterSpacing: 0, lineBreak: false, ...opcoes,
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
    if (opacidade < 0.7) {
      doc.save().roundedRect(x, y, w, h, raio).clip();
      doc.image(MADEIRA_VIDRO, 0, 0, { width: doc.page.width, height: doc.page.height });
      sombraFundo(opacidadeFundoAtual);
      doc.restore();
    }
    doc.roundedRect(x, y, w, h, raio).fillOpacity(opacidade).fill('#17130f');
    const brilho = doc.linearGradient(x, y, x + w, y + h);
    brilho.stop(0, '#ffffff', opacidade < 0.7 ? 0.012 : 0.03).stop(0.5, '#ffffff', 0.008).stop(1, '#dec6a4', 0.025);
    doc.roundedRect(x, y, w, h, raio).fillOpacity(1).fill(brilho);
    const aro = doc.linearGradient(x, y, x + w, y + h);
    aro.stop(0, '#fff0d8', opacidade < 0.7 ? 0.42 : 0.25).stop(0.35, '#bda17f', 0.12).stop(0.7, '#e2c397', 0.08).stop(1, '#f6e4cc', 0.28);
    doc.roundedRect(x + 0.5, y + 0.5, w - 1, h - 1, raio).lineWidth(1).strokeOpacity(1).strokeColor(aro).stroke();
    doc.restore();
  };
  const fundo = (opacidade) => {
    opacidadeFundoAtual = opacidade;
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
    sombraFundo(opacidade);
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
      t: 8, cor: COR.suave, width: largura * 0.55, lineBreak: false,
    });
    escrever(`Nº ${v.numero}  ·  ${String(pagina).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, dir - 184, RODAPE_Y, {
      t: 8, cor: COR.dourado, width: 184, align: 'right', lineBreak: false,
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
  escrever(`PROPOSTA\nNº ${v.numero}`, dir - 12 - 124, 52, {
    f: 'sans', t: 10, cor: COR.dourado, width: 124, align: 'right', lineGap: 5,
  });

  rotulo('Móveis feitos para o seu espaço', esq + 12, 216, { t: 8.5, cor: COR.dourado });
  escrever('Seu projeto,\nem cada detalhe.', esq + 12, 246, {
    f: 'serifMedia', t: 43, cor: COR.tinta, width: 491, lineGap: -1.5,
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
  escrever('O seu projeto', esq, 121, { f: 'serifMedia', t: 31, cor: COR.tinta, lineBreak: false });
  doc.y = 180;

  const grupos = (v.ambientes || [])
    .filter((a) => (a.itens || []).length)
    .map((a) => ({ titulo: a.nome, descricao: a.descricao, subtotal: a.subtotal_cents, itens: a.itens }));
  if ((v.servicos || []).length) {
    grupos.push({
      titulo: 'Serviços adicionais',
      subtotal: v.servicos.reduce((soma, item) => soma + item.valor_cents, 0),
      itens: v.servicos,
    });
  }

  let indiceGrupo = 0;
  const prepararGrupo = (grupo) => {
    const larguraTexto = largura - 184;
    const itens = (grupo.itens || []).map((item) => {
      const quantidade = item.quantidade || 1;
      const nome = item.descricao;
      const nomeAltura = alturaTexto(nome, larguraTexto, { f: 'sansMedia', t: 12 });
      const quantidadeAltura = alturaTexto(`${quantidade} ${quantidade === 1 ? 'unidade' : 'unidades'}`, larguraTexto, { t: 9.5 });
      return {
        item,
        nome,
        quantidade,
        quantidadeAltura,
        nomeAltura,
        altura: Math.max(65, nomeAltura + quantidadeAltura + 28),
      };
    });
    const descricao = String(grupo.descricao || '').trim();
    const tituloAltura = alturaTexto(grupo.titulo, largura - 90, { f: 'serifMedia', t: 19 });
    const descricaoAltura = descricao ? alturaTexto(descricao, largura - 90, { t: 9.5 }) : 0;
    const alturaCabecalho = Math.max(68, 23 + tituloAltura + (descricao ? 5 + descricaoAltura : 0) + 14);
    return { ...grupo, itens, descricao, tituloAltura, descricaoAltura, alturaCabecalho };
  };

  const desenharSegmentoGrupo = (grupo, itens, { continua = false, final = false, alturaCabecalho = grupo.alturaCabecalho } = {}) => {
    const y = doc.y;
    const titulo = `${grupo.titulo}${continua ? ' · continuação' : ''}`;
    const alturaTitulo = alturaTexto(titulo, largura - 90, { f: 'serifMedia', t: 19 });
    const alturaRodape = final ? 34 : 0;
    const alturaGrupo = alturaCabecalho + itens.reduce((soma, item) => soma + item.altura, 0) + alturaRodape;
    painel(esq, y, largura, alturaGrupo, 20, 0.86);
    escrever(String(indiceGrupo).padStart(2, '0'), esq + 24, y + 28.5, {
      f: 'sansMedia', t: 10, cor: COR.dourado, width: 25, lineBreak: false,
    });
    escrever(titulo, esq + 61, y + 22.5, {
      f: 'serifMedia', t: 19, cor: COR.tinta, width: largura - 90,
    });
    if (grupo.descricao && !continua) {
      escrever(grupo.descricao, esq + 61, y + 23 + alturaTitulo + 5, {
        f: 'sans', t: 9.5, cor: COR.suave, width: largura - 90,
      });
    }
    const divisorY = y + alturaCabecalho - 1;
    fio(divisorY, esq + 23, dir - 23, 'rgba(226,195,151,0.24)', 0.65);

    let yItem = divisorY + 7;
    for (const linha of itens) {
      const alturaBloco = Math.max(48, linha.nomeAltura + 4 + linha.quantidadeAltura);
      const topoTexto = yItem + (linha.altura - alturaBloco) / 2;
      escrever(linha.nome, esq + 24, topoTexto, {
        f: 'sansMedia', t: 12, cor: COR.tinta, width: largura - 184,
      });
      const yQuantidade = topoTexto + 4 + Math.max(17, linha.nomeAltura);
      escrever(`${linha.quantidade} ${linha.quantidade === 1 ? 'unidade' : 'unidades'}`, esq + 24, yQuantidade, {
        f: 'sans', t: 9.5, cor: COR.suave, width: largura - 184,
      });
      escrever(formatarDinheiro(linha.item.valor_cents), dir - 144, yItem + (linha.altura - 18) / 2, {
        f: 'sansForte', t: 12.5, cor: COR.dourado, width: 120, align: 'right', lineBreak: false,
      });
      yItem += linha.altura;
    }

    if (final) {
      const yTotal = y + alturaGrupo - 21;
      fio(y + alturaGrupo - 31, esq + 24, dir - 24, 'rgba(226,195,151,0.18)', 0.65);
      rotulo('Total do ambiente', esq + 23, yTotal, { t: 8, espacamento: 0.65, width: 250 });
      escrever(formatarDinheiro(grupo.subtotal), dir - 230, yTotal - 1, {
        f: 'sansForte', t: 10.5, cor: COR.dourado, width: 205, align: 'right', lineBreak: false,
      });
    }
    doc.y = y + alturaGrupo;
  };

  for (const bruto of grupos) {
    indiceGrupo += 1;
    const grupo = prepararGrupo(bruto);
    const alturaCompleta = grupo.alturaCabecalho + grupo.itens.reduce((soma, item) => soma + item.altura, 0) + 34;
    if (doc.y + alturaCompleta > LIMITE_CONTEUDO && doc.y > 180) novaPaginaDetalhes();

    let restantes = [...grupo.itens];
    let continua = false;
    do {
      const disponivel = LIMITE_CONTEUDO - doc.y;
      const alturaTituloContinua = alturaTexto(`${grupo.titulo} · continuação`, largura - 90, { f: 'serifMedia', t: 19 });
      const cabecalho = continua ? Math.max(68, 23 + alturaTituloContinua + 14) : grupo.alturaCabecalho;
      const alturaTotalItens = restantes.reduce((soma, item) => soma + item.altura, 0);
      const cabeTudo = cabecalho + alturaTotalItens + 34 <= disponivel;
      if (!cabeTudo && disponivel < cabecalho + restantes[0].altura + 34 && doc.y > 180) {
        novaPaginaDetalhes();
        continua = true;
        continue;
      }

      let quantidadeItens = 0;
      let alturaItens = 0;
      const limiteItens = disponivel - cabecalho - (cabeTudo ? 34 : 0);
      while (quantidadeItens < restantes.length && alturaItens + restantes[quantidadeItens].altura <= limiteItens) {
        alturaItens += restantes[quantidadeItens].altura;
        quantidadeItens += 1;
      }

      // Mesmo uma única linha longa pode ocupar uma página nova, mas nunca é cortada.
      if (!quantidadeItens && restantes.length) {
        novaPaginaDetalhes();
        continua = true;
        continue;
      }

      const segmento = restantes.splice(0, quantidadeItens);
      const final = restantes.length === 0;
      desenharSegmentoGrupo(grupo, segmento, { continua, final, alturaCabecalho: cabecalho });
      if (!final) {
        doc.y += 12;
        novaPaginaDetalhes();
        continua = true;
      }
    } while (restantes.length);

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
  rotulo('Investimento total', esq + 23, totalY + 29.5, { t: 9, cor: COR.dourado, espacamento: 0.65 });
  escrever(formatarDinheiro(v.total_cents), dir - 258, totalY + 21, {
    f: 'sansForte', t: 27, cor: COR.tinta, width: 235, align: 'right', lineBreak: false, features: ['lnum'],
  });
  doc.y = totalY + 92;

  const entrada = (v.pagamento?.linhas || []).find((linha) => /^entrada\s*:/i.test(linha));
  const restante = (v.pagamento?.linhas || []).find((linha) => !/^entrada\s*:/i.test(linha));
  const pagamentoLabel = v.pagamento?.descricao || 'Condição combinada';
  const entradaValor = entrada ? entrada.replace(/^entrada\s*:\s*/i, '') : pagamentoLabel;
  const validade = v.data_validade ? `Até ${formatarData(v.data_validade)}` : `${v.validade_dias} dias`;

  const colunaGap = 24;
  const metade = (largura - 46 - colunaGap) / 2;
  const primeiraLinhaH = Math.max(54, 16 + alturaTexto(entradaValor, metade, { f: 'sansMedia', t: 12 }) + 15,
    16 + alturaTexto(restante || 'Conforme combinado', metade, { f: 'sansMedia', t: 12 }) + 15);
  const segundaLinhaH = Math.max(34, 16 + alturaTexto(v.prazo_entrega || 'A combinar', metade, { f: 'sansMedia', t: 12 }),
    16 + alturaTexto(validade, metade, { f: 'sansMedia', t: 12 }));
  const pagamentoH = 62 + primeiraLinhaH + segundaLinhaH + 20;
  garantir(pagamentoH + 20);
  const pagamentoY = doc.y;
  painel(esq, pagamentoY, largura, pagamentoH, 20, 0.86);
  escrever('Pagamento e prazo', esq + 24, pagamentoY + 17, { f: 'serifMedia', t: 19, cor: COR.tinta });
  const x1 = esq + 23;
  const x2 = x1 + metade + colunaGap;
  const campoResumo = (label, valor, x, y) => {
    rotulo(label, x, y, { t: 8.5, espacamento: 0.35, width: metade });
    escrever(valor || 'A combinar', x, y + 16, { f: 'sansMedia', t: 12, cor: COR.tinta, width: metade });
  };
  const percentualEntrada = pagamentoLabel.match(/\d{1,3}%/)?.[0];
  const entradaRotulo = percentualEntrada ? `Entrada · ${percentualEntrada}` : 'Entrada';
  campoResumo(entradaRotulo, entradaValor, x1, pagamentoY + 62);
  campoResumo('Restante', restante || 'Conforme combinado', x2, pagamentoY + 62);
  campoResumo('Entrega', v.prazo_entrega || 'A combinar', x1, pagamentoY + 62 + primeiraLinhaH);
  campoResumo('Validade', validade, x2, pagamentoY + 62 + primeiraLinhaH);
  doc.y = pagamentoY + pagamentoH + 23;

  const cartao = v.pagamento?.cartao;
  if (cartao) {
    const opcoes = [
      ...(cartao.debito ? [cartao.debito] : []),
      ...(cartao.credito || []),
    ];
    const cartaoH = 92 + opcoes.length * 20;
    garantir(cartaoH + 18);
    const cartaoY = doc.y;
    painel(esq, cartaoY, largura, cartaoH, 18, 0.78);
    escrever('Pagamento no cartão', esq + 20, cartaoY + 15, { f: 'serifMedia', t: 18, cor: COR.tinta });
    escrever(`${cartao.nome} · ${cartao.recebimento}`, esq + 20, cartaoY + 39, { t: 8, cor: COR.dourado, width: largura - 40 });

    const xOpcao = esq + 20;
    const xTaxa = esq + 118;
    const xParcela = esq + 214;
    const xTotal = dir - 118;
    const yCabecalho = cartaoY + 58;
    rotulo('Forma', xOpcao, yCabecalho, { t: 6, width: 96 });
    rotulo('Taxa · acréscimo', xTaxa, yCabecalho, { t: 5.5, width: 88, align: 'right' });
    rotulo('Parcelamento', xParcela, yCabecalho, { t: 6, width: xTotal - xParcela - 8 });
    rotulo('Total', xTotal, yCabecalho, { t: 6, width: 105, align: 'right' });
    opcoes.forEach((opcao, i) => {
      const y = cartaoY + 76 + i * 20;
      const valores = opcao.valores_parcelas_cents || [];
      const min = valores.length ? Math.min(...valores) : 0;
      const max = valores.length ? Math.max(...valores) : 0;
      const parcelas = valores.length <= 1
        ? 'À vista'
        : min === max
          ? `${valores.length}x de ${formatarDinheiro(min)}`
          : `${valores.length}x · ${formatarDinheiro(min)}–${formatarDinheiro(max)}`;
      if (i) fio(y - 4, esq + 20, dir - 20, 'rgba(226,195,151,0.12)', 0.45);
      escrever(opcao.tipo, xOpcao, y, { f: 'sansMedia', t: 7.5, cor: COR.texto, width: 96, lineBreak: false });
      escrever(`${formatarPercentual(opcao.taxa_centesimos_percentual)}% + ${formatarDinheiro(opcao.taxa_cents)}`, xTaxa, y, { f: 'sansMedia', t: 6.5, cor: COR.texto, width: 88, align: 'right', lineBreak: false });
      escrever(parcelas, xParcela, y, { f: 'sans', t: 7.5, cor: COR.suave, width: xTotal - xParcela - 8, lineBreak: false });
      escrever(formatarDinheiro(opcao.total_cents), xTotal, y, { f: 'sansMedia', t: 7.5, cor: COR.dourado, width: 105, align: 'right', lineBreak: false });
    });
    doc.y = cartaoY + cartaoH + 18;
    const notaCartao = 'Taxas informadas pelo Nu Empresas. A contratação e a cobrança são feitas diretamente pela marcenaria.';
    const alturaNotaCartao = alturaTexto(notaCartao, largura, { t: 7 }) + 14;
    garantir(alturaNotaCartao);
    escrever(notaCartao, esq + 4, doc.y, { t: 7, cor: COR.suave, width: largura - 8 });
    doc.y += alturaNotaCartao;
  }

  const observacoes = String(v.observacoes || '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  if (observacoes.length) {
    const textoObs = observacoes.join('\n');
    const alturaObs = alturaTexto(textoObs, largura, { t: 11 }) + 22;
    garantir(alturaObs);
    const observacoesY = doc.y;
    rotulo('Observações', esq, observacoesY, { t: 8.5, cor: COR.dourado });
    escrever(textoObs, esq, observacoesY + 17, { t: 11, cor: COR.tinta, width: largura });
    doc.y = observacoesY + alturaObs;
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

import PDFDocument from 'pdfkit';
import { formatarData, formatarDinheiro } from '../public/shared/calc.js';

const COR = {
  destaque: '#7a4a1f',
  texto: '#1f2328',
  suave: '#5f6670',
  linha: '#e3ded7',
  fundo: '#f7f4f0',
  grupo: '#f5ede4',
};

const MARGEM = 45;
const RODAPE = 30;

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
    margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM },
    bufferPages: true,
    info: { Title: `Orçamento nº ${v.numero}`, Author: v.empresa.nome || '', Creator: v.empresa.nome || '' },
  });
  const partes = [];
  doc.on('data', (p) => partes.push(p));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const largura = doc.page.width - MARGEM * 2;
  const esquerda = MARGEM;
  const direita = MARGEM + largura;
  const limiteInferior = () => doc.page.height - MARGEM - RODAPE;
  const garantirEspaco = (altura) => {
    if (doc.y + altura > limiteInferior()) doc.addPage();
  };

  // ---------------------------------------------------------------- Cabeçalho
  const topo = doc.y;
  let alturaLogo = 0;
  let larguraLogo = 0;
  if (logo) {
    try {
      const img = doc.openImage(logo);
      const escala = Math.min(150 / img.width, 70 / img.height, 1);
      larguraLogo = img.width * escala;
      alturaLogo = img.height * escala;
      doc.image(img, esquerda, topo, { width: larguraLogo, height: alturaLogo });
    } catch {
      alturaLogo = 0;
      larguraLogo = 0;
    }
  }
  const empresa = v.empresa;
  const contatos = [
    empresa.cnpj && `CNPJ ${empresa.cnpj}`,
    [empresa.telefone && `Tel. ${empresa.telefone}`, empresa.whatsapp && `WhatsApp ${empresa.whatsapp}`]
      .filter(Boolean)
      .join('  ·  '),
    empresa.email,
    empresa.endereco,
    [empresa.cidade, empresa.estado].filter(Boolean).join(' - '),
  ].filter(Boolean);

  const colunaEmpresaX = larguraLogo ? esquerda + larguraLogo + 20 : esquerda;
  const colunaEmpresaLargura = direita - colunaEmpresaX;
  const alinhamento = larguraLogo ? 'right' : 'left';
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(COR.texto)
    .text(empresa.nome || 'Orçamento', colunaEmpresaX, topo, { width: colunaEmpresaLargura, align: alinhamento });
  doc.moveDown(0.2).font('Helvetica').fontSize(9).fillColor(COR.suave);
  for (const linha of contatos) {
    doc.text(linha, colunaEmpresaX, doc.y, { width: colunaEmpresaLargura, align: alinhamento });
  }
  doc.y = Math.max(doc.y, topo + alturaLogo) + 14;
  doc.moveTo(esquerda, doc.y).lineTo(direita, doc.y).lineWidth(2).strokeColor(COR.destaque).stroke();
  doc.y += 16;

  // ------------------------------------------------------------------- Título
  const tituloY = doc.y;
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COR.destaque).text('ORÇAMENTO', esquerda, tituloY);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(COR.texto)
    .text(`Nº ${v.numero}`, esquerda, tituloY + 6, { width: largura, align: 'right' });
  doc.y = tituloY + 34;

  // --------------------------------------------------------- Dados do cliente
  const c = v.cliente;
  const dadosCliente = [
    ['Cliente', c.nome],
    ['Telefone', c.telefone || c.whatsapp],
    ['E-mail', c.email],
    ['CPF/CNPJ', c.cpf_cnpj],
    ['Endereço', [c.endereco, [c.cidade, c.estado].filter(Boolean).join(' - ')].filter(Boolean).join(', ')],
  ].filter(([, valor]) => valor);
  const dadosOrcamento = [
    ['Data', formatarData(v.data)],
    ['Validade', `${v.validade_dias} dias (até ${formatarData(v.data_validade)})`],
  ];
  const caixaY = doc.y;
  const colunaDireitaX = esquerda + largura * 0.62;
  const escreverPares = (pares, x, larguraColuna) => {
    let y = caixaY + 12;
    for (const [rotulo, valor] of pares) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.suave).text(rotulo.toUpperCase(), x, y, { width: larguraColuna });
      y = doc.y + 1;
      doc.font('Helvetica').fontSize(10.5).fillColor(COR.texto).text(valor, x, y, { width: larguraColuna });
      y = doc.y + 6;
    }
    return y;
  };
  // Mede a altura antes de desenhar o fundo.
  const medir = (pares, larguraColuna) =>
    pares.reduce(
      (h, [, valor]) => h + 11 + doc.font('Helvetica').fontSize(10.5).heightOfString(valor, { width: larguraColuna }) + 6,
      12,
    );
  const larguraEsq = colunaDireitaX - esquerda - 24;
  const larguraDir = direita - colunaDireitaX - 12;
  const alturaCaixa = Math.max(medir(dadosCliente, larguraEsq), medir(dadosOrcamento, larguraDir)) + 6;
  doc.roundedRect(esquerda, caixaY, largura, alturaCaixa, 6).fill(COR.fundo);
  escreverPares(dadosCliente, esquerda + 12, larguraEsq);
  escreverPares(dadosOrcamento, colunaDireitaX, larguraDir);
  doc.y = caixaY + alturaCaixa + 20;

  // -------------------------------------------------------------------- Itens
  const colunaValor = 120;
  const larguraDescricao = largura - colunaValor - 24;
  const cabecalhoTabela = () => {
    const y = doc.y;
    doc.rect(esquerda, y, largura, 22).fill(COR.destaque);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#ffffff');
    doc.text('DESCRIÇÃO', esquerda + 12, y + 7, { width: larguraDescricao });
    doc.text('VALOR', direita - colunaValor - 12, y + 7, { width: colunaValor, align: 'right' });
    doc.y = y + 22;
  };
  const descreverLinha = (l) => ({
    descricao: l.quantidade > 1 ? `${l.descricao} (${l.quantidade} unidades)` : l.descricao,
    valor: formatarDinheiro(l.valor_cents),
  });
  // Cada ambiente vira um grupo com título e subtotal; os serviços, um grupo no final.
  const grupos = v.ambientes
    .filter((a) => a.itens.length)
    .map((a) => ({ titulo: a.nome, detalhe: a.descricao, subtotal: a.subtotal_cents, linhas: a.itens.map(descreverLinha) }));
  if (v.servicos.length) {
    grupos.push({
      titulo: 'Serviços adicionais',
      detalhe: '',
      subtotal: v.servicos.reduce((soma, x) => soma + x.valor_cents, 0),
      linhas: v.servicos.map(descreverLinha),
    });
  }

  const alturaLinha = (texto) => {
    doc.font('Helvetica').fontSize(10.5);
    return Math.max(doc.heightOfString(texto, { width: larguraDescricao - 12 }), 12) + 12;
  };
  const tituloGrupo = (grupo, continuacao = false) => {
    const y = doc.y;
    doc.rect(esquerda, y, largura, 26).fill(COR.grupo);
    doc.rect(esquerda, y, 3, 26).fill(COR.destaque);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COR.destaque)
      .text(continuacao ? `${grupo.titulo} (continuação)` : grupo.titulo, esquerda + 12, y + 8, { width: larguraDescricao });
    if (!continuacao) {
      doc.text(formatarDinheiro(grupo.subtotal), direita - colunaValor - 12, y + 8, { width: colunaValor, align: 'right' });
    }
    doc.y = y + 26;
    if (grupo.detalhe && !continuacao) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COR.suave);
      doc.text(grupo.detalhe, esquerda + 12, doc.y + 5, { width: largura - 24 });
      doc.y += 3;
    }
  };

  garantirEspaco(22 + 26 + 26);
  cabecalhoTabela();
  for (const grupo of grupos) {
    // O título do grupo nunca fica sozinho no fim da página.
    if (doc.y + 26 + alturaLinha(grupo.linhas[0].descricao) + 8 > limiteInferior()) {
      doc.addPage();
      cabecalhoTabela();
    }
    doc.y += 6;
    tituloGrupo(grupo);
    for (const linha of grupo.linhas) {
      const altura = alturaLinha(linha.descricao);
      if (doc.y + altura > limiteInferior()) {
        doc.addPage();
        cabecalhoTabela();
        tituloGrupo(grupo, true);
      }
      const y = doc.y;
      doc.fillColor(COR.texto).font('Helvetica').fontSize(10.5);
      doc.text(linha.descricao, esquerda + 24, y + 6, { width: larguraDescricao - 12 });
      doc.text(linha.valor, direita - colunaValor - 12, y + 6, { width: colunaValor, align: 'right' });
      doc.y = y + altura;
      doc.moveTo(esquerda + 12, doc.y).lineTo(direita, doc.y).lineWidth(0.5).strokeColor(COR.linha).stroke();
    }
  }
  doc.y += 6;
  doc.moveTo(esquerda, doc.y).lineTo(direita, doc.y).lineWidth(0.8).strokeColor(COR.linha).stroke();
  doc.y += 10;

  // ------------------------------------------------------------------- Totais
  const totais = [];
  if (v.acrescimo || v.desconto_cents) totais.push(['Subtotal', formatarDinheiro(v.subtotal_cents)]);
  if (v.acrescimo) totais.push([v.acrescimo.descricao, formatarDinheiro(v.acrescimo.valor_cents)]);
  if (v.desconto_cents) totais.push(['Desconto', `- ${formatarDinheiro(v.desconto_cents)}`]);
  garantirEspaco(totais.length * 18 + 40);
  const blocoX = direita - 250;
  for (const [rotulo, valor] of totais) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10.5).fillColor(COR.suave).text(rotulo, blocoX, y, { width: 120 });
    doc.fillColor(COR.texto).text(valor, direita - 130 - 12, y, { width: 130, align: 'right' });
    doc.y = y + 18;
  }
  const totalY = doc.y + 2;
  doc.roundedRect(blocoX - 12, totalY, 250 + 12, 32, 6).fill(COR.destaque);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text('TOTAL', blocoX, totalY + 10, { width: 100 });
  doc.fontSize(14).text(formatarDinheiro(v.total_cents), direita - 160 - 12, totalY + 9, { width: 160, align: 'right' });
  doc.y = totalY + 32 + 24;

  // ---------------------------------------------------------------- Seções
  const secao = (titulo, corpo) => {
    garantirEspaco(40);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COR.destaque).text(titulo.toUpperCase(), esquerda, doc.y);
    doc.moveTo(esquerda, doc.y + 2).lineTo(direita, doc.y + 2).lineWidth(0.8).strokeColor(COR.linha).stroke();
    doc.y += 8;
    corpo();
    doc.y += 14;
  };
  const linhaRotulo = (rotulo, valor) => {
    garantirEspaco(16);
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(COR.texto)
      .text(`${rotulo}: `, esquerda, doc.y, { continued: true, width: largura })
      .font('Helvetica')
      .text(valor);
    doc.y += 2;
  };

  const temCondicoes = v.pagamento.descricao || v.pagamento.linhas.length || v.prazo_entrega;
  if (temCondicoes) {
    secao('Condições', () => {
      if (v.pagamento.descricao) linhaRotulo('Pagamento', v.pagamento.descricao);
      for (const linha of v.pagamento.linhas) {
        const [rotulo, ...resto] = linha.split(': ');
        linhaRotulo(rotulo, resto.join(': '));
      }
      if (v.prazo_entrega) linhaRotulo('Prazo de entrega', v.prazo_entrega);
    });
  }

  if (v.observacoes) {
    secao('Observações', () => {
      for (const paragrafo of v.observacoes.split(/\r?\n/)) {
        doc.font('Helvetica').fontSize(10).fillColor(COR.texto);
        garantirEspaco(doc.heightOfString(paragrafo || ' ', { width: largura }));
        doc.text(paragrafo || ' ', esquerda, doc.y, { width: largura });
      }
    });
  }

  // ------------------------------------------------------------------ Rodapé
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    const y = doc.page.height - MARGEM - 10;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COR.suave)
      .text(
        [empresa.nome, `Orçamento nº ${v.numero}`, `Página ${i + 1} de ${paginas.count}`, 'feito com esquadro']
          .filter(Boolean)
          .join('  ·  '),
        esquerda,
        y,
        { width: largura, align: 'center', lineBreak: false },
      );
    doc.page.margins.bottom = MARGEM;
  }

  doc.end();
  return pronto;
}

import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { formatarData, formatarDinheiro } from '../public/shared/calc.js';

const COR = {
  tinta: '#1c1917',
  texto: '#3b3531',
  suave: '#8b8179',
  linha: '#e8e2da',
  acento: '#9a6b3f',
  painel: '#1f1a16',
  painelTexto: '#e9e1d7',
  dourado: '#d8bb8f',
  desconto: '#2f7a47',
};

const MARGEM = 52;
const RODAPE = 34;

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
    info: { Title: `Orçamento nº ${v.numero}`, Author: v.empresa.nome || '', Creator: 'esquadro' },
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
  const limite = () => doc.page.height - MARGEM - RODAPE;
  // Páginas seguintes ganham um cabeçalho discreto.
  const novaPagina = () => {
    doc.addPage();
    const yC = MARGEM - 14;
    escrever(v.empresa.nome || '', MARGEM, yC, { f: 'serif', t: 10, cor: COR.tinta, width: largura * 0.6, lineBreak: false });
    escrever(`Orçamento Nº ${v.numero}`, MARGEM + largura * 0.4, yC + 1.5, {
      t: 8,
      cor: COR.suave,
      width: largura * 0.6,
      align: 'right',
      lineBreak: false,
    });
    fio(yC + 18);
    doc.y = yC + 38;
  };
  const garantir = (altura) => {
    if (doc.y + altura > limite()) novaPagina();
  };
  const escrever = (texto, x, y, { f = 'sans', t = 9.5, cor = COR.texto, ...opcoes } = {}) => {
    doc.font(f).fontSize(t).fillColor(cor).text(texto, x, y, { lineGap: 1.5, ...opcoes });
    return doc.y;
  };
  const altura = (texto, largo, { f = 'sans', t = 9.5, ...opcoes } = {}) =>
    doc.font(f).fontSize(t).heightOfString(texto || ' ', { width: largo, lineGap: 1.5, ...opcoes });
  const rotulo = (texto, x, y, opcoes = {}) =>
    escrever(texto.toUpperCase(), x, y, { f: 'sansForte', t: 7, cor: COR.suave, characterSpacing: 1.4, ...opcoes });
  const fio = (y, x1 = esq, x2 = dir, cor = COR.linha, espessura = 0.6) => {
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(espessura).strokeColor(cor).stroke();
  };

  const empresa = v.empresa;
  const c = v.cliente;

  // ============================================================ Cabeçalho
  const topo = MARGEM;
  const larguraEsq = largura * 0.58;
  let yEsq = topo;
  let temLogo = false;
  if (logo) {
    try {
      const img = doc.openImage(logo);
      const escala = Math.min(170 / img.width, 58 / img.height, 1);
      doc.image(img, esq, topo, { width: img.width * escala, height: img.height * escala });
      yEsq = topo + img.height * escala + 10;
      temLogo = true;
    } catch {
      // Logo inválida: segue só com o nome da empresa.
    }
  }
  if (!temLogo) {
    yEsq = escrever(empresa.nome || 'Orçamento', esq, topo - 2, { f: 'serif', t: 21, cor: COR.tinta, width: larguraEsq }) + 4;
  } else if (empresa.nome) {
    yEsq = escrever(empresa.nome, esq, yEsq, { f: 'sansForte', t: 9.5, cor: COR.tinta, width: larguraEsq }) + 2;
  }
  const contatos = [
    [empresa.telefone && `Tel. ${empresa.telefone}`, empresa.whatsapp && `WhatsApp ${empresa.whatsapp}`].filter(Boolean).join('   ·   '),
    empresa.email,
    [empresa.endereco, [empresa.cidade, empresa.estado].filter(Boolean).join(' - ')].filter(Boolean).join(', '),
    empresa.cnpj && `CNPJ ${empresa.cnpj}`,
  ].filter(Boolean);
  for (const linha of contatos) yEsq = escrever(linha, esq, yEsq, { t: 8, cor: COR.suave, width: larguraEsq });

  const colunaDir = esq + largura * 0.6;
  const larguraDir = dir - colunaDir;
  rotulo('Orçamento', colunaDir, topo, { width: larguraDir, align: 'right', cor: COR.acento, characterSpacing: 2.4 });
  escrever(`Nº ${v.numero}`, colunaDir, topo + 12, { f: 'serif', t: 22, cor: COR.tinta, width: larguraDir, align: 'right', features: ['lnum'] });
  const yDir = escrever(`Emitido em ${formatarData(v.data)}`, colunaDir, topo + 44, {
    t: 8.5,
    cor: COR.suave,
    width: larguraDir,
    align: 'right',
  });

  let y = Math.max(yEsq, yDir) + 20;
  fio(y);
  doc.rect(esq, y - 1, 46, 2).fill(COR.acento);
  y += 22;

  // ======================================================= Dados principais
  const colunas = [
    {
      titulo: 'Preparado para',
      principal: c.nome || '',
      linhas: [
        c.telefone || c.whatsapp,
        c.email,
        c.cpf_cnpj && `CPF/CNPJ ${c.cpf_cnpj}`,
        [c.endereco, [c.cidade, c.estado].filter(Boolean).join(' - ')].filter(Boolean).join(', '),
      ].filter(Boolean),
      peso: 0.46,
    },
    { titulo: 'Válido até', principal: formatarData(v.data_validade), linhas: [`${v.validade_dias} dias a partir da emissão`], peso: 0.27 },
    { titulo: 'Prazo de entrega', principal: v.prazo_entrega || 'A combinar', linhas: [], peso: 0.27 },
  ];
  let x = esq;
  let yMax = y;
  colunas.forEach((col, i) => {
    const w = largura * col.peso - (i < colunas.length - 1 ? 18 : 0);
    rotulo(col.titulo, x, y, { width: w });
    let yc = escrever(col.principal, x, y + 13, { f: 'serifMedia', t: 12.5, cor: COR.tinta, width: w, features: ['lnum'] }) + 2;
    for (const linha of col.linhas) yc = escrever(linha, x, yc, { t: 8.5, cor: COR.suave, width: w });
    yMax = Math.max(yMax, yc);
    x += largura * col.peso;
  });
  // Divisórias verticais entre as colunas, na altura do bloco.
  let xDiv = esq;
  for (const col of colunas.slice(0, -1)) {
    xDiv += largura * col.peso;
    doc.moveTo(xDiv - 9, y).lineTo(xDiv - 9, yMax).lineWidth(0.6).strokeColor(COR.linha).stroke();
  }
  y = yMax + 24;

  const primeiroNome = String(c.nome || '').trim().split(/\s+/)[0];
  y = escrever(
    `${primeiroNome ? `Olá, ${primeiroNome}! ` : ''}Apresentamos a proposta dos móveis planejados do seu projeto, organizada por ambiente. Todos os móveis são feitos sob medida.`,
    esq,
    y,
    { t: 9.5, cor: COR.texto, width: largura * 0.86, lineGap: 2.5 },
  );
  doc.y = y + 24;

  // ================================================================ Grupos
  const grupos = v.ambientes
    .filter((a) => a.itens.length)
    .map((a) => ({ titulo: a.nome, detalhe: a.descricao, subtotal: a.subtotal_cents, itens: a.itens }));
  if (v.servicos.length) {
    grupos.push({
      titulo: 'Serviços adicionais',
      detalhe: '',
      subtotal: v.servicos.reduce((soma, s) => soma + s.valor_cents, 0),
      itens: v.servicos,
    });
  }

  const recuo = 30;
  const colValor = 110;
  const larguraItem = largura - recuo - colValor - 12;
  const textoItem = (i) => (i.quantidade > 1 ? `${i.descricao}  ·  ${i.quantidade} unidades` : i.descricao);
  const alturaItem = (i) => altura(textoItem(i), larguraItem, { t: 9.5 }) + 14;

  const tituloGrupo = (grupo, indice, continuacao) => {
    const yT = doc.y;
    escrever(String(indice).padStart(2, '0'), esq, yT + 4, { f: 'sansForte', t: 8.5, cor: COR.acento, characterSpacing: 1 });
    escrever(continuacao ? `${grupo.titulo} (continuação)` : grupo.titulo, esq + recuo, yT, {
      f: 'serif',
      t: 14,
      cor: COR.tinta,
      width: largura - recuo - colValor - 12,
    });
    const yFim = doc.y;
    if (!continuacao) {
      escrever(formatarDinheiro(grupo.subtotal), dir - colValor - 40, yT + 2, {
        f: 'sansForte',
        t: 10.5,
        cor: COR.tinta,
        width: colValor + 40,
        align: 'right',
      });
    }
    doc.y = yFim + 2;
    if (grupo.detalhe && !continuacao) {
      doc.y = escrever(grupo.detalhe, esq + recuo, doc.y, { f: 'sansItalica', t: 8.5, cor: COR.suave, width: largura - recuo }) + 2;
    }
    doc.y += 4;
  };

  grupos.forEach((grupo, gi) => {
    const indice = gi + 1;
    // O título nunca fica sozinho no fim da página.
    garantir(34 + (grupo.detalhe ? altura(grupo.detalhe, largura - recuo, { t: 8.5 }) : 0) + alturaItem(grupo.itens[0]));
    tituloGrupo(grupo, indice, false);
    for (const item of grupo.itens) {
      const h = alturaItem(item);
      if (doc.y + h > limite()) {
        novaPagina();
        tituloGrupo(grupo, indice, true);
      }
      const yI = doc.y;
      fio(yI, esq + recuo, dir);
      doc
        .font('sans')
        .fontSize(9.5)
        .fillColor(COR.texto)
        .text(item.descricao, esq + recuo, yI + 7, { width: larguraItem, lineGap: 1.5, continued: item.quantidade > 1 });
      if (item.quantidade > 1) doc.fillColor(COR.suave).text(`  ·  ${item.quantidade} unidades`);
      escrever(formatarDinheiro(item.valor_cents), dir - colValor, yI + 7, { t: 9.5, cor: COR.texto, width: colValor, align: 'right' });
      doc.y = yI + h;
    }
    fio(doc.y, esq + recuo, dir);
    doc.y += 22;
  });

  // ================================================================= Total
  const ajustes = [];
  if (v.acrescimo || v.desconto_cents) ajustes.push(['Subtotal', formatarDinheiro(v.subtotal_cents), COR.texto]);
  if (v.acrescimo) ajustes.push([v.acrescimo.descricao, formatarDinheiro(v.acrescimo.valor_cents), COR.texto]);
  if (v.desconto_cents) ajustes.push(['Desconto', `- ${formatarDinheiro(v.desconto_cents)}`, COR.desconto]);

  const alturaPainel = 74;
  garantir(ajustes.length * 18 + alturaPainel + 10);
  const blocoX = dir - 230;
  for (const [nome, valor, cor] of ajustes) {
    const yA = doc.y;
    escrever(nome, blocoX, yA, { t: 9.5, cor: COR.suave, width: 120 });
    escrever(valor, dir - 130, yA, { t: 9.5, cor, width: 130, align: 'right' });
    doc.y = yA + 18;
  }
  if (ajustes.length) doc.y += 6;

  const yP = doc.y;
  doc.roundedRect(esq, yP, largura, alturaPainel, 10).fill(COR.painel);
  rotulo('Investimento total', esq + 22, yP + 20, { cor: COR.dourado, characterSpacing: 2 });
  if (v.pagamento.descricao) {
    escrever(v.pagamento.descricao, esq + 22, yP + 36, { t: 9, cor: COR.painelTexto, width: largura * 0.48 });
  }
  escrever(formatarDinheiro(v.total_cents), esq + largura * 0.42, yP + 21, {
    f: 'serif',
    t: 26,
    cor: '#ffffff',
    features: ['lnum'],
    width: largura * 0.58 - 22,
    align: 'right',
  });
  doc.y = yP + alturaPainel + 30;

  // ============================================================== Seções
  const secao = (titulo, alturaMinima) => {
    garantir(alturaMinima + 26);
    rotulo(titulo, esq, doc.y, { cor: COR.acento, characterSpacing: 2 });
    doc.y += 6;
    fio(doc.y);
    doc.y += 10;
  };

  const linhasPagamento = v.pagamento.linhas.map((l) => {
    const [nome, ...resto] = l.split(': ');
    return [nome, resto.join(': ')];
  });
  const pares = [
    v.pagamento.descricao && ['Forma de pagamento', v.pagamento.descricao],
    ...linhasPagamento,
    v.prazo_entrega && ['Prazo de entrega', v.prazo_entrega],
    ['Validade da proposta', `${v.validade_dias} dias (até ${formatarData(v.data_validade)})`],
  ].filter(Boolean);
  secao('Condições', 40);
  for (const [nome, valor] of pares) {
    const h = Math.max(altura(valor, largura * 0.64, { f: 'sansMedia' }), 12) + 8;
    garantir(h);
    const yL = doc.y;
    escrever(nome, esq, yL, { t: 9, cor: COR.suave, width: largura * 0.34 });
    escrever(valor, esq + largura * 0.36, yL, { f: 'sansMedia', t: 9.5, cor: COR.tinta, width: largura * 0.64 });
    doc.y = yL + h;
  }
  doc.y += 14;

  const observacoes = String(v.observacoes || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (observacoes.length) {
    secao('Observações', 30);
    for (const linha of observacoes) {
      const h = altura(linha, largura - 14, { t: 9 }) + 5;
      garantir(h);
      const yO = doc.y;
      doc.circle(esq + 2.5, yO + 5.2, 1.4).fill(COR.acento);
      escrever(linha, esq + 14, yO, { t: 9, cor: COR.texto, width: largura - 14 });
      doc.y = yO + h;
    }
    doc.y += 14;
  }

  // ================================================================ Aceite
  secao('Aceite da proposta', 70);
  escrever('Estou de acordo com os itens, valores e condições desta proposta.', esq, doc.y, { t: 9, cor: COR.suave, width: largura });
  const yAss = doc.y + 38;
  const larguraAss = largura * 0.58;
  fio(yAss, esq, esq + larguraAss, COR.suave, 0.6);
  fio(yAss, esq + larguraAss + 30, dir, COR.suave, 0.6);
  escrever(c.nome || 'Assinatura do cliente', esq, yAss + 6, { t: 8, cor: COR.suave, width: larguraAss });
  escrever('Data', esq + larguraAss + 30, yAss + 6, { t: 8, cor: COR.suave, width: dir - esq - larguraAss - 30 });

  // ================================================================ Rodapé
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    doc.page.margins.bottom = 0;
    const yR = doc.page.height - MARGEM - 8;
    fio(yR - 8);
    const infoEmpresa = [empresa.nome, empresa.telefone || empresa.whatsapp, empresa.email].filter(Boolean).join('   ·   ');
    escrever(infoEmpresa, esq, yR, { t: 7.5, cor: COR.suave, width: largura * 0.6, lineBreak: false });
    escrever(`Nº ${v.numero}   ·   Página ${i + 1} de ${paginas.count}   ·   feito com esquadro`, esq + largura * 0.4, yR, {
      t: 7.5,
      cor: COR.suave,
      width: largura * 0.6,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = MARGEM;
  }

  doc.end();
  return pronto;
}

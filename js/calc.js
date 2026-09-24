/*
 * Motor de cálculo de orçamentos de móveis planejados.
 * Funções puras: não acessam DOM nem armazenamento, para poderem ser
 * usadas no navegador (window.Calc) e testadas no Node (module.exports).
 *
 * Convenções:
 *   - Medidas de peças e chapas em milímetros (mm).
 *   - Áreas em metros quadrados (m²), fita e móvel em metros lineares (m).
 *   - Valores em reais (R$).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIPOS_MAO_DE_OBRA = {
    m2: 'R$ por m² de peças',
    ml: 'R$ por metro linear do móvel',
    hora: 'R$ por hora',
    percentual: '% sobre materiais',
    fixo: 'Valor fixo',
  };

  const COBRANCAS_MEDIDA = {
    m2: 'm² (larg. × alt.)',
    ml: 'Metro linear',
  };

  /** Converte entrada do usuário em número (aceita vírgula decimal). */
  function num(v, padrao = 0) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : padrao;
    if (v === null || v === undefined) return padrao;
    const s = String(v).trim().replace(/\s/g, '');
    if (!s) return padrao;
    // "1.234,56" -> 1234.56 ; "12,5" -> 12.5 ; "12.5" -> 12.5
    const normalizado = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = parseFloat(normalizado);
    return Number.isFinite(n) ? n : padrao;
  }

  const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
  const soma = (lista, campo) => lista.reduce((t, i) => t + i[campo], 0);

  /** Área de uma chapa em m². */
  function areaChapa(material) {
    return (num(material.chapaC) * num(material.chapaL)) / 1e6;
  }

  /** Preço do m² de um material, derivado do preço da chapa inteira. */
  function precoM2(material) {
    const area = areaChapa(material);
    return area > 0 ? num(material.preco) / area : 0;
  }

  /** Área (m²) e fita de borda (m) de uma peça, já multiplicadas pela quantidade. */
  function medirPeca(peca, temFita) {
    const qtd = Math.max(0, num(peca.qtd));
    const c = Math.max(0, num(peca.c));
    const l = Math.max(0, num(peca.l));
    const area = ((c * l) / 1e6) * qtd;
    const ladosC = limitar(Math.round(num(peca.fitaC)), 0, 2);
    const ladosL = limitar(Math.round(num(peca.fitaL)), 0, 2);
    const fita = temFita ? ((c * ladosC + l * ladosL) / 1000) * qtd : 0;
    return { qtd, area, fita };
  }

  /**
   * Móvel orçado só pela medida externa, em metros.
   * m² = largura × altura × qtd ; metro linear = largura × qtd.
   * O preço informado já é o preço de venda (R$/m² ou R$/m).
   */
  function medirItemMedida(item) {
    const qtd = Math.max(0, num(item.qtd, 1));
    const largura = Math.max(0, num(item.largura));
    const altura = Math.max(0, num(item.altura));
    const cobranca = item.cobranca === 'ml' ? 'ml' : 'm2';
    const m2 = largura * altura * qtd;
    const ml = largura * qtd;
    const base = cobranca === 'ml' ? ml : m2;
    return { qtd, largura, altura, cobranca, m2, ml, base, total: base * Math.max(0, num(item.preco)) };
  }

  function calcularMaoDeObra(item, base) {
    const valor = num(item.valor);
    switch (item.tipo) {
      case 'm2':
        return { base: base.areaM2, total: valor * base.areaM2 };
      case 'ml':
        return { base: base.metroLinear, total: valor * base.metroLinear };
      case 'hora': {
        const horas = num(item.qtd);
        return { base: horas, total: valor * horas };
      }
      case 'percentual':
        return { base: base.custoMateriais, total: (valor / 100) * base.custoMateriais };
      case 'fixo':
      default: {
        const qtd = num(item.qtd, 1);
        return { base: qtd, total: valor * qtd };
      }
    }
  }

  /**
   * Calcula o orçamento completo de um projeto.
   * @param {object} projeto  peças, ferragens, mão de obra e fechamento.
   * @param {object} config   catálogo de chapas, fitas, ferragens e perdas.
   */
  function calcular(projeto, config) {
    const materiais = config.materiais || [];
    const fitas = config.fitas || [];
    const catalogoFerragens = config.ferragens || [];
    const perdaChapa = Math.max(0, num(config.perdaChapa)) / 100;
    const perdaFita = Math.max(0, num(config.perdaFita)) / 100;
    const arredondar = projeto.arredondarChapas !== false;

    const materialPorId = new Map(materiais.map((m) => [m.id, m]));
    const fitaPorId = new Map(fitas.map((f) => [f.id, f]));
    const ferragemPorId = new Map(catalogoFerragens.map((f) => [f.id, f]));

    const areaPorMaterial = new Map();
    const metrosPorFita = new Map();
    const avisos = [];

    // Peças
    const pecas = (projeto.pecas || []).map((p) => {
      const material = materialPorId.get(p.materialId);
      const fita = fitaPorId.get(p.fitaId);
      const m = medirPeca(p, Boolean(fita));
      if (material) {
        areaPorMaterial.set(material.id, (areaPorMaterial.get(material.id) || 0) + m.area);
      } else if (m.area > 0) {
        avisos.push(`A peça "${p.nome || 'sem nome'}" está sem chapa definida e não entrou no custo.`);
      }
      if (fita && m.fita > 0) {
        metrosPorFita.set(fita.id, (metrosPorFita.get(fita.id) || 0) + m.fita);
      }
      return { id: p.id, nome: p.nome, qtd: m.qtd, area: m.area, fita: m.fita };
    });

    // Chapas, na ordem do catálogo
    const chapas = materiais
      .filter((mat) => areaPorMaterial.get(mat.id) > 0)
      .map((mat) => {
        const area = areaPorMaterial.get(mat.id);
        const aChapa = areaChapa(mat);
        const areaComPerda = area * (1 + perdaChapa);
        const chapasExatas = aChapa > 0 ? areaComPerda / aChapa : 0;
        const qtdChapas = arredondar ? Math.ceil(chapasExatas - 1e-9) : chapasExatas;
        const custo = arredondar ? qtdChapas * num(mat.preco) : areaComPerda * precoM2(mat);
        const aproveitamento = qtdChapas > 0 && aChapa > 0 ? area / (qtdChapas * aChapa) : 0;
        if (aChapa <= 0) avisos.push(`A chapa "${mat.nome}" está sem medidas; o custo dela ficou zerado.`);
        return {
          id: mat.id,
          nome: mat.nome,
          espessura: num(mat.espessura),
          area,
          areaComPerda,
          chapasExatas,
          chapas: qtdChapas,
          aproveitamento,
          precoM2: precoM2(mat),
          custo,
        };
      });

    // Fitas de borda
    const fitasUsadas = fitas
      .filter((f) => metrosPorFita.get(f.id) > 0)
      .map((f) => {
        const metros = metrosPorFita.get(f.id);
        const metrosComPerda = metros * (1 + perdaFita);
        return { id: f.id, nome: f.nome, metros, metrosComPerda, custo: metrosComPerda * num(f.preco) };
      });

    // Ferragens
    const ferragens = (projeto.ferragens || []).map((item) => {
      const cat = ferragemPorId.get(item.ferragemId);
      const qtd = Math.max(0, num(item.qtd));
      const preco = cat ? num(cat.preco) : 0;
      return { id: item.id, nome: cat ? cat.nome : '', qtd, preco, total: qtd * preco };
    });

    const areaM2 = soma(pecas, 'area');
    const fitaM = soma(fitasUsadas, 'metrosComPerda');
    const metroLinear = Math.max(0, num(projeto.comprimentoLinear));
    const custoChapas = soma(chapas, 'custo');
    const custoFitas = soma(fitasUsadas, 'custo');
    const custoFerragens = soma(ferragens, 'total');
    const custoMateriais = custoChapas + custoFitas + custoFerragens;

    // Mão de obra
    const base = { areaM2, metroLinear, custoMateriais };
    const maoDeObra = (projeto.maoDeObra || []).map((item) => ({
      id: item.id,
      descricao: item.descricao,
      tipo: item.tipo,
      ...calcularMaoDeObra(item, base),
    }));
    if (metroLinear <= 0 && maoDeObra.some((m) => m.tipo === 'ml')) {
      avisos.push('Há mão de obra por metro linear, mas o comprimento linear do móvel está zerado.');
    }

    // Móveis por medida (preço de venda direto)
    const itensMedida = (projeto.itensMedida || []).map((item) => ({
      id: item.id,
      descricao: item.descricao,
      preco: Math.max(0, num(item.preco)),
      ...medirItemMedida(item),
    }));
    const areaMoveis = soma(itensMedida, 'm2');
    const mlMoveis = soma(itensMedida, 'ml');
    const vendaMedida = soma(itensMedida, 'total');

    const custoMaoDeObra = soma(maoDeObra, 'total');
    const outrosCustos = Math.max(0, num(projeto.outrosCustos));
    const custoTotal = custoMateriais + custoMaoDeObra + outrosCustos;
    const vendaDetalhada = custoTotal * (1 + num(projeto.margem) / 100);
    const precoVenda = vendaDetalhada + vendaMedida;
    const fatorDesconto = limitar(num(projeto.desconto), 0, 100) / 100;
    const desconto = precoVenda * fatorDesconto;
    const precoFinal = precoVenda - desconto;

    // Preço por m² e por metro linear: pela medida do móvel quando houver itens por medida,
    // senão pela área das peças e pelo comprimento linear informado.
    const baseM2 = areaMoveis > 0 ? areaMoveis : areaM2;
    const baseMl = metroLinear > 0 ? metroLinear : mlMoveis;

    return {
      pecas,
      chapas,
      fitas: fitasUsadas,
      ferragens,
      maoDeObra,
      itensMedida,
      avisos,
      totais: {
        qtdPecas: soma(pecas, 'qtd'),
        areaM2,
        fitaM,
        fitaSemPerda: soma(fitasUsadas, 'metros'),
        metroLinear,
        qtdChapas: soma(chapas, 'chapas'),
        custoChapas,
        custoFitas,
        custoFerragens,
        custoMateriais,
        custoMaoDeObra,
        outrosCustos,
        custoTotal,
        areaMoveis,
        mlMoveis,
        vendaMedida,
        vendaDetalhada,
        precoVenda,
        desconto,
        precoFinal,
        // Lucro conhecido: só da parte detalhada (itens por medida não têm custo lançado).
        lucro: vendaDetalhada * (1 - fatorDesconto) - custoTotal,
        baseM2: areaMoveis > 0 ? 'moveis' : 'pecas',
        precoM2: baseM2 > 0 ? precoFinal / baseM2 : 0,
        metroLinearRef: baseMl,
        precoMl: baseMl > 0 ? precoFinal / baseMl : 0,
      },
    };
  }

  /** Quantidade de dobradiças por porta conforme a altura (mm). */
  function dobradicasPorPorta(alturaPorta) {
    const a = num(alturaPorta);
    if (a <= 0) return 0;
    if (a <= 900) return 2;
    if (a <= 1600) return 3;
    if (a <= 2100) return 4;
    return 5;
  }

  /**
   * Gera as peças de um módulo (caixa) padrão:
   * laterais, base, tampo, prateleiras, fundo sobreposto, portas sobrepostas e gavetas.
   * Com portas e gavetas juntas, as gavetas (180 mm de frente) ficam embaixo e as portas em cima.
   * Gaveta: frente (chapa da porta, fita nos 4 lados), laterais, frente/traseira internas
   * e fundo; desconta 13 mm por lado para a corrediça.
   * Fita: frente das peças da caixa e as 4 bordas das portas e frentes.
   */
  function gerarModulo(opcoes) {
    const L = Math.max(0, num(opcoes.largura));
    const A = Math.max(0, num(opcoes.altura));
    const P = Math.max(0, num(opcoes.profundidade));
    const e = Math.max(0, num(opcoes.espessura, 15));
    const nPrat = Math.max(0, Math.round(num(opcoes.prateleiras)));
    const nPortas = Math.max(0, Math.round(num(opcoes.portas)));
    const nGavetas = Math.max(0, Math.round(num(opcoes.gavetas)));
    const folga = 3; // mm entre portas e nas bordas
    const modulo = opcoes.nome || 'Módulo';
    const caixa = { materialId: opcoes.materialCaixaId, fitaId: opcoes.fitaCaixaId || opcoes.fitaId };
    const pecas = [];
    const add = (nome, qtd, c, l, extra) =>
      pecas.push({ modulo, nome, qtd, c: Math.round(c), l: Math.round(l), fitaC: 0, fitaL: 0, ...extra });

    add('Lateral', 2, A, P, { ...caixa, fitaC: 1 });
    add('Base', 1, L - 2 * e, P, { ...caixa, fitaC: 1 });
    add('Tampo', 1, L - 2 * e, P, { ...caixa, fitaC: 1 });
    if (nPrat > 0) add('Prateleira', nPrat, L - 2 * e - 2, P - 20, { ...caixa, fitaC: 1 });
    if (opcoes.materialFundoId) add('Fundo', 1, A - 4, L - 4, { materialId: opcoes.materialFundoId, fitaId: '' });

    const frente = {
      materialId: opcoes.materialPortaId || opcoes.materialCaixaId,
      fitaId: opcoes.fitaPortaId || opcoes.fitaId,
      fitaC: 2,
      fitaL: 2,
    };
    let alturaGavetas = 0;
    let corredicas = 0;
    if (nGavetas > 0) {
      const alturaFrente = nPortas > 0 ? 180 : (A - folga * (nGavetas + 1)) / nGavetas;
      alturaGavetas = nGavetas * (alturaFrente + folga);
      const vaoInterno = L - 2 * e - 26; // 13 mm de corrediça de cada lado
      const alturaCaixa = alturaFrente - 40;
      const profGaveta = P - 50;
      add('Frente de gaveta', nGavetas, L - 2 * folga, Math.floor(alturaFrente), frente);
      add('Lateral de gaveta', nGavetas * 2, profGaveta, alturaCaixa, { ...caixa, fitaC: 1 });
      add('Frente/traseira interna de gaveta', nGavetas * 2, vaoInterno - 2 * e, alturaCaixa, { ...caixa, fitaC: 1 });
      if (opcoes.materialFundoId) {
        add('Fundo de gaveta', nGavetas, profGaveta, vaoInterno, { materialId: opcoes.materialFundoId, fitaId: '' });
      }
      corredicas = nGavetas;
    }

    let dobradicas = 0;
    if (nPortas > 0) {
      const alturaPorta = A - 2 * folga - alturaGavetas;
      const larguraPorta = (L - folga * (nPortas + 1)) / nPortas;
      if (alturaPorta > 0) {
        add('Porta', nPortas, alturaPorta, Math.floor(larguraPorta), frente);
        dobradicas = nPortas * dobradicasPorPorta(alturaPorta);
      }
    }

    return { pecas: pecas.filter((p) => p.c > 0 && p.l > 0), dobradicas, corredicas };
  }

  return {
    TIPOS_MAO_DE_OBRA, COBRANCAS_MEDIDA, num, areaChapa, precoM2, medirPeca, medirItemMedida,
    calcular, gerarModulo, dobradicasPorPorta,
  };
});

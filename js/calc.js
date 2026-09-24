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

    const custoMaoDeObra = soma(maoDeObra, 'total');
    const outrosCustos = Math.max(0, num(projeto.outrosCustos));
    const custoTotal = custoMateriais + custoMaoDeObra + outrosCustos;
    const precoVenda = custoTotal * (1 + num(projeto.margem) / 100);
    const desconto = precoVenda * (limitar(num(projeto.desconto), 0, 100) / 100);
    const precoFinal = precoVenda - desconto;

    return {
      pecas,
      chapas,
      fitas: fitasUsadas,
      ferragens,
      maoDeObra,
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
        precoVenda,
        desconto,
        precoFinal,
        lucro: precoFinal - custoTotal,
        precoM2: areaM2 > 0 ? precoFinal / areaM2 : 0,
        precoMl: metroLinear > 0 ? precoFinal / metroLinear : 0,
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
   * laterais, base, tampo, prateleiras, fundo sobreposto e portas sobrepostas.
   * Fita: frente das peças da caixa e as 4 bordas das portas.
   */
  function gerarModulo(opcoes) {
    const L = Math.max(0, num(opcoes.largura));
    const A = Math.max(0, num(opcoes.altura));
    const P = Math.max(0, num(opcoes.profundidade));
    const e = Math.max(0, num(opcoes.espessura, 15));
    const nPrat = Math.max(0, Math.round(num(opcoes.prateleiras)));
    const nPortas = Math.max(0, Math.round(num(opcoes.portas)));
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

    let dobradicas = 0;
    if (nPortas > 0) {
      const alturaPorta = A - 2 * folga;
      const larguraPorta = (L - folga * (nPortas + 1)) / nPortas;
      add('Porta', nPortas, alturaPorta, Math.floor(larguraPorta), {
        materialId: opcoes.materialPortaId || opcoes.materialCaixaId,
        fitaId: opcoes.fitaPortaId || opcoes.fitaId,
        fitaC: 2,
        fitaL: 2,
      });
      dobradicas = nPortas * dobradicasPorPorta(alturaPorta);
    }

    return { pecas: pecas.filter((p) => p.c > 0 && p.l > 0), dobradicas };
  }

  return { TIPOS_MAO_DE_OBRA, num, areaChapa, precoM2, medirPeca, calcular, gerarModulo, dobradicasPorPorta };
});

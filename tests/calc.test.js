const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');

const perto = (atual, esperado, casas = 6) =>
  assert.ok(Math.abs(atual - esperado) < 10 ** -casas, `esperado ${esperado}, recebido ${atual}`);

const config = {
  perdaChapa: 10,
  perdaFita: 10,
  materiais: [
    { id: 'mdf15', nome: 'MDF 15', espessura: 15, chapaC: 2750, chapaL: 1850, preco: 300 },
    { id: 'mdf6', nome: 'MDF 6', espessura: 6, chapaC: 2750, chapaL: 1850, preco: 150 },
  ],
  fitas: [{ id: 'f22', nome: 'Fita 22', preco: 2 }],
  ferragens: [{ id: 'dob', nome: 'Dobradiça', preco: 10 }],
};

test('num aceita vírgula, ponto de milhar e valores vazios', () => {
  assert.equal(Calc.num('12,5'), 12.5);
  assert.equal(Calc.num('1.234,56'), 1234.56);
  assert.equal(Calc.num('12.5'), 12.5);
  assert.equal(Calc.num(''), 0);
  assert.equal(Calc.num('abc', 7), 7);
  assert.equal(Calc.num(undefined, 1), 1);
});

test('medirPeca calcula m² e metros de fita pela quantidade', () => {
  const m = Calc.medirPeca({ qtd: 2, c: 1000, l: 500, fitaC: 2, fitaL: 1 }, true);
  perto(m.area, 1); // 1 x 0,5 x 2
  perto(m.fita, 5); // (1000*2 + 500*1) / 1000 * 2
  assert.equal(Calc.medirPeca({ qtd: 1, c: 1000, l: 500, fitaC: 2 }, false).fita, 0);
});

test('preço do m² vem do preço da chapa', () => {
  perto(Calc.precoM2(config.materiais[0]), 300 / (2.75 * 1.85));
});

test('calcular soma chapas inteiras, fita com perda, ferragens e mão de obra', () => {
  const projeto = {
    comprimentoLinear: 2,
    margem: 50,
    desconto: 10,
    outrosCustos: 100,
    pecas: [
      { id: 'a', nome: 'Lateral', qtd: 2, c: 2000, l: 600, materialId: 'mdf15', fitaId: 'f22', fitaC: 1, fitaL: 0 },
      { id: 'b', nome: 'Fundo', qtd: 1, c: 2000, l: 1000, materialId: 'mdf6', fitaId: '' },
    ],
    ferragens: [{ id: 'x', ferragemId: 'dob', qtd: 4 }],
    maoDeObra: [
      { id: 'm1', tipo: 'm2', valor: 10 },
      { id: 'm2', tipo: 'ml', valor: 100 },
      { id: 'm3', tipo: 'hora', valor: 50, qtd: 2 },
      { id: 'm4', tipo: 'percentual', valor: 10 },
      { id: 'm5', tipo: 'fixo', valor: 30 },
    ],
  };
  const r = Calc.calcular(projeto, config);
  const t = r.totais;

  perto(t.areaM2, 2.4 + 2); // 2 x 2 x 0,6 + 2 x 1
  assert.equal(t.qtdPecas, 3);

  // MDF 15: 2,4 m² + 10% = 2,64 m² -> 1 chapa (5,0875 m²)
  const mdf15 = r.chapas.find((c) => c.id === 'mdf15');
  assert.equal(mdf15.chapas, 1);
  perto(mdf15.custo, 300);
  perto(mdf15.aproveitamento, 2.4 / 5.0875);
  perto(t.custoChapas, 450);

  // Fita: 2 peças x 2 m = 4 m + 10% = 4,4 m x R$ 2
  perto(t.fitaM, 4.4);
  perto(t.custoFitas, 8.8);
  perto(t.custoFerragens, 40);
  perto(t.custoMateriais, 498.8);

  const mao = Object.fromEntries(r.maoDeObra.map((m) => [m.id, m.total]));
  perto(mao.m1, 44);
  perto(mao.m2, 200);
  perto(mao.m3, 100);
  perto(mao.m4, 49.88);
  perto(mao.m5, 30);

  const custoTotal = 498.8 + 423.88 + 100;
  perto(t.custoTotal, custoTotal);
  perto(t.precoVenda, custoTotal * 1.5);
  perto(t.precoFinal, custoTotal * 1.5 * 0.9);
  perto(t.lucro, t.precoFinal - custoTotal);
  perto(t.precoMl, t.precoFinal / 2);
  perto(t.precoM2, t.precoFinal / 4.4);
  assert.deepEqual(r.avisos, []);
});

test('sem arredondar, cobra só a área usada com perda', () => {
  const projeto = {
    arredondarChapas: false,
    pecas: [{ id: 'a', qtd: 1, c: 1000, l: 1000, materialId: 'mdf15' }],
  };
  const r = Calc.calcular(projeto, config);
  perto(r.totais.custoChapas, 1.1 * Calc.precoM2(config.materiais[0]));
});

test('avisa sobre peça sem chapa e mão de obra por metro linear sem comprimento', () => {
  const r = Calc.calcular(
    { pecas: [{ id: 'a', nome: 'Solta', qtd: 1, c: 100, l: 100 }], maoDeObra: [{ id: 'm', tipo: 'ml', valor: 10 }] },
    config,
  );
  assert.equal(r.avisos.length, 2);
  assert.equal(r.totais.custoChapas, 0);
});

test('gerarModulo monta caixa, portas e dobradiças', () => {
  const { pecas, dobradicas } = Calc.gerarModulo({
    nome: 'Aéreo',
    largura: 800,
    altura: 700,
    profundidade: 350,
    espessura: 15,
    prateleiras: 1,
    portas: 2,
    materialCaixaId: 'mdf15',
    materialFundoId: 'mdf6',
    fitaId: 'f22',
  });
  const por = Object.fromEntries(pecas.map((p) => [p.nome, p]));
  assert.deepEqual([por.Lateral.qtd, por.Lateral.c, por.Lateral.l], [2, 700, 350]);
  assert.deepEqual([por.Base.c, por.Tampo.c], [770, 770]);
  assert.deepEqual([por.Prateleira.c, por.Prateleira.l], [768, 330]);
  assert.deepEqual([por.Fundo.c, por.Fundo.l, por.Fundo.materialId], [696, 796, 'mdf6']);
  assert.deepEqual([por.Porta.qtd, por.Porta.c, por.Porta.l], [2, 694, 395]);
  assert.equal(por.Porta.fitaC + por.Porta.fitaL, 4);
  assert.equal(dobradicas, 4);
});

test('dobradiças por altura de porta', () => {
  assert.equal(Calc.dobradicasPorPorta(700), 2);
  assert.equal(Calc.dobradicasPorPorta(1200), 3);
  assert.equal(Calc.dobradicasPorPorta(2000), 4);
  assert.equal(Calc.dobradicasPorPorta(2400), 5);
});

test('móvel por medida: balcão 1,58 × 1,30 dá 2,054 m²', () => {
  const m = Calc.medirItemMedida({ largura: 1.58, altura: 1.3, qtd: 1, cobranca: 'm2', preco: 1000 });
  perto(m.m2, 2.054);
  perto(m.total, 2054);
});

test('painel por metro linear cobra só a largura', () => {
  const m = Calc.medirItemMedida({ largura: 1.5, altura: 2.75, cobranca: 'ml', preco: 800 });
  assert.equal(m.qtd, 1); // quantidade vazia vale 1
  perto(m.ml, 1.5);
  perto(m.m2, 4.125);
  perto(m.total, 1200);
});

test('itens por medida entram no preço de venda sem receber margem de novo', () => {
  const projeto = {
    margem: 50,
    desconto: 10,
    itensMedida: [
      { id: 'g', descricao: 'Guarda-roupa', cobranca: 'm2', largura: 2.4, altura: 2.75, qtd: 1, preco: 1000 },
      { id: 'p', descricao: 'Painel', cobranca: 'ml', largura: 1.5, altura: 2.75, qtd: 1, preco: 800 },
    ],
    pecas: [{ id: 'a', qtd: 1, c: 1000, l: 1000, materialId: 'mdf15' }],
  };
  const t = Calc.calcular(projeto, config).totais;
  perto(t.areaMoveis, 6.6 + 4.125);
  perto(t.mlMoveis, 3.9);
  perto(t.vendaMedida, 6600 + 1200);
  perto(t.custoTotal, 300); // 1 chapa
  perto(t.vendaDetalhada, 450);
  perto(t.precoVenda, 8250);
  perto(t.precoFinal, 8250 * 0.9);
  perto(t.lucro, 450 * 0.9 - 300);
  assert.equal(t.baseM2, 'moveis');
  perto(t.precoM2, t.precoFinal / t.areaMoveis);
  perto(t.precoMl, t.precoFinal / 3.9);
});

test('só itens por medida, sem peças, fecha o orçamento', () => {
  const t = Calc.calcular(
    { margem: 30, itensMedida: [{ id: 'b', cobranca: 'm2', largura: 1.58, altura: 1.3, preco: 1200 }] },
    config,
  ).totais;
  perto(t.precoFinal, 2.054 * 1200);
  assert.equal(t.custoTotal, 0);
  assert.equal(t.lucro, 0);
});

test('gerarModulo com 4 gavetas e sem portas divide a altura', () => {
  const { pecas, dobradicas, corredicas } = Calc.gerarModulo({
    largura: 600, altura: 750, profundidade: 500, espessura: 15, gavetas: 4,
    materialCaixaId: 'mdf15', materialFundoId: 'mdf6', fitaId: 'f22',
  });
  const por = Object.fromEntries(pecas.map((p) => [p.nome, p]));
  assert.equal(dobradicas, 0);
  assert.equal(corredicas, 4);
  assert.deepEqual([por['Frente de gaveta'].qtd, por['Frente de gaveta'].c, por['Frente de gaveta'].l], [4, 594, 183]);
  assert.deepEqual([por['Lateral de gaveta'].qtd, por['Lateral de gaveta'].c], [8, 450]);
  assert.equal(por['Frente/traseira interna de gaveta'].c, 600 - 30 - 26 - 30);
  assert.deepEqual([por['Fundo de gaveta'].c, por['Fundo de gaveta'].l], [450, 544]);
});

test('gerarModulo com portas e gavetas põe as gavetas embaixo', () => {
  const { pecas, dobradicas } = Calc.gerarModulo({
    largura: 1000, altura: 2750, profundidade: 550, espessura: 15, portas: 2, gavetas: 4,
    materialCaixaId: 'mdf15', fitaId: 'f22',
  });
  const porta = pecas.find((p) => p.nome === 'Porta');
  assert.equal(porta.c, 2750 - 6 - 4 * 183);
  assert.equal(pecas.find((p) => p.nome === 'Frente de gaveta').l, 180);
  assert.equal(dobradicas, 2 * 4);
});

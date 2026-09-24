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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularItem,
  calcularPagamento,
  calcularTotais,
  descreverCalculo,
  descreverMedida,
  descreverPagamento,
  dividirParcelas,
  formatarDinheiro,
  formatarMedida,
  formatarPercentual,
  lerDinheiro,
  lerMedida,
  lerPercentual,
  somarDias,
} from '../public/shared/calc.js';

const linear = (m, preco, extra = {}) => ({
  metodo_calculo: 'linear',
  largura_mm: lerMedida(m),
  preco_unitario_interno_cents: lerDinheiro(preco),
  quantidade: 1,
  ...extra,
});

test('lê valores digitados no formato brasileiro', () => {
  assert.equal(lerDinheiro('1.800,00'), 180000);
  assert.equal(lerDinheiro('1800'), 180000);
  assert.equal(lerDinheiro('1.800'), 180000);
  assert.equal(lerDinheiro('R$ 1.650,5'), 165050);
  assert.equal(lerDinheiro('850.75'), 85075);
  assert.equal(lerDinheiro('0,005'), 1);
  assert.equal(lerDinheiro(''), null);
  assert.equal(lerDinheiro('abc'), null);
  assert.equal(lerDinheiro('-5'), null);
  assert.equal(lerMedida('3,20'), 3200);
  assert.equal(lerMedida('3.2'), 3200);
  assert.equal(lerMedida('3'), 3000);
  assert.equal(lerMedida('2,7'), 2700);
  assert.equal(lerMedida('0,4555'), 456);
  assert.equal(lerPercentual('5'), 500);
  assert.equal(lerPercentual('5,5%'), 550);
});

test('formata dinheiro, medidas e percentuais', () => {
  assert.equal(formatarDinheiro(576000), 'R$ 5.760,00');
  assert.equal(formatarDinheiro(78450), 'R$ 784,50');
  assert.equal(formatarDinheiro(1490550), 'R$ 14.905,50');
  assert.equal(formatarDinheiro(5), 'R$ 0,05');
  assert.equal(formatarDinheiro(-59000), '- R$ 590,00');
  assert.equal(formatarDinheiro(123456789), 'R$ 1.234.567,89');
  assert.equal(formatarMedida(3200), '3,20');
  assert.equal(formatarMedida(3255), '3,255');
  assert.equal(formatarMedida(500), '0,50');
  assert.equal(formatarPercentual(500), '5');
  assert.equal(formatarPercentual(550), '5,5');
  assert.equal(formatarPercentual(1225), '12,25');
});

test('metro linear: 3,20 m × R$ 1.800 = R$ 5.760', () => {
  assert.equal(calcularItem(linear('3,20', '1800')).valor_total_cents, 576000);
  assert.equal(calcularItem(linear('2,50', '900')).valor_total_cents, 225000);
  assert.equal(calcularItem(linear('4,80', '1600')).valor_total_cents, 768000);
});

test('metro quadrado: 3,20 × 2,70 = 8,64 m² × R$ 850 = R$ 7.344', () => {
  const item = {
    metodo_calculo: 'quadrado',
    largura_mm: 3200,
    altura_mm: 2700,
    preco_unitario_interno_cents: 85000,
    quantidade: 1,
  };
  const r = calcularItem(item);
  assert.equal(r.medida_milesimos, 8640);
  assert.equal(r.valor_total_cents, 734400);
  assert.equal(descreverMedida(item), '3,20 × 2,70 = 8,64 m²');
  assert.equal(descreverCalculo(item), '8,64 m² × R$ 850,00/m²');
});

test('quantidade multiplica o valor de uma unidade', () => {
  const criadoMudo = { metodo_calculo: 'unidade', preco_unitario_interno_cents: 80000, quantidade: 2 };
  assert.deepEqual(calcularItem(criadoMudo), {
    quantidade: 2,
    medida_milesimos: null,
    valor_unitario_cents: 80000,
    valor_total_cents: 160000,
  });
  const r = calcularItem(linear('0,50', '1600', { quantidade: 2 }));
  assert.equal(r.valor_unitario_cents, 80000);
  assert.equal(r.valor_total_cents, 160000);
});

test('preço personalizado: 3,20 m × R$ 1.650 = R$ 5.280', () => {
  assert.equal(calcularItem(linear('3,20', '1650')).valor_total_cents, 528000);
});

test('arredonda para centavos sem erro de ponto flutuante', () => {
  // 1,005 m × R$ 0,50 = R$ 0,5025 → R$ 0,50
  assert.equal(calcularItem(linear('1,005', '0,50')).valor_total_cents, 50);
  // 1,001 m × R$ 1.234,57 = R$ 1.235,80457 → R$ 1.235,80
  assert.equal(calcularItem(linear('1,001', '1234,57')).valor_total_cents, 123580);
  // 0,333 × 0,333 m² × R$ 1.000 = R$ 110,889 → R$ 110,89
  const q = { metodo_calculo: 'quadrado', largura_mm: 333, altura_mm: 333, preco_unitario_interno_cents: 100000 };
  assert.equal(calcularItem(q).valor_total_cents, 11089);
  // metade de centavo arredonda para cima: 0,005 m × R$ 1,00 = R$ 0,005 → R$ 0,01
  assert.equal(calcularItem(linear('0,005', '1')).valor_total_cents, 1);
});

const exemplo = () => ({
  itens: [linear('3,20', '1800'), linear('2,50', '900'), linear('4,80', '1600')],
  servicos: [],
  desconto_tipo: 'nenhum',
  desconto_valor: 0,
  acrescimo_tipo: 'nenhum',
  acrescimo_valor: 0,
});

test('subtotal dos móveis = R$ 15.690', () => {
  const t = calcularTotais(exemplo());
  assert.equal(t.subtotal_cents, 1569000);
  assert.equal(t.total_cents, 1569000);
});

test('desconto de 5% = R$ 784,50 → total R$ 14.905,50', () => {
  const t = calcularTotais({ ...exemplo(), desconto_tipo: 'percentual', desconto_valor: 500 });
  assert.equal(t.desconto_cents, 78450);
  assert.equal(t.total_cents, 1490550);
});

test('exemplo completo: montagem + frete − desconto = R$ 16.000', () => {
  const t = calcularTotais({
    ...exemplo(),
    servicos: [
      { descricao: 'Montagem', valor_cents: 60000, quantidade: 1 },
      { descricao: 'Frete', valor_cents: 30000, quantidade: 1 },
    ],
    desconto_tipo: 'valor',
    desconto_valor: 59000,
  });
  assert.equal(t.subtotal_moveis_cents, 1569000);
  assert.equal(t.subtotal_servicos_cents, 90000);
  assert.equal(t.subtotal_cents, 1659000);
  assert.equal(t.total_cents, 1600000);
});

test('acréscimo em valor ou percentual', () => {
  assert.equal(calcularTotais({ ...exemplo(), acrescimo_tipo: 'valor', acrescimo_valor: 50000 }).total_cents, 1619000);
  assert.equal(
    calcularTotais({ ...exemplo(), acrescimo_tipo: 'percentual', acrescimo_valor: 500 }).acrescimo_cents,
    78450,
  );
});

test('desconto nunca deixa o total negativo', () => {
  const t = calcularTotais({ ...exemplo(), desconto_tipo: 'valor', desconto_valor: 99999999 });
  assert.equal(t.desconto_cents, 1569000);
  assert.equal(t.total_cents, 0);
});

test('entrada de R$ 7.000 deixa restante de R$ 7.905,50', () => {
  const p = calcularPagamento(1490550, { entrada_tipo: 'valor', entrada_valor: 700000, parcelas: 1 });
  assert.equal(p.entrada_cents, 700000);
  assert.equal(p.restante_cents, 790550);
  assert.deepEqual(descreverPagamento(1490550, { entrada_tipo: 'valor', entrada_valor: 700000, parcelas: 1 }), [
    'Entrada: R$ 7.000,00',
    'Restante: R$ 7.905,50',
  ]);
});

test('50% de entrada + 50% na entrega', () => {
  assert.deepEqual(descreverPagamento(1569000, { entrada_tipo: 'percentual', entrada_valor: 5000, parcelas: 1 }), [
    'Entrada: R$ 7.845,00',
    'Restante: R$ 7.845,00',
  ]);
});

test('parcelas somam exatamente o restante', () => {
  assert.deepEqual(dividirParcelas(790550, 3), [263517, 263517, 263516]);
  assert.deepEqual(
    descreverPagamento(1490550, { entrada_tipo: 'valor', entrada_valor: 700000, parcelas: 3 }),
    ['Entrada: R$ 7.000,00', 'Restante: R$ 7.905,50 em 2x de R$ 2.635,17 + 1x de R$ 2.635,16'],
  );
  assert.deepEqual(descreverPagamento(1000000, { entrada_tipo: 'nenhum', parcelas: 10 }), [
    'Parcelamento: 10x de R$ 1.000,00',
  ]);
  assert.deepEqual(descreverPagamento(1000000, { entrada_tipo: 'nenhum', parcelas: 0 }), []);
});

test('calcula a data de validade', () => {
  assert.equal(somarDias('2026-09-24', 10), '2026-10-04');
  assert.equal(somarDias('2026-12-25', 15), '2027-01-09');
  assert.equal(somarDias('2028-02-28', 1), '2028-02-29');
});

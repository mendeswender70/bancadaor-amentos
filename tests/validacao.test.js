import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataIso, ErroHttp } from '../server/validacao.js';
import { metaDoPeriodo, periodoComercial } from '../server/painel.js';

test('datas ISO aceitam dias reais e ano bissexto', () => {
  assert.equal(dataIso('2024-02-29'), '2024-02-29');
  assert.equal(dataIso('2026-10-31'), '2026-10-31');
});

test('datas ISO rejeitam dias que o JavaScript normalizaria para outro mês', () => {
  for (const valor of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2026-2-01', '0000-01-01']) {
    assert.throws(() => dataIso(valor), ErroHttp, `${valor} deve ser inválida`);
  }
});

test('meta do período: ritmo é a parte do período que já passou', () => {
  const mes = periodoComercial('2026-11-09', 'mes');
  assert.deepEqual(metaDoPeriodo('2026-11-09', mes, 9_000_000, 6_124_000), { mensal_cents: 9_000_000, valor_cents: 9_000_000, aprovados_cents: 6_124_000, ritmo: 30, dias_restantes: 21 });
  assert.deepEqual(metaDoPeriodo('2026-11-30', mes, 9_000_000, 0), { mensal_cents: 9_000_000, valor_cents: 9_000_000, aprovados_cents: 0, ritmo: 100, dias_restantes: 0 });
  const anterior = periodoComercial('2026-11-09', 'anterior');
  assert.equal(metaDoPeriodo('2026-11-09', anterior, 9_000_000, 0).ritmo, 100, 'mês fechado já passou inteiro');
  assert.equal(metaDoPeriodo('2026-11-09', periodoComercial('2026-11-09', 'semestre'), 9_000_000, 0).valor_cents, 54_000_000);
  assert.equal(metaDoPeriodo('2026-11-09', mes, 0, 100).ritmo, null, 'sem meta não há ritmo');
});

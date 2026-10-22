import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataIso, ErroHttp } from '../server/validacao.js';

test('datas ISO aceitam dias reais e ano bissexto', () => {
  assert.equal(dataIso('2024-02-29'), '2024-02-29');
  assert.equal(dataIso('2026-10-31'), '2026-10-31');
});

test('datas ISO rejeitam dias que o JavaScript normalizaria para outro mês', () => {
  for (const valor of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2026-2-01', '0000-01-01']) {
    assert.throws(() => dataIso(valor), ErroHttp, `${valor} deve ser inválida`);
  }
});

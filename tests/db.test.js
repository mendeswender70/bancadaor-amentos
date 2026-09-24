import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, configuracaoBanco } from '../server/db.js';

test('detecta o banco Turso pelas variáveis da Vercel', () => {
  assert.deepEqual(configuracaoBanco({ TURSO_DATABASE_URL: 'libsql://a.turso.io', TURSO_AUTH_TOKEN: 't1' }), {
    url: 'libsql://a.turso.io',
    authToken: 't1',
  });
  // Prefixo escolhido ao conectar o banco ao projeto
  assert.deepEqual(
    configuracaoBanco({ APP_URL: 'https://meusite.com', STORAGE_URL: 'libsql://b.turso.io', STORAGE_AUTH_TOKEN: 't2' }),
    { url: 'libsql://b.turso.io', authToken: 't2' },
  );
  assert.deepEqual(configuracaoBanco({ ORCAMENTOS_DATABASE_URL: 'libsql://c.turso.io', ORCAMENTOS_TOKEN: 't3' }), {
    url: 'libsql://c.turso.io',
    authToken: 't3',
  });
  assert.equal(configuracaoBanco({ APP_URL: 'https://meusite.com', DATABASE_URL: 'postgres://x' }), null);
  assert.equal(configuracaoBanco({}), null);
});

test('na Vercel sem banco configurado mostra um erro claro', async () => {
  process.env.VERCEL = '1';
  try {
    await assert.rejects(abrirBanco(null), (e) => e.status === 503 && /Turso/.test(e.message));
  } finally {
    delete process.env.VERCEL;
  }
});

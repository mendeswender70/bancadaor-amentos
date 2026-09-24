import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, configuracaoBanco, converterParametros } from '../server/db.js';

test('detecta o banco Supabase pelas variáveis de ambiente', () => {
  const supa = 'postgres://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';
  assert.deepEqual(configuracaoBanco({ DATABASE_URL: supa }), { url: supa });
  // Integração Supabase ↔ Vercel
  assert.deepEqual(configuracaoBanco({ POSTGRES_URL: supa, POSTGRES_URL_NON_POOLING: 'postgres://direto' }), { url: supa });
  // Prefixo personalizado: prefere o endereço com pooler
  assert.deepEqual(
    configuracaoBanco({ APP_URL: 'https://site.com', ESQ_POSTGRES_URL_NON_POOLING: 'postgres://direto', ESQ_POSTGRES_URL: supa }),
    { url: supa },
  );
  assert.equal(configuracaoBanco({ APP_URL: 'https://site.com', DATABASE_URL: 'libsql://x.turso.io' }), null);
  assert.equal(configuracaoBanco({}), null);
});

test('troca ? por $n sem mexer no que está entre aspas', () => {
  assert.equal(converterParametros('SELECT * FROM t WHERE a = ? AND b = ?'), 'SELECT * FROM t WHERE a = $1 AND b = $2');
  assert.equal(converterParametros("SELECT '?' AS x, ? AS y, 'it''s ?' AS z"), "SELECT '?' AS x, $1 AS y, 'it''s ?' AS z");
});

test('na Vercel sem banco configurado mostra um erro claro', async () => {
  process.env.VERCEL = '1';
  try {
    await assert.rejects(abrirBanco(null), (e) => e.status === 503 && /DATABASE_URL/.test(e.message));
  } finally {
    delete process.env.VERCEL;
  }
});

test('migrações criam as tabelas e os dados iniciais uma única vez', async () => {
  const db = await abrirBanco({ url: 'memory://' });
  try {
    const tipos = await db.all('SELECT nome, preco_padrao_cents FROM tipos_moveis ORDER BY id');
    assert.equal(tipos.length, 6);
    assert.equal(tipos[0].preco_padrao_cents, 180000);
    assert.equal(typeof tipos[0].preco_padrao_cents, 'number');
    const empresa = await db.get('SELECT texto_padrao, condicao_pagamento_padrao_id FROM empresa WHERE id = 1');
    assert.match(empresa.texto_padrao, /^Medidas finais.*\nProjeto sujeito/s);
    assert.ok(empresa.condicao_pagamento_padrao_id);
    const rls = await db.all("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity");
    assert.deepEqual(rls, [], 'toda tabela precisa de RLS ligado');
  } finally {
    await db.close();
  }
});

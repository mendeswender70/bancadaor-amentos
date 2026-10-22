import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, configuracaoBanco, converterParametros, MIGRACOES } from '../server/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

test('detecta a conexão Neon pelas variáveis de ambiente', () => {
  const neon = 'postgres://esquadro:senha@ep-example-pooler.c-2.sa-east-1.aws.neon.tech/neondb';
  assert.deepEqual(configuracaoBanco({ DATABASE_URL: neon }), { url: neon });
  assert.deepEqual(configuracaoBanco({ POSTGRES_URL: neon, POSTGRES_URL_NON_POOLING: 'postgres://direto' }), { url: neon });
  // Prefixo personalizado: prefere o endereço com pooler
  assert.deepEqual(
    configuracaoBanco({ APP_URL: 'https://site.com', ESQ_POSTGRES_URL_NON_POOLING: 'postgres://direto', ESQ_POSTGRES_URL: neon }),
    { url: neon },
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

test('explica o que corrigir quando a conexão com o banco falha', async () => {
  const { explicarErroBanco } = await import('../server/db.js');
  assert.match(explicarErroBanco({ code: '28P01', message: 'password authentication failed for user "postgres"' }), /senha/i);
  assert.match(explicarErroBanco({ code: 'XX000', message: 'Tenant or user not found' }), /usuário/i);
  assert.match(explicarErroBanco({ code: 'ENOTFOUND' }), /não foi encontrado/);
  assert.match(explicarErroBanco({ code: 'ENETUNREACH' }), /Transaction pooler/);
  assert.match(explicarErroBanco(new TypeError('Invalid URL')), /formato inválido/);
  assert.doesNotMatch(explicarErroBanco({ message: 'x', code: 'ECONNREFUSED' }), /senha123/);
});

test('atualiza um banco v3 preservando os orçamentos e aprovações existentes', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'esquadro-migracao-'));
  let banco;
  try {
    const antigo = await PGlite.create(pasta);
    try {
      await antigo.exec('CREATE TABLE migracoes (versao integer PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())');
      for (const [i, comandos] of MIGRACOES.slice(0, 3).entries()) {
        for (const sql of comandos) await antigo.exec(sql);
        await antigo.query('INSERT INTO migracoes (versao) VALUES ($1)', [i + 1]);
      }
      await antigo.exec(`INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Admin existente', 'admin@exemplo.com', 'hash-de-teste');
        INSERT INTO clientes (nome) VALUES ('Cliente existente');
        INSERT INTO orcamentos (numero, cliente_id, data, validade_dias, data_validade, status,
          total_cents, aprovado_em, aprovado_por, aprovado_pelo_link)
        VALUES (1, 1, '2026-09-24', 10, '2026-10-04', 'aprovado', 12345,
          '2026-09-25T12:00:00Z', 'Cliente existente', 1)`);
    } finally {
      await antigo.close();
    }
    banco = await abrirBanco({ url: `pglite:${pasta}` });
    const orc = await banco.get(`SELECT status, total_cents, aprovado_por, aprovado_pelo_link, versao, versao_proposta,
      pagamento_cartao_metodo, pagamento_cartao_parcelas, pagamento_cartao_taxas
      FROM orcamentos WHERE numero = 1`);
    assert.deepEqual(orc, {
      status: 'aprovado', total_cents: 12345, aprovado_por: 'Cliente existente', aprovado_pelo_link: 1,
      versao: 1, versao_proposta: 1, pagamento_cartao_metodo: 'nenhum', pagamento_cartao_parcelas: 0, pagamento_cartao_taxas: '',
    });
    assert.equal((await banco.get('SELECT MAX(versao) AS versao FROM migracoes')).versao, MIGRACOES.length);
    assert.equal((await banco.get('SELECT nextval(\'orcamentos_numero_seq\') AS numero')).numero, 2);
    assert.ok((await banco.get('SELECT concluida_em FROM configuracao_inicial WHERE id = 1')).concluida_em,
      'bancos com administrador existente são marcados como configurados');
    const tabelasNotificacoes = await banco.all("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('inscricoes_push', 'notificacoes_deploy', 'notificacoes_lembrete') ORDER BY tablename");
    assert.deepEqual(tabelasNotificacoes.map((t) => t.tablename), ['inscricoes_push', 'notificacoes_deploy', 'notificacoes_lembrete']);
    const rlsPush = await banco.all("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('inscricoes_push', 'notificacoes_deploy', 'notificacoes_lembrete', 'configuracao_inicial') AND relrowsecurity");
    assert.equal(rlsPush.length, 4);
    await banco.close();
    banco = await abrirBanco({ url: `pglite:${pasta}` });
    assert.equal((await banco.get('SELECT COUNT(*) AS n FROM orcamentos')).n, 1);
  } finally {
    await banco?.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

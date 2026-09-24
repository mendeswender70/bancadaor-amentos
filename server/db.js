import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErroHttp } from './validacao.js';

export function semAcento(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function somenteDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

// Cada posição é uma versão do banco. Nunca altere uma migração já publicada:
// acrescente uma nova no final.
const MIGRACOES = [
  [
    `CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha_hash TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'administrador',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE sessoes (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira_em TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE tentativas_login (
      chave TEXT PRIMARY KEY,
      quantidade INTEGER NOT NULL,
      inicio TEXT NOT NULL
    )`,
    // nome_busca e *_digitos são mantidos pela aplicação para a busca
    // ignorar acentos e a formatação dos telefones.
    `CREATE TABLE clientes (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      cpf_cnpj TEXT NOT NULL DEFAULT '',
      endereco TEXT NOT NULL DEFAULT '',
      cidade TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT '',
      observacoes TEXT NOT NULL DEFAULT '',
      nome_busca TEXT NOT NULL DEFAULT '',
      telefone_digitos TEXT NOT NULL DEFAULT '',
      whatsapp_digitos TEXT NOT NULL DEFAULT '',
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE tipos_moveis (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      nome_cliente TEXT NOT NULL DEFAULT '',
      unidade TEXT NOT NULL,
      metodo_calculo TEXT NOT NULL CHECK (metodo_calculo IN ('linear', 'quadrado', 'unidade')),
      preco_padrao_cents INTEGER NOT NULL CHECK (preco_padrao_cents >= 0),
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE condicoes_pagamento (
      id INTEGER PRIMARY KEY,
      descricao TEXT NOT NULL,
      entrada_tipo TEXT NOT NULL DEFAULT 'nenhum' CHECK (entrada_tipo IN ('nenhum', 'valor', 'percentual')),
      entrada_valor INTEGER NOT NULL DEFAULT 0,
      parcelas INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE empresa (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nome TEXT NOT NULL DEFAULT '',
      cnpj TEXT NOT NULL DEFAULT '',
      telefone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      endereco TEXT NOT NULL DEFAULT '',
      cidade TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT '',
      logo BLOB,
      logo_mime TEXT,
      logo_atualizado_em TEXT,
      texto_padrao TEXT NOT NULL DEFAULT '',
      condicao_pagamento_padrao_id INTEGER REFERENCES condicoes_pagamento(id) ON DELETE SET NULL,
      prazo_padrao TEXT NOT NULL DEFAULT '',
      validade_padrao_dias INTEGER NOT NULL DEFAULT 10,
      mensagem_whatsapp TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE orcamentos (
      id INTEGER PRIMARY KEY,
      numero INTEGER NOT NULL UNIQUE,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      data TEXT NOT NULL,
      validade_dias INTEGER NOT NULL,
      data_validade TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'enviado', 'negociacao', 'aprovado', 'recusado', 'cancelado', 'expirado')),
      subtotal_moveis_cents INTEGER NOT NULL DEFAULT 0,
      subtotal_servicos_cents INTEGER NOT NULL DEFAULT 0,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      desconto_tipo TEXT NOT NULL DEFAULT 'nenhum',
      desconto_valor INTEGER NOT NULL DEFAULT 0,
      desconto_cents INTEGER NOT NULL DEFAULT 0,
      acrescimo_descricao TEXT NOT NULL DEFAULT '',
      acrescimo_tipo TEXT NOT NULL DEFAULT 'nenhum',
      acrescimo_valor INTEGER NOT NULL DEFAULT 0,
      acrescimo_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      pagamento_descricao TEXT NOT NULL DEFAULT '',
      pagamento_entrada_tipo TEXT NOT NULL DEFAULT 'nenhum',
      pagamento_entrada_valor INTEGER NOT NULL DEFAULT 0,
      pagamento_parcelas INTEGER NOT NULL DEFAULT 0,
      prazo_entrega TEXT NOT NULL DEFAULT '',
      observacoes TEXT NOT NULL DEFAULT '',
      observacoes_internas TEXT NOT NULL DEFAULT '',
      duplicado_de_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX orcamentos_cliente ON orcamentos(cliente_id)`,
    `CREATE INDEX orcamentos_data ON orcamentos(data)`,
    // O preço usado fica gravado no item: mudar o cadastro de preços depois
    // não altera orçamentos antigos.
    `CREATE TABLE orcamento_itens (
      id INTEGER PRIMARY KEY,
      orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      tipo_movel_id INTEGER REFERENCES tipos_moveis(id) ON DELETE SET NULL,
      tipo_nome TEXT NOT NULL DEFAULT '',
      descricao TEXT NOT NULL DEFAULT '',
      metodo_calculo TEXT NOT NULL CHECK (metodo_calculo IN ('linear', 'quadrado', 'unidade')),
      largura_mm INTEGER,
      altura_mm INTEGER,
      quantidade INTEGER NOT NULL DEFAULT 1,
      medida_calculada REAL,
      preco_padrao_cents INTEGER,
      preco_unitario_interno_cents INTEGER NOT NULL,
      valor_unitario_cents INTEGER NOT NULL,
      valor_total_cents INTEGER NOT NULL,
      observacoes TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX itens_orcamento ON orcamento_itens(orcamento_id)`,
    `CREATE TABLE orcamento_servicos (
      id INTEGER PRIMARY KEY,
      orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      descricao TEXT NOT NULL,
      valor_cents INTEGER NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      total_cents INTEGER NOT NULL
    )`,
    `CREATE INDEX servicos_orcamento ON orcamento_servicos(orcamento_id)`,
    `CREATE TABLE orcamento_historico (
      id INTEGER PRIMARY KEY,
      orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      data_hora TEXT NOT NULL DEFAULT (datetime('now')),
      evento TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      snapshot TEXT
    )`,
    `CREATE INDEX historico_orcamento ON orcamento_historico(orcamento_id)`,

    // Dados iniciais
    {
      sql: `INSERT INTO tipos_moveis (nome, nome_cliente, unidade, metodo_calculo, preco_padrao_cents) VALUES
        ('Guarda-roupa', 'Guarda-roupa planejado', 'm', 'linear', 180000),
        ('Cozinha planejada', 'Cozinha planejada', 'm', 'linear', 160000),
        ('Painel', 'Painel planejado', 'm', 'linear', 90000),
        ('Closet', 'Closet planejado', 'm', 'linear', 200000),
        ('Bancada', 'Bancada planejada', 'm²', 'quadrado', 85000),
        ('Criado-mudo', 'Criado-mudo planejado', 'un.', 'unidade', 80000)`,
    },
    `INSERT INTO condicoes_pagamento (id, descricao, entrada_tipo, entrada_valor, parcelas) VALUES
      (1, 'À vista', 'nenhum', 0, 0),
      (2, '50% de entrada + 50% na entrega', 'percentual', 5000, 1),
      (3, 'Entrada + parcelas', 'valor', 0, 3)`,
    {
      sql: `INSERT INTO empresa (id, nome, texto_padrao, condicao_pagamento_padrao_id, prazo_padrao, validade_padrao_dias, mensagem_whatsapp)
            VALUES (1, ?, ?, 2, ?, 10, ?)`,
      args: [
        'Minha Marcenaria',
        [
          'Medidas finais serão conferidas antes da fabricação.',
          'Projeto sujeito à conferência técnica.',
          'Valores podem sofrer alteração após alteração das medidas.',
          'Prazo começa a contar após aprovação e pagamento da entrada.',
        ].join('\n'),
        '30 dias úteis',
        'Olá, {cliente}! Segue o orçamento dos móveis planejados conforme conversamos. Qualquer dúvida estou à disposição.',
      ],
    },
  ],

  // v2 — Ambientes: os móveis passam a ser agrupados por ambiente
  // (Quarto do casal, Sala, Cozinha…). Orçamentos antigos ganham um
  // ambiente "Móveis" com todos os itens.
  [
    `CREATE TABLE orcamento_ambientes (
      id INTEGER PRIMARY KEY,
      orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      nome TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX ambientes_orcamento ON orcamento_ambientes(orcamento_id)`,
    `ALTER TABLE orcamento_itens ADD COLUMN ambiente_id INTEGER REFERENCES orcamento_ambientes(id) ON DELETE CASCADE`,
    `INSERT INTO orcamento_ambientes (orcamento_id, ordem, nome)
      SELECT DISTINCT orcamento_id, 0, 'Móveis' FROM orcamento_itens`,
    `UPDATE orcamento_itens SET ambiente_id =
      (SELECT a.id FROM orcamento_ambientes a WHERE a.orcamento_id = orcamento_itens.orcamento_id)`,
  ],
];

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

/**
 * Descobre o banco a usar. Na Vercel, a integração do Turso cria as variáveis
 * com um prefixo escolhido na hora de conectar (ex.: TURSO_DATABASE_URL ou
 * STORAGE_URL), então procuramos qualquer variável *_URL que aponte para um
 * banco libSQL/Turso. Sem nenhuma, usa um arquivo local.
 */
export function configuracaoBanco(env = process.env) {
  const ehBanco = (v) => /^(libsql|wss?|https?):\/\/.+/.test(v || '') && /^libsql:|turso\.io/.test(v);
  if (env.DATABASE_URL && (ehBanco(env.DATABASE_URL) || env.DATABASE_URL.startsWith('file:'))) {
    return { url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN };
  }
  if (env.TURSO_DATABASE_URL) return { url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN };
  for (const [chave, valor] of Object.entries(env)) {
    const m = /^(.*?)_(?:DATABASE_)?URL$/.exec(chave);
    if (m && ehBanco(valor)) {
      const prefixos = [m[1], `${m[1]}_DATABASE`];
      const token = prefixos.map((p) => env[`${p}_AUTH_TOKEN`] || env[`${p}_TOKEN`]).find(Boolean);
      return { url: valor, authToken: token };
    }
  }
  return null;
}

function linhaParaObjeto(colunas, linha) {
  const obj = {};
  colunas.forEach((c, i) => {
    obj[c] = linha[i];
  });
  return obj;
}

function argumentos(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (Buffer.isBuffer(p)) return new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    return p;
  });
}

/** Camada fina sobre o cliente libSQL, com o jeito de uso do resto do código. */
class Banco {
  constructor(executor, { raiz = null } = {}) {
    this.executor = executor;
    this.raiz = raiz; // cliente original (null dentro de transações)
  }

  async all(sql, ...params) {
    const rs = await this.executor.execute({ sql, args: argumentos(params) });
    return rs.rows.map((linha) => linhaParaObjeto(rs.columns, linha));
  }

  async get(sql, ...params) {
    return (await this.all(sql, ...params))[0];
  }

  async run(sql, ...params) {
    const rs = await this.executor.execute({ sql, args: argumentos(params) });
    return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid) };
  }

  /** Executa `fn(transacao)` de forma atômica. Dentro dela, use só o objeto recebido. */
  async transacao(fn) {
    if (!this.raiz) return fn(this);
    const tx = await this.raiz.transaction('write');
    try {
      const resultado = await fn(new Banco(tx));
      await tx.commit();
      return resultado;
    } catch (erro) {
      await tx.rollback().catch(() => {});
      throw erro;
    } finally {
      tx.close();
    }
  }

  close() {
    this.raiz?.close();
  }
}

async function migrar(cliente) {
  await cliente.execute('CREATE TABLE IF NOT EXISTS migracoes (versao INTEGER PRIMARY KEY, aplicada_em TEXT)');
  const versaoAtual = async () =>
    Number((await cliente.execute('SELECT COALESCE(MAX(versao), 0) AS v FROM migracoes')).rows[0].v);
  for (let v = await versaoAtual(); v < MIGRACOES.length; v++) {
    const comandos = MIGRACOES[v].map((c) => (typeof c === 'string' ? { sql: c, args: [] } : { args: [], ...c }));
    comandos.push({ sql: `INSERT INTO migracoes (versao, aplicada_em) VALUES (?, datetime('now'))`, args: [v + 1] });
    try {
      await cliente.batch(comandos, 'write');
    } catch (erro) {
      // Outra instância pode ter aplicado a mesma migração ao mesmo tempo.
      if ((await versaoAtual()) > v) continue;
      throw erro;
    }
  }
}

/**
 * Abre o banco e aplica as migrações.
 * @param {{url?: string, authToken?: string}} [config] sem config: detecta pelo ambiente.
 */
export async function abrirBanco(config = configuracaoBanco()) {
  let url = config?.url;
  if (!url) {
    if (process.env.VERCEL) {
      throw new ErroHttp(
        503,
        'Banco de dados não configurado. Conecte um banco Turso ao projeto na Vercel (Storage → Turso) e faça um novo deploy.',
      );
    }
    const arquivo = fileURLToPath(new URL('../data/orcamentos.db', import.meta.url));
    mkdirSync(dirname(arquivo), { recursive: true });
    url = `file:${arquivo}`;
  }
  const cliente = createClient({ url, authToken: config?.authToken, intMode: 'number' });
  if (url.startsWith('file:')) await cliente.execute('PRAGMA foreign_keys = ON');
  await migrar(cliente);
  return new Banco(cliente, { raiz: cliente });
}

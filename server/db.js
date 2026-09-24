import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'administrador',
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE clientes (
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
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE tipos_moveis (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    nome_cliente TEXT NOT NULL DEFAULT '',
    unidade TEXT NOT NULL,
    metodo_calculo TEXT NOT NULL CHECK (metodo_calculo IN ('linear', 'quadrado', 'unidade')),
    preco_padrao_cents INTEGER NOT NULL CHECK (preco_padrao_cents >= 0),
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE condicoes_pagamento (
    id INTEGER PRIMARY KEY,
    descricao TEXT NOT NULL,
    entrada_tipo TEXT NOT NULL DEFAULT 'nenhum' CHECK (entrada_tipo IN ('nenhum', 'valor', 'percentual')),
    entrada_valor INTEGER NOT NULL DEFAULT 0,
    parcelas INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE empresa (
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
  );

  CREATE TABLE orcamentos (
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
  );
  CREATE INDEX orcamentos_cliente ON orcamentos(cliente_id);
  CREATE INDEX orcamentos_data ON orcamentos(data);

  -- O preço usado fica gravado no item: mudar o cadastro de preços depois
  -- não altera orçamentos antigos.
  CREATE TABLE orcamento_itens (
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
  );
  CREATE INDEX itens_orcamento ON orcamento_itens(orcamento_id);

  CREATE TABLE orcamento_servicos (
    id INTEGER PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 0,
    descricao TEXT NOT NULL,
    valor_cents INTEGER NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    total_cents INTEGER NOT NULL
  );
  CREATE INDEX servicos_orcamento ON orcamento_servicos(orcamento_id);

  CREATE TABLE orcamento_historico (
    id INTEGER PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    data_hora TEXT NOT NULL DEFAULT (datetime('now')),
    evento TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    snapshot TEXT
  );
  CREATE INDEX historico_orcamento ON orcamento_historico(orcamento_id);
  `,
];

function semear(db) {
  const tipo = db.prepare(
    `INSERT INTO tipos_moveis (nome, nome_cliente, unidade, metodo_calculo, preco_padrao_cents) VALUES (?, ?, ?, ?, ?)`,
  );
  tipo.run('Guarda-roupa', 'Guarda-roupa planejado', 'm', 'linear', 180000);
  tipo.run('Cozinha planejada', 'Cozinha planejada', 'm', 'linear', 160000);
  tipo.run('Painel', 'Painel planejado', 'm', 'linear', 90000);
  tipo.run('Closet', 'Closet planejado', 'm', 'linear', 200000);
  tipo.run('Bancada', 'Bancada planejada', 'm²', 'quadrado', 85000);
  tipo.run('Criado-mudo', 'Criado-mudo planejado', 'un.', 'unidade', 80000);

  const cond = db.prepare(
    `INSERT INTO condicoes_pagamento (descricao, entrada_tipo, entrada_valor, parcelas) VALUES (?, ?, ?, ?)`,
  );
  cond.run('À vista', 'nenhum', 0, 0);
  const meia = cond.run('50% de entrada + 50% na entrega', 'percentual', 5000, 1);
  cond.run('Entrada + parcelas', 'valor', 0, 3);

  db.prepare(
    `INSERT INTO empresa (id, nome, texto_padrao, condicao_pagamento_padrao_id, prazo_padrao, validade_padrao_dias, mensagem_whatsapp)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'Minha Marcenaria',
    [
      'Medidas finais serão conferidas antes da fabricação.',
      'Projeto sujeito à conferência técnica.',
      'Valores podem sofrer alteração após alteração das medidas.',
      'Prazo começa a contar após aprovação e pagamento da entrada.',
    ].join('\n'),
    Number(meia.lastInsertRowid),
    '30 dias úteis',
    10,
    'Olá, {cliente}! Segue o orçamento dos móveis planejados conforme conversamos. Qualquer dúvida estou à disposição.',
  );
}

export function abrirBanco(caminho) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.function('sem_acento', { deterministic: true }, (v) => semAcento(v));
  db.function('digitos', { deterministic: true }, (v) => somenteDigitos(v));

  const versao = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = versao; v < MIGRACOES.length; v++) {
    transacao(db, () => {
      db.exec(MIGRACOES[v]);
      if (v === 0) semear(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

export function transacao(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

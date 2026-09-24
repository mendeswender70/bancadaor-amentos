import {
  LIMITES,
  METODOS,
  STATUS,
  STATUS_ABERTOS,
  TIPOS_AJUSTE,
  calcularItem,
  calcularServico,
  calcularTotais,
  formatarNumero,
  somarDias,
} from '../shared/calc.js';
import { semAcento, transacao } from './db.js';
import { dataIso, inteiro, invalido, naoEncontrado, texto, umDe } from './validacao.js';

const MAX_ITENS = 200;

// Colunas do cabeçalho do orçamento gravadas a cada salvamento.
const COLUNAS = [
  'cliente_id',
  'data',
  'validade_dias',
  'data_validade',
  'status',
  'subtotal_moveis_cents',
  'subtotal_servicos_cents',
  'subtotal_cents',
  'desconto_tipo',
  'desconto_valor',
  'desconto_cents',
  'acrescimo_descricao',
  'acrescimo_tipo',
  'acrescimo_valor',
  'acrescimo_cents',
  'total_cents',
  'pagamento_descricao',
  'pagamento_entrada_tipo',
  'pagamento_entrada_valor',
  'pagamento_parcelas',
  'prazo_entrega',
  'observacoes',
  'observacoes_internas',
];

const COLUNAS_ITEM = [
  'tipo_movel_id',
  'tipo_nome',
  'descricao',
  'metodo_calculo',
  'largura_mm',
  'altura_mm',
  'quantidade',
  'medida_calculada',
  'preco_padrao_cents',
  'preco_unitario_interno_cents',
  'valor_unitario_cents',
  'valor_total_cents',
  'observacoes',
];

const semPrototipo = (linha) => (linha ? { ...linha } : linha);

export function carregarOrcamento(db, id) {
  const orc = semPrototipo(db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id));
  if (!orc) return null;
  orc.cliente = semPrototipo(db.prepare('SELECT * FROM clientes WHERE id = ?').get(orc.cliente_id));
  orc.itens = db
    .prepare('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY ordem, id')
    .all(id)
    .map(semPrototipo);
  orc.servicos = db
    .prepare('SELECT * FROM orcamento_servicos WHERE orcamento_id = ? ORDER BY ordem, id')
    .all(id)
    .map(semPrototipo);
  orc.duplicado_de_numero = orc.duplicado_de_id
    ? (db.prepare('SELECT numero FROM orcamentos WHERE id = ?').get(orc.duplicado_de_id)?.numero ?? null)
    : null;
  return orc;
}

// ---------------------------------------------------------------------------
// Validação e cálculo no servidor (o servidor sempre recalcula os valores)
// ---------------------------------------------------------------------------

function ajuste(body, prefixo, nome) {
  const tipo = umDe(body[`${prefixo}_tipo`] ?? 'nenhum', TIPOS_AJUSTE, `Tipo de ${nome}`);
  const max = tipo === 'percentual' ? LIMITES.percentual : LIMITES.centavos;
  const valor = tipo === 'nenhum' ? 0 : inteiro(body[`${prefixo}_valor`] ?? 0, { max, campo: nome });
  return { tipo, valor };
}

function normalizarItem(db, item, i) {
  const n = i + 1;
  const metodo = umDe(item?.metodo_calculo, Object.keys(METODOS), `Método de cálculo do móvel ${n}`);
  const medida = (valor, campo) => inteiro(valor, { min: 1, max: LIMITES.medidaMm, campo: `${campo} do móvel ${n}` });
  let tipoId = inteiro(item.tipo_movel_id, { min: 1, opcional: true, campo: 'Tipo de móvel' });
  if (tipoId && !db.prepare('SELECT 1 FROM tipos_moveis WHERE id = ?').get(tipoId)) tipoId = null;

  const normalizado = {
    tipo_movel_id: tipoId,
    tipo_nome: texto(item.tipo_nome, { max: 100, campo: 'Tipo de móvel' }),
    descricao: texto(item.descricao, { max: 300, campo: 'Descrição' }),
    metodo_calculo: metodo,
    largura_mm: metodo === 'unidade' ? null : medida(item.largura_mm, metodo === 'linear' ? 'Medida' : 'Largura'),
    altura_mm: metodo === 'quadrado' ? medida(item.altura_mm, 'Altura') : null,
    quantidade: inteiro(item.quantidade ?? 1, { min: 1, max: LIMITES.quantidade, campo: `Quantidade do móvel ${n}` }),
    preco_padrao_cents: inteiro(item.preco_padrao_cents, { max: LIMITES.centavos, opcional: true, campo: 'Preço padrão' }),
    preco_unitario_interno_cents: inteiro(item.preco_unitario_interno_cents, {
      max: LIMITES.centavos,
      campo: `Preço do móvel ${n}`,
    }),
    observacoes: texto(item.observacoes, { max: 1000, campo: 'Observação do móvel' }),
  };
  if (!normalizado.tipo_nome && !normalizado.descricao) throw invalido(`Informe o tipo do móvel ${n}.`);

  const r = calcularItem(normalizado);
  normalizado.medida_calculada = r.medida_milesimos === null ? null : r.medida_milesimos / 1000;
  normalizado.valor_unitario_cents = r.valor_unitario_cents;
  normalizado.valor_total_cents = r.valor_total_cents;
  return normalizado;
}

function normalizarServico(servico, i) {
  const s = {
    descricao: texto(servico?.descricao, { max: 200, obrigatorio: true, campo: `Descrição do serviço ${i + 1}` }),
    valor_cents: inteiro(servico.valor_cents, { max: LIMITES.centavos, campo: `Valor do serviço ${i + 1}` }),
    quantidade: inteiro(servico.quantidade ?? 1, { min: 1, max: LIMITES.quantidade, campo: 'Quantidade do serviço' }),
  };
  s.total_cents = calcularServico(s).total_cents;
  return s;
}

export function normalizarOrcamento(db, body) {
  const clienteId = inteiro(body?.cliente_id, { min: 1, campo: 'Cliente' });
  if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) throw invalido('Selecione um cliente.');
  const itensBrutos = Array.isArray(body.itens) ? body.itens : [];
  const servicosBrutos = Array.isArray(body.servicos) ? body.servicos : [];
  if (itensBrutos.length > MAX_ITENS || servicosBrutos.length > MAX_ITENS) throw invalido('Itens demais no orçamento.');

  const data = dataIso(body.data);
  const validadeDias = inteiro(body.validade_dias ?? 10, { max: 3650, campo: 'Validade' });
  const desconto = ajuste(body, 'desconto', 'Desconto');
  const acrescimo = ajuste(body, 'acrescimo', 'Acréscimo');
  const entrada = ajuste(body, 'pagamento_entrada', 'Entrada');

  const orc = {
    cliente_id: clienteId,
    data,
    validade_dias: validadeDias,
    data_validade: somarDias(data, validadeDias),
    status: umDe(body.status ?? 'rascunho', Object.keys(STATUS), 'Status'),
    desconto_tipo: desconto.tipo,
    desconto_valor: desconto.valor,
    acrescimo_descricao: texto(body.acrescimo_descricao, { max: 100, campo: 'Descrição do acréscimo' }),
    acrescimo_tipo: acrescimo.tipo,
    acrescimo_valor: acrescimo.valor,
    pagamento_descricao: texto(body.pagamento_descricao, { max: 300, campo: 'Condição de pagamento' }),
    pagamento_entrada_tipo: entrada.tipo,
    pagamento_entrada_valor: entrada.valor,
    pagamento_parcelas: inteiro(body.pagamento_parcelas ?? 0, { max: LIMITES.parcelas, campo: 'Parcelas' }),
    prazo_entrega: texto(body.prazo_entrega, { max: 200, campo: 'Prazo de entrega' }),
    observacoes: texto(body.observacoes, { max: 5000, campo: 'Observações' }),
    observacoes_internas: texto(body.observacoes_internas, { max: 5000, campo: 'Observações internas' }),
    itens: itensBrutos.map((item, i) => normalizarItem(db, item, i)),
    servicos: servicosBrutos.map(normalizarServico),
  };
  return Object.assign(orc, calcularTotais(orc));
}

// ---------------------------------------------------------------------------
// Histórico de alterações
// ---------------------------------------------------------------------------

function registrarHistorico(db, orcamentoId, evento, usuarioId) {
  const orc = carregarOrcamento(db, orcamentoId);
  db.prepare(
    'INSERT INTO orcamento_historico (orcamento_id, evento, total_cents, usuario_id, snapshot) VALUES (?, ?, ?, ?, ?)',
  ).run(orcamentoId, evento, orc.total_cents, usuarioId ?? null, JSON.stringify(orc));
}

const assinaturaItens = (itens) =>
  JSON.stringify(
    itens.map((i) => [
      i.tipo_movel_id,
      i.tipo_nome,
      i.descricao,
      i.metodo_calculo,
      i.largura_mm,
      i.altura_mm,
      i.quantidade,
      i.preco_unitario_interno_cents,
      i.observacoes,
    ]),
  );
const assinaturaServicos = (servicos) =>
  JSON.stringify(servicos.map((s) => [s.descricao, s.valor_cents, s.quantidade]));

function descreverAjuste(anterior, novo, prefixo, nome) {
  const mudou =
    anterior[`${prefixo}_tipo`] !== novo[`${prefixo}_tipo`] || anterior[`${prefixo}_valor`] !== novo[`${prefixo}_valor`];
  if (!mudou) return null;
  if (!anterior[`${prefixo}_cents`] && novo[`${prefixo}_cents`]) return `${nome} aplicado`;
  if (anterior[`${prefixo}_cents`] && !novo[`${prefixo}_cents`]) return `${nome} removido`;
  return `${nome} alterado`;
}

export function descreverAlteracoes(anterior, novo) {
  const partes = [];
  if (anterior.cliente_id !== novo.cliente_id) partes.push('Cliente alterado');
  if (assinaturaItens(anterior.itens) !== assinaturaItens(novo.itens)) {
    if (novo.itens.length > anterior.itens.length) partes.push('Móvel adicionado');
    else if (novo.itens.length < anterior.itens.length) partes.push('Móvel removido');
    else partes.push('Móveis alterados');
  }
  if (assinaturaServicos(anterior.servicos) !== assinaturaServicos(novo.servicos)) partes.push('Serviços adicionais alterados');
  for (const texto of [
    descreverAjuste(anterior, novo, 'desconto', 'Desconto'),
    descreverAjuste(anterior, novo, 'acrescimo', 'Acréscimo'),
  ]) {
    if (texto) partes.push(texto);
  }
  if (anterior.status !== novo.status) partes.push(`Status: ${STATUS[anterior.status]} → ${STATUS[novo.status]}`);
  const outros = [
    'data',
    'validade_dias',
    'acrescimo_descricao',
    'pagamento_descricao',
    'pagamento_entrada_tipo',
    'pagamento_entrada_valor',
    'pagamento_parcelas',
    'prazo_entrega',
    'observacoes',
    'observacoes_internas',
  ];
  if (outros.some((c) => anterior[c] !== novo[c])) partes.push('Condições e observações alteradas');
  return partes.join('; ');
}

export function listarHistorico(db, orcamentoId) {
  return db
    .prepare(
      `SELECT h.id, h.data_hora, h.evento, h.total_cents, u.nome AS usuario_nome
       FROM orcamento_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.orcamento_id = ? ORDER BY h.id`,
    )
    .all(orcamentoId)
    .map(semPrototipo);
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

function gravarFilhos(db, orcamentoId, orc) {
  db.prepare('DELETE FROM orcamento_itens WHERE orcamento_id = ?').run(orcamentoId);
  db.prepare('DELETE FROM orcamento_servicos WHERE orcamento_id = ?').run(orcamentoId);
  const inserirItem = db.prepare(
    `INSERT INTO orcamento_itens (orcamento_id, ordem, ${COLUNAS_ITEM.join(', ')})
     VALUES (?, ?, ${COLUNAS_ITEM.map(() => '?').join(', ')})`,
  );
  orc.itens.forEach((item, i) => inserirItem.run(orcamentoId, i, ...COLUNAS_ITEM.map((c) => item[c] ?? null)));
  const inserirServico = db.prepare(
    `INSERT INTO orcamento_servicos (orcamento_id, ordem, descricao, valor_cents, quantidade, total_cents)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  orc.servicos.forEach((s, i) =>
    inserirServico.run(orcamentoId, i, s.descricao, s.valor_cents, s.quantidade, s.total_cents),
  );
}

function inserir(db, orc, duplicadoDeId = null) {
  const numero = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM orcamentos').get().n;
  const resultado = db
    .prepare(
      `INSERT INTO orcamentos (numero, duplicado_de_id, ${COLUNAS.join(', ')})
       VALUES (?, ?, ${COLUNAS.map(() => '?').join(', ')})`,
    )
    .run(numero, duplicadoDeId, ...COLUNAS.map((c) => orc[c]));
  const id = Number(resultado.lastInsertRowid);
  gravarFilhos(db, id, orc);
  return id;
}

export function criarOrcamento(db, body, usuarioId) {
  return transacao(db, () => {
    const id = inserir(db, normalizarOrcamento(db, body));
    registrarHistorico(db, id, 'Orçamento criado', usuarioId);
    return id;
  });
}

export function atualizarOrcamento(db, id, body, usuarioId) {
  return transacao(db, () => {
    const anterior = carregarOrcamento(db, id);
    if (!anterior) throw naoEncontrado('Orçamento não encontrado.');
    const novo = normalizarOrcamento(db, body);
    db.prepare(
      `UPDATE orcamentos SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`,
    ).run(...COLUNAS.map((c) => novo[c]), id);
    gravarFilhos(db, id, novo);
    const evento = descreverAlteracoes(anterior, novo);
    if (evento) registrarHistorico(db, id, evento, usuarioId);
    return id;
  });
}

export function alterarStatus(db, id, status, usuarioId) {
  umDe(status, Object.keys(STATUS), 'Status');
  return transacao(db, () => {
    const atual = db.prepare('SELECT status FROM orcamentos WHERE id = ?').get(id);
    if (!atual) throw naoEncontrado('Orçamento não encontrado.');
    if (atual.status === status) return;
    db.prepare(`UPDATE orcamentos SET status = ?, atualizado_em = datetime('now') WHERE id = ?`).run(status, id);
    registrarHistorico(db, id, `Status: ${STATUS[atual.status]} → ${STATUS[status]}`, usuarioId);
  });
}

/**
 * Cria um novo orçamento igual ao original, com nova numeração, data de hoje
 * e status Rascunho. Os preços gravados no original são mantidos.
 */
export function duplicarOrcamento(db, id, usuarioId, dataHoje) {
  return transacao(db, () => {
    const original = carregarOrcamento(db, id);
    if (!original) throw naoEncontrado('Orçamento não encontrado.');
    const copia = normalizarOrcamento(db, { ...original, data: dataHoje, status: 'rascunho' });
    const novoId = inserir(db, copia, id);
    const novoNumero = db.prepare('SELECT numero FROM orcamentos WHERE id = ?').get(novoId).numero;
    registrarHistorico(db, novoId, `Orçamento criado a partir do nº ${formatarNumero(original.numero)}`, usuarioId);
    registrarHistorico(db, id, `Duplicado como nº ${formatarNumero(novoNumero)}`, usuarioId);
    return novoId;
  });
}

/** Orçamentos enviados ou em negociação cuja validade passou viram "Expirado". */
export function expirarVencidos(db, dataHoje) {
  const vencidos = db
    .prepare(`SELECT id FROM orcamentos WHERE status IN ('enviado', 'negociacao') AND data_validade < ?`)
    .all(dataHoje);
  if (!vencidos.length) return;
  transacao(db, () => {
    for (const { id } of vencidos) {
      db.prepare(`UPDATE orcamentos SET status = 'expirado', atualizado_em = datetime('now') WHERE id = ?`).run(id);
      registrarHistorico(db, id, 'Validade vencida — status alterado para Expirado', null);
    }
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

const padraoLike = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listarOrcamentos(db, filtros = {}) {
  const onde = [];
  const params = [];
  const q = String(filtros.q ?? '').trim().replace(/^#/, '');
  if (q) {
    if (/^\d+$/.test(q)) {
      onde.push(
        `(o.numero = ? OR sem_acento(c.nome) LIKE ? ESCAPE '\\' OR digitos(c.telefone) LIKE ? ESCAPE '\\' OR digitos(c.whatsapp) LIKE ? ESCAPE '\\')`,
      );
      params.push(Number(q), padraoLike(q), padraoLike(q), padraoLike(q));
    } else {
      onde.push(`sem_acento(c.nome) LIKE ? ESCAPE '\\'`);
      params.push(padraoLike(semAcento(q)));
    }
  }
  if (filtros.status === 'abertos') {
    onde.push(`o.status IN (${STATUS_ABERTOS.map(() => '?').join(', ')})`);
    params.push(...STATUS_ABERTOS);
  } else if (filtros.status && STATUS[filtros.status]) {
    onde.push('o.status = ?');
    params.push(filtros.status);
  }
  if (filtros.cliente_id) {
    onde.push('o.cliente_id = ?');
    params.push(Number(filtros.cliente_id));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.de ?? '')) {
    onde.push('o.data >= ?');
    params.push(filtros.de);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.ate ?? '')) {
    onde.push('o.data <= ?');
    params.push(filtros.ate);
  }
  if (Number.isInteger(filtros.min)) {
    onde.push('o.total_cents >= ?');
    params.push(filtros.min);
  }
  if (Number.isInteger(filtros.max)) {
    onde.push('o.total_cents <= ?');
    params.push(filtros.max);
  }
  const where = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
  const limite = Math.min(Math.max(Number(filtros.limite) || 50, 1), 200);
  const deslocamento = Math.max(Number(filtros.deslocamento) || 0, 0);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id ${where}`).get(
    ...params,
  ).n;
  const orcamentos = db
    .prepare(
      `SELECT o.id, o.numero, o.data, o.data_validade, o.status, o.total_cents, o.cliente_id,
              c.nome AS cliente_nome, c.telefone AS cliente_telefone
       FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
       ${where} ORDER BY o.numero DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limite, deslocamento)
    .map(semPrototipo);
  return { total, orcamentos };
}

export function resumoDashboard(db, dataHoje) {
  const inicioMes = `${dataHoje.slice(0, 7)}-01`;
  const [ano, mes] = dataHoje.split('-').map(Number);
  const inicioProximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const mes_ = db
    .prepare(
      `SELECT COUNT(*) AS quantidade,
              COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN total_cents END), 0) AS valor_cents,
              COALESCE(SUM(status = 'aprovado'), 0) AS aprovados,
              COALESCE(SUM(CASE WHEN status = 'aprovado' THEN total_cents END), 0) AS aprovados_cents
       FROM orcamentos WHERE data >= ? AND data < ?`,
    )
    .get(inicioMes, inicioProximo);
  const abertos = db
    .prepare(`SELECT COUNT(*) AS n FROM orcamentos WHERE status IN (${STATUS_ABERTOS.map(() => '?').join(', ')})`)
    .get(...STATUS_ABERTOS).n;
  return {
    mes: { ...mes_ },
    em_aberto: abertos,
    recentes: listarOrcamentos(db, { limite: 8 }).orcamentos,
  };
}


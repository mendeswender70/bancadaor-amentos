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
} from '../public/shared/calc.js';
import { semAcento } from './db.js';
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

export async function carregarOrcamento(db, id) {
  const orc = await db.get('SELECT * FROM orcamentos WHERE id = ?', id);
  if (!orc) return null;
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', orc.cliente_id);
  if (cliente) {
    delete cliente.nome_busca;
    delete cliente.telefone_digitos;
    delete cliente.whatsapp_digitos;
  }
  orc.cliente = cliente;
  orc.itens = await db.all('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY ordem, id', id);
  orc.servicos = await db.all('SELECT * FROM orcamento_servicos WHERE orcamento_id = ? ORDER BY ordem, id', id);
  orc.duplicado_de_numero = orc.duplicado_de_id
    ? ((await db.get('SELECT numero FROM orcamentos WHERE id = ?', orc.duplicado_de_id))?.numero ?? null)
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

async function normalizarItem(db, item, i) {
  const n = i + 1;
  const metodo = umDe(item?.metodo_calculo, Object.keys(METODOS), `Método de cálculo do móvel ${n}`);
  const medida = (valor, campo) => inteiro(valor, { min: 1, max: LIMITES.medidaMm, campo: `${campo} do móvel ${n}` });
  let tipoId = inteiro(item.tipo_movel_id, { min: 1, opcional: true, campo: 'Tipo de móvel' });
  if (tipoId && !(await db.get('SELECT 1 AS ok FROM tipos_moveis WHERE id = ?', tipoId))) tipoId = null;

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

export async function normalizarOrcamento(db, body) {
  const clienteId = inteiro(body?.cliente_id, { min: 1, campo: 'Cliente' });
  if (!(await db.get('SELECT 1 AS ok FROM clientes WHERE id = ?', clienteId))) throw invalido('Selecione um cliente.');
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
    itens: [],
    servicos: servicosBrutos.map(normalizarServico),
  };
  for (let i = 0; i < itensBrutos.length; i++) orc.itens.push(await normalizarItem(db, itensBrutos[i], i));
  return Object.assign(orc, calcularTotais(orc));
}

// ---------------------------------------------------------------------------
// Histórico de alterações
// ---------------------------------------------------------------------------

async function registrarHistorico(db, orcamentoId, evento, usuarioId) {
  const orc = await carregarOrcamento(db, orcamentoId);
  await db.run(
    'INSERT INTO orcamento_historico (orcamento_id, evento, total_cents, usuario_id, snapshot) VALUES (?, ?, ?, ?, ?)',
    orcamentoId,
    evento,
    orc.total_cents,
    usuarioId ?? null,
    JSON.stringify(orc),
  );
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
  return db.all(
    `SELECT h.id, h.data_hora, h.evento, h.total_cents, u.nome AS usuario_nome
     FROM orcamento_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.orcamento_id = ? ORDER BY h.id`,
    orcamentoId,
  );
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

async function gravarFilhos(db, orcamentoId, orc) {
  await db.run('DELETE FROM orcamento_itens WHERE orcamento_id = ?', orcamentoId);
  await db.run('DELETE FROM orcamento_servicos WHERE orcamento_id = ?', orcamentoId);
  const sqlItem = `INSERT INTO orcamento_itens (orcamento_id, ordem, ${COLUNAS_ITEM.join(', ')})
     VALUES (?, ?, ${COLUNAS_ITEM.map(() => '?').join(', ')})`;
  for (const [i, item] of orc.itens.entries()) {
    await db.run(sqlItem, orcamentoId, i, ...COLUNAS_ITEM.map((c) => item[c] ?? null));
  }
  for (const [i, s] of orc.servicos.entries()) {
    await db.run(
      `INSERT INTO orcamento_servicos (orcamento_id, ordem, descricao, valor_cents, quantidade, total_cents)
       VALUES (?, ?, ?, ?, ?, ?)`,
      orcamentoId,
      i,
      s.descricao,
      s.valor_cents,
      s.quantidade,
      s.total_cents,
    );
  }
}

async function inserir(db, orc, duplicadoDeId = null) {
  const { n: numero } = await db.get('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM orcamentos');
  const resultado = await db.run(
    `INSERT INTO orcamentos (numero, duplicado_de_id, ${COLUNAS.join(', ')})
     VALUES (?, ?, ${COLUNAS.map(() => '?').join(', ')})`,
    numero,
    duplicadoDeId,
    ...COLUNAS.map((c) => orc[c]),
  );
  const id = resultado.lastInsertRowid;
  await gravarFilhos(db, id, orc);
  return id;
}

export function criarOrcamento(db, body, usuarioId) {
  return db.transacao(async (t) => {
    const id = await inserir(t, await normalizarOrcamento(t, body));
    await registrarHistorico(t, id, 'Orçamento criado', usuarioId);
    return id;
  });
}

export function atualizarOrcamento(db, id, body, usuarioId) {
  return db.transacao(async (t) => {
    const anterior = await carregarOrcamento(t, id);
    if (!anterior) throw naoEncontrado('Orçamento não encontrado.');
    const novo = await normalizarOrcamento(t, body);
    await t.run(
      `UPDATE orcamentos SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`,
      ...COLUNAS.map((c) => novo[c]),
      id,
    );
    await gravarFilhos(t, id, novo);
    const evento = descreverAlteracoes(anterior, novo);
    if (evento) await registrarHistorico(t, id, evento, usuarioId);
    return id;
  });
}

export function alterarStatus(db, id, status, usuarioId) {
  umDe(status, Object.keys(STATUS), 'Status');
  return db.transacao(async (t) => {
    const atual = await t.get('SELECT status FROM orcamentos WHERE id = ?', id);
    if (!atual) throw naoEncontrado('Orçamento não encontrado.');
    if (atual.status === status) return;
    await t.run(`UPDATE orcamentos SET status = ?, atualizado_em = datetime('now') WHERE id = ?`, status, id);
    await registrarHistorico(t, id, `Status: ${STATUS[atual.status]} → ${STATUS[status]}`, usuarioId);
  });
}

/**
 * Cria um novo orçamento igual ao original, com nova numeração, data de hoje
 * e status Rascunho. Os preços gravados no original são mantidos.
 */
export function duplicarOrcamento(db, id, usuarioId, dataHoje) {
  return db.transacao(async (t) => {
    const original = await carregarOrcamento(t, id);
    if (!original) throw naoEncontrado('Orçamento não encontrado.');
    const copia = await normalizarOrcamento(t, { ...original, data: dataHoje, status: 'rascunho' });
    const novoId = await inserir(t, copia, id);
    const { numero: novoNumero } = await t.get('SELECT numero FROM orcamentos WHERE id = ?', novoId);
    await registrarHistorico(t, novoId, `Orçamento criado a partir do nº ${formatarNumero(original.numero)}`, usuarioId);
    await registrarHistorico(t, id, `Duplicado como nº ${formatarNumero(novoNumero)}`, usuarioId);
    return novoId;
  });
}

/** Orçamentos enviados ou em negociação cuja validade passou viram "Expirado". */
export async function expirarVencidos(db, dataHoje) {
  const vencidos = await db.all(
    `SELECT id FROM orcamentos WHERE status IN ('enviado', 'negociacao') AND data_validade < ?`,
    dataHoje,
  );
  if (!vencidos.length) return;
  await db.transacao(async (t) => {
    for (const { id } of vencidos) {
      const r = await t.run(
        `UPDATE orcamentos SET status = 'expirado', atualizado_em = datetime('now')
         WHERE id = ? AND status IN ('enviado', 'negociacao')`,
        id,
      );
      if (r.changes) await registrarHistorico(t, id, 'Validade vencida — status alterado para Expirado', null);
    }
  });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

const padraoLike = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listarOrcamentos(db, filtros = {}) {
  const onde = [];
  const params = [];
  const q = String(filtros.q ?? '').trim().replace(/^#/, '');
  if (q) {
    if (/^\d+$/.test(q)) {
      onde.push(
        `(o.numero = ? OR c.nome_busca LIKE ? ESCAPE '\\' OR c.telefone_digitos LIKE ? ESCAPE '\\' OR c.whatsapp_digitos LIKE ? ESCAPE '\\')`,
      );
      params.push(Number(q), padraoLike(q), padraoLike(q), padraoLike(q));
    } else {
      onde.push(`c.nome_busca LIKE ? ESCAPE '\\'`);
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

  const { n: total } = await db.get(
    `SELECT COUNT(*) AS n FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id ${where}`,
    ...params,
  );
  const orcamentos = await db.all(
    `SELECT o.id, o.numero, o.data, o.data_validade, o.status, o.total_cents, o.cliente_id,
            c.nome AS cliente_nome, c.telefone AS cliente_telefone
     FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
     ${where} ORDER BY o.numero DESC LIMIT ? OFFSET ?`,
    ...params,
    limite,
    deslocamento,
  );
  return { total, orcamentos };
}

export async function resumoDashboard(db, dataHoje) {
  const inicioMes = `${dataHoje.slice(0, 7)}-01`;
  const [ano, mes] = dataHoje.split('-').map(Number);
  const inicioProximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const mes_ = await db.get(
    `SELECT COUNT(*) AS quantidade,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN total_cents END), 0) AS valor_cents,
            COALESCE(SUM(status = 'aprovado'), 0) AS aprovados,
            COALESCE(SUM(CASE WHEN status = 'aprovado' THEN total_cents END), 0) AS aprovados_cents
     FROM orcamentos WHERE data >= ? AND data < ?`,
    inicioMes,
    inicioProximo,
  );
  const { n: abertos } = await db.get(
    `SELECT COUNT(*) AS n FROM orcamentos WHERE status IN (${STATUS_ABERTOS.map(() => '?').join(', ')})`,
    ...STATUS_ABERTOS,
  );
  return {
    mes: mes_,
    em_aberto: abertos,
    recentes: (await listarOrcamentos(db, { limite: 8 })).orcamentos,
  };
}


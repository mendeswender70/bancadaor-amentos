import {
  LIMITES,
  METODOS,
  STATUS,
  STATUS_ABERTOS,
  STATUS_PERDIDOS,
  TIPOS_AJUSTE,
  TAXAS_CARTAO,
  calcularItem,
  calcularServico,
  calcularTotais,
  formatarNumero,
  somarDias,
} from '../public/shared/calc.js';
import { randomBytes } from 'node:crypto';
import { semAcento } from './db.js';
import { ErroHttp, dataIso, inteiro, invalido, naoEncontrado, texto, umDe } from './validacao.js';
import { visaoCliente } from './visaoCliente.js';

const MAX_ITENS = 200;
const MAX_AMBIENTES = 50;

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
  'pagamento_cartao_metodo',
  'pagamento_cartao_parcelas',
  'pagamento_cartao_taxas',
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
  const ambientes = await db.all('SELECT * FROM orcamento_ambientes WHERE orcamento_id = ? ORDER BY ordem, id', id);
  const itens = await db.all('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY ordem, id', id);
  for (const a of ambientes) a.itens = itens.filter((i) => i.ambiente_id === a.id);
  const avulsos = itens.filter((i) => !ambientes.some((a) => a.id === i.ambiente_id));
  if (avulsos.length) ambientes.push({ id: null, nome: 'Móveis', descricao: '', itens: avulsos });
  orc.ambientes = ambientes;
  // Lista plana só para uso interno (cálculos e histórico); não vai no JSON.
  Object.defineProperty(orc, 'itens', { value: ambientes.flatMap((a) => a.itens), enumerable: false, writable: true });
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

async function normalizarItem(db, item, n) {
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

export async function normalizarOrcamento(db, body, { cartaoAnterior = null } = {}) {
  const clienteId = inteiro(body?.cliente_id, { min: 1, campo: 'Cliente' });
  if (!(await db.get('SELECT 1 AS ok FROM clientes WHERE id = ?', clienteId))) throw invalido('Selecione um cliente.');
  // Formato antigo (lista simples de itens) vira um ambiente "Móveis".
  let ambientesBrutos = Array.isArray(body.ambientes) ? body.ambientes : null;
  if (!ambientesBrutos) {
    ambientesBrutos = Array.isArray(body.itens) && body.itens.length ? [{ nome: 'Móveis', itens: body.itens }] : [];
  }
  const servicosBrutos = Array.isArray(body.servicos) ? body.servicos : [];
  const totalItens = ambientesBrutos.reduce((s, a) => s + (Array.isArray(a?.itens) ? a.itens.length : 0), 0);
  if (ambientesBrutos.length > MAX_AMBIENTES) throw invalido('Ambientes demais no orçamento.');
  if (totalItens > MAX_ITENS || servicosBrutos.length > MAX_ITENS) throw invalido('Itens demais no orçamento.');

  const data = dataIso(body.data);
  const validadeDias = inteiro(body.validade_dias ?? 10, { max: 3650, campo: 'Validade' });
  const desconto = ajuste(body, 'desconto', 'Desconto');
  const acrescimo = ajuste(body, 'acrescimo', 'Acréscimo');
  const entrada = ajuste(body, 'pagamento_entrada', 'Entrada');
  const cartaoMetodo = umDe(body.pagamento_cartao_metodo ?? 'nenhum', ['nenhum', ...Object.keys(TAXAS_CARTAO)], 'Forma de pagamento no cartão');
  const cartaoParcelas = cartaoMetodo === 'nenhum'
    ? 0
    : inteiro(body.pagamento_cartao_parcelas ?? 12, { min: 1, max: 12, campo: 'Parcelas no cartão' });
  const cartaoTaxas = cartaoMetodo === 'nenhum'
    ? ''
    : cartaoAnterior?.pagamento_cartao_metodo === cartaoMetodo && cartaoAnterior.pagamento_cartao_taxas
      ? cartaoAnterior.pagamento_cartao_taxas
      : JSON.stringify(TAXAS_CARTAO[cartaoMetodo]);

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
    pagamento_cartao_metodo: cartaoMetodo,
    pagamento_cartao_parcelas: cartaoParcelas,
    pagamento_cartao_taxas: cartaoTaxas,
    prazo_entrega: texto(body.prazo_entrega, { max: 200, campo: 'Prazo de entrega' }),
    observacoes: texto(body.observacoes, { max: 5000, campo: 'Observações' }),
    observacoes_internas: texto(body.observacoes_internas, { max: 5000, campo: 'Observações internas' }),
    ambientes: [],
    servicos: servicosBrutos.map(normalizarServico),
  };
  let n = 0;
  for (const [i, a] of ambientesBrutos.entries()) {
    const ambiente = {
      nome: texto(a?.nome, { max: 100, obrigatorio: true, campo: `Nome do ambiente ${i + 1}` }),
      descricao: texto(a?.descricao, { max: 1000, campo: 'Detalhes do ambiente' }),
      itens: [],
    };
    for (const item of Array.isArray(a.itens) ? a.itens : []) ambiente.itens.push(await normalizarItem(db, item, ++n));
    orc.ambientes.push(ambiente);
  }
  orc.itens = orc.ambientes.flatMap((a) => a.itens);
  return Object.assign(orc, calcularTotais(orc));
}

// ---------------------------------------------------------------------------
// Histórico de alterações
// ---------------------------------------------------------------------------

async function registrarHistorico(db, orcamentoId, evento, usuarioId, tipo = 'evento') {
  const orc = await carregarOrcamento(db, orcamentoId);
  await db.run(
    'INSERT INTO orcamento_historico (orcamento_id, evento, total_cents, usuario_id, snapshot, tipo) VALUES (?, ?, ?, ?, ?, ?)',
    orcamentoId,
    evento,
    orc.total_cents,
    usuarioId ?? null,
    JSON.stringify(orc),
    tipo,
  );
}

// Edições seguidas do mesmo usuário (o salvamento automático grava a cada
// alteração) viram um único registro no histórico.
const JANELA_EDICAO = '10 minutes';

async function registrarEdicao(db, orcamentoId, evento, usuarioId) {
  const ultimo = await db.get(
    `SELECT id, evento, tipo, usuario_id, data_hora > now() - ?::interval AS recente
     FROM orcamento_historico WHERE orcamento_id = ? ORDER BY id DESC LIMIT 1`,
    JANELA_EDICAO,
    orcamentoId,
  );
  if (!ultimo || ultimo.tipo !== 'edicao' || !ultimo.recente || ultimo.usuario_id !== (usuarioId ?? null)) {
    return registrarHistorico(db, orcamentoId, evento, usuarioId, 'edicao');
  }
  const partes = [...new Set([...ultimo.evento.split('; '), ...evento.split('; ')])];
  const orc = await carregarOrcamento(db, orcamentoId);
  await db.run(
    'UPDATE orcamento_historico SET evento = ?, total_cents = ?, snapshot = ?, data_hora = now() WHERE id = ?',
    partes.join('; '),
    orc.total_cents,
    JSON.stringify(orc),
    ultimo.id,
  );
}

/** Datas que acompanham a mudança de situação (envio e aprovação). */
async function marcarDatasStatus(db, id, anterior, novo, { peloLink = false, nome = '' } = {}) {
  if (anterior === novo) return;
  if (novo === 'enviado') await db.run('UPDATE orcamentos SET enviado_em = now() WHERE id = ?', id);
  if (novo === 'aprovado') {
    await db.run(
      'UPDATE orcamentos SET aprovado_em = now(), aprovado_por = ?, aprovado_pelo_link = ? WHERE id = ?',
      nome,
      peloLink ? 1 : 0,
      id,
    );
  } else if (anterior === 'aprovado') {
    await db.run(`UPDATE orcamentos SET aprovado_em = NULL, aprovado_por = '', aprovado_pelo_link = 0 WHERE id = ?`, id);
  }
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
const assinaturaAmbientes = (ambientes) =>
  JSON.stringify(ambientes.map((a) => [a.nome, a.descricao, assinaturaItens(a.itens)]));
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
  const nomesAntes = anterior.ambientes.map((a) => [a.nome, a.descricao].join('|'));
  const nomesDepois = novo.ambientes.map((a) => [a.nome, a.descricao].join('|'));
  if (novo.ambientes.length > anterior.ambientes.length) partes.push('Ambiente adicionado');
  else if (novo.ambientes.length < anterior.ambientes.length) partes.push('Ambiente removido');
  else if (JSON.stringify(nomesAntes) !== JSON.stringify(nomesDepois)) partes.push('Ambientes alterados');
  if (assinaturaAmbientes(anterior.ambientes) !== assinaturaAmbientes(novo.ambientes)) {
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
    'pagamento_cartao_metodo',
    'pagamento_cartao_parcelas',
    'pagamento_cartao_taxas',
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
  await db.run('DELETE FROM orcamento_ambientes WHERE orcamento_id = ?', orcamentoId);
  await db.run('DELETE FROM orcamento_servicos WHERE orcamento_id = ?', orcamentoId);
  const sqlItem = `INSERT INTO orcamento_itens (orcamento_id, ambiente_id, ordem, ${COLUNAS_ITEM.join(', ')})
     VALUES (?, ?, ?, ${COLUNAS_ITEM.map(() => '?').join(', ')})`;
  for (const [i, ambiente] of orc.ambientes.entries()) {
    const { lastInsertRowid: ambienteId } = await db.run(
      'INSERT INTO orcamento_ambientes (orcamento_id, ordem, nome, descricao) VALUES (?, ?, ?, ?) RETURNING id',
      orcamentoId,
      i,
      ambiente.nome,
      ambiente.descricao,
    );
    for (const [j, item] of ambiente.itens.entries()) {
      await db.run(sqlItem, orcamentoId, ambienteId, j, ...COLUNAS_ITEM.map((c) => item[c] ?? null));
    }
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
  const resultado = await db.run(
    `INSERT INTO orcamentos (duplicado_de_id, ${COLUNAS.join(', ')})
     VALUES (?, ${COLUNAS.map(() => '?').join(', ')}) RETURNING id`,
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

// A expiração automática troca somente enviado/negociação por expirado.
// Ao renovar a validade, recuperamos do histórico a situação que a proposta tinha.
async function statusAbertoAnterior(db, id) {
  const anterior = await db.get(
    `SELECT snapshot::jsonb ->> 'status' AS status
     FROM orcamento_historico
     WHERE orcamento_id = ? AND snapshot IS NOT NULL
       AND snapshot::jsonb ->> 'status' IN ('enviado', 'negociacao')
     ORDER BY id DESC LIMIT 1`,
    id,
  );
  return anterior?.status ?? 'enviado';
}

export function atualizarOrcamento(db, id, body, usuarioId, dataHoje) {
  return db.transacao(async (t) => {
    await bloquearOrcamento(t, id);
    const anterior = await carregarOrcamento(t, id);
    if (!anterior) throw naoEncontrado('Orçamento não encontrado.');
    conferirVersao(body.versao, anterior.versao);
    const novo = await normalizarOrcamento(t, body, { cartaoAnterior: anterior });
    if (anterior.status === 'expirado' && novo.status === 'expirado' && novo.data_validade >= dataHoje) {
      novo.status = await statusAbertoAnterior(t, id);
    }
    const mudouProposta = assinaturaProposta(anterior) !== assinaturaProposta(novo);
    const precisaNovoAceite = anterior.status === 'aprovado' && mudouProposta;
    if (precisaNovoAceite) novo.status = 'negociacao';
    await t.run(
      `UPDATE orcamentos SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')},
       versao = versao + 1, versao_proposta = versao_proposta + ?, atualizado_em = now() WHERE id = ?`,
      ...COLUNAS.map((c) => novo[c]),
      mudouProposta ? 1 : 0,
      id,
    );
    await gravarFilhos(t, id, novo);
    await marcarDatasStatus(t, id, anterior.status, novo.status);
    const evento = descreverAlteracoes(anterior, novo);
    if (evento) await registrarEdicao(t, id, evento, usuarioId);
    if (precisaNovoAceite) await registrarHistorico(t, id, 'Proposta alterada — nova aprovação necessária', usuarioId);
    return id;
  });
}

// Toda escrita de conteúdo/status trava o mesmo cabeçalho antes de ler os filhos.
// Assim o aceite não pode acontecer no meio de um salvamento.
async function bloquearOrcamento(db, id) {
  if (!(await db.get('SELECT id FROM orcamentos WHERE id = ? FOR UPDATE', id))) {
    throw naoEncontrado('Orçamento não encontrado.');
  }
}

function conferirVersao(recebida, atual) {
  if (!Number.isInteger(recebida) || recebida !== atual) {
    throw new ErroHttp(409, 'Este orçamento foi atualizado em outra tela ou pelo cliente. Reabra a versão atual antes de continuar. Suas alterações nesta tela não foram salvas.');
  }
}

// Compara o conteúdo comercial, sem IDs de linhas, notas/preços internos nem
// dados mutáveis do cadastro de clientes. Inclui itens, valores e condições.
function assinaturaProposta(orc) {
  return JSON.stringify({
    cliente_id: orc.cliente_id,
    ...visaoCliente({ ...orc, numero: null, cliente: null }, {}),
  });
}

export function alterarStatus(db, id, status, usuarioId, versao) {
  umDe(status, Object.keys(STATUS), 'Status');
  return db.transacao(async (t) => {
    await bloquearOrcamento(t, id);
    const atual = await t.get('SELECT status, versao FROM orcamentos WHERE id = ?', id);
    if (!atual) throw naoEncontrado('Orçamento não encontrado.');
    conferirVersao(versao, atual.versao);
    if (atual.status === status) return;
    await t.run('UPDATE orcamentos SET status = ?, versao = versao + 1, atualizado_em = now() WHERE id = ?', status, id);
    await marcarDatasStatus(t, id, atual.status, status);
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
    const copia = await normalizarOrcamento(t, { ...original, data: dataHoje, status: 'rascunho' }, { cartaoAnterior: original });
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
  // Corrige também registros em que a validade foi renovada antes desta
  // correção, mas o status expirado acabou sendo mantido no banco.
  const renovados = await db.all(
    `SELECT id FROM orcamentos WHERE status = 'expirado' AND data_validade >= ?`,
    dataHoje,
  );
  if (!vencidos.length && !renovados.length) return;
  await db.transacao(async (t) => {
    for (const { id } of vencidos) {
      const r = await t.run(
        `UPDATE orcamentos SET status = 'expirado', versao = versao + 1, atualizado_em = now()
         WHERE id = ? AND status IN ('enviado', 'negociacao') AND data_validade < ?`,
        id,
        dataHoje,
      );
      if (r.changes) await registrarHistorico(t, id, 'Validade vencida — status alterado para Expirado', null);
    }
    for (const { id } of renovados) {
      const atual = await t.get('SELECT status, data_validade FROM orcamentos WHERE id = ? FOR UPDATE', id);
      if (!atual || atual.status !== 'expirado' || atual.data_validade < dataHoje) continue;
      const status = await statusAbertoAnterior(t, id);
      const r = await t.run(
        `UPDATE orcamentos SET status = ?, versao = versao + 1, atualizado_em = now()
         WHERE id = ? AND status = 'expirado' AND data_validade >= ?`,
        status,
        id,
        dataHoje,
      );
      if (r.changes) {
        await marcarDatasStatus(t, id, 'expirado', status);
        await registrarHistorico(t, id, `Validade renovada — status restaurado para ${STATUS[status]}`, null);
      }
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
    if (/^\d{1,9}$/.test(q)) {
      onde.push(
        `(o.numero = ? OR c.nome_busca LIKE ? ESCAPE '\\' OR c.telefone_digitos LIKE ? ESCAPE '\\' OR c.whatsapp_digitos LIKE ? ESCAPE '\\')`,
      );
      params.push(Number(q), padraoLike(q), padraoLike(q), padraoLike(q));
    } else {
      onde.push(`c.nome_busca LIKE ? ESCAPE '\\'`);
      params.push(padraoLike(semAcento(q)));
    }
  }
  const grupos = { abertos: STATUS_ABERTOS, perdidos: STATUS_PERDIDOS };
  if (grupos[filtros.status]) {
    onde.push(`o.status IN (${grupos[filtros.status].map(() => '?').join(', ')})`);
    params.push(...grupos[filtros.status]);
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
    `SELECT o.id, o.numero, o.data, o.data_validade, o.status, o.total_cents, o.cliente_id, o.versao,
            o.visualizacoes, o.ultima_visualizacao_em, o.aprovado_pelo_link,
            (SELECT COUNT(*) FROM orcamento_ambientes a WHERE a.orcamento_id = o.id) AS ambientes,
            c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.whatsapp AS cliente_whatsapp
     FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
     ${where} ORDER BY o.numero DESC LIMIT ? OFFSET ?`,
    ...params,
    limite,
    deslocamento,
  );
  return { total, orcamentos };
}

const inicioDoMes = (iso) => `${iso.slice(0, 7)}-01`;
function somarMeses(inicio, meses) {
  const [ano, mes] = inicio.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  return d.toISOString().slice(0, 10);
}

async function numerosDoPeriodo(db, de, ate) {
  return db.get(
    `SELECT COUNT(*) AS quantidade,
            COUNT(*) FILTER (WHERE status <> 'cancelado') AS validos,
            COALESCE(SUM(CASE WHEN status <> 'cancelado' THEN total_cents END), 0) AS valor_cents,
            COUNT(*) FILTER (WHERE status = 'aprovado') AS aprovados,
            COALESCE(SUM(CASE WHEN status = 'aprovado' THEN total_cents END), 0) AS aprovados_cents
     FROM orcamentos WHERE data >= ? AND data < ?`,
    de,
    ate,
  );
}

/**
 * O que pede uma ação agora, do mais importante para o menos:
 * aprovação pelo link, validade acabando, cliente que abriu a proposta,
 * enviado sem resposta e rascunho esquecido.
 */
async function precisaAtencao(db, dataHoje) {
  const colunas = `o.id, o.numero, o.status, o.total_cents, o.data_validade, c.nome AS cliente_nome`;
  const consultas = [
    [
      'aprovado',
      `SELECT ${colunas}, o.aprovado_em AS quando FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
       WHERE o.status = 'aprovado' AND o.aprovado_pelo_link = 1 AND o.aprovado_em > now() - interval '7 days'
       ORDER BY o.aprovado_em DESC LIMIT 6`,
    ],
    [
      'vence',
      `SELECT ${colunas}, o.data_validade AS quando FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
       WHERE o.status IN ('enviado', 'negociacao') AND o.data_validade >= ? AND o.data_validade <= ?
       ORDER BY o.data_validade LIMIT 6`,
      dataHoje,
      somarDias(dataHoje, 3),
    ],
    [
      'visto',
      `SELECT ${colunas}, o.ultima_visualizacao_em AS quando FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
       WHERE o.status IN ('enviado', 'negociacao') AND o.ultima_visualizacao_em > now() - interval '3 days'
       ORDER BY o.ultima_visualizacao_em DESC LIMIT 6`,
    ],
    [
      'sem_resposta',
      `SELECT ${colunas}, COALESCE(o.enviado_em, o.atualizado_em) AS quando FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
       WHERE o.status = 'enviado' AND COALESCE(o.enviado_em, o.atualizado_em) < now() - interval '5 days'
       ORDER BY COALESCE(o.enviado_em, o.atualizado_em) LIMIT 6`,
    ],
    [
      'rascunho',
      `SELECT ${colunas}, o.atualizado_em AS quando FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
       WHERE o.status = 'rascunho' AND o.atualizado_em < now() - interval '3 days'
       ORDER BY o.atualizado_em LIMIT 6`,
    ],
  ];
  const vistos = new Set();
  const lista = [];
  for (const [motivo, sql, ...params] of consultas) {
    for (const linha of await db.all(sql, ...params)) {
      if (vistos.has(linha.id)) continue;
      vistos.add(linha.id);
      lista.push({ ...linha, motivo });
    }
  }
  return lista.slice(0, 6);
}

/** Lembretes push diários para propostas sem resposta e perto de vencer. */
export async function listarLembretesAutomaticos(db, dataHoje) {
  const colunas = `o.id, o.numero, o.data_validade`;
  const semResposta = await db.all(
    `SELECT ${colunas}, 'sem_resposta' AS tipo,
            COALESCE(o.enviado_em::text, o.atualizado_em::text) AS referencia
     FROM orcamentos o
     WHERE o.status = 'enviado'
       AND o.data_validade > ?
       AND COALESCE(o.enviado_em, o.atualizado_em) <= now() - interval '5 days'
       AND NOT EXISTS (
         SELECT 1 FROM notificacoes_lembrete l
         WHERE l.orcamento_id = o.id AND l.tipo = 'sem_resposta'
           AND l.referencia = COALESCE(o.enviado_em::text, o.atualizado_em::text)
           AND l.estado = 'enviado'
       )
     ORDER BY COALESCE(o.enviado_em, o.atualizado_em), o.id
     LIMIT 10`,
    somarDias(dataHoje, 2),
  );
  const pertoVencimento = await db.all(
    `SELECT ${colunas}, 'perto_vencimento' AS tipo, o.data_validade AS referencia
     FROM orcamentos o
     WHERE o.status IN ('enviado', 'negociacao') AND o.data_validade >= ? AND o.data_validade <= ?
       AND NOT EXISTS (
         SELECT 1 FROM notificacoes_lembrete l
         WHERE l.orcamento_id = o.id AND l.tipo = 'perto_vencimento'
           AND l.referencia = o.data_validade AND l.estado = 'enviado'
       )
     ORDER BY o.data_validade, o.id
     LIMIT 10`,
    dataHoje,
    somarDias(dataHoje, 2),
  );
  return [...semResposta, ...pertoVencimento].map((lembrete) => ({
    ...lembrete,
    dias_para_vencer: Math.round(
      (Date.parse(`${lembrete.data_validade}T00:00:00Z`) - Date.parse(`${dataHoje}T00:00:00Z`)) / 86_400_000,
    ),
  }));
}

export async function resumoDashboard(db, dataHoje) {
  const inicioMes = inicioDoMes(dataHoje);
  const mes = await numerosDoPeriodo(db, inicioMes, somarMeses(inicioMes, 1));
  const anterior = await numerosDoPeriodo(db, somarMeses(inicioMes, -1), inicioMes);
  // Taxa de aprovação dos últimos 90 dias, só entre os que chegaram ao cliente.
  const conversao = await db.get(
    `SELECT COUNT(*) AS enviados, COUNT(*) FILTER (WHERE status = 'aprovado') AS aprovados
     FROM orcamentos WHERE data >= ? AND status NOT IN ('rascunho', 'cancelado')`,
    somarDias(dataHoje, -90),
  );
  const { n: abertos } = await db.get(
    `SELECT COUNT(*) AS n FROM orcamentos WHERE status IN (${STATUS_ABERTOS.map(() => '?').join(', ')})`,
    ...STATUS_ABERTOS,
  );
  return {
    mes,
    mes_anterior: anterior,
    conversao,
    em_aberto: abertos,
    atencao: await precisaAtencao(db, dataHoje),
    recentes: (await listarOrcamentos(db, { limite: 6 })).orcamentos,
  };
}

// ---------------------------------------------------------------------------
// Link da proposta para o cliente
// ---------------------------------------------------------------------------

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

/** Cria (uma vez) o endereço secreto da proposta e devolve o token. */
export async function garantirToken(db, id) {
  const atual = await db.get('SELECT token_publico FROM orcamentos WHERE id = ?', id);
  if (!atual) throw naoEncontrado('Orçamento não encontrado.');
  if (atual.token_publico) return atual.token_publico;
  await db.run('UPDATE orcamentos SET token_publico = ? WHERE id = ? AND token_publico IS NULL', randomBytes(24).toString('base64url'), id);
  return (await db.get('SELECT token_publico FROM orcamentos WHERE id = ?', id)).token_publico;
}

export async function idPorToken(db, token) {
  const t = String(token ?? '');
  const linha = FORMATO_TOKEN.test(t) ? await db.get('SELECT id FROM orcamentos WHERE token_publico = ?', t) : null;
  if (!linha) throw naoEncontrado('Proposta não encontrada. Confira o link recebido.');
  return linha.id;
}

export async function registrarVisualizacao(db, id) {
  return db.transacao(async (t) => {
    const r = await t.get(
      `UPDATE orcamentos SET visualizacoes = visualizacoes + 1, ultima_visualizacao_em = now(),
         visualizado_em = COALESCE(visualizado_em, now())
       WHERE id = ? RETURNING visualizacoes`,
      id,
    );
    const primeiraVisualizacao = r?.visualizacoes === 1;
    if (primeiraVisualizacao) await registrarHistorico(t, id, 'Cliente abriu a proposta pelo link', null);
    return primeiraVisualizacao;
  });
}

/** O cliente pode aprovar enquanto a proposta está aberta e dentro da validade. */
export function podeAprovar(orc, dataHoje) {
  return ['rascunho', 'enviado', 'negociacao'].includes(orc.status) && orc.data_validade >= dataHoje;
}

export function aprovarPeloLink(db, id, nome, dataHoje, versaoProposta) {
  return db.transacao(async (t) => {
    await bloquearOrcamento(t, id);
    const orc = await t.get('SELECT status, data_validade, versao_proposta FROM orcamentos WHERE id = ?', id);
    if (!Number.isInteger(versaoProposta) || versaoProposta !== orc.versao_proposta) {
      throw new ErroHttp(409, 'A proposta foi alterada. Atualize a página, confira os valores e as condições e confirme novamente.');
    }
    if (orc.status === 'aprovado') return false;
    if (!podeAprovar(orc, dataHoje)) {
      throw new ErroHttp(
        409,
        orc.data_validade < dataHoje || orc.status === 'expirado'
          ? 'Esta proposta passou da validade. Fale com a empresa para receber uma nova.'
          : 'Esta proposta não está mais disponível para aprovação.',
      );
    }
    await t.run(`UPDATE orcamentos SET status = 'aprovado', versao = versao + 1, atualizado_em = now() WHERE id = ?`, id);
    await marcarDatasStatus(t, id, orc.status, 'aprovado', { peloLink: true, nome });
    await registrarHistorico(t, id, `Aprovado pelo cliente pelo link (${nome})`, null);
    return true;
  });
}

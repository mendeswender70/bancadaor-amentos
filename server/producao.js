// Produção: funcionários, trabalhos (planos de corte), retalhos e a serra.
// O cálculo é feito no navegador; aqui o resultado recebido é conferido
// (validarResultado) antes de ser guardado. Funcionário (usuarios.tipo =
// 'producao') vê só os próprios planos e nunca recebe preços.
import { LIMITES, formatarNumero } from '../public/shared/calc.js';
import {
  AJUSTES_PADRAO,
  CONFIG_PADRAO,
  LIMITES_CORTE,
  formatarCm,
  MODOS_CORTE,
  assinaturaPlano,
  detalharSolucao,
  resumirSolucao,
  retalhosDaSolucao,
  validarResultado,
} from '../public/shared/corte.js';
import { gerarHashSenha, validarSenha } from './auth.js';
import { ErroHttp, inteiro, invalido, naoEncontrado, texto, umDe } from './validacao.js';

const marcado = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);
const ativo = (v) => (v === false || v === 0 ? 0 : 1);
export const ehAdmin = (usuario) => usuario?.tipo !== 'producao';

const lerJson = (json) => {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ Chapas e fitas

export const CAMPOS_CHAPA = ['nome', 'espessura_mm', 'comprimento_mm', 'largura_mm', 'veio', 'preco_cents', 'ativo'];
export const CAMPOS_FITA = ['nome', 'largura_mm', 'preco_metro_cents', 'ativo'];

export function normalizarChapa(b = {}) {
  const medida = (v, campo) => inteiro(v, { min: LIMITES_CORTE.chapaMin, max: LIMITES_CORTE.chapaMax, campo });
  return {
    nome: texto(b.nome, { max: 100, obrigatorio: true, campo: 'Nome' }),
    espessura_mm: inteiro(b.espessura_mm, { min: 1, max: LIMITES_CORTE.espessuraMax, campo: 'Espessura' }),
    comprimento_mm: medida(b.comprimento_mm, 'Comprimento'),
    largura_mm: medida(b.largura_mm, 'Largura'),
    veio: marcado(b.veio),
    preco_cents: inteiro(b.preco_cents ?? 0, { max: LIMITES.centavos, campo: 'Preço da chapa' }),
    ativo: ativo(b.ativo),
  };
}

export function normalizarFita(b = {}) {
  return {
    nome: texto(b.nome, { max: 100, obrigatorio: true, campo: 'Nome' }),
    largura_mm: inteiro(b.largura_mm ?? 22, { min: 1, max: 200, campo: 'Largura da fita' }),
    preco_metro_cents: inteiro(b.preco_metro_cents ?? 0, { max: LIMITES.centavos, campo: 'Preço por metro' }),
    ativo: ativo(b.ativo),
  };
}

const semPreco = ({ preco_cents: _p, preco_metro_cents: _m, ...resto }) => resto;

export async function listarChapas(db, usuario) {
  const chapas = await db.all('SELECT * FROM chapas ORDER BY ativo DESC, lower(nome), espessura_mm, id');
  return ehAdmin(usuario) ? chapas : chapas.map(semPreco);
}

export async function listarFitas(db, usuario) {
  const fitas = await db.all('SELECT * FROM fitas ORDER BY ativo DESC, lower(nome), id');
  return ehAdmin(usuario) ? fitas : fitas.map(semPreco);
}

/** Funcionário cadastra chapa ou fita sem preço; o escritório completa depois. */
export async function criarMaterial(db, usuario, tabela, body) {
  const dados = tabela === 'chapas' ? normalizarChapa(body) : normalizarFita(body);
  if (!ehAdmin(usuario)) {
    if (tabela === 'chapas') dados.preco_cents = 0;
    else dados.preco_metro_cents = 0;
  }
  const campos = tabela === 'chapas' ? CAMPOS_CHAPA : CAMPOS_FITA;
  const r = await db.run(
    `INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')}) RETURNING id`,
    ...campos.map((k) => dados[k]),
  );
  const criado = await db.get(`SELECT * FROM ${tabela} WHERE id = ?`, r.lastInsertRowid);
  return ehAdmin(usuario) ? criado : semPreco(criado);
}

// ------------------------------------------------------------------ Serra

export async function lerConfig(db) {
  const c = await db.get('SELECT * FROM producao_config WHERE id = 1');
  const { id: _id, ...config } = c || {};
  return { ...CONFIG_PADRAO, ...config };
}

export async function salvarConfig(db, body = {}) {
  const atual = await lerConfig(db);
  const n = (chave, min, max, nome) => inteiro(body[chave] ?? atual[chave], { min, max, campo: nome });
  const config = {
    serra_decimos_mm: n('serra_decimos_mm', 0, LIMITES_CORTE.serraDecimosMax, 'Espessura do disco'),
    refilo_mm: n('refilo_mm', 0, LIMITES_CORTE.refiloMax, 'Refilo'),
    guia_paralela_mm: n('guia_paralela_mm', 100, 6000, 'Largura na guia paralela'),
    curso_carro_mm: n('curso_carro_mm', 500, 6000, 'Curso do carro'),
    sobra_min_largura_mm: n('sobra_min_largura_mm', 10, 3000, 'Largura mínima da sobra'),
    sobra_min_comprimento_mm: n('sobra_min_comprimento_mm', 10, 6000, 'Comprimento mínimo da sobra'),
  };
  const campos = Object.keys(config);
  await db.run(`UPDATE producao_config SET ${campos.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`, ...campos.map((k) => config[k]));
  return lerConfig(db);
}

// ------------------------------------------------------------- Funcionários

/** Login do funcionário: e-mail ou um nome de usuário simples (ex.: joao.silva). */
export function validarLogin(valor) {
  const s = texto(valor, { max: 200, obrigatorio: true, campo: 'Usuário' }).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || /^[a-z0-9][a-z0-9._-]{2,39}$/.test(s)) return s;
  throw invalido('Usuário inválido. Use letras sem acento, números, ponto, hífen ou um e-mail.');
}

export function listarFuncionarios(db) {
  return db.all(
    `SELECT u.id, u.nome, u.email AS login, u.ativo, u.criado_em,
            (SELECT COUNT(*) FROM planos_corte p WHERE p.usuario_id = u.id AND p.concluido_em IS NULL) AS abertos
       FROM usuarios u
      WHERE u.tipo = 'producao'
      ORDER BY u.ativo DESC, lower(u.nome)`,
  );
}

export async function criarFuncionario(db, body = {}) {
  const nome = texto(body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
  const login = validarLogin(body.login);
  const senha = validarSenha(body.senha);
  if (await db.get('SELECT 1 AS ok FROM usuarios WHERE email = ?', login)) throw invalido('Este usuário já existe.');
  const r = await db.run(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES (?, ?, ?, 'producao') RETURNING id`,
    nome,
    login,
    gerarHashSenha(senha),
  );
  return (await listarFuncionarios(db)).find((f) => f.id === r.lastInsertRowid);
}

export async function atualizarFuncionario(db, funcionarioId, body = {}) {
  const atual = await db.get(`SELECT id FROM usuarios WHERE id = ? AND tipo = 'producao'`, funcionarioId);
  if (!atual) throw naoEncontrado('Funcionário não encontrado.');
  const nome = texto(body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
  const login = validarLogin(body.login);
  if (await db.get('SELECT 1 AS ok FROM usuarios WHERE email = ? AND id <> ?', login, funcionarioId)) throw invalido('Este usuário já existe.');
  const situacao = ativo(body.ativo);
  const senha = body.senha ? validarSenha(body.senha) : null;
  await db.transacao(async (t) => {
    await t.run('UPDATE usuarios SET nome = ?, email = ?, ativo = ? WHERE id = ?', nome, login, situacao, funcionarioId);
    if (senha) await t.run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', gerarHashSenha(senha), funcionarioId);
    // Senha nova ou acesso desativado: derruba as sessões abertas.
    if (senha || !situacao) await t.run('DELETE FROM sessoes WHERE usuario_id = ?', funcionarioId);
  });
  return (await listarFuncionarios(db)).find((f) => f.id === funcionarioId);
}

// -------------------------------------------------------------------- Planos

const ajustesDo = (plano) => ({
  serra_decimos_mm: plano.serra_decimos_mm,
  refilo_mm: plano.refilo_mm,
  modo: plano.modo,
  margem_fita_pct: plano.margem_fita_pct,
});

function normalizarAjustes(b, atual) {
  const base = { ...AJUSTES_PADRAO, ...atual };
  return {
    serra_decimos_mm: inteiro(b.serra_decimos_mm ?? base.serra_decimos_mm, { max: LIMITES_CORTE.serraDecimosMax, campo: 'Espessura do disco' }),
    refilo_mm: inteiro(b.refilo_mm ?? base.refilo_mm, { max: LIMITES_CORTE.refiloMax, campo: 'Refilo' }),
    modo: umDe(b.modo ?? base.modo, Object.keys(MODOS_CORTE), 'Modo de corte'),
    margem_fita_pct: inteiro(b.margem_fita_pct ?? base.margem_fita_pct, { max: LIMITES_CORTE.margemFitaMax, campo: 'Margem da fita' }),
  };
}

function normalizarPeca(b, i, chapasIds, fitasIds) {
  if (!b || typeof b !== 'object') throw invalido(`Linha ${i + 1} da lista de peças inválida.`);
  const linha = `(linha ${i + 1})`;
  const referencia = (valor, ids, nome) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = inteiro(valor, { min: 1, campo: `${nome} ${linha}` });
    if (!ids.has(n)) throw invalido(`${nome} ${linha} não encontrada. Recarregue a página.`);
    return n;
  };
  const medida = (v, campo) => inteiro(v, { min: 1, max: LIMITES_CORTE.medidaMax, campo: `${campo} ${linha}` });
  return {
    grupo: texto(b.grupo, { max: 120, campo: `Móvel ${linha}` }),
    descricao: texto(b.descricao, { max: 120, campo: `Peça ${linha}` }),
    chapa_id: referencia(b.chapa_id, chapasIds, 'Chapa'),
    comprimento_mm: medida(b.comprimento_mm, 'Comprimento'),
    largura_mm: medida(b.largura_mm, 'Largura'),
    quantidade: inteiro(b.quantidade ?? 1, { min: 1, max: LIMITES_CORTE.quantidade, campo: `Quantidade ${linha}` }),
    veio: marcado(b.veio),
    fita_id: referencia(b.fita_id, fitasIds, 'Fita'),
    fita_c1: marcado(b.fita_c1),
    fita_c2: marcado(b.fita_c2),
    fita_l1: marcado(b.fita_l1),
    fita_l2: marcado(b.fita_l2),
  };
}

const CAMPOS_PECA = ['grupo', 'descricao', 'chapa_id', 'comprimento_mm', 'largura_mm', 'quantidade', 'veio', 'fita_id', 'fita_c1', 'fita_c2', 'fita_l1', 'fita_l2'];

async function normalizarPecas(db, lista) {
  if (!Array.isArray(lista)) throw invalido('Lista de peças inválida.');
  if (lista.length > LIMITES_CORTE.linhas) throw invalido(`Use no máximo ${LIMITES_CORTE.linhas} linhas de peças por plano.`);
  const [chapas, fitas] = await Promise.all([db.all('SELECT id FROM chapas'), db.all('SELECT id FROM fitas')]);
  const pecas = lista.map((p, i) => normalizarPeca(p, i, new Set(chapas.map((c) => c.id)), new Set(fitas.map((f) => f.id))));
  if (pecas.reduce((s, p) => s + p.quantidade, 0) > LIMITES_CORTE.instancias) {
    throw invalido(`Use no máximo ${LIMITES_CORTE.instancias} peças por plano (somando as quantidades).`);
  }
  return pecas;
}

async function gravarPecas(t, planoId, pecas) {
  await t.run('DELETE FROM plano_pecas WHERE plano_id = ?', planoId);
  for (let i = 0; i < pecas.length; i += 100) {
    const lote = pecas.slice(i, i + 100);
    const colunas = ['plano_id', 'ordem', ...CAMPOS_PECA];
    await t.run(
      `INSERT INTO plano_pecas (${colunas.join(', ')}) VALUES ${lote.map(() => `(${colunas.map(() => '?').join(', ')})`).join(', ')}`,
      ...lote.flatMap((p, j) => [planoId, i + j, ...CAMPOS_PECA.map((k) => p[k])]),
    );
  }
}

/** Situação mostrada na lista: novo → montando → pronto → cortando → concluído. */
export function situacaoPlano(p) {
  if (p.concluido_em) return 'concluido';
  if (p.iniciado_em) return 'cortando';
  if (p.calculado_em) return 'pronto';
  if (Number(p.pecas) > 0) return 'montando';
  return 'novo';
}

const SELECT_PLANO = `
  SELECT p.*, o.numero AS orcamento_numero, c.nome AS cliente_nome,
         u.nome AS funcionario_nome, a.nome AS criado_por_nome, a.tipo AS criado_por_tipo,
         (SELECT COALESCE(SUM(pp.quantidade), 0) FROM plano_pecas pp WHERE pp.plano_id = p.id) AS pecas
    FROM planos_corte p
    LEFT JOIN orcamentos o ON o.id = p.orcamento_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios a ON a.id = p.criado_por`;

function resumoLista(p) {
  const resultado = lerJson(p.resultado);
  const solucao = resultado?.solucoes?.[resultado.escolhida ?? 0];
  const progresso = lerJson(p.progresso);
  return {
    id: p.id,
    nome: p.nome,
    instrucoes: p.instrucoes,
    orcamento_id: p.orcamento_id,
    orcamento_numero: p.orcamento_numero,
    cliente_nome: p.cliente_nome,
    usuario_id: p.usuario_id,
    funcionario_nome: p.funcionario_nome,
    criado_por_nome: p.criado_por_nome,
    atribuido: p.criado_por !== p.usuario_id,
    situacao: situacaoPlano(p),
    pecas: Number(p.pecas) || 0,
    chapas: solucao ? solucao.chapas.filter((f) => !f.retalho_id).length : 0,
    retalhos: solucao ? solucao.chapas.filter((f) => f.retalho_id).length : 0,
    passo: progresso?.passo ?? 0,
    passos: progresso?.total ?? 0,
    criado_em: p.criado_em,
    atualizado_em: p.atualizado_em,
    concluido_em: p.concluido_em,
  };
}

export async function listarPlanos(db, usuario, { funcionarioId = null, concluidos = false } = {}) {
  const filtros = [concluidos ? 'p.concluido_em IS NOT NULL' : 'p.concluido_em IS NULL'];
  const params = [];
  if (!ehAdmin(usuario)) {
    filtros.push('p.usuario_id = ?');
    params.push(usuario.id);
  } else if (funcionarioId) {
    filtros.push('p.usuario_id = ?');
    params.push(funcionarioId);
  }
  const linhas = await db.all(
    `${SELECT_PLANO} WHERE ${filtros.join(' AND ')} ORDER BY ${concluidos ? 'p.concluido_em' : 'p.atualizado_em'} DESC, p.id DESC LIMIT 200`,
    ...params,
  );
  return linhas.map(resumoLista);
}

/** Confere o dono: funcionário só abre os próprios planos. */
async function planoPermitido(db, planoId, usuario, { paraAlterar = false } = {}) {
  const p = await db.get('SELECT id, usuario_id, criado_por, concluido_em FROM planos_corte WHERE id = ?', planoId);
  if (!p || (!ehAdmin(usuario) && p.usuario_id !== usuario.id)) throw naoEncontrado('Plano de corte não encontrado.');
  if (paraAlterar && p.concluido_em) throw invalido('Este plano já foi concluído. Para cortar de novo, crie um plano novo.');
  return p;
}

/** Retalhos que o plano pode usar: disponíveis e os já reservados para ele. */
function retalhosPermitidos(db, planoId) {
  return db.all(
    `SELECT id, chapa_id, comprimento_mm, largura_mm, local, situacao, plano_id
       FROM retalhos
      WHERE situacao = 'disponivel' OR (plano_id = ? AND situacao IN ('reservado', 'usado'))
      ORDER BY id
      LIMIT ${LIMITES_CORTE.retalhosNoCalculo}`,
    planoId,
  );
}

/** O que o funcionário vê do orçamento: cliente, ambientes e móveis. Nenhum valor. */
async function trabalhoDoOrcamento(db, orcamentoId) {
  if (!orcamentoId) return null;
  const orc = await db.get(
    `SELECT o.numero, o.prazo_entrega, c.nome AS cliente_nome FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = ?`,
    orcamentoId,
  );
  if (!orc) return null;
  const [ambientes, itens] = await Promise.all([
    db.all('SELECT id, nome, descricao FROM orcamento_ambientes WHERE orcamento_id = ? ORDER BY ordem, id', orcamentoId),
    db.all(
      `SELECT ambiente_id, tipo_nome, descricao, metodo_calculo, largura_mm, altura_mm, quantidade
         FROM orcamento_itens WHERE orcamento_id = ? ORDER BY ordem, id`,
      orcamentoId,
    ),
  ]);
  // A oficina trabalha em cm: o tamanho do móvel vai em cm, nunca o cálculo do preço.
  const medida = (i) =>
    i.metodo_calculo === 'linear' ? `${formatarCm(i.largura_mm)} cm` : i.metodo_calculo === 'quadrado' ? `${formatarCm(i.largura_mm)} × ${formatarCm(i.altura_mm)} cm` : `${i.quantidade} un.`;
  const item = (i) => ({ nome: i.descricao || i.tipo_nome, tipo: i.tipo_nome, medida: medida(i), quantidade: i.quantidade });
  return {
    numero: orc.numero,
    cliente_nome: orc.cliente_nome,
    prazo_entrega: orc.prazo_entrega,
    ambientes: [
      ...ambientes.map((a) => ({ nome: a.nome, descricao: a.descricao, itens: itens.filter((i) => i.ambiente_id === a.id).map(item) })),
      ...(itens.some((i) => !i.ambiente_id) ? [{ nome: 'Móveis', descricao: '', itens: itens.filter((i) => !i.ambiente_id).map(item) }] : []),
    ],
  };
}

/** O resultado guardado só vale se a lista não mudou e os retalhos da solução escolhida seguem com o plano. */
function resultadoValido(guardado, { pecas, chapas, ajustes, retalhos, planoId }) {
  if (!guardado || guardado.versao !== 2 || !pecas.length) return null;
  if (guardado.assinatura !== assinaturaPlano(pecas, chapas, ajustes)) return null;
  const solucao = guardado.solucoes?.[guardado.escolhida ?? 0];
  const daqui = new Set(retalhos.filter((r) => r.plano_id === planoId).map((r) => r.id));
  if (!solucao || retalhosDaSolucao(solucao).some((id) => !daqui.has(id))) return null;
  return guardado;
}

/** Plano completo para a tela, o modo de corte e o PDF. */
export async function carregarPlano(db, planoId, usuario) {
  await planoPermitido(db, planoId, usuario);
  const p = await db.get(`${SELECT_PLANO} WHERE p.id = ?`, planoId);
  const [pecas, chapas, fitas, permitidos, config, trabalho] = await Promise.all([
    db.all(`SELECT ${CAMPOS_PECA.join(', ')} FROM plano_pecas WHERE plano_id = ? ORDER BY ordem, id`, planoId),
    listarChapas(db, usuario),
    listarFitas(db, usuario),
    retalhosPermitidos(db, planoId),
    lerConfig(db),
    trabalhoDoOrcamento(db, p.orcamento_id),
  ]);
  const ajustes = ajustesDo(p);
  const guardado = lerJson(p.resultado);
  const resultado = resultadoValido(guardado, { pecas, chapas, ajustes, retalhos: permitidos, planoId });
  // Para desenhar soluções guardadas, inclui também retalhos que elas citam.
  const citados = new Set((guardado?.solucoes || []).flatMap(retalhosDaSolucao));
  const faltando = [...citados].filter((id) => !permitidos.some((r) => r.id === id));
  const outros = faltando.length
    ? await db.all(`SELECT id, chapa_id, comprimento_mm, largura_mm, local, situacao, plano_id FROM retalhos WHERE id IN (${faltando.map(() => '?').join(', ')})`, ...faltando)
    : [];
  const admin = ehAdmin(usuario);
  let custo = null;
  if (admin && resultado) {
    const solucao = resultado.solucoes[resultado.escolhida];
    const vista = { pecas, chapas, fitas, ajustes, retalhos: permitidos, config };
    const resumo = resumirSolucao(vista, solucao, detalharSolucao(vista, solucao));
    custo = { chapas_cents: resumo.custo_chapas_cents, fitas_cents: resumo.custo_fitas_cents };
  }
  return {
    ...resumoLista(p),
    versao: p.versao,
    usar_retalhos: p.usar_retalhos,
    calculado_em: p.calculado_em,
    iniciado_em: p.iniciado_em,
    ajustes,
    pecas,
    resultado,
    resultado_desatualizado: Boolean(guardado && !resultado),
    progresso: resultado ? lerJson(p.progresso) : null,
    chapas,
    fitas,
    retalhos: [...permitidos, ...outros],
    config,
    trabalho,
    pode_excluir: admin || p.criado_por === usuario.id,
    ...(admin ? { custo, orcamento_total_cents: p.orcamento_id ? (await db.get('SELECT total_cents FROM orcamentos WHERE id = ?', p.orcamento_id))?.total_cents ?? null : null } : {}),
  };
}

async function inserirPlano(t, { usuarioId, criadoPor, orcamentoId = null, nome, instrucoes = '', pecas = [] }) {
  const config = await t.get('SELECT serra_decimos_mm, refilo_mm FROM producao_config WHERE id = 1');
  const r = await t.run(
    `INSERT INTO planos_corte (usuario_id, criado_por, orcamento_id, nome, instrucoes, serra_decimos_mm, refilo_mm)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    usuarioId,
    criadoPor,
    orcamentoId,
    nome,
    instrucoes,
    config?.serra_decimos_mm ?? CONFIG_PADRAO.serra_decimos_mm,
    config?.refilo_mm ?? CONFIG_PADRAO.refilo_mm,
  );
  if (pecas.length) await gravarPecas(t, r.lastInsertRowid, pecas);
  return r.lastInsertRowid;
}

/**
 * Plano criado pelo próprio funcionário (avulso). Com `recorte_de`, nasce com
 * as peças estragadas de outro plano dele, ligado ao mesmo orçamento.
 */
export async function criarPlano(db, usuario, body = {}) {
  let nome = texto(body.nome, { max: 150, campo: 'Nome' });
  let orcamentoId = null;
  let pecas = [];
  if (body.recorte_de) {
    const origem = await planoPermitido(db, inteiro(body.recorte_de, { min: 1, campo: 'Plano' }), usuario);
    const dados = await db.get('SELECT nome, orcamento_id FROM planos_corte WHERE id = ?', origem.id);
    orcamentoId = dados.orcamento_id;
    nome ||= `Recorte · ${dados.nome}`.slice(0, 150);
    pecas = await normalizarPecas(db, body.pecas || []);
  }
  return db.transacao((t) => inserirPlano(t, { usuarioId: usuario.id, criadoPor: usuario.id, orcamentoId, nome: nome || 'Plano de corte', pecas }));
}

/** O escritório manda um orçamento para um funcionário cortar. */
export async function atribuirPlano(db, admin, orcamentoId, body = {}) {
  const funcionarioId = inteiro(body.funcionario_id, { min: 1, campo: 'Funcionário' });
  const instrucoes = texto(body.instrucoes, { max: 2000, campo: 'Instruções' });
  const funcionario = await db.get(`SELECT id FROM usuarios WHERE id = ? AND tipo = 'producao' AND ativo = 1`, funcionarioId);
  if (!funcionario) throw invalido('Escolha um funcionário ativo.');
  const orc = await db.get('SELECT o.numero, c.nome AS cliente FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = ?', orcamentoId);
  if (!orc) throw naoEncontrado('Orçamento não encontrado.');
  const nome = texto(body.nome, { max: 150, campo: 'Nome' }) || `Orçamento ${formatarNumero(orc.numero)} · ${orc.cliente}`;
  return db.transacao((t) => inserirPlano(t, { usuarioId: funcionarioId, criadoPor: admin.id, orcamentoId, nome, instrucoes }));
}

/** Trabalhos de um orçamento, para o escritório acompanhar no editor. */
export async function planosDoOrcamento(db, orcamentoId) {
  const linhas = await db.all(`${SELECT_PLANO} WHERE p.orcamento_id = ? ORDER BY p.criado_em, p.id`, orcamentoId);
  const lista = [];
  for (const linha of linhas) {
    const plano = await carregarPlano(db, linha.id, { tipo: 'administrador' });
    lista.push({
      ...resumoLista(linha),
      custo: plano.custo,
      orcamento_total_cents: plano.orcamento_total_cents,
    });
  }
  return lista;
}

/** Reserva os retalhos da solução escolhida e devolve os que o plano não usa mais. */
async function reservarRetalhos(t, planoId, ids) {
  await t.run(
    `UPDATE retalhos SET situacao = 'disponivel', plano_id = NULL, atualizado_em = now()
      WHERE plano_id = ? AND situacao = 'reservado'${ids.length ? ` AND id NOT IN (${ids.map(() => '?').join(', ')})` : ''}`,
    planoId,
    ...ids,
  );
  for (const id of ids) {
    const r = await t.run(
      `UPDATE retalhos SET situacao = 'reservado', plano_id = ?, atualizado_em = now()
        WHERE id = ? AND (situacao = 'disponivel' OR (situacao = 'reservado' AND plano_id = ?))`,
      planoId,
      id,
      planoId,
    );
    if (!r.changes) throw new ErroHttp(409, 'Um retalho deste plano acabou de ser usado em outro trabalho. Calcule de novo.');
  }
}

/**
 * Salva nome, ajustes, uso de retalhos e lista de peças. Com `resultado`,
 * confere, guarda e reserva os retalhos da solução escolhida (o andamento do
 * corte recomeça); com `resultado: null`, apaga; sem o campo, mantém o anterior.
 */
export async function salvarPlano(db, planoId, usuario, body = {}) {
  await planoPermitido(db, planoId, usuario, { paraAlterar: true });
  const atual = await db.get('SELECT * FROM planos_corte WHERE id = ?', planoId);
  const pecas = await normalizarPecas(db, body.pecas);
  const chapas = await db.all('SELECT * FROM chapas');
  const nome = texto(body.nome ?? atual.nome, { max: 150, campo: 'Nome' }) || 'Plano de corte';
  const ajustes = normalizarAjustes(body, ajustesDo(atual));
  const usarRetalhos = body.usar_retalhos === undefined ? atual.usar_retalhos : marcado(body.usar_retalhos);

  let resultado;
  if (body.resultado === null) resultado = null;
  else if (body.resultado !== undefined) {
    if (pecas.some((p) => !p.chapa_id)) throw invalido('Escolha a chapa de todas as peças antes de calcular.');
    const permitidos = usarRetalhos ? await retalhosPermitidos(db, planoId) : [];
    try {
      resultado = validarResultado(body.resultado, { pecas, chapas, ajustes, retalhos: permitidos.filter((r) => r.situacao !== 'usado') });
    } catch (erro) {
      throw invalido(erro.message);
    }
  }

  await db.transacao(async (t) => {
    const travado = await t.get('SELECT versao FROM planos_corte WHERE id = ? FOR UPDATE', planoId);
    if (body.versao !== undefined && Number(body.versao) !== travado.versao) {
      throw new ErroHttp(409, 'Este plano foi alterado em outra tela. Recarregue a página antes de continuar. Suas alterações nesta tela não foram salvas.');
    }
    if (resultado !== undefined) {
      await reservarRetalhos(t, planoId, resultado ? retalhosDaSolucao(resultado.solucoes[resultado.escolhida]) : []);
    }
    const novo = resultado === undefined ? undefined : resultado === null ? null : JSON.stringify(resultado);
    await t.run(
      `UPDATE planos_corte SET nome = ?, serra_decimos_mm = ?, refilo_mm = ?, modo = ?, margem_fita_pct = ?, usar_retalhos = ?,
         resultado = CASE WHEN ? = 1 THEN ? ELSE resultado END,
         calculado_em = CASE WHEN ? = 1 THEN now() WHEN ? = 1 THEN NULL ELSE calculado_em END,
         progresso = CASE WHEN ? = 1 THEN NULL ELSE progresso END,
         iniciado_em = CASE WHEN ? = 1 THEN NULL ELSE iniciado_em END,
         versao = versao + 1, atualizado_em = now()
       WHERE id = ?`,
      nome,
      ajustes.serra_decimos_mm,
      ajustes.refilo_mm,
      ajustes.modo,
      ajustes.margem_fita_pct,
      usarRetalhos,
      novo !== undefined,
      novo ?? null,
      typeof novo === 'string',
      novo === null,
      novo !== undefined,
      novo !== undefined,
      planoId,
    );
    await gravarPecas(t, planoId, pecas);
  });
  return carregarPlano(db, planoId, usuario);
}

/** Troca a solução escolhida (menos chapas, corte simples, maior sobra). */
export async function escolherSolucao(db, planoId, usuario, body = {}) {
  await planoPermitido(db, planoId, usuario, { paraAlterar: true });
  const plano = await carregarPlano(db, planoId, usuario);
  if (!plano.resultado) throw invalido('Calcule o plano antes de escolher uma solução.');
  const escolhida = inteiro(body.escolhida, { max: plano.resultado.solucoes.length - 1, campo: 'Solução' });
  if (plano.iniciado_em && !body.recomecar) throw new ErroHttp(409, 'O corte deste plano já começou. Confirme para recomeçar com outra solução.');
  const resultado = { ...plano.resultado, escolhida };
  await db.transacao(async (t) => {
    await reservarRetalhos(t, planoId, retalhosDaSolucao(resultado.solucoes[escolhida]));
    await t.run(
      `UPDATE planos_corte SET resultado = ?, progresso = NULL, iniciado_em = NULL, versao = versao + 1, atualizado_em = now() WHERE id = ?`,
      JSON.stringify(resultado),
      planoId,
    );
  });
  return carregarPlano(db, planoId, usuario);
}

/**
 * Andamento do corte: passo atual, total, peças estragadas e retalhos já
 * cortados. Ao concluir, os retalhos do plano passam a "usado".
 */
export async function salvarProgresso(db, planoId, usuario, body = {}) {
  await planoPermitido(db, planoId, usuario, { paraAlterar: true });
  const total = inteiro(body.total, { min: 1, max: 20000, campo: 'Total de passos' });
  const passo = inteiro(body.passo, { max: total, campo: 'Passo' });
  const lista = (v, nome) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > LIMITES_CORTE.instancias) throw invalido(`${nome} inválido.`);
    return [...new Set(v.map((n) => inteiro(n, { min: 1, max: 1_000_000, campo: nome })))];
  };
  const estragadas = lista(body.estragadas, 'Peças estragadas');
  const retalhosUsados = lista(body.retalhos_usados, 'Retalhos usados');
  const concluido = body.concluido === true && passo === total;
  const progresso = JSON.stringify({ passo, total, estragadas, escolhida: Number.isInteger(body.escolhida) ? body.escolhida : 0 });
  await db.transacao(async (t) => {
    await t.run(
      `UPDATE planos_corte SET progresso = ?, iniciado_em = COALESCE(iniciado_em, now()),
         concluido_em = CASE WHEN ? = 1 THEN now() ELSE NULL END, versao = versao + 1, atualizado_em = now()
       WHERE id = ?`,
      progresso,
      concluido,
      planoId,
    );
    const usados = concluido ? null : retalhosUsados;
    await t.run(
      `UPDATE retalhos SET situacao = 'usado', atualizado_em = now()
        WHERE plano_id = ? AND situacao = 'reservado'${usados ? (usados.length ? ` AND id IN (${usados.map(() => '?').join(', ')})` : ' AND false') : ''}`,
      planoId,
      ...(usados || []),
    );
  });
  return carregarPlano(db, planoId, usuario);
}

export async function excluirPlano(db, planoId, usuario) {
  const p = await planoPermitido(db, planoId, usuario);
  if (!ehAdmin(usuario) && p.criado_por !== usuario.id) throw invalido('Este trabalho foi mandado pelo escritório. Peça para excluírem por lá.');
  await db.transacao(async (t) => {
    await t.run(`UPDATE retalhos SET situacao = 'disponivel', plano_id = NULL, atualizado_em = now() WHERE plano_id = ? AND situacao = 'reservado'`, planoId);
    await t.run('DELETE FROM planos_corte WHERE id = ?', planoId);
  });
}

// ------------------------------------------------------------------ Retalhos

export function listarRetalhos(db, { situacao = 'disponivel' } = {}) {
  const situacoes = situacao === 'todos' ? ['disponivel', 'reservado', 'usado', 'descartado'] : [umDe(situacao, ['disponivel', 'reservado', 'usado', 'descartado'], 'Situação')];
  return db.all(
    `SELECT r.*, c.nome AS chapa_nome, c.espessura_mm, c.veio, u.nome AS criado_por_nome, p.nome AS plano_nome
       FROM retalhos r
       JOIN chapas c ON c.id = r.chapa_id
       LEFT JOIN usuarios u ON u.id = r.criado_por
       LEFT JOIN planos_corte p ON p.id = r.plano_id
      WHERE r.situacao IN (${situacoes.map(() => '?').join(', ')})
      ORDER BY lower(c.nome), c.espessura_mm, r.comprimento_mm * r.largura_mm DESC, r.id
      LIMIT 500`,
    ...situacoes,
  );
}

function normalizarRetalho(b) {
  const medida = (v, campo) => inteiro(v, { min: LIMITES_CORTE.retalhoMin, max: LIMITES_CORTE.chapaMax, campo });
  return {
    chapa_id: inteiro(b.chapa_id, { min: 1, campo: 'Chapa' }),
    comprimento_mm: medida(b.comprimento_mm, 'Comprimento do retalho'),
    largura_mm: medida(b.largura_mm, 'Largura do retalho'),
    local: texto(b.local, { max: 80, campo: 'Local' }),
  };
}

/** Guarda um ou vários retalhos (ex.: as sobras do fim de uma chapa). */
export async function criarRetalhos(db, usuario, body = {}) {
  const lista = Array.isArray(body.retalhos) ? body.retalhos : [body];
  if (!lista.length || lista.length > 50) throw invalido('Envie de 1 a 50 retalhos.');
  const retalhos = lista.map(normalizarRetalho);
  let origem = null;
  if (body.origem_plano_id) origem = (await planoPermitido(db, inteiro(body.origem_plano_id, { min: 1, campo: 'Plano' }), usuario)).id;
  for (const r of retalhos) {
    if (!(await db.get('SELECT 1 AS ok FROM chapas WHERE id = ?', r.chapa_id))) throw invalido('Chapa do retalho não encontrada.');
  }
  const ids = [];
  await db.transacao(async (t) => {
    for (const r of retalhos) {
      const novo = await t.run(
        `INSERT INTO retalhos (chapa_id, comprimento_mm, largura_mm, local, origem_plano_id, criado_por) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        r.chapa_id,
        r.comprimento_mm,
        r.largura_mm,
        r.local,
        origem,
        usuario.id,
      );
      ids.push(novo.lastInsertRowid);
    }
  });
  return ids;
}

/** Corrige medida e local, descarta ou devolve um retalho ao estoque. Reservado não muda. */
export async function atualizarRetalho(db, retalhoId, body = {}) {
  const atual = await db.get('SELECT * FROM retalhos WHERE id = ?', retalhoId);
  if (!atual) throw naoEncontrado('Retalho não encontrado.');
  if (atual.situacao === 'reservado') throw invalido('Este retalho está reservado para um plano. Libere o plano antes de mexer nele.');
  const dados = normalizarRetalho({ ...atual, ...body });
  const situacao = umDe(body.situacao ?? atual.situacao, ['disponivel', 'usado', 'descartado'], 'Situação');
  await db.run(
    `UPDATE retalhos SET chapa_id = ?, comprimento_mm = ?, largura_mm = ?, local = ?, situacao = ?, plano_id = CASE WHEN ? = 'disponivel' THEN NULL ELSE plano_id END, atualizado_em = now() WHERE id = ?`,
    dados.chapa_id,
    dados.comprimento_mm,
    dados.largura_mm,
    dados.local,
    situacao,
    situacao,
    retalhoId,
  );
  return db.get('SELECT * FROM retalhos WHERE id = ?', retalhoId);
}

// Plano de corte no servidor: cadastro de chapas e fitas, planos e peças.
// O cálculo é feito no navegador; aqui o resultado recebido é conferido
// (validarResultado) antes de ser guardado.
import { LIMITES, formatarNumero } from '../public/shared/calc.js';
import { AJUSTES_PADRAO, LIMITES_CORTE, MODOS_CORTE, assinaturaPlano, resumirPlano, validarResultado } from '../public/shared/corte.js';
import { ErroHttp, inteiro, invalido, texto, umDe } from './validacao.js';

const marcado = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);
const ativo = (v) => (v === false || v === 0 ? 0 : 1);

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

export const listarChapas = (db) => db.all('SELECT * FROM chapas ORDER BY ativo DESC, lower(nome), espessura_mm, id');
export const listarFitas = (db) => db.all('SELECT * FROM fitas ORDER BY ativo DESC, lower(nome), id');

// -------------------------------------------------------------------- Planos

const ajustesDo = (plano) => ({
  serra_decimos_mm: plano.serra_decimos_mm,
  refilo_mm: plano.refilo_mm,
  modo: plano.modo,
  margem_fita_pct: plano.margem_fita_pct,
});

function normalizarAjustes(b) {
  return {
    serra_decimos_mm: inteiro(b.serra_decimos_mm ?? AJUSTES_PADRAO.serra_decimos_mm, { max: LIMITES_CORTE.serraDecimosMax, campo: 'Espessura da serra' }),
    refilo_mm: inteiro(b.refilo_mm ?? AJUSTES_PADRAO.refilo_mm, { max: LIMITES_CORTE.refiloMax, campo: 'Refilo' }),
    modo: umDe(b.modo ?? AJUSTES_PADRAO.modo, Object.keys(MODOS_CORTE), 'Modo de corte'),
    margem_fita_pct: inteiro(b.margem_fita_pct ?? AJUSTES_PADRAO.margem_fita_pct, { max: LIMITES_CORTE.margemFitaMax, campo: 'Margem da fita' }),
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

const lerResultado = (json) => {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
};

export async function listarPlanos(db) {
  const linhas = await db.all(
    `SELECT p.id, p.nome, p.orcamento_id, p.calculado_em, p.atualizado_em, p.resultado,
            o.numero AS orcamento_numero, c.nome AS cliente_nome,
            (SELECT COALESCE(SUM(pp.quantidade), 0) FROM plano_pecas pp WHERE pp.plano_id = p.id) AS pecas
       FROM planos_corte p
       LEFT JOIN orcamentos o ON o.id = p.orcamento_id
       LEFT JOIN clientes c ON c.id = o.cliente_id
      ORDER BY p.atualizado_em DESC, p.id DESC
      LIMIT 200`,
  );
  return linhas.map(({ resultado, ...p }) => ({ ...p, chapas: lerResultado(resultado)?.chapas?.length ?? 0 }));
}

/** Plano completo para a tela e o PDF. O resultado só vale se ainda bate com a lista. */
export async function carregarPlano(db, planoId) {
  const plano = await db.get(
    `SELECT p.*, o.numero AS orcamento_numero, o.total_cents AS orcamento_total_cents, o.status AS orcamento_status,
            c.nome AS cliente_nome
       FROM planos_corte p
       LEFT JOIN orcamentos o ON o.id = p.orcamento_id
       LEFT JOIN clientes c ON c.id = o.cliente_id
      WHERE p.id = ?`,
    planoId,
  );
  if (!plano) return null;
  const [pecas, chapas, fitas] = await Promise.all([
    db.all(`SELECT ${CAMPOS_PECA.join(', ')} FROM plano_pecas WHERE plano_id = ? ORDER BY ordem, id`, planoId),
    listarChapas(db),
    listarFitas(db),
  ]);
  const ajustes = ajustesDo(plano);
  const guardado = lerResultado(plano.resultado);
  const vale = Boolean(guardado && pecas.length && guardado.assinatura === assinaturaPlano(pecas, chapas, ajustes));
  const resultado = vale ? guardado : null;

  let gruposSugeridos = [];
  if (plano.orcamento_id) {
    const itens = await db.all(
      `SELECT a.nome AS ambiente, i.tipo_nome, i.descricao
         FROM orcamento_itens i
         LEFT JOIN orcamento_ambientes a ON a.id = i.ambiente_id
        WHERE i.orcamento_id = ?
        ORDER BY a.ordem, i.ordem, i.id`,
      plano.orcamento_id,
    );
    const nomes = itens.map((i) => [i.ambiente, i.descricao || i.tipo_nome].filter(Boolean).join(' · '));
    gruposSugeridos = [...new Set(nomes.filter(Boolean))];
  }

  const { resultado: _json, ...dados } = plano;
  return {
    ...dados,
    ajustes,
    pecas,
    resultado,
    resultado_desatualizado: Boolean(guardado && !vale),
    resumo: resumirPlano({ pecas, chapas, fitas, ajustes, resultado }),
    chapas,
    fitas,
    grupos_sugeridos: gruposSugeridos,
  };
}

/**
 * Cria um plano. Para um orçamento, devolve o plano que ele já tiver.
 * Os ajustes da serra vêm do último plano salvo (a serra costuma ser a mesma).
 */
export async function criarPlano(db, body = {}) {
  const orcamentoId = body.orcamento_id ? inteiro(body.orcamento_id, { min: 1, campo: 'Orçamento' }) : null;
  return db.transacao(async (t) => {
    let nome = texto(body.nome, { max: 150, campo: 'Nome' });
    if (orcamentoId) {
      const orc = await t.get(
        `SELECT o.numero, c.nome AS cliente FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = ?`,
        orcamentoId,
      );
      if (!orc) throw new ErroHttp(404, 'Orçamento não encontrado.');
      const existente = await t.get('SELECT id FROM planos_corte WHERE orcamento_id = ?', orcamentoId);
      if (existente) return { id: existente.id, criado: false };
      nome ||= `Orçamento ${formatarNumero(orc.numero)} · ${orc.cliente}`;
    }
    const ultimo = await t.get('SELECT serra_decimos_mm, refilo_mm, margem_fita_pct FROM planos_corte ORDER BY atualizado_em DESC, id DESC LIMIT 1');
    const ajustes = { ...AJUSTES_PADRAO, ...(ultimo || {}) };
    const r = await t.run(
      `INSERT INTO planos_corte (orcamento_id, nome, serra_decimos_mm, refilo_mm, margem_fita_pct)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (orcamento_id) DO NOTHING
       RETURNING id`,
      orcamentoId,
      nome || 'Plano de corte',
      ajustes.serra_decimos_mm,
      ajustes.refilo_mm,
      ajustes.margem_fita_pct,
    );
    if (r.lastInsertRowid) return { id: r.lastInsertRowid, criado: true };
    const existente = await t.get('SELECT id FROM planos_corte WHERE orcamento_id = ?', orcamentoId);
    return { id: existente.id, criado: false };
  });
}

/**
 * Salva nome, ajustes e lista de peças. Com `resultado`, confere e guarda o
 * cálculo; com `resultado: null`, apaga; sem o campo, mantém o anterior (que só
 * volta a valer se a lista não mudou o que importa para o corte).
 */
export async function salvarPlano(db, planoId, body = {}) {
  if (!Array.isArray(body.pecas)) throw invalido('Lista de peças inválida.');
  if (body.pecas.length > LIMITES_CORTE.linhas) throw invalido(`Use no máximo ${LIMITES_CORTE.linhas} linhas de peças por plano.`);
  const [chapas, fitas] = await Promise.all([listarChapas(db), listarFitas(db)]);
  const chapasIds = new Set(chapas.map((c) => c.id));
  const fitasIds = new Set(fitas.map((f) => f.id));
  const nome = texto(body.nome, { max: 150, campo: 'Nome' }) || 'Plano de corte';
  const ajustes = normalizarAjustes(body);
  const pecas = body.pecas.map((p, i) => normalizarPeca(p, i, chapasIds, fitasIds));
  const total = pecas.reduce((s, p) => s + p.quantidade, 0);
  if (total > LIMITES_CORTE.instancias) throw invalido(`Use no máximo ${LIMITES_CORTE.instancias} peças por plano (somando as quantidades).`);

  let resultado;
  if (body.resultado === null) resultado = null;
  else if (body.resultado !== undefined) {
    if (pecas.some((p) => !p.chapa_id)) throw invalido('Escolha a chapa de todas as peças antes de calcular.');
    try {
      resultado = validarResultado(body.resultado, { pecas, chapas, ajustes });
    } catch (erro) {
      throw invalido(erro.message);
    }
  }

  await db.transacao(async (t) => {
    const atual = await t.get('SELECT versao FROM planos_corte WHERE id = ? FOR UPDATE', planoId);
    if (!atual) throw new ErroHttp(404, 'Plano de corte não encontrado.');
    if (body.versao !== undefined && Number(body.versao) !== atual.versao) {
      throw new ErroHttp(409, 'Este plano foi alterado em outra tela. Recarregue a página antes de continuar. Suas alterações nesta tela não foram salvas.');
    }
    const novoResultado = resultado === undefined ? undefined : resultado === null ? null : JSON.stringify(resultado);
    await t.run(
      `UPDATE planos_corte SET nome = ?, serra_decimos_mm = ?, refilo_mm = ?, modo = ?, margem_fita_pct = ?,
         resultado = CASE WHEN ? = 1 THEN ? ELSE resultado END,
         calculado_em = CASE WHEN ? = 1 THEN now() WHEN ? = 1 THEN NULL ELSE calculado_em END,
         versao = versao + 1, atualizado_em = now()
       WHERE id = ?`,
      nome,
      ajustes.serra_decimos_mm,
      ajustes.refilo_mm,
      ajustes.modo,
      ajustes.margem_fita_pct,
      novoResultado !== undefined,
      novoResultado ?? null,
      typeof novoResultado === 'string',
      novoResultado === null,
      planoId,
    );
    await t.run('DELETE FROM plano_pecas WHERE plano_id = ?', planoId);
    for (let i = 0; i < pecas.length; i += 100) {
      const lote = pecas.slice(i, i + 100);
      const colunas = ['plano_id', 'ordem', ...CAMPOS_PECA];
      await t.run(
        `INSERT INTO plano_pecas (${colunas.join(', ')}) VALUES ${lote.map(() => `(${colunas.map(() => '?').join(', ')})`).join(', ')}`,
        ...lote.flatMap((p, j) => [planoId, i + j, ...CAMPOS_PECA.map((k) => p[k])]),
      );
    }
  });
  return carregarPlano(db, planoId);
}

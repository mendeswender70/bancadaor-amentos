// Projeto anexado: PDF do arquiteto e fotos, no orçamento (o escritório anexa
// e todos os trabalhos daquele orçamento veem) ou no plano (quem corta anexa).
// O arquivo vai e volta em partes de 3 MB: a Vercel limita cada requisição e
// cada resposta a 4,5 MB.
import { ehAdmin } from './producao.js';
import { ErroHttp, inteiro, invalido, naoEncontrado, texto, umDe } from './validacao.js';

export const PARTE_BYTES = 3 * 1024 * 1024;
export const ANEXO_MAX_BYTES = 25 * 1024 * 1024;
const MAX_POR_DESTINO = 30;
export const TIPOS_ANEXO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const EXTENSOES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/**
 * Nome seguro para mostrar e baixar: sem barras, sem caracteres de controle ou
 * de direção do texto (que disfarçam a extensão) e sempre com a extensão do
 * tipo conferido. Assim um ".html" não chega ao escritório como "projeto".
 */
export function nomeDoAnexo(nome, tipo) {
  const ext = EXTENSOES[tipo];
  let base = String(nome ?? '')
    .replace(/[\\/\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .trim();
  if (base.toLowerCase().endsWith(ext)) base = base.slice(0, -ext.length).trim();
  if (!base) base = tipo === 'application/pdf' ? 'projeto' : 'foto';
  return texto(base.slice(0, 150 - ext.length) + ext, { max: 150, campo: 'Nome do arquivo' });
}

const proibido = () => new ErroHttp(403, 'Você não tem acesso a este anexo.');

/** Funcionário vê o orçamento só se tiver um trabalho dele. */
async function podeVerOrcamento(db, usuario, orcamentoId) {
  if (ehAdmin(usuario)) return Boolean(await db.get('SELECT 1 AS ok FROM orcamentos WHERE id = ?', orcamentoId));
  return Boolean(await db.get('SELECT 1 AS ok FROM planos_corte WHERE orcamento_id = ? AND usuario_id = ? LIMIT 1', orcamentoId, usuario.id));
}

async function planoDoUsuario(db, usuario, planoId) {
  const plano = await db.get('SELECT id, usuario_id, orcamento_id FROM planos_corte WHERE id = ?', planoId);
  if (!plano || (!ehAdmin(usuario) && plano.usuario_id !== usuario.id)) return null;
  return plano;
}

async function anexoVisivel(db, usuario, anexoId) {
  const anexo = await db.get('SELECT * FROM anexos WHERE id = ?', anexoId);
  if (!anexo) throw naoEncontrado('Anexo não encontrado.');
  const ok = anexo.plano_id ? Boolean(await planoDoUsuario(db, usuario, anexo.plano_id)) : await podeVerOrcamento(db, usuario, anexo.orcamento_id);
  if (!ok) throw naoEncontrado('Anexo não encontrado.');
  return anexo;
}

const podeExcluir = (usuario, anexo) => ehAdmin(usuario) || (anexo.plano_id && anexo.criado_por === usuario.id);

function publico(anexo, usuario, origem) {
  return {
    id: anexo.id,
    nome: anexo.nome,
    tipo: anexo.tipo,
    tamanho: anexo.tamanho,
    partes: anexo.partes,
    origem,
    criado_em: anexo.criado_em,
    criado_por_nome: anexo.criado_por_nome || '',
    pode_excluir: Boolean(podeExcluir(usuario, anexo)),
  };
}

const SELECT = `SELECT a.id, a.orcamento_id, a.plano_id, a.nome, a.tipo, a.tamanho, a.partes, a.criado_por, a.criado_em, u.nome AS criado_por_nome
  FROM anexos a LEFT JOIN usuarios u ON u.id = a.criado_por`;

/** Anexos do plano e, se ele veio de um orçamento, os do orçamento (primeiro). */
export async function anexosDoPlano(db, usuario, planoId) {
  const plano = await planoDoUsuario(db, usuario, planoId);
  if (!plano) throw naoEncontrado('Plano de corte não encontrado.');
  const doOrcamento = plano.orcamento_id ? await db.all(`${SELECT} WHERE a.orcamento_id = ? AND a.completo = 1 ORDER BY a.id`, plano.orcamento_id) : [];
  const doPlano = await db.all(`${SELECT} WHERE a.plano_id = ? AND a.completo = 1 ORDER BY a.id`, planoId);
  return [...doOrcamento.map((a) => publico(a, usuario, 'orcamento')), ...doPlano.map((a) => publico(a, usuario, 'plano'))];
}

export async function anexosDoOrcamento(db, usuario, orcamentoId) {
  if (!(await podeVerOrcamento(db, usuario, orcamentoId))) throw naoEncontrado('Orçamento não encontrado.');
  const lista = await db.all(`${SELECT} WHERE a.orcamento_id = ? AND a.completo = 1 ORDER BY a.id`, orcamentoId);
  return lista.map((a) => publico(a, usuario, 'orcamento'));
}

/** Começa um envio. Devolve o id e em quantas partes mandar o arquivo. */
export async function criarAnexo(db, usuario, body = {}) {
  const tipo = umDe(body.tipo, TIPOS_ANEXO, 'Tipo de arquivo (use PDF, JPEG, PNG ou WebP)');
  const tamanho = inteiro(body.tamanho, { min: 1, max: ANEXO_MAX_BYTES, campo: `Tamanho do arquivo (máximo ${ANEXO_MAX_BYTES / 1024 / 1024} MB)` });
  const nome = nomeDoAnexo(body.nome, tipo);
  let orcamentoId = null;
  let planoId = null;
  if (body.plano_id) {
    planoId = inteiro(body.plano_id, { min: 1, campo: 'Plano' });
    if (!(await planoDoUsuario(db, usuario, planoId))) throw naoEncontrado('Plano de corte não encontrado.');
  } else if (body.orcamento_id) {
    orcamentoId = inteiro(body.orcamento_id, { min: 1, campo: 'Orçamento' });
    if (!ehAdmin(usuario)) throw proibido();
    if (!(await db.get('SELECT 1 AS ok FROM orcamentos WHERE id = ?', orcamentoId))) throw naoEncontrado('Orçamento não encontrado.');
  } else throw invalido('Diga onde anexar: plano ou orçamento.');
  // Envios que não terminaram em 6 horas foram abandonados (a internet caiu, a
  // aba fechou): somem e deixam de contar no limite.
  await db.run(`DELETE FROM anexos WHERE completo = 0 AND criado_em < now() - interval '6 hours'`);
  const coluna = planoId ? 'plano_id' : 'orcamento_id';
  const { total } = await db.get(
    `SELECT COUNT(*) AS total FROM anexos WHERE ${coluna} = ? AND (completo = 1 OR criado_em > now() - interval '1 hour')`,
    planoId || orcamentoId,
  );
  if (Number(total) >= MAX_POR_DESTINO) throw invalido(`Use no máximo ${MAX_POR_DESTINO} anexos por ${planoId ? 'plano' : 'orçamento'}.`);
  const partes = Math.ceil(tamanho / PARTE_BYTES);
  const r = await db.run(
    `INSERT INTO anexos (orcamento_id, plano_id, nome, tipo, tamanho, partes, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    orcamentoId,
    planoId,
    nome,
    tipo,
    tamanho,
    partes,
    usuario.id,
  );
  return { id: r.lastInsertRowid, partes, parte_bytes: PARTE_BYTES };
}

/** Grava uma parte. Só quem começou o envio manda as partes, e cada parte tem o tamanho certo. */
export async function gravarParte(db, usuario, anexoId, ordem, dados) {
  const anexo = await db.get('SELECT id, tamanho, partes, completo, criado_por FROM anexos WHERE id = ?', anexoId);
  if (!anexo || anexo.criado_por !== usuario.id) throw naoEncontrado('Envio não encontrado.');
  if (anexo.completo) throw invalido('Este anexo já foi enviado.');
  if (!Number.isInteger(ordem) || ordem < 0 || ordem >= anexo.partes) throw invalido('Parte do arquivo inválida.');
  const esperado = ordem < anexo.partes - 1 ? PARTE_BYTES : anexo.tamanho - PARTE_BYTES * (anexo.partes - 1);
  if (!Buffer.isBuffer(dados) || dados.length !== esperado) throw invalido('A parte do arquivo chegou com tamanho errado. Tente enviar de novo.');
  await db.run(
    `INSERT INTO anexo_partes (anexo_id, ordem, dados) VALUES (?, ?, ?) ON CONFLICT (anexo_id, ordem) DO UPDATE SET dados = EXCLUDED.dados`,
    anexoId,
    ordem,
    dados,
  );
}

// Assinatura dos primeiros bytes: o arquivo precisa ser do tipo declarado.
const ASSINATURAS = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const comoBuffer = (dados) => (Buffer.isBuffer(dados) ? dados : Buffer.from(dados));

export async function concluirAnexo(db, usuario, anexoId) {
  const anexo = await db.get('SELECT * FROM anexos WHERE id = ?', anexoId);
  if (!anexo || anexo.criado_por !== usuario.id) throw naoEncontrado('Envio não encontrado.');
  if (anexo.completo) return;
  const resumo = await db.get('SELECT COUNT(*) AS partes, COALESCE(SUM(octet_length(dados)), 0) AS bytes FROM anexo_partes WHERE anexo_id = ?', anexoId);
  if (Number(resumo.partes) !== anexo.partes || Number(resumo.bytes) !== anexo.tamanho) throw invalido('O arquivo não chegou inteiro. Tente enviar de novo.');
  const primeira = await db.get('SELECT dados FROM anexo_partes WHERE anexo_id = ? AND ordem = 0', anexoId);
  if (!ASSINATURAS[anexo.tipo](comoBuffer(primeira.dados))) {
    await db.run('DELETE FROM anexos WHERE id = ?', anexoId);
    throw invalido('O arquivo não é um PDF ou uma imagem válida.');
  }
  await db.run('UPDATE anexos SET completo = 1 WHERE id = ?', anexoId);
}

export async function lerParte(db, usuario, anexoId, ordem) {
  const anexo = await anexoVisivel(db, usuario, anexoId);
  if (!anexo.completo) throw naoEncontrado('Anexo não encontrado.');
  if (!Number.isInteger(ordem) || ordem < 0 || ordem >= anexo.partes) throw naoEncontrado('Parte não encontrada.');
  const parte = await db.get('SELECT dados FROM anexo_partes WHERE anexo_id = ? AND ordem = ?', anexoId, ordem);
  if (!parte) throw naoEncontrado('Parte não encontrada.');
  return comoBuffer(parte.dados);
}

export async function excluirAnexo(db, usuario, anexoId) {
  const anexo = await anexoVisivel(db, usuario, anexoId);
  if (!podeExcluir(usuario, anexo)) throw new ErroHttp(403, anexo.orcamento_id ? 'Este anexo é do escritório. Peça para excluírem por lá.' : 'Só quem anexou pode excluir.');
  await db.run('DELETE FROM anexos WHERE id = ?', anexoId);
}

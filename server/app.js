import express from 'express';
import { fileURLToPath } from 'node:url';
import { AMBIENTES_SUGERIDOS, METODOS, TIPOS_AJUSTE, LIMITES, formatarNumero } from '../public/shared/calc.js';
import {
  conferirSenha,
  criarLimitadorLogin,
  criarSessao,
  encerrarSessao,
  exigirCabecalhoFetch,
  exigirLogin,
  gerarHashSenha,
  usuarioDaSessao,
  validarEmail,
  validarSenha,
} from './auth.js';
import { abrirBanco, semAcento, somenteDigitos } from './db.js';
import {
  alterarStatus,
  aprovarPeloLink,
  atualizarOrcamento,
  carregarOrcamento,
  criarOrcamento,
  duplicarOrcamento,
  expirarVencidos,
  garantirToken,
  idPorToken,
  listarHistorico,
  listarOrcamentos,
  podeAprovar,
  registrarVisualizacao,
  resumoDashboard,
} from './orcamentos.js';
import { gerarPdf } from './pdf.js';
import { ErroHttp, hoje, id, inteiro, invalido, naoEncontrado, texto, umDe } from './validacao.js';
import { propostaPublica, visaoCliente } from './visaoCliente.js';

const pasta = (relativo) => fileURLToPath(new URL(relativo, import.meta.url));
const padraoLike = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const SEM_BUSCA = ({ nome_busca, telefone_digitos, whatsapp_digitos, ...resto }) => resto;

const MAX_SUGESTOES_AMBIENTE = 80;

/** Sugestões salvas pela empresa ou, se nunca foram alteradas, as padrão. */
function lerSugestoesAmbiente(json) {
  try {
    const lista = JSON.parse(json);
    if (Array.isArray(lista)) return lista;
  } catch {
    // Valor ausente ou inválido: usa as sugestões padrão.
  }
  return AMBIENTES_SUGERIDOS;
}

/**
 * @param {object} [opcoes]
 * @param {{url: string, authToken?: string}} [opcoes.banco] sem isto, detecta pelo ambiente
 * @param {() => string} [opcoes.dataHoje]
 */
export function criarApp({ banco, dataHoje = hoje } = {}) {
  // O banco é aberto na primeira requisição (e reaproveitado depois), para
  // funcionar também como função serverless na Vercel.
  let conexao = null;
  const obterDb = () => {
    conexao ??= abrirBanco(banco).catch((erro) => {
      conexao = null;
      throw erro;
    });
    return conexao;
  };

  const app = express();
  const confiarProxy = process.env.TRUST_PROXY || (process.env.VERCEL ? '1' : '');
  if (confiarProxy) app.set('trust proxy', /^\d+$/.test(confiarProxy) ? Number(confiarProxy) : confiarProxy);
  app.disable('x-powered-by');
  app.locals.obterDb = obterDb;

  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.use(express.static(pasta('../public'), { index: 'index.html' }));

  // Página da proposta para o cliente (o conteúdo vem de /api/publico).
  app.get('/p/:token', (_req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(pasta('../public/proposta.html'));
  });

  const api = express.Router();
  app.use('/api', api);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '4mb' }));
  api.use(exigirCabecalhoFetch);
  let db;
  api.use(async (_req, _res, next) => {
    db = await obterDb();
    next();
  });

  // ------------------------------------------------------------ Autenticação
  const limitador = criarLimitadorLogin();
  const existeUsuario = async () => Boolean(await db.get('SELECT 1 AS ok FROM usuarios LIMIT 1'));

  api.get('/auth/estado', async (req, res) => {
    res.json({ precisa_configurar: !(await existeUsuario()), usuario: await usuarioDaSessao(db, req) });
  });

  // Primeiro acesso: cria o administrador. Depois disso, a rota fica fechada.
  api.post('/auth/configurar', async (req, res) => {
    if (await existeUsuario()) throw new ErroHttp(403, 'O sistema já foi configurado.');
    const nome = texto(req.body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
    const email = validarEmail(req.body.email);
    const senha = validarSenha(req.body.senha);
    const r = await db.run(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       SELECT ?::text, ?::text, ?::text, 'administrador' WHERE NOT EXISTS (SELECT 1 FROM usuarios)
       RETURNING id`,
      nome,
      email,
      gerarHashSenha(senha),
    );
    if (!r.changes) throw new ErroHttp(403, 'O sistema já foi configurado.');
    const empresa = texto(req.body.empresa, { max: 200 });
    if (empresa) await db.run('UPDATE empresa SET nome = ? WHERE id = 1', empresa);
    await criarSessao(db, req, res, r.lastInsertRowid);
    res.status(201).json({ ok: true });
  });

  api.post('/auth/entrar', async (req, res) => {
    await limitador.verificar(db, req);
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const usuario = await db.get('SELECT id, senha_hash FROM usuarios WHERE email = ?', email);
    if (!usuario || !conferirSenha(String(req.body.senha ?? ''), usuario.senha_hash)) {
      await limitador.falhou(db, req);
      throw new ErroHttp(401, 'E-mail ou senha incorretos.');
    }
    await limitador.limpar(db, req);
    await criarSessao(db, req, res, usuario.id);
    res.json({ ok: true });
  });

  api.post('/auth/sair', async (req, res) => {
    await encerrarSessao(db, req, res);
    res.json({ ok: true });
  });

  // ---------------------------------------------------- Proposta (pública)
  // Quem tem o link vê a proposta e pode aprová-la. Nada de dados internos:
  // tudo sai de propostaPublica(), montada a partir da visão do cliente.
  const lerLogo = async () => {
    const e = await db.get('SELECT logo, logo_mime FROM empresa WHERE id = 1');
    return e?.logo ? { bytes: Buffer.from(e.logo), mime: e.logo_mime } : null;
  };
  const montarProposta = async (orcId) => {
    const orc = await carregarOrcamento(db, orcId);
    const empresa = await db.get('SELECT * FROM empresa WHERE id = 1');
    const temLogo = Boolean(await db.get('SELECT 1 AS ok FROM empresa WHERE id = 1 AND logo IS NOT NULL'));
    return { orc, empresa, publica: propostaPublica(orc, empresa, { podeAprovar: podeAprovar(orc, dataHoje()), temLogo }) };
  };
  const nomeArquivoPdf = (orc) => {
    const nomeCliente = semAcento(orc.cliente?.nome ?? '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `Orcamento-${formatarNumero(orc.numero)}${nomeCliente ? `-${nomeCliente}` : ''}.pdf`;
  };

  api.get('/publico/propostas/:token', async (req, res) => {
    const orcId = await idPorToken(db, req.params.token);
    await expirarVencidos(db, dataHoje());
    // A própria empresa conferindo o link não conta como visita do cliente.
    if (!(await usuarioDaSessao(db, req))) await registrarVisualizacao(db, orcId);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json((await montarProposta(orcId)).publica);
  });

  api.get('/publico/propostas/:token/logo', async (req, res) => {
    await idPorToken(db, req.params.token);
    const logo = await lerLogo();
    if (!logo) throw naoEncontrado('Nenhuma logo cadastrada.');
    res.type(logo.mime).send(logo.bytes);
  });

  api.get('/publico/propostas/:token/pdf', async (req, res) => {
    const { orc, empresa } = await montarProposta(await idPorToken(db, req.params.token));
    const logo = await lerLogo();
    const pdf = await gerarPdf(visaoCliente(orc, empresa), logo?.bytes ?? null);
    res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="${nomeArquivoPdf(orc)}"`).send(pdf);
  });

  api.post('/publico/propostas/:token/aprovar', async (req, res) => {
    const orcId = await idPorToken(db, req.params.token);
    const nome = texto(req.body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
    if (nome.length < 3) throw invalido('Digite seu nome completo para aprovar.');
    if (req.body.aceite !== true) throw invalido('Confirme que leu e concorda com a proposta.');
    await expirarVencidos(db, dataHoje());
    await aprovarPeloLink(db, orcId, nome, dataHoje());
    res.json((await montarProposta(orcId)).publica);
  });

  // Daqui para baixo, somente usuários autenticados.
  api.use(exigirLogin(obterDb));

  api.put('/conta', async (req, res) => {
    const nome = texto(req.body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
    const email = validarEmail(req.body.email);
    if (await db.get('SELECT 1 AS ok FROM usuarios WHERE email = ? AND id <> ?', email, req.usuario.id)) {
      throw invalido('Este e-mail já está em uso.');
    }
    await db.run('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?', nome, email, req.usuario.id);
    res.json({ ok: true });
  });

  api.put('/conta/senha', async (req, res) => {
    const atual = await db.get('SELECT senha_hash FROM usuarios WHERE id = ?', req.usuario.id);
    if (!conferirSenha(String(req.body.senha_atual ?? ''), atual.senha_hash)) throw invalido('Senha atual incorreta.');
    const nova = validarSenha(req.body.nova_senha);
    await db.run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', gerarHashSenha(nova), req.usuario.id);
    res.json({ ok: true });
  });

  // --------------------------------------------------------------- Dashboard
  api.get('/dashboard', async (_req, res) => {
    await expirarVencidos(db, dataHoje());
    res.json(await resumoDashboard(db, dataHoje()));
  });

  // ---------------------------------------------------------------- Clientes
  const normalizarCliente = (b) => {
    const c = {
      nome: texto(b.nome, { max: 200, obrigatorio: true, campo: 'Nome' }),
      telefone: texto(b.telefone, { max: 40, campo: 'Telefone' }),
      whatsapp: texto(b.whatsapp, { max: 40, campo: 'WhatsApp' }),
      email: texto(b.email, { max: 200, campo: 'E-mail' }),
      cpf_cnpj: texto(b.cpf_cnpj, { max: 30, campo: 'CPF/CNPJ' }),
      endereco: texto(b.endereco, { max: 300, campo: 'Endereço' }),
      cidade: texto(b.cidade, { max: 100, campo: 'Cidade' }),
      estado: texto(b.estado, { max: 50, campo: 'Estado' }),
      observacoes: texto(b.observacoes, { max: 2000, campo: 'Observações' }),
    };
    return {
      ...c,
      nome_busca: semAcento(c.nome),
      telefone_digitos: somenteDigitos(c.telefone),
      whatsapp_digitos: somenteDigitos(c.whatsapp),
    };
  };
  const CAMPOS_CLIENTE = Object.keys(normalizarCliente({ nome: 'x' }));
  const lerCliente = async (clienteId) => {
    const c = await db.get('SELECT * FROM clientes WHERE id = ?', clienteId);
    return c ? SEM_BUSCA(c) : c;
  };

  api.get('/clientes', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const onde = [];
    const params = [];
    if (q) {
      const partes = [`c.nome_busca LIKE ? ESCAPE '\\'`];
      params.push(padraoLike(semAcento(q)));
      const digitos = somenteDigitos(q);
      if (digitos.length >= 2) {
        partes.push(`c.telefone_digitos LIKE ? ESCAPE '\\'`, `c.whatsapp_digitos LIKE ? ESCAPE '\\'`);
        params.push(padraoLike(digitos), padraoLike(digitos));
      }
      onde.push(`(${partes.join(' OR ')})`);
    }
    const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
    const clientes = await db.all(
      `SELECT c.*, COUNT(o.id) AS orcamentos, MAX(o.data) AS ultimo_orcamento,
              COALESCE(SUM(CASE WHEN o.status = 'aprovado' THEN o.total_cents END), 0) AS aprovado_cents
       FROM clientes c LEFT JOIN orcamentos o ON o.cliente_id = c.id
       ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
       GROUP BY c.id ORDER BY lower(c.nome) LIMIT ?`,
      ...params,
      limite,
    );
    res.json(clientes.map(SEM_BUSCA));
  });

  api.post('/clientes', async (req, res) => {
    const c = normalizarCliente(req.body);
    const r = await db.run(
      `INSERT INTO clientes (${CAMPOS_CLIENTE.join(', ')}) VALUES (${CAMPOS_CLIENTE.map(() => '?').join(', ')}) RETURNING id`,
      ...CAMPOS_CLIENTE.map((k) => c[k]),
    );
    res.status(201).json(await lerCliente(r.lastInsertRowid));
  });

  api.get('/clientes/:id', async (req, res) => {
    const cliente = await lerCliente(id(req.params.id));
    if (!cliente) throw naoEncontrado('Cliente não encontrado.');
    cliente.lista_orcamentos = (await listarOrcamentos(db, { cliente_id: cliente.id, limite: 200 })).orcamentos;
    res.json(cliente);
  });

  api.put('/clientes/:id', async (req, res) => {
    const c = normalizarCliente(req.body);
    const r = await db.run(
      `UPDATE clientes SET ${CAMPOS_CLIENTE.map((k) => `${k} = ?`).join(', ')}, atualizado_em = now() WHERE id = ?`,
      ...CAMPOS_CLIENTE.map((k) => c[k]),
      id(req.params.id),
    );
    if (!r.changes) throw naoEncontrado('Cliente não encontrado.');
    res.json(await lerCliente(id(req.params.id)));
  });

  api.delete('/clientes/:id', async (req, res) => {
    const clienteId = id(req.params.id);
    if (await db.get('SELECT 1 AS ok FROM orcamentos WHERE cliente_id = ? LIMIT 1', clienteId)) {
      throw invalido('Este cliente possui orçamentos e não pode ser excluído.');
    }
    const r = await db.run('DELETE FROM clientes WHERE id = ?', clienteId);
    if (!r.changes) throw naoEncontrado('Cliente não encontrado.');
    res.json({ ok: true });
  });

  // ----------------------------------------------------------- Tipos de móveis
  const normalizarTipo = (b) => {
    const metodo = umDe(b.metodo_calculo, Object.keys(METODOS), 'Método de cálculo');
    return {
      nome: texto(b.nome, { max: 100, obrigatorio: true, campo: 'Nome' }),
      nome_cliente: texto(b.nome_cliente, { max: 150, campo: 'Nome no orçamento' }),
      unidade: METODOS[metodo].unidade,
      metodo_calculo: metodo,
      preco_padrao_cents: inteiro(b.preco_padrao_cents, { max: LIMITES.centavos, campo: 'Preço padrão' }),
      ativo: b.ativo === false || b.ativo === 0 ? 0 : 1,
    };
  };
  const CAMPOS_TIPO = ['nome', 'nome_cliente', 'unidade', 'metodo_calculo', 'preco_padrao_cents', 'ativo'];
  const listarTipos = () => db.all('SELECT * FROM tipos_moveis ORDER BY ativo DESC, lower(nome)');

  api.get('/tipos-moveis', async (_req, res) => {
    res.json(await listarTipos());
  });

  api.post('/tipos-moveis', async (req, res) => {
    const t = normalizarTipo(req.body);
    const r = await db.run(
      `INSERT INTO tipos_moveis (${CAMPOS_TIPO.join(', ')}) VALUES (${CAMPOS_TIPO.map(() => '?').join(', ')}) RETURNING id`,
      ...CAMPOS_TIPO.map((k) => t[k]),
    );
    res.status(201).json(await db.get('SELECT * FROM tipos_moveis WHERE id = ?', r.lastInsertRowid));
  });

  api.put('/tipos-moveis/:id', async (req, res) => {
    const t = normalizarTipo(req.body);
    const r = await db.run(
      `UPDATE tipos_moveis SET ${CAMPOS_TIPO.map((k) => `${k} = ?`).join(', ')}, atualizado_em = now() WHERE id = ?`,
      ...CAMPOS_TIPO.map((k) => t[k]),
      id(req.params.id),
    );
    if (!r.changes) throw naoEncontrado('Tipo de móvel não encontrado.');
    res.json(await db.get('SELECT * FROM tipos_moveis WHERE id = ?', id(req.params.id)));
  });

  // Os itens de orçamento guardam nome e preço, então excluir o tipo não
  // altera nenhum orçamento já feito.
  api.delete('/tipos-moveis/:id', async (req, res) => {
    const tipoId = id(req.params.id);
    const r = await db.transacao(async (t) => {
      await t.run('UPDATE orcamento_itens SET tipo_movel_id = NULL WHERE tipo_movel_id = ?', tipoId);
      return t.run('DELETE FROM tipos_moveis WHERE id = ?', tipoId);
    });
    if (!r.changes) throw naoEncontrado('Tipo de móvel não encontrado.');
    res.json({ ok: true });
  });

  // Atualização de vários preços de uma vez (Configurações → Preços).
  api.put('/precos', async (req, res) => {
    const precos = Array.isArray(req.body.precos) ? req.body.precos : [];
    const validados = precos.map((p) => ({
      id: id(p.id),
      preco: inteiro(p.preco_padrao_cents, { max: LIMITES.centavos, campo: 'Preço' }),
    }));
    await db.transacao(async (t) => {
      for (const p of validados) {
        await t.run(
          `UPDATE tipos_moveis SET preco_padrao_cents = ?, atualizado_em = now() WHERE id = ? AND preco_padrao_cents <> ?`,
          p.preco,
          p.id,
          p.preco,
        );
      }
    });
    res.json(await listarTipos());
  });

  // ------------------------------------------------------ Condições de pagamento
  const normalizarCondicao = (b) => {
    const tipo = umDe(b.entrada_tipo ?? 'nenhum', TIPOS_AJUSTE, 'Tipo de entrada');
    return {
      descricao: texto(b.descricao, { max: 300, obrigatorio: true, campo: 'Descrição' }),
      entrada_tipo: tipo,
      entrada_valor:
        tipo === 'nenhum'
          ? 0
          : inteiro(b.entrada_valor ?? 0, {
              max: tipo === 'percentual' ? LIMITES.percentual : LIMITES.centavos,
              campo: 'Entrada',
            }),
      parcelas: inteiro(b.parcelas ?? 0, { max: LIMITES.parcelas, campo: 'Parcelas' }),
      ativo: b.ativo === false || b.ativo === 0 ? 0 : 1,
    };
  };
  const CAMPOS_CONDICAO = ['descricao', 'entrada_tipo', 'entrada_valor', 'parcelas', 'ativo'];

  api.get('/condicoes-pagamento', async (_req, res) => {
    res.json(await db.all('SELECT * FROM condicoes_pagamento ORDER BY ativo DESC, id'));
  });

  api.post('/condicoes-pagamento', async (req, res) => {
    const c = normalizarCondicao(req.body);
    const r = await db.run(
      `INSERT INTO condicoes_pagamento (${CAMPOS_CONDICAO.join(', ')}) VALUES (${CAMPOS_CONDICAO.map(() => '?').join(', ')}) RETURNING id`,
      ...CAMPOS_CONDICAO.map((k) => c[k]),
    );
    res.status(201).json(await db.get('SELECT * FROM condicoes_pagamento WHERE id = ?', r.lastInsertRowid));
  });

  api.put('/condicoes-pagamento/:id', async (req, res) => {
    const c = normalizarCondicao(req.body);
    const r = await db.run(
      `UPDATE condicoes_pagamento SET ${CAMPOS_CONDICAO.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...CAMPOS_CONDICAO.map((k) => c[k]),
      id(req.params.id),
    );
    if (!r.changes) throw naoEncontrado('Condição não encontrada.');
    res.json(await db.get('SELECT * FROM condicoes_pagamento WHERE id = ?', id(req.params.id)));
  });

  api.delete('/condicoes-pagamento/:id', async (req, res) => {
    const condicaoId = id(req.params.id);
    const r = await db.transacao(async (t) => {
      await t.run('UPDATE empresa SET condicao_pagamento_padrao_id = NULL WHERE condicao_pagamento_padrao_id = ?', condicaoId);
      return t.run('DELETE FROM condicoes_pagamento WHERE id = ?', condicaoId);
    });
    if (!r.changes) throw naoEncontrado('Condição não encontrada.');
    res.json({ ok: true });
  });

  // ----------------------------------------------------------------- Empresa
  const lerEmpresa = async () => {
    const { logo, ambientes_sugeridos, ...e } = await db.get('SELECT * FROM empresa WHERE id = 1');
    return { ...e, tem_logo: Boolean(logo), ambientes_sugeridos: lerSugestoesAmbiente(ambientes_sugeridos) };
  };

  api.get('/empresa', async (_req, res) => res.json(await lerEmpresa()));

  api.put('/empresa', async (req, res) => {
    const b = req.body;
    let condicaoId = inteiro(b.condicao_pagamento_padrao_id, { min: 1, opcional: true, campo: 'Condição padrão' });
    if (condicaoId && !(await db.get('SELECT 1 AS ok FROM condicoes_pagamento WHERE id = ?', condicaoId))) condicaoId = null;
    const e = {
      nome: texto(b.nome, { max: 200, campo: 'Nome da empresa' }),
      cnpj: texto(b.cnpj, { max: 30, campo: 'CNPJ' }),
      telefone: texto(b.telefone, { max: 40, campo: 'Telefone' }),
      whatsapp: texto(b.whatsapp, { max: 40, campo: 'WhatsApp' }),
      email: texto(b.email, { max: 200, campo: 'E-mail' }),
      endereco: texto(b.endereco, { max: 300, campo: 'Endereço' }),
      cidade: texto(b.cidade, { max: 100, campo: 'Cidade' }),
      estado: texto(b.estado, { max: 50, campo: 'Estado' }),
      texto_padrao: texto(b.texto_padrao, { max: 5000, campo: 'Texto padrão' }),
      condicao_pagamento_padrao_id: condicaoId,
      prazo_padrao: texto(b.prazo_padrao, { max: 200, campo: 'Prazo padrão' }),
      validade_padrao_dias: inteiro(b.validade_padrao_dias ?? 10, { max: 3650, campo: 'Validade padrão' }),
      mensagem_whatsapp: texto(b.mensagem_whatsapp, { max: 1000, campo: 'Mensagem do WhatsApp' }),
    };
    const campos = Object.keys(e);
    await db.run(`UPDATE empresa SET ${campos.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`, ...campos.map((k) => e[k]));
    res.json(await lerEmpresa());
  });

  // Lista inteira de sugestões de ambiente (nomes repetidos são ignorados).
  api.put('/empresa/ambientes-sugeridos', async (req, res) => {
    const lista = req.body.ambientes;
    if (!Array.isArray(lista)) throw invalido('Envie a lista de ambientes.');
    if (lista.length > MAX_SUGESTOES_AMBIENTE) throw invalido(`Guarde no máximo ${MAX_SUGESTOES_AMBIENTE} sugestões de ambiente.`);
    const vistos = new Set();
    const nomes = [];
    for (const valor of lista) {
      const nome = texto(valor, { max: 100, campo: 'Nome do ambiente' });
      if (!nome || vistos.has(semAcento(nome))) continue;
      vistos.add(semAcento(nome));
      nomes.push(nome);
    }
    await db.run('UPDATE empresa SET ambientes_sugeridos = ? WHERE id = 1', JSON.stringify(nomes));
    res.json(await lerEmpresa());
  });

  api.put('/empresa/logo', async (req, res) => {
    const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.imagem ?? ''));
    if (!m) throw invalido('Envie uma imagem PNG ou JPG.');
    const bytes = Buffer.from(m[2], 'base64');
    const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const jpg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (!(png || jpg)) throw invalido('Arquivo de imagem inválido. Use PNG ou JPG.');
    if (bytes.length > 2 * 1024 * 1024) throw invalido('A logo deve ter no máximo 2 MB.');
    await db.run(
      `UPDATE empresa SET logo = ?, logo_mime = ?, logo_atualizado_em = now() WHERE id = 1`,
      bytes,
      png ? 'image/png' : 'image/jpeg',
    );
    res.json(await lerEmpresa());
  });

  api.delete('/empresa/logo', async (_req, res) => {
    await db.run('UPDATE empresa SET logo = NULL, logo_mime = NULL, logo_atualizado_em = NULL WHERE id = 1');
    res.json(await lerEmpresa());
  });

  api.get('/empresa/logo', async (_req, res) => {
    const logo = await lerLogo();
    if (!logo) throw naoEncontrado('Nenhuma logo cadastrada.');
    res.type(logo.mime).send(logo.bytes);
  });

  // -------------------------------------------------------------- Orçamentos
  const dinheiroOpcional = (v) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  api.get('/orcamentos', async (req, res) => {
    await expirarVencidos(db, dataHoje());
    res.json(
      await listarOrcamentos(db, {
        q: req.query.q,
        status: req.query.status,
        de: req.query.de,
        ate: req.query.ate,
        min: dinheiroOpcional(req.query.min),
        max: dinheiroOpcional(req.query.max),
        limite: req.query.limite,
        deslocamento: req.query.deslocamento,
      }),
    );
  });

  // Valores iniciais de um novo orçamento, a partir das configurações da empresa.
  api.get('/orcamentos/modelo', async (_req, res) => {
    const e = await db.get('SELECT * FROM empresa WHERE id = 1');
    const condicao = e.condicao_pagamento_padrao_id
      ? await db.get('SELECT * FROM condicoes_pagamento WHERE id = ?', e.condicao_pagamento_padrao_id)
      : null;
    res.json({
      data: dataHoje(),
      validade_dias: e.validade_padrao_dias,
      status: 'rascunho',
      itens: [],
      servicos: [],
      desconto_tipo: 'nenhum',
      desconto_valor: 0,
      acrescimo_descricao: '',
      acrescimo_tipo: 'nenhum',
      acrescimo_valor: 0,
      pagamento_descricao: condicao?.descricao ?? '',
      pagamento_entrada_tipo: condicao?.entrada_tipo ?? 'nenhum',
      pagamento_entrada_valor: condicao?.entrada_valor ?? 0,
      pagamento_parcelas: condicao?.parcelas ?? 0,
      prazo_entrega: e.prazo_padrao,
      observacoes: e.texto_padrao,
      observacoes_internas: '',
    });
  });

  api.post('/orcamentos', async (req, res) => {
    const novoId = await criarOrcamento(db, req.body, req.usuario.id);
    res.status(201).json(await carregarOrcamento(db, novoId));
  });

  api.get('/orcamentos/:id', async (req, res) => {
    await expirarVencidos(db, dataHoje());
    const orc = await carregarOrcamento(db, id(req.params.id));
    if (!orc) throw naoEncontrado('Orçamento não encontrado.');
    res.json(orc);
  });

  api.put('/orcamentos/:id', async (req, res) => {
    const orcId = await atualizarOrcamento(db, id(req.params.id), req.body, req.usuario.id);
    res.json(await carregarOrcamento(db, orcId));
  });

  api.patch('/orcamentos/:id/status', async (req, res) => {
    await alterarStatus(db, id(req.params.id), req.body.status, req.usuario.id);
    res.json(await carregarOrcamento(db, id(req.params.id)));
  });

  api.post('/orcamentos/:id/duplicar', async (req, res) => {
    const novoId = await duplicarOrcamento(db, id(req.params.id), req.usuario.id, dataHoje());
    res.status(201).json(await carregarOrcamento(db, novoId));
  });

  api.get('/orcamentos/:id/historico', async (req, res) => {
    const orcId = id(req.params.id);
    if (!(await db.get('SELECT 1 AS ok FROM orcamentos WHERE id = ?', orcId))) throw naoEncontrado('Orçamento não encontrado.');
    res.json(await listarHistorico(db, orcId));
  });

  api.get('/orcamentos/:id/pdf', async (req, res) => {
    const orc = await carregarOrcamento(db, id(req.params.id));
    if (!orc) throw naoEncontrado('Orçamento não encontrado.');
    const empresa = await db.get('SELECT * FROM empresa WHERE id = 1');
    const logo = await lerLogo();
    const pdf = await gerarPdf(visaoCliente(orc, empresa), logo?.bytes ?? null);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `${req.query.baixar ? 'attachment' : 'inline'}; filename="${nomeArquivoPdf(orc)}"`)
      .send(pdf);
  });

  // Endereço da proposta para mandar ao cliente (criado na primeira vez).
  api.post('/orcamentos/:id/link', async (req, res) => {
    const token = await garantirToken(db, id(req.params.id));
    res.json({ token, caminho: `/p/${token}` });
  });

  api.use((_req, _res, next) => next(naoEncontrado('Endereço não encontrado.')));

  // ------------------------------------------------------------------- Erros
  app.use((erro, _req, res, _next) => {
    if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message });
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados inválidos.' });
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo muito grande.' });
    console.error(erro);
    res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  });

  return app;
}

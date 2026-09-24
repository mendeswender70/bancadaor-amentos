import express from 'express';
import { fileURLToPath } from 'node:url';
import { METODOS, TIPOS_AJUSTE, LIMITES, formatarNumero } from '../shared/calc.js';
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
import { abrirBanco, semAcento, somenteDigitos, transacao } from './db.js';
import {
  alterarStatus,
  atualizarOrcamento,
  carregarOrcamento,
  criarOrcamento,
  duplicarOrcamento,
  expirarVencidos,
  listarHistorico,
  listarOrcamentos,
  resumoDashboard,
} from './orcamentos.js';
import { gerarPdf } from './pdf.js';
import { ErroHttp, hoje, id, inteiro, invalido, naoEncontrado, texto, umDe } from './validacao.js';
import { visaoCliente } from './visaoCliente.js';

const pasta = (relativo) => fileURLToPath(new URL(relativo, import.meta.url));
const semPrototipo = (linha) => (linha ? { ...linha } : linha);
const padraoLike = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function criarApp({ caminhoBanco = ':memory:', dataHoje = hoje } = {}) {
  const db = abrirBanco(caminhoBanco);
  const app = express();
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.locals.db = db;

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
  app.use('/shared', express.static(pasta('../shared')));

  const api = express.Router();
  app.use('/api', api);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '4mb' }));
  api.use(exigirCabecalhoFetch);

  // ------------------------------------------------------------ Autenticação
  const limitador = criarLimitadorLogin();
  const existeUsuario = () => Boolean(db.prepare('SELECT 1 FROM usuarios LIMIT 1').get());

  api.get('/auth/estado', (req, res) => {
    res.json({ precisa_configurar: !existeUsuario(), usuario: usuarioDaSessao(db, req) });
  });

  // Primeiro acesso: cria o administrador. Depois disso, a rota fica fechada.
  api.post('/auth/configurar', (req, res) => {
    if (existeUsuario()) throw new ErroHttp(403, 'O sistema já foi configurado.');
    const nome = texto(req.body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
    const email = validarEmail(req.body.email);
    const senha = validarSenha(req.body.senha);
    const r = db
      .prepare(`INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES (?, ?, ?, 'administrador')`)
      .run(nome, email, gerarHashSenha(senha));
    const empresa = texto(req.body.empresa, { max: 200 });
    if (empresa) db.prepare('UPDATE empresa SET nome = ? WHERE id = 1').run(empresa);
    criarSessao(db, req, res, Number(r.lastInsertRowid));
    res.status(201).json({ ok: true });
  });

  api.post('/auth/entrar', (req, res) => {
    limitador.verificar(req);
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const usuario = db.prepare('SELECT id, senha_hash FROM usuarios WHERE email = ?').get(email);
    if (!usuario || !conferirSenha(String(req.body.senha ?? ''), usuario.senha_hash)) {
      limitador.falhou(req);
      throw new ErroHttp(401, 'E-mail ou senha incorretos.');
    }
    limitador.limpar(req);
    criarSessao(db, req, res, usuario.id);
    res.json({ ok: true });
  });

  api.post('/auth/sair', (req, res) => {
    encerrarSessao(db, req, res);
    res.json({ ok: true });
  });

  // Daqui para baixo, somente usuários autenticados.
  api.use(exigirLogin(db));

  api.put('/conta', (req, res) => {
    const nome = texto(req.body.nome, { max: 100, obrigatorio: true, campo: 'Nome' });
    const email = validarEmail(req.body.email);
    const outro = db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND id <> ?').get(email, req.usuario.id);
    if (outro) throw invalido('Este e-mail já está em uso.');
    db.prepare('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?').run(nome, email, req.usuario.id);
    res.json({ ok: true });
  });

  api.put('/conta/senha', (req, res) => {
    const atual = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!conferirSenha(String(req.body.senha_atual ?? ''), atual.senha_hash)) throw invalido('Senha atual incorreta.');
    const nova = validarSenha(req.body.nova_senha);
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(gerarHashSenha(nova), req.usuario.id);
    res.json({ ok: true });
  });

  // --------------------------------------------------------------- Dashboard
  api.get('/dashboard', (_req, res) => {
    expirarVencidos(db, dataHoje());
    res.json(resumoDashboard(db, dataHoje()));
  });

  // ---------------------------------------------------------------- Clientes
  const normalizarCliente = (b) => ({
    nome: texto(b.nome, { max: 200, obrigatorio: true, campo: 'Nome' }),
    telefone: texto(b.telefone, { max: 40, campo: 'Telefone' }),
    whatsapp: texto(b.whatsapp, { max: 40, campo: 'WhatsApp' }),
    email: texto(b.email, { max: 200, campo: 'E-mail' }),
    cpf_cnpj: texto(b.cpf_cnpj, { max: 30, campo: 'CPF/CNPJ' }),
    endereco: texto(b.endereco, { max: 300, campo: 'Endereço' }),
    cidade: texto(b.cidade, { max: 100, campo: 'Cidade' }),
    estado: texto(b.estado, { max: 50, campo: 'Estado' }),
    observacoes: texto(b.observacoes, { max: 2000, campo: 'Observações' }),
  });
  const CAMPOS_CLIENTE = Object.keys(normalizarCliente({ nome: 'x' }));

  api.get('/clientes', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const onde = [];
    const params = [];
    if (q) {
      const partes = [`sem_acento(c.nome) LIKE ? ESCAPE '\\'`];
      params.push(padraoLike(semAcento(q)));
      const digitos = somenteDigitos(q);
      if (digitos.length >= 2) {
        partes.push(`digitos(c.telefone) LIKE ? ESCAPE '\\'`, `digitos(c.whatsapp) LIKE ? ESCAPE '\\'`);
        params.push(padraoLike(digitos), padraoLike(digitos));
      }
      onde.push(`(${partes.join(' OR ')})`);
    }
    const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
    const clientes = db
      .prepare(
        `SELECT c.*, COUNT(o.id) AS orcamentos, MAX(o.data) AS ultimo_orcamento
         FROM clientes c LEFT JOIN orcamentos o ON o.cliente_id = c.id
         ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
         GROUP BY c.id ORDER BY c.nome COLLATE NOCASE LIMIT ?`,
      )
      .all(...params, limite)
      .map(semPrototipo);
    res.json(clientes);
  });

  api.post('/clientes', (req, res) => {
    const c = normalizarCliente(req.body);
    const r = db
      .prepare(`INSERT INTO clientes (${CAMPOS_CLIENTE.join(', ')}) VALUES (${CAMPOS_CLIENTE.map(() => '?').join(', ')})`)
      .run(...CAMPOS_CLIENTE.map((k) => c[k]));
    res.status(201).json(semPrototipo(db.prepare('SELECT * FROM clientes WHERE id = ?').get(r.lastInsertRowid)));
  });

  api.get('/clientes/:id', (req, res) => {
    const cliente = semPrototipo(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id(req.params.id)));
    if (!cliente) throw naoEncontrado('Cliente não encontrado.');
    cliente.lista_orcamentos = listarOrcamentos(db, { cliente_id: cliente.id, limite: 200 }).orcamentos;
    res.json(cliente);
  });

  api.put('/clientes/:id', (req, res) => {
    const c = normalizarCliente(req.body);
    const r = db
      .prepare(
        `UPDATE clientes SET ${CAMPOS_CLIENTE.map((k) => `${k} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`,
      )
      .run(...CAMPOS_CLIENTE.map((k) => c[k]), id(req.params.id));
    if (!r.changes) throw naoEncontrado('Cliente não encontrado.');
    res.json(semPrototipo(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id(req.params.id))));
  });

  api.delete('/clientes/:id', (req, res) => {
    const clienteId = id(req.params.id);
    if (db.prepare('SELECT 1 FROM orcamentos WHERE cliente_id = ? LIMIT 1').get(clienteId)) {
      throw invalido('Este cliente possui orçamentos e não pode ser excluído.');
    }
    const r = db.prepare('DELETE FROM clientes WHERE id = ?').run(clienteId);
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

  api.get('/tipos-moveis', (_req, res) => {
    res.json(db.prepare('SELECT * FROM tipos_moveis ORDER BY ativo DESC, nome COLLATE NOCASE').all().map(semPrototipo));
  });

  api.post('/tipos-moveis', (req, res) => {
    const t = normalizarTipo(req.body);
    const r = db
      .prepare(`INSERT INTO tipos_moveis (${CAMPOS_TIPO.join(', ')}) VALUES (${CAMPOS_TIPO.map(() => '?').join(', ')})`)
      .run(...CAMPOS_TIPO.map((k) => t[k]));
    res.status(201).json(semPrototipo(db.prepare('SELECT * FROM tipos_moveis WHERE id = ?').get(r.lastInsertRowid)));
  });

  api.put('/tipos-moveis/:id', (req, res) => {
    const t = normalizarTipo(req.body);
    const r = db
      .prepare(
        `UPDATE tipos_moveis SET ${CAMPOS_TIPO.map((k) => `${k} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`,
      )
      .run(...CAMPOS_TIPO.map((k) => t[k]), id(req.params.id));
    if (!r.changes) throw naoEncontrado('Tipo de móvel não encontrado.');
    res.json(semPrototipo(db.prepare('SELECT * FROM tipos_moveis WHERE id = ?').get(id(req.params.id))));
  });

  // Os itens de orçamento guardam nome e preço, então excluir o tipo não
  // altera nenhum orçamento já feito.
  api.delete('/tipos-moveis/:id', (req, res) => {
    const r = db.prepare('DELETE FROM tipos_moveis WHERE id = ?').run(id(req.params.id));
    if (!r.changes) throw naoEncontrado('Tipo de móvel não encontrado.');
    res.json({ ok: true });
  });

  // Atualização de vários preços de uma vez (Configurações → Preços).
  api.put('/precos', (req, res) => {
    const precos = Array.isArray(req.body.precos) ? req.body.precos : [];
    const atualizar = db.prepare(
      `UPDATE tipos_moveis SET preco_padrao_cents = ?, atualizado_em = datetime('now') WHERE id = ? AND preco_padrao_cents <> ?`,
    );
    const validados = precos.map((p) => ({
      id: id(p.id),
      preco: inteiro(p.preco_padrao_cents, { max: LIMITES.centavos, campo: 'Preço' }),
    }));
    transacao(db, () => {
      for (const p of validados) atualizar.run(p.preco, p.id, p.preco);
    });
    res.json(db.prepare('SELECT * FROM tipos_moveis ORDER BY ativo DESC, nome COLLATE NOCASE').all().map(semPrototipo));
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

  api.get('/condicoes-pagamento', (_req, res) => {
    res.json(db.prepare('SELECT * FROM condicoes_pagamento ORDER BY ativo DESC, id').all().map(semPrototipo));
  });

  api.post('/condicoes-pagamento', (req, res) => {
    const c = normalizarCondicao(req.body);
    const r = db
      .prepare(
        `INSERT INTO condicoes_pagamento (${CAMPOS_CONDICAO.join(', ')}) VALUES (${CAMPOS_CONDICAO.map(() => '?').join(', ')})`,
      )
      .run(...CAMPOS_CONDICAO.map((k) => c[k]));
    res.status(201).json(semPrototipo(db.prepare('SELECT * FROM condicoes_pagamento WHERE id = ?').get(r.lastInsertRowid)));
  });

  api.put('/condicoes-pagamento/:id', (req, res) => {
    const c = normalizarCondicao(req.body);
    const r = db
      .prepare(`UPDATE condicoes_pagamento SET ${CAMPOS_CONDICAO.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...CAMPOS_CONDICAO.map((k) => c[k]), id(req.params.id));
    if (!r.changes) throw naoEncontrado('Condição não encontrada.');
    res.json(semPrototipo(db.prepare('SELECT * FROM condicoes_pagamento WHERE id = ?').get(id(req.params.id))));
  });

  api.delete('/condicoes-pagamento/:id', (req, res) => {
    const r = db.prepare('DELETE FROM condicoes_pagamento WHERE id = ?').run(id(req.params.id));
    if (!r.changes) throw naoEncontrado('Condição não encontrada.');
    res.json({ ok: true });
  });

  // ----------------------------------------------------------------- Empresa
  const lerEmpresa = () => {
    const e = semPrototipo(db.prepare('SELECT * FROM empresa WHERE id = 1').get());
    const temLogo = Boolean(e.logo);
    delete e.logo;
    return { ...e, tem_logo: temLogo };
  };

  api.get('/empresa', (_req, res) => res.json(lerEmpresa()));

  api.put('/empresa', (req, res) => {
    const b = req.body;
    let condicaoId = inteiro(b.condicao_pagamento_padrao_id, { min: 1, opcional: true, campo: 'Condição padrão' });
    if (condicaoId && !db.prepare('SELECT 1 FROM condicoes_pagamento WHERE id = ?').get(condicaoId)) condicaoId = null;
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
    db.prepare(`UPDATE empresa SET ${campos.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`).run(
      ...campos.map((k) => e[k]),
    );
    res.json(lerEmpresa());
  });

  api.put('/empresa/logo', (req, res) => {
    const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.imagem ?? ''));
    if (!m) throw invalido('Envie uma imagem PNG ou JPG.');
    const bytes = Buffer.from(m[2], 'base64');
    const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const jpg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (!(png || jpg)) throw invalido('Arquivo de imagem inválido. Use PNG ou JPG.');
    if (bytes.length > 2 * 1024 * 1024) throw invalido('A logo deve ter no máximo 2 MB.');
    db.prepare(`UPDATE empresa SET logo = ?, logo_mime = ?, logo_atualizado_em = datetime('now') WHERE id = 1`).run(
      bytes,
      png ? 'image/png' : 'image/jpeg',
    );
    res.json(lerEmpresa());
  });

  api.delete('/empresa/logo', (_req, res) => {
    db.prepare('UPDATE empresa SET logo = NULL, logo_mime = NULL, logo_atualizado_em = NULL WHERE id = 1').run();
    res.json(lerEmpresa());
  });

  api.get('/empresa/logo', (_req, res) => {
    const e = db.prepare('SELECT logo, logo_mime FROM empresa WHERE id = 1').get();
    if (!e.logo) throw naoEncontrado('Nenhuma logo cadastrada.');
    res.type(e.logo_mime).send(Buffer.from(e.logo));
  });

  // -------------------------------------------------------------- Orçamentos
  const dinheiroOpcional = (v) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  api.get('/orcamentos', (req, res) => {
    expirarVencidos(db, dataHoje());
    res.json(
      listarOrcamentos(db, {
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
  api.get('/orcamentos/modelo', (_req, res) => {
    const e = db.prepare('SELECT * FROM empresa WHERE id = 1').get();
    const condicao = e.condicao_pagamento_padrao_id
      ? db.prepare('SELECT * FROM condicoes_pagamento WHERE id = ?').get(e.condicao_pagamento_padrao_id)
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

  api.post('/orcamentos', (req, res) => {
    const novoId = criarOrcamento(db, req.body, req.usuario.id);
    res.status(201).json(carregarOrcamento(db, novoId));
  });

  api.get('/orcamentos/:id', (req, res) => {
    expirarVencidos(db, dataHoje());
    const orc = carregarOrcamento(db, id(req.params.id));
    if (!orc) throw naoEncontrado('Orçamento não encontrado.');
    res.json(orc);
  });

  api.put('/orcamentos/:id', (req, res) => {
    const orcId = atualizarOrcamento(db, id(req.params.id), req.body, req.usuario.id);
    res.json(carregarOrcamento(db, orcId));
  });

  api.patch('/orcamentos/:id/status', (req, res) => {
    alterarStatus(db, id(req.params.id), req.body.status, req.usuario.id);
    res.json(carregarOrcamento(db, id(req.params.id)));
  });

  api.post('/orcamentos/:id/duplicar', (req, res) => {
    const novoId = duplicarOrcamento(db, id(req.params.id), req.usuario.id, dataHoje());
    res.status(201).json(carregarOrcamento(db, novoId));
  });

  api.get('/orcamentos/:id/historico', (req, res) => {
    const orcId = id(req.params.id);
    if (!db.prepare('SELECT 1 FROM orcamentos WHERE id = ?').get(orcId)) throw naoEncontrado('Orçamento não encontrado.');
    res.json(listarHistorico(db, orcId));
  });

  api.get('/orcamentos/:id/pdf', async (req, res) => {
    const orc = carregarOrcamento(db, id(req.params.id));
    if (!orc) throw naoEncontrado('Orçamento não encontrado.');
    const empresa = db.prepare('SELECT * FROM empresa WHERE id = 1').get();
    const pdf = await gerarPdf(visaoCliente(orc, empresa), empresa.logo ? Buffer.from(empresa.logo) : null);
    const nomeCliente = semAcento(orc.cliente?.nome ?? '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const arquivo = `Orcamento-${formatarNumero(orc.numero)}${nomeCliente ? `-${nomeCliente}` : ''}.pdf`;
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `${req.query.baixar ? 'attachment' : 'inline'}; filename="${arquivo}"`)
      .send(pdf);
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

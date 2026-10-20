import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { AMBIENTES_SUGERIDOS, METODOS, TIPOS_AJUSTE, LIMITES, formatarNumero } from '../public/shared/calc.js';
import { novidades } from '../public/js/novidades.js';
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
  listarLembretesAutomaticos,
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

function segredoCorreto(recebido, esperado) {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(String(recebido));
  const b = Buffer.from(String(esperado));
  return a.length === b.length && timingSafeEqual(a, b);
}

function configurarVapid() {
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) throw new ErroHttp(503, 'As notificações push ainda não foram configuradas.');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://esquadro.site', publica, privada);
}

async function enviarPushInscritos(db, { titulo, texto, caminho = '/', tag = 'esquadro-atualizacao' }) {
  const inscricoes = await db.all('SELECT endpoint, chave_p256dh, chave_auth FROM inscricoes_push');
  if (!inscricoes.length) return { inscricoes: 0, enviadas: 0, expiradas: 0, falhas: 0 };

  configurarVapid();
  const payload = JSON.stringify({ titulo, texto, caminho, tag });
  const resultados = await Promise.allSettled(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.chave_p256dh, auth: inscricao.chave_auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        return 'enviada';
      } catch (erro) {
        if ([404, 410].includes(erro.statusCode)) {
          await db.run('DELETE FROM inscricoes_push WHERE endpoint = ?', inscricao.endpoint);
          return 'expirada';
        }
        throw erro;
      }
    }),
  );
  const resumo = { inscricoes: inscricoes.length, enviadas: 0, expiradas: 0, falhas: 0 };
  for (const resultado of resultados) {
    if (resultado.status === 'rejected') resumo.falhas++;
    else if (resultado.value === 'enviada') resumo.enviadas++;
    else if (resultado.value === 'expirada') resumo.expiradas++;
  }
  return resumo;
}

async function tentarNotificar(db, notificacao) {
  try {
    await enviarPushInscritos(db, notificacao);
  } catch (erro) {
    // A proposta do cliente não deve falhar só porque o serviço push está indisponível.
    console.error('Não foi possível enviar a notificação push.', erro.statusCode || erro.code || 'erro desconhecido');
  }
}

function endpointPushValido(url) {
  const host = url.hostname.toLowerCase();
  const servidorPush =
    host === 'fcm.googleapis.com' ||
    host === 'web.push.apple.com' ||
    host === 'push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host.endsWith('.notify.windows.com');
  return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && servidorPush;
}

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
  const montarProposta = (orcId) => db.transacao(async (t) => {
    // Mantém conteúdo e versão consistentes enquanto os itens são carregados.
    await t.get('SELECT id FROM orcamentos WHERE id = ? FOR SHARE', orcId);
    const orc = await carregarOrcamento(t, orcId);
    const empresa = await t.get('SELECT * FROM empresa WHERE id = 1');
    const temLogo = Boolean(empresa.logo);
    return { orc, empresa, publica: propostaPublica(orc, empresa, { podeAprovar: podeAprovar(orc, dataHoje()), temLogo }) };
  });
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
    const primeiraVisualizacao = !(await usuarioDaSessao(db, req)) && await registrarVisualizacao(db, orcId);
    const proposta = await montarProposta(orcId);
    if (primeiraVisualizacao) {
      await tentarNotificar(db, {
        titulo: 'Proposta visualizada',
        texto: `O cliente abriu o orçamento nº ${proposta.publica.numero} pela primeira vez.`,
        caminho: `/#/orcamentos/${orcId}`,
        tag: `esquadro-proposta-${orcId}-visualizada`,
      });
    }
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json(proposta.publica);
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
    const aprovadaAgora = await aprovarPeloLink(db, orcId, nome, dataHoje(), req.body.versao_proposta);
    const proposta = await montarProposta(orcId);
    if (aprovadaAgora) {
      await tentarNotificar(db, {
        titulo: 'Proposta aprovada',
        texto: `O cliente aprovou o orçamento nº ${proposta.publica.numero}.`,
        caminho: `/#/orcamentos/${orcId}`,
        tag: `esquadro-proposta-${orcId}-aprovada`,
      });
    }
    res.json(proposta.publica);
  });

  // O GitHub chama esta rota após um deploy de produção concluído.
  api.post('/deploy/notificar', async (req, res) => {
    const segredo = process.env.DEPLOY_NOTIFICATION_SECRET;
    if (!segredo) throw new ErroHttp(503, 'O aviso automático de deploy ainda não foi configurado.');
    const autorizacao = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!segredoCorreto(autorizacao, segredo)) throw new ErroHttp(401, 'Não autorizado.');

    const deploymentId = texto(req.body.deployment_id, { max: 200, obrigatorio: true, campo: 'Deploy' });
    const commit = texto(req.body.commit, { max: 100, campo: 'Commit' });
    const registro = await db.run(
      `INSERT INTO notificacoes_deploy (deployment_id, commit_sha) VALUES (?, ?)
       ON CONFLICT (deployment_id) DO UPDATE SET commit_sha = EXCLUDED.commit_sha, estado = 'enviando', iniciado_em = now(), enviado_em = NULL
       WHERE notificacoes_deploy.estado = 'erro' OR notificacoes_deploy.iniciado_em < now() - interval '5 minutes'`,
      deploymentId,
      commit,
    );
    if (!registro.changes) return res.json({ ok: true, duplicado: true });

    try {
      const resultado = await enviarPushInscritos(db, {
        titulo: 'Atualização no esquadro',
        texto: 'Uma nova versão está disponível. Abra o app para ver as novidades.',
      });
      await db.run("UPDATE notificacoes_deploy SET estado = 'enviado', enviado_em = now() WHERE deployment_id = ?", deploymentId);
      res.json({ ok: true, ...resultado });
    } catch (erro) {
      await db.run("UPDATE notificacoes_deploy SET estado = 'erro' WHERE deployment_id = ?", deploymentId).catch(() => {});
      throw erro;
    }
  });

  // O GitHub Actions chama esta rota diariamente para lembrar propostas pendentes.
  api.post('/lembretes/notificar', async (req, res) => {
    const segredo = process.env.DEPLOY_NOTIFICATION_SECRET;
    if (!segredo) throw new ErroHttp(503, 'Os lembretes automáticos ainda não foram configurados.');
    const autorizacao = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!segredoCorreto(autorizacao, segredo)) throw new ErroHttp(401, 'Não autorizado.');

    const dataAtual = dataHoje();
    await expirarVencidos(db, dataAtual);
    const lembretes = await listarLembretesAutomaticos(db, dataAtual);
    const resumo = { encontrados: lembretes.length, processados: 0, duplicados: 0, falhas: 0, falhas_push: 0 };
    for (const lembrete of lembretes) {
      const registro = await db.run(
        `INSERT INTO notificacoes_lembrete (orcamento_id, tipo, referencia)
         VALUES (?, ?, ?)
         ON CONFLICT (orcamento_id, tipo, referencia) DO UPDATE
         SET estado = 'enviando', iniciado_em = now(), enviado_em = NULL
         WHERE notificacoes_lembrete.estado = 'erro'
            OR notificacoes_lembrete.iniciado_em < now() - interval '5 minutes'`,
        lembrete.id,
        lembrete.tipo,
        lembrete.referencia,
      );
      if (!registro.changes) {
        resumo.duplicados++;
        continue;
      }

      try {
        const vencimento = lembrete.dias_para_vencer === 0
          ? 'vence hoje'
          : lembrete.dias_para_vencer === 1
            ? 'vence amanhã'
            : `vence em ${lembrete.dias_para_vencer} dias`;
        const notificacao = lembrete.tipo === 'sem_resposta'
          ? {
              titulo: 'Proposta aguardando resposta',
              texto: `O orçamento nº ${lembrete.numero} foi enviado há pelo menos 5 dias e ainda aguarda retorno.`,
            }
          : {
              titulo: 'Proposta perto do vencimento',
              texto: `O orçamento nº ${lembrete.numero} ${vencimento}.`,
            };
        const resultado = await enviarPushInscritos(db, {
          ...notificacao,
          caminho: `/#/orcamentos/${lembrete.id}`,
          tag: `esquadro-lembrete-${lembrete.tipo}-${lembrete.id}`,
        });
        resumo.processados++;
        resumo.falhas_push += resultado.falhas;
        await db.run(
          `UPDATE notificacoes_lembrete SET estado = 'enviado', enviado_em = now()
           WHERE orcamento_id = ? AND tipo = ? AND referencia = ?`,
          lembrete.id,
          lembrete.tipo,
          lembrete.referencia,
        );
      } catch {
        resumo.falhas++;
        await db.run(
          `UPDATE notificacoes_lembrete SET estado = 'erro'
           WHERE orcamento_id = ? AND tipo = ? AND referencia = ?`,
          lembrete.id,
          lembrete.tipo,
          lembrete.referencia,
        ).catch(() => {});
        console.error('Falha ao enviar lembrete de proposta.');
      }
    }
    res.json({ ok: true, ...resumo });
  });

  // Daqui para baixo, somente usuários autenticados.
  api.use(exigirLogin(obterDb));

  api.get('/versao', (_req, res) => {
    res.json({ versao: novidades[0]?.id || 'inicio' });
  });

  api.get('/notificacoes/config', async (req, res) => {
    res.json({ chave_publica: process.env.VAPID_PUBLIC_KEY || null, configurada: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) });
  });

  api.post('/notificacoes/push', async (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      throw new ErroHttp(503, 'As notificações push ainda não foram configuradas.');
    }
    const inscricao = req.body.inscricao;
    const endpoint = texto(inscricao?.endpoint, { max: 4096, obrigatorio: true, campo: 'Dispositivo' });
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      throw invalido('Inscrição de notificação inválida.');
    }
    if (!endpointPushValido(url)) throw invalido('Inscrição de notificação inválida.');
    const p256dh = String(inscricao?.keys?.p256dh || '');
    const auth = String(inscricao?.keys?.auth || '');
    if (!/^[A-Za-z0-9_-]{80,160}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,64}$/.test(auth)) {
      throw invalido('Chaves da inscrição de notificação inválidas.');
    }
    await db.run(
      `INSERT INTO inscricoes_push (endpoint, usuario_id, chave_p256dh, chave_auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id,
         chave_p256dh = EXCLUDED.chave_p256dh, chave_auth = EXCLUDED.chave_auth, atualizado_em = now()`,
      endpoint,
      req.usuario.id,
      p256dh,
      auth,
    );
    res.json({ ok: true });
  });

  api.delete('/notificacoes/push', async (req, res) => {
    const endpoint = texto(req.body.endpoint, { max: 4096, obrigatorio: true, campo: 'Dispositivo' });
    await db.run('DELETE FROM inscricoes_push WHERE endpoint = ? AND usuario_id = ?', endpoint, req.usuario.id);
    res.json({ ok: true });
  });

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
    await alterarStatus(db, id(req.params.id), req.body.status, req.usuario.id, req.body.versao);
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

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { ErroHttp, invalido, texto } from './validacao.js';

const DURACAO_SESSAO_DIAS = 30;
const COOKIE = 'sid';

export function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function conferirSenha(senha, armazenado) {
  const [algoritmo, sal, hash] = String(armazenado).split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = scryptSync(String(senha), Buffer.from(sal, 'base64'), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

export function validarSenha(senha) {
  const s = String(senha ?? '');
  if (s.length < 6) throw invalido('A senha deve ter pelo menos 6 caracteres.');
  if (s.length > 200) throw invalido('Senha muito longa.');
  return s;
}

export function validarEmail(email) {
  const s = texto(email, { max: 200, obrigatorio: true, campo: 'E-mail' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw invalido('E-mail inválido.');
  return s;
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function lerCookies(req) {
  const cookies = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) cookies[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return cookies;
}

function opcoesCookie(req) {
  const seguro = process.env.COOKIE_SECURE === '1' || req.secure;
  return ['Path=/', 'HttpOnly', 'SameSite=Lax', seguro ? 'Secure' : ''].filter(Boolean).join('; ');
}

export async function criarSessao(db, req, res, usuarioId) {
  const token = randomBytes(32).toString('base64url');
  await db.run('DELETE FROM sessoes WHERE expira_em < now()');
  await db.run(
    'INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, now() + ?::interval)',
    hashToken(token),
    usuarioId,
    `${DURACAO_SESSAO_DIAS} days`,
  );
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${DURACAO_SESSAO_DIAS * 86400}; ${opcoesCookie(req)}`);
}

export async function encerrarSessao(db, req, res) {
  const token = lerCookies(req)[COOKIE];
  if (token) await db.run('DELETE FROM sessoes WHERE token_hash = ?', hashToken(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${opcoesCookie(req)}`);
}

/** Mantém o navegador atual autenticado e revoga as outras sessões da conta. */
export async function revogarOutrasSessoes(db, req, usuarioId) {
  const token = lerCookies(req)[COOKIE];
  if (!token) throw new ErroHttp(401, 'Faça login para continuar.');
  return db.run(
    'DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?',
    usuarioId,
    hashToken(token),
  );
}

export async function usuarioDaSessao(db, req) {
  const token = lerCookies(req)[COOKIE];
  if (!token) return null;
  return (
    (await db.get(
      `SELECT u.id, u.nome, u.email, u.tipo FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ? AND s.expira_em > now()`,
      hashToken(token),
    )) || null
  );
}

export function exigirLogin(obterDb) {
  return async (req, _res, next) => {
    const usuario = await usuarioDaSessao(await obterDb(), req);
    if (!usuario) return next(new ErroHttp(401, 'Faça login para continuar.'));
    req.usuario = usuario;
    next();
  };
}

/**
 * Proteção contra CSRF: toda requisição que altera dados precisa do cabeçalho
 * X-Requested-With, que um formulário de outro site não consegue enviar sem
 * autorização CORS (que este servidor nunca concede).
 */
export function exigirCabecalhoFetch(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') return next(new ErroHttp(403, 'Requisição não permitida.'));
  next();
}

/**
 * Limita tentativas de login erradas por IP (10 a cada 15 minutos). Fica no
 * banco porque, na Vercel, cada requisição pode cair em uma instância diferente.
 */
export function criarLimitadorLogin({ maximo = 10, janelaMinutos = 15 } = {}) {
  const chave = (req) => `ip:${req.ip || 'desconhecido'}`;
  const janela = `${janelaMinutos} minutes`;
  return {
    async verificar(db, req) {
      await db.run('DELETE FROM tentativas_login WHERE inicio < now() - ?::interval', janela);
      const registro = await db.get('SELECT quantidade FROM tentativas_login WHERE chave = ?', chave(req));
      if (registro && registro.quantidade >= maximo) {
        throw new ErroHttp(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      }
    },
    async falhou(db, req) {
      await db.run(
        `INSERT INTO tentativas_login (chave, quantidade, inicio) VALUES (?, 1, now())
         ON CONFLICT (chave) DO UPDATE SET quantidade = tentativas_login.quantidade + 1`,
        chave(req),
      );
    },
    async limpar(db, req) {
      await db.run('DELETE FROM tentativas_login WHERE chave = ?', chave(req));
    },
  };
}

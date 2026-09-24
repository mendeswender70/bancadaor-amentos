export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export const invalido = (mensagem) => new ErroHttp(400, mensagem);
export const naoEncontrado = (mensagem = 'Registro não encontrado.') => new ErroHttp(404, mensagem);

/** Texto aparado, com limite de tamanho. */
export function texto(valor, { max = 500, obrigatorio = false, campo = 'Campo' } = {}) {
  const s = String(valor ?? '').trim();
  if (obrigatorio && !s) throw invalido(`${campo} é obrigatório.`);
  if (s.length > max) throw invalido(`${campo} deve ter no máximo ${max} caracteres.`);
  return s;
}

/** Inteiro dentro de um intervalo. */
export function inteiro(valor, { min = 0, max = Number.MAX_SAFE_INTEGER, campo = 'Valor', opcional = false } = {}) {
  if (opcional && (valor === null || valor === undefined || valor === '')) return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw invalido(`${campo} inválido.`);
  return n;
}

export function umDe(valor, opcoes, campo = 'Valor') {
  if (!opcoes.includes(valor)) throw invalido(`${campo} inválido.`);
  return valor;
}

export function dataIso(valor, campo = 'Data') {
  const s = String(valor ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw invalido(`${campo} inválida.`);
  }
  return s;
}

export function id(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw naoEncontrado();
  return n;
}

/** Data de hoje (AAAA-MM-DD) no fuso da empresa. */
export function hoje(fuso = process.env.TZ_EMPRESA || 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

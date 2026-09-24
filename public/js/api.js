export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

let aoPerderSessao = () => {};
export function quandoPerderSessao(fn) {
  aoPerderSessao = fn;
}

export async function api(metodo, caminho, corpo) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Verifique a internet e tente novamente.', 0);
  }
  const dados = (resposta.headers.get('content-type') || '').includes('json') ? await resposta.json() : null;
  if (resposta.status === 401 && !caminho.startsWith('/auth/')) {
    aoPerderSessao();
  }
  if (!resposta.ok) throw new ErroApi(dados?.erro || 'Não foi possível concluir a operação.', resposta.status);
  return dados;
}

api.get = (caminho) => api('GET', caminho);
api.post = (caminho, corpo = {}) => api('POST', caminho, corpo);
api.put = (caminho, corpo) => api('PUT', caminho, corpo);
api.patch = (caminho, corpo) => api('PATCH', caminho, corpo);
api.delete = (caminho) => api('DELETE', caminho);

/** Baixa um arquivo autenticado como Blob (usado para o PDF). */
export async function baixarBlob(caminho) {
  const resposta = await fetch(`/api${caminho}`, { credentials: 'same-origin' });
  if (resposta.status === 401) aoPerderSessao();
  if (!resposta.ok) throw new ErroApi('Não foi possível gerar o arquivo.', resposta.status);
  return resposta.blob();
}

// Dados usados em várias telas, guardados em memória.
export const cache = {
  empresa: null,
  async carregarEmpresa(forcar = false) {
    if (!this.empresa || forcar) this.empresa = await api.get('/empresa');
    return this.empresa;
  },
};

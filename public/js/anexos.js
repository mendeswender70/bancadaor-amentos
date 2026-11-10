// Envio e leitura de anexos (PDF do projeto e fotos) em partes de 3 MB, para
// caber no limite de 4,5 MB por requisição da Vercel. Usado no esquadro e na
// área da produção.
import { api, ErroApi } from './api.js';

export const TAMANHO_MAXIMO = 25 * 1024 * 1024;
const LADO_MAXIMO_FOTO = 2600;

export const ehPdf = (anexo) => anexo.tipo === 'application/pdf';
export const formatarTamanho = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Foto do celular: reduz para no máximo 2600 px no lado maior (dá para ler as
 * cotas com folga) e salva em JPEG. PDF vai como está.
 */
export async function prepararArquivo(arquivo) {
  const nome = (arquivo.name || '').trim();
  if (arquivo.type === 'application/pdf' || /\.pdf$/i.test(nome)) {
    if (arquivo.size > TAMANHO_MAXIMO) throw new Error(`O PDF tem ${formatarTamanho(arquivo.size)}. O limite é ${formatarTamanho(TAMANHO_MAXIMO)}: peça ao arquiteto uma versão mais leve ou mande só as pranchas da marcenaria.`);
    return { blob: arquivo, nome: nome || 'projeto.pdf', tipo: 'application/pdf' };
  }
  if (!arquivo.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(nome)) throw new Error(`"${nome || 'arquivo'}" não é PDF nem foto.`);
  let imagem;
  try {
    // Foto de celular em pé vem com a orientação no EXIF: aplica antes de reduzir.
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`Não foi possível abrir a foto "${nome || 'arquivo'}". Se for HEIC, tire a foto pelo botão "Anexar" do próprio site ou exporte em JPEG.`);
  }
  const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Não foi possível preparar a foto.');
  const base = nome.replace(/\.[^.]+$/, '') || 'foto';
  return { blob, nome: `${base}.jpg`, tipo: 'image/jpeg' };
}

async function enviarBinario(caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: 'PUT',
      headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/octet-stream' },
      body: corpo,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi('Sem conexão. O envio parou; tente de novo quando a internet voltar.', 0);
  }
  if (!resposta.ok) {
    const dados = (resposta.headers.get('content-type') || '').includes('json') ? await resposta.json() : null;
    throw new ErroApi(dados?.erro || 'Não foi possível enviar o arquivo.', resposta.status);
  }
}

/**
 * Envia um arquivo para o plano ou o orçamento.
 * @param {File} arquivo
 * @param {{plano_id?: number, orcamento_id?: number}} destino
 * @param {(fracao: number) => void} [aoProgresso]
 */
export async function enviarAnexo(arquivo, destino, aoProgresso = () => {}) {
  const { blob, nome, tipo } = await prepararArquivo(arquivo);
  const { id, partes, parte_bytes: parte } = await api.post('/producao/anexos', { ...destino, nome, tipo, tamanho: blob.size });
  for (let i = 0; i < partes; i++) {
    aoProgresso(i / partes);
    await enviarBinario(`/producao/anexos/${id}/partes/${i}`, blob.slice(i * parte, (i + 1) * parte));
  }
  await api.post(`/producao/anexos/${id}/concluir`);
  aoProgresso(1);
  return id;
}

const baixados = new Map();

/** Junta as partes e devolve o arquivo (guardado na memória enquanto a página está aberta). */
export function baixarAnexo(anexo) {
  if (!baixados.has(anexo.id)) {
    const promessa = (async () => {
      const pedacos = [];
      for (let i = 0; i < anexo.partes; i++) {
        const resposta = await fetch(`/api/producao/anexos/${anexo.id}/partes/${i}`, { credentials: 'same-origin' });
        if (!resposta.ok) throw new ErroApi('Não foi possível abrir o anexo.', resposta.status);
        pedacos.push(await resposta.arrayBuffer());
      }
      return new Blob(pedacos, { type: anexo.tipo });
    })();
    promessa.catch(() => baixados.delete(anexo.id));
    baixados.set(anexo.id, promessa);
  }
  return baixados.get(anexo.id);
}

const urls = new Map();
/** Endereço local (blob:) para mostrar a foto. */
export async function urlDoAnexo(anexo) {
  if (!urls.has(anexo.id)) urls.set(anexo.id, URL.createObjectURL(await baixarAnexo(anexo)));
  return urls.get(anexo.id);
}

// ---------------------------------------------------------------- PDF (pdf.js)

let pdfjs = null;
function carregarPdfjs() {
  pdfjs ??= import('/js/vendor/pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/js/vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  });
  return pdfjs;
}

const documentos = new Map();
/** Abre o PDF do anexo com o pdf.js (que fica no próprio site). */
export function abrirPdf(anexo) {
  if (!documentos.has(anexo.id)) {
    const promessa = (async () => {
      const [m, blob] = await Promise.all([carregarPdfjs(), baixarAnexo(anexo)]);
      const dados = new Uint8Array(await blob.arrayBuffer());
      return m.getDocument({ data: dados, isEvalSupported: false }).promise;
    })();
    promessa.catch(() => documentos.delete(anexo.id));
    documentos.set(anexo.id, promessa);
  }
  return documentos.get(anexo.id);
}

/** Desenha a página num canvas com resolução boa para dar zoom e ler as cotas. */
export async function desenharPaginaPdf(anexo, numero, larguraAlvo = 2200) {
  const documento = await abrirPdf(anexo);
  const pagina = await documento.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const escala = Math.min(4, larguraAlvo / base.width);
  const vista = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vista.width);
  canvas.height = Math.floor(vista.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vista, canvas }).promise;
  return { canvas, paginas: documento.numPages };
}

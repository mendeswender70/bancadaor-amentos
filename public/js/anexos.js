// Envio e leitura de anexos (PDF do projeto e fotos) em partes de 3 MB, para
// caber no limite de 4,5 MB por requisição da Vercel. Usado no esquadro e na
// área da produção.
import { api, ErroApi } from './api.js';
import './polyfills-pdf.js';

export const TAMANHO_MAXIMO = 25 * 1024 * 1024;
const LADO_MAXIMO_FOTO = 2600;
// Planta exportada (PNG/WebP) não é foto: vai como está, até este tamanho.
const PLANTA_ORIGINAL_MAX = 12 * 1024 * 1024;
const LADO_MAXIMO_PLANTA = 5000;

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
  const base = nome.replace(/\.[^.]+$/, '') || 'foto';
  // Planta exportada do SketchUp/AutoCAD/Promob em PNG ou WebP: manda o original
  // (sem perder resolução nem a transparência).
  const planta = ['image/png', 'image/webp'].includes(arquivo.type);
  if (planta && arquivo.size <= PLANTA_ORIGINAL_MAX) return { blob: arquivo, nome: nome || `${base}.png`, tipo: arquivo.type };
  const imagem = await abrirImagem(arquivo, nome);
  const lado = planta ? LADO_MAXIMO_PLANTA : LADO_MAXIMO_FOTO;
  const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imagem.width * escala));
  canvas.height = Math.max(1, Math.round(imagem.height * escala));
  const ctx = canvas.getContext('2d');
  // JPEG não tem transparência: sem fundo branco, o transparente vira preto.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem.fonte, 0, 0, canvas.width, canvas.height);
  imagem.liberar();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Não foi possível preparar a foto.');
  return { blob, nome: `${base}.jpg`, tipo: 'image/jpeg' };
}

/**
 * Abre a foto já na orientação certa (foto de celular em pé vem com a
 * orientação no EXIF). O valor 'from-image' só existe no iOS 16+ e no Chrome
 * 112+: antes, tenta sem opção e, por fim, com <img>, que aplica o EXIF.
 */
async function abrirImagem(arquivo, nome) {
  for (const opcoes of [{ imageOrientation: 'from-image' }, undefined]) {
    try {
      const bitmap = await createImageBitmap(arquivo, opcoes);
      return { fonte: bitmap, width: bitmap.width, height: bitmap.height, liberar: () => bitmap.close?.() };
    } catch (erro) {
      if (erro?.name !== 'TypeError') break;
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { fonte: img, width: img.naturalWidth, height: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`Não foi possível abrir a foto "${nome || 'arquivo'}". Se for HEIC, tire a foto pelo botão "Anexar" do próprio site ou exporte em JPEG.`);
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Manda uma parte. Na oficina o sinal cai: tenta de novo até 3 vezes antes de desistir. */
async function enviarBinario(caminho, corpo) {
  for (let tentativa = 0; ; tentativa++) {
    let resposta;
    try {
      resposta = await fetch(`/api${caminho}`, {
        method: 'PUT',
        headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/octet-stream' },
        body: corpo,
        credentials: 'same-origin',
      });
    } catch {
      if (tentativa < 3) {
        await esperar(1000 * 2 ** tentativa);
        continue;
      }
      throw new ErroApi('Sem conexão. O envio parou; tente de novo quando a internet voltar.', 0);
    }
    if (resposta.ok) return;
    // Erro do servidor (5xx) pode ser passageiro; erro de validação (4xx), não.
    if (resposta.status >= 500 && tentativa < 3) {
      await esperar(1000 * 2 ** tentativa);
      continue;
    }
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
  try {
    for (let i = 0; i < partes; i++) {
      aoProgresso(i / partes);
      await enviarBinario(`/producao/anexos/${id}/partes/${i}`, blob.slice(i * parte, (i + 1) * parte));
    }
    await api.post(`/producao/anexos/${id}/concluir`);
  } catch (erro) {
    // Não deixa o envio pela metade ocupando espaço e vaga no limite de anexos.
    api.delete(`/producao/anexos/${id}`).catch(() => {});
    throw erro;
  }
  aoProgresso(1);
  return id;
}

async function baixarPartes(anexo) {
  const pedacos = [];
  for (let i = 0; i < anexo.partes; i++) {
    const resposta = await fetch(`/api/producao/anexos/${anexo.id}/partes/${i}`, { credentials: 'same-origin' });
    if (!resposta.ok) throw new ErroApi('Não foi possível abrir o anexo.', resposta.status);
    pedacos.push(await resposta.arrayBuffer());
  }
  return new Blob(pedacos, { type: anexo.tipo });
}

// Só as fotos (já reduzidas no envio, ~1 MB) ficam na memória. PDF pode ter
// 25 MB: baixa quando pedem e não guarda.
const fotos = new Map();

/** Junta as partes e devolve o arquivo. */
export function baixarAnexo(anexo) {
  if (ehPdf(anexo)) return baixarPartes(anexo);
  if (!fotos.has(anexo.id)) {
    const promessa = baixarPartes(anexo);
    promessa.catch(() => fotos.delete(anexo.id));
    fotos.set(anexo.id, promessa);
  }
  return fotos.get(anexo.id);
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
    // O worker passa pelo /js/pdf-worker.mjs, que instala o que falta no Safari antigo.
    m.GlobalWorkerOptions.workerSrc = '/js/pdf-worker.mjs';
    return m;
  });
  return pdfjs;
}

// No máximo dois PDFs abertos (ex.: o do escritório e o do plano). O mais
// antigo é fechado para não estourar a memória do celular.
const MAX_PDFS_ABERTOS = 2;
const documentos = new Map();
/** Abre o PDF do anexo com o pdf.js (que fica no próprio site). */
export function abrirPdf(anexo) {
  if (documentos.has(anexo.id)) {
    const promessa = documentos.get(anexo.id);
    documentos.delete(anexo.id);
    documentos.set(anexo.id, promessa);
    return promessa;
  }
  const promessa = (async () => {
    const [m, blob] = await Promise.all([carregarPdfjs(), baixarAnexo(anexo)]);
    const dados = new Uint8Array(await blob.arrayBuffer());
    // Sem WebAssembly (a CSP não deixa): imagens JPEG 2000 e JBIG2 de PDF
    // escaneado são decodificadas pelos arquivos em JavaScript da pasta wasm/.
    return m.getDocument({ data: dados, isEvalSupported: false, useWasm: false, wasmUrl: '/js/vendor/pdfjs/wasm/' }).promise;
  })();
  promessa.catch(() => documentos.delete(anexo.id));
  documentos.set(anexo.id, promessa);
  while (documentos.size > MAX_PDFS_ABERTOS) {
    const [antigo, velha] = documentos.entries().next().value;
    documentos.delete(antigo);
    velha.then((doc) => doc.destroy()).catch(() => {});
  }
  return promessa;
}

/**
 * Renderiza no canvas. `controle.cancelar()` interrompe (ex.: a pessoa já
 * pediu outra página); o canvas interrompido é zerado para soltar a memória.
 */
async function renderizar(pagina, canvas, params, controle) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tarefa = pagina.render({ canvasContext: ctx, canvas, ...params });
  controle.cancelar = () => tarefa.cancel();
  try {
    await tarefa.promise;
  } catch (erro) {
    canvas.width = 0;
    canvas.height = 0;
    throw erro;
  }
}

/** Desenha a página inteira num canvas (base para o zoom). */
export async function desenharPaginaPdf(anexo, numero, larguraAlvo = 2200, controle = {}) {
  controle.cancelar ??= () => {};
  const documento = await abrirPdf(anexo);
  numero = Math.min(Math.max(1, Math.round(numero) || 1), documento.numPages);
  const pagina = await documento.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const escala = Math.min(4, larguraAlvo / base.width);
  const vista = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vista.width);
  canvas.height = Math.floor(vista.height);
  await renderizar(pagina, canvas, { viewport: vista }, controle);
  return { canvas, paginas: documento.numPages, pagina: numero, larguraPt: base.width };
}

/**
 * Desenha só um pedaço da página numa escala maior (`escala` = pixels por
 * ponto do PDF). `x`, `y`, `largura` e `altura` em pixels nessa escala. Serve
 * para as cotas pequenas de prancha A1/A0 ficarem nítidas com zoom.
 */
export async function desenharRegiaoPdf(anexo, numero, { escala, x, y, largura, altura }, controle = {}) {
  controle.cancelar ??= () => {};
  const documento = await abrirPdf(anexo);
  const pagina = await documento.getPage(numero);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(largura));
  canvas.height = Math.max(1, Math.ceil(altura));
  await renderizar(pagina, canvas, { viewport: pagina.getViewport({ scale: escala }), transform: [1, 0, 0, 1, -x, -y] }, controle);
  return canvas;
}

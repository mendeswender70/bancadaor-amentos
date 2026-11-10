// Projeto anexado ao trabalho: PDF do arquiteto e fotos. Mostra as
// miniaturas, abre em tela cheia com zoom de pinça e tem o modo "Medir no
// projeto": o desenho fica fixo em cima e a lista de peças embaixo, para
// quem monta o plano ler as cotas e digitar ao mesmo tempo.
import { api } from '/js/api.js';
import { h, icone, substituir, aviso, avisoErro, confirmar } from '/js/ui.js';
import { baixarAnexo, desenharPaginaPdf, desenharRegiaoPdf, ehPdf, enviarAnexo, formatarTamanho, urlDoAnexo } from '/js/anexos.js';
import { baixarArquivo } from './nucleo.js';

/** Roda `carregar` quando o elemento aparece na tela (as fotos só baixam se alguém rolar até elas). */
function quandoVisivel(el, carregar) {
  const rodar = () => Promise.resolve(carregar()).catch(() => {});
  if (!('IntersectionObserver' in window)) return void rodar();
  const observador = new IntersectionObserver((entradas) => {
    if (!entradas.some((e) => e.isIntersecting)) return;
    observador.disconnect();
    rodar();
  }, { rootMargin: '200px' });
  observador.observe(el);
}

/** "12/11" (ou "12/11/25" se for de outro ano): ajuda a ver qual versão do projeto é a mais nova. */
function dataCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const outroAno = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(outroAno ? { year: '2-digit' } : {}) });
}

/** Texto curto de onde a medida da peça foi tirada (ex.: "Planta.pdf, pág. 3"). */
export function textoDaOrigem(peca, anexos) {
  const anexo = peca.origem_anexo_id ? anexos.find((a) => a.id === peca.origem_anexo_id) : null;
  if (!anexo) return null;
  return ehPdf(anexo) ? `${anexo.nome}, pág. ${peca.origem_pagina || 1}` : anexo.nome;
}

// ----------------------------------------------------------- Zoom e arrasto

/**
 * Pinça, arrasto, toque duplo e roda do mouse num conteúdo dentro de `area`.
 * O zoom mínimo mostra o desenho inteiro; `aoAssentar` é chamado quando o
 * zoom ou o arrasto param (para redesenhar a parte visível com mais nitidez).
 */
function zoomavel(area, conteudo, { aoAssentar = () => {} } = {}) {
  let s = 1;
  let x = 0;
  let y = 0;
  let espera = null;
  conteudo.style.transformOrigin = '0 0';
  // Escala em que o conteúdo cabe inteiro na área (nunca maior que 1: largura toda).
  const minimo = () => {
    const w = conteudo.offsetWidth;
    const altura = conteudo.offsetHeight;
    if (!w || !altura || !area.clientWidth || !area.clientHeight) return 1;
    return Math.min(1, area.clientWidth / w, area.clientHeight / altura);
  };
  const limitar = () => {
    const w = area.clientWidth;
    const altura = area.clientHeight;
    const cw = conteudo.offsetWidth * s;
    const ch = conteudo.offsetHeight * s;
    x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, x));
    y = ch <= altura ? (altura - ch) / 2 : Math.min(0, Math.max(altura - ch, y));
  };
  const assentar = () => {
    clearTimeout(espera);
    espera = setTimeout(() => aoAssentar({ s, x, y }), 220);
  };
  const aplicar = () => {
    limitar();
    conteudo.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    assentar();
  };
  const relativo = (cx, cy) => {
    const r = area.getBoundingClientRect();
    return { px: cx - r.left, py: cy - r.top };
  };
  const zoomEm = (novo, cx, cy) => {
    const alvo = Math.min(8, Math.max(minimo(), novo));
    const { px, py } = relativo(cx, cy);
    x = px - ((px - x) * alvo) / s;
    y = py - ((py - y) * alvo) / s;
    s = alvo;
    aplicar();
  };
  const toques = new Map();
  let distancia = 0;
  // Toque = dedo que desce e sobe rápido sem andar. Dois toques perto e seguidos = toque duplo.
  let inicio = null;
  let ultimoToque = null;
  area.addEventListener('pointerdown', (e) => {
    area.setPointerCapture?.(e.pointerId);
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      distancia = Math.hypot(a.x - b.x, a.y - b.y);
      inicio = null;
      ultimoToque = null;
    } else if (toques.size === 1) inicio = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  });
  area.addEventListener('pointermove', (e) => {
    const antes = toques.get(e.pointerId);
    if (!antes) return;
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 10) {
      inicio = null;
      ultimoToque = null;
    }
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      const nova = Math.hypot(a.x - b.x, a.y - b.y);
      if (distancia) zoomEm((s * nova) / distancia, (a.x + b.x) / 2, (a.y + b.y) / 2);
      distancia = nova;
    } else if (toques.size === 1) {
      x += e.clientX - antes.x;
      y += e.clientY - antes.y;
      aplicar();
    }
  });
  const soltar = (e) => {
    toques.delete(e.pointerId);
    if (toques.size < 2) distancia = 0;
    if (e.type !== 'pointerup' || !inicio || toques.size) {
      inicio = null;
      return;
    }
    const toque = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const rapido = toque.t - inicio.t < 250;
    inicio = null;
    if (!rapido) {
      ultimoToque = null;
      return;
    }
    if (ultimoToque && toque.t - ultimoToque.t < 320 && Math.hypot(toque.x - ultimoToque.x, toque.y - ultimoToque.y) < 30) {
      ultimoToque = null;
      zoomEm(s > minimo() * 1.05 ? minimo() : Math.max(2.5, minimo() * 2.5), toque.x, toque.y);
    } else ultimoToque = toque;
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointercancel', soltar);
  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomEm(s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });
  const observador = new ResizeObserver(() => {
    s = Math.max(s, minimo());
    aplicar();
  });
  observador.observe(area);
  const centro = () => {
    const r = area.getBoundingClientRect();
    return [r.left + area.clientWidth / 2, r.top + area.clientHeight / 2];
  };
  return {
    /** Volta a mostrar o desenho inteiro. */
    reiniciar() {
      s = minimo();
      x = 0;
      y = 0;
      aplicar();
    },
    mais: () => zoomEm(s * 1.5, ...centro()),
    menos: () => zoomEm(s / 1.5, ...centro()),
    destruir: () => {
      clearTimeout(espera);
      observador.disconnect();
    },
  };
}

// ------------------------------------------------------------------- Visor

/**
 * Mostra um anexo (foto ou página de PDF) com zoom. Devolve o elemento, a
 * barra de páginas (só PDF) e uma função para limpar.
 */
function visor(anexo, paginaInicial = 1) {
  const area = h('div', { class: 'p-visor-area' });
  const conteudo = h('div', { class: 'p-visor-conteudo' }, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), ehPdf(anexo) ? 'Abrindo o PDF…' : 'Abrindo a foto…'));
  area.append(conteudo);
  // PDF: a página inteira é desenhada numa resolução que o celular aguenta. Ao
  // parar o zoom, a parte visível é redesenhada na resolução da tela por cima,
  // para as cotas pequenas de prancha grande ficarem legíveis.
  let base = null;
  let nitido = null;
  let tarefaNitida = null;
  const limparNitido = () => {
    tarefaNitida?.cancelar();
    tarefaNitida = null;
    if (nitido) {
      nitido.width = 0;
      nitido.height = 0;
      nitido.remove();
      nitido = null;
    }
  };
  const aoAssentar = async ({ s, x, y }) => {
    if (!base || !ativo) return;
    const larguraCss = conteudo.offsetWidth;
    const alturaCss = conteudo.offsetHeight;
    if (!larguraCss) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    // A página base já tem pixels de sobra nesta escala: nada a fazer.
    if (s * dpr <= (base.canvas.width / larguraCss) * 1.1) return limparNitido();
    // Parte visível, nas medidas do conteúdo (sem o zoom).
    const rx = Math.max(0, -x / s);
    const ry = Math.max(0, -y / s);
    const rw = Math.min(larguraCss - rx, area.clientWidth / s);
    const rh = Math.min(alturaCss - ry, area.clientHeight / s);
    if (rw <= 0 || rh <= 0) return;
    // Até ~6 milhões de pixels por desenho (o iPhone limita a memória de canvas).
    const f = Math.min(s * dpr, Math.sqrt(6e6 / (rw * rh)));
    const escala = (larguraCss / base.larguraPt) * f;
    tarefaNitida?.cancelar();
    const controle = {};
    tarefaNitida = controle;
    try {
      const canvas = await desenharRegiaoPdf(anexo, base.pagina, { escala, x: rx * f, y: ry * f, largura: rw * f, altura: rh * f }, controle);
      if (tarefaNitida !== controle || !ativo || !base) {
        canvas.width = 0;
        canvas.height = 0;
        return;
      }
      tarefaNitida = null;
      canvas.className = 'p-visor-nitido';
      Object.assign(canvas.style, { left: `${rx}px`, top: `${ry}px`, width: `${rw}px`, height: `${rh}px` });
      if (nitido) {
        nitido.width = 0;
        nitido.height = 0;
        nitido.remove();
      }
      nitido = canvas;
      conteudo.append(canvas);
    } catch {
      // Cancelado por um zoom novo ou falhou: fica a página base.
    }
  };
  const zoom = zoomavel(area, conteudo, { aoAssentar });
  const paginaEl = h('span', { class: 'p-visor-pagina num' });
  const anterior = h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Página anterior', disabled: true }, icone('voltar'));
  const proxima = h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Próxima página', disabled: true }, icone('seta'));
  const paginas = h('div', { class: 'p-visor-paginas', hidden: !ehPdf(anexo) }, anterior, paginaEl, proxima);
  let pagina = paginaInicial;
  let total = 1;
  let ativo = true;
  // Cada pedido de página tem um número: só o último pedido aparece (virar
  // páginas rápido não pode deixar a página 2 na tela com o rótulo da 3).
  let pedido = 0;
  let tarefaPagina = null;
  async function mostrar() {
    const meu = ++pedido;
    try {
      if (ehPdf(anexo)) {
        paginaEl.textContent = total > 1 ? `Abrindo a página ${pagina}…` : '';
        anterior.disabled = true;
        proxima.disabled = true;
        tarefaPagina?.cancelar();
        const controle = {};
        tarefaPagina = controle;
        const desenho = await desenharPaginaPdf(anexo, pagina, 2200, controle);
        if (meu !== pedido || !ativo) {
          desenho.canvas.width = 0;
          desenho.canvas.height = 0;
          return;
        }
        limparNitido();
        if (base) {
          base.canvas.width = 0;
          base.canvas.height = 0;
        }
        base = desenho;
        total = desenho.paginas;
        pagina = desenho.pagina;
        desenho.canvas.className = 'p-visor-imagem';
        substituir(conteudo, desenho.canvas);
        paginaEl.textContent = `Página ${pagina} de ${total}`;
        anterior.disabled = pagina <= 1;
        proxima.disabled = pagina >= total;
      } else {
        const img = h('img', { class: 'p-visor-imagem', alt: anexo.nome, src: await urlDoAnexo(anexo) });
        if (meu !== pedido || !ativo) return;
        await img.decode().catch(() => {});
        if (meu !== pedido || !ativo) return;
        substituir(conteudo, img);
      }
      zoom.reiniciar();
    } catch (erro) {
      if (meu !== pedido || !ativo) return;
      if (erro?.name === 'RenderingCancelledException') return;
      // Celular antigo ou PDF que o leitor do site não entende: baixar abre no leitor do próprio celular.
      const baixar = async () => {
        try {
          baixarArquivo(await baixarAnexo(anexo), anexo.nome);
        } catch (e) {
          avisoErro(e);
        }
      };
      substituir(
        conteudo,
        h(
          'div',
          { class: 'vazio' },
          h('strong', {}, 'Não foi possível abrir aqui'),
          h('p', {}, erro.message || String(erro)),
          h('button', { type: 'button', class: 'botao', onclick: baixar }, icone('baixar'), 'Baixar o arquivo'),
        ),
      );
    }
  }
  anterior.addEventListener('click', () => {
    if (pagina > 1) {
      pagina--;
      mostrar();
    }
  });
  proxima.addEventListener('click', () => {
    if (pagina < total) {
      pagina++;
      mostrar();
    }
  });
  mostrar();
  return {
    area,
    paginas,
    zoom,
    pagina: () => pagina,
    destruir() {
      ativo = false;
      tarefaPagina?.cancelar();
      limparNitido();
      zoom.destruir();
    },
  };
}

// ----------------------------------------------------- Tela cheia e medir

export function abrirAnexoEmTelaCheia(anexo, pagina = 1) {
  const v = visor(anexo, pagina);
  const fechar = () => {
    v.destruir();
    painel.remove();
    document.removeEventListener('keydown', teclas);
  };
  const teclas = (e) => e.key === 'Escape' && fechar();
  const baixar = async () => {
    try {
      baixarArquivo(await baixarAnexo(anexo), anexo.nome);
    } catch (erro) {
      avisoErro(erro);
    }
  };
  const painel = h(
    'div',
    { class: 'p-visualizador', role: 'dialog', 'aria-modal': 'true', 'aria-label': anexo.nome },
    h(
      'div',
      { class: 'p-visualizador-topo' },
      h('strong', {}, anexo.nome),
      h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Baixar', title: 'Baixar', onclick: baixar }, icone('baixar')),
      h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Fechar', onclick: fechar }, icone('mais', 'icone girar45')),
    ),
    v.area,
    h('div', { class: 'p-visualizador-rodape p-visor-rodape' }, v.paginas, h('span', { class: 'pequeno suave' }, 'Dois dedos para aproximar; toque duplo amplia.')),
  );
  document.body.append(painel);
  document.addEventListener('keydown', teclas);
}

let medindo = null;

/** Projeto fixo em cima da tela, lista de peças embaixo. */
export function abrirMedir(lista, inicial, aoFechar = () => {}, paginaInicial = 1) {
  fecharMedir();
  let atual = null;
  let anexoAtual = inicial;
  const corpo = h('div', { class: 'p-medir-corpo' });
  const rodape = h('div', { class: 'p-medir-rodape' });
  const escolha = h('select', { 'aria-label': 'Anexo', onchange: (e) => trocar(lista.find((a) => String(a.id) === e.target.value)) }, lista.map((a) => h('option', { value: String(a.id), selected: a.id === inicial.id }, a.nome)));
  function trocar(anexo, pagina = 1) {
    atual?.destruir();
    anexoAtual = anexo;
    atual = visor(anexo, pagina);
    substituir(corpo, atual.area);
    substituir(rodape, atual.paginas, h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Afastar', onclick: () => atual.zoom.menos() }, h('strong', {}, '−')), h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Aproximar', onclick: () => atual.zoom.mais() }, icone('mais')));
  }
  const painel = h(
    'section',
    { class: 'p-medir', 'aria-label': 'Projeto para medir' },
    h('div', { class: 'p-medir-topo' }, icone('regua'), lista.length > 1 ? escolha : h('strong', {}, inicial.nome), h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Fechar o projeto', onclick: () => fecharMedir() }, icone('mais', 'icone girar45'))),
    corpo,
    rodape,
  );
  document.body.append(painel);
  document.body.classList.add('medindo');
  trocar(inicial, paginaInicial);
  medindo = {
    painel,
    fechar: () => atual?.destruir(),
    aoFechar,
    origem: () => ({ origem_anexo_id: anexoAtual.id, origem_pagina: ehPdf(anexoAtual) ? atual.pagina() : null }),
  };
}

/**
 * Enquanto o projeto está aberto em "Medir", diz de qual anexo e página a
 * medida digitada veio. Fora dele, devolve origem vazia.
 */
export function origemDaMedida() {
  return medindo ? medindo.origem() : { origem_anexo_id: null, origem_pagina: null };
}

export function fecharMedir() {
  if (!medindo) return;
  medindo.fechar();
  medindo.painel.remove();
  document.body.classList.remove('medindo');
  const { aoFechar } = medindo;
  medindo = null;
  aoFechar();
}

// --------------------------------------------------------------- O cartão

/**
 * Cartão "Projeto" do plano: miniaturas dos anexos (do orçamento e do plano),
 * anexar PDF ou foto e o botão para medir no projeto.
 */
export function secaoProjeto(plano, { somenteLeitura = false, aoMedir = () => {}, aoCarregar = () => {} } = {}) {
  let anexos = [];
  const lista = h('div', { class: 'p-anexos' });
  const titulo = h('h2', {}, 'Projeto');
  const medir = h('button', { type: 'button', class: 'botao botao-primario', hidden: true, onclick: () => anexos.length && aoMedir(anexos, anexos[0]) }, icone('regua'), 'Medir no projeto');
  const entrada = h('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, hidden: true });
  const secao = h(
    'section',
    { class: 'p-cartao p-projeto' },
    h('div', { class: 'p-titulo-cartao' }, titulo, medir),
    h('p', { class: 'dica' }, 'PDF do arquiteto e fotos do projeto, para conferir de onde vem cada medida.'),
    lista,
    entrada,
  );

  async function carregar() {
    try {
      anexos = await api.get(`/producao/planos/${plano.id}/anexos`);
    } catch {
      anexos = [];
    }
    desenhar();
    aoCarregar(anexos);
  }

  function miniatura(anexo) {
    // PDF não é aberto só para a miniatura (pode ter 25 MB): abre ao tocar.
    const imagem = h('span', { class: 'p-anexo-imagem', 'data-paginas': ehPdf(anexo) ? 'PDF' : null }, icone(ehPdf(anexo) ? 'pdf' : 'olho', 'icone icone-grande'));
    if (!ehPdf(anexo)) quandoVisivel(imagem, () => urlDoAnexo(anexo).then((url) => substituir(imagem, h('img', { src: url, alt: '' }))));
    const excluir = async (e) => {
      e.stopPropagation();
      if (!(await confirmar(`Tirar "${anexo.nome}" do plano?`, { sim: 'Excluir anexo', perigo: true }))) return;
      try {
        await api.delete(`/producao/anexos/${anexo.id}`);
        aviso('Anexo excluído.');
        carregar();
      } catch (erro) {
        avisoErro(erro);
      }
    };
    return h(
      'div',
      { class: 'p-anexo' },
      h('button', { type: 'button', class: 'p-anexo-abrir', onclick: () => abrirAnexoEmTelaCheia(anexo), 'aria-label': `Abrir ${anexo.nome}` }, imagem),
      h('span', { class: 'p-anexo-nome' }, anexo.nome),
      h('small', { class: 'p-anexo-info' }, `${anexo.origem === 'orcamento' ? 'do escritório' : anexo.criado_por_nome || 'plano'} · ${dataCurta(anexo.criado_em)} · ${formatarTamanho(anexo.tamanho)}`),
      anexo.pode_excluir && !somenteLeitura ? h('button', { type: 'button', class: 'p-anexo-excluir', 'aria-label': `Excluir ${anexo.nome}`, onclick: excluir }, icone('lixeira', 'icone icone-mini')) : null,
    );
  }

  const novo = h(
    'button',
    { type: 'button', class: 'p-anexo p-anexo-novo', onclick: () => entrada.click(), hidden: somenteLeitura },
    h('span', { class: 'p-anexo-imagem' }, icone('mais', 'icone icone-grande')),
    h('span', { class: 'p-anexo-nome' }, 'Anexar'),
    h('small', { class: 'p-anexo-info' }, 'PDF ou foto'),
  );

  entrada.addEventListener('change', async () => {
    const arquivos = [...entrada.files];
    entrada.value = '';
    for (const arquivo of arquivos) {
      const progresso = h('small', { class: 'p-anexo-info' }, 'Preparando…');
      const marcador = h('div', { class: 'p-anexo p-anexo-enviando' }, h('span', { class: 'p-anexo-imagem' }, h('span', { class: 'spinner' })), h('span', { class: 'p-anexo-nome' }, arquivo.name || 'arquivo'), progresso);
      lista.insertBefore(marcador, novo);
      try {
        await enviarAnexo(arquivo, { plano_id: plano.id }, (f) => {
          progresso.textContent = `Enviando ${Math.round(f * 100)}%`;
        });
        aviso(`"${arquivo.name || 'Arquivo'}" anexado.`);
      } catch (erro) {
        avisoErro(erro);
      } finally {
        marcador.remove();
      }
    }
    carregar();
  });

  function desenhar() {
    titulo.textContent = anexos.length ? `Projeto (${anexos.length})` : 'Projeto';
    medir.hidden = !anexos.length;
    substituir(lista, anexos.map(miniatura), novo);
    secao.hidden = somenteLeitura && !anexos.length;
  }
  desenhar();
  carregar();
  return { elemento: secao, recarregar: carregar, anexos: () => anexos };
}

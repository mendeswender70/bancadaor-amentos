// Projeto anexado ao trabalho: PDF do arquiteto e fotos. Mostra as
// miniaturas, abre em tela cheia com zoom de pinça e tem o modo "Medir no
// projeto": o desenho fica fixo em cima e a lista de peças embaixo, para
// quem monta o plano ler as cotas e digitar ao mesmo tempo.
import { api } from '/js/api.js';
import { h, icone, substituir, aviso, avisoErro, confirmar } from '/js/ui.js';
import { abrirPdf, baixarAnexo, desenharPaginaPdf, ehPdf, enviarAnexo, formatarTamanho, urlDoAnexo } from '/js/anexos.js';
import { baixarArquivo, plural } from './nucleo.js';

// ----------------------------------------------------------- Zoom e arrasto

/** Pinça, arrasto, toque duplo e roda do mouse num conteúdo dentro de `area`. */
function zoomavel(area, conteudo) {
  let s = 1;
  let x = 0;
  let y = 0;
  conteudo.style.transformOrigin = '0 0';
  const limitar = () => {
    const w = area.clientWidth;
    const altura = area.clientHeight;
    const cw = conteudo.offsetWidth * s;
    const ch = conteudo.offsetHeight * s;
    x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, x));
    y = ch <= altura ? Math.max(0, (altura - ch) / 2) : Math.min(0, Math.max(altura - ch, y));
  };
  const aplicar = () => {
    limitar();
    conteudo.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  const relativo = (cx, cy) => {
    const r = area.getBoundingClientRect();
    return { px: cx - r.left, py: cy - r.top };
  };
  const zoomEm = (novo, cx, cy) => {
    const alvo = Math.min(8, Math.max(1, novo));
    const { px, py } = relativo(cx, cy);
    x = px - ((px - x) * alvo) / s;
    y = py - ((py - y) * alvo) / s;
    s = alvo;
    aplicar();
  };
  const toques = new Map();
  let distancia = 0;
  let ultimoToque = 0;
  area.addEventListener('pointerdown', (e) => {
    area.setPointerCapture?.(e.pointerId);
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      distancia = Math.hypot(a.x - b.x, a.y - b.y);
    } else if (toques.size === 1) {
      const agora = e.timeStamp;
      if (agora - ultimoToque < 300) zoomEm(s > 1.05 ? 1 : 2.5, e.clientX, e.clientY);
      ultimoToque = agora;
    }
  });
  area.addEventListener('pointermove', (e) => {
    const antes = toques.get(e.pointerId);
    if (!antes) return;
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointercancel', soltar);
  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomEm(s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });
  const observador = new ResizeObserver(aplicar);
  observador.observe(area);
  return {
    reiniciar() {
      s = 1;
      x = 0;
      y = 0;
      aplicar();
    },
    mais: () => zoomEm(s * 1.5, area.getBoundingClientRect().left + area.clientWidth / 2, area.getBoundingClientRect().top + area.clientHeight / 2),
    menos: () => zoomEm(s / 1.5, area.getBoundingClientRect().left + area.clientWidth / 2, area.getBoundingClientRect().top + area.clientHeight / 2),
    destruir: () => observador.disconnect(),
  };
}

// ------------------------------------------------------------------- Visor

/**
 * Mostra um anexo (foto ou página de PDF) com zoom. Devolve o elemento, a
 * barra de páginas (só PDF) e uma função para limpar.
 */
function visor(anexo) {
  const area = h('div', { class: 'p-visor-area' });
  const conteudo = h('div', { class: 'p-visor-conteudo' }, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), ehPdf(anexo) ? 'Abrindo o PDF…' : 'Abrindo a foto…'));
  area.append(conteudo);
  const zoom = zoomavel(area, conteudo);
  const paginaEl = h('span', { class: 'p-visor-pagina num' });
  const anterior = h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Página anterior', disabled: true }, icone('voltar'));
  const proxima = h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Próxima página', disabled: true }, icone('seta'));
  const paginas = h('div', { class: 'p-visor-paginas', hidden: !ehPdf(anexo) }, anterior, paginaEl, proxima);
  let pagina = 1;
  let total = 1;
  let ativo = true;
  async function mostrar() {
    try {
      if (ehPdf(anexo)) {
        paginaEl.textContent = total > 1 ? `${pagina} de ${total}` : '';
        const { canvas, paginas: n } = await desenharPaginaPdf(anexo, pagina);
        if (!ativo) return;
        total = n;
        canvas.className = 'p-visor-imagem';
        substituir(conteudo, canvas);
        paginaEl.textContent = `Página ${pagina} de ${total}`;
        anterior.disabled = pagina <= 1;
        proxima.disabled = pagina >= total;
      } else {
        const img = h('img', { class: 'p-visor-imagem', alt: anexo.nome, src: await urlDoAnexo(anexo) });
        if (!ativo) return;
        await img.decode().catch(() => {});
        substituir(conteudo, img);
      }
      zoom.reiniciar();
    } catch (erro) {
      substituir(conteudo, h('div', { class: 'vazio' }, h('strong', {}, 'Não foi possível abrir'), h('p', {}, erro.message || String(erro))));
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
    destruir() {
      ativo = false;
      zoom.destruir();
    },
  };
}

// ----------------------------------------------------- Tela cheia e medir

export function abrirAnexoEmTelaCheia(anexo) {
  const v = visor(anexo);
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
export function abrirMedir(lista, inicial, aoFechar = () => {}) {
  fecharMedir();
  let atual = null;
  const corpo = h('div', { class: 'p-medir-corpo' });
  const rodape = h('div', { class: 'p-medir-rodape' });
  const escolha = h('select', { 'aria-label': 'Anexo', onchange: (e) => trocar(lista.find((a) => String(a.id) === e.target.value)) }, lista.map((a) => h('option', { value: String(a.id), selected: a.id === inicial.id }, a.nome)));
  function trocar(anexo) {
    atual?.destruir();
    atual = visor(anexo);
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
  trocar(inicial);
  medindo = { painel, fechar: () => atual?.destruir(), aoFechar };
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
export function secaoProjeto(plano, { somenteLeitura = false, aoMedir = () => {} } = {}) {
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
  }

  function miniatura(anexo) {
    const imagem = h('span', { class: 'p-anexo-imagem' }, icone(ehPdf(anexo) ? 'pdf' : 'olho', 'icone icone-grande'));
    if (!ehPdf(anexo)) {
      urlDoAnexo(anexo)
        .then((url) => substituir(imagem, h('img', { src: url, alt: '' })))
        .catch(() => {});
    } else {
      abrirPdf(anexo)
        .then((doc) => imagem.setAttribute('data-paginas', plural(doc.numPages, 'página', 'páginas')))
        .catch(() => {});
    }
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
      h('small', { class: 'p-anexo-info' }, `${anexo.origem === 'orcamento' ? 'do escritório' : anexo.criado_por_nome || 'plano'} · ${formatarTamanho(anexo.tamanho)}`),
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
  return { elemento: secao, recarregar: carregar };
}

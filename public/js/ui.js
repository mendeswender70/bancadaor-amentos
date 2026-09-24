// Pequenos utilitários de interface. Todo conteúdo digitado pelo usuário é
// inserido como texto (nunca como HTML).

const PROPRIEDADES = new Set(['value', 'checked', 'selected', 'disabled', 'indeterminate']);

export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave.startsWith('on') && typeof valor === 'function') el.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (PROPRIEDADES.has(chave)) el[chave] = valor;
    else el.setAttribute(chave, valor === true ? '' : valor);
  }
  anexar(el, filhos);
  return el;
}

export function anexar(el, filhos) {
  for (const filho of filhos.flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

export function substituir(el, ...filhos) {
  el.replaceChildren();
  return anexar(el, filhos);
}

// Ícones SVG estáticos (conteúdo fixo, não vem do usuário).
const ICONES = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  orcamentos: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.9.7 3.1 2.6 3.5 5.5"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  voltar: '<path d="M15 18l-6-6 6-6"/>',
  lixeira: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  pdf: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 13h1.5a1.5 1.5 0 0 1 0 3H10v-5"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
  compartilhar: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  sair: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  salvar: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
};

export function icone(nome, classe = 'icone') {
  const span = document.createElement('span');
  span.className = classe;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ''}</svg>`;
  return span;
}

// --------------------------------------------------------------------- Avisos

let areaAvisos;
export function aviso(mensagem, tipo = 'sucesso') {
  if (!areaAvisos) {
    areaAvisos = h('div', { class: 'avisos', role: 'status', 'aria-live': 'polite' });
    document.body.append(areaAvisos);
  }
  const el = h('div', { class: `aviso aviso-${tipo}` }, mensagem);
  areaAvisos.append(el);
  setTimeout(() => el.classList.add('saindo'), 3200);
  setTimeout(() => el.remove(), 3600);
}

export function avisoErro(erro) {
  aviso(erro?.message || String(erro), 'erro');
}

// --------------------------------------------------------------------- Modais

/**
 * Abre um diálogo. `montar(fechar)` devolve o conteúdo; `fechar(valor)`
 * encerra o diálogo e resolve a Promise com `valor`.
 */
export function abrirModal(titulo, montar, { largo = false } = {}) {
  return new Promise((resolve) => {
    const dialogo = h('dialog', { class: `modal${largo ? ' modal-largo' : ''}` });
    let encerrado = false;
    const fechar = (valor) => {
      if (encerrado) return;
      encerrado = true;
      dialogo.close();
      dialogo.remove();
      resolve(valor);
    };
    dialogo.addEventListener('cancel', (e) => {
      e.preventDefault();
      fechar(undefined);
    });
    const cabecalho = h(
      'div',
      { class: 'modal-cabecalho' },
      h('h2', {}, titulo),
      h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Fechar', onclick: () => fechar(undefined) }, '×'),
    );
    dialogo.append(cabecalho, h('div', { class: 'modal-corpo' }, montar(fechar)));
    document.body.append(dialogo);
    dialogo.showModal();
    const foco = dialogo.querySelector('[autofocus]');
    if (foco) foco.focus();
  });
}

export function confirmar(mensagem, { titulo = 'Confirmar', sim = 'Confirmar', perigo = false } = {}) {
  return abrirModal(titulo, (fechar) =>
    h(
      'div',
      {},
      h('p', { class: 'modal-texto' }, mensagem),
      h(
        'div',
        { class: 'acoes-modal' },
        h('button', { type: 'button', class: 'botao', onclick: () => fechar(false) }, 'Cancelar'),
        h(
          'button',
          { type: 'button', class: `botao ${perigo ? 'botao-perigo' : 'botao-primario'}`, autofocus: true, onclick: () => fechar(true) },
          sim,
        ),
      ),
    ),
  ).then(Boolean);
}

// ---------------------------------------------------------------- Formulários

let contadorCampos = 0;

/** Campo com rótulo. `controle` é o input/select/textarea. */
export function campo(rotulo, controle, { dica, classe = '' } = {}) {
  const idCampo = controle.id || `campo-${++contadorCampos}`;
  controle.id = idCampo;
  return h(
    'div',
    { class: `campo ${classe}` },
    h('label', { for: idCampo }, rotulo),
    controle,
    dica ? h('small', { class: 'dica' }, dica) : null,
  );
}

/** Botões de escolha única (ex.: R$ | %). */
export function segmentado(opcoes, valorAtual, aoMudar, { rotulo } = {}) {
  const grupo = h('div', { class: 'segmentado', role: 'radiogroup', 'aria-label': rotulo || '' });
  const desenhar = (valor) => {
    grupo.replaceChildren(
      ...opcoes.map(([v, texto]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(v === valor),
            class: v === valor ? 'ativo' : '',
            onclick: () => {
              desenhar(v);
              aoMudar(v);
            },
          },
          texto,
        ),
      ),
    );
  };
  desenhar(valorAtual);
  grupo.definir = desenhar;
  return grupo;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function carregando() {
  return h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Carregando…');
}

export function vazio(texto, ...extras) {
  return h('div', { class: 'vazio' }, h('p', {}, texto), ...extras);
}

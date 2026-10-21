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
  regua: '<path d="M3 15.5L15.5 3 21 8.5 8.5 21z"/><path d="M7 11.5l2 2M10 8.5l2 2M13 5.5l2 2"/>',
  area: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 4v16"/>',
  caixa: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  ambiente: '<path d="M3 21V10l9-7 9 7v11"/><path d="M9 21v-6h6v6"/>',
  pontos: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  cima: '<path d="M6 15l6-6 6 6"/>',
  baixo: '<path d="M6 9l6 6 6-6"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alerta: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>',
  sino: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  preco: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  empresa: '<path d="M4 21V5l8-3v19M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  aprovado: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  usuarioMais: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M19 8v6M16 11h6"/>',
  pagamento: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  baixar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  servico: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4z"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  calculo: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
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
  const el = h('div', { class: `aviso aviso-${tipo}` }, icone(tipo === 'erro' ? 'alerta' : 'check'), h('span', {}, mensagem));
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

/** Estado vazio com ícone, título e texto. */
export function vazioIlustrado(nomeIcone, titulo, texto, ...extras) {
  return h(
    'div',
    { class: 'vazio' },
    h('span', { class: 'selo-icone' }, icone(nomeIcone, 'icone icone-grande')),
    h('strong', {}, titulo),
    texto ? h('p', {}, texto) : null,
    ...extras,
  );
}

/** Logo do esquadro (ícone + nome). */
export function marcaEsquadro(classe = '') {
  return h(
    'span',
    { class: `marca-esquadro ${classe}` },
    h('img', { src: '/icons/esquadro.svg', alt: '', width: '40', height: '40' }),
    h('span', {}, 'esquadro'),
  );
}

/** "hoje", "ontem", "há 3 dias" (a partir de uma data ISO). */
export function haQuanto(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const inicio = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((inicio(new Date()) - inicio(d)) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/** Dias de hoje até uma data "AAAA-MM-DD" (negativo se já passou). */
export function diasAte(isoData) {
  const [a, m, d] = String(isoData).slice(0, 10).split('-').map(Number);
  const agora = new Date();
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86_400_000);
}

/** Copia um texto para a área de transferência. */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const campo = h('textarea', { value: texto, readonly: true });
    // estilo pelo CSSOM (atributo style é bloqueado pela CSP)
    Object.assign(campo.style, { position: 'fixed', opacity: '0' });
    document.body.append(campo);
    campo.select();
    const ok = document.execCommand?.('copy');
    campo.remove();
    return Boolean(ok);
  }
}

/** Iniciais para avatar: "João da Silva" → "JS". */
export function iniciais(nome) {
  const partes = String(nome || '?')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  const lista = partes.length ? partes : [String(nome || '?')];
  return ((lista[0]?.[0] || '') + (lista.length > 1 ? lista[lista.length - 1][0] : '')).toUpperCase() || '?';
}

let menuAberto = null;
document.addEventListener('click', (e) => {
  if (menuAberto && !menuAberto.contains(e.target)) fecharMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharMenu();
});
function fecharMenu() {
  menuAberto?.querySelector('.menu-opcoes')?.remove();
  menuAberto?.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
  menuAberto = null;
}

/**
 * Botão "⋯" com lista de ações.
 * @param {Array<[string, string, Function, {perigo?: boolean, desativado?: boolean}] | '-'>} opcoes
 */
export function menuSuspenso(opcoes, { rotulo = 'Mais opções' } = {}) {
  const raiz = h('div', { class: 'menu-suspenso' });
  const botao = h('button', {
    type: 'button',
    class: 'botao-icone',
    'aria-label': rotulo,
    title: rotulo,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    onclick: (e) => {
      e.stopPropagation();
      const estavaAberto = menuAberto === raiz;
      fecharMenu();
      if (estavaAberto) return;
      const lista = h(
        'div',
        { class: 'menu-opcoes', role: 'menu' },
        opcoes.map((op) =>
          op === '-'
            ? h('hr', {})
            : h(
                'button',
                {
                  type: 'button',
                  role: 'menuitem',
                  class: op[3]?.perigo ? 'perigo' : '',
                  disabled: Boolean(op[3]?.desativado),
                  onclick: () => {
                    fecharMenu();
                    op[2]();
                  },
                },
                icone(op[0]),
                op[1],
              ),
        ),
      );
      raiz.append(lista);
      // Perto do fim da tela, abre para cima (o menu inferior do celular cobre a parte de baixo).
      const limite = window.innerHeight - (window.innerWidth < 1024 ? 90 : 16);
      if (lista.getBoundingClientRect().bottom > limite) lista.classList.add('para-cima');
      botao.setAttribute('aria-expanded', 'true');
      menuAberto = raiz;
      lista.querySelector('button:not(:disabled)')?.focus();
    },
  }, icone('pontos'));
  raiz.append(botao);
  return raiz;
}

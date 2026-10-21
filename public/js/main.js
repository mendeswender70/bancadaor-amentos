import { api, cache, quandoPerderSessao } from './api.js';
import { h, anexar, icone, substituir, carregando, avisoErro, campo, aviso, iniciais, marcaEsquadro, abrirModal } from './ui.js';
import { novidades } from './novidades.js';
import { paginaDashboard } from './pages/dashboard.js';
import { paginaOrcamentos } from './pages/orcamentos.js';
import { paginaNovoOrcamento } from './pages/novo.js';
import { paginaEditor } from './pages/editor.js';
import { paginaClientes, paginaCliente } from './pages/clientes.js';
import { paginaConfiguracoes } from './pages/config.js';
import { paginaAvisos } from './pages/avisos.js';

const raiz = document.getElementById('app');
let usuario = null;

// ------------------------------------------------------------------ Rotas

const ROTAS = [
  [/^\/?$/, () => paginaDashboard()],
  [/^\/orcamentos$/, (_, q) => paginaOrcamentos(q)],
  [/^\/orcamentos\/novo$/, () => paginaNovoOrcamento()],
  [/^\/orcamentos\/novo\/(\d+)$/, ([clienteId]) => paginaEditor({ clienteId: Number(clienteId) })],
  [/^\/orcamentos\/(\d+)$/, ([id]) => paginaEditor({ id: Number(id) })],
  [/^\/clientes$/, () => paginaClientes()],
  [/^\/clientes\/(\d+)$/, ([id]) => paginaCliente(Number(id))],
  [/^\/config(?:\/(\w+))?$/, ([aba]) => paginaConfiguracoes(aba)],
  [/^\/avisos$/, () => paginaAvisos()],
];

// Uma página pode registrar uma verificação antes de sair (ex.: alterações não salvas).
let verificarSaida = null;
export function aoSairDaPagina(fn) {
  verificarSaida = fn;
}

let hashAtual = location.hash;
let ignorarProxima = false;

async function rotear() {
  if (ignorarProxima) {
    ignorarProxima = false;
    return;
  }
  if (verificarSaida && !(await verificarSaida())) {
    ignorarProxima = true;
    location.hash = hashAtual;
    return;
  }
  verificarSaida = null;
  hashAtual = location.hash;

  const [caminho, busca = ''] = location.hash.replace(/^#/, '').split('?');
  if (!usuario) return mostrarAcesso();

  const conteudo = document.getElementById('conteudo');
  if (!conteudo) montarLayout();
  marcarMenu(caminho);
  const alvo = document.getElementById('conteudo');
  substituir(alvo, carregando());
  window.scrollTo(0, 0);

  for (const [padrao, pagina] of ROTAS) {
    const m = padrao.exec(caminho || '/');
    if (!m) continue;
    try {
      const el = await pagina(m.slice(1), new URLSearchParams(busca));
      if (hashAtual === location.hash) substituir(alvo, el);
    } catch (erro) {
      if (erro.status === 401) return;
      substituir(alvo, h('div', { class: 'vazio' }, h('p', {}, erro.message)));
    }
    return;
  }
  substituir(alvo, h('div', { class: 'vazio' }, h('p', {}, 'Página não encontrada.'), h('a', { href: '#/' }, 'Voltar ao início')));
}

window.addEventListener('hashchange', rotear);
window.addEventListener('beforeunload', (e) => {
  if (verificarSaida?.sincrono?.() === false) {
    e.preventDefault();
    e.returnValue = '';
  }
});

export function irPara(hash) {
  location.hash = hash;
}

/** Troca o endereço sem recarregar a página (ex.: orçamento novo que acabou de ganhar número). */
export function substituirEndereco(hash) {
  history.replaceState(null, '', hash);
  hashAtual = location.hash;
}

// ------------------------------------------------------------------ Layout

const MENU = [
  ['#/', 'Início', 'inicio', /^\/?$/],
  ['#/orcamentos', 'Orçamentos', 'orcamentos', /^\/orcamentos(?!\/novo)/],
  ['#/clientes', 'Clientes', 'clientes', /^\/clientes/],
  ['#/config', 'Ajustes', 'config', /^\/config/],
];

export const usuarioAtual = () => usuario;

/**
 * Logo da empresa (ou as iniciais do nome). Logos compridas ganham um
 * espaço retangular em vez de ficarem espremidas no quadradinho.
 */
export function monograma() {
  const e = cache.empresa;
  const caixa = h('span', { class: 'monograma', 'aria-hidden': 'true' });
  if (!e?.tem_logo) return anexar(caixa, [iniciais(e?.nome || 'O')]);
  const img = h('img', { src: `/api/empresa/logo?v=${encodeURIComponent(e.logo_atualizado_em || '')}`, alt: '' });
  img.addEventListener('load', () => {
    const largo = img.naturalWidth / Math.max(1, img.naturalHeight) > 1.4;
    caixa.classList.toggle('monograma-largo', largo);
    caixa.closest('.lateral-marca')?.classList.toggle('com-logo-larga', largo);
  });
  return anexar(caixa, [img]);
}

function montarLayout() {
  const empresa = cache.empresa;
  const link = ([href, texto, ic, padrao], rotuloCurto) =>
    h('a', { href, class: 'menu-link', 'data-padrao': padrao.source }, icone(ic), h('span', {}, rotuloCurto || texto));

  substituir(
    raiz,
    h(
      'div',
      { class: 'estrutura' },
      h(
        'aside',
        { class: 'lateral', 'aria-label': 'Menu principal' },
        h(
          'a',
          { href: '#/', class: 'lateral-marca' },
          monograma(),
          h('div', {}, h('strong', { class: 'marca-nome' }, empresa?.nome || 'Orçamentos'), h('small', {}, 'Orçamentos de móveis')),
        ),
        h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario lateral-novo' }, icone('mais'), 'Novo orçamento'),
        h('nav', { class: 'lateral-nav' }, MENU.map((m) => link(m))),
        botaoNovidades('lateral'),
        h('a', { href: '#/config/conta', class: 'lateral-assinatura', title: 'esquadro' }, marcaEsquadro('marca-mini')),
        h(
          'div',
          { class: 'lateral-rodape' },
          h(
            'a',
            { href: '#/config/conta', class: 'lateral-usuario', title: 'Minha conta' },
            h('span', { class: 'avatar' }, iniciais(usuario?.nome)),
            h('div', {}, h('strong', {}, usuario?.nome || ''), h('small', {}, usuario?.email || '')),
          ),
          h('button', { type: 'button', class: 'botao-icone', title: 'Sair', 'aria-label': 'Sair', onclick: sair }, icone('sair')),
        ),
      ),
      h(
        'div',
        { class: 'area-principal' },
        h(
          'header',
          { class: 'topo' },
          h('a', { href: '#/', class: 'topo-marca' }, monograma(), h('span', { class: 'marca-nome' }, empresa?.nome || 'Orçamentos')),
          botaoNovidades('topo'),
          h('a', { href: '#/config/conta', class: 'avatar topo-avatar', title: 'Minha conta', 'aria-label': 'Minha conta' }, iniciais(usuario?.nome)),
        ),
        h('main', { id: 'conteudo', class: 'conteudo' }),
      ),
      h(
        'nav',
        { class: 'menu-inferior', 'aria-label': 'Menu' },
        link(MENU[0]),
        link(MENU[1]),
        h('a', { href: '#/orcamentos/novo', class: 'botao-central', 'aria-label': 'Novo orçamento' }, h('span', {}, icone('mais')), h('span', {}, 'Novo')),
        link(MENU[2]),
        link(MENU[3]),
      ),
    ),
  );
  queueMicrotask(atualizarIndicadorNovidades);
}

const CHAVE_NOVIDADES_LIDAS = 'esquadro.novidades.lidas';
const CHAVE_AVISOS_LIDAS = 'esquadro.avisos.lidas';

function idsNovidadesLidas() {
  try {
    const ids = JSON.parse(localStorage.getItem(CHAVE_NOVIDADES_LIDAS) || '[]');
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function botaoNovidades(posicao) {
  const botao = h(
    'button',
    { type: 'button', class: `botao-novidades botao-novidades-${posicao}`, title: 'Ver avisos e novidades', 'aria-label': 'Ver avisos e novidades', onclick: () => irPara('#/avisos') },
    icone('sino'),
    h('span', { class: 'botao-novidades-texto' }, 'Avisos'),
    h('span', { class: 'botao-novidades-ponto', 'aria-hidden': 'true', hidden: true }),
  );
  const badge = botao.querySelector('.botao-novidades-ponto');
  badge.hidden = novidades.every((n) => idsNovidadesLidas().has(n.id));
  return botao;
}

async function atualizarIndicadorNovidades() {
  const novidadesPendentes = novidades.filter((n) => !idsNovidadesLidas().has(n.id)).length;
  let avisosPendentes = 0;
  if (usuario) {
    try {
      const dados = await api.get('/dashboard');
      const lidos = new Set(JSON.parse(localStorage.getItem(CHAVE_AVISOS_LIDAS) || '[]'));
      avisosPendentes = (dados.atencao || []).filter((a) => !lidos.has(`${a.motivo}:${a.id}:${a.quando}`)).length;
    } catch {
      // O indicador de avisos não deve interromper a navegação se a rede falhar.
    }
  }
  const total = novidadesPendentes + avisosPendentes;
  for (const botao of document.querySelectorAll('.botao-novidades')) {
    const badge = botao.querySelector('.botao-novidades-ponto');
    badge.hidden = !total;
    badge.textContent = total > 9 ? '9+' : String(total || '');
  }
}

window.addEventListener('esquadro:avisos-lidos', atualizarIndicadorNovidades);

async function abrirNovidades({ somenteNaoLidas = false } = {}) {
  const lidas = idsNovidadesLidas();
  const entradas = novidades.filter((n) => !somenteNaoLidas || !lidas.has(n.id));
  if (!entradas.length) return;

  await abrirModal('Novidades do esquadro', (fechar) =>
    h(
      'div',
      { class: 'lista-novidades' },
      entradas.map((n) =>
        h(
          'article',
          { class: 'novidade' },
          h('time', { class: 'novidade-data' }, n.data),
          h('h3', {}, n.titulo),
          h('ul', {}, n.itens.map((item) => h('li', {}, item))),
        ),
      ),
      h('div', { class: 'acoes-modal' }, h('button', { type: 'button', class: 'botao botao-primario', autofocus: true, onclick: () => fechar(true) }, 'Entendi')),
    ),
  );

  try {
    const ids = new Set([...idsNovidadesLidas(), ...entradas.map((n) => n.id)]);
    localStorage.setItem(CHAVE_NOVIDADES_LIDAS, JSON.stringify([...ids]));
  } catch {
    // Se o armazenamento local estiver bloqueado, a novidade pode reaparecer na próxima visita.
  }
  atualizarIndicadorNovidades();
}

export function atualizarMarca() {
  for (const el of raiz.querySelectorAll('.marca-nome')) el.textContent = cache.empresa?.nome || 'Orçamentos';
  for (const el of raiz.querySelectorAll('.monograma')) el.replaceWith(monograma());
}

function marcarMenu(caminho) {
  for (const link of raiz.querySelectorAll('.menu-link')) {
    const ativo = new RegExp(link.getAttribute('data-padrao')).test(caminho || '/');
    link.classList.toggle('ativo', ativo);
    if (ativo) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

export async function sair() {
  if (verificarSaida && !(await verificarSaida())) return;
  verificarSaida = null;
  await api.post('/auth/sair').catch(() => {});
  usuario = null;
  cache.empresa = null;
  mostrarAcesso();
}

// ------------------------------------------------------ Login / primeiro acesso

async function mostrarAcesso() {
  const estado = await api.get('/auth/estado');
  if (estado.usuario) {
    usuario = estado.usuario;
    await cache.carregarEmpresa();
    montarLayout();
    await abrirNovidades({ somenteNaoLidas: true });
    return rotear();
  }
  substituir(raiz, estado.precisa_configurar ? telaConfigurar() : telaEntrar());
}

function cartaoAcesso(titulo, subtitulo, formulario, { etiqueta = 'ACESSO PRIVADO' } = {}) {
  return h(
    'div',
    { class: 'acesso' },
    h(
      'section',
      { class: 'acesso-marca' },
      h('header', { class: 'acesso-topo' }, marcaEsquadro('marca-clara')),
      h(
        'div',
        { class: 'acesso-chamada' },
        h('span', { class: 'acesso-chamada-etiqueta' }, 'PRECISÃO EM CADA DETALHE'),
        h('h2', {}, 'Seus projetos. Seus números. No esquadro.'),
        h('p', {}, 'Sua marcenaria organizada, do primeiro cálculo ao orçamento aprovado.'),
      ),
    ),
    h(
      'div',
      { class: 'acesso-lado' },
      h(
        'div',
        { class: 'acesso-cartao' },
        h('span', { class: 'acesso-etiqueta' }, etiqueta),
        h('h1', {}, titulo),
        subtitulo ? h('p', { class: 'acesso-subtitulo' }, subtitulo) : null,
        formulario,
        h('div', { class: 'acesso-seguranca' }, icone('cadeado'), h('span', {}, 'Seus dados e orçamentos ficam protegidos.')),
      ),
    ),
  );
}

function telaEntrar() {
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'voce@suaempresa.com.br', required: true });
  const senha = h('input', { id: 'senha-acesso', type: 'password', autocomplete: 'current-password', required: true });
  const mostrarSenha = h('button', {
    type: 'button',
    class: 'mostrar-senha',
    'aria-pressed': 'false',
    onclick: () => {
      const visivel = senha.type === 'password';
      senha.type = visivel ? 'text' : 'password';
      mostrarSenha.textContent = visivel ? 'Ocultar' : 'Mostrar';
      mostrarSenha.setAttribute('aria-pressed', String(visivel));
    },
  }, 'Mostrar');
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Entrar');
  const form = h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        try {
          await api.post('/auth/entrar', { email: email.value, senha: senha.value });
          await mostrarAcesso();
        } catch (erro) {
          avisoErro(erro);
          botao.disabled = false;
        }
      },
    },
    campo('E-mail', email),
    h('div', { class: 'campo' }, h('label', { for: senha.id }, 'Senha'), h('div', { class: 'campo-controle-senha' }, senha, mostrarSenha)),
    botao,
  );
  return cartaoAcesso('Bem-vindo de volta', 'Entre para acompanhar seus orçamentos e manter sua marcenaria em movimento.', form);
}

function telaConfigurar() {
  const empresa = h('input', { type: 'text', autocomplete: 'organization', placeholder: 'Ex.: Marcenaria Silva' });
  const nome = h('input', { type: 'text', autocomplete: 'name', required: true });
  const email = h('input', { type: 'email', autocomplete: 'username', required: true });
  const senha = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '6' });
  const confirmar = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '6' });
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Começar');
  const form = h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        if (senha.value !== confirmar.value) return aviso('As senhas não conferem.', 'erro');
        botao.disabled = true;
        try {
          await api.post('/auth/configurar', {
            empresa: empresa.value,
            nome: nome.value,
            email: email.value,
            senha: senha.value,
          });
          location.hash = '#/config/empresa';
          await mostrarAcesso();
          aviso('Tudo pronto! Confira os dados da empresa e os preços.');
        } catch (erro) {
          avisoErro(erro);
          botao.disabled = false;
        }
      },
    },
    campo('Nome da empresa', empresa),
    campo('Seu nome', nome),
    campo('E-mail (para entrar no sistema)', email),
    campo('Senha', senha, { dica: 'Pelo menos 6 caracteres.' }),
    campo('Confirme a senha', confirmar),
    botao,
  );
  return cartaoAcesso('Vamos começar', 'Configure sua empresa e prepare seu primeiro orçamento.', form, { etiqueta: 'PRIMEIRO ACESSO' });
}

quandoPerderSessao(() => {
  if (!usuario) return;
  usuario = null;
  verificarSaida = null;
  aviso('Sua sessão expirou. Entre novamente.', 'erro');
  mostrarAcesso();
});

mostrarAcesso().catch((erro) => substituir(raiz, h('div', { class: 'vazio' }, h('p', {}, erro.message))));

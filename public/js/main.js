import { api, cache, quandoPerderSessao } from './api.js';
import { h, icone, substituir, carregando, avisoErro, campo, aviso, iniciais } from './ui.js';
import { paginaDashboard } from './pages/dashboard.js';
import { paginaOrcamentos } from './pages/orcamentos.js';
import { paginaNovoOrcamento } from './pages/novo.js';
import { paginaEditor } from './pages/editor.js';
import { paginaClientes, paginaCliente } from './pages/clientes.js';
import { paginaConfiguracoes } from './pages/config.js';

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

// ------------------------------------------------------------------ Layout

const MENU = [
  ['#/', 'Início', 'inicio', /^\/?$/],
  ['#/orcamentos', 'Orçamentos', 'orcamentos', /^\/orcamentos(?!\/novo)/],
  ['#/clientes', 'Clientes', 'clientes', /^\/clientes/],
  ['#/config', 'Configurações', 'config', /^\/config/],
];

export const usuarioAtual = () => usuario;

/** Quadradinho com a logo da empresa (ou as iniciais do nome). */
export function monograma() {
  const e = cache.empresa;
  return h(
    'span',
    { class: 'monograma', 'aria-hidden': 'true' },
    e?.tem_logo ? h('img', { src: `/api/empresa/logo?v=${encodeURIComponent(e.logo_atualizado_em || '')}`, alt: '' }) : iniciais(e?.nome || 'O'),
  );
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
        h(
          'div',
          { class: 'lateral-rodape' },
          h('span', { class: 'avatar' }, iniciais(usuario?.nome)),
          h('div', {}, h('strong', {}, usuario?.nome || ''), h('small', {}, usuario?.email || '')),
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
          h('button', { type: 'button', class: 'botao-icone', title: 'Sair', 'aria-label': 'Sair', onclick: sair }, icone('sair')),
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
        link(MENU[3], 'Ajustes'),
      ),
    ),
  );
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

async function sair() {
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
    return rotear();
  }
  substituir(raiz, estado.precisa_configurar ? telaConfigurar() : telaEntrar());
}

function cartaoAcesso(titulo, subtitulo, formulario) {
  const vantagem = (texto) => h('li', {}, icone('check'), texto);
  return h(
    'div',
    { class: 'acesso' },
    h(
      'section',
      { class: 'acesso-marca' },
      h('span', { class: 'monograma' }, icone('orcamentos')),
      h(
        'div',
        {},
        h('h2', {}, 'Orçamentos de móveis planejados em poucos minutos.'),
        h(
          'ul',
          {},
          vantagem('Cálculo automático por metro linear, m² ou unidade'),
          vantagem('Móveis organizados por ambiente'),
          vantagem('PDF profissional sem mostrar seu preço por metro'),
          vantagem('Envio direto pelo WhatsApp'),
        ),
      ),
      h('small', {}, 'Sistema de orçamentos para marcenaria'),
    ),
    h(
      'div',
      { class: 'acesso-lado' },
      h(
        'div',
        { class: 'acesso-cartao' },
        h('span', { class: 'monograma' }, icone('orcamentos')),
        h('h1', {}, titulo),
        subtitulo ? h('p', { class: 'suave' }, subtitulo) : null,
        formulario,
      ),
    ),
  );
}

function telaEntrar() {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, autofocus: true });
  const senha = h('input', { type: 'password', autocomplete: 'current-password', required: true });
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
    campo('Senha', senha),
    botao,
  );
  setTimeout(() => email.focus());
  return cartaoAcesso('Entrar', 'Sistema de orçamentos de móveis planejados', form);
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
  setTimeout(() => empresa.focus());
  return cartaoAcesso('Bem-vindo!', 'Crie o acesso do administrador para começar a usar o sistema.', form);
}

quandoPerderSessao(() => {
  if (!usuario) return;
  usuario = null;
  verificarSaida = null;
  aviso('Sua sessão expirou. Entre novamente.', 'erro');
  mostrarAcesso();
});

mostrarAcesso().catch((erro) => substituir(raiz, h('div', { class: 'vazio' }, h('p', {}, erro.message))));

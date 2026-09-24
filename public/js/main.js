import { api, cache, quandoPerderSessao } from './api.js';
import { h, icone, substituir, carregando, avisoErro, campo, aviso } from './ui.js';
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
  ['#/orcamentos', 'Orçamentos', 'orcamentos', /^\/orcamentos/],
  ['#/clientes', 'Clientes', 'clientes', /^\/clientes/],
  ['#/config', 'Configurações', 'config', /^\/config/],
];

function montarLayout() {
  const empresa = cache.empresa;
  const links = (classe) =>
    MENU.map(([href, texto, ic, padrao]) =>
      h('a', { href, class: classe, 'data-padrao': padrao.source }, icone(ic), h('span', {}, texto)),
    );
  substituir(
    raiz,
    h(
      'header',
      { class: 'topo' },
      h(
        'div',
        { class: 'topo-interno' },
        h('a', { href: '#/', class: 'marca' }, empresa?.nome || 'Orçamentos'),
        h('nav', { class: 'menu-topo', 'aria-label': 'Menu principal' }, links('menu-link')),
        h(
          'button',
          { type: 'button', class: 'botao-sair', title: 'Sair', onclick: sair },
          icone('sair'),
          h('span', {}, 'Sair'),
        ),
      ),
    ),
    h('main', { id: 'conteudo', class: 'conteudo' }),
    h('nav', { class: 'menu-inferior', 'aria-label': 'Menu' }, links('menu-link')),
  );
}

export function atualizarMarca() {
  const marca = raiz.querySelector('.marca');
  if (marca) marca.textContent = cache.empresa?.nome || 'Orçamentos';
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
  return h(
    'div',
    { class: 'acesso' },
    h('div', { class: 'acesso-cartao' }, h('h1', {}, titulo), subtitulo ? h('p', { class: 'suave' }, subtitulo) : null, formulario),
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

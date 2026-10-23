import { api, cache, quandoPerderSessao } from './api.js';
import { h, anexar, icone, substituir, avisoErro, campo, aviso, iniciais, marcaEsquadro, abrirModal } from './ui.js';
import { novidades } from './novidades.js';
import { paginaDashboard } from './pages/dashboard.js';
import { paginaOrcamentos } from './pages/orcamentos.js';
import { paginaNovoOrcamento } from './pages/novo.js';
import { paginaEditor } from './pages/editor.js';
import { paginaClientes, paginaCliente, paginaEditarCliente } from './pages/clientes.js';
import { paginaConfiguracoes } from './pages/config.js';
import { paginaAvisos } from './pages/avisos.js';
import { ativarReflexoVidro } from './reflexo-vidro.js';

const raiz = document.getElementById('app');
let usuario = null;
let pararReflexoAcesso = () => {};
let intervaloVersao = null;
let avisoVersaoAtivo = null;

function limparReflexoAcesso() {
  const parar = pararReflexoAcesso;
  pararReflexoAcesso = () => {};
  parar();
}

// ------------------------------------------------------------------ Rotas

const ROTAS = [
  [/^\/?$/, () => paginaDashboard()],
  [/^\/orcamentos$/, (_, q) => paginaOrcamentos(q)],
  [/^\/orcamentos\/novo$/, () => paginaNovoOrcamento()],
  [/^\/orcamentos\/novo\/(\d+)$/, ([clienteId]) => paginaEditor({ clienteId: Number(clienteId) })],
  [/^\/orcamentos\/(\d+)$/, ([id]) => paginaEditor({ id: Number(id) })],
  [/^\/clientes$/, () => paginaClientes()],
  [/^\/clientes\/(\d+)$/, ([id]) => paginaCliente(Number(id))],
  [/^\/clientes\/(\d+)\/editar$/, ([id]) => paginaEditarCliente(Number(id))],
  [/^\/config(?:\/(\w+))?$/, ([aba]) => paginaConfiguracoes(aba)],
  [/^\/avisos$/, () => paginaAvisos()],
];

// Uma página pode registrar uma verificação antes de sair (ex.: alterações não salvas).
let verificarSaida = null;
export function aoSairDaPagina(fn, rota = location.hash) {
  if (rota === location.hash) verificarSaida = fn;
}

let hashAtual = location.hash;
let ignorarProxima = false;
let sequenciaRota = 0;
let saidaEmAndamento = null;

async function rotear() {
  if (ignorarProxima) {
    ignorarProxima = false;
    return;
  }
  const sequencia = ++sequenciaRota;
  if (verificarSaida) {
    // Toques rápidos no menu compartilham a mesma confirmação de descarte.
    saidaEmAndamento ??= verificarSaida().finally(() => { saidaEmAndamento = null; });
    const podeSair = await saidaEmAndamento;
    if (sequencia !== sequenciaRota) return;
    if (!podeSair) {
      ignorarProxima = true;
      location.hash = hashAtual;
      return;
    }
  }
  verificarSaida = null;
  const hashDaRota = location.hash;
  hashAtual = hashDaRota;

  const [caminho, busca = ''] = location.hash.replace(/^#/, '').split('?');
  if (!usuario) return mostrarAcesso();

  const conteudo = document.getElementById('conteudo');
  if (!conteudo) montarLayout();
  marcarMenu(caminho);
  const alvo = document.getElementById('conteudo');
  // Mantém a tela anterior visível até a próxima página terminar de buscar os
  // dados. O spinner em tela cheia causava uma piscada preta em cada navegação.
  alvo.setAttribute('aria-busy', 'true');
  window.scrollTo(0, 0);

  for (const [padrao, pagina] of ROTAS) {
    const m = padrao.exec(caminho || '/');
    if (!m) continue;
    try {
      const el = await pagina(m.slice(1), new URLSearchParams(busca));
      if (sequencia === sequenciaRota && hashDaRota === location.hash) substituir(alvo, el);
    } catch (erro) {
      if (erro.status === 401) return;
      if (sequencia === sequenciaRota && hashDaRota === location.hash) substituir(alvo, h('div', { class: 'vazio' }, h('p', {}, erro.message)));
    } finally {
      if (sequencia === sequenciaRota && hashDaRota === location.hash) alvo.removeAttribute('aria-busy');
    }
    return;
  }
  substituir(alvo, h('div', { class: 'vazio' }, h('p', {}, 'Página não encontrada.'), h('a', { href: '#/' }, 'Voltar ao início')));
  alvo.removeAttribute('aria-busy');
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
          marcaEsquadro('marca-app marca-lateral'),
        ),
        h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario lateral-novo' }, icone('mais'), 'Novo orçamento'),
        h('nav', { class: 'lateral-nav' }, MENU.map((m) => link(m))),
        botaoNovidades('lateral'),
        h(
          'div',
          { class: 'lateral-rodape' },
          h(
            'a',
            { href: '#/config/conta', class: 'lateral-usuario', title: 'Minha conta' },
            h('span', { class: 'avatar' }, iniciais(usuario?.nome)),
            h('div', {}, h('strong', {}, usuario?.nome || ''), h('small', {}, 'Minha conta')),
          ),
        ),
      ),
      h(
        'div',
        { class: 'area-principal' },
        h(
          'header',
          { class: 'topo' },
          h('a', { href: '#/', class: 'topo-marca' }, marcaEsquadro('marca-app marca-mobile')),
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

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((erro) => {
    console.warn('Notificações do PWA indisponíveis:', erro?.message || erro);
  });
}

function avisarNovaVersao() {
  if (avisoVersaoAtivo) return;
  const atualizar = () => location.reload();
  const dispensar = () => {
    avisoVersaoAtivo?.remove();
    avisoVersaoAtivo = null;
  };
  avisoVersaoAtivo = h(
    'div',
    { class: 'atualizacao-disponivel', role: 'status', 'aria-live': 'polite' },
    icone('historico'),
    h('div', {}, h('strong', {}, 'Nova versão disponível'), h('span', {}, 'Atualize para ver as novidades.')),
    h('button', { type: 'button', class: 'botao botao-primario botao-pequeno', onclick: atualizar }, 'Atualizar'),
    h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Depois', title: 'Depois', onclick: dispensar }, '×'),
  );
  document.body.append(avisoVersaoAtivo);
}

function pararMonitorVersao() {
  if (intervaloVersao) clearInterval(intervaloVersao);
  intervaloVersao = null;
  avisoVersaoAtivo?.remove();
  avisoVersaoAtivo = null;
}

function iniciarMonitorVersao() {
  pararMonitorVersao();
  const versaoDaAba = novidades[0]?.id || 'inicio';
  let versaoAvisada = null;
  let consultando = false;
  const conferir = async () => {
    if (consultando || !usuario) return;
    consultando = true;
    try {
      const atual = (await api.get('/versao')).versao;
      if (atual !== versaoDaAba && atual !== versaoAvisada) {
        versaoAvisada = atual;
        avisarNovaVersao();
      }
    } catch {
      // A próxima verificação tenta de novo quando a rede ou o servidor voltar.
    } finally {
      consultando = false;
    }
  };
  conferir();
  intervaloVersao = setInterval(conferir, 45_000);
}


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
  pararMonitorVersao();
  await api.post('/auth/sair').catch(() => {});
  usuario = null;
  cache.empresa = null;
  mostrarAcesso();
}

// ------------------------------------------------------ Login / primeiro acesso

async function mostrarAcesso() {
  const estado = await api.get('/auth/estado');
  if (estado.usuario) {
    limparReflexoAcesso();
    usuario = estado.usuario;
    await cache.carregarEmpresa();
    montarLayout();
    registrarServiceWorker();
    iniciarMonitorVersao();
    await abrirNovidades({ somenteNaoLidas: true });
    return rotear();
  }
  limparReflexoAcesso();
  substituir(raiz, estado.precisa_configurar ? telaConfigurar(estado.configuracao_inicial_habilitada) : telaEntrar());
  pararReflexoAcesso = ativarReflexoVidro(raiz);
}

function medidorAcesso(input, controle = input, limite = 30) {
  void input;
  void limite;
  return controle;
}

function cartaoAcesso(titulo, subtitulo, formulario, { etiqueta = 'ACESSO PRIVADO', subtituloMobile = '', classe = '' } = {}) {
  return h(
    'div',
    { class: `acesso${classe ? ` ${classe}` : ''}` },
    h(
      'section',
      { class: 'acesso-marca' },
      h('header', { class: 'acesso-topo' }, marcaEsquadro('marca-clara')),
      h(
        'div',
        { class: 'acesso-chamada' },
        h('span', { class: 'acesso-chamada-etiqueta' }, 'PRECISÃO EM CADA DETALHE'),
        h('h2', { 'aria-label': 'Seus projetos. Seus números. No esquadro.' },
          h('span', { class: 'acesso-titulo-mobile' },
            h('span', {}, 'Seus projetos. Seus'),
            h('span', {}, 'números. No'),
            h('span', {}, 'esquadro.'),
          ),
          h('span', { class: 'acesso-titulo-desktop' },
            h('span', {}, 'Seus projetos.'),
            h('span', {}, 'Seus números.'),
            h('span', {}, 'No esquadro.'),
          ),
        ),
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
        subtitulo ? h('p', { class: 'acesso-subtitulo' },
          subtituloMobile ? h('span', { class: 'acesso-subtitulo-desktop' }, subtitulo) : null,
          h('span', { class: subtituloMobile ? 'acesso-subtitulo-mobile' : '' }, subtituloMobile || subtitulo),
        ) : null,
        formulario,
        h('div', { class: 'acesso-seguranca' }, icone('cadeado'), h('span', {}, 'Seus dados ficam protegidos.')),
      ),
    ),
  );
}

function telaEntrar() {
  const email = h('input', { id: 'email-acesso', type: 'email', autocomplete: 'username', placeholder: 'voce@suaempresa.com.br', required: true });
  const senha = h('input', { id: 'senha-acesso', type: 'password', autocomplete: 'current-password', placeholder: '••••••••', required: true });
  const avisoCapsLock = h('small', { class: 'acesso-caps-lock', role: 'status', 'aria-live': 'polite' }, 'Caps Lock ativado');
  avisoCapsLock.hidden = true;
  const atualizarCapsLock = (evento) => { avisoCapsLock.hidden = !evento.getModifierState?.('CapsLock'); };
  senha.addEventListener('keydown', atualizarCapsLock);
  senha.addEventListener('keyup', atualizarCapsLock);
  senha.addEventListener('blur', () => { avisoCapsLock.hidden = true; });
  const mostrarSenha = h('button', {
    type: 'button',
    class: 'mostrar-senha acesso-senha-alternar',
    'aria-label': 'Mostrar senha',
    'aria-controls': senha.id,
    'aria-pressed': 'false',
    onclick: () => {
      const visivel = senha.type === 'password';
      senha.type = visivel ? 'text' : 'password';
      mostrarSenha.textContent = visivel ? 'Ocultar' : 'Mostrar';
      mostrarSenha.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
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
        botao.setAttribute('aria-busy', 'true');
        botao.replaceChildren(icone('serra', 'icone acesso-serra'), h('span', {}, 'Entrando…'));
        try {
          await api.post('/auth/entrar', { email: email.value, senha: senha.value });
          await mostrarAcesso();
        } catch (erro) {
          avisoErro(erro);
          botao.disabled = false;
          botao.removeAttribute('aria-busy');
          botao.replaceChildren('Entrar');
        }
      },
    },
    h('div', { class: 'campo' }, h('label', { for: email.id }, 'E-mail'), medidorAcesso(email, email, 36)),
    h('div', { class: 'campo' }, h('label', { for: senha.id }, 'Senha'), medidorAcesso(senha, h('div', { class: 'campo-controle-senha acesso-senha-controle' }, senha, mostrarSenha), 20), avisoCapsLock),
    botao,
  );
  return cartaoAcesso('Bem-vindo de volta', 'Entre para acompanhar seus orçamentos e manter sua marcenaria em movimento.', form, {
    subtituloMobile: 'Entre para acompanhar seus orçamentos.',
  });
}

function telaConfigurar(habilitada) {
  if (!habilitada) {
    const avisoConfiguracao = h(
      'div',
      { class: 'formulario' },
      h('p', { class: 'suave' }, 'A criação do primeiro administrador está bloqueada até que a pessoa responsável autorize a configuração inicial.'),
      h('p', { class: 'suave pequeno' }, 'Configure INITIAL_ADMIN_SETUP_SECRET nas variáveis da Vercel e recarregue esta página.'),
    );
    return cartaoAcesso('Configuração protegida', 'O primeiro acesso exige uma autorização de uso único.', avisoConfiguracao, {
      etiqueta: 'PRIMEIRO ACESSO',
      classe: 'acesso-configuracao',
    });
  }
  const chave = h('input', { type: 'password', autocomplete: 'off', required: true });
  const empresa = h('input', { type: 'text', autocomplete: 'organization', placeholder: 'Nome da marcenaria' });
  const nome = h('input', { type: 'text', autocomplete: 'name', placeholder: 'Seu nome completo', required: true });
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'voce@suaempresa.com.br', required: true });
  const senha = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '••••••••', required: true, minlength: '6' });
  const confirmar = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '••••••••', required: true, minlength: '6' });
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Criar acesso');
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
            chave_configuracao: chave.value,
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
    campo('Chave de configuração inicial', chave, { dica: 'Use a chave de uso único definida na Vercel.' }),
    campo('Empresa', empresa),
    campo('Seu nome', nome),
    campo('E-mail', email),
    campo('Senha', senha),
    campo('Confirme a senha', confirmar),
    botao,
  );
  return cartaoAcesso('Vamos começar', 'Configure sua empresa e comece a criar orçamentos.', form, { etiqueta: 'PRIMEIRO ACESSO', classe: 'acesso-configuracao' });
}

quandoPerderSessao(() => {
  if (!usuario) return;
  pararMonitorVersao();
  usuario = null;
  verificarSaida = null;
  aviso('Sua sessão expirou. Entre novamente.', 'erro');
  mostrarAcesso();
});

mostrarAcesso().catch((erro) => substituir(raiz, h('div', { class: 'vazio' }, h('p', {}, erro.message))));

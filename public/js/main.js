import { api, cache, quandoPerderSessao } from './api.js';
import { h, anexar, icone, substituir, carregando, avisoErro, campo, aviso, iniciais, marcaEsquadro, abrirModal } from './ui.js';
import { novidades } from './novidades.js';
import { paginaDashboard } from './pages/dashboard.js';
import { paginaOrcamentos } from './pages/orcamentos.js';
import { paginaNovoOrcamento } from './pages/novo.js';
import { paginaEditor } from './pages/editor.js';
import { paginaClientes, paginaCliente } from './pages/clientes.js';
import { paginaConfiguracoes } from './pages/config.js';

const raiz = document.getElementById('app');
let usuario = null;
let intervaloVersao = null;
let avisoVersaoAtivo = null;

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
}

const CHAVE_NOVIDADES_LIDAS = 'esquadro.novidades.lidas';

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
    { type: 'button', class: `botao-novidades botao-novidades-${posicao}`, title: 'Ver novidades', 'aria-label': 'Ver novidades', onclick: () => abrirNovidades() },
    icone('historico'),
    h('span', { class: 'botao-novidades-texto' }, 'Novidades'),
    h('span', { class: 'botao-novidades-ponto', 'aria-hidden': 'true', hidden: true }),
  );
  botao.querySelector('.botao-novidades-ponto').hidden = novidades.every((n) => idsNovidadesLidas().has(n.id));
  return botao;
}

function atualizarIndicadorNovidades() {
  const lidas = idsNovidadesLidas();
  const haNovidades = novidades.some((n) => !lidas.has(n.id));
  for (const botao of document.querySelectorAll('.botao-novidades')) {
    botao.querySelector('.botao-novidades-ponto').hidden = !haNovidades;
  }
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
  pararMonitorVersao();
  await api.post('/auth/sair').catch(() => {});
  usuario = null;
  cache.empresa = null;
  mostrarAcesso();
}

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

// ------------------------------------------------------ Login / primeiro acesso

// Cena 3D da tela de entrada (carregada só aqui, em arquivo separado).
let cenaAtual = null;
function pararCena() {
  cenaAtual?.parar();
  cenaAtual = null;
}
async function iniciarCena() {
  const palco = raiz.querySelector('.acesso-cena');
  if (!palco) return;
  try {
    const { montarCena } = await import('./cena-login.js');
    if (!palco.isConnected) return;
    pararCena();
    cenaAtual = montarCena(palco, { aoMontar: () => palco.classList.add('montado') });
    palco.classList.add('com-3d');
  } catch (erro) {
    // Sem WebGL (ou falha ao carregar): fica o fundo em degradê.
    console.warn('Cena 3D indisponível:', erro?.message || erro);
  }
}

async function mostrarAcesso() {
  const estado = await api.get('/auth/estado');
  if (estado.usuario) {
    pararCena();
    usuario = estado.usuario;
    await cache.carregarEmpresa();
    montarLayout();
    registrarServiceWorker();
    iniciarMonitorVersao();
    await abrirNovidades({ somenteNaoLidas: true });
    return rotear();
  }
  pararCena();
  substituir(raiz, estado.precisa_configurar ? telaConfigurar() : telaEntrar());
  iniciarCena();
}

function cartaoAcesso(titulo, subtitulo, formulario) {
  const vantagem = (texto) => h('li', {}, icone('check'), texto);
  return h(
    'div',
    { class: 'acesso' },
    h(
      'section',
      { class: 'acesso-marca' },
      h('div', { class: 'acesso-cena' }),
      marcaEsquadro('marca-clara'),
      h(
        'div',
        { class: 'acesso-chamada' },
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
      h('small', {}, 'esquadro · orçamentos de marcenaria no esquadro'),
    ),
    h(
      'div',
      { class: 'acesso-lado' },
      h(
        'div',
        { class: 'acesso-cartao' },
        marcaEsquadro('marca-acesso'),
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
  return cartaoAcesso('Entrar', 'Que bom ter você de volta. Entre para ver seus orçamentos.', form);
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
  return cartaoAcesso('Bem-vindo ao esquadro!', 'Crie o acesso do administrador para começar a fazer seus orçamentos.', form);
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

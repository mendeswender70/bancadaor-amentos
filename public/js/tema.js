import { h, icone, substituir } from './ui.js';

export const temaAtual = () => document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';
export const preferenciaTema = () => ['claro', 'escuro', 'sistema'].includes(document.documentElement.dataset.temaPreferencia)
  ? document.documentElement.dataset.temaPreferencia : 'escuro';
const temaDoAparelho = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function atualizarControle(controle) {
  if (controle.dataset.temaOpcao) {
    const selecionado = controle.dataset.temaOpcao === preferenciaTema();
    controle.setAttribute('aria-pressed', String(selecionado));
    controle.classList.toggle('ativo', selecionado);
  } else {
    const destino = temaAtual() === 'claro' ? 'escuro' : 'claro';
    const rotulo = `Ativar modo ${destino}`;
    controle.setAttribute('aria-label', rotulo);
    controle.title = rotulo;
    substituir(controle, icone(destino === 'claro' ? 'sol' : 'lua'), controle.dataset.temaTexto === 'true' ? h('span', {}, `Modo ${destino}`) : null);
  }
}

export function aplicarTema(tema, salvar = true) {
  const preferencia = ['claro', 'escuro', 'sistema'].includes(tema) ? tema : 'escuro';
  const escolhido = preferencia === 'sistema' ? (temaDoAparelho ? (temaDoAparelho.matches ? 'escuro' : 'claro') : 'escuro') : preferencia;
  document.documentElement.dataset.temaPreferencia = preferencia;
  document.documentElement.dataset.tema = escolhido;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escolhido === 'claro' ? '#f6f3ed' : '#100d0b');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', escolhido === 'claro' ? 'default' : 'black-translucent');
  if (salvar) {
    try { localStorage.setItem('esquadro.tema', preferencia); } catch { /* A troca segue funcionando nesta aba. */ }
  }
  document.querySelectorAll('[data-tema-opcao], [data-alternar-tema]').forEach(atualizarControle);
}

export function botaoTema(classe, texto = false) {
  const botao = h('button', { type: 'button', class: `botao-icone tema-alternar ${classe}`, 'data-alternar-tema': '', 'data-tema-texto': String(texto), onclick: () => aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro') });
  atualizarControle(botao);
  return botao;
}

export function seletorTema() {
  return h('section', { class: 'cartao tema-preferencias', 'aria-label': 'Aparência' },
    h('div', {}, h('h2', {}, 'Aparência'), h('p', {}, 'Siga o tema do aparelho ou escolha uma aparência fixa.')),
    h('div', { class: 'tema-opcoes', role: 'group', 'aria-label': 'Escolher tema' },
      ['claro', 'escuro', 'sistema'].map((tema) => {
        const opcao = h('button', { type: 'button', class: `tema-opcao tema-amostra-${tema}`, 'data-tema-opcao': tema, onclick: () => aplicarTema(tema) },
          h('span', { class: 'tema-amostra', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {})),
          h('span', { class: 'tema-opcao-rotulo' }, icone(tema === 'sistema' ? 'aparelho' : tema === 'claro' ? 'sol' : 'lua'), h('span', {}, tema === 'sistema' ? 'Seguir o aparelho' : tema === 'claro' ? 'Claro' : 'Escuro'), h('span', { class: 'tema-opcao-check', 'aria-hidden': 'true' }, icone('check'))),
        );
        atualizarControle(opcao);
        return opcao;
      })),
  );
}

const acompanharAparelho = () => {
  if (preferenciaTema() === 'sistema') aplicarTema('sistema', false);
};
if (temaDoAparelho?.addEventListener) temaDoAparelho.addEventListener('change', acompanharAparelho);
else temaDoAparelho?.addListener?.(acompanharAparelho);

window.addEventListener('storage', (evento) => {
  if (evento.key === 'esquadro.tema' || evento.key === null) aplicarTema(evento.newValue, false);
});

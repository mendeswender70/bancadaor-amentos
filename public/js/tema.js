import { h, icone, substituir } from './ui.js';

export const temaAtual = () => document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';

function atualizarControle(controle) {
  if (controle.dataset.temaOpcao) {
    const selecionado = controle.dataset.temaOpcao === temaAtual();
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
  const escolhido = tema === 'claro' ? 'claro' : 'escuro';
  document.documentElement.dataset.tema = escolhido;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escolhido === 'claro' ? '#f6f3ed' : '#100d0b');
  if (salvar) {
    try { localStorage.setItem('esquadro.tema', escolhido); } catch { /* A troca segue funcionando nesta aba. */ }
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
    h('div', {}, h('h2', {}, 'Aparência'), h('p', {}, 'Escolha o visual do Esquadro neste navegador.')),
    h('div', { class: 'tema-opcoes', role: 'group', 'aria-label': 'Escolher tema' },
      ['claro', 'escuro'].map((tema) => {
        const opcao = h('button', { type: 'button', class: `tema-opcao tema-amostra-${tema}`, 'data-tema-opcao': tema, onclick: () => aplicarTema(tema) },
          h('span', { class: 'tema-amostra', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {})),
          h('span', { class: 'tema-opcao-rotulo' }, icone(tema === 'claro' ? 'sol' : 'lua'), tema === 'claro' ? 'Claro' : 'Escuro', h('span', { class: 'tema-opcao-check', 'aria-hidden': 'true' }, icone('check'))),
        );
        atualizarControle(opcao);
        return opcao;
      })),
  );
}

window.addEventListener('storage', (evento) => {
  if (evento.key === 'esquadro.tema' || evento.key === null) aplicarTema(evento.newValue, false);
});

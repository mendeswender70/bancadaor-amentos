// Estado e utilidades compartilhados pelas páginas da produção.
import { h, abrirModal, campo } from '/js/ui.js';

export const sessao = { usuario: null, config: null, funcionarios: [] };
export const ehEscritorio = () => Boolean(sessao.usuario?.escritorio);

export const SITUACOES = {
  novo: 'Novo',
  montando: 'Montando a lista',
  pronto: 'Pronto para cortar',
  cortando: 'Cortando',
  concluido: 'Concluído',
};

export function seloSituacao(plano) {
  let texto = SITUACOES[plano.situacao] || plano.situacao;
  if (plano.situacao === 'cortando' && plano.passos) texto = `Cortando · ${Math.round((plano.passo / plano.passos) * 100)}%`;
  return h('span', { class: `p-situacao p-situacao-${plano.situacao}` }, texto);
}

export const contagem = (n) => Number(n || 0).toLocaleString('pt-BR');
export const plural = (n, um, varios) => `${contagem(n)} ${Number(n) === 1 ? um : varios}`;
export const nomeChapa = (c) => (c ? `${c.nome} ${c.espessura_mm} mm` : 'Sem chapa');

// Navegação com verificação de saída (ex.: lista ainda salvando).
let verificarSaida = null;
export function aoSairDaPagina(fn) {
  verificarSaida = fn;
}
export const pegarVerificacao = () => verificarSaida;
export const limparVerificacao = () => {
  verificarSaida = null;
};

export function irPara(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Mantém a tela acesa no modo de corte (iPhone com iOS 16.4 ou mais novo).
let travaTela = null;
export async function manterTelaLigada(ligar) {
  try {
    if (ligar && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      travaTela = await navigator.wakeLock.request('screen');
    } else if (!ligar && travaTela) {
      await travaTela.release();
      travaTela = null;
    }
  } catch {
    travaTela = null; // Sem suporte ou bateria fraca: segue sem travar.
  }
}

export function progresso(fracao) {
  const barra = h('span', {});
  barra.style.width = `${Math.round(Math.min(1, Math.max(0, fracao)) * 100)}%`;
  return barra;
}

export function pedirNome(titulo, atual = '', exemplo = '') {
  return abrirModal(titulo, (fechar) => {
    const entrada = h('input', { type: 'text', value: atual, maxlength: '150', required: true, autofocus: true, placeholder: exemplo });
    return h(
      'form',
      { class: 'formulario', onsubmit: (e) => (e.preventDefault(), fechar(entrada.value.trim())) },
      campo('Nome', entrada),
      h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Salvar')),
    );
  });
}

export function ultimoLocal() {
  try {
    return localStorage.getItem('esquadro.producao.local') || '';
  } catch {
    return '';
  }
}
export function guardarLocal(valor) {
  try {
    if (valor) localStorage.setItem('esquadro.producao.local', valor);
  } catch {
    /* Sem armazenamento: só não lembra o último local. */
  }
}

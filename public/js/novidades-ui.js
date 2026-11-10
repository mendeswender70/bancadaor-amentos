// Como uma novidade aparece na janela "Novidades" e em Avisos → Novidades.
import { h, icone } from './ui.js';

/** Um item de novidade é um texto simples ou { icone, titulo, texto }. */
export const textoItemNovidade = (item) => (typeof item === 'string' ? item : [item.titulo, item.texto].filter(Boolean).join(': '));

/** Frase de abertura da novidade: o resumo, ou o primeiro item nas entradas antigas. */
export const resumoNovidade = (n) => n.resumo || textoItemNovidade(n.itens[0] || '');

/** "10 de novembro de 2026" → "10 nov" */
export const dataCurtaNovidade = (data) => String(data).replace(/^(\d+) de (\S+) de \d+$/, (_, dia, mes) => `${dia} ${mes.slice(0, 3)}`);

/** Lista dos pontos de uma novidade, cada um com ícone, título curto e explicação. */
export function pontosNovidade(n) {
  return h(
    'ul',
    { class: 'nov-pontos' },
    n.itens.map((item) => {
      const ponto = typeof item === 'string' ? { texto: item } : item;
      return h(
        'li',
        { class: ponto.titulo ? '' : 'nov-ponto-simples' },
        h('span', { class: 'nov-icone', 'aria-hidden': 'true' }, icone(ponto.icone || 'check')),
        h('div', {}, ponto.titulo ? h('strong', {}, ponto.titulo) : null, h('p', {}, ponto.texto)),
      );
    }),
  );
}

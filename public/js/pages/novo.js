import { h } from '../ui.js';
import { cabecalhoPagina, seletorCliente } from '../comum.js';
import { irPara } from '../main.js';

export async function paginaNovoOrcamento() {
  return h(
    'div',
    { class: 'pagina pagina-estreita' },
    cabecalhoPagina('Novo orçamento', { voltar: '#/' }),
    h('p', { class: 'passo' }, 'Para quem é o orçamento?'),
    seletorCliente((cliente) => irPara(`#/orcamentos/novo/${cliente.id}`)),
  );
}

import { h } from '../ui.js';
import { cabecalhoPagina, seletorCliente } from '../comum.js';
import { irPara } from '../main.js';

export async function paginaNovoOrcamento() {
  return h(
    'div',
    { class: 'pagina pagina-estreita' },
    cabecalhoPagina('Novo orçamento', { voltar: '#/', subtitulo: 'Passo 1 de 2 — para quem é o orçamento?' }),
    h('section', { class: 'cartao' }, seletorCliente((cliente) => irPara(`#/orcamentos/novo/${cliente.id}`))),
  );
}

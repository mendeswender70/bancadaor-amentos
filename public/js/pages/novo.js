import { h } from '../ui.js';
import { cabecalhoInterno, seletorCliente } from '../comum.js';
import { irPara } from '../main.js';

export async function paginaNovoOrcamento() {
  return h(
    'div',
    { class: 'pagina pagina-interna pagina-novo' },
    cabecalhoInterno('Escolha o cliente', {
      voltar: '#/orcamentos', retorno: 'Orçamentos', contexto: 'NOVO ORÇAMENTO · 1 DE 2',
      subtitulo: 'Busque um contato ou cadastre um novo.', tituloDesktop: 'Novo orçamento', contextoDesktop: 'ORÇAMENTOS',
      subtituloDesktop: 'Passo 1 de 2 — para quem é o orçamento?',
    }),
    h('div', { class: 'novo-colunas' },
      h('section', { class: 'novo-escolha' }, h('h2', {}, 'Escolha o cliente'), seletorCliente((cliente) => irPara(`#/orcamentos/novo/${cliente.id}`))),
      h('aside', { class: 'novo-proximo' }, h('span', { class: 'contexto-interno' }, 'PRÓXIMO PASSO'), h('h2', {}, 'Monte o orçamento'),
        h('p', {}, 'Depois de escolher o cliente, adicione os ambientes, os móveis e as condições da proposta.'),
        h('small', {}, 'O número é gerado ao adicionar o primeiro móvel.'),
      ),
    ),
  );
}

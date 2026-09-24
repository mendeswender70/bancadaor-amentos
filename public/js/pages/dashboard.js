import { formatarDinheiro, formatarData, formatarNumero } from '/shared/calc.js';
import { api, cache } from '../api.js';
import { h, icone, vazio } from '../ui.js';
import { selo } from '../comum.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function indicador(rotulo, valor, href, detalhe) {
  return h(
    'a',
    { href, class: 'indicador' },
    h('span', { class: 'indicador-rotulo' }, rotulo),
    h('strong', { class: 'indicador-valor' }, valor),
    detalhe ? h('span', { class: 'indicador-detalhe' }, detalhe) : null,
  );
}

export async function paginaDashboard() {
  const d = await api.get('/dashboard');
  const mes = MESES[new Date().getMonth()];
  const empresa = cache.empresa;

  const recentes = d.recentes.length
    ? h(
        'div',
        { class: 'tabela-responsiva' },
        h(
          'table',
          { class: 'tabela' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Cliente'), h('th', {}, 'Data'), h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Status'), h('th', {}, ''))),
          h(
            'tbody',
            {},
            d.recentes.map((o) =>
              h(
                'tr',
                {},
                h('td', {}, h('strong', {}, o.cliente_nome), h('div', { class: 'suave pequeno' }, `nº ${formatarNumero(o.numero)}`)),
                h('td', {}, formatarData(o.data)),
                h('td', { class: 'num' }, formatarDinheiro(o.total_cents)),
                h('td', {}, selo(o.status)),
                h('td', { class: 'num' }, h('a', { href: `#/orcamentos/${o.id}`, class: 'botao botao-pequeno' }, 'Abrir')),
              ),
            ),
          ),
        ),
      )
    : vazio('Nenhum orçamento ainda. Que tal criar o primeiro?');

  return h(
    'div',
    { class: 'pagina' },
    h('div', { class: 'boas-vindas' }, h('h1', {}, empresa?.nome || 'Início'), h('p', { class: 'suave' }, 'Painel de orçamentos')),
    h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario botao-enorme' }, icone('mais'), 'NOVO ORÇAMENTO'),
    h(
      'div',
      { class: 'indicadores' },
      indicador(`Orçamentos em ${mes}`, String(d.mes.quantidade), '#/orcamentos'),
      indicador('Em aberto', String(d.em_aberto), '#/orcamentos?status=abertos', 'rascunho, enviado ou em negociação'),
      indicador(`Aprovados em ${mes}`, String(d.mes.aprovados), '#/orcamentos?status=aprovado', formatarDinheiro(d.mes.aprovados_cents)),
      indicador(`Valor orçado em ${mes}`, formatarDinheiro(d.mes.valor_cents), '#/orcamentos'),
    ),
    h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Orçamentos recentes'), h('a', { href: '#/orcamentos' }, 'Ver todos')),
      recentes,
    ),
  );
}

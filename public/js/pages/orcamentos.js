import { lerDinheiro } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, vazioIlustrado, campo, abrirModal } from '../ui.js';
import { cabecalhoPagina, listaOrcamentos } from '../comum.js';

// Filtros principais; as situações uma a uma ficam em "Mais filtros".
const FILTROS_STATUS = [
  ['', 'Todos'],
  ['abertos', 'Em aberto'],
  ['aprovado', 'Aprovados'],
  ['perdidos', 'Perdidos'],
  ['rascunho', 'Rascunhos'],
];
const POR_PAGINA = 30;

export async function paginaOrcamentos(query) {
  const filtros = {
    q: query.get('q') || '',
    status: query.get('status') || '',
    de: '',
    ate: '',
    min: '',
    max: '',
  };
  let deslocamento = 0;
  const resultado = h('div', {});
  const contador = h('p', { class: 'suave contador' });

  const montarBusca = () => {
    const p = new URLSearchParams();
    if (filtros.q) p.set('q', filtros.q);
    if (filtros.status) p.set('status', filtros.status);
    if (filtros.de) p.set('de', filtros.de);
    if (filtros.ate) p.set('ate', filtros.ate);
    const min = lerDinheiro(filtros.min);
    const max = lerDinheiro(filtros.max);
    if (min !== null) p.set('min', min);
    if (max !== null) p.set('max', max);
    p.set('limite', POR_PAGINA);
    p.set('deslocamento', deslocamento);
    return p.toString();
  };

  const carregar = async (acrescentar = false) => {
    if (!acrescentar) {
      deslocamento = 0;
      substituir(resultado, carregando());
    }
    const r = await api.get(`/orcamentos?${montarBusca()}`);
    contador.textContent = r.total === 1 ? '1 orçamento' : `${r.total} orçamentos`;
    const lista = listaOrcamentos(r.orcamentos, { aoMudar: () => carregar(), variante: 'tabela' });
    if (!acrescentar) substituir(resultado);
    resultado.querySelector('.carregar-mais')?.remove();
    if (!r.total) {
      substituir(
        resultado,
        h(
          'div',
          { class: 'lista' },
          vazioIlustrado(
            'busca',
            'Nenhum orçamento encontrado',
            'Tente outro nome, número ou filtro.',
            h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario' }, icone('mais'), 'Novo orçamento'),
          ),
        ),
      );
      return;
    }
    resultado.append(lista);
    deslocamento += r.orcamentos.length;
    if (deslocamento < r.total) {
      resultado.append(
        h('button', { type: 'button', class: 'botao botao-bloco carregar-mais', onclick: () => carregar(true) }, 'Carregar mais'),
      );
    }
  };

  const busca = h('input', {
    type: 'search',
    class: 'busca',
    placeholder: window.matchMedia('(min-width: 768px)').matches ? 'Procurar por cliente ou número do orçamento' : 'Cliente ou número do orçamento',
    value: filtros.q,
    'aria-label': 'Procurar orçamento',
    oninput: debounce((e) => {
      filtros.q = e.target.value.trim();
      carregar();
    }),
  });

  const chips = h('div', { class: 'chips chips-rolagem', role: 'group', 'aria-label': 'Filtrar por situação' });
  const desenharChips = () =>
    substituir(
      chips,
      FILTROS_STATUS.map(([valor, texto]) =>
        h(
          'button',
          {
            type: 'button',
            class: `chip${filtros.status === valor ? ' ativo' : ''}`,
            'aria-pressed': String(filtros.status === valor),
            onclick: () => {
              filtros.status = valor;
              desenharChips();
              carregar();
            },
          },
          texto,
        ),
      ),
    );
  desenharChips();

  const rotuloFiltro = h('span', {});
  const atualizarRotuloFiltro = () => {
    const ativos = [filtros.de, filtros.ate, filtros.min, filtros.max].filter(Boolean).length;
    rotuloFiltro.textContent = ativos ? `Datas e valores · ${ativos}` : 'Datas e valores';
  };
  const aplicarFiltros = async () => {
    const resultado = await abrirModal('Datas e valores', (fechar) => {
      const de = h('input', { type: 'date', value: filtros.de });
      const ate = h('input', { type: 'date', value: filtros.ate });
      const min = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'R$ 0,00', value: filtros.min });
      const max = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'R$ 0,00', value: filtros.max });
      return h('form', { class: 'formulario filtros-data-valor', onsubmit: (e) => { e.preventDefault(); fechar({ de: de.value, ate: ate.value, min: min.value, max: max.value }); } },
        h('div', { class: 'rotulo-grupo-filtro' }, 'PERÍODO DA PROPOSTA'),
        h('div', { class: 'grade-formulario' }, campo('A partir de', de, { classe: 'campo-metade' }), campo('Até', ate, { classe: 'campo-metade' })),
        h('div', { class: 'rotulo-grupo-filtro' }, 'FAIXA DE VALOR'),
        h('div', { class: 'grade-formulario' }, campo('Mínimo', min, { classe: 'campo-metade' }), campo('Máximo', max, { classe: 'campo-metade' })),
        h('div', { class: 'acoes-modal' },
          h('button', { type: 'button', class: 'botao', onclick: () => fechar({ de: '', ate: '', min: '', max: '' }) }, 'Limpar filtros'),
          h('button', { type: 'submit', class: 'botao botao-primario' }, 'Aplicar filtros'),
        ),
      );
    }, { largo: true });
    if (!resultado) return;
    Object.assign(filtros, resultado);
    atualizarRotuloFiltro();
    carregar();
  };
  const botaoDatas = h('button', { type: 'button', class: 'botao botao-filtro-datas', onclick: aplicarFiltros }, icone('calendario'), rotuloFiltro, icone('baixo', 'icone icone-mini'));
  const barraFiltros = h('div', { class: 'barra-filtros-orcamentos' }, chips, botaoDatas);
  const cabecalhoLista = h('div', { class: 'cabecalho-lista-orcamentos', 'aria-hidden': 'true' },
    h('span', {}, 'Cliente'), h('span', {}, 'Acompanhamento'), h('span', {}, 'Data'), h('span', {}, 'Situação'), h('span', { class: 'num' }, 'Total'), h('span', {}, 'Ações'),
  );
  atualizarRotuloFiltro();

  carregar().catch((erro) => substituir(resultado, vazio(erro.message)));

  return h(
    'div',
    { class: 'pagina pagina-orcamentos' },
    cabecalhoPagina('Orçamentos', {
      subtitulo: h('span', {},
        h('span', { class: 'texto-orcamentos-mobile' }, 'Acompanhe cada proposta sem perder o fio.'),
        h('span', { class: 'texto-orcamentos-desktop' }, 'Todas as propostas, organizadas do rascunho à aprovação.'),
      ),
      acoes: h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario botao-novo-orcamento' }, icone('mais'), 'Novo orçamento'),
    }),
    h('div', { class: 'barra-busca' }, icone('busca', 'icone icone-busca'), busca),
    barraFiltros,
    contador,
    cabecalhoLista,
    resultado,
  );
}

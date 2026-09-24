import { STATUS, lerDinheiro } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, vazioIlustrado, campo } from '../ui.js';
import { cabecalhoPagina, listaOrcamentos } from '../comum.js';

const FILTROS_STATUS = [['', 'Todos'], ['abertos', 'Em aberto'], ...Object.entries(STATUS)];
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
    const lista = listaOrcamentos(r.orcamentos);
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
    placeholder: 'Procurar por cliente ou número',
    value: filtros.q,
    'aria-label': 'Procurar orçamento',
    oninput: debounce((e) => {
      filtros.q = e.target.value.trim();
      carregar();
    }),
  });

  const chips = h('div', { class: 'chips chips-rolagem', role: 'group', 'aria-label': 'Filtrar por status' });
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

  const campoFiltro = (chave, rotulo, attrs) =>
    campo(
      rotulo,
      h('input', {
        ...attrs,
        value: filtros[chave],
        onchange: (e) => {
          filtros[chave] = e.target.value;
          carregar();
        },
      }),
      { classe: 'campo-metade' },
    );

  const maisFiltros = h(
    'details',
    { class: 'mais-filtros' },
    h('summary', {}, 'Mais filtros (data e valor)'),
    h(
      'div',
      { class: 'grade-formulario' },
      campoFiltro('de', 'Data inicial', { type: 'date' }),
      campoFiltro('ate', 'Data final', { type: 'date' }),
      campoFiltro('min', 'Valor mínimo (R$)', { type: 'text', inputmode: 'decimal', placeholder: '0,00' }),
      campoFiltro('max', 'Valor máximo (R$)', { type: 'text', inputmode: 'decimal', placeholder: '0,00' }),
    ),
  );

  carregar().catch((erro) => substituir(resultado, vazio(erro.message)));

  return h(
    'div',
    { class: 'pagina' },
    cabecalhoPagina('Orçamentos', {
      subtitulo: 'Todos os orçamentos, do mais novo para o mais antigo',
      acoes: h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario' }, icone('mais'), 'Novo orçamento'),
    }),
    h('div', { class: 'barra-busca' }, icone('busca', 'icone icone-busca'), busca),
    chips,
    maisFiltros,
    contador,
    resultado,
  );
}

import { formatarData } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, confirmar, aviso, avisoErro } from '../ui.js';
import { cabecalhoPagina, formularioCliente, listaOrcamentos, modalNovoCliente } from '../comum.js';
import { irPara } from '../main.js';

export async function paginaClientes() {
  const lista = h('div', {});
  const busca = h('input', {
    type: 'search',
    class: 'busca',
    placeholder: 'Procurar por nome, telefone ou WhatsApp',
    'aria-label': 'Procurar cliente',
  });

  const carregar = async () => {
    substituir(lista, carregando());
    try {
      const clientes = await api.get(`/clientes?q=${encodeURIComponent(busca.value)}`);
      if (!clientes.length) {
        substituir(lista, vazio(busca.value ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'));
        return;
      }
      substituir(
        lista,
        h(
          'div',
          { class: 'lista' },
          clientes.map((c) =>
            h(
              'a',
              { href: `#/clientes/${c.id}`, class: 'linha-orcamento' },
              h(
                'div',
                { class: 'linha-principal' },
                h('strong', {}, c.nome),
                h('span', { class: 'suave' }, [c.whatsapp || c.telefone, c.cidade].filter(Boolean).join(' · ') || ' '),
              ),
              h(
                'div',
                { class: 'linha-valor' },
                h('span', { class: 'suave' }, c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`),
                c.ultimo_orcamento ? h('span', { class: 'suave pequeno' }, `último em ${formatarData(c.ultimo_orcamento)}`) : null,
              ),
            ),
          ),
        ),
      );
    } catch (erro) {
      substituir(lista, vazio(erro.message));
    }
  };
  busca.addEventListener('input', debounce(carregar));
  carregar();

  const novo = async () => {
    const cliente = await modalNovoCliente();
    if (cliente) irPara(`#/clientes/${cliente.id}`);
  };

  return h(
    'div',
    { class: 'pagina' },
    cabecalhoPagina('Clientes', {
      acoes: h('button', { type: 'button', class: 'botao botao-primario', onclick: novo }, icone('mais'), 'Novo cliente'),
    }),
    h('div', { class: 'barra-busca' }, icone('busca', 'icone icone-busca'), busca),
    lista,
  );
}

export async function paginaCliente(id) {
  const cliente = await api.get(`/clientes/${id}`);
  const orcamentos = cliente.lista_orcamentos;

  const excluir = async () => {
    if (!(await confirmar(`Excluir o cliente “${cliente.nome}”?`, { sim: 'Excluir', perigo: true }))) return;
    try {
      await api.delete(`/clientes/${id}`);
      aviso('Cliente excluído.');
      irPara('#/clientes');
    } catch (erro) {
      avisoErro(erro);
    }
  };

  return h(
    'div',
    { class: 'pagina' },
    cabecalhoPagina(cliente.nome, {
      voltar: '#/clientes',
      acoes: h('a', { href: `#/orcamentos/novo/${id}`, class: 'botao botao-primario' }, icone('mais'), 'Novo orçamento'),
    }),
    h(
      'div',
      { class: 'colunas' },
      h(
        'section',
        { class: 'cartao' },
        h('h2', {}, 'Dados do cliente'),
        formularioCliente(cliente, async (salvo) => {
          Object.assign(cliente, salvo);
          document.querySelector('.cabecalho-pagina h1').textContent = salvo.nome;
        }),
        orcamentos.length
          ? null
          : h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: excluir }, icone('lixeira'), 'Excluir cliente'),
      ),
      h(
        'section',
        { class: 'cartao' },
        h('h2', {}, 'Orçamentos'),
        orcamentos.length ? listaOrcamentos(orcamentos, { mostrarCliente: false }) : vazio('Este cliente ainda não tem orçamentos.'),
      ),
    ),
  );
}

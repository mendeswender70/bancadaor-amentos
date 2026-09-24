import { formatarData } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, vazioIlustrado, confirmar, aviso, avisoErro } from '../ui.js';
import { avatar, cabecalhoPagina, formularioCliente, listaOrcamentos, modalNovoCliente } from '../comum.js';
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
        substituir(
          lista,
          busca.value
            ? vazioIlustrado('busca', 'Nenhum cliente encontrado', 'Confira o nome ou o telefone digitado.')
            : vazioIlustrado('clientes', 'Nenhum cliente cadastrado', 'Cadastre seus clientes para criar orçamentos mais rápido.'),
        );
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
              avatar(c.nome),
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
              icone('seta', 'icone linha-seta'),
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
      subtitulo: 'Cadastro e histórico de cada cliente',
      acoes: h('button', { type: 'button', class: 'botao botao-primario', onclick: novo }, icone('usuarioMais'), 'Novo cliente'),
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
      subtitulo: [cliente.whatsapp || cliente.telefone, cliente.cidade].filter(Boolean).join(' · ') || 'Cliente',
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
        orcamentos.length
          ? listaOrcamentos(orcamentos, { mostrarCliente: false })
          : vazioIlustrado(
              'orcamentos',
              'Nenhum orçamento ainda',
              null,
              h('a', { href: `#/orcamentos/novo/${id}`, class: 'botao botao-primario' }, icone('mais'), 'Criar orçamento'),
            ),
      ),
    ),
  );
}

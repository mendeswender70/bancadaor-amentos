import { formatarData, formatarDinheiro } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, vazioIlustrado, confirmar, aviso, avisoErro } from '../ui.js';
import { avatar, cabecalhoPagina, formularioCliente, listaOrcamentos, modalNovoCliente, numeroWhatsApp } from '../comum.js';
import { irPara } from '../main.js';

export async function paginaClientes() {
  const lista = h('div', {});
  const busca = h('input', {
    type: 'search',
    class: 'busca',
    placeholder: window.matchMedia('(min-width: 768px)').matches ? 'Procurar por nome, telefone ou WhatsApp' : 'Nome ou telefone',
    'aria-label': 'Procurar cliente',
  });
  const contador = h('p', { class: 'contador-clientes' });

  const carregar = async () => {
    substituir(lista, carregando());
    try {
      const clientes = await api.get(`/clientes?q=${encodeURIComponent(busca.value)}`);
      contador.textContent = `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`;
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
          { class: 'lista lista-clientes' },
          clientes.map((c) => {
            const whats = numeroWhatsApp(c.whatsapp || c.telefone);
            const primeiro = c.nome.trim().split(/\s+/)[0];
            const resumo = c.aprovado_cents
              ? `${c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`} · ${formatarDinheiro(c.aprovado_cents)} aprovados`
              : c.ultimo_orcamento
                ? `${c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`} · último em ${formatarData(c.ultimo_orcamento)}`
                : `${c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`}`;
            return h(
              'div',
              { class: 'linha-orcamento linha-com-acoes linha-cliente-ui' },
              h(
                'a',
                { href: `#/clientes/${c.id}`, class: 'linha-link cliente-link' },
                avatar(c.nome, 'avatar-linha cliente-avatar'),
                h('div', { class: 'linha-principal' }, h('strong', {}, c.nome), h('span', { class: 'suave' }, resumo)),
                icone('seta', 'icone linha-seta'),
              ),
              h(
                'div',
                { class: 'linha-acoes' },
                whats
                  ? h(
                      'a',
                      {
                        class: 'botao-icone botao-icone-whatsapp so-computador',
                        href: `https://wa.me/${whats}?text=${encodeURIComponent(`Olá, ${primeiro}!`)}`,
                        target: '_blank',
                        rel: 'noopener',
                        title: 'Conversar no WhatsApp',
                        'aria-label': `Conversar com ${c.nome} no WhatsApp`,
                      },
                      icone('whatsapp'),
                    )
                  : null,
              ),
            );
          }),
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
  const botaoNovo = h('button', { type: 'button', class: 'botao botao-primario novo-cliente', onclick: novo }, icone('usuarioMais'), 'Novo cliente');

  return h(
    'div',
    { class: 'pagina pagina-clientes' },
    cabecalhoPagina('Clientes', {
      subtitulo: h('span', {}, h('span', { class: 'texto-clientes-mobile' }, 'Histórico e propostas em um lugar.'), h('span', { class: 'texto-clientes-desktop' }, 'Cadastro e histórico de cada cliente.')),
    }),
    h('div', { class: 'clientes-filtros' }, h('div', { class: 'barra-busca' }, icone('busca', 'icone icone-busca'), busca), botaoNovo),
    contador,
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
    { class: 'pagina pagina-cliente' },
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

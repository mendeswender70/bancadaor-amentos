import { formatarData, formatarDinheiro } from '/shared/calc.js';

const dataCurta = (iso) => iso ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)).replace('.', '').replace(' de ', ' ') : '';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, vazioIlustrado, confirmar, aviso, avisoErro } from '../ui.js';
import { cabecalhoPagina, cabecalhoInterno, formularioCliente, listaOrcamentos, modalNovoCliente, numeroWhatsApp } from '../comum.js';
import { irPara, recarregarRota } from '../main.js';

export async function paginaClientes(query = new URLSearchParams()) {
  const lista = h('div', {});
  const porPagina = 50;
  let deslocamento = 0;
  let total = 0;
  let buscaAtual = 0;
  let carregandoMais = false;
  const busca = h('input', {
    type: 'search',
    class: 'busca',
    placeholder: window.matchMedia('(min-width: 768px)').matches ? 'Procurar por nome, telefone ou WhatsApp' : 'Nome ou telefone',
    'aria-label': 'Procurar cliente',
    value: query.get('q') || '',
  });
  const contador = h('p', { class: 'contador-clientes' });

  // Livro-caixa de clientes: nome e histórico, contato, o que aguarda resposta e o que já foi aprovado.
  const linhaCliente = (c) => {
    const whats = numeroWhatsApp(c.whatsapp || c.telefone);
    const primeiro = c.nome.trim().split(/\s+/)[0];
    const qtd = c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`;
    const resumo = c.orcamentos ? `${qtd} · último em ${dataCurta(c.ultimo_orcamento)}` : 'Nenhum orçamento ainda';
    const valor = (cents, classe) => h('span', { class: `lc-valor ${classe}${cents ? '' : ' lc-zero'}` }, cents ? formatarDinheiro(cents) : '—');
    return h('div', { class: 'll-linha lc-linha' },
      h('a', { href: `#/clientes/${c.id}`, class: 'll-link lc-link', 'aria-label': `${c.nome}: ${resumo}` },
        h('span', { class: 'll-cliente' }, h('strong', {}, c.nome), h('small', {}, resumo)),
        h('span', { class: 'lc-contato' }, c.whatsapp || c.telefone || 'Sem telefone'),
        valor(c.aguardando_cents, 'lc-aguardando'),
        valor(c.aprovado_cents, 'll-total lc-aprovado')),
      h('div', { class: 'll-acoes' },
        whats
          ? h('a', {
              class: 'botao-icone botao-icone-whatsapp',
              href: `https://wa.me/${whats}?text=${encodeURIComponent(`Olá, ${primeiro}!`)}`,
              target: '_blank',
              rel: 'noopener',
              title: 'Conversar no WhatsApp',
              'aria-label': `Conversar com ${c.nome} no WhatsApp`,
            }, icone('whatsapp'))
          : null));
  };

  const carregar = async (acrescentar = false) => {
    if (carregandoMais && acrescentar) return;
    const sequencia = ++buscaAtual;
    lista.querySelector('.carregar-erro')?.remove();
    if (!acrescentar) {
      deslocamento = 0;
      total = 0;
      substituir(lista, carregando());
    } else {
      carregandoMais = true;
      const botao = lista.querySelector('.carregar-mais');
      if (botao) {
        botao.disabled = true;
        botao.textContent = 'Carregando…';
      }
    }
    try {
      const parametros = new URLSearchParams({ q: busca.value, limite: String(porPagina), deslocamento: String(deslocamento) });
      const resposta = await api.get(`/clientes?${parametros}`);
      if (sequencia !== buscaAtual) return;
      total = resposta.total;
      const clientes = resposta.clientes;
      deslocamento += clientes.length;
      contador.textContent = total === 0
        ? '0 clientes'
        : total === 1
          ? '1 cliente'
          : `Exibindo ${deslocamento} de ${total} clientes`;
      if (!clientes.length && !acrescentar) {
        substituir(
          lista,
          busca.value
            ? vazioIlustrado('busca', 'Nenhum cliente encontrado', 'Confira o nome ou o telefone digitado.')
            : vazioIlustrado('clientes', 'Nenhum cliente cadastrado', 'Cadastre seus clientes para criar orçamentos mais rápido.'),
        );
        return;
      }
      let listaClientes = lista.querySelector('.lc-lista');
      if (!acrescentar || !listaClientes) {
        listaClientes = h('div', { class: 'lista-livro lc-lista' });
        substituir(lista, listaClientes);
      }
      listaClientes.append(...clientes.map(linhaCliente));
      lista.querySelector('.carregar-mais')?.remove();
      if (deslocamento < total) {
        lista.append(h('button', {
          type: 'button',
          class: 'botao botao-bloco carregar-mais',
          onclick: () => carregar(true),
        }, 'Carregar mais'));
      }
    } catch (erro) {
      if (sequencia !== buscaAtual) return;
      const tentarNovamente = h('button', { type: 'button', class: 'botao', onclick: () => carregar(acrescentar) }, 'Tentar novamente');
      if (acrescentar) {
        lista.querySelector('.carregar-mais')?.remove();
        const falha = vazio(erro.message, tentarNovamente);
        falha.classList.add('carregar-erro');
        lista.append(falha);
      } else {
        contador.textContent = '';
        substituir(lista, vazioIlustrado('alerta', 'Não foi possível carregar os clientes', erro.message, tentarNovamente));
      }
    } finally {
      carregandoMais = false;
    }
  };
  busca.addEventListener('input', debounce(() => carregar()));
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
    h('div', { class: 'll-cabecalho lc-cabecalho', 'aria-hidden': 'true' },
      h('span', {}, 'Cliente'), h('span', {}, 'Contato'), h('span', { class: 'num' }, 'Aguardando resposta'), h('span', { class: 'num' }, 'Aprovado')),
    lista,
  );
}

export async function paginaCliente(id) {
  const cliente = await api.get(`/clientes/${id}`);
  const orcamentos = cliente.lista_orcamentos || [];
  const telefone = cliente.whatsapp || cliente.telefone;
  const cidade = [cliente.cidade, cliente.estado].filter(Boolean).join(' · ');
  const whats = numeroWhatsApp(telefone);
  const novo = h('a', { href: `#/orcamentos/novo/${id}`, class: 'botao botao-primario' }, 'Novo orçamento');
  const editar = h('a', { href: `#/clientes/${id}/editar`, class: 'botao-icone cliente-editar', 'aria-label': 'Editar dados do cliente' }, icone('editar'));
  const contato = (rotulo, valor, classe = '') => valor ? h('div', { class: `ficha-dado ${classe}` }, h('small', {}, rotulo), h('span', {}, valor)) : null;

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

  // Resumo do cliente a partir dos orçamentos dele (o servidor manda até 200).
  const soma = (filtro) => orcamentos.filter(filtro).reduce((n, o) => n + o.total_cents, 0);
  const aprovado = soma((o) => o.status === 'aprovado');
  const aguardando = soma((o) => ['enviado', 'negociacao'].includes(o.status));
  const nAprovados = orcamentos.filter((o) => o.status === 'aprovado').length;
  const numero = (rotulo, valor, detalhe, zero = false) => h('div', { class: `cf-numero${zero ? ' cf-zero' : ''}` }, h('span', {}, rotulo), h('strong', {}, valor), detalhe ? h('small', {}, detalhe) : null);
  const resumo = orcamentos.length
    ? h('div', { class: 'cf-resumo' },
        numero('Aprovado', formatarDinheiro(aprovado), nAprovados ? `${nAprovados} ${nAprovados === 1 ? 'proposta' : 'propostas'}` : 'Nenhuma ainda', !aprovado),
        numero('Aguardando resposta', formatarDinheiro(aguardando), aguardando ? 'enviadas ou em negociação' : 'Nada pendente', !aguardando),
        numero('Propostas', String(orcamentos.length), `a primeira em ${formatarData(orcamentos.reduce((m, o) => (o.data < m ? o.data : m), orcamentos[0].data))}`))
    : null;
  const recarregar = () => recarregarRota();

  return h(
    'div',
    { class: 'pagina pagina-interna pagina-cliente' },
    cabecalhoInterno(cliente.nome, {
      voltar: '#/clientes', retorno: 'Clientes', contexto: 'FICHA DO CLIENTE', contextoDesktop: 'CLIENTES',
      subtitulo: [telefone, cidade].filter(Boolean).join(' · ') || 'Sem telefone cadastrado', acoes: [editar, novo],
    }),
    h('div', { class: 'cliente-colunas' },
      h('section', { class: 'cliente-contato cf-contato', 'aria-label': 'Contato' },
        h('h2', { class: 'cf-titulo' }, 'Contato'),
        h('dl', { class: 'cf-dados' },
          h('div', {}, h('dt', {}, 'Telefone / WhatsApp'), h('dd', {}, telefone || 'Sem telefone')),
          cliente.email ? h('div', {}, h('dt', {}, 'E-mail'), h('dd', {}, cliente.email)) : null,
          cidade ? h('div', {}, h('dt', {}, 'Cidade'), h('dd', {}, cidade)) : null),
        whats ? h('a', { class: 'botao botao-whatsapp ficha-whatsapp', href: `https://wa.me/${whats}`, target: '_blank', rel: 'noopener' }, icone('whatsapp'), 'Conversar no WhatsApp') : null,
        !orcamentos.length ? h('button', { type: 'button', class: 'botao botao-perigo-texto ficha-excluir', onclick: excluir }, 'Excluir cliente') : null,
      ),
      h('section', { class: 'cliente-historico cf-historico' },
        resumo,
        h('div', { class: 'cliente-historico-titulo' }, h('h2', {}, 'Orçamentos'), h('span', {}, orcamentos.length)),
        orcamentos.length
          ? listaOrcamentos(orcamentos, { mostrarCliente: false, variante: 'tabela', aoMudar: recarregar })
          : vazioIlustrado('orcamentos', 'Nenhum orçamento ainda', 'Crie a primeira proposta para este cliente.'),
      ),
    ),
    h('div', { class: 'acao-interna-fixa cliente-novo-fixo' }, h('a', { href: `#/orcamentos/novo/${id}`, class: 'botao botao-primario' }, 'Novo orçamento')),
  );
}

export async function paginaEditarCliente(id) {
  const cliente = await api.get(`/clientes/${id}`);
  return h('div', { class: 'pagina pagina-interna pagina-editar-cliente' },
    cabecalhoInterno('Dados do cliente', { voltar: `#/clientes/${id}`, retorno: cliente.nome, contexto: cliente.nome.toLocaleUpperCase('pt-BR'), subtitulo: 'Atualize os contatos e as informações.' }),
    formularioCliente(cliente, () => irPara(`#/clientes/${id}`)),
  );
}

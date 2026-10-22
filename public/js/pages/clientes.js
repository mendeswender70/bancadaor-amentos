import { formatarData, formatarDinheiro } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, debounce, substituir, carregando, vazio, vazioIlustrado, confirmar, aviso, avisoErro } from '../ui.js';
import { avatar, cabecalhoPagina, cabecalhoInterno, formularioCliente, listaOrcamentos, modalNovoCliente, numeroWhatsApp } from '../comum.js';
import { irPara } from '../main.js';

export async function paginaClientes() {
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
  });
  const contador = h('p', { class: 'contador-clientes' });

  const linhaCliente = (c) => {
    const whats = numeroWhatsApp(c.whatsapp || c.telefone);
    const primeiro = c.nome.trim().split(/\s+/)[0];
    const resumo = c.aprovado_cents
      ? `${c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c.aprovado_cents / 100)} aprovados`
      : c.ultimo_orcamento
        ? `${c.orcamentos === 1 ? '1 orçamento' : `${c.orcamentos} orçamentos`} · último em ${formatarData(c.ultimo_orcamento).slice(0, 5)}`
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
      let listaClientes = lista.querySelector('.lista-clientes');
      if (!acrescentar || !listaClientes) {
        listaClientes = h('div', { class: 'lista lista-clientes' });
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

  return h(
    'div',
    { class: 'pagina pagina-interna pagina-cliente' },
    cabecalhoInterno(cliente.nome, {
      voltar: '#/clientes', retorno: 'Clientes', contexto: 'FICHA DO CLIENTE', contextoDesktop: 'CLIENTES',
      subtitulo: 'Cadastro e histórico de propostas.', acoes: [editar, novo],
    }),
    h('div', { class: 'cliente-colunas' },
      h('section', { class: 'cliente-contato' },
        h('div', { class: 'ficha-contato' },
          avatar(cliente.nome, 'ficha-avatar'),
          h('div', { class: 'ficha-identidade' }, h('strong', {}, cliente.nome), h('small', {}, 'DADOS DO CLIENTE')),
          contato('TELEFONE / WHATSAPP', telefone || 'Sem telefone', 'ficha-telefone'),
          contato('E-MAIL', cliente.email), contato('CIDADE', cidade),
        ),
        whats ? h('a', { class: 'botao ficha-whatsapp', href: `https://wa.me/${whats}`, target: '_blank', rel: 'noopener' }, 'Conversar no WhatsApp') : null,
        h('a', { href: `#/clientes/${id}/editar`, class: 'botao ficha-editar' }, 'Editar dados'),
        !orcamentos.length ? h('button', { type: 'button', class: 'botao botao-perigo-texto ficha-excluir', onclick: excluir }, 'Excluir cliente') : null,
      ),
      h('section', { class: 'cliente-historico' },
        h('div', { class: 'cliente-historico-titulo' }, h('h2', {}, 'Orçamentos'), h('span', {}, orcamentos.length)),
        h('p', { class: 'cliente-historico-descricao' }, `${orcamentos.length} ${orcamentos.length === 1 ? 'proposta' : 'propostas'} neste cadastro`),
        orcamentos.length
          ? listaOrcamentos(orcamentos, { mostrarCliente: false })
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

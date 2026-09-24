import { STATUS, formatarData, formatarDinheiro, formatarNumero } from '/shared/calc.js';
import { api } from './api.js';
import { h, campo, abrirModal, avisoErro, aviso, debounce, substituir, vazio, icone, carregando } from './ui.js';

export function selo(status) {
  return h('span', { class: `selo selo-${status}` }, STATUS[status] || status);
}

export function cabecalhoPagina(titulo, { voltar, acoes } = {}) {
  return h(
    'div',
    { class: 'cabecalho-pagina' },
    voltar ? h('a', { href: voltar, class: 'voltar', 'aria-label': 'Voltar' }, icone('voltar')) : null,
    h('h1', {}, titulo),
    acoes ? h('div', { class: 'cabecalho-acoes' }, acoes) : null,
  );
}

/** Lista de orçamentos em formato de linhas clicáveis. */
export function listaOrcamentos(orcamentos, { mostrarCliente = true } = {}) {
  return h(
    'div',
    { class: 'lista' },
    orcamentos.map((o) =>
      h(
        'a',
        { href: `#/orcamentos/${o.id}`, class: 'linha-orcamento' },
        h(
          'div',
          { class: 'linha-principal' },
          h('strong', {}, mostrarCliente ? o.cliente_nome : `Orçamento nº ${formatarNumero(o.numero)}`),
          h(
            'span',
            { class: 'suave' },
            mostrarCliente ? `nº ${formatarNumero(o.numero)} · ` : '',
            formatarData(o.data),
          ),
        ),
        h('div', { class: 'linha-valor' }, h('strong', {}, formatarDinheiro(o.total_cents)), selo(o.status)),
      ),
    ),
  );
}

// ------------------------------------------------------------------ Clientes

const CAMPOS_CLIENTE = [
  ['nome', 'Nome completo', { required: true, autocomplete: 'off' }],
  ['telefone', 'Telefone', { type: 'tel', inputmode: 'tel' }],
  ['whatsapp', 'WhatsApp', { type: 'tel', inputmode: 'tel' }],
  ['email', 'E-mail', { type: 'email' }],
  ['cpf_cnpj', 'CPF/CNPJ (opcional)', {}],
  ['endereco', 'Endereço', {}],
  ['cidade', 'Cidade', {}],
  ['estado', 'Estado', { maxlength: '50' }],
];

/** Formulário de cliente. `aoSalvar(cliente)` recebe o registro salvo. */
export function formularioCliente(cliente = {}, aoSalvar, { textoBotao = 'Salvar cliente' } = {}) {
  const entradas = {};
  const campos = CAMPOS_CLIENTE.map(([chave, rotulo, attrs]) => {
    entradas[chave] = h('input', { type: 'text', ...attrs, value: cliente[chave] ?? '' });
    return campo(rotulo, entradas[chave], { classe: ['cidade', 'estado'].includes(chave) ? 'campo-metade' : '' });
  });
  entradas.observacoes = h('textarea', { rows: '3', value: cliente.observacoes ?? '' });
  const copiarWhats = h(
    'button',
    {
      type: 'button',
      class: 'link-botao',
      onclick: () => {
        entradas.whatsapp.value = entradas.telefone.value;
      },
    },
    'Mesmo número do telefone',
  );
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, textoBotao);
  const form = h(
    'form',
    {
      class: 'formulario grade-formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        const dados = Object.fromEntries(Object.entries(entradas).map(([k, el]) => [k, el.value]));
        try {
          const salvo = cliente.id ? await api.put(`/clientes/${cliente.id}`, dados) : await api.post('/clientes', dados);
          aviso('Cliente salvo.');
          await aoSalvar(salvo);
        } catch (erro) {
          avisoErro(erro);
        } finally {
          botao.disabled = false;
        }
      },
    },
    campos.slice(0, 3),
    copiarWhats,
    campos.slice(3),
    campo('Observações', entradas.observacoes, { classe: 'campo-inteiro' }),
    h('div', { class: 'acoes-formulario' }, botao),
  );
  setTimeout(() => entradas.nome.focus());
  return form;
}

export function modalNovoCliente(inicial = {}) {
  return abrirModal('Novo cliente', (fechar) => formularioCliente(inicial, (c) => fechar(c)), { largo: true });
}

/** Busca de clientes com lista clicável. */
export function seletorCliente(aoEscolher, { textoBusca = '' } = {}) {
  const lista = h('div', { class: 'lista' });
  const busca = h('input', {
    type: 'search',
    class: 'busca',
    placeholder: 'Procurar por nome, telefone ou WhatsApp',
    value: textoBusca,
    'aria-label': 'Procurar cliente',
  });
  const procurar = async () => {
    substituir(lista, carregando());
    try {
      const clientes = await api.get(`/clientes?q=${encodeURIComponent(busca.value)}`);
      if (!clientes.length) {
        substituir(
          lista,
          vazio(busca.value ? 'Nenhum cliente encontrado. Use “Novo cliente” para cadastrar.' : 'Nenhum cliente cadastrado ainda.'),
        );
        return;
      }
      substituir(
        lista,
        clientes.map((c) =>
          h(
            'button',
            { type: 'button', class: 'linha-cliente', onclick: () => aoEscolher(c) },
            h('strong', {}, c.nome),
            h('span', { class: 'suave' }, [c.whatsapp || c.telefone, c.cidade].filter(Boolean).join(' · ') || ' '),
          ),
        ),
      );
    } catch (erro) {
      substituir(lista, vazio(erro.message));
    }
  };
  const novo = async () => {
    const valor = busca.value.trim();
    const inicial = /\d{4}/.test(valor) ? { telefone: valor } : { nome: valor };
    const cliente = await modalNovoCliente(inicial);
    if (cliente) aoEscolher(cliente);
  };
  busca.addEventListener('input', debounce(procurar));
  procurar();
  setTimeout(() => busca.focus());
  return h(
    'div',
    { class: 'seletor-cliente' },
    h(
      'button',
      { type: 'button', class: 'botao botao-primario botao-grande botao-bloco', onclick: novo },
      icone('mais'),
      'Novo cliente',
    ),
    h('div', { class: 'separador' }, h('span', {}, 'ou selecione um cliente existente')),
    busca,
    lista,
  );
}

/** Número de WhatsApp no formato internacional (Brasil por padrão). */
export function numeroWhatsApp(texto) {
  let d = String(texto || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

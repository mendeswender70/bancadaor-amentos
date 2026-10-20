import { STATUS, formatarData, formatarDinheiro, formatarNumero } from '/shared/calc.js';
import { api, baixarBlob } from './api.js';
import {
  h,
  campo,
  abrirModal,
  avisoErro,
  aviso,
  debounce,
  substituir,
  vazio,
  icone,
  carregando,
  iniciais,
  vazioIlustrado,
  menuSuspenso,
  haQuanto,
  diasAte,
  copiarTexto,
} from './ui.js';

export function selo(status) {
  return h('span', { class: `selo selo-${status}` }, STATUS[status] || status);
}

export function cabecalhoPagina(titulo, { voltar, acoes, subtitulo } = {}) {
  return h(
    'div',
    { class: 'cabecalho-pagina' },
    voltar ? h('a', { href: voltar, class: 'voltar', 'aria-label': 'Voltar' }, icone('voltar')) : null,
    h('div', { class: 'titulos' }, h('h1', {}, titulo), subtitulo ? h('p', {}, subtitulo) : null),
    acoes ? h('div', { class: 'cabecalho-acoes' }, acoes) : null,
  );
}

export function avatar(nome, classe = '') {
  return h('span', { class: `avatar ${classe}`, 'aria-hidden': 'true' }, iniciais(nome));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Etiquetas de uma linha: ambientes, validade e o que o cliente fez pelo link. */
function etiquetasOrcamento(o) {
  const etiquetas = [];
  const aberto = ['enviado', 'negociacao'].includes(o.status);
  if (o.status === 'aprovado' && o.aprovado_pelo_link) etiquetas.push(['sucesso', 'aprovado pelo cliente']);
  else if (aberto && o.visualizacoes) etiquetas.push(['info', `cliente viu ${haQuanto(o.ultima_visualizacao_em)}`]);
  if (aberto && o.data_validade) {
    const d = diasAte(o.data_validade);
    if (d < 0) etiquetas.push(['alerta', 'validade vencida']);
    else if (d <= 3) etiquetas.push(['alerta', d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`]);
    else etiquetas.push(['', `válido até ${formatarData(o.data_validade)}`]);
  }
  if (o.ambientes) etiquetas.push(['', plural(o.ambientes, 'ambiente', 'ambientes')]);
  return etiquetas;
}

async function enviarDaLista(o, aoMudar) {
  const { abrirEnvio } = await import('./envio.js');
  const marcar = await abrirEnvio({
    id: o.id,
    numero: o.numero,
    status: o.status,
    cliente: { nome: o.cliente_nome, whatsapp: o.cliente_whatsapp, telefone: o.cliente_telefone },
  });
  if (marcar && o.status !== 'enviado') {
    try {
      await api.patch(`/orcamentos/${o.id}/status`, { status: 'enviado', versao: o.versao });
      aviso('Orçamento marcado como enviado.');
      aoMudar?.();
    } catch (erro) {
      avisoErro(erro);
    }
  }
}

async function acaoDuplicar(o) {
  try {
    const copia = await api.post(`/orcamentos/${o.id}/duplicar`);
    aviso(`Cópia criada: orçamento nº ${formatarNumero(copia.numero)}.`);
    location.hash = `#/orcamentos/${copia.id}`;
  } catch (erro) {
    avisoErro(erro);
  }
}

async function acaoPdf(o) {
  try {
    aviso('Gerando o PDF…');
    const blob = await baixarBlob(`/orcamentos/${o.id}/pdf`);
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `Orcamento-${formatarNumero(o.numero)}.pdf` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    avisoErro(erro);
  }
}

async function acaoCopiarLink(o) {
  try {
    const { linkDaProposta } = await import('./envio.js');
    aviso((await copiarTexto(await linkDaProposta(o.id))) ? 'Link da proposta copiado.' : 'Não foi possível copiar.');
  } catch (erro) {
    avisoErro(erro);
  }
}

/**
 * Lista de orçamentos: a linha abre o orçamento; à direita ficam os atalhos
 * (WhatsApp e o menu com duplicar, PDF e link).
 */
export function listaOrcamentos(orcamentos, { mostrarCliente = true, aoMudar } = {}) {
  return h(
    'div',
    { class: 'lista' },
    orcamentos.map((o) =>
      h(
        'div',
        { class: 'linha-orcamento linha-com-acoes' },
        h(
          'a',
          { href: `#/orcamentos/${o.id}`, class: 'linha-link' },
          mostrarCliente ? avatar(o.cliente_nome, 'avatar-linha') : h('span', { class: 'selo-icone avatar-linha' }, icone('orcamentos')),
          h(
            'div',
            { class: 'linha-principal' },
            h('strong', {}, mostrarCliente ? o.cliente_nome : `Orçamento nº ${formatarNumero(o.numero)}`),
            h('span', { class: 'suave' }, mostrarCliente ? `nº ${formatarNumero(o.numero)} · ` : '', formatarData(o.data)),
          ),
          h('div', { class: 'linha-valor' }, h('strong', {}, formatarDinheiro(o.total_cents)), selo(o.status)),
          h(
            'span',
            { class: 'etiquetas' },
            etiquetasOrcamento(o).map(([tipo, texto]) => h('span', { class: `etiqueta-linha ${tipo}` }, texto)),
          ),
        ),
        h(
          'div',
          { class: 'linha-acoes' },
          h(
            'button',
            {
              type: 'button',
              class: 'botao-icone botao-icone-whatsapp so-computador',
              title: 'Enviar ao cliente',
              'aria-label': `Enviar o orçamento nº ${formatarNumero(o.numero)} ao cliente`,
              onclick: () => enviarDaLista(o, aoMudar),
            },
            icone('whatsapp'),
          ),
          menuSuspenso(
            [
              ['whatsapp', 'Enviar ao cliente', () => enviarDaLista(o, aoMudar)],
              ['link', 'Copiar link da proposta', () => acaoCopiarLink(o)],
              ['pdf', 'Baixar PDF', () => acaoPdf(o)],
              ['copiar', 'Duplicar', () => acaoDuplicar(o)],
            ],
            { rotulo: `Ações do orçamento nº ${formatarNumero(o.numero)}` },
          ),
        ),
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
          busca.value
            ? vazioIlustrado('busca', 'Nenhum cliente encontrado', 'Confira o nome ou use “Novo cliente” para cadastrar.')
            : vazioIlustrado('clientes', 'Nenhum cliente cadastrado ainda', 'Toque em “Novo cliente” para cadastrar o primeiro.'),
        );
        return;
      }
      substituir(
        lista,
        clientes.map((c) =>
          h(
            'button',
            { type: 'button', class: 'linha-orcamento', onclick: () => aoEscolher(c) },
            avatar(c.nome),
            h(
              'div',
              { class: 'linha-principal' },
              h('strong', {}, c.nome),
              h('span', { class: 'suave' }, [c.whatsapp || c.telefone, c.cidade].filter(Boolean).join(' · ') || 'Sem telefone'),
            ),
            icone('seta', 'icone linha-seta'),
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
      icone('usuarioMais'),
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

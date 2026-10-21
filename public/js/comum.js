import { STATUS, formatarData, formatarDinheiro, formatarNumero } from '/shared/calc.js';
import { api, baixarBlob } from './api.js';
import {
  h,
  campo,
  abrirModal,
  confirmar,
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
  const etiqueta = { Orçamentos: 'PROPOSTAS', Clientes: 'SEUS CONTATOS', Ajustes: 'ESQUADRO' }[titulo];
  return h(
    'div',
    { class: 'cabecalho-pagina' },
    voltar ? h('a', { href: voltar, class: 'voltar', 'aria-label': 'Voltar' }, icone('voltar')) : null,
    h('div', { class: 'titulos' }, etiqueta ? h('span', { class: 'page-eyebrow' }, etiqueta) : null, h('h1', {}, titulo), subtitulo ? h('p', {}, subtitulo) : null),
    acoes ? h('div', { class: 'cabecalho-acoes' }, acoes) : null,
  );
}

/** Cabeçalho dos fluxos internos, com retorno no celular e contexto no desktop. */
export function cabecalhoInterno(titulo, { voltar, retorno, contexto, subtitulo, acoes, tituloDesktop, contextoDesktop, subtituloDesktop } = {}) {
  const textoResponsivo = (mobile, desktop) => desktop
    ? h('span', {}, h('span', { class: 'interno-mobile' }, mobile), h('span', { class: 'interno-desktop' }, desktop))
    : mobile;
  return h('header', { class: 'cabecalho-interno' },
    h('a', { href: voltar, class: 'retorno-interno' }, h('span', { class: 'botao-icone' }, icone('voltar')), h('span', {}, retorno)),
    h('div', { class: 'titulos-internos' },
      h('span', { class: 'contexto-interno' }, textoResponsivo(contexto, contextoDesktop)),
      h('h1', {}, textoResponsivo(titulo, tituloDesktop)),
      h('p', {}, textoResponsivo(subtitulo, subtituloDesktop)),
    ),
    acoes ? h('div', { class: 'acoes-internas' }, acoes) : null,
  );
}

export function avatar(nome, classe = '') {
  return h('span', { class: `avatar ${classe}`, 'aria-hidden': 'true' }, iniciais(nome));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function dataCompacta(iso) {
  if (!iso) return '';
  const valor = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(valor.getTime())) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(valor);
  const parte = (tipo) => partes.find((item) => item.type === tipo)?.value?.replace('.', '') || '';
  return `${parte('day')} ${parte('month')} ${parte('year')}`;
}

function diaMesCompacto(iso) {
  return dataCompacta(iso).split(' ').slice(0, 2).join(' ');
}

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

export async function excluirOrcamento(o, aoExcluir) {
  const cliente = o.cliente_nome || o.cliente?.nome;
  const identificacao = `orçamento nº ${formatarNumero(o.numero)}${cliente ? ` de ${cliente}` : ''}`;
  if (!(await confirmar(`Excluir o ${identificacao}? Os móveis, serviços, histórico e lembretes vinculados também serão removidos. Outras cópias relacionadas serão preservadas. Esta ação não pode ser desfeita.`, {
    titulo: 'Excluir orçamento',
    sim: 'Excluir orçamento',
    perigo: true,
  }))) return false;

  try {
    await api.delete(`/orcamentos/${o.id}`);
    aviso(`Orçamento nº ${formatarNumero(o.numero)} excluído.`);
    aoExcluir?.();
    return true;
  } catch (erro) {
    avisoErro(erro);
    return false;
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
export function listaOrcamentos(orcamentos, { mostrarCliente = true, aoMudar, variante = 'compacta' } = {}) {
  return h(
    'div',
    { class: `lista${variante === 'tabela' ? ' lista-orcamentos-tabela' : ''}` },
    orcamentos.map((o) => {
      const atividade = o.status === 'aprovado'
        ? o.aprovado_pelo_link ? 'Aprovado pelo cliente' : 'Proposta aprovada'
        : o.status === 'visto' || (o.visualizacoes && ['enviado', 'negociacao'].includes(o.status))
          ? `Cliente abriu a proposta ${haQuanto(o.ultima_visualizacao_em)}`
          : o.status === 'enviado'
            ? o.data_validade ? `Válido até ${diaMesCompacto(o.data_validade)}` : 'Proposta enviada ao cliente'
            : o.status === 'negociacao'
              ? 'Em negociação'
              : o.status === 'expirado'
                ? 'Validade da proposta encerrada'
                : o.status === 'recusado'
                  ? 'Proposta recusada pelo cliente'
                  : o.status === 'cancelado'
                    ? 'Proposta cancelada'
                    : 'Rascunho aguardando envio';
      const tags = h(
        'span',
        { class: 'etiquetas' },
        etiquetasOrcamento(o).map(([tipo, texto]) => h('span', { class: `etiqueta-linha ${tipo}` }, texto)),
      );
      const link = variante === 'tabela' && mostrarCliente
        ? h('a', { href: `#/orcamentos/${o.id}`, class: 'linha-link orcamento-link-tabela' },
            h('span', { class: 'orcamento-cliente' }, avatar(o.cliente_nome, 'avatar-linha'),
              h('span', { class: 'orcamento-cliente-texto' }, h('strong', {}, o.cliente_nome), h('small', { 'data-data': dataCompacta(o.data) }, `Nº ${formatarNumero(o.numero)}`)),
            ),
            h('span', { class: 'orcamento-atividade', 'data-status': o.status },
              h('strong', {}, atividade),
              o.data_validade && ['enviado', 'negociacao'].includes(o.status) ? h('small', {}, `Válida até ${formatarData(o.data_validade)}`) : null,
            ),
            h('time', { class: 'orcamento-data', datetime: o.data }, formatarData(o.data)),
            h('span', { class: 'orcamento-status' }, selo(o.status)),
            h('strong', { class: 'orcamento-total valor' }, formatarDinheiro(o.total_cents)),
          )
        : h(
            'a',
            { href: `#/orcamentos/${o.id}`, class: 'linha-link' },
            mostrarCliente ? avatar(o.cliente_nome, 'avatar-linha') : h('span', { class: 'selo-icone avatar-linha' }, icone('orcamentos')),
            h('span', { class: 'recente-documento' }, icone('orcamentos')),
            h(
              'div',
              { class: 'linha-principal' },
              h('strong', {}, mostrarCliente ? o.cliente_nome : `Nº ${formatarNumero(o.numero)}`),
              h('span', { class: 'suave' }, mostrarCliente ? [`Nº ${formatarNumero(o.numero)}`, h('span', { class: 'recente-data-mobile' }, ` · ${diaMesCompacto(o.data)}`)] : dataCompacta(o.data)),
            ),
            h('div', { class: 'linha-valor' }, h('strong', {}, formatarDinheiro(o.total_cents)), selo(o.status)),
            h('span', { class: 'recente-atualizacao' }, h('small', {}, 'Atualizado'), h('time', { datetime: o.data }, dataCompacta(o.data))),
            h('span', { class: 'recente-seta' }, icone('seta')),
            tags,
          );
      return h(
        'div',
        { class: `linha-orcamento linha-com-acoes${variante === 'tabela' ? ' linha-orcamento-tabela' : ''}` },
        link,
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
              '-',
              ['lixeira', 'Excluir orçamento', () => excluirOrcamento(o, aoMudar), { perigo: true }],
            ],
            { rotulo: `Ações do orçamento nº ${formatarNumero(o.numero)}` },
          ),
        ),
      );
    }),
  );
}

// ------------------------------------------------------------------ Clientes

const CAMPOS_CLIENTE = [
  ['nome', 'Nome completo *', { required: true, autocomplete: 'off' }],
  ['telefone', 'Telefone', { type: 'tel', inputmode: 'tel' }],
  ['whatsapp', 'WhatsApp', { type: 'tel', inputmode: 'tel' }],
  ['email', 'E-mail', { type: 'email' }],
  ['cpf_cnpj', 'CPF/CNPJ (opcional)', {}],
  ['endereco', 'Endereço', {}],
  ['cidade', 'Cidade', {}],
  ['estado', 'Estado', { maxlength: '50' }],
];

/** Formulário de cliente. `aoSalvar(cliente)` recebe o registro salvo. */
export function formularioCliente(cliente = {}, aoSalvar, { textoBotao = 'Salvar cliente', modal = false, aoCancelar } = {}) {
  const entradas = {};
  const campos = CAMPOS_CLIENTE.map(([chave, rotulo, attrs]) => {
    entradas[chave] = h('input', { type: 'text', ...attrs, value: cliente[chave] ?? '' });
    entradas[chave].placeholder = { nome: 'Nome do cliente', telefone: 'DDD + número', whatsapp: 'DDD + número', email: 'E-mail do cliente' }[chave] || '';
    return campo(rotulo, entradas[chave], { classe: `cliente-campo-${chave}${['cidade', 'estado'].includes(chave) ? ' campo-metade' : ''}` });
  });
  entradas.observacoes = h('textarea', { rows: '3', value: cliente.observacoes ?? '' });
  const copiarWhats = h(
    'button',
    {
      type: 'button',
      class: 'botao cliente-copiar-whats',
      onclick: () => {
        entradas.whatsapp.value = entradas.telefone.value;
      },
    },
    'Usar telefone no WhatsApp',
  );
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, textoBotao);
  const form = h(
    'form',
    {
      class: 'formulario formulario-cliente',
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
    h('div', { class: 'cliente-campos-principais' }, campos.slice(0, 3)),
    copiarWhats,
    campos[3],
    h('details', { class: 'cliente-campos-adicionais' },
      h('summary', { class: 'botao' }, modal ? 'Endereço, documento e observações' : 'Endereço e documento', modal ? null : icone('baixo')),
      h('div', { class: 'grade-formulario' }, campos.slice(4), modal ? campo('Observações', entradas.observacoes, { classe: 'campo-inteiro' }) : null),
    ),
    modal ? null : campo('Observações', entradas.observacoes, { classe: 'campo-inteiro' }),
    h('div', { class: modal ? 'acoes-modal' : 'acoes-formulario' }, aoCancelar ? h('button', { type: 'button', class: 'botao', onclick: aoCancelar }, 'Cancelar') : null, botao),
  );
  if (modal) setTimeout(() => entradas.nome.focus());
  return form;
}

export function modalNovoCliente(inicial = {}) {
  return abrirModal('Novo cliente', (fechar) => formularioCliente(inicial, (c) => fechar(c), { modal: true, aoCancelar: () => fechar() }), { largo: true, contexto: 'CLIENTES', subtitulo: 'Comece pelo nome e pelos contatos.', classe: 'modal-cliente' });
}

/** Busca de clientes com lista clicável. */
export function seletorCliente(aoEscolher, { textoBusca = '' } = {}) {
  const lista = h('div', { class: 'lista' });
  const busca = h('input', {
    type: 'search',
    class: 'busca',
    placeholder: 'Nome, telefone ou WhatsApp',
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
  return h(
    'div',
    { class: 'seletor-cliente' },
    h(
      'button',
      { type: 'button', class: 'botao botao-primario botao-grande botao-bloco', onclick: novo },
      'Novo cliente',
    ),
    h('div', { class: 'separador' }, h('span', {}, 'ou selecione um cliente existente')),
    h('div', { class: 'barra-busca' }, icone('busca', 'icone icone-busca'), busca),
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

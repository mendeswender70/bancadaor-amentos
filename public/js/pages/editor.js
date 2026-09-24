import {
  AMBIENTES_SUGERIDOS,
  METODOS,
  STATUS,
  calcularItem,
  calcularServico,
  calcularTotais,
  descreverCalculo,
  descreverMedida,
  descreverPagamento,
  dinheiroParaCampo,
  formatarData,
  formatarDinheiro,
  formatarMedida,
  formatarNumero,
  formatarPercentual,
  lerDinheiro,
  lerMedida,
  lerPercentual,
  somarDias,
  subtotalAmbiente,
} from '/shared/calc.js';
import { api, baixarBlob, cache } from '../api.js';
import {
  h,
  icone,
  campo,
  segmentado,
  abrirModal,
  confirmar,
  aviso,
  avisoErro,
  substituir,
  vazioIlustrado,
  menuSuspenso,
} from '../ui.js';
import { avatar, selo, seletorCliente, numeroWhatsApp } from '../comum.js';
import { aoSairDaPagina, irPara } from '../main.js';

const SERVICOS_RAPIDOS = ['Frete', 'Montagem', 'Instalação', 'Vidro', 'Espelho', 'Iluminação', 'Serviço adicional', 'Outros'];
const MENSAGEM_PADRAO =
  'Olá, {cliente}! Segue o orçamento dos móveis planejados conforme conversamos. Qualquer dúvida estou à disposição.';
const ICONE_METODO = { linear: 'regua', quadrado: 'area', unidade: 'caixa' };

const itemParaPayload = (i) => ({
  tipo_movel_id: i.tipo_movel_id ?? null,
  tipo_nome: i.tipo_nome,
  descricao: i.descricao,
  metodo_calculo: i.metodo_calculo,
  largura_mm: i.metodo_calculo === 'unidade' ? null : i.largura_mm,
  altura_mm: i.metodo_calculo === 'quadrado' ? i.altura_mm : null,
  quantidade: i.quantidade,
  preco_padrao_cents: i.preco_padrao_cents ?? null,
  preco_unitario_interno_cents: i.preco_unitario_interno_cents,
  observacoes: i.observacoes || '',
});

// Campos enviados ao servidor (os valores calculados são refeitos por ele).
function montarPayload(orc) {
  return {
    cliente_id: orc.cliente_id,
    data: orc.data,
    validade_dias: orc.validade_dias,
    status: orc.status,
    ambientes: orc.ambientes.map((a) => ({ nome: a.nome, descricao: a.descricao || '', itens: a.itens.map(itemParaPayload) })),
    servicos: orc.servicos.map((s) => ({ descricao: s.descricao, valor_cents: s.valor_cents, quantidade: s.quantidade })),
    desconto_tipo: orc.desconto_tipo,
    desconto_valor: orc.desconto_valor,
    acrescimo_descricao: orc.acrescimo_descricao,
    acrescimo_tipo: orc.acrescimo_tipo,
    acrescimo_valor: orc.acrescimo_valor,
    pagamento_descricao: orc.pagamento_descricao,
    pagamento_entrada_tipo: orc.pagamento_entrada_tipo,
    pagamento_entrada_valor: orc.pagamento_entrada_valor,
    pagamento_parcelas: orc.pagamento_parcelas,
    prazo_entrega: orc.prazo_entrega,
    observacoes: orc.observacoes,
    observacoes_internas: orc.observacoes_internas,
  };
}

/** Campo de dinheiro: aceita "1.800,00", "1800" etc. e reformata ao sair. */
function entradaDinheiro(valorCents, aoMudar, attrs = {}) {
  const el = h('input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    placeholder: '0,00',
    ...attrs,
    value: valorCents ? dinheiroParaCampo(valorCents) : '',
  });
  el.addEventListener('input', () => {
    const v = lerDinheiro(el.value);
    el.classList.toggle('invalido', el.value.trim() !== '' && v === null);
    aoMudar(v ?? 0);
  });
  el.addEventListener('blur', () => {
    const v = lerDinheiro(el.value);
    if (v !== null) el.value = v ? dinheiroParaCampo(v) : '';
  });
  return el;
}

function entradaNumero(valor, aoMudar, { min = 0, max = 9999, ...attrs } = {}) {
  const el = h('input', { type: 'number', inputmode: 'numeric', min: String(min), max: String(max), step: '1', ...attrs, value: String(valor ?? '') });
  el.addEventListener('input', () => {
    const n = Math.floor(Number(el.value));
    aoMudar(Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min);
  });
  return el;
}

function linhaResumo(rotulo, valor, classe = '') {
  return h('div', { class: `resumo-linha ${classe}` }, h('span', { title: rotulo }, rotulo), h('strong', {}, valor));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export async function paginaEditor({ id, clienteId }) {
  const [tipos, condicoes, empresa] = await Promise.all([
    api.get('/tipos-moveis'),
    api.get('/condicoes-pagamento'),
    cache.carregarEmpresa(),
  ]);

  let orc;
  if (id) {
    orc = await api.get(`/orcamentos/${id}`);
  } else {
    const [modelo, cliente] = await Promise.all([api.get('/orcamentos/modelo'), api.get(`/clientes/${clienteId}`)]);
    orc = { ...modelo, ambientes: [], cliente_id: cliente.id, cliente };
  }
  orc.ambientes ??= [];

  let salvo = id ? JSON.stringify(montarPayload(orc)) : null;
  const alterado = () => salvo !== JSON.stringify(montarPayload(orc));
  const verificar = async () =>
    !alterado() ||
    confirmar('Existem alterações não salvas. Deseja sair sem salvar?', { titulo: 'Sair sem salvar?', sim: 'Sair sem salvar', perigo: true });
  verificar.sincrono = () => !alterado();
  aoSairDaPagina(verificar);

  // ------------------------------------------------------------ Elementos fixos
  const tituloEl = h('h1', {});
  const subtituloEl = h('p', {});
  const seloEl = h('span', {});
  const blocoCliente = h('div', { class: 'bloco-cliente' });
  const validadeTexto = h('small', { class: 'dica' });
  const listaAmbientes = h('div', { class: 'lista-ambientes' });
  const listaServicos = h('div', { class: 'lista-servicos' });
  const resumo = h('div', { class: 'resumo' });
  const estadoSalvo = h('span', { class: 'estado-salvo' });
  const acoesLateral = h('div', { class: 'acoes-orcamento' });
  const descontoCalculado = h('small', { class: 'dica' });
  const acrescimoCalculado = h('small', { class: 'dica' });
  const previaPagamento = h('div', { class: 'previa-pagamento' });
  const historicoEl = h('div', {});
  const totalBarra = h('strong', { class: 'barra-total-valor' });
  const estadoBarra = h('span', { class: 'estado-salvo' });
  const menuBarra = h('div', {});
  const botaoSalvar = h('button', { type: 'button', class: 'botao botao-primario botao-grande', onclick: () => salvar() }, icone('salvar'), 'Salvar');
  const botaoSalvarLateral = h('button', { type: 'button', class: 'botao botao-primario botao-grande', onclick: () => salvar() }, icone('salvar'), 'Salvar orçamento');

  // --------------------------------------------------------------- Atualizações
  function atualizarCabecalho() {
    tituloEl.textContent = orc.numero ? `Orçamento nº ${formatarNumero(orc.numero)}` : 'Novo orçamento';
    subtituloEl.textContent = orc.id
      ? [`Criado em ${formatarData(orc.criado_em)}`, orc.duplicado_de_numero ? `cópia do nº ${formatarNumero(orc.duplicado_de_numero)}` : '']
          .filter(Boolean)
          .join(' · ')
      : 'O número é gerado quando você salvar';
    substituir(seloEl, selo(orc.status));
    const c = orc.cliente || {};
    substituir(
      blocoCliente,
      avatar(c.nome, 'avatar-grande'),
      h(
        'div',
        {},
        h('strong', { class: 'cliente-nome' }, c.nome),
        h(
          'span',
          { class: 'suave' },
          [c.telefone, c.whatsapp && c.whatsapp !== c.telefone ? `WhatsApp ${c.whatsapp}` : ''].filter(Boolean).join(' · ') || 'Sem telefone',
        ),
      ),
      h('button', { type: 'button', class: 'botao botao-pequeno', onclick: trocarCliente }, 'Trocar'),
    );
    const acoes = [
      ['pdf', 'Gerar PDF', abrirPdf],
      ['whatsapp', 'Enviar ao cliente', enviarAoCliente],
      ['copiar', 'Duplicar orçamento', duplicar, { desativado: !orc.id }],
    ];
    substituir(
      acoesLateral,
      botaoSalvarLateral,
      h('button', { type: 'button', class: 'botao botao-whatsapp', onclick: enviarAoCliente }, icone('whatsapp'), 'Enviar ao cliente'),
      h('button', { type: 'button', class: 'botao', onclick: abrirPdf }, icone('pdf'), 'Gerar PDF'),
      h('button', { type: 'button', class: 'botao', onclick: duplicar, disabled: !orc.id }, icone('copiar'), 'Duplicar'),
    );
    substituir(menuBarra, menuSuspenso(acoes, { rotulo: 'Ações do orçamento' }));
  }

  function atualizarValores() {
    const t = calcularTotais(orc);
    validadeTexto.textContent = `Válido até ${formatarData(somarDias(orc.data, orc.validade_dias))}`;
    descontoCalculado.textContent = orc.desconto_tipo === 'percentual' && t.desconto_cents ? `= ${formatarDinheiro(t.desconto_cents)}` : '';
    acrescimoCalculado.textContent = orc.acrescimo_tipo === 'percentual' && t.acrescimo_cents ? `= ${formatarDinheiro(t.acrescimo_cents)}` : '';
    substituir(
      resumo,
      orc.ambientes.length
        ? orc.ambientes.map((a) => linhaResumo(a.nome, formatarDinheiro(subtotalAmbiente(a)), 'resumo-ambiente'))
        : linhaResumo('Móveis', formatarDinheiro(0)),
      t.subtotal_servicos_cents ? linhaResumo('Serviços adicionais', formatarDinheiro(t.subtotal_servicos_cents), 'resumo-ambiente') : null,
      linhaResumo('Subtotal', formatarDinheiro(t.subtotal_cents), 'resumo-subtotal'),
      t.acrescimo_cents ? linhaResumo(orc.acrescimo_descricao || 'Acréscimo', formatarDinheiro(t.acrescimo_cents)) : null,
      t.desconto_cents ? linhaResumo('Desconto', `- ${formatarDinheiro(t.desconto_cents)}`, 'resumo-desconto') : null,
      linhaResumo('Total', formatarDinheiro(t.total_cents), 'resumo-total'),
    );
    const linhas = descreverPagamento(t.total_cents, {
      entrada_tipo: orc.pagamento_entrada_tipo,
      entrada_valor: orc.pagamento_entrada_valor,
      parcelas: orc.pagamento_parcelas,
    });
    substituir(previaPagamento, linhas.map((l) => h('div', {}, l)));
    totalBarra.textContent = formatarDinheiro(t.total_cents);
    for (const el of listaServicos.querySelectorAll('[data-total-servico]')) {
      const s = orc.servicos[Number(el.dataset.totalServico)];
      if (s) el.textContent = formatarDinheiro(calcularServico(s).total_cents);
    }
    const mudou = alterado();
    for (const el of [estadoSalvo, estadoBarra]) {
      el.textContent = !orc.id ? 'Ainda não salvo' : mudou ? 'Alterações não salvas' : 'Tudo salvo';
      el.classList.toggle('pendente', !orc.id || mudou);
    }
  }

  const redesenhar = () => {
    desenharAmbientes();
    atualizarValores();
  };

  // --------------------------------------------------------------- Ambientes
  function desenharAmbientes() {
    if (!orc.ambientes.length) {
      substituir(
        listaAmbientes,
        h(
          'div',
          { class: 'sem-ambientes' },
          vazioIlustrado(
            'ambiente',
            'Comece pelos ambientes',
            'Crie um ambiente para cada cômodo — por exemplo, “Quarto do casal” — e adicione os móveis dentro dele. Toque em uma sugestão:',
            h(
              'div',
              { class: 'chips' },
              AMBIENTES_SUGERIDOS.slice(0, 8).map((nome) =>
                h('button', { type: 'button', class: 'chip', onclick: () => criarAmbiente({ nome, descricao: '' }) }, `+ ${nome}`),
              ),
            ),
          ),
        ),
      );
      return;
    }
    substituir(listaAmbientes, orc.ambientes.map((a, i) => cartaoAmbiente(a, i)));
  }

  function cartaoAmbiente(ambiente, ai) {
    const n = ambiente.itens.length;
    return h(
      'section',
      { class: 'ambiente', 'aria-label': ambiente.nome },
      h(
        'div',
        { class: 'ambiente-topo' },
        h('span', { class: 'selo-icone' }, icone('ambiente')),
        h('div', { class: 'ambiente-titulo' }, h('h3', {}, ambiente.nome), h('span', {}, n ? plural(n, 'móvel', 'móveis') : 'Nenhum móvel ainda')),
        h('span', { class: 'ambiente-subtotal' }, formatarDinheiro(subtotalAmbiente(ambiente))),
        menuSuspenso(
          [
            ['editar', 'Renomear e detalhes', () => editarAmbiente(ai)],
            ['copiar', 'Duplicar ambiente', () => duplicarAmbiente(ai)],
            ['cima', 'Mover para cima', () => moverAmbiente(ai, -1), { desativado: ai === 0 }],
            ['baixo', 'Mover para baixo', () => moverAmbiente(ai, 1), { desativado: ai === orc.ambientes.length - 1 }],
            '-',
            ['lixeira', 'Remover ambiente', () => removerAmbiente(ai), { perigo: true }],
          ],
          { rotulo: `Opções de ${ambiente.nome}` },
        ),
      ),
      ambiente.descricao ? h('div', { class: 'ambiente-detalhe' }, ambiente.descricao) : null,
      h(
        'div',
        { class: 'ambiente-corpo' },
        n ? ambiente.itens.map((item, ii) => linhaItem(item, ai, ii)) : null,
        h(
          'button',
          { type: 'button', class: 'botao botao-tracejado botao-bloco', onclick: () => editarItem(ai) },
          icone('mais'),
          n ? 'Adicionar móvel' : `Adicionar móvel em ${ambiente.nome}`,
        ),
      ),
    );
  }

  function linhaItem(item, ai, ii) {
    const r = calcularItem(item);
    const personalizado =
      item.preco_padrao_cents !== null && item.preco_padrao_cents !== undefined && item.preco_padrao_cents !== item.preco_unitario_interno_cents;
    return h(
      'div',
      { class: 'item' },
      h(
        'button',
        { type: 'button', class: 'item-corpo', onclick: () => editarItem(ai, ii), 'aria-label': `Editar ${item.descricao || item.tipo_nome}` },
        h('span', { class: 'selo-icone' }, icone(ICONE_METODO[item.metodo_calculo] || 'caixa')),
        h(
          'div',
          { class: 'item-texto' },
          h('div', { class: 'item-topo' }, h('strong', {}, item.descricao || item.tipo_nome), h('span', { class: 'item-valor' }, formatarDinheiro(r.valor_total_cents))),
          h(
            'div',
            { class: 'item-detalhes' },
            h('span', {}, [item.tipo_nome && item.tipo_nome !== item.descricao ? item.tipo_nome : null, descreverMedida(item)].filter(Boolean).join(' · ')),
            h('span', { class: 'item-calculo', title: 'Cálculo interno — não aparece para o cliente' }, icone('cadeado', 'icone icone-mini'), descreverCalculo(item)),
            personalizado ? h('span', { class: 'etiqueta' }, `preço personalizado · padrão ${formatarDinheiro(item.preco_padrao_cents)}`) : null,
            item.observacoes ? h('span', { class: 'item-obs' }, item.observacoes) : null,
          ),
        ),
      ),
      h(
        'div',
        { class: 'item-acoes' },
        h('button', { type: 'button', class: 'botao-icone', title: 'Copiar móvel', 'aria-label': 'Copiar móvel', onclick: () => copiarItem(ai, ii) }, icone('copiar')),
        h('button', { type: 'button', class: 'botao-icone perigo', title: 'Remover móvel', 'aria-label': 'Remover móvel', onclick: () => removerItem(ai, ii) }, icone('lixeira')),
      ),
    );
  }

  async function criarAmbiente(inicial) {
    const dados = inicial || (await formularioAmbiente(null, orc.ambientes));
    if (!dados) return;
    orc.ambientes.push({ nome: dados.nome, descricao: dados.descricao, itens: [] });
    redesenhar();
    // Já abre o formulário do primeiro móvel do ambiente.
    await editarItem(orc.ambientes.length - 1);
    listaAmbientes.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function editarAmbiente(ai) {
    const dados = await formularioAmbiente(orc.ambientes[ai], orc.ambientes);
    if (!dados) return;
    Object.assign(orc.ambientes[ai], dados);
    redesenhar();
  }

  function duplicarAmbiente(ai) {
    const original = orc.ambientes[ai];
    const copia = { nome: `${original.nome} (cópia)`, descricao: original.descricao, itens: original.itens.map((i) => ({ ...i, id: undefined })) };
    orc.ambientes.splice(ai + 1, 0, copia);
    redesenhar();
    aviso(`Ambiente duplicado. Renomeie “${copia.nome}” se precisar.`);
  }

  function moverAmbiente(ai, direcao) {
    const destino = ai + direcao;
    if (destino < 0 || destino >= orc.ambientes.length) return;
    const [a] = orc.ambientes.splice(ai, 1);
    orc.ambientes.splice(destino, 0, a);
    redesenhar();
  }

  async function removerAmbiente(ai) {
    const a = orc.ambientes[ai];
    const texto = a.itens.length
      ? `Remover o ambiente “${a.nome}” e ${plural(a.itens.length, 'móvel', 'móveis')} dele?`
      : `Remover o ambiente “${a.nome}”?`;
    if (!(await confirmar(texto, { titulo: 'Remover ambiente', sim: 'Remover', perigo: true }))) return;
    orc.ambientes.splice(ai, 1);
    redesenhar();
  }

  // ---------------------------------------------------------------- Móveis
  async function removerItem(ai, ii) {
    const item = orc.ambientes[ai].itens[ii];
    if (!(await confirmar(`Remover “${item.descricao || item.tipo_nome}” do orçamento?`, { sim: 'Remover', perigo: true }))) return;
    orc.ambientes[ai].itens.splice(ii, 1);
    redesenhar();
  }

  function copiarItem(ai, ii) {
    const itens = orc.ambientes[ai].itens;
    itens.splice(ii + 1, 0, { ...itens[ii], id: undefined });
    redesenhar();
    aviso('Móvel copiado. Toque nele para ajustar.');
  }

  async function editarItem(ai, ii) {
    const novo = ii === undefined;
    let ambienteAtual = ai;
    let continuar = true;
    while (continuar) {
      continuar = false;
      const inicial = novo ? null : orc.ambientes[ai].itens[ii];
      const resultado = await formularioItem(inicial, tipos, novo, orc.ambientes, ambienteAtual);
      if (!resultado) break;
      if (novo) {
        orc.ambientes[resultado.ambiente].itens.push(resultado.item);
      } else if (resultado.ambiente !== ai) {
        orc.ambientes[ai].itens.splice(ii, 1);
        orc.ambientes[resultado.ambiente].itens.push(resultado.item);
      } else {
        orc.ambientes[ai].itens[ii] = resultado.item;
      }
      ambienteAtual = resultado.ambiente;
      redesenhar();
      if (resultado.outro) continuar = true;
    }
  }

  // --------------------------------------------------------------- Serviços
  function desenharServicos() {
    if (!orc.servicos.length) {
      substituir(listaServicos);
      return;
    }
    substituir(
      listaServicos,
      orc.servicos.map((s, i) =>
        h(
          'div',
          { class: 'servico' },
          campo(
            'Descrição',
            h('input', {
              type: 'text',
              value: s.descricao,
              maxlength: '200',
              oninput: (e) => {
                s.descricao = e.target.value;
                atualizarValores();
              },
            }),
            { classe: 'servico-descricao' },
          ),
          campo('Qtd.', entradaNumero(s.quantidade, (v) => { s.quantidade = v || 1; atualizarValores(); }, { min: 1 }), { classe: 'servico-qtd' }),
          campo('Valor (R$)', entradaDinheiro(s.valor_cents, (v) => { s.valor_cents = v; atualizarValores(); }, { 'data-servico': String(i) }), { classe: 'servico-valor' }),
          h('div', { class: 'servico-total' }, h('small', { class: 'suave' }, 'Total'), h('strong', { 'data-total-servico': String(i) }, formatarDinheiro(calcularServico(s).total_cents))),
          h(
            'button',
            {
              type: 'button',
              class: 'botao-icone perigo',
              'aria-label': `Remover ${s.descricao}`,
              onclick: () => {
                orc.servicos.splice(i, 1);
                desenharServicos();
                atualizarValores();
              },
            },
            icone('lixeira'),
          ),
        ),
      ),
    );
  }

  function adicionarServico(descricao) {
    orc.servicos.push({ descricao: descricao === 'Outros' ? '' : descricao, valor_cents: 0, quantidade: 1 });
    desenharServicos();
    atualizarValores();
    const campos = listaServicos.querySelectorAll('[data-servico]');
    const ultimo = campos[campos.length - 1];
    if (descricao === 'Outros') ultimo?.closest('.servico').querySelector('input')?.focus();
    else ultimo?.focus();
  }

  // --------------------------------------------------- Desconto / acréscimo
  function blocoAjuste(prefixo, rotulo, calculado) {
    let unidade = orc[`${prefixo}_tipo`] === 'percentual' ? 'percentual' : 'valor';
    const entrada = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
    const escrever = () => {
      const v = orc[`${prefixo}_valor`];
      entrada.value = orc[`${prefixo}_tipo`] === 'nenhum' || !v ? '' : unidade === 'percentual' ? formatarPercentual(v) : dinheiroParaCampo(v);
    };
    const aplicar = () => {
      const v = unidade === 'percentual' ? lerPercentual(entrada.value) : lerDinheiro(entrada.value);
      entrada.classList.toggle('invalido', entrada.value.trim() !== '' && v === null);
      orc[`${prefixo}_tipo`] = v ? unidade : 'nenhum';
      orc[`${prefixo}_valor`] = v || 0;
      atualizarValores();
    };
    entrada.addEventListener('input', aplicar);
    entrada.addEventListener('blur', () => {
      if (unidade === 'valor' && orc[`${prefixo}_valor`]) escrever();
    });
    escrever();
    const unidades = segmentado(
      [
        ['valor', 'R$'],
        ['percentual', '%'],
      ],
      unidade,
      (u) => {
        unidade = u;
        aplicar();
      },
      { rotulo: `Tipo de ${rotulo.toLowerCase()}` },
    );
    entrada.id = `ajuste-${prefixo}`;
    return h('div', { class: 'campo' }, h('label', { for: entrada.id }, rotulo), h('div', { class: 'entrada-com-unidade' }, unidades, entrada), calculado);
  }

  // --------------------------------------------------------------- Pagamento
  const secaoPagamento = h('div', { class: 'grade-formulario' });
  function desenharPagamento() {
    const seletor = h(
      'select',
      {
        onchange: (e) => {
          const c = condicoes.find((x) => String(x.id) === e.target.value);
          if (!c) return;
          orc.pagamento_descricao = c.descricao;
          orc.pagamento_entrada_tipo = c.entrada_tipo;
          orc.pagamento_entrada_valor = c.entrada_valor;
          orc.pagamento_parcelas = c.parcelas;
          desenharPagamento();
          atualizarValores();
        },
      },
      h('option', { value: '' }, 'Escolher uma condição cadastrada…'),
      condicoes.filter((c) => c.ativo).map((c) => h('option', { value: String(c.id) }, c.descricao)),
    );
    const descricao = h('input', {
      type: 'text',
      value: orc.pagamento_descricao,
      maxlength: '300',
      placeholder: 'Ex.: 50% de entrada + 50% na entrega',
      oninput: (e) => {
        orc.pagamento_descricao = e.target.value;
        atualizarValores();
      },
    });

    let unidade = orc.pagamento_entrada_tipo === 'percentual' ? 'percentual' : 'valor';
    const entrada = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Sem entrada' });
    const escrever = () => {
      const v = orc.pagamento_entrada_valor;
      entrada.value = orc.pagamento_entrada_tipo === 'nenhum' || !v ? '' : unidade === 'percentual' ? formatarPercentual(v) : dinheiroParaCampo(v);
    };
    const aplicar = () => {
      const v = unidade === 'percentual' ? lerPercentual(entrada.value) : lerDinheiro(entrada.value);
      entrada.classList.toggle('invalido', entrada.value.trim() !== '' && v === null);
      orc.pagamento_entrada_tipo = v ? unidade : 'nenhum';
      orc.pagamento_entrada_valor = v || 0;
      atualizarValores();
    };
    entrada.addEventListener('input', aplicar);
    escrever();
    entrada.id = 'entrada-pagamento';
    const parcelas = entradaNumero(orc.pagamento_parcelas || '', (v) => { orc.pagamento_parcelas = v; atualizarValores(); }, { min: 0, max: 120, placeholder: '0' });

    substituir(
      secaoPagamento,
      campo('Condição de pagamento', seletor, { classe: 'campo-inteiro' }),
      campo('Texto que aparece para o cliente', descricao, { classe: 'campo-inteiro' }),
      h(
        'div',
        { class: 'campo campo-metade' },
        h('label', { for: entrada.id }, 'Entrada'),
        h('div', { class: 'entrada-com-unidade' }, segmentado([['valor', 'R$'], ['percentual', '%']], unidade, (u) => { unidade = u; aplicar(); }, { rotulo: 'Tipo de entrada' }), entrada),
      ),
      campo('Parcelas do restante', parcelas, { classe: 'campo-metade', dica: '0 ou 1 = restante em uma vez' }),
      h('div', { class: 'campo-inteiro' }, previaPagamento),
    );
  }

  // ------------------------------------------------------------------ Ações
  async function salvar({ silencioso = false } = {}) {
    if (!orc.ambientes.some((a) => a.itens.length) && !orc.servicos.length) {
      aviso('Adicione pelo menos um móvel antes de salvar.', 'erro');
      return false;
    }
    const semDescricao = orc.servicos.findIndex((s) => !s.descricao.trim());
    if (semDescricao >= 0) {
      aviso(`Informe a descrição do serviço ${semDescricao + 1}.`, 'erro');
      return false;
    }
    botaoSalvar.disabled = true;
    botaoSalvarLateral.disabled = true;
    try {
      const payload = montarPayload(orc);
      const resposta = orc.id ? await api.put(`/orcamentos/${orc.id}`, payload) : await api.post('/orcamentos', payload);
      const eraNovo = !orc.id;
      orc = resposta;
      salvo = JSON.stringify(montarPayload(orc));
      if (eraNovo) history.replaceState(null, '', `#/orcamentos/${orc.id}`);
      atualizarCabecalho();
      redesenhar();
      carregarHistorico();
      if (!silencioso) aviso(eraNovo ? `Orçamento nº ${formatarNumero(orc.numero)} criado.` : 'Orçamento salvo.');
      return true;
    } catch (erro) {
      avisoErro(erro);
      return false;
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvarLateral.disabled = false;
    }
  }

  async function garantirSalvo() {
    if (orc.id && !alterado()) return true;
    return salvar({ silencioso: true });
  }

  async function abrirPdf() {
    // A janela é aberta já no clique para não ser bloqueada pelo navegador.
    const janela = window.open('', '_blank');
    if (!(await garantirSalvo())) {
      janela?.close();
      return;
    }
    const url = `/api/orcamentos/${orc.id}/pdf`;
    if (janela) janela.location.href = url;
    else location.href = url;
  }

  async function duplicar() {
    if (!orc.id) return;
    if (alterado()) {
      if (!(await confirmar('Salvar as alterações antes de duplicar?', { sim: 'Salvar e duplicar' }))) return;
      if (!(await salvar({ silencioso: true }))) return;
    }
    try {
      const copia = await api.post(`/orcamentos/${orc.id}/duplicar`);
      salvo = JSON.stringify(montarPayload(orc));
      aviso(`Cópia criada: orçamento nº ${formatarNumero(copia.numero)}. Altere o que precisar e salve.`);
      irPara(`#/orcamentos/${copia.id}`);
    } catch (erro) {
      avisoErro(erro);
    }
  }

  async function trocarCliente() {
    const cliente = await abrirModal('Trocar cliente', (fechar) => seletorCliente((c) => fechar(c)), { largo: true });
    if (!cliente) return;
    orc.cliente_id = cliente.id;
    orc.cliente = cliente;
    atualizarCabecalho();
    atualizarValores();
  }

  async function enviarAoCliente() {
    if (!(await garantirSalvo())) return;
    let pdf = null;
    const nomeArquivo = `Orcamento-${formatarNumero(orc.numero)}.pdf`;
    try {
      pdf = new File([await baixarBlob(`/orcamentos/${orc.id}/pdf`)], nomeArquivo, { type: 'application/pdf' });
    } catch (erro) {
      return avisoErro(erro);
    }
    const primeiroNome = (orc.cliente?.nome || '').trim().split(/\s+/)[0] || '';
    const mensagem = (empresa.mensagem_whatsapp || MENSAGEM_PADRAO).replaceAll('{cliente}', primeiroNome);
    const numero = numeroWhatsApp(orc.cliente?.whatsapp || orc.cliente?.telefone);
    const podeCompartilhar = Boolean(navigator.canShare?.({ files: [pdf] }));

    const enviado = await abrirModal('Enviar ao cliente', (fechar) => {
      const texto = h('textarea', { rows: '4', value: mensagem });
      const marcar = h('input', { type: 'checkbox', checked: ['rascunho', 'expirado'].includes(orc.status) });
      const baixar = () => {
        const url = URL.createObjectURL(pdf);
        const a = h('a', { href: url, download: nomeArquivo });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      };
      const concluir = () => fechar(marcar.checked);
      return h(
        'div',
        { class: 'envio' },
        h(
          'p',
          { class: 'aviso-caixa' },
          icone('cadeado', 'icone icone-mini'),
          'O PDF mostra apenas os ambientes, a descrição e o valor de cada móvel — sem preço por metro ou cálculos internos.',
        ),
        campo('Mensagem', texto),
        h(
          'div',
          { class: 'envio-passos' },
          podeCompartilhar
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'botao botao-primario botao-grande botao-bloco',
                  onclick: async () => {
                    try {
                      await navigator.share({ files: [pdf], text: texto.value, title: `Orçamento nº ${formatarNumero(orc.numero)}` });
                      concluir();
                    } catch (erro) {
                      if (erro.name !== 'AbortError') avisoErro(erro);
                    }
                  },
                },
                icone('compartilhar'),
                'Compartilhar PDF (WhatsApp, e-mail…)',
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-whatsapp botao-grande botao-bloco',
              onclick: () => {
                if (!podeCompartilhar) baixar();
                window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto.value)}`, '_blank', 'noopener');
                concluir();
              },
            },
            icone('whatsapp'),
            numero ? 'Abrir WhatsApp do cliente' : 'Abrir WhatsApp com a mensagem',
          ),
          !podeCompartilhar ? h('small', { class: 'dica' }, 'O PDF será baixado para você anexar na conversa.') : null,
          h('button', { type: 'button', class: 'botao botao-bloco', onclick: baixar }, icone('pdf'), 'Só baixar o PDF'),
        ),
        h('label', { class: 'caixa-marcar' }, marcar, ' Marcar orçamento como “Enviado”'),
      );
    });
    if (enviado && orc.status !== 'enviado') {
      try {
        orc = await api.patch(`/orcamentos/${orc.id}/status`, { status: 'enviado' });
        salvo = JSON.stringify(montarPayload(orc));
        atualizarCabecalho();
        seletorStatus.value = orc.status;
        redesenhar();
        carregarHistorico();
      } catch (erro) {
        avisoErro(erro);
      }
    }
  }

  async function carregarHistorico() {
    if (!orc.id) {
      substituir(historicoEl, h('p', { class: 'suave' }, 'O histórico começa quando o orçamento for salvo.'));
      return;
    }
    try {
      const eventos = await api.get(`/orcamentos/${orc.id}/historico`);
      substituir(
        historicoEl,
        h(
          'ol',
          { class: 'historico' },
          eventos
            .slice()
            .reverse()
            .map((e) =>
              h(
                'li',
                {},
                h('span', { class: 'historico-evento' }, e.evento),
                h('strong', {}, formatarDinheiro(e.total_cents)),
                h('span', { class: 'historico-data' }, formatarDataHora(e.data_hora)),
              ),
            ),
        ),
      );
    } catch (erro) {
      substituir(historicoEl, h('p', { class: 'suave' }, erro.message));
    }
  }

  // --------------------------------------------------------------- Montagem
  const seletorStatus = h(
    'select',
    {
      onchange: (e) => {
        orc.status = e.target.value;
        substituir(seloEl, selo(orc.status));
        atualizarValores();
      },
    },
    Object.entries(STATUS).map(([v, t]) => h('option', { value: v, selected: v === orc.status }, t)),
  );

  const dataEl = h('input', {
    type: 'date',
    value: orc.data,
    required: true,
    onchange: (e) => {
      if (e.target.value) orc.data = e.target.value;
      atualizarValores();
    },
  });

  const texto = (chave, attrs = {}) =>
    h(attrs.rows ? 'textarea' : 'input', {
      type: 'text',
      ...attrs,
      value: orc[chave] ?? '',
      oninput: (e) => {
        orc[chave] = e.target.value;
        atualizarValores();
      },
    });

  atualizarCabecalho();
  desenharServicos();
  desenharPagamento();
  redesenhar();
  carregarHistorico();

  const titulo = (nomeIcone, textoTitulo, extra) =>
    h('div', { class: 'cartao-titulo' }, h('h2', {}, icone(nomeIcone), textoTitulo), extra || null);

  return h(
    'div',
    { class: 'pagina pagina-editor' },
    h(
      'div',
      { class: 'cabecalho-pagina' },
      h('a', { href: '#/orcamentos', class: 'voltar', 'aria-label': 'Voltar' }, icone('voltar')),
      h('div', { class: 'titulos' }, tituloEl, subtituloEl),
      seloEl,
    ),
    h(
      'div',
      { class: 'editor' },
      h(
        'div',
        { class: 'editor-principal' },
        h(
          'section',
          { class: 'cartao' },
          titulo('clientes', 'Cliente e datas'),
          blocoCliente,
          h(
            'div',
            { class: 'grade-formulario' },
            campo('Data', dataEl, { classe: 'campo-terco' }),
            h(
              'div',
              { class: 'campo campo-terco' },
              h('label', { for: 'validade-dias' }, 'Validade (dias)'),
              entradaNumero(orc.validade_dias, (v) => { orc.validade_dias = v; atualizarValores(); }, { min: 0, max: 3650, id: 'validade-dias' }),
              validadeTexto,
            ),
            campo('Status', seletorStatus, { classe: 'campo-terco' }),
          ),
        ),

        h(
          'section',
          { class: 'secao-ambientes' },
          h(
            'div',
            { class: 'cartao-titulo' },
            h('h2', {}, icone('ambiente'), 'Ambientes e móveis'),
            h('span', { class: 'aviso-interno' }, icone('cadeado', 'icone icone-mini'), 'Cálculos internos — o cliente vê só descrição e valor'),
          ),
          listaAmbientes,
          h(
            'button',
            { type: 'button', class: 'botao botao-secundario botao-grande botao-bloco', onclick: () => criarAmbiente() },
            icone('mais'),
            'Adicionar ambiente',
          ),
        ),

        h(
          'section',
          { class: 'cartao' },
          titulo('servico', 'Serviços adicionais'),
          h(
            'div',
            { class: 'chips' },
            SERVICOS_RAPIDOS.map((s) => h('button', { type: 'button', class: 'chip', onclick: () => adicionarServico(s) }, `+ ${s}`)),
          ),
          listaServicos,
        ),

        h(
          'section',
          { class: 'cartao' },
          titulo('preco', 'Desconto e acréscimo'),
          h(
            'div',
            { class: 'grade-formulario' },
            h('div', { class: 'campo-metade' }, blocoAjuste('desconto', 'Desconto', descontoCalculado)),
            h(
              'div',
              { class: 'campo-metade formulario' },
              blocoAjuste('acrescimo', 'Acréscimo', acrescimoCalculado),
              campo('Nome do acréscimo', texto('acrescimo_descricao', { placeholder: 'Acréscimo', maxlength: '100' })),
            ),
          ),
        ),

        h(
          'section',
          { class: 'cartao' },
          titulo('pagamento', 'Pagamento, prazo e observações'),
          h(
            'div',
            { class: 'formulario' },
            secaoPagamento,
            h(
              'div',
              { class: 'grade-formulario' },
              campo('Prazo de entrega', texto('prazo_entrega', { placeholder: 'Ex.: 30 dias úteis', maxlength: '200' }), { classe: 'campo-inteiro' }),
              campo('Observações (aparecem no PDF)', texto('observacoes', { rows: '5', maxlength: '5000' }), { classe: 'campo-inteiro' }),
              campo('Observações internas (não aparecem para o cliente)', texto('observacoes_internas', { rows: '3', maxlength: '5000' }), {
                classe: 'campo-inteiro campo-interno',
              }),
            ),
          ),
        ),

        h('section', { class: 'cartao' }, titulo('historico', 'Histórico de alterações'), historicoEl),
      ),

      h(
        'aside',
        { class: 'editor-lateral' },
        h('section', { class: 'cartao' }, h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Resumo'), estadoSalvo), resumo),
        h('section', { class: 'cartao' }, acoesLateral),
      ),
    ),

    h(
      'div',
      { class: 'barra-salvar' },
      h('div', { class: 'barra-total' }, h('span', {}, 'Total do orçamento'), totalBarra, estadoBarra),
      h('div', { class: 'cabecalho-acoes' }, menuBarra, botaoSalvar),
    ),
  );
}

function formatarDataHora(texto) {
  // O servidor envia a data em ISO (UTC).
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return texto;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------- Formulário do ambiente

function formularioAmbiente(inicial, ambientes) {
  return abrirModal(inicial ? 'Editar ambiente' : 'Novo ambiente', (fechar) => {
    const nome = h('input', { type: 'text', required: true, maxlength: '100', value: inicial?.nome || '', placeholder: 'Ex.: Quarto do casal', autocomplete: 'off' });
    const descricao = h('textarea', {
      rows: '3',
      maxlength: '1000',
      value: inicial?.descricao || '',
      placeholder: 'Ex.: MDF branco TX, puxadores perfil em alumínio',
    });
    const usados = new Set(ambientes.map((a) => a.nome));
    const sugestoes = h(
      'div',
      { class: 'chips' },
      AMBIENTES_SUGERIDOS.filter((s) => !usados.has(s) || s === inicial?.nome).map((s) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            onclick: () => {
              nome.value = s;
              nome.focus();
            },
          },
          s,
        ),
      ),
    );
    setTimeout(() => nome.focus());
    return h(
      'form',
      {
        class: 'formulario',
        onsubmit: (e) => {
          e.preventDefault();
          const valor = nome.value.trim();
          if (!valor) return aviso('Dê um nome ao ambiente.', 'erro');
          fechar({ nome: valor, descricao: descricao.value.trim() });
        },
      },
      campo('Nome do ambiente', nome),
      h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Sugestões'), sugestoes),
      campo('Detalhes do ambiente (opcional, aparece no PDF)', descricao, { dica: 'Materiais, cores, acabamentos…' }),
      h(
        'div',
        { class: 'acoes-modal' },
        h('button', { type: 'button', class: 'botao', onclick: () => fechar(undefined) }, 'Cancelar'),
        h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, inicial ? 'Salvar ambiente' : 'Criar ambiente'),
      ),
    );
  });
}

// ------------------------------------------------------------ Formulário do móvel

function formularioItem(inicial, tipos, novo, ambientes, ambienteIndice) {
  const ativos = tipos.filter((t) => t.ativo || t.id === inicial?.tipo_movel_id);
  const item = inicial
    ? { ...inicial }
    : {
        tipo_movel_id: null,
        tipo_nome: '',
        descricao: '',
        metodo_calculo: 'linear',
        largura_mm: null,
        altura_mm: null,
        quantidade: 1,
        preco_padrao_cents: null,
        preco_unitario_interno_cents: 0,
        observacoes: '',
      };
  const nomeAmbiente = ambientes[ambienteIndice]?.nome;

  return abrirModal(
    novo ? `Adicionar móvel${nomeAmbiente ? ` · ${nomeAmbiente}` : ''}` : 'Editar móvel',
    (fechar) => {
      const gradeTipos = h('div', { class: 'grade-tipos', role: 'radiogroup', 'aria-label': 'Tipo de móvel' });
      const seletorAmbiente = h(
        'select',
        {},
        ambientes.map((a, i) => h('option', { value: String(i), selected: i === ambienteIndice }, a.nome)),
      );
      const descricao = h('input', { type: 'text', maxlength: '300', value: item.descricao, placeholder: 'Ex.: Guarda-roupa casal com portas de correr' });
      const largura = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', value: item.largura_mm ? formatarMedida(item.largura_mm) : '' });
      const altura = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', value: item.altura_mm ? formatarMedida(item.altura_mm) : '' });
      const preco = entradaDinheiro(item.preco_unitario_interno_cents, (v) => { item.preco_unitario_interno_cents = v; atualizar(); });
      const quantidade = entradaNumero(item.quantidade, (v) => { item.quantidade = v || 1; atualizar(); }, { min: 1 });
      const observacao = h('textarea', { rows: '2', maxlength: '1000', value: item.observacoes || '' });
      const campoLargura = campo('Medida (metros)', largura);
      const campoAltura = campo('Altura (metros)', altura);
      const rotuloPreco = h('label', { for: 'preco-item' }, '');
      preco.id = 'preco-item';
      const dicaPreco = h('small', { class: 'dica' });
      const alertaMedida = h('small', { class: 'dica alerta' });
      const resultado = h('div', { class: 'resultado-item', 'aria-live': 'polite' });
      const metodo = segmentado(
        Object.entries(METODOS).map(([v, m]) => [v, m.nome]),
        item.metodo_calculo,
        (v) => {
          item.metodo_calculo = v;
          atualizar();
        },
        { rotulo: 'Método de cálculo' },
      );

      const desenharTipos = () =>
        substituir(
          gradeTipos,
          ativos.map((t) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(t.id === item.tipo_movel_id),
                class: `tipo${t.id === item.tipo_movel_id ? ' ativo' : ''}`,
                onclick: () => escolherTipo(t),
              },
              h('span', { class: 'selo-icone' }, icone(ICONE_METODO[t.metodo_calculo], 'icone icone-mini')),
              h('div', {}, h('strong', {}, t.nome), h('small', {}, METODOS[t.metodo_calculo].nome)),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(!item.tipo_movel_id && Boolean(item.tipo_nome || item.descricao)),
              class: `tipo tipo-outro${!item.tipo_movel_id && (item.tipo_nome || item.descricao) ? ' ativo' : ''}`,
              onclick: () => {
                item.tipo_movel_id = null;
                item.tipo_nome = '';
                item.preco_padrao_cents = null;
                desenharTipos();
                descricao.focus();
                atualizar();
              },
            },
            h('span', { class: 'selo-icone' }, icone('editar', 'icone icone-mini')),
            h('div', {}, h('strong', {}, 'Outro'), h('small', {}, 'Digitar descrição e preço')),
          ),
        );

      const escolherTipo = (t) => {
        const anterior = tipos.find((x) => x.id === item.tipo_movel_id);
        const descricaoPadraoAnterior = anterior ? anterior.nome_cliente || anterior.nome : '';
        if (!descricao.value.trim() || descricao.value === descricaoPadraoAnterior) {
          descricao.value = t.nome_cliente || t.nome;
        }
        item.tipo_movel_id = t.id;
        item.tipo_nome = t.nome;
        item.metodo_calculo = t.metodo_calculo;
        item.preco_padrao_cents = t.preco_padrao_cents;
        item.preco_unitario_interno_cents = t.preco_padrao_cents;
        preco.value = dinheiroParaCampo(t.preco_padrao_cents);
        metodo.definir(t.metodo_calculo);
        desenharTipos();
        atualizar();
        (t.metodo_calculo === 'unidade' ? quantidade : largura).focus();
      };

      const lerMedidas = () => {
        item.largura_mm = lerMedida(largura.value);
        item.altura_mm = lerMedida(altura.value);
        largura.classList.toggle('invalido', largura.value.trim() !== '' && item.largura_mm === null);
        altura.classList.toggle('invalido', altura.value.trim() !== '' && item.altura_mm === null);
      };
      largura.addEventListener('input', () => { lerMedidas(); atualizar(); });
      altura.addEventListener('input', () => { lerMedidas(); atualizar(); });

      function atualizar() {
        const m = item.metodo_calculo;
        campoLargura.hidden = m === 'unidade';
        campoAltura.hidden = m !== 'quadrado';
        campoLargura.querySelector('label').textContent = m === 'quadrado' ? 'Largura (metros)' : 'Medida (metros)';
        rotuloPreco.textContent = `Preço interno (R$${METODOS[m].sufixo})`;
        const temPadrao = item.preco_padrao_cents !== null && item.preco_padrao_cents !== undefined;
        substituir(
          dicaPreco,
          temPadrao ? `Padrão: ${formatarDinheiro(item.preco_padrao_cents)}${METODOS[m].sufixo}. ` : '',
          temPadrao && item.preco_padrao_cents !== item.preco_unitario_interno_cents
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'link-botao',
                  onclick: () => {
                    item.preco_unitario_interno_cents = item.preco_padrao_cents;
                    preco.value = dinheiroParaCampo(item.preco_padrao_cents);
                    atualizar();
                  },
                },
                'Usar preço padrão',
              )
            : null,
          ' Só vale para este orçamento.',
        );
        const grande = [item.largura_mm, m === 'quadrado' ? item.altura_mm : 0].some((v) => v > 30000);
        alertaMedida.textContent = grande ? 'Confira: a medida deve ser informada em metros (ex.: 3,20).' : '';

        const completo = medidasCompletas(item);
        const r = calcularItem(item);
        substituir(
          resultado,
          h('span', {}, 'Valor do móvel'),
          h('strong', {}, completo ? formatarDinheiro(r.valor_total_cents) : '—'),
          completo ? h('small', {}, `${descreverMedida(item)} · ${descreverCalculo(item)}`) : h('small', {}, 'Informe a medida para calcular.'),
        );
      }

      const confirmarItem = (outro) => {
        lerMedidas();
        item.descricao = descricao.value.trim();
        item.observacoes = observacao.value.trim();
        if (!item.tipo_movel_id && !item.descricao) return aviso('Escolha o tipo de móvel ou digite uma descrição.', 'erro');
        if (!item.tipo_nome) item.tipo_nome = item.descricao;
        if (!medidasCompletas(item)) return aviso('Informe a medida do móvel.', 'erro');
        if (item.metodo_calculo !== 'quadrado') item.altura_mm = null;
        if (item.metodo_calculo === 'unidade') item.largura_mm = null;
        fechar({ item, outro, ambiente: Number(seletorAmbiente.value) });
      };

      desenharTipos();
      atualizar();
      setTimeout(() => (inicial ? largura : gradeTipos.querySelector('button'))?.focus());

      return h(
        'form',
        {
          class: 'formulario formulario-item',
          onsubmit: (e) => {
            e.preventDefault();
            confirmarItem(false);
          },
        },
        ambientes.length > 1 ? campo('Ambiente', seletorAmbiente) : null,
        h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Tipo de móvel'), gradeTipos),
        campo('Descrição (aparece para o cliente)', descricao),
        h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Como calcular'), metodo),
        h('div', { class: 'grade-formulario' }, h('div', { class: 'campo-metade' }, campoLargura), h('div', { class: 'campo-metade' }, campoAltura)),
        alertaMedida,
        h(
          'div',
          { class: 'grade-formulario' },
          h('div', { class: 'campo campo-metade campo-interno' }, rotuloPreco, preco, dicaPreco),
          campo('Quantidade', quantidade, { classe: 'campo-metade' }),
        ),
        h('details', { class: 'mais-opcoes', open: Boolean(item.observacoes) }, h('summary', {}, 'Observação interna'), campo('Não aparece para o cliente', observacao)),
        resultado,
        h(
          'div',
          { class: 'acoes-modal' },
          novo ? h('button', { type: 'button', class: 'botao', onclick: () => confirmarItem(true) }, 'Salvar e adicionar outro') : null,
          h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, novo ? 'Adicionar ao ambiente' : 'Salvar móvel'),
        ),
      );
    },
    { largo: true },
  );
}

function medidasCompletas(item) {
  if (item.metodo_calculo === 'unidade') return true;
  if (!item.largura_mm) return false;
  return item.metodo_calculo !== 'quadrado' || Boolean(item.altura_mm);
}

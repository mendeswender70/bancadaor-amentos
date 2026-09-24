import {
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
  vazio,
} from '../ui.js';
import { selo, seletorCliente, numeroWhatsApp } from '../comum.js';
import { aoSairDaPagina, irPara } from '../main.js';

const SERVICOS_RAPIDOS = ['Frete', 'Montagem', 'Instalação', 'Vidro', 'Espelho', 'Iluminação', 'Serviço adicional', 'Outros'];
const MENSAGEM_PADRAO =
  'Olá, {cliente}! Segue o orçamento dos móveis planejados conforme conversamos. Qualquer dúvida estou à disposição.';

// Campos enviados ao servidor (os valores calculados são refeitos por ele).
function montarPayload(orc) {
  return {
    cliente_id: orc.cliente_id,
    data: orc.data,
    validade_dias: orc.validade_dias,
    status: orc.status,
    itens: orc.itens.map((i) => ({
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
    })),
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
  return h('div', { class: `resumo-linha ${classe}` }, h('span', {}, rotulo), h('strong', {}, valor));
}

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
    orc = { ...modelo, cliente_id: cliente.id, cliente };
  }

  let salvo = id ? JSON.stringify(montarPayload(orc)) : null;
  const alterado = () => salvo !== JSON.stringify(montarPayload(orc));
  const verificar = async () => !alterado() || confirmar('Existem alterações não salvas. Deseja sair sem salvar?', { titulo: 'Sair sem salvar?', sim: 'Sair sem salvar', perigo: true });
  verificar.sincrono = () => !alterado();
  aoSairDaPagina(verificar);

  // ------------------------------------------------------------ Elementos fixos
  const tituloEl = h('h1', {});
  const seloEl = h('span', {});
  const acoesTopo = h('div', { class: 'acoes-orcamento' });
  const blocoCliente = h('div', { class: 'bloco-cliente' });
  const validadeTexto = h('small', { class: 'dica' });
  const listaItens = h('div', { class: 'lista-itens' });
  const listaServicos = h('div', { class: 'lista-servicos' });
  const resumo = h('div', { class: 'resumo' });
  const descontoCalculado = h('small', { class: 'dica' });
  const acrescimoCalculado = h('small', { class: 'dica' });
  const previaPagamento = h('div', { class: 'previa-pagamento' });
  const historicoEl = h('div', {});
  const totalBarra = h('strong', { class: 'barra-total-valor' });
  const avisoAlterado = h('span', { class: 'barra-alterado' });
  const botaoSalvar = h('button', { type: 'button', class: 'botao botao-primario botao-grande', onclick: () => salvar() }, icone('salvar'), 'Salvar');

  // --------------------------------------------------------------- Atualizações
  function atualizarCabecalho() {
    tituloEl.textContent = orc.numero ? `Orçamento nº ${formatarNumero(orc.numero)}` : 'Novo orçamento';
    substituir(seloEl, selo(orc.status));
    const c = orc.cliente || {};
    substituir(
      blocoCliente,
      h(
        'div',
        {},
        h('strong', { class: 'cliente-nome' }, c.nome),
        h('div', { class: 'suave' }, [c.telefone, c.whatsapp && c.whatsapp !== c.telefone ? `WhatsApp ${c.whatsapp}` : ''].filter(Boolean).join(' · ') || 'Sem telefone'),
      ),
      h('button', { type: 'button', class: 'botao botao-pequeno', onclick: trocarCliente }, 'Trocar'),
    );
    substituir(
      acoesTopo,
      h('button', { type: 'button', class: 'botao', onclick: abrirPdf }, icone('pdf'), 'Gerar PDF'),
      h('button', { type: 'button', class: 'botao botao-whatsapp', onclick: enviarAoCliente }, icone('whatsapp'), 'Enviar ao cliente'),
      orc.id ? h('button', { type: 'button', class: 'botao', onclick: duplicar }, icone('copiar'), 'Duplicar') : null,
    );
    if (orc.duplicado_de_numero) {
      acoesTopo.append(h('span', { class: 'suave pequeno' }, `Cópia do nº ${formatarNumero(orc.duplicado_de_numero)}`));
    }
  }

  function atualizarValores() {
    const t = calcularTotais(orc);
    validadeTexto.textContent = `Válido até ${formatarData(somarDias(orc.data, orc.validade_dias))}`;
    descontoCalculado.textContent = orc.desconto_tipo === 'percentual' && t.desconto_cents ? `= ${formatarDinheiro(t.desconto_cents)}` : '';
    acrescimoCalculado.textContent = orc.acrescimo_tipo === 'percentual' && t.acrescimo_cents ? `= ${formatarDinheiro(t.acrescimo_cents)}` : '';
    substituir(
      resumo,
      linhaResumo('Móveis', formatarDinheiro(t.subtotal_moveis_cents)),
      t.subtotal_servicos_cents ? linhaResumo('Serviços adicionais', formatarDinheiro(t.subtotal_servicos_cents)) : null,
      linhaResumo('Subtotal', formatarDinheiro(t.subtotal_cents), 'resumo-subtotal'),
      t.acrescimo_cents ? linhaResumo(orc.acrescimo_descricao || 'Acréscimo', formatarDinheiro(t.acrescimo_cents)) : null,
      t.desconto_cents ? linhaResumo('Desconto', `- ${formatarDinheiro(t.desconto_cents)}`, 'resumo-desconto') : null,
      linhaResumo('TOTAL', formatarDinheiro(t.total_cents), 'resumo-total'),
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
    avisoAlterado.textContent = !orc.id ? 'Ainda não salvo' : mudou ? 'Alterações não salvas' : 'Salvo';
    avisoAlterado.classList.toggle('pendente', !orc.id || mudou);
  }

  // ---------------------------------------------------------------- Móveis
  function desenharItens() {
    if (!orc.itens.length) {
      substituir(listaItens, vazio('Nenhum móvel adicionado. Toque em “Adicionar móvel” para começar.'));
      return;
    }
    substituir(
      listaItens,
      orc.itens.map((item, i) => {
        const r = calcularItem(item);
        const personalizado = item.preco_padrao_cents !== null && item.preco_padrao_cents !== undefined && item.preco_padrao_cents !== item.preco_unitario_interno_cents;
        return h(
          'div',
          { class: 'item' },
          h(
            'button',
            { type: 'button', class: 'item-corpo', onclick: () => editarItem(i), 'aria-label': `Editar ${item.descricao || item.tipo_nome}` },
            h(
              'div',
              { class: 'item-topo' },
              h('strong', {}, item.descricao || item.tipo_nome),
              h('strong', { class: 'item-valor' }, formatarDinheiro(r.valor_total_cents)),
            ),
            h(
              'div',
              { class: 'item-detalhes' },
              h('span', {}, [item.tipo_nome && item.tipo_nome !== item.descricao ? item.tipo_nome : null, descreverMedida(item)].filter(Boolean).join(' · ')),
              h('span', { class: 'item-calculo' }, icone('cadeado', 'icone icone-mini'), descreverCalculo(item)),
              personalizado ? h('span', { class: 'etiqueta' }, `preço personalizado (padrão ${formatarDinheiro(item.preco_padrao_cents)})`) : null,
              item.observacoes ? h('span', { class: 'item-obs' }, item.observacoes) : null,
            ),
          ),
          h(
            'div',
            { class: 'item-acoes' },
            h('button', { type: 'button', class: 'botao-icone', title: 'Copiar móvel', 'aria-label': 'Copiar móvel', onclick: () => copiarItem(i) }, icone('copiar')),
            h('button', { type: 'button', class: 'botao-icone perigo', title: 'Remover móvel', 'aria-label': 'Remover móvel', onclick: () => removerItem(i) }, icone('lixeira')),
          ),
        );
      }),
    );
  }

  async function removerItem(i) {
    const item = orc.itens[i];
    if (!(await confirmar(`Remover “${item.descricao || item.tipo_nome}” do orçamento?`, { sim: 'Remover', perigo: true }))) return;
    orc.itens.splice(i, 1);
    desenharItens();
    atualizarValores();
  }

  function copiarItem(i) {
    orc.itens.splice(i + 1, 0, { ...orc.itens[i], id: undefined });
    desenharItens();
    atualizarValores();
    aviso('Móvel copiado. Toque nele para ajustar.');
  }

  async function editarItem(indice) {
    const novo = indice === undefined;
    let continuar = true;
    while (continuar) {
      const inicial = novo ? null : orc.itens[indice];
      const resultado = await formularioItem(inicial, tipos, novo);
      continuar = false;
      if (!resultado) break;
      if (novo) orc.itens.push(resultado.item);
      else orc.itens[indice] = resultado.item;
      desenharItens();
      atualizarValores();
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
    return h(
      'div',
      { class: 'campo' },
      h('label', { for: entrada.id }, rotulo),
      h('div', { class: 'entrada-com-unidade' }, unidades, entrada),
      calculado,
    );
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
    if (!orc.itens.length && !orc.servicos.length) {
      aviso('Adicione pelo menos um móvel antes de salvar.', 'erro');
      return false;
    }
    const semDescricao = orc.servicos.findIndex((s) => !s.descricao.trim());
    if (semDescricao >= 0) {
      aviso(`Informe a descrição do serviço ${semDescricao + 1}.`, 'erro');
      return false;
    }
    botaoSalvar.disabled = true;
    try {
      const payload = montarPayload(orc);
      const resposta = orc.id ? await api.put(`/orcamentos/${orc.id}`, payload) : await api.post('/orcamentos', payload);
      const eraNovo = !orc.id;
      orc = resposta;
      salvo = JSON.stringify(montarPayload(orc));
      if (eraNovo) history.replaceState(null, '', `#/orcamentos/${orc.id}`);
      atualizarCabecalho();
      desenharItens();
      atualizarValores();
      carregarHistorico();
      if (!silencioso) aviso(eraNovo ? `Orçamento nº ${formatarNumero(orc.numero)} criado.` : 'Orçamento salvo.');
      return true;
    } catch (erro) {
      avisoErro(erro);
      return false;
    } finally {
      botaoSalvar.disabled = false;
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
        h('p', { class: 'modal-texto' }, 'O PDF mostra apenas a descrição e o valor de cada móvel — sem preço por metro ou cálculos internos.'),
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
                const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto.value)}`;
                window.open(url, '_blank', 'noopener');
                concluir();
              },
            },
            icone('whatsapp'),
            numero ? 'Abrir WhatsApp do cliente com a mensagem' : 'Abrir WhatsApp com a mensagem',
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
        atualizarValores();
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
                h('span', { class: 'historico-data' }, formatarDataHora(e.data_hora)),
                h('span', { class: 'historico-evento' }, e.evento),
                h('strong', {}, formatarDinheiro(e.total_cents)),
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
  desenharItens();
  desenharServicos();
  desenharPagamento();
  atualizarValores();
  carregarHistorico();

  const pagina = h(
    'div',
    { class: 'pagina pagina-editor' },
    h(
      'div',
      { class: 'cabecalho-pagina' },
      h('a', { href: '#/orcamentos', class: 'voltar', 'aria-label': 'Voltar' }, icone('voltar')),
      tituloEl,
      seloEl,
    ),
    acoesTopo,

    h(
      'section',
      { class: 'cartao' },
      h('h2', {}, 'Cliente e datas'),
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
      { class: 'cartao' },
      h(
        'div',
        { class: 'cartao-titulo' },
        h('h2', {}, 'Móveis'),
        h('span', { class: 'aviso-interno' }, icone('cadeado', 'icone icone-mini'), 'Cálculo interno — o cliente vê só descrição e valor'),
      ),
      listaItens,
      h('button', { type: 'button', class: 'botao botao-primario botao-grande botao-bloco', onclick: () => editarItem() }, icone('mais'), 'ADICIONAR MÓVEL'),
    ),

    h(
      'section',
      { class: 'cartao' },
      h('h2', {}, 'Serviços adicionais'),
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
      h('h2', {}, 'Desconto e acréscimo'),
      h(
        'div',
        { class: 'grade-formulario' },
        h('div', { class: 'campo-metade' }, blocoAjuste('desconto', 'Desconto', descontoCalculado)),
        h(
          'div',
          { class: 'campo-metade' },
          blocoAjuste('acrescimo', 'Acréscimo', acrescimoCalculado),
          campo('Nome do acréscimo', texto('acrescimo_descricao', { placeholder: 'Acréscimo', maxlength: '100' })),
        ),
      ),
      resumo,
    ),

    h(
      'section',
      { class: 'cartao' },
      h('h2', {}, 'Pagamento, prazo e observações'),
      secaoPagamento,
      h(
        'div',
        { class: 'grade-formulario' },
        campo('Prazo de entrega', texto('prazo_entrega', { placeholder: 'Ex.: 30 dias úteis', maxlength: '200' }), { classe: 'campo-inteiro' }),
        campo('Observações (aparecem no PDF)', texto('observacoes', { rows: '5', maxlength: '5000' }), { classe: 'campo-inteiro' }),
        campo('Observações internas (não aparecem para o cliente)', texto('observacoes_internas', { rows: '3', maxlength: '5000' }), { classe: 'campo-inteiro campo-interno' }),
      ),
    ),

    h('section', { class: 'cartao' }, h('h2', {}, icone('historico'), ' Histórico de alterações'), historicoEl),

    h(
      'div',
      { class: 'barra-salvar' },
      h('div', { class: 'barra-total' }, h('span', {}, 'Total'), totalBarra, avisoAlterado),
      botaoSalvar,
    ),
  );
  return pagina;
}

function formatarDataHora(texto) {
  // O servidor grava em UTC ("AAAA-MM-DD HH:MM:SS").
  const d = new Date(`${String(texto).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return texto;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ------------------------------------------------------------ Formulário do móvel

function formularioItem(inicial, tipos, novo) {
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

  return abrirModal(novo ? 'Adicionar móvel' : 'Editar móvel', (fechar) => {
    const gradeTipos = h('div', { class: 'grade-tipos', role: 'radiogroup', 'aria-label': 'Tipo de móvel' });
    const descricao = h('input', { type: 'text', maxlength: '300', value: item.descricao, placeholder: 'Ex.: Guarda-roupa casal — quarto principal' });
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
    const resultado = h('div', { class: 'resultado-item' });
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
            h('strong', {}, t.nome),
            h('small', {}, METODOS[t.metodo_calculo].nome),
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
          h('strong', {}, 'Outro'),
          h('small', {}, 'Digitar descrição e preço'),
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
      fechar({ item, outro });
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
        h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, novo ? 'Adicionar ao orçamento' : 'Salvar móvel'),
      ),
    );
  }, { largo: true });
}

function medidasCompletas(item) {
  if (item.metodo_calculo === 'unidade') return true;
  if (!item.largura_mm) return false;
  return item.metodo_calculo !== 'quadrado' || Boolean(item.altura_mm);
}

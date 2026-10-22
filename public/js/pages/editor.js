import {
  AMBIENTES_SUGERIDOS,
  ETAPAS,
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
  textoPagamento,
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
  haQuanto,
} from '../ui.js';
import { avatar, selo, seletorCliente, numeroWhatsApp, excluirOrcamento, dataCompacta } from '../comum.js';
import { abrirEnvio, linkDaProposta } from '../envio.js';
import { aoSairDaPagina, irPara, substituirEndereco } from '../main.js';
import { seletorParcelas } from './config.js';

const SERVICOS_RAPIDOS = ['Frete', 'Montagem', 'Instalação', 'Vidro', 'Espelho', 'Iluminação', 'Serviço adicional', 'Outros'];
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
  const rotaDoEditor = location.hash;
  const [tipos, condicoes] = await Promise.all([
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

  // ------------------------------------------------------ Salvamento automático
  // `salvo` guarda o que o servidor já tem; qualquer diferença é salva sozinha
  // pouco depois da última alteração.
  const inicial = JSON.stringify(montarPayload(orc));
  let salvo = id ? inicial : null;
  let salvoEm = id ? new Date() : null;
  let estado = id ? 'salvo' : 'novo'; // novo | pendente | salvando | salvo | incompleto | erro
  let motivoIncompleto = '';
  let emAndamento = null;
  let refazer = false;
  let timer = 0;
  let conflito = false;

  const alterado = () => (salvo ?? inicial) !== JSON.stringify(montarPayload(orc));

  function problemaParaSalvar() {
    if (!orc.ambientes.some((a) => a.itens.length) && !orc.servicos.length) return 'Adicione um móvel para salvar';
    const semDescricao = orc.servicos.findIndex((s) => !s.descricao.trim());
    if (semDescricao >= 0) return `Dê um nome ao serviço ${semDescricao + 1}`;
    return '';
  }

  function agendar() {
    clearTimeout(timer);
    if (conflito) return;
    timer = setTimeout(() => salvar({ silencioso: true }), 1200);
  }

  async function salvar({ silencioso = false } = {}) {
    clearTimeout(timer);
    if (conflito) return false;
    if (emAndamento) {
      refazer = true;
      return emAndamento;
    }
    const problema = problemaParaSalvar();
    if (problema) {
      motivoIncompleto = problema;
      estado = 'incompleto';
      mostrarEstado();
      if (!silencioso) aviso(`${problema}.`, 'erro');
      return false;
    }
    if (orc.id && !alterado()) {
      estado = 'salvo';
      mostrarEstado();
      return true;
    }
    estado = 'salvando';
    mostrarEstado();
    const payload = montarPayload(orc);
    const eraNovo = !orc.id;
    emAndamento = (async () => {
      try {
        const resposta = orc.id ? await api.put(`/orcamentos/${orc.id}`, { ...payload, versao: orc.versao }) : await api.post('/orcamentos', payload);
        // Não troca `orc` pela resposta: o usuário pode ter continuado digitando.
        const perdeuAceite = orc.status === 'aprovado' && resposta.status === 'negociacao';
        for (const campoServidor of ['id', 'numero', 'criado_em', 'data_validade', 'status', 'duplicado_de_numero', 'total_cents', 'versao', 'versao_proposta', 'aprovado_em', 'aprovado_por', 'aprovado_pelo_link']) {
          orc[campoServidor] = resposta[campoServidor];
        }
        salvo = JSON.stringify({ ...payload, status: resposta.status });
        if (perdeuAceite) aviso('Proposta alterada. O cliente precisa conferir e aprovar novamente.');
        salvoEm = new Date();
        estado = 'salvo';
        if (eraNovo) {
          substituirEndereco(`#/orcamentos/${orc.id}`);
          aviso(`Orçamento nº ${formatarNumero(orc.numero)} criado e salvo.`);
        }
        atualizarCabecalho();
        carregarHistorico();
        return true;
      } catch (erro) {
        if (erro.status === 409) marcarConflito();
        else estado = 'erro';
        if (!silencioso || erro.status !== 0) avisoErro(erro);
        return false;
      } finally {
        emAndamento = null;
        mostrarEstado();
      }
    })();
    const ok = await emAndamento;
    if (conflito) return false;
    if (refazer) {
      refazer = false;
      if (alterado()) return salvar({ silencioso: true });
    } else if (ok && alterado()) {
      agendar();
    }
    return ok;
  }

  async function garantirSalvo() {
    if (conflito) return false;
    while (!orc.id || alterado() || emAndamento) {
      if (!(await salvar())) return false;
    }
    return true;
  }

  const verificar = async () => {
    if (!alterado()) return true;
    if (await salvar({ silencioso: true })) return true;
    return confirmar(`${motivoIncompleto || 'Não foi possível salvar as últimas alterações'}. Sair mesmo assim e descartar?`, {
      titulo: 'Sair sem salvar?',
      sim: 'Sair sem salvar',
      perigo: true,
    });
  };
  verificar.sincrono = () => !alterado();
  aoSairDaPagina(verificar, rotaDoEditor);

  const atalhoTeclado = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      salvar();
    }
  };

  // ------------------------------------------------------------ Elementos fixos
  const tituloEl = h('h1', {});
  const estadoTopoMobile = h('span', { class: 'editor-auto-save-text' }, 'Salvo automaticamente');
  const estadoTopoDesktop = h('span', { class: 'editor-auto-save-text' }, 'Salvo automaticamente');
  const seloStatusTopo = h('span', { class: 'editor-status-badge' });
  const resumoClienteLateral = h('p', { class: 'editor-resumo-cliente' });
  const resumoPagamentoLateral = h('div', { class: 'editor-resumo-pagamento' });
  const etapasEl = h('div', { class: 'etapas-area' });
  const blocoCliente = h('div', { class: 'bloco-cliente' });
  const validadeTexto = h('small', { class: 'dica' });
  const listaAmbientes = h('div', { class: 'lista-ambientes' });
  const listaServicos = h('div', { class: 'lista-servicos' });
  const resumo = h('div', { class: 'resumo' });
  const estadoSalvo = h('span', { class: 'estado-salvo' });
  const estadoBarra = h('span', { class: 'estado-salvo' });
  const acoesLateral = h('div', { class: 'acoes-orcamento' });
  const descontoCalculado = h('small', { class: 'dica' });
  const acrescimoCalculado = h('small', { class: 'dica' });
  const previaPagamento = h('div', { class: 'previa-pagamento' });
  const historicoEl = h('div', {});
  const totalBarra = h('strong', { class: 'barra-total-valor' });
  const menuBarra = h('div', {});
  const campoNomeAcrescimo = h('div', {});
  const contadorHistorico = h('span', { class: 'contador-aba' });
  const avisoConflito = h(
    'div',
    { class: 'aviso-caixa aviso-atencao', role: 'alert', hidden: true },
    h('div', {}, h('strong', {}, 'O orçamento foi atualizado em outra tela ou pelo cliente.'),
      h('p', {}, 'Suas alterações continuam nesta tela, mas não foram salvas. Confira ou copie o que precisar antes de reabrir o orçamento.')),
    h('button', { type: 'button', class: 'botao', onclick: async () => {
      if (alterado() && !(await confirmar('Reabrir a versão atual e descartar as alterações não salvas desta tela?', { sim: 'Reabrir orçamento' }))) return;
      salvo = JSON.stringify(montarPayload(orc));
      location.reload();
    } }, 'Reabrir orçamento'),
  );

  function marcarConflito() {
    conflito = true;
    clearTimeout(timer);
    estado = 'conflito';
    avisoConflito.hidden = false;
    mostrarEstado();
  }

  function mostrarEstado() {
    const textos = {
      novo: 'Ainda não salvo',
      pendente: 'Salvando em instantes…',
      salvando: 'Salvando…',
      salvo: salvoEm ? `Salvo às ${salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Salvo',
      incompleto: motivoIncompleto,
      erro: 'Não foi salvo — tentar de novo',
      conflito: 'Não salvo — reabra a versão atual',
    };
    for (const el of [estadoSalvo, estadoBarra]) {
      el.textContent = textos[estado];
      el.className = `estado-salvo estado-${estado}`;
      el.onclick = estado === 'erro' ? () => salvar() : null;
      el.setAttribute('role', 'status');
    }
    if (estado === 'salvo') estadoSalvo.textContent = 'Alterações salvas automaticamente';
    estadoBarra.textContent = estado === 'salvo' ? 'Alterações salvas automaticamente' : textos[estado];
    if (!orc.id) estadoBarra.textContent = 'Adicione um móvel para salvar este orçamento.';
    const textoTopo = !orc.id ? 'O número é gerado com o primeiro móvel.' : estado === 'salvo' ? 'Salvo automaticamente' : textos[estado];
    estadoTopoMobile.textContent = textoTopo;
    estadoTopoDesktop.textContent = textoTopo;
  }

  // --------------------------------------------------------------- Atualizações
  function atualizarCabecalho() {
    tituloEl.textContent = orc.numero ? `Orçamento ${formatarNumero(orc.numero)}` : 'Novo orçamento';
    seloStatusTopo.textContent = STATUS[orc.status] || orc.status;
    seloStatusTopo.className = `editor-status-badge selo-${orc.status}`;
    resumoClienteLateral.textContent = orc.cliente?.nome || '';
    const paginaAtual = blocoCliente.closest('.pagina-editor');
    if (paginaAtual) {
      paginaAtual.classList.toggle('editor-novo', !orc.numero);
      paginaAtual.querySelector('.editor-eyebrow').textContent = orc.numero ? 'EDITOR DE ORÇAMENTO' : 'NOVO ORÇAMENTO · 2 DE 2';
      paginaAtual.querySelectorAll('.editor-ver-proposta-mobile, .editor-ver-proposta-desktop, .editor-historico-topo').forEach((botao) => { botao.disabled = !orc.id; });
    }
    resumoPagamentoLateral.replaceChildren(
      h('span', {}, orc.pagamento_descricao || 'Pagamento não informado'),
      orc.prazo_entrega ? h('span', {}, `Entrega em ${orc.prazo_entrega}`) : null,
    );
    desenharEtapas();
    const c = orc.cliente || {};
    substituir(
      blocoCliente,
      !orc.numero ? avatar(c.nome, 'editor-cliente-icone') : h('span', { class: 'editor-cliente-icone' }, icone('clientes')),
      h(
        'div',
        { class: 'editor-cliente-dados' },
        h('strong', { class: 'cliente-nome' }, c.nome),
        h(
          'span',
          { class: 'suave' },
          [c.telefone, c.whatsapp && c.whatsapp !== c.telefone ? `WhatsApp ${c.whatsapp}` : ''].filter(Boolean).join(' · ') || 'Sem telefone',
        ),
      ),
      h('button', { type: 'button', class: `${orc.numero ? 'botao-icone' : 'botao'} editor-trocar-cliente`, 'aria-label': 'Trocar cliente', onclick: trocarCliente }, orc.numero ? icone('baixo') : 'Trocar'),
    );
    const acoes = [
      ['whatsapp', 'Enviar ao cliente', enviarAoCliente],
      ['olho', 'Ver como o cliente vê', verComoCliente],
      ['pdf', 'Baixar PDF', abrirPdf],
      ['copiar', 'Duplicar orçamento', duplicar, { desativado: !orc.id }],
      '-',
      ['lixeira', 'Excluir orçamento', excluir, { perigo: true, desativado: !orc.id }],
    ];
    substituir(
      acoesLateral,
      h('button', { type: 'button', class: 'botao botao-whatsapp botao-grande', onclick: enviarAoCliente }, icone('whatsapp'), 'Enviar ao cliente'),
      h('button', { type: 'button', class: 'botao', onclick: verComoCliente }, icone('olho'), 'Ver como o cliente vê'),
      h(
        'div',
        { class: 'acoes-dupla' },
        h('button', { type: 'button', class: 'botao', onclick: abrirPdf }, icone('pdf'), 'Baixar PDF'),
        h('button', { type: 'button', class: 'botao', onclick: duplicar, disabled: !orc.id }, icone('copiar'), 'Duplicar'),
      ),
    );
    substituir(menuBarra, menuSuspenso(acoes, { rotulo: 'Ações do orçamento' }));
  }

  // Situação do orçamento: caminho normal em etapas + as saídas (recusado…).
  function desenharEtapas() {
    const atual = orc.status;
    const indiceAtual = ETAPAS.indexOf(atual);
    const fora = indiceAtual < 0;
    const passo = (status, i) =>
      h(
        'button',
        {
          type: 'button',
          class: `etapa${status === atual ? ' atual' : ''}${!fora && i < indiceAtual ? ' feita' : ''}`,
          'aria-pressed': String(status === atual),
          disabled: !orc.id && status !== 'rascunho',
          title: orc.id ? `Marcar como ${STATUS[status]}` : 'Salve o orçamento primeiro',
          onclick: () => mudarStatus(status),
        },
        h('span', { class: 'etapa-marca' }, !fora && i < indiceAtual ? icone('check', 'icone icone-mini') : String(i + 1)),
        h('span', {}, STATUS[status]),
      );
    const detalhes = [];
    if (orc.aprovado_pelo_link && atual === 'aprovado') {
      detalhes.push(
        h('span', { class: 'etiqueta-linha sucesso' }, icone('check', 'icone icone-mini'), `Aprovado pelo cliente${orc.aprovado_por ? ` (${orc.aprovado_por})` : ''} ${haQuanto(orc.aprovado_em)}`),
      );
    } else if (orc.visualizacoes) {
      detalhes.push(
        h(
          'span',
          { class: 'etiqueta-linha info' },
          icone('olho', 'icone icone-mini'),
          `Cliente viu a proposta ${orc.visualizacoes === 1 ? '1 vez' : `${orc.visualizacoes} vezes`} · última ${haQuanto(orc.ultima_visualizacao_em)}`,
        ),
      );
    }
    substituir(
      etapasEl,
      h(
        'div',
        { class: `etapas${fora ? ' fora' : ''}`, role: 'group', 'aria-label': 'Situação do orçamento' },
        ETAPAS.map(passo),
        h(
          'div',
          { class: 'etapa-outras' },
          fora ? selo(atual) : null,
          menuSuspenso(
            Object.keys(STATUS)
              .filter((s) => !ETAPAS.includes(s) && s !== 'expirado')
              .map((s) => [s === 'recusado' ? 'alerta' : 'lixeira', `Marcar como ${STATUS[s]}`, () => mudarStatus(s), { desativado: !orc.id || s === atual }]),
            { rotulo: 'Outras situações' },
          ),
        ),
      ),
      detalhes.length ? h('div', { class: 'etapas-detalhes' }, detalhes) : null,
    );
  }

  async function mudarStatus(status) {
    if (status === orc.status) return;
    if (!(await garantirSalvo())) return;
    if (['recusado', 'cancelado'].includes(status) && !(await confirmar(`Marcar o orçamento como “${STATUS[status]}”?`, { sim: `Marcar como ${STATUS[status]}` }))) return;
    try {
      const r = await api.patch(`/orcamentos/${orc.id}/status`, { status, versao: orc.versao });
      const pendente = alterado();
      Object.assign(orc, {
        status: r.status,
        aprovado_em: r.aprovado_em,
        aprovado_por: r.aprovado_por,
        aprovado_pelo_link: r.aprovado_pelo_link,
        versao: r.versao,
        versao_proposta: r.versao_proposta,
      });
      // O servidor já tem a nova situação; só o resto (se houver) fica pendente.
      if (salvo) salvo = JSON.stringify({ ...JSON.parse(salvo), status: r.status });
      if (!pendente) salvo = JSON.stringify(montarPayload(orc));
      desenharEtapas();
      carregarHistorico();
      aviso(`Situação: ${STATUS[r.status]}.`);
    } catch (erro) {
      if (erro.status === 409) marcarConflito();
      avisoErro(erro);
    }
  }

  function atualizarValores() {
    const t = calcularTotais(orc);
    validadeTexto.textContent = `Válido até ${formatarData(somarDias(orc.data, orc.validade_dias))}`;
    descontoCalculado.textContent = orc.desconto_tipo === 'percentual' && t.desconto_cents ? `= ${formatarDinheiro(t.desconto_cents)}` : '';
    acrescimoCalculado.textContent = orc.acrescimo_tipo === 'percentual' && t.acrescimo_cents ? `= ${formatarDinheiro(t.acrescimo_cents)}` : '';
    campoNomeAcrescimo.hidden = orc.acrescimo_tipo === 'nenhum';
    substituir(
      resumo,
      orc.ambientes.length
        ? orc.ambientes.map((a) => linhaResumo(a.nome, formatarDinheiro(subtotalAmbiente(a)), `resumo-ambiente${a.itens.length ? '' : ' resumo-vazio'}`))
        : linhaResumo('Móveis', formatarDinheiro(0)),
      linhaResumo('Serviços', formatarDinheiro(t.subtotal_servicos_cents || 0), 'resumo-servicos'),
      t.acrescimo_cents ? linhaResumo(orc.acrescimo_descricao || 'Acréscimo', formatarDinheiro(t.acrescimo_cents)) : null,
      linhaResumo('Desconto', formatarDinheiro(t.desconto_cents || 0), 'resumo-desconto'),
      linhaResumo('Total', formatarDinheiro(t.total_cents), 'resumo-total'),
    );
    const linhas = descreverPagamento(t.total_cents, {
      entrada_tipo: orc.pagamento_entrada_tipo,
      entrada_valor: orc.pagamento_entrada_valor,
      parcelas: orc.pagamento_parcelas,
    });
    substituir(previaPagamento, linhas.length ? linhas.map((l) => h('div', {}, l)) : h('div', {}, `Total de ${formatarDinheiro(t.total_cents)} de uma vez`));
    const resumoCondicao = secaoPagamento.querySelector('.editor-pagamento-opcoes > summary');
    if (resumoCondicao) resumoCondicao.textContent = orc.pagamento_descricao || 'Personalizar condições';
    totalBarra.textContent = formatarDinheiro(t.total_cents);
    for (const el of listaServicos.querySelectorAll('[data-total-servico]')) {
      const s = orc.servicos[Number(el.dataset.totalServico)];
      if (s) el.textContent = formatarDinheiro(calcularServico(s).total_cents);
    }
    atualizarResumosSecoes(t);
    if (alterado()) {
      if (!['salvando'].includes(estado)) {
        estado = problemaParaSalvar() ? 'incompleto' : 'pendente';
        motivoIncompleto = problemaParaSalvar();
      }
      agendar();
    }
    mostrarEstado();
  }

  const redesenhar = () => {
    desenharAmbientes();
    atualizarValores();
  };

  // ------------------------------------------------------ Seções recolhíveis
  const resumoSecao = {};
  function secao(numero, chave, nomeIcone, textoTitulo, corpo, { aberta = true, extra } = {}) {
    const conteudo = h('div', { class: 'secao-corpo', id: `corpo-${chave}` }, corpo);
    resumoSecao[chave] = h('span', { class: 'secao-resumo' });
    const el = h('section', { class: `cartao secao-editor${aberta ? ' aberta' : ''}`, id: `secao-${chave}` });
    const botao = h(
      'button',
      {
        type: 'button',
        class: 'secao-cabecalho',
        'aria-expanded': String(aberta),
        'aria-controls': conteudo.id,
        onclick: () => abrirSecao(el, !el.classList.contains('aberta')),
      },
      h('span', { class: 'secao-numero' }, String(numero)),
      h('span', { class: 'secao-titulos' }, h('h2', {}, textoTitulo), resumoSecao[chave]),
      icone('baixo', 'icone secao-seta'),
    );
    conteudo.hidden = !aberta;
    el.append(h('div', { class: 'secao-topo' }, botao, extra || null), conteudo);
    el.dataset.icone = nomeIcone;
    return el;
  }

  function abrirSecao(el, abrir = true) {
    el.classList.toggle('aberta', abrir);
    el.querySelector('.secao-cabecalho').setAttribute('aria-expanded', String(abrir));
    el.querySelector('.secao-corpo').hidden = !abrir;
  }

  function atualizarResumosSecoes(t) {
    if (!resumoSecao.cliente) return;
    resumoSecao.cliente.textContent = `${orc.cliente?.nome || ''} · válido até ${formatarData(somarDias(orc.data, orc.validade_dias))}`;
    const nItens = orc.ambientes.reduce((s, a) => s + a.itens.length, 0);
    resumoSecao.ambientes.textContent = orc.ambientes.length
      ? `${plural(orc.ambientes.length, 'ambiente', 'ambientes')} · ${plural(nItens, 'móvel', 'móveis')}`
      : 'Nenhum ambiente ainda';
    const extras = [
      orc.servicos.length ? plural(orc.servicos.length, 'serviço', 'serviços') : '',
      t.desconto_cents ? `desconto de ${formatarDinheiro(t.desconto_cents)}` : '',
      t.acrescimo_cents ? `acréscimo de ${formatarDinheiro(t.acrescimo_cents)}` : '',
    ].filter(Boolean);
    resumoSecao.extras.textContent = extras.join(' · ') || 'Nenhum serviço, desconto ou acréscimo';
    resumoSecao.condicoes.textContent = [orc.pagamento_descricao, orc.prazo_entrega].filter(Boolean).join(' · ') || 'Pagamento e prazo não informados';
  }

  // --------------------------------------------------------------- Ambientes
  function desenharAmbientes() {
    if (!orc.ambientes.length) {
      substituir(
        listaAmbientes,
        h(
          'div',
          { class: 'sem-ambientes' },
          h('span', { class: 'botao-icone' }, icone('inicio')),
          h('h3', {}, 'Seu primeiro ambiente'),
          h('p', {}, 'Adicione um espaço para começar a incluir os móveis.'),
          h('button', { type: 'button', class: 'botao botao-primario', onclick: () => criarAmbiente() }, 'Adicionar ambiente'),
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
      { class: `ambiente${n ? '' : ' ambiente-sem-itens'}`, 'aria-label': ambiente.nome },
      h(
        'div',
        { class: 'ambiente-topo' },
        h('span', { class: 'ambiente-numero' }, String(ai + 1).padStart(2, '0')),
        h('span', { class: 'selo-icone' }, icone('ambiente')),
        h('div', { class: 'ambiente-titulo' }, h('h3', {}, ambiente.nome), h('span', {}, n ? plural(n, 'móvel', 'móveis') : 'Nenhum móvel ainda')),
        h('span', { class: 'ambiente-subtotal' }, formatarDinheiro(subtotalAmbiente(ambiente))),
        h('button', { type: 'button', class: 'botao-icone ambiente-editar', 'aria-label': `Editar ambiente ${ambiente.nome}`, onclick: () => editarAmbiente(ai) }, icone('editar')),
      ),
      ambiente.descricao ? h('div', { class: 'ambiente-detalhe' }, ambiente.descricao) : null,
      h(
        'div',
        { class: 'ambiente-corpo' },
        n ? ambiente.itens.flatMap((item, ii) => [
          ii > 0 ? h('div', { class: 'ambiente-separador', 'aria-hidden': 'true' }) : null,
          linhaItem(item, ai, ii),
        ].filter(Boolean)) : null,
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
            h('span', {}, [
              item.tipo_nome && item.tipo_nome !== item.descricao ? item.tipo_nome : null,
              item.metodo_calculo === 'unidade' ? null : descreverMedida(item),
              `${item.quantidade || 1} ${(item.quantidade || 1) === 1 ? 'unidade' : 'unidades'}`,
            ].filter(Boolean).join(' · ')),
            h('span', { class: 'item-calculo', title: 'Cálculo interno — não aparece para o cliente' }, icone('cadeado', 'icone icone-mini'), descreverCalculo(item)),
            personalizado ? h('span', { class: 'etiqueta item-calculo' }, `preço personalizado · padrão ${formatarDinheiro(item.preco_padrao_cents)}`) : null,
            item.observacoes ? h('span', { class: 'item-obs' }, item.observacoes) : null,
          ),
        ),
      ),
      h(
        'div',
        { class: 'item-acoes' },
        h('button', { type: 'button', class: 'botao-icone item-editar', title: 'Editar móvel', 'aria-label': `Editar ${item.descricao || item.tipo_nome}`, onclick: () => editarItem(ai, ii) }, icone('editar')),
      ),
    );
  }

  async function criarAmbiente(inicial) {
    const dados = inicial || (await formularioAmbiente(null, orc.ambientes, comCalculos));
    if (!dados) return;
    if (dados.acao === 'calculos') {
      botaoCalculos.click();
      return;
    }
    orc.ambientes.push({ nome: dados.nome, descricao: dados.descricao, itens: [] });
    redesenhar();
    // Já abre o formulário do primeiro móvel do ambiente.
    await editarItem(orc.ambientes.length - 1);
    listaAmbientes.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function editarAmbiente(ai) {
    const dados = await formularioAmbiente(orc.ambientes[ai], orc.ambientes, comCalculos);
    if (!dados) return;
    if (dados.acao === 'calculos') return botaoCalculos.click();
    if (dados.acao === 'novo') return criarAmbiente();
    if (dados.acao === 'duplicar') return duplicarAmbiente(ai);
    if (dados.acao === 'acima') return moverAmbiente(ai, -1);
    if (dados.acao === 'abaixo') return moverAmbiente(ai, 1);
    if (dados.acao === 'remover') return removerAmbiente(ai);
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
      if (resultado.acao === 'copiar') {
        copiarItem(ai, ii);
        break;
      }
      if (resultado.acao === 'remover') {
        await removerItem(ai, ii);
        break;
      }
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
  // Condições cadastradas viram botões; "Personalizar" mostra entrada e parcelas.
  const secaoPagamento = h('div', { class: 'formulario editor-pagamento' });
  const pagamentoAtual = () => ({
    entrada_tipo: orc.pagamento_entrada_tipo,
    entrada_valor: orc.pagamento_entrada_valor,
    parcelas: Math.max(1, orc.pagamento_parcelas || 0),
  });
  const mesmaCondicao = (c) =>
    c.entrada_tipo === orc.pagamento_entrada_tipo &&
    (c.entrada_tipo === 'nenhum' || c.entrada_valor === orc.pagamento_entrada_valor) &&
    Math.max(1, c.parcelas || 0) === Math.max(1, orc.pagamento_parcelas || 0);
  let personalizando = false;

  function desenharPagamento() {
    const ativas = condicoes.filter((c) => c.ativo);
    const escolhida = ativas.find((c) => mesmaCondicao(c) && c.descricao === orc.pagamento_descricao);
    if (!escolhida) personalizando = true;
    const textoAutomatico = () => !orc.pagamento_descricao || orc.pagamento_descricao === textoPagamento(pagamentoAtual()) || ativas.some((c) => c.descricao === orc.pagamento_descricao);

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

    // Ao mudar entrada/parcelas, o texto acompanha se ainda era o automático
    // (a conferência é feita antes da mudança).
    const lembrarAntes = () => textoAutomatico();

    let unidade = orc.pagamento_entrada_tipo === 'percentual' ? 'percentual' : 'valor';
    const entrada = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Sem entrada', id: 'entrada-pagamento' });
    entrada.value =
      orc.pagamento_entrada_tipo === 'nenhum' || !orc.pagamento_entrada_valor
        ? ''
        : unidade === 'percentual'
          ? formatarPercentual(orc.pagamento_entrada_valor)
          : dinheiroParaCampo(orc.pagamento_entrada_valor);
    const aplicarEntrada = () => {
      const auto = lembrarAntes();
      const v = unidade === 'percentual' ? lerPercentual(entrada.value) : lerDinheiro(entrada.value);
      entrada.classList.toggle('invalido', entrada.value.trim() !== '' && v === null);
      orc.pagamento_entrada_tipo = v ? unidade : 'nenhum';
      orc.pagamento_entrada_valor = v || 0;
      if (auto) {
        orc.pagamento_descricao = textoPagamento(pagamentoAtual());
        descricao.value = orc.pagamento_descricao;
      }
      atualizarValores();
      marcarBotoes();
    };
    entrada.addEventListener('input', aplicarEntrada);
    const parcelas = seletorParcelas(orc.pagamento_parcelas);
    for (const opcao of parcelas.options) opcao.textContent = opcao.value;
    parcelas.id = 'parcelas-pagamento';
    parcelas.addEventListener('change', () => {
      const auto = lembrarAntes();
      orc.pagamento_parcelas = Number(parcelas.value);
      if (auto) {
        orc.pagamento_descricao = textoPagamento(pagamentoAtual());
        descricao.value = orc.pagamento_descricao;
      }
      atualizarValores();
      marcarBotoes();
    });

    const botoes = ativas.map((c) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          'data-condicao': String(c.id),
          onclick: () => {
            orc.pagamento_descricao = c.descricao;
            orc.pagamento_entrada_tipo = c.entrada_tipo;
            orc.pagamento_entrada_valor = c.entrada_valor;
            orc.pagamento_parcelas = c.parcelas;
            personalizando = false;
            desenharPagamento();
            atualizarValores();
          },
        },
        c.descricao,
      ),
    );
    const botaoPersonalizar = h(
      'button',
      {
        type: 'button',
        class: 'chip',
        onclick: () => {
          personalizando = true;
          ajustes.hidden = false;
          marcarBotoes();
          entrada.focus();
        },
      },
      icone('editar', 'icone icone-mini'),
      'Personalizar',
    );
    const ajustes = h(
      'div',
      { class: 'grade-formulario ajustes-pagamento' },
      h(
        'div',
        { class: 'campo campo-metade' },
        h('label', { for: entrada.id, class: 'editor-entrada-rotulo' }, unidade === 'percentual' ? 'Entrada (%)' : 'Entrada (R$)'),
        h('div', { class: 'editor-entrada-valor' }, entrada, h('span', { class: 'editor-entrada-unidade' }, unidade === 'percentual' ? '%' : 'R$')),
      ),
      campo('Parcelas', parcelas, { classe: 'campo-metade' }),
    );
    function marcarBotoes() {
      const atual = ativas.find((c) => mesmaCondicao(c) && c.descricao === orc.pagamento_descricao);
      for (const b of botoes) {
        const ativo = !personalizando && atual && b.dataset.condicao === String(atual.id);
        b.classList.toggle('ativo', Boolean(ativo));
        b.setAttribute('aria-pressed', String(Boolean(ativo)));
      }
      botaoPersonalizar.classList.toggle('ativo', personalizando);
      botaoPersonalizar.setAttribute('aria-pressed', String(personalizando));
    }
    marcarBotoes();

    substituir(
      secaoPagamento,
      h('div', { class: 'editor-pagamento-titulo' }, h('span', { class: 'botao-icone' }, icone('pagamento')), h('h2', {}, 'Pagamento')),
      ajustes,
      previaPagamento,
      h('details', { class: 'editor-pagamento-opcoes' }, h('summary', {}, orc.pagamento_descricao || 'Personalizar condições'),
        h('div', { class: 'formulario' },
          h('div', { class: 'chips' }, botoes, botaoPersonalizar),
          segmentado([['valor', 'R$'], ['percentual', '%']], unidade, (u) => {
            unidade = u;
            ajustes.querySelector('.editor-entrada-rotulo').textContent = u === 'percentual' ? 'Entrada (%)' : 'Entrada (R$)';
            ajustes.querySelector('.editor-entrada-unidade').textContent = u === 'percentual' ? '%' : 'R$';
            aplicarEntrada();
          }, { rotulo: 'Tipo de entrada' }),
          campo('Texto que aparece para o cliente', descricao),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ Ações
  // Gera o PDF no servidor e devolve como arquivo pronto para baixar/compartilhar.
  async function prepararPdf() {
    if (!(await garantirSalvo())) return null;
    try {
      const blob = await baixarBlob(`/orcamentos/${orc.id}/pdf`);
      return new File([blob], nomeDoPdf(orc), { type: 'application/pdf' });
    } catch (erro) {
      avisoErro(erro);
      return null;
    }
  }

  async function abrirPdf() {
    aviso('Gerando o PDF…');
    const arquivo = await prepararPdf();
    if (!arquivo) return;
    const podeCompartilhar = Boolean(navigator.canShare?.({ files: [arquivo] }));
    await abrirModal('PDF do orçamento', (fechar) =>
      h(
        'div',
        { class: 'envio' },
        h(
          'div',
          { class: 'arquivo-pdf' },
          h('span', { class: 'selo-icone' }, icone('pdf')),
          h('div', {}, h('strong', {}, arquivo.name), h('span', {}, `${Math.max(1, Math.round(arquivo.size / 1024))} KB · pronto`)),
        ),
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
                      await navigator.share({ files: [arquivo], title: `Orçamento nº ${formatarNumero(orc.numero)}` });
                      fechar();
                    } catch (erro) {
                      if (erro.name !== 'AbortError') avisoErro(erro);
                    }
                  },
                },
                icone('compartilhar'),
                'Salvar ou compartilhar',
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: `botao botao-grande botao-bloco${podeCompartilhar ? '' : ' botao-primario'}`,
              onclick: () => {
                baixarArquivo(arquivo);
                aviso('PDF baixado.');
              },
            },
            icone('baixar'),
            'Baixar PDF',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-bloco',
              onclick: () => {
                const url = URL.createObjectURL(arquivo);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              },
            },
            icone('pdf'),
            'Visualizar',
          ),
        ),
        podeCompartilhar
          ? h('small', { class: 'dica' }, 'No celular, use “Salvar ou compartilhar” para guardar em Arquivos, mandar pelo WhatsApp ou por e-mail.')
          : null,
      ),
    );
  }

  // Abre a página que o cliente recebe (a visita da empresa não conta como do cliente).
  async function verComoCliente() {
    const janela = window.open('', '_blank');
    if (!(await garantirSalvo())) {
      janela?.close();
      return;
    }
    try {
      const link = await linkDaProposta(orc.id);
      if (janela) {
        janela.opener = null;
        janela.location.href = link;
      } else {
        location.href = link;
      }
    } catch (erro) {
      janela?.close();
      avisoErro(erro);
    }
  }

  async function duplicar() {
    if (!orc.id) return;
    if (!(await garantirSalvo())) return;
    try {
      const copia = await api.post(`/orcamentos/${orc.id}/duplicar`);
      aviso(`Cópia criada: orçamento nº ${formatarNumero(copia.numero)}. Altere o que precisar.`);
      irPara(`#/orcamentos/${copia.id}`);
    } catch (erro) {
      avisoErro(erro);
    }
  }

  async function excluir() {
    if (!orc.id) return;
    await excluirOrcamento(orc, () => irPara('#/orcamentos'));
  }

  async function trocarCliente() {
    const cliente = await abrirModal('Trocar cliente', (fechar) => seletorCliente((c) => fechar(c)), { largo: true });
    if (!cliente) return;
    orc.cliente_id = cliente.id;
    orc.cliente = cliente;
    atualizarCabecalho();
    atualizarValores();
  }

  /** Coisas para conferir antes de mandar ao cliente. */
  function avisosDeEnvio() {
    const avisos = [];
    const vazios = orc.ambientes.filter((a) => !a.itens.length).map((a) => `“${a.nome}”`);
    if (vazios.length) avisos.push(`${vazios.length === 1 ? 'O ambiente' : 'Os ambientes'} ${vazios.join(', ')} ${vazios.length === 1 ? 'está' : 'estão'} sem móveis.`);
    if (!numeroWhatsApp(orc.cliente?.whatsapp || orc.cliente?.telefone)) avisos.push('O cliente está sem WhatsApp ou telefone cadastrado.');
    const semValor = orc.servicos.filter((s) => !s.valor_cents).map((s) => `“${s.descricao}”`);
    if (semValor.length) avisos.push(`Serviço sem valor: ${semValor.join(', ')}.`);
    if (!calcularTotais(orc).total_cents) avisos.push('O total do orçamento está zerado.');
    if (somarDias(orc.data, orc.validade_dias) < new Date().toISOString().slice(0, 10)) avisos.push('A validade do orçamento já passou — ajuste a data ou os dias de validade.');
    if (!orc.pagamento_descricao) avisos.push('A condição de pagamento não foi informada.');
    return avisos;
  }

  async function enviarAoCliente() {
    if (!(await garantirSalvo())) return;
    const marcar = await abrirEnvio(orc, { avisos: avisosDeEnvio(), prepararPdf });
    if (marcar && orc.status !== 'enviado') await mudarStatus('enviado');
  }

  async function carregarHistorico() {
    if (!orc.id) {
      substituir(historicoEl, h('p', { class: 'suave' }, 'O histórico começa quando o orçamento for salvo.'));
      contadorHistorico.textContent = '';
      return;
    }
    try {
      const eventos = await api.get(`/orcamentos/${orc.id}/historico`);
      contadorHistorico.textContent = String(eventos.length);
      substituir(
        historicoEl,
        eventos.length ? h(
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
                h('span', { class: 'historico-data' }, [dataCompacta(e.data_hora), e.usuario_nome || (e.evento.includes('cliente') ? 'cliente' : 'sistema')].join(' · ')),
              ),
            ),
        ) : h('div', { class: 'historico-vazio' }, icone('historico'), h('strong', {}, 'Sem alterações registradas'), h('p', {}, 'As próximas atividades deste orçamento aparecerão aqui.')),
      );
    } catch (erro) {
      substituir(historicoEl, h('p', { class: 'suave' }, erro.message));
    }
  }

  // --------------------------------------------------------------- Montagem
  const dataEl = h('input', {
    type: 'date',
    value: orc.data,
    required: true,
    onchange: (e) => {
      if (e.target.value) orc.data = e.target.value;
      atualizarValores();
    },
  });
  const validadeDiasEl = entradaNumero(orc.validade_dias, (v) => { orc.validade_dias = v; atualizarValores(); }, { min: 0, max: 3650, id: 'validade-dias' });

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

  // Mostrar/ocultar os cálculos internos (lembrado neste aparelho).
  let comCalculos = false;
  try {
    comCalculos = localStorage.getItem('esquadro.calculos') === '1';
  } catch {
    comCalculos = false;
  }
  const botaoCalculos = h('button', {
    type: 'button',
    class: 'alternar',
    role: 'switch',
    'aria-checked': String(comCalculos),
    onclick: () => {
      comCalculos = !comCalculos;
      botaoCalculos.setAttribute('aria-checked', String(comCalculos));
      secaoAmbientes.classList.toggle('com-calculos', comCalculos);
      try {
        localStorage.setItem('esquadro.calculos', comCalculos ? '1' : '0');
      } catch {
        // sem armazenamento: vale só nesta tela
      }
    },
  }, h('span', { class: 'alternar-trilho' }), icone('cadeado', 'icone icone-mini'), h('span', { class: 'so-computador' }, 'Mostrar cálculos'), h('span', { class: 'so-celular' }, 'Cálculos'));

  substituir(campoNomeAcrescimo, campo('Nome do acréscimo', texto('acrescimo_descricao', { placeholder: 'Ex.: Taxa de projeto', maxlength: '100' })));

  const celular = window.matchMedia('(max-width: 767px)').matches;
  const fechadaNoCelular = Boolean(id) && celular;

  const secaoCliente = secao(
    1,
    'cliente',
    'clientes',
    'Cliente e datas',
    [
      blocoCliente,
      h(
        'div',
        { class: 'grade-formulario' },
        campo('Data', dataEl, { classe: 'campo-metade' }),
        h(
          'div',
          { class: 'campo campo-metade' },
          h('label', { for: 'validade-dias' }, 'Validade (dias)'),
          h('div', { class: 'entrada-com-unidade editor-validade-input' }, validadeDiasEl, h('span', {}, 'dias')),
        ),
      ),
      validadeTexto,
    ],
    { aberta: true },
  );

  const secaoAmbientes = h(
    'section',
    { class: `secao-ambientes${comCalculos ? ' com-calculos' : ''}`, id: 'secao-ambientes' },
    h(
      'div',
      { class: 'secao-topo secao-topo-solta' },
      h('div', { class: 'secao-cabecalho' }, h('span', { class: 'secao-numero' }, '2'), h('span', { class: 'secao-titulos' }, h('h2', {}, 'Ambientes'), h('span', { class: 'secao-resumo' }))),
      h('button', { type: 'button', class: 'botao botao-secundario editor-adicionar-ambiente-topo', onclick: () => criarAmbiente() }, icone('mais'), 'Ambiente'),
    ),
    listaAmbientes,
    h('button', { type: 'button', class: 'botao botao-secundario botao-grande botao-bloco editor-adicionar-ambiente', onclick: () => criarAmbiente() }, icone('mais'), 'Ambiente'),
  );
  resumoSecao.ambientes = secaoAmbientes.querySelector('.secao-resumo');

  const secaoExtras = secao(
    3,
    'extras',
    'servico',
    'Serviços, desconto e acréscimo',
    [
      h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Serviços adicionais'), h('div', { class: 'chips' }, SERVICOS_RAPIDOS.map((s) => h('button', { type: 'button', class: 'chip', onclick: () => adicionarServico(s) }, `+ ${s}`)))),
      listaServicos,
      h(
        'div',
        { class: 'grade-formulario ajustes' },
        h('div', { class: 'campo-metade' }, blocoAjuste('desconto', 'Desconto', descontoCalculado)),
        h('div', { class: 'campo-metade formulario' }, blocoAjuste('acrescimo', 'Acréscimo', acrescimoCalculado), campoNomeAcrescimo),
      ),
    ],
    { aberta: !fechadaNoCelular && (!id || Boolean(orc.servicos.length || orc.desconto_tipo !== 'nenhum' || orc.acrescimo_tipo !== 'nenhum')) },
  );

  const secaoCondicoes = secao(
    4,
    'condicoes',
    'pagamento',
    'Pagamento, prazo e observações',
    h(
      'div',
      { class: 'formulario' },
      secaoPagamento,
      h(
        'div',
        { class: 'grade-formulario' },
        campo('Prazo de entrega', texto('prazo_entrega', { placeholder: 'Ex.: 30 dias úteis', maxlength: '200' }), { classe: 'campo-inteiro' }),
        campo('Observações para o cliente', texto('observacoes', { rows: '2', maxlength: '5000' }), { classe: 'campo-inteiro' }),
        h('details', { class: 'editor-notas-internas campo-inteiro' }, h('summary', {}, 'Anotações internas', icone('baixo')), campo('Só você vê', texto('observacoes_internas', { rows: '3', maxlength: '5000' }))),
      ),
    ),
    { aberta: !fechadaNoCelular },
  );

  // Índice das seções (atalho para rolar até cada uma)
  const indice = h(
    'nav',
    { class: 'indice-secoes editor-indice', 'aria-label': 'Partes do orçamento' },
    [
      [secaoCliente, '1', 'Cliente'],
      [secaoAmbientes, '2', 'Ambientes'],
      [secaoExtras, '3', 'Extras'],
      [secaoCondicoes, '4', 'Condições'],
    ].map(([el, n, rotulo]) =>
      h(
        'button',
        {
          type: 'button',
          'data-secao': el.id.replace('secao-', ''),
          class: el === secaoAmbientes ? 'ativo' : '',
          'aria-pressed': String(el === secaoAmbientes),
          onclick: () => {
            mostrarAba('orcamento');
            if (el.classList.contains('secao-editor')) abrirSecao(el, true);
            pagina.dataset.secaoAtiva = el.id.replace('secao-', '');
            for (const botao of indice.querySelectorAll('button')) {
              const ativo = botao.dataset.secao === pagina.dataset.secaoAtiva;
              botao.classList.toggle('ativo', ativo);
              botao.setAttribute('aria-pressed', String(ativo));
            }
            if (window.matchMedia('(max-width: 767px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
            else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
        h('span', {}, n),
        rotulo,
      ),
    ),
  );

  // Abas: o orçamento e o histórico
  const painelOrcamento = h('div', { class: 'editor-principal' }, secaoCliente, secaoAmbientes, secaoExtras, secaoCondicoes);
  const painelHistorico = h(
    'div',
    { class: 'editor-principal editor-painel-historico', hidden: true },
    h('section', { class: 'cartao' }, h('div', { class: 'cartao-titulo' }, h('h2', {}, icone('historico'), 'Histórico de alterações')), historicoEl),
  );
  const abaOrcamento = h('button', { type: 'button', role: 'tab', class: 'ativo', 'aria-selected': 'true', onclick: () => mostrarAba('orcamento') }, 'Orçamento');
  const abaHistorico = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => mostrarAba('historico') }, 'Histórico', contadorHistorico);
  function mostrarAba(qual) {
    const orcamento = qual === 'orcamento';
    painelOrcamento.hidden = !orcamento;
    painelHistorico.hidden = orcamento;
    indice.setAttribute('aria-hidden', String(!orcamento));
    indice.inert = !orcamento;
    abaOrcamento.classList.toggle('ativo', orcamento);
    abaHistorico.classList.toggle('ativo', !orcamento);
    abaOrcamento.setAttribute('aria-selected', String(orcamento));
    abaHistorico.setAttribute('aria-selected', String(!orcamento));
    pagina.classList.toggle('editor-mostrando-historico', !orcamento);
    if (!orcamento) carregarHistorico();
  }

  atualizarCabecalho();
  desenharServicos();
  desenharPagamento();
  redesenhar();
  carregarHistorico();
  mostrarEstado();

  const pagina = h(
    'div',
    { class: `pagina pagina-editor${orc.numero ? '' : ' editor-novo'}`, 'data-secao-ativa': 'ambientes' },
    h(
      'div',
      { class: 'cabecalho-editor' },
      h('div', { class: 'editor-caminho' },
        h('a', { href: '#/orcamentos', class: 'voltar', 'aria-label': 'Voltar para orçamentos' }, icone('voltar')),
        h('div', { class: 'editor-caminho-texto' }, h('span', {}, 'Orçamentos'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Editar orçamento')),
        h('span', { class: 'editor-auto-save editor-auto-save-desktop' }, icone('check', 'icone icone-mini'), estadoTopoDesktop),
        h('button', { type: 'button', class: 'botao-icone editor-historico-topo', 'aria-label': 'Abrir histórico', disabled: !orc.id, onclick: () => mostrarAba('historico') }, icone('historico')),
      ),
      h('div', { class: 'editor-titulo-fila' },
        h('div', { class: 'editor-titulo-bloco' },
          h('span', { class: 'page-eyebrow editor-eyebrow' }, orc.numero ? 'EDITOR DE ORÇAMENTO' : 'NOVO ORÇAMENTO · 2 DE 2'),
          h('div', { class: 'editor-titulo-linha' }, tituloEl, seloStatusTopo),
          h('span', { class: 'editor-auto-save editor-auto-save-mobile' }, icone('check', 'icone icone-mini'), estadoTopoMobile),
        ),
      ),
    ),
    etapasEl,
    avisoConflito,
    indice,
    h('div', { class: 'abas-editor', role: 'tablist', 'aria-label': 'Orçamento e histórico' }, abaOrcamento, abaHistorico),
    h(
      'div',
      { class: 'editor' },
      h('div', {}, painelOrcamento, painelHistorico),
      h(
        'aside',
        { class: 'editor-lateral' },
        h('section', { class: 'cartao editor-resumo-card' },
          h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Resumo')),
          resumoClienteLateral,
          resumo,
          resumoPagamentoLateral,
          h('button', { type: 'button', class: 'botao botao-primario editor-ver-proposta-desktop', disabled: !orc.id, onclick: verComoCliente }, 'Ver proposta'),
          estadoSalvo,
        ),
        h('section', { class: 'cartao editor-acoes-card' }, acoesLateral),
      ),
    ),

    h(
      'div',
      { class: 'barra-salvar' },
      h('div', { class: 'barra-total' }, h('span', {}, 'Total do orçamento'), totalBarra, estadoBarra),
      h(
        'div',
        { class: 'cabecalho-acoes' },
        menuBarra,
        h('button', { type: 'button', class: 'botao botao-primario editor-ver-proposta-mobile', disabled: !orc.id, onclick: verComoCliente }, 'Ver proposta'),
        h('button', { type: 'button', class: 'botao botao-whatsapp botao-grande', onclick: enviarAoCliente }, icone('whatsapp'), 'Enviar'),
      ),
    ),
  );
  document.addEventListener('keydown', atalhoTeclado);
  // Some junto com a página: remove o atalho quando o editor sai da tela.
  const observador = new MutationObserver(() => {
    if (!pagina.isConnected && pagina.dataset.montado) {
      document.removeEventListener('keydown', atalhoTeclado);
      clearTimeout(timer);
      observador.disconnect();
    }
    if (pagina.isConnected) pagina.dataset.montado = '1';
  });
  observador.observe(document.getElementById('conteudo') || document.body, { childList: true });
  return pagina;
}

/** Mesmo nome que o servidor usa: Orcamento-00001-joao-da-silva.pdf */
function nomeDoPdf(orc) {
  const cliente = (orc.cliente?.nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `Orcamento-${formatarNumero(orc.numero)}${cliente ? `-${cliente}` : ''}.pdf`;
}

function baixarArquivo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = h('a', { href: url, download: arquivo.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function formatarDataHora(texto) {
  // O servidor envia a data em ISO (UTC).
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return texto;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------- Formulário do ambiente

// Sugestões de ambiente da empresa (ficam salvas no servidor).
const sugestoesAmbiente = () => cache.empresa?.ambientes_sugeridos ?? AMBIENTES_SUGERIDOS;
const chaveAmbiente = (nome) =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
let filaSugestoes = Promise.resolve();

/** Grava a lista inteira; os pedidos saem em ordem para o último sempre valer. */
function salvarSugestoesAmbiente(lista) {
  filaSugestoes = filaSugestoes
    .catch(() => {})
    .then(async () => {
      cache.empresa = await api.put('/empresa/ambientes-sugeridos', { ambientes: lista });
    });
  return filaSugestoes;
}

function formularioAmbiente(inicial, ambientes, comCalculos = false) {
  return abrirModal(inicial ? 'Editar ambiente' : 'Novo ambiente', (fechar) => {
    const nome = h('input', { type: 'text', required: true, maxlength: '100', value: inicial?.nome || '', placeholder: 'Ex.: Quarto do casal', autocomplete: 'off' });
    const descricao = h('textarea', {
      rows: '3',
      maxlength: '1000',
      value: inicial?.descricao || '',
      placeholder: 'Ex.: MDF branco TX, puxadores perfil em alumínio',
    });
    const usados = new Set(ambientes.map((a) => a.nome));
    let lista = [...sugestoesAmbiente()];
    let editando = false;
    const naLista = (valor) => lista.some((s) => chaveAmbiente(s) === chaveAmbiente(valor));

    const alterarLista = async (novaLista, mensagem) => {
      const anterior = lista;
      lista = novaLista;
      desenharSugestoes();
      try {
        await salvarSugestoesAmbiente(lista);
        if (mensagem) aviso(mensagem);
      } catch (erro) {
        lista = anterior;
        desenharSugestoes();
        avisoErro(erro);
      }
    };

    const nova = h('input', { type: 'text', maxlength: '100', placeholder: 'Nome da nova sugestão', autocomplete: 'off', 'aria-label': 'Nova sugestão de ambiente' });
    const adicionarNova = () => {
      const valor = nova.value.trim();
      if (!valor) return nova.focus();
      nova.value = '';
      nova.focus();
      if (naLista(valor)) return aviso(`“${valor}” já está nas sugestões.`);
      alterarLista([...lista, valor], `“${valor}” salvo nas sugestões.`);
    };
    // Enter aqui adiciona a sugestão em vez de criar o ambiente.
    nova.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      adicionarNova();
    });
    const areaNova = h(
      'div',
      { class: 'sugestao-nova' },
      nova,
      h('button', { type: 'button', class: 'botao', onclick: adicionarNova }, icone('mais'), 'Adicionar'),
    );

    const botaoEditar = h('button', { type: 'button', class: 'botao botao-pequeno', 'aria-pressed': 'false' });
    botaoEditar.addEventListener('click', () => {
      editando = !editando;
      desenharSugestoes();
      if (editando) nova.focus();
    });
    const restaurar = h(
      'button',
      {
        type: 'button',
        class: 'botao botao-pequeno',
        onclick: async () => {
          if (!(await confirmar('Voltar para a lista de sugestões padrão? As que você adicionou serão removidas.', { sim: 'Restaurar' }))) return;
          alterarLista([...AMBIENTES_SUGERIDOS], 'Sugestões padrão restauradas.');
        },
      },
      'Restaurar padrão',
    );

    const sugestoes = h('div', { class: 'chips' });
    const guardar = h('input', { type: 'checkbox' });
    const opcaoGuardar = h('label', { class: 'caixa-marcar' }, guardar, h('span'));
    const atualizarGuardar = () => {
      const valor = nome.value.trim();
      opcaoGuardar.hidden = !valor || naLista(valor);
      opcaoGuardar.lastChild.textContent = ` Guardar “${valor}” nas sugestões`;
    };
    nome.addEventListener('input', atualizarGuardar);

    function desenharSugestoes() {
      botaoEditar.textContent = editando ? 'Concluir' : 'Editar sugestões';
      botaoEditar.setAttribute('aria-pressed', String(editando));
      areaNova.hidden = !editando;
      restaurar.hidden = !editando;
      const visiveis = editando ? lista : lista.filter((s) => !usados.has(s) || s === inicial?.nome);
      substituir(
        sugestoes,
        visiveis.length
          ? visiveis.map((s) =>
              editando
                ? h(
                    'span',
                    { class: 'chip chip-editavel' },
                    s,
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'chip-remover',
                        title: 'Remover das sugestões',
                        'aria-label': `Remover ${s} das sugestões`,
                        onclick: () => alterarLista(lista.filter((x) => x !== s)),
                      },
                      '×',
                    ),
                  )
                : h(
                    'button',
                    {
                      type: 'button',
                      class: 'chip',
                      onclick: () => {
                        nome.value = s;
                        atualizarGuardar();
                        nome.focus();
                      },
                    },
                    s,
                  ),
            )
          : h('small', { class: 'dica' }, editando ? 'Nenhuma sugestão salva. Adicione a primeira abaixo.' : 'Nenhuma sugestão disponível.'),
      );
      atualizarGuardar();
    }
    desenharSugestoes();

    setTimeout(() => nome.focus());
    return h(
      'form',
      {
        class: 'formulario',
        onsubmit: (e) => {
          e.preventDefault();
          const valor = nome.value.trim();
          if (!valor) return aviso('Dê um nome ao ambiente.', 'erro');
          if (guardar.checked && !naLista(valor)) {
            salvarSugestoesAmbiente([...lista, valor]).then(
              () => aviso(`“${valor}” salvo nas sugestões.`),
              avisoErro,
            );
          }
          fechar({ nome: valor, descricao: descricao.value.trim() });
        },
      },
      campo('Nome do ambiente', nome),
      opcaoGuardar,
      h(
        'div',
        { class: 'campo' },
        h('div', { class: 'sugestoes-topo' }, h('span', { class: 'rotulo' }, 'Sugestões'), h('div', { class: 'sugestoes-acoes' }, restaurar, botaoEditar)),
        sugestoes,
        areaNova,
      ),
      campo('Detalhes do ambiente (opcional, aparece no PDF)', descricao, { dica: 'Materiais, cores, acabamentos…' }),
      h(
        'details',
        { class: 'mais-opcoes editor-acoes-secundarias' },
        h('summary', {}, 'Mais ações'),
        h('div', { class: 'editor-acoes-secundarias-lista' },
          h('button', { type: 'button', class: 'link-botao', onclick: () => fechar({ acao: 'calculos' }) }, `${comCalculos ? 'Ocultar' : 'Mostrar'} cálculos internos`),
          h('button', { type: 'button', class: 'link-botao', onclick: () => fechar({ acao: 'novo' }) }, 'Adicionar outro ambiente'),
          inicial ? h('button', { type: 'button', class: 'link-botao', onclick: () => fechar({ acao: 'duplicar' }) }, 'Duplicar ambiente') : null,
          inicial ? h('button', { type: 'button', class: 'link-botao', disabled: ambientes.indexOf(inicial) === 0, onclick: () => fechar({ acao: 'acima' }) }, 'Mover para cima') : null,
          inicial ? h('button', { type: 'button', class: 'link-botao', disabled: ambientes.indexOf(inicial) === ambientes.length - 1, onclick: () => fechar({ acao: 'abaixo' }) }, 'Mover para baixo') : null,
          inicial ? h('button', { type: 'button', class: 'link-botao perigo', onclick: () => fechar({ acao: 'remover' }) }, 'Remover ambiente') : null,
        ),
      ),
      h(
        'div',
        { class: 'acoes-modal' },
        h('button', { type: 'button', class: 'botao', onclick: () => fechar(undefined) }, 'Cancelar'),
        h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, inicial ? 'Salvar ambiente' : 'Criar ambiente'),
      ),
    );
  }, { contexto: 'AMBIENTES', subtitulo: 'Organize os móveis por espaço.', classe: 'modal-ambiente' });
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
      const campoLargura = campo('Medida', h('div', { class: 'editor-campo-unidade' }, largura, h('span', {}, 'm')));
      const campoAltura = campo('Altura', h('div', { class: 'editor-campo-unidade' }, altura, h('span', {}, 'm')));
      const rotuloPreco = h('label', { for: 'preco-item' }, '');
      preco.id = 'preco-item';
      const dicaPreco = h('small', { class: 'dica' });
      const sufixoPreco = h('span', { class: 'editor-preco-sufixo' });
      const alertaMedida = h('small', { class: 'dica alerta' });
      const resultado = h('div', { class: 'resultado-item', 'aria-live': 'polite' });
      const metodo = segmentado(
        Object.entries(METODOS).map(([v, m]) => [v, v === 'quadrado' ? 'm²' : v === 'unidade' ? 'Unidade' : m.nome]),
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
        campoLargura.querySelector('label').textContent = m === 'quadrado' ? 'Largura' : 'Medida';
        rotuloPreco.textContent = m === 'linear' ? 'Preço por metro' : m === 'quadrado' ? 'Preço por m²' : 'Preço por unidade';
        sufixoPreco.textContent = METODOS[m].sufixo;
        const temPadrao = item.preco_padrao_cents !== null && item.preco_padrao_cents !== undefined;
        substituir(
          dicaPreco,
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
          'Este preço vale somente neste orçamento.',
        );
        const grande = [item.largura_mm, m === 'quadrado' ? item.altura_mm : 0].some((v) => v > 30000);
        alertaMedida.textContent = grande ? 'Confira: a medida deve ser informada em metros (ex.: 3,20).' : '';

        const completo = medidasCompletas(item);
        const r = calcularItem(item);
        substituir(
          resultado,
          h('span', {}, 'Valor do móvel'),
          h('strong', {}, completo ? formatarDinheiro(r.valor_total_cents) : '—'),
          completo ? h('small', {}, `${descreverCalculo(item)} · ${plural(item.quantidade, 'unidade', 'unidades')}`) : h('small', {}, 'Informe a medida para calcular.'),
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
        novo ? h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Tipo de móvel'), gradeTipos) : null,
        campo('Descrição para o cliente', descricao),
        h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Como calcular'), metodo),
        h('div', { class: 'editor-medidas' }, campoLargura, campoAltura, campo('Quantidade', h('div', { class: 'editor-campo-unidade' }, quantidade, h('span', {}, 'un.')))),
        alertaMedida,
        h(
          'div',
          { class: 'campo' },
          rotuloPreco, h('div', { class: 'editor-campo-unidade editor-campo-dinheiro' }, h('span', {}, 'R$'), preco, sufixoPreco), dicaPreco,
        ),
        h('details', { class: 'mais-opcoes editor-observacoes-item', open: Boolean(item.observacoes) }, h('summary', {}, 'Observações internas', icone('baixo')), campo('Não aparece para o cliente', observacao),
          !novo ? h('details', { class: 'mais-opcoes editor-acoes-secundarias' }, h('summary', {}, 'Ações do móvel'),
            h('div', { class: 'editor-acoes-secundarias-lista' }, h('button', { type: 'button', class: 'link-botao', onclick: () => fechar({ acao: 'copiar' }) }, 'Copiar móvel'), h('button', { type: 'button', class: 'link-botao perigo', onclick: () => fechar({ acao: 'remover' }) }, 'Remover móvel')), gradeTipos,
          ) : null,
        ),
        resultado,
        h(
          'div',
          { class: 'acoes-modal' },
          novo ? h('button', { type: 'button', class: 'botao', onclick: () => confirmarItem(true) }, 'Salvar e adicionar outro') : null,
          h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, novo ? 'Adicionar ao ambiente' : 'Salvar móvel'),
        ),
      );
    },
    { largo: true, contexto: `${String(ambienteIndice + 1).padStart(2, '0')} · ${nomeAmbiente || 'AMBIENTE'}`, classe: 'modal-item' },
  );
}

function medidasCompletas(item) {
  if (item.metodo_calculo === 'unidade') return true;
  if (!item.largura_mm) return false;
  return item.metodo_calculo !== 'quadrado' || Boolean(item.altura_mm);
}

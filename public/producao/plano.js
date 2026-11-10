// Página de um plano: lista de peças (entrada rápida), cálculo com até três
// soluções, o que separar para o corte e o desenho de cada chapa.
import { formatarDinheiro, formatarNumero } from '/shared/calc.js';
import {
  AJUSTES_PADRAO,
  LADOS_FITA,
  LIMITES_CORTE,
  MODOS_CORTE,
  SOLUCOES,
  assinaturaPlano,
  detalharSolucao,
  expandirPecas,
  formatarArea,
  formatarMetros,
  formatarMm,
  ladosComFita,
  lerLinhasPecas,
  resumirSolucao,
} from '/shared/corte.js';
import { api, baixarBlob } from '/js/api.js';
import { h, icone, substituir, aviso, avisoErro, abrirModal, campo, confirmar, segmentado, menuSuspenso, haQuanto } from '/js/ui.js';
import { sessao, ehEscritorio, seloSituacao, plural, contagem, nomeChapa, irPara, aoSairDaPagina, baixarArquivo, pedirNome } from './nucleo.js';
import { abrirVisualizador, coresDosMoveis, corDaPeca, desenharFolha } from './desenho.js';

// ------------------------------------------------------------------ Cálculo

export function calcularNoWorker(dados) {
  const naPagina = () => import('/shared/corte.js').then((m) => m.otimizarPlano(dados));
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker('/js/corte-worker.js', { type: 'module' });
    } catch {
      naPagina().then(resolve, reject);
      return;
    }
    const prazo = setTimeout(() => {
      worker.terminate();
      reject(new Error('O cálculo demorou demais. Tente com menos peças.'));
    }, 30_000);
    worker.addEventListener('message', (e) => {
      clearTimeout(prazo);
      worker.terminate();
      if (e.data?.ok) resolve(e.data.resultado);
      else reject(new Error(e.data?.erro || 'Não foi possível calcular o plano.'));
    });
    worker.addEventListener('error', () => {
      clearTimeout(prazo);
      worker.terminate();
      naPagina().then(resolve, reject); // Navegador sem Worker de módulo.
    });
    worker.postMessage(dados);
  });
}

// -------------------------------------------------------------- Uma peça

function formularioPeca(peca, { chapas, fitas, grupos, novo = false, soPadrao = false }, fechar) {
  const dados = { ...peca };
  const numero = (valor, rotulo, extra = {}) => h('input', { type: 'text', inputmode: 'numeric', value: valor ? String(valor) : '', 'aria-label': rotulo, ...extra });
  const listaId = `grupos-${Math.random().toString(36).slice(2)}`;
  const grupo = h('input', { type: 'text', value: dados.grupo || '', maxlength: '120', list: listaId, placeholder: 'Ex.: Cozinha · aéreo' });
  const descricao = h('input', { type: 'text', value: dados.descricao || '', maxlength: '120', placeholder: 'Ex.: Lateral' });
  const comprimento = numero(dados.comprimento_mm, 'Comprimento', { autofocus: novo });
  const largura = numero(dados.largura_mm, 'Largura');
  const quantidade = numero(dados.quantidade || 1, 'Quantidade');
  const chapa = h(
    'select',
    {},
    h('option', { value: '' }, 'Escolha a chapa'),
    chapas.filter((c) => c.ativo || c.id === dados.chapa_id).map((c) => h('option', { value: String(c.id), selected: c.id === dados.chapa_id }, `${nomeChapa(c)}${c.veio ? ' · com veio' : ''}`)),
  );
  const veio = h('input', { type: 'checkbox', checked: Boolean(dados.veio) });
  const fita = h(
    'select',
    {},
    h('option', { value: '' }, 'Sem fita'),
    fitas.filter((f) => f.ativo || f.id === dados.fita_id).map((f) => h('option', { value: String(f.id), selected: f.id === dados.fita_id }, f.nome)),
  );
  const lados = LADOS_FITA.map(([chave, nome]) => [chave, h('input', { type: 'checkbox', checked: Boolean(dados[chave]), 'aria-label': `Fita no lado ${nome}` }), nome]);
  const caixaLados = h('div', { class: 'p-lados' }, lados.map(([, el, nome]) => h('label', { class: 'caixa-marcar' }, el, nome)));
  const atualizarLados = () => {
    caixaLados.hidden = !fita.value;
  };
  fita.addEventListener('change', atualizarLados);
  atualizarLados();
  const ler = (el, min, max, nome) => {
    const n = Number(el.value.trim());
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome}: use um número inteiro de ${min} a ${max}.`);
    return n;
  };
  return h(
    'form',
    {
      class: 'formulario',
      onsubmit: (e) => {
        e.preventDefault();
        try {
          const lida = { ...dados, grupo: grupo.value.trim(), chapa_id: chapa.value ? Number(chapa.value) : null, veio: veio.checked ? 1 : 0, fita_id: fita.value ? Number(fita.value) : null };
          for (const [chave, el] of lados) lida[chave] = lida.fita_id && el.checked ? 1 : 0;
          if (!soPadrao) {
            Object.assign(lida, {
              descricao: descricao.value.trim(),
              comprimento_mm: ler(comprimento, 1, LIMITES_CORTE.medidaMax, 'Comprimento'),
              largura_mm: ler(largura, 1, LIMITES_CORTE.medidaMax, 'Largura'),
              quantidade: ler(quantidade, 1, LIMITES_CORTE.quantidade, 'Quantidade'),
            });
          }
          fechar({ acao: 'salvar', peca: lida });
        } catch (erro) {
          aviso(erro.message, 'erro');
        }
      },
    },
    h('datalist', { id: listaId }, grupos.map((g) => h('option', { value: g }))),
    soPadrao ? campo('Móvel', grupo) : h('div', { class: 'grade-2' }, campo('Móvel', grupo), campo('Peça', descricao)),
    soPadrao ? null : h('div', { class: 'grade-3' }, campo('Comp. (mm)', comprimento, { dica: 'No veio' }), campo('Larg. (mm)', largura), campo('Qtd.', quantidade)),
    campo('Chapa', chapa),
    h('label', { class: 'caixa-marcar' }, veio, 'Seguir o veio (não girar a peça)'),
    campo('Fita de borda', fita),
    caixaLados,
    h('small', { class: 'dica' }, 'C1 e C2 são os lados do comprimento; L1 e L2, os da largura. A peça é cortada na medida final.'),
    h(
      'div',
      { class: 'acoes-modal' },
      novo || soPadrao ? null : h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: () => fechar({ acao: 'excluir' }) }, 'Excluir'),
      novo || soPadrao ? null : h('button', { type: 'button', class: 'botao', onclick: () => fechar({ acao: 'duplicar' }) }, 'Duplicar'),
      h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, soPadrao ? 'Usar nas próximas' : 'Salvar peça'),
    ),
  );
}

// ------------------------------------------------------------- A página

export async function paginaPlano(planoId, params) {
  let plano = await api.get(`/producao/planos/${planoId}`);
  const { chapas, fitas } = plano;
  let pecas = plano.pecas.map((p) => ({ ...p }));
  let ajustes = { ...AJUSTES_PADRAO, ...plano.ajustes };
  let nome = plano.nome;
  let usarRetalhos = Boolean(plano.usar_retalhos);
  let resultado = plano.resultado;
  // Sem peças, abre sempre na lista (não há plano para mostrar).
  let aba = pecas.length && (params.get('aba') === 'plano' || plano.resultado) ? 'plano' : 'pecas';
  let sujo = false;
  let salvando = null;
  let temporizador = null;
  let calculando = false;
  let calculoAutomaticoFeito = false;
  let avisouCorte = false;
  const concluido = Boolean(plano.concluido_em);

  const chapasPorId = new Map(chapas.map((c) => [c.id, c]));
  const fitasPorId = new Map(fitas.map((f) => [f.id, f]));
  const ultima = pecas[pecas.length - 1];
  const ativas = chapas.filter((c) => c.ativo);
  const padrao = {
    grupo: ultima?.grupo || plano.trabalho?.ambientes?.[0]?.itens?.[0]?.nome || '',
    chapa_id: ultima?.chapa_id ?? (ativas.length === 1 ? ativas[0].id : null),
    veio: ultima?.veio || 0,
    fita_id: ultima?.fita_id ?? null,
    fita_c1: ultima?.fita_c1 || 0,
    fita_c2: ultima?.fita_c2 || 0,
    fita_l1: ultima?.fita_l1 || 0,
    fita_l2: ultima?.fita_l2 || 0,
  };
  const grupos = () => {
    const doTrabalho = (plano.trabalho?.ambientes || []).flatMap((a) => a.itens.map((i) => `${i.nome}`));
    return [...new Set([...pecas.map((p) => p.grupo).filter(Boolean), ...doTrabalho])];
  };
  const vista = () => ({ pecas, chapas, fitas, ajustes, retalhos: plano.retalhos, config: plano.config });
  const resultadoValido = () => (resultado && pecas.length && resultado.assinatura === assinaturaPlano(pecas, chapas, ajustes) ? resultado : null);

  // ---------------------------------------------------------- Salvar
  const estado = h('span', { class: 'pequeno suave', role: 'status', 'aria-live': 'polite' });
  const mostrarEstado = (texto) => {
    estado.textContent = texto;
  };
  const corpo = () => ({ nome, ...ajustes, usar_retalhos: usarRetalhos, versao: plano.versao, pecas });

  async function salvarAgora(extra = {}) {
    clearTimeout(temporizador);
    if (salvando) await salvando.catch(() => {});
    if (!sujo && !('resultado' in extra)) return true;
    sujo = false;
    mostrarEstado('Salvando…');
    salvando = api.put(`/producao/planos/${planoId}`, { ...corpo(), ...extra });
    try {
      const salvo = await salvando;
      plano = { ...plano, versao: salvo.versao, situacao: salvo.situacao, calculado_em: salvo.calculado_em, iniciado_em: salvo.iniciado_em, progresso: salvo.progresso, retalhos: salvo.retalhos, custo: salvo.custo };
      if ('resultado' in extra) resultado = salvo.resultado;
      mostrarEstado(sujo ? 'Alterações não salvas' : 'Salvo');
      atualizarTopo();
      return true;
    } catch (erro) {
      sujo = true;
      mostrarEstado('Não foi possível salvar');
      avisoErro(erro);
      return false;
    } finally {
      salvando = null;
    }
  }

  const alterou = async () => {
    if (plano.iniciado_em && !avisouCorte && resultadoValido()) {
      avisouCorte = true;
      // Mudar a lista depois de começar invalida o passo a passo.
      aviso('O corte deste plano já começou. Se a mudança alterar medidas, o passo a passo recomeça.', 'erro');
    }
    sujo = true;
    mostrarEstado('Alterações não salvas');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => salvarAgora(), 900);
    calculoAutomaticoFeito = false;
    desenhar();
  };

  const verificarSaida = async () => {
    if (!sujo && !salvando) return true;
    if (await salvarAgora()) return true;
    return confirmar('Não foi possível salvar as últimas alterações. Sair mesmo assim?', { sim: 'Sair sem salvar', perigo: true });
  };
  verificarSaida.sincrono = () => !sujo && !salvando;
  aoSairDaPagina(verificarSaida);

  // ---------------------------------------------------------- Peças
  const editarPeca = async (indice) => {
    const resposta = await abrirModal(`Linha #${indice + 1}`, (fechar) => formularioPeca(pecas[indice], { chapas, fitas, grupos: grupos() }, fechar), { contexto: 'Peça' });
    if (!resposta) return;
    if (resposta.acao === 'excluir') pecas.splice(indice, 1);
    else if (resposta.acao === 'duplicar') pecas.splice(indice + 1, 0, { ...pecas[indice] });
    else pecas[indice] = resposta.peca;
    alterou();
  };

  const entradaC = h('input', { type: 'text', inputmode: 'numeric', enterkeyhint: 'next', placeholder: 'Comp.', 'aria-label': 'Comprimento em mm' });
  const entradaL = h('input', { type: 'text', inputmode: 'numeric', enterkeyhint: 'next', placeholder: 'Larg.', 'aria-label': 'Largura em mm' });
  const entradaQ = h('input', { type: 'text', inputmode: 'numeric', enterkeyhint: 'next', value: '1', 'aria-label': 'Quantidade' });
  const entradaD = h('input', { type: 'text', maxlength: '120', enterkeyhint: 'done', placeholder: 'Nome da peça (ex.: Lateral)', 'aria-label': 'Nome da peça' });
  const textoPadrao = h('span', {});
  const botaoPadrao = h('button', { type: 'button', class: 'p-padrao' }, icone('regua'), h('span', {}, h('small', {}, 'Próximas peças'), textoPadrao), icone('editar', 'icone icone-mini'));
  const desenharPadrao = () => {
    const chapa = chapasPorId.get(padrao.chapa_id);
    const lados = ladosComFita(padrao);
    textoPadrao.textContent = [padrao.grupo || 'Sem móvel', chapa ? nomeChapa(chapa) : 'escolha a chapa', lados ? `fita ${lados}` : 'sem fita', padrao.veio && chapa?.veio ? 'segue o veio' : ''].filter(Boolean).join(' · ');
    botaoPadrao.classList.toggle('sem-chapa', !chapa);
  };
  const editarPadrao = async () => {
    const resposta = await abrirModal('Próximas peças', (fechar) => formularioPeca(padrao, { chapas, fitas, grupos: grupos(), soPadrao: true }, fechar), {
      contexto: 'Entrada rápida',
      subtitulo: 'Móvel, chapa e fita que entram nas próximas peças digitadas.',
    });
    if (resposta?.acao === 'salvar') {
      Object.assign(padrao, resposta.peca);
      desenharPadrao();
    }
  };
  botaoPadrao.addEventListener('click', editarPadrao);
  desenharPadrao();

  const adicionar = () => {
    const c = Number(entradaC.value.trim());
    const l = Number(entradaL.value.trim());
    const q = Number(entradaQ.value.trim() || 1);
    const valido = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
    if (!valido(c, LIMITES_CORTE.medidaMax) || !valido(l, LIMITES_CORTE.medidaMax)) {
      aviso('Digite comprimento e largura em milímetros, sem vírgula.', 'erro');
      (valido(c, LIMITES_CORTE.medidaMax) ? entradaL : entradaC).focus();
      return;
    }
    if (!valido(q, LIMITES_CORTE.quantidade)) return aviso(`Quantidade de 1 a ${LIMITES_CORTE.quantidade}.`, 'erro');
    if (pecas.length >= LIMITES_CORTE.linhas) return aviso(`Use no máximo ${LIMITES_CORTE.linhas} linhas por plano.`, 'erro');
    if (!chapasPorId.has(padrao.chapa_id)) {
      aviso('Escolha a chapa das próximas peças.', 'erro');
      editarPadrao();
      return;
    }
    pecas.push({ ...padrao, descricao: entradaD.value.trim(), comprimento_mm: c, largura_mm: l, quantidade: q });
    aviso(`#${pecas.length} ${entradaD.value.trim() || 'peça'} · ${c} × ${l} × ${q}`);
    entradaC.value = '';
    entradaL.value = '';
    entradaQ.value = '1';
    entradaD.value = '';
    alterou();
    entradaC.focus();
  };
  [entradaC, entradaL, entradaQ].forEach((el, i, todos) =>
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      (todos[i + 1] || entradaD).focus();
    }),
  );
  entradaD.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      adicionar();
    }
  });

  const colarLista = async () => {
    const lidas = await abrirModal(
      'Colar lista de peças',
      (fechar) => {
        const area = h('textarea', { rows: '9', autofocus: true, placeholder: '720 x 550 x 2 Lateral\n600 x 400 Prateleira\nBase\t1000\t500\t3' });
        return h(
          'form',
          {
            class: 'formulario',
            onsubmit: (e) => {
              e.preventDefault();
              const { pecas: novas, erros } = lerLinhasPecas(area.value);
              if (!novas.length) return aviso('Nenhuma linha com comprimento e largura.', 'erro');
              if (erros.length) aviso(`${plural(erros.length, 'linha ficou', 'linhas ficaram')} de fora (sem as duas medidas).`, 'erro');
              fechar(novas);
            },
          },
          campo('Uma peça por linha', area, { dica: 'Comprimento, largura e quantidade, em mm, nesta ordem. O texto vira o nome. Também aceita colunas copiadas de planilha.' }),
          h('p', { class: 'dica' }, 'As peças entram com o móvel, a chapa e a fita de "Próximas peças".'),
          h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Adicionar peças')),
        );
      },
      { contexto: 'Entrada rápida' },
    );
    if (!lidas?.length) return;
    if (!chapasPorId.has(padrao.chapa_id)) return aviso('Escolha a chapa em "Próximas peças" antes de colar.', 'erro');
    if (lidas.some((p) => !p.comprimento_mm || !p.largura_mm || p.comprimento_mm > LIMITES_CORTE.medidaMax || p.largura_mm > LIMITES_CORTE.medidaMax || p.quantidade > LIMITES_CORTE.quantidade)) {
      return aviso('Há medidas ou quantidades fora do limite. Confira a lista.', 'erro');
    }
    if (pecas.length + lidas.length > LIMITES_CORTE.linhas) return aviso(`Use no máximo ${LIMITES_CORTE.linhas} linhas por plano.`, 'erro');
    pecas.push(...lidas.map((p) => ({ ...padrao, ...p })));
    aviso(`${plural(lidas.length, 'peça adicionada', 'peças adicionadas')}.`);
    alterou();
  };

  function listaDePecas() {
    if (!pecas.length) return h('p', { class: 'p-alerta info' }, icone('regua'), h('span', {}, 'Digite a primeira peça acima: comprimento, largura e quantidade.'));
    const cores = coresDosMoveis(pecas);
    const porGrupo = new Map();
    pecas.forEach((p, i) => {
      const chave = p.grupo || '';
      if (!porGrupo.has(chave)) porGrupo.set(chave, []);
      porGrupo.get(chave).push(i);
    });
    return [...porGrupo].map(([grupo, indices]) => {
      const cor = h('span', { class: 'p-cor' });
      cor.style.setProperty('--cor', cores.get(grupo));
      return h(
        'section',
        { class: 'p-grupo' },
        h('h3', { class: 'p-grupo-titulo' }, cor, grupo || 'Sem móvel', h('small', {}, plural(indices.reduce((t, i) => t + pecas[i].quantidade, 0), 'peça', 'peças'))),
        indices.map((i) => {
          const p = pecas[i];
          const chapa = chapasPorId.get(p.chapa_id);
          const lados = ladosComFita(p);
          const detalhes = [chapa ? nomeChapa(chapa) : null, lados ? `fita ${lados}` : null, p.veio && chapa?.veio ? 'segue o veio' : null].filter(Boolean);
          const linha = h(
            'button',
            { type: 'button', class: `p-peca${chapa ? '' : ' sem-chapa'}`, onclick: () => !concluido && editarPeca(i), disabled: concluido },
            h('span', { class: 'p-peca-linha' }, `#${i + 1}`),
            h('span', { class: 'p-peca-texto' }, h('strong', {}, p.descricao || 'Peça'), h('small', { class: chapa ? '' : 'erro' }, chapa ? detalhes.join(' · ') : 'Escolha a chapa')),
            h('span', { class: 'p-peca-medida' }, `${p.comprimento_mm} × ${p.largura_mm}`, h('small', {}, `× ${p.quantidade}`)),
          );
          linha.style.setProperty('--cor', cores.get(grupo));
          return linha;
        }),
      );
    });
  }

  // A entrada fica sempre no mesmo lugar: redesenhar só a lista mantém o foco
  // no campo (e o teclado do celular aberto) entre uma peça e outra.
  const listaEl = h('div', {});
  const abaPecasEl = h(
    'div',
    { class: 'p-pilha' },
    !ativas.length ? h('p', { class: 'p-alerta erro' }, icone('alerta'), h('span', {}, 'Nenhuma chapa cadastrada. ', h('a', { href: '#/ajustes' }, 'Cadastre em Ajustes'), ' para montar o plano.')) : null,
    concluido
      ? h('p', { class: 'p-alerta info' }, icone('check'), h('span', {}, 'Plano concluído. A lista fica guardada só para consulta.'))
      : h(
          'section',
          { class: 'p-cartao p-entrada' },
          botaoPadrao,
          h('div', { class: 'p-medidas' }, entradaC, h('span', {}, '×'), entradaL, h('span', {}, '×'), entradaQ),
          h('div', { class: 'p-entrada-nome' }, entradaD, h('button', { type: 'button', class: 'botao botao-primario', onclick: adicionar, 'aria-label': 'Adicionar peça' }, icone('mais'))),
          h('div', { class: 'p-titulo-cartao' }, h('small', { class: 'dica' }, 'Medidas em mm. Comprimento é o lado do veio.'), h('button', { type: 'button', class: 'botao botao-pequeno', onclick: colarLista }, icone('copiar', 'icone icone-mini'), 'Colar lista')),
        ),
    listaEl,
  );

  // ---------------------------------------------------------- Resultado
  async function calcular({ automatico = false } = {}) {
    if (calculando || concluido) return;
    if (!pecas.length) return automatico ? null : aviso('Adicione as peças primeiro.', 'erro');
    if (pecas.some((p) => !chapasPorId.has(p.chapa_id))) return automatico ? null : aviso('Escolha a chapa de todas as peças (as marcadas em vermelho).', 'erro');
    if (plano.iniciado_em && !automatico && !(await confirmar('O corte deste plano já começou. Calcular de novo recomeça o passo a passo.', { sim: 'Calcular de novo' }))) return;
    if (plano.iniciado_em && automatico) return;
    calculando = true;
    desenhar();
    try {
      if (!(await salvarAgora())) return;
      const retalhos = usarRetalhos ? plano.retalhos.filter((r) => r.situacao === 'disponivel' || (r.situacao === 'reservado' && r.plano_id === plano.id)) : [];
      const novo = await calcularNoWorker({ pecas, chapas, ajustes, retalhos, sobraMinima: plano.config, tempoMaximoMs: 2500 });
      sujo = true;
      await salvarAgora({ resultado: novo });
      const solucao = resultado?.solucoes[0];
      if (solucao?.nao_cabem.length) aviso('Algumas peças não cabem na chapa escolhida. Confira o aviso no plano.', 'erro');
    } catch (erro) {
      avisoErro(erro);
    } finally {
      calculando = false;
      calculoAutomaticoFeito = true;
      desenhar();
    }
  }

  async function escolher(indice) {
    if (resultado.escolhida === indice) return;
    let corpoEscolha = { escolhida: indice };
    try {
      if (plano.iniciado_em) {
        if (!(await confirmar('O corte já começou. Trocar de solução recomeça o passo a passo.', { sim: 'Trocar e recomeçar' }))) return;
        corpoEscolha = { ...corpoEscolha, recomecar: true };
      }
      const salvo = await api.put(`/producao/planos/${planoId}/solucao`, corpoEscolha);
      plano = { ...plano, ...salvo };
      resultado = salvo.resultado;
      desenhar();
    } catch (erro) {
      avisoErro(erro);
    }
  }

  const indicador = (rotulo, valor, detalhe) => h('div', { class: 'p-indicador' }, h('small', {}, rotulo), h('strong', {}, valor), detalhe ? h('span', {}, detalhe) : null);

  function abaPlano() {
    if (!pecas.length) return h('div', { class: 'p-pilha' }, h('p', { class: 'p-alerta info' }, icone('regua'), h('span', {}, 'Adicione as peças na aba Peças. O plano é calculado aqui.')));
    if (pecas.some((p) => !chapasPorId.has(p.chapa_id))) {
      return h('div', { class: 'p-pilha' }, h('p', { class: 'p-alerta erro' }, icone('alerta'), h('span', {}, 'Há peças sem chapa (marcadas em vermelho na aba Peças). Escolha a chapa para calcular.')));
    }
    const valido = resultadoValido();
    if (!valido) {
      if (calculando) return h('div', { class: 'p-cartao' }, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Calculando… testando centenas de combinações'));
      if (!calculoAutomaticoFeito && !concluido && !plano.iniciado_em) queueMicrotask(() => calcular({ automatico: true }));
      return h(
        'div',
        { class: 'p-pilha' },
        h('p', { class: 'p-alerta' }, icone('serra'), h('span', {}, plano.iniciado_em ? 'A lista mudou depois que o corte começou. Calcule de novo para seguir.' : 'A lista mudou. Calcule para ver as chapas.')),
        h('button', { type: 'button', class: 'botao botao-primario botao-grande botao-largo', onclick: () => calcular() }, icone('serra'), 'Calcular plano de corte'),
      );
    }
    const v = vista();
    const resumos = valido.solucoes.map((s) => {
      const det = detalharSolucao(v, s);
      return { solucao: s, detalhes: det, resumo: resumirSolucao(v, s, det) };
    });
    const atual = resumos[valido.escolhida];
    const { resumo, detalhes } = atual;
    const cores = coresDosMoveis(pecas);
    const retalhosPorId = new Map(plano.retalhos.map((r) => [r.id, r]));
    const numeros = new Map(expandirPecas(pecas).map((i) => [`${i.indice}:${i.copia}`, i]));
    const custo = ehEscritorio() && plano.custo ? (plano.custo.chapas_cents || 0) + (plano.custo.fitas_cents || 0) : null;

    const cartaoSolucao = ({ solucao, resumo: r }, i) =>
      h(
        'button',
        { type: 'button', class: 'p-solucao', 'aria-pressed': String(i === valido.escolhida), onclick: () => escolher(i), disabled: concluido },
        h('small', {}, SOLUCOES[solucao.tipo].nome),
        h('strong', {}, plural(r.chapas_novas, 'chapa', 'chapas')),
        h('span', {}, [r.retalhos ? plural(r.retalhos, 'retalho', 'retalhos') : '', `${contagem(r.cortes)} cortes`, `${contagem(r.giros)} giros`].filter(Boolean).join(' · ')),
        r.maior_sobra ? h('span', {}, `maior sobra ${formatarArea(r.maior_sobra)}`) : null,
      );

    const legenda = h(
      'div',
      { class: 'p-legenda' },
      [...cores].map(([grupo, cor]) => {
        const ponto = h('span', { class: 'p-cor' });
        ponto.style.setProperty('--cor', cor);
        return h('span', {}, ponto, grupo || 'Sem móvel');
      }),
      h('span', {}, h('strong', {}, '▬'), 'fita'),
    );

    const folhas = detalhes.filter((d) => d.posicaoIgual === 1).map((d) => {
      const titulo = d.retalho_id ? `Retalho R${d.retalho_id}` : d.iguais > 1 ? `Chapas ${d.ordem} a ${d.ordem + d.iguais - 1}` : `Chapa ${d.ordem}`;
      const desenho = desenharFolha(d, { pecas, cores });
      const abrir = () => abrirVisualizador(`${titulo} · ${nomeChapa(d.chapa)}`, (aoTocar) => desenharFolha(d, { pecas, cores, aoTocar }));
      return h(
        'section',
        { class: 'p-cartao' },
        h(
          'div',
          { class: 'p-folha-topo' },
          h(
            'div',
            {},
            h('h3', {}, titulo, ' · ', nomeChapa(d.chapa)),
            h('p', {}, `${formatarMm(d.medidas.comprimento_mm)} × ${formatarMm(d.medidas.largura_mm)} mm · ${plural(d.colocadas.length, 'peça', 'peças')} · ${String(d.aproveitamento).replace('.', ',')}% aproveitado${d.chapa.veio ? ' · veio →' : ''}`),
            d.retalho ? h('p', {}, `Guardado em: ${d.retalho.local || 'local não informado'}`) : null,
          ),
          d.retalho_id ? h('span', { class: 'p-selo retalho' }, 'retalho') : d.iguais > 1 ? h('span', { class: 'p-selo' }, `×${d.iguais} iguais`) : null,
        ),
        h('button', { type: 'button', class: 'p-desenho-botao', onclick: abrir, 'aria-label': `Ampliar ${titulo}` }, desenho),
        h('p', { class: 'p-legenda-toque' }, 'Toque no desenho para ampliar. A medida à esquerda é a largura de cada faixa.'),
      );
    });

    const separar = [
      ...resumo.materiais
        .filter((m) => m.novas)
        .map((m) => h('li', {}, h('span', {}, `${m.nome}${m.espessura_mm ? ` ${m.espessura_mm} mm` : ''}`), h('strong', {}, plural(m.novas, 'chapa nova', 'chapas novas')))),
      ...detalhes
        .filter((d) => d.retalho_id)
        .map((d) => h('li', {}, h('span', {}, `Retalho R${d.retalho_id} · ${nomeChapa(d.chapa)}`), h('strong', {}, retalhosPorId.get(d.retalho_id)?.local || 'sem local'))),
      ...resumo.fitas.map((f) => h('li', {}, h('span', {}, f.nome), h('strong', {}, formatarMetros(f.metros_com_margem)))),
    ];

    return h(
      'div',
      { class: 'p-pilha' },
      resumos.length > 1
        ? h('section', {}, h('h2', { class: 'p-eyebrow' }, 'Escolha a solução'), h('div', { class: 'p-solucoes' }, resumos.map(cartaoSolucao)))
        : null,
      h(
        'section',
        { class: 'p-cartao' },
        h('div', { class: 'p-titulo-cartao' }, h('h2', {}, SOLUCOES[atual.solucao.tipo].nome), plano.calculado_em ? h('small', { class: 'suave' }, `calculado ${haQuanto(plano.calculado_em)}`) : null),
        h(
          'div',
          { class: 'p-indicadores' },
          indicador('Chapas novas', contagem(resumo.chapas_novas), resumo.retalhos ? `+ ${plural(resumo.retalhos, 'retalho', 'retalhos')}` : 'nenhum retalho'),
          indicador('Aproveitamento', `${String(resumo.aproveitamento).replace('.', ',')}%`, `${plural(resumo.total_pecas, 'peça', 'peças')}`),
          indicador('Cortes', contagem(resumo.cortes), `${plural(resumo.giros, 'giro', 'giros')} da peça`),
          indicador('Fita', resumo.fitas.length ? formatarMetros(resumo.fitas.reduce((t, f) => t + f.metros_com_margem, 0)) : '—', resumo.fitas.length && ajustes.margem_fita_pct ? `com ${ajustes.margem_fita_pct}% de margem` : ''),
        ),
        h('h3', { class: 'p-eyebrow', style: null }, 'Separar para o corte'),
        h('ul', { class: 'p-separar' }, separar),
        custo !== null
          ? h('p', { class: 'dica' }, `Material: ${formatarDinheiro(custo)}${plano.orcamento_total_cents ? ` · ${String(Math.round((custo / plano.orcamento_total_cents) * 1000) / 10).replace('.', ',')}% do orçamento` : ''} (só o escritório vê).`)
          : null,
      ),
      atual.solucao.nao_cabem.length
        ? h(
            'p',
            { class: 'p-alerta erro' },
            icone('alerta'),
            h('span', {}, `Não cabem na chapa (nem girando, quando o veio deixa): ${[...new Set(atual.solucao.nao_cabem.map((p) => `#${numeros.get(`${p.indice}:${p.copia}`).indice + 1}`))].join(', ')}. Confira as medidas ou escolha outra chapa.`),
          )
        : null,
      legenda,
      folhas,
      h('div', { class: 'p-espaco-acao' }),
    );
  }

  // ---------------------------------------------------------- Ações
  const renomear = async () => {
    const novo = await pedirNome('Renomear plano', nome);
    if (!novo) return;
    nome = novo;
    atualizarTopo();
    alterou();
  };

  const ajustesDoCorte = async () => {
    const r = await abrirModal(
      'Ajustes deste plano',
      (fechar) => {
        const serra = h('input', { type: 'text', inputmode: 'decimal', value: formatarMm(ajustes.serra_decimos_mm / 10) });
        const refilo = h('input', { type: 'text', inputmode: 'numeric', value: String(ajustes.refilo_mm) });
        const margem = h('input', { type: 'text', inputmode: 'numeric', value: String(ajustes.margem_fita_pct) });
        const retalhos = h('input', { type: 'checkbox', checked: usarRetalhos });
        let modo = ajustes.modo;
        return h(
          'form',
          {
            class: 'formulario',
            onsubmit: (e) => {
              e.preventDefault();
              const decimos = Math.round(Number(serra.value.replace(',', '.')) * 10);
              const novos = { serra_decimos_mm: decimos, refilo_mm: Number(refilo.value), margem_fita_pct: Number(margem.value), modo };
              const ok = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
              if (!ok(decimos, LIMITES_CORTE.serraDecimosMax) || !ok(novos.refilo_mm, LIMITES_CORTE.refiloMax) || !ok(novos.margem_fita_pct, LIMITES_CORTE.margemFitaMax)) {
                return aviso('Confira os números: só inteiros (o disco aceita uma casa decimal).', 'erro');
              }
              fechar({ ajustes: novos, usarRetalhos: retalhos.checked });
            },
          },
          h('div', { class: 'grade-2' }, campo('Disco (mm)', serra, { dica: 'Espessura do dente.' }), campo('Refilo (mm)', refilo, { dica: 'Por borda da chapa.' })),
          h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Cortes'), segmentado(Object.entries(MODOS_CORTE).map(([k, m]) => [k, m.nome]), modo, (v) => (modo = v), { rotulo: 'Modo de corte' })),
          h('small', { class: 'dica' }, `${MODOS_CORTE.aproveitamento.nome}: ${MODOS_CORTE.aproveitamento.descricao} ${MODOS_CORTE.faixas.nome}: ${MODOS_CORTE.faixas.descricao}`),
          h('label', { class: 'caixa-marcar' }, retalhos, 'Usar retalhos do estoque quando economizar chapa'),
          campo('Margem da fita (%)', margem, { dica: 'Sobra para aplicar a fita.' }),
          h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Usar estes ajustes')),
        );
      },
      { contexto: 'Plano de corte', subtitulo: `Começam com os valores da serra da oficina (${formatarMm(sessao.config.serra_decimos_mm / 10)} mm de disco, ${sessao.config.refilo_mm} mm de refilo).` },
    );
    if (!r) return;
    ajustes = { ...ajustes, ...r.ajustes };
    usarRetalhos = r.usarRetalhos;
    alterou();
  };

  const baixarPdf = async () => {
    if (!(await salvarAgora())) return;
    try {
      baixarArquivo(await baixarBlob(`/producao/planos/${planoId}/pdf`), `plano-de-corte-${planoId}.pdf`);
    } catch (erro) {
      avisoErro(erro);
    }
  };

  const exportarCsv = () => {
    const campoCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['#', 'Móvel', 'Peça', 'Comprimento (mm)', 'Largura (mm)', 'Quantidade', 'Chapa', 'Espessura (mm)', 'Segue o veio', 'Fita', 'C1', 'C2', 'L1', 'L2']];
    pecas.forEach((p, i) => {
      const chapa = chapasPorId.get(p.chapa_id);
      const fita = fitasPorId.get(p.fita_id);
      linhas.push([i + 1, p.grupo, p.descricao, p.comprimento_mm, p.largura_mm, p.quantidade, chapa?.nome || '', chapa?.espessura_mm || '', p.veio ? 'sim' : 'não', fita?.nome || '', ...LADOS_FITA.map(([k]) => (fita && p[k] ? 'sim' : ''))]);
    });
    baixarArquivo(new Blob([`﻿${linhas.map((l) => l.map(campoCsv).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `pecas-plano-${planoId}.csv`);
  };

  const excluir = async () => {
    if (!(await confirmar('Excluir este plano? A lista de peças, o cálculo e o andamento do corte serão apagados. Retalhos reservados voltam para o estoque.', { sim: 'Excluir plano', perigo: true }))) return;
    try {
      clearTimeout(temporizador);
      sujo = false;
      await api.delete(`/producao/planos/${planoId}`);
      aviso('Plano excluído.');
      irPara('#/');
    } catch (erro) {
      avisoErro(erro);
    }
  };

  // ---------------------------------------------------------- Montagem
  const tituloEl = h('h1', {}, nome);
  const seloEl = h('span', {});
  const subtitulo = plano.trabalho
    ? `${plano.trabalho.cliente_nome} · orçamento ${formatarNumero(plano.trabalho.numero)}`
    : plano.atribuido
      ? 'Mandado pelo escritório'
      : 'Plano próprio';
  function atualizarTopo() {
    tituloEl.textContent = nome;
    substituir(seloEl, seloSituacao(plano));
  }
  atualizarTopo();

  const topo = h(
    'header',
    { class: 'p-plano-topo' },
    h('a', { href: '#/', class: 'botao-icone', 'aria-label': 'Voltar aos trabalhos' }, icone('voltar')),
    h('div', { class: 'p-plano-titulos' }, tituloEl, h('p', {}, [subtitulo, ehEscritorio() && plano.funcionario_nome ? `com ${plano.funcionario_nome}` : ''].filter(Boolean).join(' · ')), seloEl, ' ', estado),
    menuSuspenso(
      [
        concluido ? null : ['editar', 'Renomear', renomear],
        concluido ? null : ['regua', 'Ajustes deste plano', ajustesDoCorte],
        ['pdf', 'PDF para a serra', baixarPdf],
        ['baixar', 'Exportar peças (CSV)', exportarCsv],
        plano.pode_excluir ? '-' : null,
        plano.pode_excluir ? ['lixeira', 'Excluir plano', excluir, { perigo: true }] : null,
      ].filter(Boolean),
      { rotulo: 'Ações do plano' },
    ),
  );

  // As instruções ficam sempre à vista; a lista de móveis do orçamento, recolhida.
  const escritorio = [
    plano.instrucoes ? h('p', { class: 'p-instrucoes' }, plano.instrucoes) : null,
    plano.trabalho
      ? h(
          'details',
          { class: 'p-cartao p-escritorio' },
          h('summary', {}, icone('empresa'), `Móveis do orçamento (${plano.trabalho.ambientes.reduce((t, a) => t + a.itens.length, 0)})`, icone('baixo', 'icone icone-mini')),
          plano.trabalho.prazo_entrega ? h('p', { class: 'dica' }, `Prazo combinado com o cliente: ${plano.trabalho.prazo_entrega}`) : null,
          plano.trabalho.ambientes.map((a) =>
            h(
              'div',
              { class: 'p-ambiente' },
              h('h3', {}, a.nome),
              a.descricao ? h('p', {}, a.descricao) : null,
              h('ul', {}, a.itens.map((i) => h('li', {}, h('span', {}, i.quantidade > 1 ? `${i.quantidade}× ${i.nome}` : i.nome), h('strong', { class: 'num' }, i.medida)))),
            ),
          ),
        )
      : null,
  ];

  const area = h('div', {});
  const acao = h('div', { class: 'p-acao-fixa' });
  const abas = segmentado(
    [
      ['pecas', `Peças (${contagem(pecas.reduce((t, p) => t + p.quantidade, 0))})`],
      ['plano', 'Plano de corte'],
    ],
    aba,
    (v) => {
      aba = v;
      history.replaceState(null, '', `#/plano/${planoId}${v === 'plano' ? '?aba=plano' : ''}`);
      desenhar();
    },
    { rotulo: 'Parte do plano' },
  );

  function desenharAcao() {
    const valido = resultadoValido();
    if (aba !== 'plano' || !valido || calculando) {
      acao.hidden = true;
      return;
    }
    acao.hidden = false;
    const p = plano.progresso;
    const texto = concluido ? 'Ver o passo a passo' : p?.passo ? `Continuar o corte · ${Math.round((p.passo / p.total) * 100)}%` : 'Começar a cortar';
    substituir(acao, h('a', { href: `#/plano/${planoId}/cortar`, class: 'botao botao-primario botao-grande', onclick: async (e) => {
      if (sujo || salvando) {
        e.preventDefault();
        if (await salvarAgora()) irPara(`#/plano/${planoId}/cortar`);
      }
    } }, icone('serra'), texto));
  }

  function desenhar() {
    const total = pecas.reduce((t, p) => t + p.quantidade, 0);
    abas.definir(aba);
    abas.querySelector('button').textContent = `Peças (${contagem(total)})`;
    if (aba === 'pecas') {
      substituir(listaEl, listaDePecas());
      if (area.firstChild !== abaPecasEl) substituir(area, abaPecasEl);
    } else substituir(area, abaPlano());
    desenharAcao();
  }
  desenhar();

  return h('div', {}, topo, escritorio, h('div', { class: 'p-abas-plano' }, abas), area, acao);
}

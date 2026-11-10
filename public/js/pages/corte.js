import { formatarDinheiro, formatarNumero } from '/shared/calc.js';
import {
  AJUSTES_PADRAO,
  LADOS_FITA,
  LIMITES_CORTE,
  MODOS_CORTE,
  assinaturaPlano,
  detalharChapas,
  expandirPecas,
  formatarMetros,
  formatarMm,
  ladosComFita,
  ladosNoDesenho,
  lerLinhasPecas,
  resumirPlano,
  textoPasso,
} from '/shared/corte.js';
import { api, baixarBlob } from '../api.js';
import { h, icone, campo, segmentado, abrirModal, confirmar, aviso, avisoErro, substituir, vazioIlustrado, menuSuspenso, haQuanto } from '../ui.js';
import { cabecalhoInterno, cabecalhoPagina } from '../comum.js';
import { aoSairDaPagina, irPara } from '../main.js';

const nomeChapa = (c) => (c ? `${c.nome} ${c.espessura_mm} mm` : 'Sem chapa');
const contagem = (n) => Number(n).toLocaleString('pt-BR');
const plural = (n, um, varios) => `${contagem(n)} ${n === 1 ? um : varios}`;

// ------------------------------------------------------------------- Lista

export async function paginaPlanosCorte() {
  const [planos, chapas] = await Promise.all([api.get('/planos-corte'), api.get('/chapas')]);
  const novo = async () => {
    try {
      const plano = await api.post('/planos-corte', {});
      irPara(`#/corte/${plano.id}`);
    } catch (erro) {
      avisoErro(erro);
    }
  };
  const semChapas = !chapas.some((c) => c.ativo);
  return h(
    'div',
    { class: 'pagina pagina-corte-lista' },
    cabecalhoPagina('Plano de corte', {
      subtitulo: 'Lista de peças, chapas e roteiro para a serra.',
      acoes: [
        h('a', { href: '#/config/chapas', class: 'botao' }, icone('area'), 'Chapas e fitas'),
        h('button', { type: 'button', class: 'botao botao-primario', onclick: novo }, icone('mais'), 'Novo plano'),
      ],
    }),
    semChapas
      ? h(
          'p',
          { class: 'config-informacao corte-aviso' },
          h('span', { class: 'config-info-icone' }, icone('alerta')),
          'Cadastre as chapas que você usa (medida, espessura e preço) antes de montar o primeiro plano. ',
          h('a', { href: '#/config/chapas' }, 'Cadastrar chapas'),
        )
      : null,
    planos.length
      ? h(
          'div',
          { class: 'lista corte-planos' },
          planos.map((p) =>
            h(
              'a',
              { href: `#/corte/${p.id}`, class: 'linha-orcamento corte-plano-linha' },
              h('span', { class: 'corte-plano-icone' }, icone('serra')),
              h(
                'div',
                { class: 'linha-principal' },
                h('strong', {}, p.nome),
                h(
                  'span',
                  { class: 'suave' },
                  [
                    p.orcamento_numero ? `Orçamento ${formatarNumero(p.orcamento_numero)}` : 'Avulso',
                    plural(p.pecas, 'peça', 'peças'),
                    p.chapas ? plural(p.chapas, 'chapa', 'chapas') : 'não calculado',
                    `alterado ${haQuanto(p.atualizado_em)}`,
                  ].join(' · '),
                ),
              ),
              icone('seta', 'icone linha-seta'),
            ),
          ),
        )
      : vazioIlustrado(
          'serra',
          'Nenhum plano de corte ainda',
          'Abra um orçamento aprovado e toque em "Plano de corte", ou crie um plano avulso.',
          h('button', { type: 'button', class: 'botao botao-primario', onclick: novo }, icone('mais'), 'Novo plano'),
        ),
  );
}

// -------------------------------------------------------------- Calcular

function calcularNoWorker(dados) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker('/js/corte-worker.js', { type: 'module' });
    } catch {
      worker = null;
    }
    if (!worker) {
      import('/shared/corte.js').then((m) => resolve(m.otimizarPlano(dados)), reject);
      return;
    }
    const encerrar = () => worker.terminate();
    const prazo = setTimeout(() => {
      encerrar();
      reject(new Error('O cálculo demorou demais. Tente com menos peças.'));
    }, 30_000);
    worker.addEventListener('message', (e) => {
      clearTimeout(prazo);
      encerrar();
      if (e.data?.ok) resolve(e.data.resultado);
      else reject(new Error(e.data?.erro || 'Não foi possível calcular o plano.'));
    });
    worker.addEventListener('error', () => {
      clearTimeout(prazo);
      encerrar();
      // Navegador sem Worker de módulo: calcula na própria página.
      import('/shared/corte.js').then((m) => resolve(m.otimizarPlano(dados)), reject);
    });
    worker.postMessage(dados);
  });
}

// ----------------------------------------------------------------- Desenho

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

function desenhoChapa(detalhe, plano, aoTocar) {
  const { chapa, colocadas, sobras } = detalhe;
  const r = plano.ajustes.refilo_mm;
  const desenho = s(
    'svg',
    {
      viewBox: `0 0 ${chapa.comprimento_mm} ${chapa.largura_mm}`,
      class: 'corte-desenho',
      role: 'img',
      'aria-label': `Chapa ${detalhe.ordem}: ${colocadas.length} peças`,
    },
    s('rect', { x: 0, y: 0, width: chapa.comprimento_mm, height: chapa.largura_mm, class: 'corte-refilo' }),
    s('rect', { x: r, y: r, width: chapa.comprimento_mm - 2 * r, height: chapa.largura_mm - 2 * r, class: 'corte-util' }),
    sobras.map((sb) => s('rect', { x: sb.x, y: sb.y, width: sb.w, height: sb.h, class: 'corte-sobra' }, s('title', {}, `Sobra ${formatarMm(sb.w)} × ${formatarMm(sb.h)} mm`))),
  );
  for (const p of colocadas) {
    const peca = plano.pecas[p.indice];
    const lados = peca.fita_id ? ladosNoDesenho(peca, p.girada) : {};
    const fs = Math.min(p.h * 0.34, p.w * 0.24, 110);
    const grupo = s(
      'g',
      { class: 'corte-peca', tabindex: '0', role: 'button', 'data-numero': p.numero, 'aria-label': `Peça ${p.numero}` },
      s('title', {}, `nº ${p.numero} · ${peca.descricao || 'Peça'} · ${peca.comprimento_mm} × ${peca.largura_mm} mm`),
      s('rect', { x: p.x, y: p.y, width: p.w, height: p.h, class: 'corte-peca-fundo' }),
      lados.topo ? s('line', { x1: p.x, y1: p.y, x2: p.x + p.w, y2: p.y, class: 'corte-fita' }) : null,
      lados.base ? s('line', { x1: p.x, y1: p.y + p.h, x2: p.x + p.w, y2: p.y + p.h, class: 'corte-fita' }) : null,
      lados.esquerda ? s('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y + p.h, class: 'corte-fita' }) : null,
      lados.direita ? s('line', { x1: p.x + p.w, y1: p.y, x2: p.x + p.w, y2: p.y + p.h, class: 'corte-fita' }) : null,
      fs >= 45 ? s('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 + (fs > 70 && p.h > 250 ? -fs * 0.15 : fs * 0.35), 'font-size': fs, class: 'corte-numero' }, p.numero) : null,
      fs > 70 && p.h > 250 && p.w > 380
        ? s('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 + fs * 0.85, 'font-size': fs * 0.62, class: 'corte-medida' }, `${peca.comprimento_mm}×${peca.largura_mm}`)
        : null,
    );
    const tocar = () => aoTocar(p, peca);
    grupo.addEventListener('click', tocar);
    grupo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tocar();
      }
    });
    desenho.append(grupo);
  }
  return desenho;
}

function cartaoChapa(detalhe, total, plano) {
  const legenda = h('p', { class: 'corte-legenda', 'aria-live': 'polite' }, 'Toque numa peça para ver o que é.');
  const desenho = desenhoChapa(detalhe, plano, (p, peca) => {
    for (const el of desenho.querySelectorAll('.corte-peca.selecionada')) el.classList.remove('selecionada');
    desenho.querySelector(`[data-numero="${p.numero}"]`)?.classList.add('selecionada');
    const lados = ladosComFita(peca);
    legenda.textContent = [
      `nº ${p.numero}`,
      peca.descricao || 'Peça sem nome',
      peca.grupo,
      `${peca.comprimento_mm} × ${peca.largura_mm} mm`,
      p.girada ? 'girada' : '',
      lados ? `fita ${lados}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });
  const { chapa } = detalhe;
  return h(
    'section',
    { class: 'cartao corte-chapa' },
    h(
      'header',
      { class: 'corte-chapa-topo' },
      h('span', { class: 'contexto-interno' }, `CHAPA ${detalhe.ordem} DE ${total}`),
      h('h3', {}, nomeChapa(chapa)),
      h(
        'p',
        { class: 'suave' },
        `${chapa.comprimento_mm} × ${chapa.largura_mm} mm · ${plural(detalhe.colocadas.length, 'peça', 'peças')} · aproveitamento ${String(detalhe.aproveitamento).replace('.', ',')}%`,
        chapa.veio ? ' · veio →' : '',
      ),
    ),
    h('div', { class: 'corte-desenho-caixa' }, desenho),
    legenda,
    h(
      'details',
      { class: 'corte-roteiro', open: detalhe.ordem === 1 },
      h('summary', {}, icone('serra'), `Roteiro de cortes (${detalhe.roteiro.length} ${detalhe.roteiro.length === 1 ? 'passo' : 'passos'})`, icone('baixo', 'icone icone-mini')),
      h('p', { class: 'suave pequeno' }, `Refile ${plano.ajustes.refilo_mm} mm em cada borda. A medida é a que vai na guia; as letras indicam as partes cortadas depois.`),
      h(
        'ol',
        {},
        detalhe.roteiro.map((passo) => {
          const { titulo, partes } = textoPasso(passo);
          return h('li', {}, h('strong', {}, titulo), h('span', { class: 'corte-partes' }, partes.map((t) => h('span', {}, t))));
        }),
      ),
      detalhe.sobras.length
        ? h('p', { class: 'suave pequeno' }, `Sobras para guardar: ${detalhe.sobras.map((sb) => `${formatarMm(sb.w)} × ${formatarMm(sb.h)}`).join(', ')} mm.`)
        : null,
    ),
  );
}

// ------------------------------------------------------------ Uma peça

function formularioPeca(peca, { chapas, fitas, grupos, novo = false, soPadrao = false }, fechar) {
  const dados = { ...peca };
  const numero = (valor, rotulo, extra = {}) => h('input', { type: 'text', inputmode: 'numeric', value: valor ? String(valor) : '', 'aria-label': rotulo, ...extra });
  const listaId = `grupos-${Math.random().toString(36).slice(2)}`;
  const grupo = h('input', { type: 'text', value: dados.grupo || '', maxlength: '120', list: listaId, placeholder: 'Ex.: Cozinha · Armário aéreo' });
  const descricao = h('input', { type: 'text', value: dados.descricao || '', maxlength: '120', placeholder: 'Ex.: Lateral' });
  const comprimento = numero(dados.comprimento_mm, 'Comprimento', { autofocus: novo });
  const largura = numero(dados.largura_mm, 'Largura');
  const quantidade = numero(dados.quantidade || 1, 'Quantidade');
  const chapa = h(
    'select',
    {},
    h('option', { value: '' }, 'Escolha a chapa'),
    chapas
      .filter((c) => c.ativo || c.id === dados.chapa_id)
      .map((c) => h('option', { value: String(c.id), selected: c.id === dados.chapa_id }, `${nomeChapa(c)}${c.veio ? ' · com veio' : ''}`)),
  );
  const veio = h('input', { type: 'checkbox', checked: Boolean(dados.veio) });
  const fita = h(
    'select',
    {},
    h('option', { value: '' }, 'Sem fita'),
    fitas.filter((f) => f.ativo || f.id === dados.fita_id).map((f) => h('option', { value: String(f.id), selected: f.id === dados.fita_id }, f.nome)),
  );
  const lados = LADOS_FITA.map(([chave, nome]) => [chave, h('input', { type: 'checkbox', checked: Boolean(dados[chave]), 'aria-label': `Fita no lado ${nome}` }), nome]);
  const caixaLados = h(
    'div',
    { class: 'corte-lados' },
    lados.map(([, el, nome]) => h('label', { class: 'caixa-marcar' }, el, ` ${nome}`)),
  );
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
      class: 'formulario corte-form-peca',
      onsubmit: (e) => {
        e.preventDefault();
        try {
          const lida = {
            ...dados,
            grupo: grupo.value.trim(),
            chapa_id: chapa.value ? Number(chapa.value) : null,
            veio: veio.checked ? 1 : 0,
            fita_id: fita.value ? Number(fita.value) : null,
          };
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
    soPadrao ? campo('Móvel', grupo) : h('div', { class: 'corte-grade-2' }, campo('Móvel', grupo), campo('Peça', descricao)),
    soPadrao
      ? null
      : h(
          'div',
          { class: 'corte-grade-3' },
          campo('Comprimento (mm)', comprimento, { dica: 'No sentido do veio' }),
          campo('Largura (mm)', largura),
          campo('Quantidade', quantidade),
        ),
    campo('Chapa', chapa),
    h('label', { class: 'caixa-marcar' }, veio, ' Seguir o veio (não girar a peça)'),
    h('small', { class: 'dica' }, 'Só vale para chapas com veio. Nas outras, o plano gira a peça quando aproveita melhor.'),
    campo('Fita de borda', fita),
    caixaLados,
    h('small', { class: 'dica' }, 'C1 e C2 são os lados do comprimento; L1 e L2, os da largura.'),
    h(
      'div',
      { class: 'acoes-modal' },
      novo || soPadrao ? null : h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: () => fechar({ acao: 'excluir' }) }, 'Excluir'),
      novo || soPadrao ? null : h('button', { type: 'button', class: 'botao', onclick: () => fechar({ acao: 'duplicar' }) }, 'Duplicar'),
      h('button', { type: 'submit', class: 'botao botao-primario' }, soPadrao ? 'Usar nas próximas' : novo ? 'Adicionar peça' : 'Salvar peça'),
    ),
  );
}

// ------------------------------------------------------------- O plano

export async function paginaPlanoCorte(planoId) {
  let plano = await api.get(`/planos-corte/${planoId}`);
  const { chapas, fitas } = plano;
  let pecas = plano.pecas.map((p) => ({ ...p }));
  let ajustes = { ...AJUSTES_PADRAO, ...plano.ajustes };
  let nome = plano.nome;
  let resultado = plano.resultado;
  let sujo = false;
  let salvando = null;
  let temporizador = null;
  let calculando = false;

  const chapasPorId = new Map(chapas.map((c) => [c.id, c]));
  const fitasPorId = new Map(fitas.map((f) => [f.id, f]));
  const ultima = pecas[pecas.length - 1];
  const padrao = {
    grupo: ultima?.grupo || plano.grupos_sugeridos[0] || '',
    // Com mais de uma chapa, a pessoa escolhe: chutar a chapa errada estraga o plano.
    chapa_id: ultima?.chapa_id ?? (chapas.filter((c) => c.ativo).length === 1 ? chapas.find((c) => c.ativo).id : null),
    veio: ultima?.veio || 0,
    fita_id: ultima?.fita_id ?? null,
    fita_c1: ultima?.fita_c1 || 0,
    fita_c2: ultima?.fita_c2 || 0,
    fita_l1: ultima?.fita_l1 || 0,
    fita_l2: ultima?.fita_l2 || 0,
  };
  const grupos = () => [...new Set([...plano.grupos_sugeridos, ...pecas.map((p) => p.grupo).filter(Boolean)])];
  const resultadoValido = () => (resultado && pecas.length && resultado.assinatura === assinaturaPlano(pecas, chapas, ajustes) ? resultado : null);

  // ------------------------------------------------------------ Salvar
  const estado = h('span', { class: 'corte-estado suave', role: 'status', 'aria-live': 'polite' }, 'Tudo salvo');
  const mostrarEstado = (texto, erro = false) => {
    estado.textContent = texto;
    estado.classList.toggle('erro', erro);
  };
  const corpo = () => ({ nome, ...ajustes, versao: plano.versao, pecas });

  async function salvarAgora(extra = {}) {
    clearTimeout(temporizador);
    if (salvando) await salvando.catch(() => {});
    if (!sujo && !('resultado' in extra)) return true;
    sujo = false;
    mostrarEstado('Salvando…');
    salvando = api.put(`/planos-corte/${planoId}`, { ...corpo(), ...extra });
    try {
      const salvo = await salvando;
      plano = { ...plano, versao: salvo.versao, calculado_em: salvo.calculado_em };
      if ('resultado' in extra) resultado = salvo.resultado;
      mostrarEstado(sujo ? 'Alterações não salvas' : 'Tudo salvo');
      return true;
    } catch (erro) {
      sujo = true;
      mostrarEstado('Não foi possível salvar', true);
      avisoErro(erro);
      return false;
    } finally {
      salvando = null;
    }
  }

  const alterou = () => {
    sujo = true;
    mostrarEstado('Alterações não salvas');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => salvarAgora(), 900);
    desenharPecas();
    desenharResultado();
  };

  const verificarSaida = async () => {
    if (!sujo && !salvando) return true;
    if (await salvarAgora()) return true;
    return confirmar('Não foi possível salvar as últimas alterações do plano. Sair mesmo assim?', { sim: 'Sair sem salvar', perigo: true });
  };
  verificarSaida.sincrono = () => !sujo && !salvando;
  aoSairDaPagina(verificarSaida);

  // ------------------------------------------------------------ Peças
  const editarPeca = async (indice) => {
    const resposta = await abrirModal(
      'Editar peça',
      (fechar) => formularioPeca(pecas[indice], { chapas, fitas, grupos: grupos() }, fechar),
      { largo: true, contexto: 'PLANO DE CORTE', classe: 'modal-corte-peca' },
    );
    if (!resposta) return;
    if (resposta.acao === 'excluir') pecas.splice(indice, 1);
    else if (resposta.acao === 'duplicar') pecas.splice(indice + 1, 0, { ...pecas[indice] });
    else pecas[indice] = resposta.peca;
    alterou();
  };

  const listaPecas = h('div', { class: 'corte-pecas' });
  function desenharPecas() {
    if (!pecas.length) {
      substituir(listaPecas, h('p', { class: 'suave corte-vazio' }, 'Nenhuma peça ainda. Digite as medidas abaixo ou cole uma lista.'));
      return;
    }
    const numeros = new Map();
    for (const inst of expandirPecas(pecas)) {
      const faixa = numeros.get(inst.indice) || [inst.numero, inst.numero];
      faixa[1] = inst.numero;
      numeros.set(inst.indice, faixa);
    }
    const porGrupo = new Map();
    pecas.forEach((p, i) => {
      const chave = p.grupo || '';
      if (!porGrupo.has(chave)) porGrupo.set(chave, []);
      porGrupo.get(chave).push(i);
    });
    substituir(
      listaPecas,
      [...porGrupo].map(([grupo, indices]) =>
        h(
          'section',
          { class: 'corte-grupo' },
          h('h3', {}, grupo || 'Sem móvel', h('small', { class: 'suave' }, plural(indices.reduce((t, i) => t + pecas[i].quantidade, 0), 'peça', 'peças'))),
          indices.map((i) => {
            const p = pecas[i];
            const [n0, n1] = numeros.get(i);
            const chapa = chapasPorId.get(p.chapa_id);
            const lados = ladosComFita(p);
            const detalhes = [
              chapa ? nomeChapa(chapa) : null,
              lados ? `fita ${lados}${fitasPorId.get(p.fita_id) ? ` (${fitasPorId.get(p.fita_id).nome})` : ''}` : null,
              p.veio && chapa?.veio ? 'segue o veio' : null,
            ].filter(Boolean);
            return h(
              'button',
              { type: 'button', class: `corte-peca-linha${chapa ? '' : ' sem-chapa'}`, onclick: () => editarPeca(i) },
              h('span', { class: 'corte-peca-numero' }, n0 === n1 ? `nº ${n0}` : `nº ${n0}–${n1}`),
              h(
                'span',
                { class: 'corte-peca-texto' },
                h('strong', {}, p.descricao || 'Peça'),
                h('small', { class: chapa ? 'suave' : 'corte-alerta' }, chapa ? detalhes.join(' · ') : 'Escolha a chapa'),
              ),
              h('span', { class: 'corte-peca-medida' }, `${p.comprimento_mm} × ${p.largura_mm}`, h('small', {}, `× ${p.quantidade}`)),
            );
          }),
        ),
      ),
    );
  }

  // Entrada rápida: medidas com o que estiver em "Próximas peças".
  const entradaC = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'Comp.', 'aria-label': 'Comprimento em mm' });
  const entradaL = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'Larg.', 'aria-label': 'Largura em mm' });
  const entradaQ = h('input', { type: 'text', inputmode: 'numeric', value: '1', 'aria-label': 'Quantidade' });
  const entradaD = h('input', { type: 'text', maxlength: '120', placeholder: 'Peça (ex.: Lateral)', 'aria-label': 'Nome da peça' });
  const resumoPadrao = h('span', { class: 'corte-padrao-texto' });
  let desenharPadrao = () => {
    const lados = ladosComFita(padrao);
    resumoPadrao.textContent = [
      padrao.grupo || 'Sem móvel',
      chapasPorId.get(padrao.chapa_id) ? nomeChapa(chapasPorId.get(padrao.chapa_id)) : 'escolha a chapa',
      lados ? `fita ${lados}` : 'sem fita',
      padrao.veio && chapasPorId.get(padrao.chapa_id)?.veio ? 'segue o veio' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const botaoPadrao = h('button', { type: 'button', class: 'corte-padrao', 'aria-label': 'Alterar móvel, chapa e fita das próximas peças' }, h('small', {}, 'Próximas peças'), resumoPadrao, icone('editar', 'icone icone-mini'));
  const desenharPadraoAntes = desenharPadrao;
  desenharPadrao = () => {
    desenharPadraoAntes();
    botaoPadrao.classList.toggle('sem-chapa', !chapasPorId.has(padrao.chapa_id));
  };
  desenharPadrao();
  botaoPadrao.addEventListener('click', () => editarPadrao());
  const editarPadrao = async () => {
    const resposta = await abrirModal(
      'Próximas peças',
      (fechar) => formularioPeca(padrao, { chapas, fitas, grupos: grupos(), soPadrao: true }, fechar),
      { largo: true, contexto: 'PLANO DE CORTE', subtitulo: 'Móvel, chapa e fita usados nas próximas peças que você digitar.', classe: 'modal-corte-peca modal-corte-padrao' },
    );
    if (resposta?.acao !== 'salvar') return;
    Object.assign(padrao, resposta.peca);
    desenharPadrao();
  };

  const adicionar = () => {
    const c = Number(entradaC.value.trim());
    const l = Number(entradaL.value.trim());
    const q = Number(entradaQ.value.trim() || 1);
    const valido = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;
    if (!valido(c, LIMITES_CORTE.medidaMax) || !valido(l, LIMITES_CORTE.medidaMax)) {
      aviso('Informe comprimento e largura em milímetros, sem vírgula.', 'erro');
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
    entradaC.value = '';
    entradaL.value = '';
    entradaQ.value = '1';
    entradaD.value = '';
    entradaC.focus();
    alterou();
  };
  for (const el of [entradaC, entradaL, entradaQ, entradaD]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        adicionar();
      }
    });
  }

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
          campo('Uma peça por linha', area, {
            dica: 'Comprimento, largura e quantidade, nesta ordem, em mm. O texto vira o nome da peça. Também aceita colunas copiadas de planilha.',
          }),
          h('p', { class: 'suave pequeno' }, 'As peças entram com o móvel, a chapa e a fita de "Próximas peças".'),
          h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario' }, 'Adicionar peças')),
        );
      },
      { largo: true, contexto: 'PLANO DE CORTE' },
    );
    if (!lidas?.length) return;
    const invalidas = lidas.filter((p) => p.comprimento_mm > LIMITES_CORTE.medidaMax || p.largura_mm > LIMITES_CORTE.medidaMax || p.quantidade > LIMITES_CORTE.quantidade || !p.comprimento_mm || !p.largura_mm);
    if (invalidas.length) return aviso('Há medidas ou quantidades fora do limite. Confira a lista.', 'erro');
    if (pecas.length + lidas.length > LIMITES_CORTE.linhas) return aviso(`Use no máximo ${LIMITES_CORTE.linhas} linhas por plano.`, 'erro');
    pecas.push(...lidas.map((p) => ({ ...padrao, ...p })));
    aviso(`${plural(lidas.length, 'peça adicionada', 'peças adicionadas')}.`);
    alterou();
  };

  const cartaoPecas = h(
    'section',
    { class: 'cartao corte-cartao-pecas' },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Peças'),
      estado,
      h('button', { type: 'button', class: 'botao botao-pequeno', onclick: colarLista }, icone('copiar'), 'Colar lista'),
    ),
    listaPecas,
    h(
      'div',
      { class: 'corte-entrada' },
      botaoPadrao,
      h(
        'div',
        { class: 'corte-entrada-campos' },
        entradaC,
        h('span', { 'aria-hidden': 'true' }, '×'),
        entradaL,
        h('span', { 'aria-hidden': 'true' }, '×'),
        entradaQ,
        entradaD,
        h('button', { type: 'button', class: 'botao botao-primario', onclick: adicionar, 'aria-label': 'Adicionar peça' }, icone('mais'), h('span', {}, 'Adicionar')),
      ),
      h('small', { class: 'dica' }, 'Medidas em mm. O comprimento é o lado que segue o veio. Enter adiciona.'),
    ),
  );

  // ------------------------------------------------------------ Ajustes
  const serra = h('input', { type: 'text', inputmode: 'decimal', value: formatarMm(ajustes.serra_decimos_mm / 10) });
  const refilo = h('input', { type: 'text', inputmode: 'numeric', value: String(ajustes.refilo_mm) });
  const margem = h('input', { type: 'text', inputmode: 'numeric', value: String(ajustes.margem_fita_pct) });
  const descricaoModo = h('small', { class: 'dica' }, MODOS_CORTE[ajustes.modo].descricao);
  const lerAjuste = (el, chave, conversor, max, nome) => {
    el.addEventListener('change', () => {
      const n = conversor(el.value);
      if (!Number.isInteger(n) || n < 0 || n > max) {
        aviso(`${nome} inválido.`, 'erro');
        el.value = chave === 'serra_decimos_mm' ? formatarMm(ajustes[chave] / 10) : String(ajustes[chave]);
        return;
      }
      ajustes = { ...ajustes, [chave]: n };
      alterou();
    });
  };
  lerAjuste(serra, 'serra_decimos_mm', (v) => Math.round(Number(String(v).replace(',', '.').trim()) * 10), LIMITES_CORTE.serraDecimosMax, 'Espessura da serra');
  lerAjuste(refilo, 'refilo_mm', (v) => Number(String(v).trim()), LIMITES_CORTE.refiloMax, 'Refilo');
  lerAjuste(margem, 'margem_fita_pct', (v) => Number(String(v).trim()), LIMITES_CORTE.margemFitaMax, 'Margem da fita');
  const modo = segmentado(
    Object.entries(MODOS_CORTE).map(([v, m]) => [v, m.nome]),
    ajustes.modo,
    (v) => {
      ajustes = { ...ajustes, modo: v };
      descricaoModo.textContent = MODOS_CORTE[v].descricao;
      alterou();
    },
    { rotulo: 'Modo de corte' },
  );
  const cartaoAjustes = h(
    'section',
    { class: 'cartao corte-cartao-ajustes' },
    h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Serra e corte')),
    h(
      'div',
      { class: 'corte-grade-3' },
      campo('Espessura da serra (mm)', serra, { dica: 'Confira no disco da sua serra.' }),
      campo('Refilo (mm por borda)', refilo, { dica: 'Tira as bordas da chapa.' }),
      campo('Margem da fita (%)', margem, { dica: 'Sobra para aplicar.' }),
    ),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Prioridade'), modo, descricaoModo),
  );

  // ------------------------------------------------------------ Resultado
  const botaoCalcular = h('button', { type: 'button', class: 'botao botao-primario botao-grande corte-calcular' }, icone('serra'), h('span', {}, 'Calcular plano de corte'));
  const areaResultado = h('div', { class: 'corte-resultado' });

  async function calcular() {
    if (calculando) return;
    if (!pecas.length) return aviso('Adicione as peças primeiro.', 'erro');
    if (pecas.some((p) => !chapasPorId.has(p.chapa_id))) return aviso('Escolha a chapa de todas as peças (as marcadas em vermelho).', 'erro');
    calculando = true;
    botaoCalcular.disabled = true;
    botaoCalcular.setAttribute('aria-busy', 'true');
    substituir(botaoCalcular, icone('serra', 'icone corte-girando'), h('span', {}, 'Calculando…'));
    try {
      const novo = await calcularNoWorker({ pecas, chapas, ajustes, tempoMaximoMs: 2500 });
      sujo = true; // garante que a lista vai junto com o resultado
      const ok = await salvarAgora({ resultado: novo });
      if (ok) {
        aviso(novo.nao_cabem.length ? 'Plano calculado. Algumas peças não cabem na chapa escolhida.' : 'Plano calculado.', novo.nao_cabem.length ? 'erro' : 'sucesso');
        desenharResultado();
        areaResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (erro) {
      avisoErro(erro);
    } finally {
      calculando = false;
      botaoCalcular.disabled = false;
      botaoCalcular.removeAttribute('aria-busy');
      substituir(botaoCalcular, icone('serra'), h('span', {}, 'Calcular plano de corte'));
    }
  }
  botaoCalcular.addEventListener('click', calcular);

  const indicador = (rotulo, valor, detalhe) => h('div', { class: 'corte-indicador' }, h('small', {}, rotulo), h('strong', {}, valor), detalhe ? h('span', { class: 'suave' }, detalhe) : null);

  function desenharResultado() {
    const valido = resultadoValido();
    const vista = { pecas, chapas, fitas, ajustes, resultado: valido };
    const resumo = resumirPlano(vista);
    const fitaTotal = resumo.fitas.reduce((t, f) => t + f.metros_com_margem, 0);
    const custo = resumo.custo_chapas_cents + resumo.custo_fitas_cents;
    const partes = [];
    if (!pecas.length) {
      substituir(areaResultado);
      return;
    }
    if (!valido) {
      partes.push(
        h(
          'p',
          { class: 'config-informacao corte-aviso' },
          h('span', { class: 'config-info-icone' }, icone('serra')),
          resultado || plano.resultado_desatualizado
            ? 'A lista ou os ajustes mudaram desde o último cálculo. Calcule de novo para ver as chapas.'
            : 'Quando a lista estiver pronta, toque em "Calcular plano de corte".',
        ),
      );
    }
    partes.push(
      h(
        'section',
        { class: 'cartao corte-resumo' },
        h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Resumo'), valido && plano.calculado_em ? h('small', { class: 'suave' }, `calculado ${haQuanto(plano.calculado_em)}`) : null),
        h(
          'div',
          { class: 'corte-indicadores' },
          indicador('Chapas', valido ? contagem(resumo.total_chapas) : '—', valido ? `${String(resumo.aproveitamento).replace('.', ',')}% aproveitado` : 'calcule para saber'),
          indicador('Peças', contagem(resumo.total_pecas), plural(pecas.length, 'linha', 'linhas')),
          indicador('Fita de borda', fitaTotal ? formatarMetros(fitaTotal) : '—', fitaTotal && ajustes.margem_fita_pct ? `com ${ajustes.margem_fita_pct}% de margem` : ''),
          indicador(
            'Material',
            valido ? formatarDinheiro(custo) : resumo.custo_fitas_cents ? `${formatarDinheiro(resumo.custo_fitas_cents)}+` : '—',
            valido && plano.orcamento_total_cents && custo
              ? `${String(Math.round((custo / plano.orcamento_total_cents) * 1000) / 10).replace('.', ',')}% do orçamento`
              : valido
                ? 'chapas + fita'
                : 'só a fita, até calcular',
          ),
        ),
        valido || resumo.fitas.length
          ? h(
              'div',
              { class: 'corte-compras' },
              h('h3', {}, 'Para comprar'),
              h(
                'ul',
                {},
                valido
                  ? resumo.materiais
                      .filter((m) => m.folhas)
                      .map((m) =>
                        h(
                          'li',
                          {},
                          h('span', {}, `${m.nome}${m.espessura_mm ? ` ${m.espessura_mm} mm` : ''}`),
                          h('strong', {}, plural(m.folhas, 'chapa', 'chapas')),
                          h('span', { class: 'suave' }, m.custo_cents ? formatarDinheiro(m.custo_cents) : 'sem preço'),
                        ),
                      )
                  : null,
                resumo.fitas.map((f) =>
                  h('li', {}, h('span', {}, f.nome), h('strong', {}, formatarMetros(f.metros_com_margem)), h('span', { class: 'suave' }, f.custo_cents ? formatarDinheiro(f.custo_cents) : 'sem preço')),
                ),
              ),
              h('p', { class: 'suave pequeno' }, 'Só você vê estes valores. Preços vêm de Ajustes → Chapas e fitas.'),
            )
          : null,
      ),
    );
    if (valido?.nao_cabem.length) {
      const numeros = new Map(expandirPecas(pecas).map((i) => [`${i.indice}:${i.copia}`, i.numero]));
      partes.push(
        h(
          'p',
          { class: 'config-informacao corte-aviso corte-aviso-erro' },
          h('span', { class: 'config-info-icone' }, icone('alerta')),
          `Não cabem na chapa (nem girando, quando o veio permite): ${valido.nao_cabem.map((p) => `nº ${numeros.get(`${p.indice}:${p.copia}`)}`).join(', ')}. Confira as medidas ou escolha outra chapa.`,
        ),
      );
    }
    if (valido) {
      const detalhes = detalharChapas(vista);
      partes.push(h('div', { class: 'corte-chapas' }, detalhes.map((d) => cartaoChapa(d, detalhes.length, vista))));
    }
    substituir(areaResultado, partes);
  }

  // ------------------------------------------------------------ Ações
  const renomear = async () => {
    const novoNome = await abrirModal('Renomear plano', (fechar) => {
      const entrada = h('input', { type: 'text', value: nome, maxlength: '150', required: true, autofocus: true });
      return h(
        'form',
        { class: 'formulario', onsubmit: (e) => { e.preventDefault(); fechar(entrada.value.trim()); } },
        campo('Nome', entrada),
        h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario' }, 'Salvar')),
      );
    });
    if (!novoNome) return;
    nome = novoNome;
    tituloEl.textContent = nome;
    alterou();
  };

  const baixarPdf = async () => {
    if (!(await salvarAgora())) return;
    try {
      const blob = await baixarBlob(`/planos-corte/${planoId}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = h('a', { href: url, download: `plano-de-corte-${planoId}.pdf` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (erro) {
      avisoErro(erro);
    }
  };

  const exportarCsv = () => {
    const campoCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Móvel', 'Peça', 'Comprimento (mm)', 'Largura (mm)', 'Quantidade', 'Chapa', 'Espessura (mm)', 'Segue o veio', 'Fita', 'C1', 'C2', 'L1', 'L2']];
    for (const p of pecas) {
      const chapa = chapasPorId.get(p.chapa_id);
      const fita = fitasPorId.get(p.fita_id);
      linhas.push([
        p.grupo,
        p.descricao,
        p.comprimento_mm,
        p.largura_mm,
        p.quantidade,
        chapa?.nome || '',
        chapa?.espessura_mm || '',
        p.veio ? 'sim' : 'não',
        fita?.nome || '',
        ...LADOS_FITA.map(([k]) => (fita && p[k] ? 'sim' : '')),
      ]);
    }
    const blob = new Blob([`﻿${linhas.map((l) => l.map(campoCsv).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `pecas-plano-${planoId}.csv` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const excluir = async () => {
    if (!(await confirmar('Excluir este plano de corte? A lista de peças e o cálculo serão apagados. O orçamento não muda.', { sim: 'Excluir plano', perigo: true }))) return;
    try {
      clearTimeout(temporizador);
      sujo = false;
      await api.delete(`/planos-corte/${planoId}`);
      aviso('Plano excluído.');
      irPara('#/corte');
    } catch (erro) {
      avisoErro(erro);
    }
  };

  const tituloEl = h('span', {}, nome);
  const cabecalho = cabecalhoInterno(tituloEl, {
    voltar: plano.orcamento_id ? `#/orcamentos/${plano.orcamento_id}` : '#/corte',
    retorno: plano.orcamento_id ? 'Orçamento' : 'Planos de corte',
    contexto: 'PLANO DE CORTE',
    subtitulo: plano.orcamento_id ? 'Uso interno: o cliente não vê este plano.' : 'Plano avulso, só para uso interno.',
    acoes: [
      h('button', { type: 'button', class: 'botao so-computador', onclick: baixarPdf }, icone('pdf'), 'PDF para a serra'),
      menuSuspenso(
        [
          ['pdf', 'Baixar PDF para a serra', baixarPdf],
          ['baixar', 'Exportar peças (CSV)', exportarCsv],
          ['editar', 'Renomear plano', renomear],
          ['area', 'Chapas e fitas', () => irPara('#/config/chapas')],
          plano.orcamento_id ? ['orcamentos', 'Abrir orçamento', () => irPara(`#/orcamentos/${plano.orcamento_id}`)] : null,
          '-',
          ['lixeira', 'Excluir plano', excluir, { perigo: true }],
        ].filter(Boolean),
        { rotulo: 'Ações do plano' },
      ),
    ],
  });

  desenharPecas();
  desenharResultado();

  return h(
    'div',
    { class: 'pagina pagina-interna pagina-corte' },
    cabecalho,
    !chapas.some((c) => c.ativo)
      ? h(
          'p',
          { class: 'config-informacao corte-aviso corte-aviso-erro' },
          h('span', { class: 'config-info-icone' }, icone('alerta')),
          'Nenhuma chapa cadastrada. ',
          h('a', { href: '#/config/chapas' }, 'Cadastre suas chapas'),
          ' para montar o plano.',
        )
      : null,
    h('div', { class: 'corte-colunas' }, h('div', { class: 'corte-coluna-pecas' }, cartaoPecas, cartaoAjustes, h('div', { class: 'acao-interna-fixa corte-acao' }, botaoCalcular)), areaResultado),
  );
}

/** Abre (ou cria) o plano de corte de um orçamento. */
export async function abrirPlanoDoOrcamento(orcamentoId) {
  try {
    const plano = await api.post('/planos-corte', { orcamento_id: orcamentoId });
    irPara(`#/corte/${plano.id}`);
  } catch (erro) {
    avisoErro(erro);
  }
}

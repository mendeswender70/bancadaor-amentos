import { formatarDinheiro, formatarNumero } from '/shared/calc.js';
import { api } from '../api.js';
import { h, icone, substituir, vazioIlustrado, haQuanto, diasAte } from '../ui.js';
import { cabecalhoPagina } from '../comum.js';
import { novidades } from '../novidades.js';

const CHAVE_AVISOS_LIDAS = 'esquadro.avisos.lidas';
const CHAVE_NOVIDADES_LIDAS = 'esquadro.novidades.lidas';

function lerIds(chave) {
  try {
    const dados = JSON.parse(localStorage.getItem(chave) || '[]');
    return new Set(Array.isArray(dados) ? dados : []);
  } catch {
    return new Set();
  }
}

const idAviso = (a) => `${a.motivo}:${a.id}:${a.quando}`;

function detalheAviso(a) {
  switch (a.motivo) {
    case 'aprovado':
      return ['check', 'Proposta aprovada', `${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`];
    case 'visto':
      return ['olho', 'Cliente abriu sua proposta', `${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`];
    case 'vence': {
      const dias = diasAte(a.data_validade);
      return ['historico', `Proposta vence ${dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}`, `${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`];
    }
    case 'sem_resposta':
      return ['historico', 'Lembrete de acompanhamento', `${a.cliente_nome} · Nº ${formatarNumero(a.numero)} · enviado há pelo menos 5 dias`];
    case 'rascunho':
      return ['editar', 'Rascunho esperando continuação', `${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`];
    default:
      return ['sino', 'Aviso sobre uma proposta', `${a.cliente_nome} · Nº ${formatarNumero(a.numero)}`];
  }
}

export async function paginaAvisos() {
  const dados = await api.get('/dashboard');
  const avisos = dados.atencao || [];
  const avisosLidos = lerIds(CHAVE_AVISOS_LIDAS);
  const novidadesLidas = lerIds(CHAVE_NOVIDADES_LIDAS);
  let naoLidos = avisos.filter((a) => !avisosLidos.has(idAviso(a))).length;
  const conteudo = h('div', { class: 'central-avisos-conteudo' });
  let aba = 'avisos';
  let novidadeAberta = null;

  const abaAvisos = h('button', { type: 'button', class: 'ativo', role: 'tab', 'aria-selected': 'true', onclick: () => trocarAba('avisos') }, `Avisos${naoLidos ? ` · ${naoLidos}` : ''}`);
  const abaNovidades = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => trocarAba('novidades') }, 'Novidades');
  const abas = h('div', { class: 'abas-editor central-avisos-abas', role: 'tablist', 'aria-label': 'Avisos e novidades' }, abaAvisos, abaNovidades);
  const acao = h('button', { type: 'button', class: 'botao botao-pequeno botao-marcar-avisos', onclick: marcarTodos }, 'Marcar tudo como lido');

  function renderAvisos() {
    const novos = avisos.filter((a) => !avisosLidos.has(idAviso(a)));
    const anteriores = avisos.filter((a) => avisosLidos.has(idAviso(a)));
    const grupo = (titulo, linhas) => linhas.length
      ? h('section', { class: 'grupo-avisos' }, h('h2', {}, titulo === 'Novos' ? `${titulo} · ${linhas.length}` : titulo), h('div', { class: 'lista-avisos' }, linhas.map((a) => {
          const [iconeNome, tituloAviso, detalhe] = detalheAviso(a);
          const id = idAviso(a);
          const tempo = haQuanto(a.quando);
          return h(
            'a',
            { href: `#/orcamentos/${a.id}`, class: `cartao-aviso-feed${avisosLidos.has(id) ? '' : ' nao-lido'}`, onclick: () => marcarUm(id) },
            h('span', { class: 'aviso-feed-icone' }, icone(iconeNome)),
            h('span', { class: 'aviso-feed-texto' },
              h('strong', {}, tituloAviso),
              h('span', { class: 'aviso-feed-detalhe' }, detalhe),
              h('span', { class: 'aviso-feed-link' }, `${tempo.charAt(0).toUpperCase()}${tempo.slice(1)} · Ver proposta →`),
            ),
            avisosLidos.has(id) ? null : h('span', { class: 'aviso-feed-ponto', 'aria-label': 'Não lido' }),
          );
        })))
      : null;

    substituir(conteudo,
      avisos.length
        ? h('div', { class: 'avisos-feed' }, grupo('Novos', novos), grupo('Anteriores', anteriores))
        : vazioIlustrado('sino', 'Tudo em dia', 'Quando chegar um novo aviso, você vai encontrá-lo aqui.'),
    );
  }

  function renderNovidades() {
    if (novidadeAberta) {
      const n = novidadeAberta;
      substituir(conteudo,
        h('section', { class: 'detalhe-novidade' },
          h('button', { type: 'button', class: 'botao botao-pequeno botao-voltar-novidades', onclick: () => { novidadeAberta = null; renderNovidades(); } }, icone('voltar'), 'Voltar às novidades'),
          h('span', { class: 'novidade-data' }, n.data),
          h('h2', {}, 'O que mudou'),
          h('h3', {}, n.titulo),
          h('p', {}, n.itens[0] || ''),
          n.itens.length > 1 ? h('ul', {}, n.itens.slice(1).map((item) => h('li', {}, item))) : null,
        ),
      );
      return;
    }
    const grupos = new Map();
    for (const n of novidades) {
      if (!grupos.has(n.data)) grupos.set(n.data, []);
      grupos.get(n.data).push(n);
    }
    const dataCurta = (data) => data.replace(/^(\d+) de (\S+) de (\d+)$/, (_, dia, mes, ano) => `${dia} ${mes.slice(0, 3)} ${ano}`).toLocaleUpperCase('pt-BR');
    substituir(conteudo, novidades.length
      ? h('div', { class: 'lista-novidades pagina-novidades' }, [...grupos].map(([data, lista]) =>
        h('section', { class: 'novidades-grupo' }, h('h2', {}, data),
          lista.map((n) => h('article', { class: 'novidade' },
            h('time', { class: 'novidade-data' }, `${dataCurta(n.data)}${novidadesLidas.has(n.id) ? '' : ' · NOVO'}`),
            h('h3', {}, n.titulo), h('p', {}, n.itens[0] || ''),
            h('button', { type: 'button', class: 'link-botao', onclick: () => { novidadeAberta = n; marcarNovidade(n.id); renderNovidades(); } }, 'Ver os detalhes →'),
          )),
        ),
      ))
      : vazioIlustrado('sino', 'Tudo em dia', 'As melhorias do esquadro aparecem aqui.'),
    );
  }

  function atualizarAbas() {
    abaAvisos.classList.toggle('ativo', aba === 'avisos');
    abaNovidades.classList.toggle('ativo', aba === 'novidades');
    abaAvisos.setAttribute('aria-selected', String(aba === 'avisos'));
    abaNovidades.setAttribute('aria-selected', String(aba === 'novidades'));
    abaAvisos.textContent = `Avisos${naoLidos ? ` · ${naoLidos}` : ''}`;
    acao.hidden = aba !== 'avisos' || naoLidos === 0;
  }

  function trocarAba(nova) {
    aba = nova;
    novidadeAberta = null;
    const pagina = conteudo.closest('.pagina-avisos');
    pagina?.classList.toggle('pagina-avisos--novidades', aba === 'novidades');
    cabecalho.querySelector('.avisos-titulo-mobile').textContent = aba === 'novidades' ? 'Novidades' : 'Avisos';
    cabecalho.querySelector('.avisos-subtitulo-mobile').textContent = aba === 'novidades' ? 'Pequenas melhorias para acompanhar sua marcenaria.' : 'Acompanhe o que mudou nos seus orçamentos.';
    atualizarAbas();
    if (aba === 'avisos') renderAvisos();
    else renderNovidades();
  }

  function marcarUm(id) {
    avisosLidos.add(id);
    naoLidos = avisos.filter((a) => !avisosLidos.has(idAviso(a))).length;
    try { localStorage.setItem(CHAVE_AVISOS_LIDAS, JSON.stringify([...avisosLidos])); } catch { /* armazenamento opcional */ }
    window.dispatchEvent(new Event('esquadro:avisos-lidos'));
  }

  function marcarTodos() {
    for (const aviso of avisos) avisosLidos.add(idAviso(aviso));
    naoLidos = 0;
    try { localStorage.setItem(CHAVE_AVISOS_LIDAS, JSON.stringify([...avisosLidos])); } catch { /* armazenamento opcional */ }
    window.dispatchEvent(new Event('esquadro:avisos-lidos'));
    atualizarAbas();
    renderAvisos();
  }

  function marcarNovidade(id) {
    novidadesLidas.add(id);
    try { localStorage.setItem(CHAVE_NOVIDADES_LIDAS, JSON.stringify([...novidadesLidas])); } catch { /* armazenamento opcional */ }
    window.dispatchEvent(new Event('esquadro:avisos-lidos'));
  }

  atualizarAbas();
  renderAvisos();

  const cabecalho = cabecalhoPagina(
    h('span', {},
      h('span', { class: 'avisos-titulo-mobile' }, 'Avisos'),
      h('span', { class: 'avisos-titulo-desktop' }, 'Notificações'),
    ),
    { subtitulo: h('span', {},
      h('span', { class: 'avisos-subtitulo-mobile' }, 'Acompanhe o que mudou nos seus orçamentos.'),
      h('span', { class: 'avisos-subtitulo-desktop' }, 'Acompanhe as respostas dos clientes e as novidades do sistema.'),
    ) },
  );
  cabecalho.querySelector('.titulos').prepend(h('span', { class: 'page-eyebrow avisos-eyebrow-desktop' }, 'ESQUADRO · CENTRAL DE ATIVIDADE'));
  const controles = h('div', { class: 'central-avisos-controles' }, abas, h('div', { class: 'central-avisos-acoes' }, acao));
  const resumoNovidades = h('aside', { class: 'avisos-resumo-novidades' },
    h('span', { class: 'page-eyebrow' }, 'NOVIDADES'),
    h('h2', {}, 'O Esquadro continua melhorando.'),
    h('p', {}, 'Veja lembretes, aprovações e outros ajustes recentes.'),
    h('button', { type: 'button', class: 'botao botao-pequeno', onclick: () => trocarAba('novidades') }, 'Ver novidades ', icone('seta', 'icone icone-mini')),
  );

  return h('div', { class: 'pagina pagina-avisos' },
    h('a', { href: '#/', class: 'avisos-voltar', 'aria-label': 'Voltar para o início' }, icone('voltar')),
    cabecalho,
    controles,
    conteudo,
    resumoNovidades,
  );
}

// esquadro · produção: entrada, casca com as abas e as páginas Trabalhos,
// Retalhos e Ajustes. O plano e o modo de corte ficam em plano.js e serra.js.
import { formatarMm } from '/shared/corte.js';
import { api, quandoPerderSessao } from '/js/api.js';
import { h, icone, substituir, aviso, avisoErro, abrirModal, campo, confirmar, carregando, vazioIlustrado, haQuanto, iniciais, segmentado } from '/js/ui.js';
import { sessao, ehEscritorio, seloSituacao, plural, nomeChapa, irPara, pegarVerificacao, limparVerificacao, progresso, pedirNome, ultimoLocal, guardarLocal } from './nucleo.js';
import { paginaPlano } from './plano.js';
import { abrirSerra } from './serra.js';

const raiz = document.getElementById('app');
let conteudo = null;
let abas = null;

// ------------------------------------------------------------------ Entrada

async function iniciar() {
  const estado = await api.get('/auth/estado');
  if (!estado.usuario) return telaEntrar();
  const inicio = await api.get('/producao/inicio');
  Object.assign(sessao, inicio);
  montarCasca();
  await rotear();
}

function telaEntrar() {
  sessao.usuario = null;
  conteudo = null;
  const usuario = h('input', { id: 'p-usuario', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, placeholder: 'ex.: joao.silva' });
  const senha = h('input', { id: 'p-senha', type: 'password', autocomplete: 'current-password', required: true, placeholder: '••••••••' });
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande botao-largo' }, 'Entrar');
  substituir(
    raiz,
    h(
      'main',
      { class: 'p-acesso' },
      h(
        'div',
        { class: 'p-acesso-cartao' },
        marca(),
        h('h1', {}, 'Bom trabalho'),
        h('p', {}, 'Entre com o usuário que o escritório criou para você.'),
        h(
          'form',
          {
            class: 'formulario',
            onsubmit: async (e) => {
              e.preventDefault();
              botao.disabled = true;
              botao.textContent = 'Entrando…';
              try {
                await api.post('/auth/entrar', { email: usuario.value, senha: senha.value });
                await iniciar();
              } catch (erro) {
                avisoErro(erro);
                botao.disabled = false;
                botao.textContent = 'Entrar';
              }
            },
          },
          campo('Usuário', usuario),
          campo('Senha', senha),
          botao,
        ),
      ),
    ),
  );
}

quandoPerderSessao(() => {
  if (!sessao.usuario) return;
  aviso('Sua sessão terminou. Entre de novo.', 'erro');
  telaEntrar();
});

function marca() {
  return h('a', { href: '#/', class: 'p-marca' }, h('img', { src: '/icons/esquadro.svg', alt: '' }), h('span', {}, h('strong', {}, 'esquadro'), h('span', {}, 'produção')));
}

// ------------------------------------------------------------------- Casca

function montarCasca() {
  conteudo = h('main', { class: 'p-conteudo', id: 'conteudo' });
  abas = h(
    'nav',
    { class: 'p-abas', 'aria-label': 'Seções' },
    h('a', { href: '#/', 'data-rota': 'trabalhos' }, icone('serra'), 'Trabalhos'),
    h('a', { href: '#/retalhos', 'data-rota': 'retalhos' }, icone('caixa'), 'Retalhos'),
    h('a', { href: '#/ajustes', 'data-rota': 'ajustes' }, icone('config'), 'Ajustes'),
  );
  substituir(
    raiz,
    h(
      'div',
      { class: 'p-casca' },
      h('header', { class: 'p-topo' }, marca(), h('a', { href: '#/ajustes', class: 'p-avatar', title: sessao.usuario.nome, 'aria-label': 'Minha conta' }, iniciais(sessao.usuario.nome))),
      conteudo,
      abas,
    ),
  );
}

function marcarAba(rota) {
  for (const a of abas.querySelectorAll('a')) {
    const ativo = a.dataset.rota === rota;
    a.classList.toggle('ativo', ativo);
    if (ativo) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

let hashAtual = location.hash;
let ignorar = false;
let sequencia = 0;

async function rotear() {
  if (!sessao.usuario || !conteudo) return;
  if (ignorar) {
    ignorar = false;
    return;
  }
  const verificar = pegarVerificacao();
  if (verificar && !(await verificar())) {
    ignorar = true;
    location.hash = hashAtual;
    return;
  }
  limparVerificacao();
  hashAtual = location.hash;
  const minha = ++sequencia;
  const [caminho, busca = ''] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(busca);
  let m;
  try {
    if ((m = /^\/plano\/(\d+)\/cortar$/.exec(caminho))) {
      await abrirSerra(Number(m[1]));
      return;
    }
    let pagina;
    let aba = 'trabalhos';
    if ((m = /^\/plano\/(\d+)$/.exec(caminho))) pagina = paginaPlano(Number(m[1]), params);
    else if (caminho === '/retalhos') {
      aba = 'retalhos';
      pagina = paginaRetalhos(params);
    } else if (caminho === '/ajustes') {
      aba = 'ajustes';
      pagina = paginaAjustes();
    } else pagina = paginaTrabalhos(params);
    marcarAba(aba);
    conteudo.setAttribute('aria-busy', 'true');
    const el = await pagina;
    if (minha !== sequencia) return;
    substituir(conteudo, el);
    window.scrollTo(0, 0);
  } catch (erro) {
    if (erro.status === 401) return;
    if (minha === sequencia) substituir(conteudo, vazioIlustrado('alerta', 'Não foi possível abrir', erro.message, h('a', { href: '#/', class: 'botao' }, 'Voltar aos trabalhos')));
  } finally {
    conteudo?.removeAttribute('aria-busy');
  }
}
window.addEventListener('hashchange', rotear);
window.addEventListener('beforeunload', (e) => {
  const verificar = pegarVerificacao();
  if (verificar?.sincrono?.() === false) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// --------------------------------------------------------------- Trabalhos

async function paginaTrabalhos(params) {
  const concluidos = params.get('ver') === 'concluidos';
  const funcionario = params.get('funcionario') || '';
  const busca = new URLSearchParams();
  if (concluidos) busca.set('concluidos', '1');
  if (funcionario) busca.set('funcionario', funcionario);
  const planos = await api.get(`/producao/planos?${busca}`);
  const atualizar = (mudanca) => {
    const novos = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) novos.set(k, v);
      else novos.delete(k);
    }
    irPara(`#/?${novos}`);
  };
  const novo = async () => {
    const nome = await pedirNome('Novo plano de corte', '', 'Ex.: Nicho do escritório');
    if (!nome) return;
    try {
      const plano = await api.post('/producao/planos', { nome });
      irPara(`#/plano/${plano.id}`);
    } catch (erro) {
      avisoErro(erro);
    }
  };
  const primeiroNome = sessao.usuario.nome.trim().split(/\s+/)[0];
  return h(
    'div',
    {},
    h(
      'header',
      { class: 'p-cabecalho' },
      h('div', {}, h('span', { class: 'p-eyebrow' }, ehEscritorio() ? 'Produção' : `Olá, ${primeiroNome}`), h('h1', {}, ehEscritorio() ? 'Trabalhos da oficina' : 'Seus trabalhos')),
    ),
    h(
      'div',
      { class: 'p-filtros' },
      segmentado(
        [
          ['', 'Em andamento'],
          ['concluidos', 'Concluídos'],
        ],
        concluidos ? 'concluidos' : '',
        (v) => atualizar({ ver: v }),
        { rotulo: 'Mostrar' },
      ),
      ehEscritorio() && sessao.funcionarios.length
        ? h(
            'select',
            { 'aria-label': 'Funcionário', onchange: (e) => atualizar({ funcionario: e.target.value }) },
            h('option', { value: '' }, 'Toda a equipe'),
            sessao.funcionarios.map((f) => h('option', { value: String(f.id), selected: String(f.id) === funcionario }, f.nome)),
          )
        : null,
    ),
    planos.length
      ? h('div', { class: 'p-trabalhos' }, planos.map(cartaoTrabalho))
      : vazioIlustrado(
          'serra',
          concluidos ? 'Nada concluído ainda' : 'Nenhum trabalho em aberto',
          concluidos ? 'Os planos cortados até o fim aparecem aqui.' : 'Quando o escritório mandar um trabalho, ele aparece aqui. Você também pode montar um plano por conta própria.',
        ),
    concluidos ? null : h('button', { type: 'button', class: 'botao botao-primario botao-grande p-novo-fixo', onclick: novo }, icone('mais'), 'Novo plano'),
  );
}

function cartaoTrabalho(p) {
  const meta = [
    h('span', {}, h('strong', {}, plural(p.pecas, 'peça', 'peças'))),
    p.chapas ? h('span', {}, plural(p.chapas, 'chapa', 'chapas')) : null,
    p.retalhos ? h('span', {}, plural(p.retalhos, 'retalho', 'retalhos')) : null,
    h('span', {}, p.concluido_em ? `concluído ${haQuanto(p.concluido_em)}` : `mexido ${haQuanto(p.atualizado_em)}`),
    ehEscritorio() && p.funcionario_nome ? h('span', {}, `com ${p.funcionario_nome}`) : null,
  ];
  return h(
    'a',
    { href: `#/plano/${p.id}`, class: 'p-trabalho' },
    h(
      'div',
      { class: 'p-trabalho-topo' },
      seloSituacao(p),
      h('span', { class: 'p-trabalho-origem' }, p.atribuido ? `do escritório${p.criado_por_nome ? ` · ${p.criado_por_nome}` : ''}` : 'plano próprio'),
    ),
    h('h2', {}, p.nome),
    p.instrucoes ? h('p', { class: 'p-trabalho-instrucoes' }, h('span', {}, p.instrucoes)) : null,
    p.situacao === 'cortando' && p.passos ? h('div', { class: 'p-progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(p.passos), 'aria-valuenow': String(p.passo) }, progresso(p.passo / p.passos)) : null,
    h('div', { class: 'p-trabalho-meta' }, meta),
  );
}


// ---------------------------------------------------------------- Retalhos

async function paginaRetalhos(params) {
  const situacao = params.get('ver') === 'reservados' ? 'reservado' : 'disponivel';
  const [retalhos, chapas] = await Promise.all([api.get(`/producao/retalhos?situacao=${situacao}`), api.get('/producao/chapas')]);
  const recarregar = () => irPara(`#/retalhos?${new URLSearchParams({ ver: situacao === 'reservado' ? 'reservados' : '', t: Date.now() })}`);
  const grupos = new Map();
  for (const r of retalhos) {
    const chave = `${r.chapa_nome} ${r.espessura_mm} mm`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(r);
  }
  const editar = async (r) => {
    const salvo = await abrirModal(r ? `Retalho R${r.id}` : 'Guardar retalho', (fechar) => formularioRetalho(r, chapas, fechar), { contexto: 'Retalhos' });
    if (salvo) recarregar();
  };
  return h(
    'div',
    {},
    h('header', { class: 'p-cabecalho' }, h('div', {}, h('span', { class: 'p-eyebrow' }, 'Estoque da oficina'), h('h1', {}, 'Retalhos'), h('p', {}, 'Sobras guardadas. O cálculo usa um retalho antes de abrir chapa nova.'))),
    h(
      'div',
      { class: 'p-filtros' },
      segmentado(
        [
          ['disponivel', 'Disponíveis'],
          ['reservado', 'Reservados'],
        ],
        situacao,
        (v) => irPara(`#/retalhos?ver=${v === 'reservado' ? 'reservados' : ''}`),
        { rotulo: 'Mostrar' },
      ),
    ),
    retalhos.length
      ? [...grupos].map(([nome, lista]) =>
          h(
            'section',
            { class: 'p-retalhos-grupo' },
            h('h2', {}, nome, h('small', {}, plural(lista.length, 'retalho', 'retalhos'))),
            lista.map((r) => linhaRetalho(r, () => editar(r))),
          ),
        )
      : vazioIlustrado(
          'caixa',
          situacao === 'reservado' ? 'Nenhum retalho reservado' : 'Nenhum retalho guardado',
          situacao === 'reservado' ? 'Retalhos usados por um plano calculado aparecem aqui até o corte terminar.' : 'No fim de cada chapa, o modo de corte pergunta se você quer guardar as sobras boas.',
        ),
    situacao === 'disponivel' ? h('button', { type: 'button', class: 'botao botao-primario botao-grande p-novo-fixo', onclick: () => editar(null), disabled: !chapas.length }, icone('mais'), 'Guardar retalho') : null,
  );
}

function linhaRetalho(r, aoTocar) {
  const maior = Math.max(r.comprimento_mm, r.largura_mm);
  const forma = h('span', {});
  forma.style.width = `${Math.max(10, Math.round((r.comprimento_mm / maior) * 60))}px`;
  forma.style.height = `${Math.max(6, Math.round((r.largura_mm / maior) * 40))}px`;
  return h(
    'button',
    { type: 'button', class: 'p-retalho', onclick: aoTocar },
    h('span', { class: 'p-retalho-forma', 'aria-hidden': 'true' }, forma),
    h(
      'span',
      {},
      h('strong', {}, `${formatarMm(r.comprimento_mm)} × ${formatarMm(r.largura_mm)}`),
      h('small', {}, [r.local || 'sem local', r.situacao === 'reservado' && r.plano_nome ? `reservado: ${r.plano_nome}` : `guardado ${haQuanto(r.criado_em)}${r.criado_por_nome ? ` por ${r.criado_por_nome}` : ''}`].join(' · ')),
    ),
    h('span', { class: 'p-retalho-id' }, `R${r.id}`),
  );
}

function formularioRetalho(r, chapas, fechar) {
  const chapa = h('select', {}, chapas.filter((c) => c.ativo || c.id === r?.chapa_id).map((c) => h('option', { value: String(c.id), selected: c.id === r?.chapa_id }, nomeChapa(c))));
  const comprimento = h('input', { type: 'text', inputmode: 'numeric', value: r ? String(r.comprimento_mm) : '', placeholder: 'mm' });
  const largura = h('input', { type: 'text', inputmode: 'numeric', value: r ? String(r.largura_mm) : '', placeholder: 'mm' });
  const local = h('input', { type: 'text', maxlength: '80', value: r?.local || ultimoLocal(), placeholder: 'Ex.: prateleira A' });
  const reservado = r?.situacao === 'reservado';
  const corpo = () => ({ chapa_id: Number(chapa.value), comprimento_mm: Number(comprimento.value), largura_mm: Number(largura.value), local: local.value });
  const salvar = async (extra = {}) => {
    try {
      if (r) await api.put(`/producao/retalhos/${r.id}`, { ...corpo(), ...extra });
      else await api.post('/producao/retalhos', corpo());
      guardarLocal(local.value);
      aviso(extra.situacao === 'descartado' ? 'Retalho descartado.' : 'Retalho salvo.');
      fechar(true);
    } catch (erro) {
      avisoErro(erro);
    }
  };
  return h(
    'form',
    { class: 'formulario', onsubmit: (e) => (e.preventDefault(), salvar()) },
    reservado ? h('p', { class: 'p-alerta info' }, icone('cadeado'), h('span', {}, `Reservado para "${r.plano_nome || 'um plano'}". Ele volta para o estoque se o plano for calculado sem ele.`)) : null,
    campo('Chapa', chapa),
    h('div', { class: 'grade-2' }, campo('Comprimento (mm)', comprimento, { dica: 'No sentido do veio' }), campo('Largura (mm)', largura)),
    campo('Onde está guardado', local),
    reservado
      ? null
      : h(
          'div',
          { class: 'acoes-modal' },
          r ? h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: async () => (await confirmar('Descartar este retalho? Ele sai do estoque.', { sim: 'Descartar', perigo: true })) && salvar({ situacao: 'descartado' }) }, 'Descartar') : null,
          h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, r ? 'Salvar' : 'Guardar retalho'),
        ),
  );
}


// ----------------------------------------------------------------- Ajustes

async function paginaAjustes() {
  const [config, chapas, fitas] = await Promise.all([api.get('/producao/config'), api.get('/producao/chapas'), api.get('/producao/fitas')]);
  const recarregar = () => irPara(`#/ajustes?t=${Date.now()}`);
  const podeEditar = ehEscritorio();
  const campoNumero = (chave, rotulo, dica, decimal = false) => {
    const valor = decimal ? formatarMm(config[chave] / 10) : String(config[chave]);
    return campo(rotulo, h('input', { type: 'text', inputmode: decimal ? 'decimal' : 'numeric', name: chave, value: valor, disabled: !podeEditar }), { dica });
  };
  const formSerra = h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(formSerra));
        const corpo = {};
        for (const [k, v] of Object.entries(dados)) corpo[k] = k === 'serra_decimos_mm' ? Math.round(Number(String(v).replace(',', '.')) * 10) : Number(v);
        try {
          sessao.config = await api.put('/producao/config', corpo);
          aviso('Serra salva. Os próximos planos já usam estes valores.');
        } catch (erro) {
          avisoErro(erro);
        }
      },
    },
    h('div', { class: 'grade-2' }, campoNumero('serra_decimos_mm', 'Espessura do disco (mm)', 'Na dúvida, deixe um pouco a mais.', true), campoNumero('refilo_mm', 'Refilo (mm por borda)', 'Tira as bordas da chapa.')),
    h('div', { class: 'grade-2' }, campoNumero('guia_paralela_mm', 'Largura máx. na guia paralela (mm)', 'Baldan SE-3200/38: 900 mm.'), campoNumero('curso_carro_mm', 'Curso do carro (mm)', 'Baldan SE-3200/38: 3200 mm.')),
    h('div', { class: 'grade-2' }, campoNumero('sobra_min_largura_mm', 'Sobra mínima: largura (mm)'), campoNumero('sobra_min_comprimento_mm', 'Sobra mínima: comprimento (mm)')),
    podeEditar ? h('button', { type: 'submit', class: 'botao botao-primario' }, 'Salvar serra') : h('p', { class: 'dica' }, 'Só o escritório muda estes valores.'),
  );
  const novaMaterial = async (tipo) => {
    const salvo = await abrirModal(tipo === 'chapa' ? 'Nova chapa' : 'Nova fita de borda', (fechar) => formularioMaterial(tipo, fechar), { contexto: 'Materiais' });
    if (salvo) recarregar();
  };
  const tema = document.documentElement.dataset.temaPreferencia || 'sistema';
  return h(
    'div',
    { class: 'p-pilha' },
    h('header', { class: 'p-cabecalho' }, h('div', {}, h('span', { class: 'p-eyebrow' }, sessao.usuario.nome), h('h1', {}, 'Ajustes'))),
    h('section', { class: 'p-cartao' }, h('div', { class: 'p-titulo-cartao' }, h('h2', {}, 'A serra')), formSerra),
    h(
      'section',
      { class: 'p-cartao' },
      h('div', { class: 'p-titulo-cartao' }, h('h2', {}, 'Chapas'), h('button', { type: 'button', class: 'botao botao-pequeno', onclick: () => novaMaterial('chapa') }, icone('mais', 'icone icone-mini'), 'Nova')),
      chapas.length
        ? h('ul', { class: 'p-lista-simples' }, chapas.map((c) => h('li', {}, h('span', {}, h('strong', {}, nomeChapa(c)), h('small', {}, `${c.comprimento_mm} × ${c.largura_mm} mm${c.veio ? ' · com veio' : ''}${c.ativo ? '' : ' · inativa'}`)))))
        : h('p', { class: 'suave' }, 'Nenhuma chapa cadastrada.'),
      h('p', { class: 'dica' }, ehEscritorio() ? 'Preços e edição ficam no esquadro, em Ajustes → Chapas e fitas.' : 'O escritório completa os preços no esquadro.'),
    ),
    h(
      'section',
      { class: 'p-cartao' },
      h('div', { class: 'p-titulo-cartao' }, h('h2', {}, 'Fitas de borda'), h('button', { type: 'button', class: 'botao botao-pequeno', onclick: () => novaMaterial('fita') }, icone('mais', 'icone icone-mini'), 'Nova')),
      fitas.length ? h('ul', { class: 'p-lista-simples' }, fitas.map((f) => h('li', {}, h('span', {}, h('strong', {}, f.nome), h('small', {}, `${f.largura_mm} mm${f.ativo ? '' : ' · inativa'}`))))) : h('p', { class: 'suave' }, 'Nenhuma fita cadastrada.'),
    ),
    h(
      'section',
      { class: 'p-cartao' },
      h('div', { class: 'p-titulo-cartao' }, h('h2', {}, 'Aparência')),
      segmentado(
        [
          ['sistema', 'Do aparelho'],
          ['claro', 'Claro'],
          ['escuro', 'Escuro'],
        ],
        tema,
        aplicarTema,
        { rotulo: 'Tema' },
      ),
    ),
    h(
      'section',
      { class: 'p-cartao' },
      h('div', { class: 'p-titulo-cartao' }, h('h2', {}, 'Conta')),
      h('ul', { class: 'p-lista-simples' }, h('li', {}, h('span', {}, h('strong', {}, sessao.usuario.nome), h('small', {}, ehEscritorio() ? 'Escritório' : 'Produção')))),
      h(
        'div',
        { class: 'acoes-modal' },
        ehEscritorio() ? h('a', { href: '/', class: 'botao' }, 'Abrir o esquadro') : null,
        h('button', { type: 'button', class: 'botao', onclick: trocarSenha }, icone('cadeado'), 'Trocar senha'),
        h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: sair }, icone('sair'), 'Sair'),
      ),
    ),
  );
}

function aplicarTema(preferencia) {
  const escuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const tema = preferencia === 'sistema' ? (escuro ? 'escuro' : 'claro') : preferencia;
  document.documentElement.dataset.temaPreferencia = preferencia;
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#f3efe8' : '#110f0c');
  try {
    localStorage.setItem('esquadro.producao.tema', preferencia);
  } catch {
    /* Vale só nesta aba. */
  }
}
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if ((document.documentElement.dataset.temaPreferencia || 'sistema') === 'sistema') aplicarTema('sistema');
});

function formularioMaterial(tipo, fechar) {
  const nome = h('input', { type: 'text', required: true, maxlength: '100', placeholder: tipo === 'chapa' ? 'Ex.: MDF Branco TX' : 'Ex.: Fita branca TX' });
  const n = (valor, ph) => h('input', { type: 'text', inputmode: 'numeric', value: valor, placeholder: ph });
  const espessura = n('18', 'mm');
  const comprimento = n('', 'Ex.: 2750');
  const largura = n(tipo === 'chapa' ? '' : '22', tipo === 'chapa' ? 'Ex.: 1840' : 'mm');
  const veio = h('input', { type: 'checkbox' });
  return h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          if (tipo === 'chapa') {
            await api.post('/producao/chapas', { nome: nome.value, espessura_mm: Number(espessura.value), comprimento_mm: Number(comprimento.value), largura_mm: Number(largura.value), veio: veio.checked });
          } else {
            await api.post('/producao/fitas', { nome: nome.value, largura_mm: Number(largura.value) });
          }
          aviso(tipo === 'chapa' ? 'Chapa cadastrada.' : 'Fita cadastrada.');
          fechar(true);
        } catch (erro) {
          avisoErro(erro);
        }
      },
    },
    campo('Nome', nome),
    tipo === 'chapa'
      ? [
          h('div', { class: 'grade-3' }, campo('Comprimento', comprimento), campo('Largura', largura), campo('Espessura', espessura)),
          h('small', { class: 'dica' }, 'Em mm. Confira a medida da chapa com o fornecedor: ela muda de fabricante para fabricante.'),
          h('label', { class: 'caixa-marcar' }, veio, 'Tem veio (padrão amadeirado no comprimento)'),
        ]
      : campo('Largura (mm)', largura),
    h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Cadastrar')),
  );
}

async function trocarSenha() {
  await abrirModal('Trocar senha', (fechar) => {
    const atual = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const nova = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '6' });
    return h(
      'form',
      {
        class: 'formulario',
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            await api.put('/conta/senha', { senha_atual: atual.value, nova_senha: nova.value });
            aviso('Senha trocada. Os outros aparelhos saíram da conta.');
            fechar(true);
          } catch (erro) {
            avisoErro(erro);
          }
        },
      },
      campo('Senha atual', atual),
      campo('Nova senha', nova, { dica: 'Pelo menos 6 caracteres.' }),
      h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Trocar senha')),
    );
  });
}

async function sair() {
  await api.post('/auth/sair').catch(() => {});
  telaEntrar();
}

iniciar().catch((erro) => substituir(raiz, vazioIlustrado('alerta', 'Não foi possível abrir a produção', erro.message)));


/* Bancada Orçamentos — interface */
(function () {
  'use strict';

  const C = window.Calc;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clonar = (obj) => JSON.parse(JSON.stringify(obj));
  const hoje = () => new Date().toISOString().slice(0, 10);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const brl = (v) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmt = (v, casas = 2) =>
    (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const dataBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

  const emMoldura = (() => {
    try { return window.self !== window.top; } catch (e) { return true; }
  })();

  // ---------- Armazenamento local ----------
  const CHAVES = { config: 'bancada.config', projetos: 'bancada.projetos', atual: 'bancada.atual', aba: 'bancada.aba' };
  const armazem = {
    ler(chave, padrao) {
      try {
        const v = localStorage.getItem(chave);
        return v ? JSON.parse(v) : padrao;
      } catch (e) { return padrao; }
    },
    gravar(chave, valor) {
      try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* armazenamento indisponível */ }
    },
  };

  // ---------- Dados iniciais (exemplos) ----------
  function tabelaPrecosPadrao() {
    return [
      { id: 'tp-guarda-roupa', nome: 'Guarda-roupa', cobranca: 'm2', preco: 1100 },
      { id: 'tp-balcao', nome: 'Balcão de cozinha', cobranca: 'm2', preco: 1000 },
      { id: 'tp-aereo', nome: 'Armário aéreo', cobranca: 'm2', preco: 850 },
      { id: 'tp-painel', nome: 'Painel de TV', cobranca: 'ml', preco: 800 },
      { id: 'tp-banheiro', nome: 'Gabinete de banheiro', cobranca: 'm2', preco: 1000 },
      { id: 'tp-closet', nome: 'Closet', cobranca: 'm2', preco: 1200 },
    ];
  }

  function configPadrao() {
    return {
      perdaChapa: 10,
      perdaFita: 10,
      tabelaPrecos: tabelaPrecosPadrao(),
      materiais: [
        { id: 'mdf-br-15', nome: 'MDF Branco TX 15 mm', espessura: 15, chapaC: 2750, chapaL: 1850, preco: 289.9 },
        { id: 'mdf-br-18', nome: 'MDF Branco TX 18 mm', espessura: 18, chapaC: 2750, chapaL: 1850, preco: 339.9 },
        { id: 'mdf-mad-18', nome: 'MDF Amadeirado 18 mm', espessura: 18, chapaC: 2750, chapaL: 1850, preco: 469.9 },
        { id: 'mdf-6', nome: 'MDF Branco 6 mm (fundo)', espessura: 6, chapaC: 2750, chapaL: 1850, preco: 139.9 },
      ],
      fitas: [
        { id: 'fita-br-22', nome: 'Fita PVC branca 22 mm', preco: 0.95 },
        { id: 'fita-mad-22', nome: 'Fita PVC amadeirada 22 mm', preco: 2.2 },
      ],
      ferragens: [
        { id: 'dob-35', nome: 'Dobradiça 35 mm com amortecedor', preco: 11.9 },
        { id: 'corr-450', nome: 'Corrediça telescópica 450 mm (par)', preco: 34.9 },
        { id: 'pux-160', nome: 'Puxador alumínio 160 mm', preco: 18.5 },
        { id: 'pe-reg', nome: 'Pé regulável plástico', preco: 3.9 },
        { id: 'sup-prat', nome: 'Suporte de prateleira (10 un.)', preco: 6 },
        { id: 'kit-paraf', nome: 'Parafusos e cavilhas (kit por módulo)', preco: 12 },
      ],
    };
  }

  function projetoEmBranco() {
    return {
      id: uid(),
      nome: 'Novo orçamento',
      cliente: '',
      data: hoje(),
      comprimentoLinear: '',
      itensMedida: [],
      pecas: [],
      ferragens: [],
      maoDeObra: [{ id: uid(), descricao: 'Produção e montagem', tipo: 'm2', valor: 0, qtd: 1 }],
      outrosCustos: 0,
      margem: 30,
      desconto: 0,
      arredondarChapas: true,
    };
  }

  function projetoExemplo() {
    const p = projetoEmBranco();
    Object.assign(p, { nome: 'Exemplo · Cozinha 2,40 m', cliente: 'Cliente exemplo', comprimentoLinear: 2.4, outrosCustos: 120, margem: 35 });
    const base = {
      espessura: 15, materialCaixaId: 'mdf-br-15', materialFundoId: 'mdf-6', materialPortaId: 'mdf-mad-18',
      fitaCaixaId: 'fita-br-22', fitaPortaId: 'fita-mad-22',
    };
    const modulos = [
      { nome: 'Balcão pia', largura: 1200, altura: 720, profundidade: 550, prateleiras: 1, portas: 2 },
      { nome: 'Balcão cooktop', largura: 1200, altura: 720, profundidade: 550, prateleiras: 1, portas: 2 },
      { nome: 'Aéreo 1', largura: 1200, altura: 700, profundidade: 350, prateleiras: 1, portas: 2 },
      { nome: 'Aéreo 2', largura: 1200, altura: 700, profundidade: 350, prateleiras: 1, portas: 2 },
    ];
    let dobradicas = 0;
    modulos.forEach((m) => {
      const r = C.gerarModulo({ ...base, ...m });
      r.pecas.forEach((peca) => p.pecas.push({ id: uid(), ...peca }));
      dobradicas += r.dobradicas;
    });
    p.ferragens = [
      { id: uid(), ferragemId: 'dob-35', qtd: dobradicas },
      { id: uid(), ferragemId: 'pux-160', qtd: 8 },
      { id: uid(), ferragemId: 'pe-reg', qtd: 8 },
      { id: uid(), ferragemId: 'sup-prat', qtd: 2 },
      { id: uid(), ferragemId: 'kit-paraf', qtd: 4 },
    ];
    p.maoDeObra = [
      { id: uid(), descricao: 'Produção (corte, fita e furação)', tipo: 'm2', valor: 38, qtd: 1 },
      { id: uid(), descricao: 'Montagem e instalação', tipo: 'ml', valor: 220, qtd: 1 },
      { id: uid(), descricao: 'Projeto 3D', tipo: 'fixo', valor: 150, qtd: 1 },
    ];
    return p;
  }

  function projetoExemploMedida() {
    const p = projetoEmBranco();
    Object.assign(p, { nome: 'Exemplo · Orçamento por medida', cliente: 'Cliente exemplo', margem: 0 });
    p.maoDeObra = [];
    p.itensMedida = [
      { id: uid(), tabelaId: 'tp-guarda-roupa', descricao: 'Guarda-roupa casal', cobranca: 'm2', largura: 2.4, altura: 2.75, qtd: 1, preco: 1100 },
      { id: uid(), tabelaId: 'tp-balcao', descricao: 'Balcão de cozinha', cobranca: 'm2', largura: 1.58, altura: 1.3, qtd: 1, preco: 1000 },
      { id: uid(), tabelaId: 'tp-painel', descricao: 'Painel da sala', cobranca: 'ml', largura: 1.5, altura: 2.75, qtd: 1, preco: 800 },
    ];
    return p;
  }

  // ---------- Estado ----------
  let config = armazem.ler(CHAVES.config, null) || configPadrao();
  let projetos = armazem.ler(CHAVES.projetos, null);
  let projeto;
  if (!projetos || typeof projetos !== 'object' || !Object.keys(projetos).length) {
    const exMedida = projetoExemploMedida();
    const ex = projetoExemplo();
    projetos = { [exMedida.id]: exMedida, [ex.id]: ex };
    projeto = exMedida;
  } else if (!Array.isArray(config.tabelaPrecos)) {
    // Dados da versão anterior: ganha a tabela de preços e um exemplo do orçamento por medida.
    config.tabelaPrecos = tabelaPrecosPadrao();
    const exMedida = projetoExemploMedida();
    projetos[exMedida.id] = exMedida;
    projeto = exMedida;
  }
  ['materiais', 'fitas', 'ferragens', 'tabelaPrecos'].forEach((k) => { if (!Array.isArray(config[k])) config[k] = []; });
  projeto = projeto || projetos[armazem.ler(CHAVES.atual, '')] || Object.values(projetos)[0];
  let abaAtual = armazem.ler(CHAVES.aba, 'medida');
  let resultado = null;

  function salvar() {
    projetos[projeto.id] = projeto;
    armazem.gravar(CHAVES.projetos, projetos);
    armazem.gravar(CHAVES.atual, projeto.id);
    armazem.gravar(CHAVES.config, config);
  }

  function lista(caminho) {
    if (caminho.startsWith('config.')) return config[caminho.slice(7)];
    if (!Array.isArray(projeto[caminho])) projeto[caminho] = [];
    return projeto[caminho];
  }

  // ---------- Aviso rápido ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visivel'), 2600);
  }

  // ---------- Montagem de HTML ----------
  function opcoes(itens, selecionado, vazio) {
    let html = vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '';
    html += itens
      .map((i) => `<option value="${esc(i.id)}"${i.id === selecionado ? ' selected' : ''}>${esc(i.nome || '(sem nome)')}</option>`)
      .join('');
    return html;
  }
  const opcoesLados = (v) => [0, 1, 2].map((n) => `<option value="${n}"${C.num(v) === n ? ' selected' : ''}>${n}</option>`).join('');
  const attrs = (lista, id, campo) => `data-list="${lista}" data-id="${esc(id)}" data-field="${campo}"`;
  const inpTexto = (l, item, campo, ph = '') =>
    `<input type="text" ${attrs(l, item.id, campo)} value="${esc(item[campo])}" placeholder="${esc(ph)}">`;
  const inpNum = (l, item, campo, extra = '') =>
    `<input type="number" inputmode="decimal" ${attrs(l, item.id, campo)} value="${esc(item[campo])}" ${extra}>`;
  const saida = (id, campo, rotulo) =>
    `<td class="n saida" data-rotulo="${rotulo}" data-out-id="${esc(id)}" data-out-campo="${campo}"></td>`;
  const botoesLinha = (l, id, duplicar) =>
    `<td class="acoes-linha">${duplicar ? `<button type="button" class="remover" data-duplicar="${l}" data-id="${esc(id)}" title="Duplicar" aria-label="Duplicar linha">⧉</button>` : ''}` +
    `<button type="button" class="remover" data-remover="${l}" data-id="${esc(id)}" title="Remover" aria-label="Remover linha">×</button></td>`;
  const linhaVazia = (colunas, texto) => `<tr class="vazia"><td colspan="${colunas}">${texto}</td></tr>`;

  function linhaPeca(p) {
    const temMaterial = config.materiais.some((m) => m.id === p.materialId);
    const temFita = config.fitas.some((f) => f.id === p.fitaId);
    const semFita = temFita ? '' : ' disabled';
    return `<tr data-id="${esc(p.id)}"${temMaterial ? '' : ' class="sem-material"'}>
      <td data-rotulo="Módulo">${inpTexto('pecas', p, 'modulo', 'Ex.: Aéreo')}</td>
      <td data-rotulo="Peça">${inpTexto('pecas', p, 'nome', 'Ex.: Lateral')}</td>
      <td class="n" data-rotulo="Qtd">${inpNum('pecas', p, 'qtd', 'min="0" step="1"')}</td>
      <td class="n" data-rotulo="Comp. (mm)">${inpNum('pecas', p, 'c', 'min="0" step="1"')}</td>
      <td class="n" data-rotulo="Larg. (mm)">${inpNum('pecas', p, 'l', 'min="0" step="1"')}</td>
      <td data-rotulo="Chapa"><select ${attrs('pecas', p.id, 'materialId')}>${opcoes(config.materiais, p.materialId, temMaterial ? undefined : 'Escolha a chapa')}</select></td>
      <td data-rotulo="Fita"><select ${attrs('pecas', p.id, 'fitaId')}>${opcoes(config.fitas, p.fitaId, 'Sem fita')}</select></td>
      <td class="n" data-rotulo="Fita C"><select ${attrs('pecas', p.id, 'fitaC')}${semFita} aria-label="Lados do comprimento com fita">${opcoesLados(p.fitaC)}</select></td>
      <td class="n" data-rotulo="Fita L"><select ${attrs('pecas', p.id, 'fitaL')}${semFita} aria-label="Lados da largura com fita">${opcoesLados(p.fitaL)}</select></td>
      ${saida(p.id, 'area', 'm²')}
      ${saida(p.id, 'fita', 'Fita (m)')}
      ${botoesLinha('pecas', p.id, true)}
    </tr>`;
  }

  function linhaItemMedida(i) {
    const l = 'itensMedida';
    const tipos = config.tabelaPrecos;
    const cobrancas = Object.entries(C.COBRANCAS_MEDIDA)
      .map(([v, t]) => `<option value="${v}"${(i.cobranca || 'm2') === v ? ' selected' : ''}>${t}</option>`)
      .join('');
    const porMl = i.cobranca === 'ml';
    return `<tr data-id="${esc(i.id)}">
      <td data-rotulo="Tipo"><select ${attrs(l, i.id, 'tabelaId')}>${opcoes(tipos, i.tabelaId, 'Personalizado')}</select></td>
      <td data-rotulo="Descrição">${inpTexto(l, i, 'descricao', 'Ex.: Guarda-roupa casal')}</td>
      <td class="inteira" data-rotulo="Cobrança"><select ${attrs(l, i.id, 'cobranca')}>${cobrancas}</select></td>
      <td class="n" data-rotulo="Largura (m)">${inpNum(l, i, 'largura', 'min="0" step="0.01" placeholder="0,00"')}</td>
      <td class="n" data-rotulo="Altura (m)">${inpNum(l, i, 'altura', 'min="0" step="0.01" placeholder="0,00"')}</td>
      <td class="n" data-rotulo="Qtd">${inpNum(l, i, 'qtd', 'min="0" step="1"')}</td>
      <td class="n" data-rotulo="${porMl ? 'Preço por metro linear (R$)' : 'Preço por m² (R$)'}">${inpNum(l, i, 'preco', `min="0" step="0.01" aria-label="${porMl ? 'Preço por metro linear' : 'Preço por metro quadrado'}"`)}</td>
      ${saida(i.id, 'medida', 'Medida')}
      ${saida(i.id, 'total', 'Total')}
      ${botoesLinha(l, i.id, true)}
    </tr>`;
  }

  function linhaConfigTabela(t) {
    const l = 'config.tabelaPrecos';
    const cobrancas = Object.entries(C.COBRANCAS_MEDIDA)
      .map(([v, txt]) => `<option value="${v}"${(t.cobranca || 'm2') === v ? ' selected' : ''}>${txt}</option>`)
      .join('');
    return `<tr data-id="${esc(t.id)}">
      <td class="inteira" data-rotulo="Tipo de móvel">${inpTexto(l, t, 'nome')}</td>
      <td data-rotulo="Cobrança"><select ${attrs(l, t.id, 'cobranca')}>${cobrancas}</select></td>
      <td class="n" data-rotulo="Preço (R$)">${inpNum(l, t, 'preco', 'min="0" step="0.01"')}</td>
      ${botoesLinha(l, t.id)}
    </tr>`;
  }

  function linhaFerragem(f) {
    return `<tr data-id="${esc(f.id)}">
      <td class="inteira" data-rotulo="Item"><select ${attrs('ferragens', f.id, 'ferragemId')}>${opcoes(config.ferragens, f.ferragemId, config.ferragens.some((c) => c.id === f.ferragemId) ? undefined : 'Escolha o item')}</select></td>
      <td class="n" data-rotulo="Qtd">${inpNum('ferragens', f, 'qtd', 'min="0" step="1"')}</td>
      ${saida(f.id, 'preco', 'Preço unit.')}
      ${saida(f.id, 'total', 'Total')}
      ${botoesLinha('ferragens', f.id)}
    </tr>`;
  }

  function linhaMao(m) {
    const usaQtd = m.tipo === 'hora' || m.tipo === 'fixo';
    const tipos = Object.entries(C.TIPOS_MAO_DE_OBRA)
      .map(([v, t]) => `<option value="${v}"${m.tipo === v ? ' selected' : ''}>${t}</option>`)
      .join('');
    return `<tr data-id="${esc(m.id)}">
      <td class="inteira" data-rotulo="Descrição">${inpTexto('maoDeObra', m, 'descricao', 'Ex.: Montagem')}</td>
      <td class="inteira" data-rotulo="Forma de cobrança"><select ${attrs('maoDeObra', m.id, 'tipo')}>${tipos}</select></td>
      <td class="n" data-rotulo="${m.tipo === 'percentual' ? 'Valor (%)' : 'Valor (R$)'}">${inpNum('maoDeObra', m, 'valor', 'min="0" step="0.01"')}</td>
      <td class="n" data-rotulo="${m.tipo === 'hora' ? 'Horas' : 'Qtd'}">${inpNum('maoDeObra', m, 'qtd', `min="0" step="0.5"${usaQtd ? '' : ' disabled'}`)}</td>
      ${saida(m.id, 'base', 'Base')}
      ${saida(m.id, 'total', 'Total')}
      ${botoesLinha('maoDeObra', m.id)}
    </tr>`;
  }

  function linhaConfigMaterial(m) {
    const l = 'config.materiais';
    return `<tr data-id="${esc(m.id)}">
      <td class="inteira" data-rotulo="Nome">${inpTexto(l, m, 'nome')}</td>
      <td class="n" data-rotulo="Espessura (mm)">${inpNum(l, m, 'espessura', 'min="0" step="0.5"')}</td>
      <td class="n" data-rotulo="Chapa comp. (mm)">${inpNum(l, m, 'chapaC', 'min="0" step="1"')}</td>
      <td class="n" data-rotulo="Chapa larg. (mm)">${inpNum(l, m, 'chapaL', 'min="0" step="1"')}</td>
      <td class="n" data-rotulo="Preço da chapa (R$)">${inpNum(l, m, 'preco', 'min="0" step="0.01"')}</td>
      ${saida(m.id, 'precoM2', 'R$/m²')}
      ${botoesLinha(l, m.id)}
    </tr>`;
  }

  function linhaConfigSimples(l, rotuloPreco) {
    return (i) => `<tr data-id="${esc(i.id)}">
      <td class="inteira" data-rotulo="Nome">${inpTexto(l, i, 'nome')}</td>
      <td class="n" data-rotulo="${rotuloPreco}">${inpNum(l, i, 'preco', 'min="0" step="0.01"')}</td>
      ${botoesLinha(l, i.id)}
    </tr>`;
  }

  const TABELAS = {
    itensMedida: { corpo: '#lista-itensMedida', linha: linhaItemMedida, colunas: 10, vazio: 'Nenhum móvel. Use “+ Móvel” e informe largura × altura.' },
    'config.tabelaPrecos': { corpo: '#lista-config-tabelaPrecos', linha: linhaConfigTabela, colunas: 4, vazio: 'Cadastre os tipos de móvel e o preço por m² ou metro linear.' },
    pecas: { corpo: '#lista-pecas', linha: linhaPeca, colunas: 12, vazio: 'Nenhuma peça. Use “+ Peça” ou “+ Módulo rápido”.' },
    ferragens: { corpo: '#lista-ferragens', linha: linhaFerragem, colunas: 5, vazio: 'Nenhuma ferragem no orçamento.' },
    maoDeObra: { corpo: '#lista-maoDeObra', linha: linhaMao, colunas: 7, vazio: 'Nenhuma mão de obra cadastrada.' },
    'config.materiais': { corpo: '#lista-config-materiais', linha: linhaConfigMaterial, colunas: 7, vazio: 'Cadastre ao menos uma chapa.' },
    'config.fitas': { corpo: '#lista-config-fitas', linha: linhaConfigSimples('config.fitas', 'Preço por metro (R$)'), colunas: 3, vazio: 'Nenhuma fita cadastrada.' },
    'config.ferragens': { corpo: '#lista-config-ferragens', linha: linhaConfigSimples('config.ferragens', 'Preço unitário (R$)'), colunas: 3, vazio: 'Nenhuma ferragem cadastrada.' },
  };

  function renderTabela(caminho) {
    const t = TABELAS[caminho];
    const itens = lista(caminho);
    $(t.corpo).innerHTML = itens.length ? itens.map(t.linha).join('') : linhaVazia(t.colunas, t.vazio);
  }

  function manterFoco(fn) {
    const a = document.activeElement;
    const sel = a && a.dataset && a.dataset.list
      ? `[data-list="${a.dataset.list}"][data-id="${a.dataset.id}"][data-field="${a.dataset.field}"]`
      : null;
    fn();
    if (sel) { const el = $(sel); if (el) el.focus(); }
  }

  const ABAS = {
    medida: ['itensMedida'],
    pecas: ['pecas'],
    ferragens: ['ferragens'],
    mao: ['maoDeObra'],
    config: ['config.tabelaPrecos', 'config.materiais', 'config.fitas', 'config.ferragens'],
  };

  function mostrarAba(nome) {
    if (!ABAS[nome]) nome = 'medida';
    abaAtual = nome;
    armazem.gravar(CHAVES.aba, nome);
    $$('.tabs [data-aba]').forEach((b) => {
      const ativa = b.dataset.aba === nome;
      b.setAttribute('aria-selected', String(ativa));
      b.tabIndex = ativa ? 0 : -1;
    });
    $$('.painel').forEach((p) => { p.hidden = p.id !== `painel-${nome}`; });
    ABAS[nome].forEach(renderTabela);
    if (nome === 'pecas') preencherFormModulo();
    atualizar();
  }

  function preencherCamposFixos() {
    $$('[data-proj]').forEach((el) => {
      const v = projeto[el.dataset.proj];
      if (el.type === 'checkbox') el.checked = v !== false;
      else el.value = v ?? '';
    });
    $$('[data-cfg]').forEach((el) => { el.value = config[el.dataset.cfg] ?? ''; });
  }

  function renderSeletorProjetos() {
    const itens = Object.values(projetos).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    $('#sel-projeto').innerHTML = itens
      .map((p) => `<option value="${esc(p.id)}"${p.id === projeto.id ? ' selected' : ''}>${esc(p.nome || 'Sem nome')}${p.cliente ? ' · ' + esc(p.cliente) : ''}</option>`)
      .join('');
  }

  function preencherFormModulo() {
    const listas = { materiais: config.materiais, fitas: config.fitas, ferragens: config.ferragens };
    const padrao = {
      'mod-mat-caixa': (config.materiais.find((m) => C.num(m.espessura) === 15) || config.materiais[0] || {}).id,
      'mod-mat-fundo': (config.materiais.find((m) => C.num(m.espessura) > 0 && C.num(m.espessura) <= 6) || {}).id || '',
      'mod-mat-porta': (config.materiais.find((m) => C.num(m.espessura) === 18) || config.materiais[0] || {}).id,
      'mod-fita-caixa': (config.fitas[0] || {}).id || '',
      'mod-fita-porta': (config.fitas[0] || {}).id || '',
      'mod-dobradica': (config.ferragens.find((f) => /dobradi/i.test(f.nome)) || {}).id || '',
      'mod-corredica': (config.ferragens.find((f) => /corredi/i.test(f.nome)) || {}).id || '',
    };
    $$('#form-modulo select[data-opcoes]').forEach((sel) => {
      const itens = listas[sel.dataset.opcoes];
      const atual = sel.value;
      const aceitaVazio = sel.dataset.vazio !== undefined;
      const valido = Boolean(sel.dataset.preenchido) && (atual === '' ? aceitaVazio : itens.some((i) => i.id === atual));
      sel.innerHTML = opcoes(itens, valido ? atual : padrao[sel.id], sel.dataset.vazio);
      sel.dataset.preenchido = '1';
    });
  }

  function renderTudo() {
    renderSeletorProjetos();
    preencherCamposFixos();
    mostrarAba(abaAtual);
  }

  // ---------- Atualização dos resultados ----------
  function out(nome, texto) {
    $$(`[data-out="${nome}"]`).forEach((el) => { el.textContent = texto; });
  }
  function outLinha(id, campo, texto) {
    $$(`[data-out-id="${id}"][data-out-campo="${campo}"]`).forEach((el) => { el.textContent = texto; });
  }

  function textoBase(m) {
    switch (m.tipo) {
      case 'm2': return `${fmt(m.base)} m²`;
      case 'ml': return `${fmt(m.base)} m`;
      case 'hora': return `${fmt(m.base, 1)} h`;
      case 'percentual': return brl(m.base);
      default: return `${fmt(m.base, 0)} ×`;
    }
  }

  function atualizar() {
    resultado = C.calcular(projeto, config);
    const t = resultado.totais;

    resultado.pecas.forEach((p) => {
      outLinha(p.id, 'area', fmt(p.area, 3));
      outLinha(p.id, 'fita', fmt(p.fita));
    });
    resultado.itensMedida.forEach((i) => {
      const principal = i.cobranca === 'ml' ? `${fmt(i.ml)} m` : `${fmt(i.m2, 3)} m²`;
      const outra = i.cobranca === 'ml' ? `${fmt(i.m2, 3)} m²` : `${fmt(i.ml)} m lin.`;
      $$(`[data-out-id="${i.id}"][data-out-campo="medida"]`).forEach((el) => {
        el.innerHTML = `${principal}<small>${outra}</small>`;
      });
      outLinha(i.id, 'total', brl(i.total));
    });
    resultado.ferragens.forEach((f) => {
      outLinha(f.id, 'preco', brl(f.preco));
      outLinha(f.id, 'total', brl(f.total));
    });
    resultado.maoDeObra.forEach((m) => {
      outLinha(m.id, 'base', textoBase(m));
      outLinha(m.id, 'total', brl(m.total));
    });
    config.materiais.forEach((m) => outLinha(m.id, 'precoM2', brl(C.precoM2(m))));

    out('n-medida', lista('itensMedida').length ? String(lista('itensMedida').length) : '');
    out('t-medida-m2', `${fmt(t.areaMoveis, 3)} m²`);
    out('t-medida', brl(t.vendaMedida));
    out('n-pecas', projeto.pecas.length ? String(t.qtdPecas) : '');
    out('n-ferragens', projeto.ferragens.length ? String(projeto.ferragens.length) : '');
    out('n-mao', projeto.maoDeObra.length ? String(projeto.maoDeObra.length) : '');
    out('t-area', `${fmt(t.areaM2, 3)} m²`);
    out('t-fita-bruta', `${fmt(resultado.pecas.reduce((s, p) => s + p.fita, 0))} m`);
    out('t-ferragens', brl(t.custoFerragens));
    out('t-mao', brl(t.custoMaoDeObra));

    out('preco-final', brl(t.precoFinal));
    out('preco-m2', t.precoM2 > 0 ? brl(t.precoM2) : '—');
    out('preco-m2-rotulo', t.baseM2 === 'moveis' ? 'por m² de móvel' : 'por m² de chapa');
    out('preco-ml', t.precoMl > 0 ? brl(t.precoMl) : '—');
    out('area-moveis', `${fmt(t.areaMoveis)} m²`);
    out('qtd-pecas', `${fmt(t.qtdPecas, 0)} un.`);
    out('area', `${fmt(t.areaM2)} m²`);
    out('fita', `${fmt(t.fitaM, 1)} m`);
    out('chapas', `${fmt(t.qtdChapas, projeto.arredondarChapas === false ? 2 : 0)} un.`);
    out('ml', t.metroLinearRef > 0 ? `${fmt(t.metroLinearRef)} m` : '—');
    out('c-chapas', brl(t.custoChapas));
    out('c-fitas', brl(t.custoFitas));
    out('c-ferragens', brl(t.custoFerragens));
    out('c-materiais', brl(t.custoMateriais));
    out('c-mao', brl(t.custoMaoDeObra));
    out('c-total', brl(t.custoTotal));
    out('p-venda-det', brl(t.vendaDetalhada));
    out('p-medida', brl(t.vendaMedida));
    out('p-venda', brl(t.precoVenda));
    $('#linha-lucro').hidden = t.custoTotal <= 0;
    out('p-desconto', t.desconto > 0 ? `− ${brl(t.desconto)}` : brl(0));
    out('p-lucro', brl(t.lucro));

    const inteiras = projeto.arredondarChapas !== false;
    $('#resumo-chapas').innerHTML = resultado.chapas.length
      ? `<ul class="chapas-lista">${resultado.chapas
          .map((c) => `<li>
            <span>${esc(c.nome)}</span><b>${brl(c.custo)}</b>
            <span class="det">${fmt(c.area)} m² de peças · ${fmt(c.chapas, inteiras ? 0 : 2)} chapa(s)${inteiras ? ` · ${fmt(c.aproveitamento * 100, 0)}% de aproveitamento` : ''}</span>
            ${inteiras ? `<span class="barra-uso" aria-hidden="true"><i style="width:${Math.min(100, c.aproveitamento * 100).toFixed(1)}%"></i></span>` : ''}
          </li>`)
          .join('')}${resultado.fitas
          .map((f) => `<li><span>${esc(f.nome)}</span><b>${brl(f.custo)}</b><span class="det">${fmt(f.metros, 1)} m + perda = ${fmt(f.metrosComPerda, 1)} m</span></li>`)
          .join('')}</ul>`
      : '';
    $('#resumo-avisos').innerHTML = resultado.avisos.map((a) => `<li>${esc(a)}</li>`).join('');
  }

  function aposMudanca() {
    salvar();
    atualizar();
  }

  // ---------- Orçamento em texto e impressão ----------
  function modulosDoProjeto() {
    const mapa = new Map();
    const porId = new Map(resultado.pecas.map((p) => [p.id, p]));
    projeto.pecas.forEach((p) => {
      const nome = (p.modulo || '').trim() || 'Peças avulsas';
      const r = porId.get(p.id);
      const m = mapa.get(nome) || { nome, pecas: 0, area: 0 };
      m.pecas += r ? r.qtd : 0;
      m.area += r ? r.area : 0;
      mapa.set(nome, m);
    });
    return [...mapa.values()];
  }

  function nomeItemMedida(i) {
    const item = lista('itensMedida').find((x) => x.id === i.id) || {};
    const tipo = config.tabelaPrecos.find((t) => t.id === item.tabelaId);
    return (i.descricao || '').trim() || (tipo ? tipo.nome : 'Móvel');
  }

  function contaMedida(i) {
    const qtd = i.qtd !== 1 ? `${fmt(i.qtd, 0)} × ` : '';
    return i.cobranca === 'ml'
      ? `${qtd}${fmt(i.largura)} m lineares × ${brl(i.preco)}/m`
      : `${qtd}${fmt(i.largura)} × ${fmt(i.altura)} m = ${fmt(i.m2, 3)} m² × ${brl(i.preco)}/m²`;
  }

  const linhaTextoMedida = (i) => `• ${nomeItemMedida(i)}: ${contaMedida(i)} = ${brl(i.total)}`;

  function textoOrcamento() {
    const t = resultado.totais;
    const linhas = [
      `ORÇAMENTO · ${projeto.nome || 'Móveis planejados'}`,
      projeto.cliente ? `Cliente: ${projeto.cliente}` : '',
      projeto.data ? `Data: ${dataBR(projeto.data)}` : '',
      '',
      ...(resultado.itensMedida.length ? ['MÓVEIS', ...resultado.itensMedida.map(linhaTextoMedida), ''] : []),
      ...(projeto.pecas.length ? [
        'MÓVEIS SOB PROJETO',
        ...modulosDoProjeto().map((m) => `• ${m.nome}: ${fmt(m.pecas, 0)} peças, ${fmt(m.area)} m²`),
        `Subtotal: ${brl(t.vendaDetalhada)}`,
        '',
        'MEDIDAS',
        `Área total de peças: ${fmt(t.areaM2)} m²`,
        `Fita de borda: ${fmt(t.fitaM, 1)} m lineares`,
        t.metroLinear > 0 ? `Comprimento do móvel: ${fmt(t.metroLinear)} m lineares` : '',
        `Chapas: ${resultado.chapas.map((c) => `${fmt(c.chapas, projeto.arredondarChapas === false ? 2 : 0)} × ${c.nome}`).join('; ') || '—'}`,
      ] : []),
      resultado.ferragens.length ? '' : null,
      resultado.ferragens.length ? 'FERRAGENS' : null,
      ...resultado.ferragens.filter((f) => f.qtd > 0).map((f) => `• ${fmt(f.qtd, 0)} × ${f.nome}`),
      '',
      'VALOR',
      t.desconto > 0 ? `Valor: ${brl(t.precoVenda)}` : null,
      t.desconto > 0 ? `Desconto (${fmt(C.num(projeto.desconto), 1)}%): − ${brl(t.desconto)}` : null,
      `TOTAL: ${brl(t.precoFinal)}`,
      [t.precoM2 > 0 ? `${brl(t.precoM2)}/m²` : '', t.precoMl > 0 ? `${brl(t.precoMl)}/metro linear` : ''].filter(Boolean).join(' · '),
    ];
    return linhas.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function copiar(texto, mensagem) {
    try {
      await navigator.clipboard.writeText(texto);
      toast(mensagem);
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove();
      toast(ok ? mensagem : 'Não foi possível copiar. Tente pelo navegador.');
    }
  }

  function montarImpressao() {
    const t = resultado.totais;
    const inteiras = projeto.arredondarChapas !== false;
    const porId = new Map(resultado.pecas.map((p) => [p.id, p]));
    const nomeMat = (id) => (config.materiais.find((m) => m.id === id) || {}).nome || '—';
    const nomeFita = (id) => (config.fitas.find((f) => f.id === id) || {}).nome || '—';

    $('#impressao').innerHTML = `
      <h1>Orçamento · ${esc(projeto.nome || 'Móveis planejados')}</h1>
      <p class="sub">${projeto.cliente ? `Cliente: ${esc(projeto.cliente)} · ` : ''}${dataBR(projeto.data)}</p>

      ${resultado.itensMedida.length ? `<h2>Móveis</h2>
      <table><thead><tr><th>Móvel</th><th>Medida</th><th class="n">Valor</th></tr></thead><tbody>
        ${resultado.itensMedida.map((i) => `<tr><td>${esc(nomeItemMedida(i))}</td><td>${esc(contaMedida(i))}</td><td class="n">${brl(i.total)}</td></tr>`).join('')}
      </tbody></table>` : ''}

      ${projeto.pecas.length ? `<h2>Móveis sob projeto</h2>
      <table><thead><tr><th>Módulo</th><th class="n">Peças</th><th class="n">m²</th></tr></thead><tbody>
        ${modulosDoProjeto().map((m) => `<tr><td>${esc(m.nome)}</td><td class="n">${fmt(m.pecas, 0)}</td><td class="n">${fmt(m.area)}</td></tr>`).join('')}
        <tr><td colspan="2">Subtotal</td><td class="n">${brl(t.vendaDetalhada)}</td></tr>
      </tbody></table>

      <h2>Materiais</h2>
      <table><thead><tr><th>Material</th><th class="n">Quantidade</th></tr></thead><tbody>
        ${resultado.chapas.map((c) => `<tr><td>${esc(c.nome)}</td><td class="n">${fmt(c.chapas, inteiras ? 0 : 2)} chapa(s) · ${fmt(c.area)} m²</td></tr>`).join('')}
        ${resultado.fitas.map((f) => `<tr><td>${esc(f.nome)}</td><td class="n">${fmt(f.metrosComPerda, 1)} m</td></tr>`).join('')}
        ${resultado.ferragens.filter((f) => f.qtd > 0).map((f) => `<tr><td>${esc(f.nome)}</td><td class="n">${fmt(f.qtd, 0)} un.</td></tr>`).join('')}
      </tbody></table>` : ''}

      <h2>Valor</h2>
      <table><tbody>
        ${t.areaMoveis > 0 ? `<tr><td>Área dos móveis</td><td class="n">${fmt(t.areaMoveis)} m²</td></tr>` : ''}
        ${t.areaM2 > 0 ? `<tr><td>Área total de peças</td><td class="n">${fmt(t.areaM2)} m²</td></tr>` : ''}
        ${t.metroLinearRef > 0 ? `<tr><td>Metro linear</td><td class="n">${fmt(t.metroLinearRef)} m</td></tr>` : ''}
        ${t.desconto > 0 ? `<tr><td>Valor</td><td class="n">${brl(t.precoVenda)}</td></tr><tr><td>Desconto (${fmt(C.num(projeto.desconto), 1)}%)</td><td class="n">− ${brl(t.desconto)}</td></tr>` : ''}
        <tr class="total"><td>Total</td><td class="n">${brl(t.precoFinal)}</td></tr>
        ${t.precoM2 > 0 ? `<tr><td>Equivale a</td><td class="n">${brl(t.precoM2)}/m²${t.precoMl > 0 ? ` · ${brl(t.precoMl)}/metro linear` : ''}</td></tr>` : ''}
      </tbody></table>
      <p class="rodape">Orçamento gerado em ${dataBR(hoje())}.</p>

      ${projeto.pecas.length ? `<div style="break-before: page">
        <h1>Lista de peças</h1>
        <p class="sub">${esc(projeto.nome || '')} · medidas em mm · uso interno</p>
        <table><thead><tr><th>Módulo</th><th>Peça</th><th class="n">Qtd</th><th class="n">Comp.</th><th class="n">Larg.</th><th>Chapa</th><th>Fita (C/L)</th><th class="n">m²</th></tr></thead><tbody>
          ${projeto.pecas.map((p) => {
            const r = porId.get(p.id) || { area: 0 };
            const fita = p.fitaId && (C.num(p.fitaC) || C.num(p.fitaL)) ? `${esc(nomeFita(p.fitaId))} (${C.num(p.fitaC)}/${C.num(p.fitaL)})` : '—';
            return `<tr><td>${esc(p.modulo)}</td><td>${esc(p.nome)}</td><td class="n">${esc(p.qtd)}</td><td class="n">${esc(p.c)}</td><td class="n">${esc(p.l)}</td><td>${esc(nomeMat(p.materialId))}</td><td>${fita}</td><td class="n">${fmt(r.area, 3)}</td></tr>`;
          }).join('')}
        </tbody></table>
      </div>` : ''}`;
  }

  // ---------- Importar / exportar ----------
  function pacoteExportacao() {
    return JSON.stringify({ app: 'bancada-orcamentos', versao: 1, config, projeto }, null, 2);
  }

  function exportar() {
    const json = pacoteExportacao();
    if (emMoldura) {
      copiar(json, 'Dados do orçamento copiados (JSON).');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    const nome = (projeto.nome || 'orcamento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = `${nome}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importar(texto) {
    let dados;
    try { dados = JSON.parse(texto); } catch (e) {
      toast('Arquivo inválido: não é um JSON de orçamento.');
      return;
    }
    if (!dados || !dados.projeto || !Array.isArray(dados.projeto.pecas)) {
      toast('Arquivo sem orçamento. Use um arquivo gerado pelo botão Exportar.');
      return;
    }
    // Acrescenta ao catálogo os itens que ainda não existem (pelo id).
    if (dados.config) {
      ['materiais', 'fitas', 'ferragens', 'tabelaPrecos'].forEach((k) => {
        (dados.config[k] || []).forEach((item) => {
          if (item && item.id && !config[k].some((i) => i.id === item.id)) config[k].push(item);
        });
      });
    }
    const novo = { ...projetoEmBranco(), ...dados.projeto };
    if (projetos[novo.id]) novo.id = uid();
    projetos[novo.id] = novo;
    projeto = novo;
    salvar();
    renderTudo();
    toast(`Orçamento “${novo.nome}” importado.`);
  }

  // ---------- Eventos ----------
  function valorDe(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return el.value === '' ? '' : Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : C.num(el.value);
    return el.value;
  }

  function aplicarCampo(el) {
    const v = valorDe(el);
    if (el.dataset.list) {
      const item = lista(el.dataset.list).find((i) => i.id === el.dataset.id);
      if (!item) return;
      item[el.dataset.field] = v;
      if (el.dataset.list === 'itensMedida' && el.dataset.field === 'tabelaId') {
        const tipo = config.tabelaPrecos.find((t) => t.id === v);
        if (tipo) {
          const nomeAnterior = (config.tabelaPrecos.find((t) => t.nome === item.descricao) || {}).nome;
          item.cobranca = tipo.cobranca || 'm2';
          item.preco = tipo.preco;
          if (!String(item.descricao || '').trim() || nomeAnterior) item.descricao = tipo.nome;
        }
      }
      return;
    }
    if (el.dataset.proj) {
      projeto[el.dataset.proj] = v;
      if (el.dataset.proj === 'nome' || el.dataset.proj === 'cliente' || el.dataset.proj === 'data') renderSeletorProjetos();
      return;
    }
    if (el.dataset.cfg) config[el.dataset.cfg] = v;
  }

  const ehEscolha = (el) => el.tagName === 'SELECT' || el.type === 'checkbox';

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (ehEscolha(el) || !(el.dataset.list || el.dataset.proj || el.dataset.cfg)) return;
    aplicarCampo(el);
    aposMudanca();
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'sel-projeto') {
      if (projetos[el.value]) { projeto = projetos[el.value]; salvar(); renderTudo(); }
      return;
    }
    if (el.id === 'inp-importar') {
      const arq = el.files && el.files[0];
      if (arq) arq.text().then(importar);
      el.value = '';
      return;
    }
    if (!ehEscolha(el) || !(el.dataset.list || el.dataset.proj || el.dataset.cfg)) return;
    aplicarCampo(el);
    // Seleções mudam o que a linha mostra (fita habilitada, rótulos), então redesenha a tabela.
    if (el.dataset.list && TABELAS[el.dataset.list]) manterFoco(() => renderTabela(el.dataset.list));
    aposMudanca();
  });

  // Materiais renomeados precisam aparecer nas listas das outras abas.
  document.addEventListener('focusout', (e) => {
    const l = e.target.dataset && e.target.dataset.list;
    if (l && l.startsWith('config.') && e.target.dataset.field === 'nome') preencherFormModulo();
  });

  function novoItem(caminho) {
    const ultima = projeto.pecas[projeto.pecas.length - 1];
    switch (caminho) {
      case 'itensMedida': {
        const anterior = lista('itensMedida').slice(-1)[0];
        const tipo = config.tabelaPrecos.find((t) => anterior && t.id === anterior.tabelaId) || config.tabelaPrecos[0];
        return tipo
          ? { id: uid(), tabelaId: tipo.id, descricao: tipo.nome, cobranca: tipo.cobranca || 'm2', largura: '', altura: '', qtd: 1, preco: tipo.preco }
          : { id: uid(), tabelaId: '', descricao: '', cobranca: 'm2', largura: '', altura: '', qtd: 1, preco: 0 };
      }
      case 'config.tabelaPrecos': return { id: uid(), nome: 'Novo tipo', cobranca: 'm2', preco: 0 };
      case 'pecas':
        return {
          id: uid(), modulo: ultima ? ultima.modulo : '', nome: '', qtd: 1, c: '', l: '',
          materialId: ultima ? ultima.materialId : (config.materiais[0] || {}).id,
          fitaId: ultima ? ultima.fitaId : '', fitaC: 0, fitaL: 0,
        };
      case 'ferragens': return { id: uid(), ferragemId: (config.ferragens[0] || {}).id || '', qtd: 1 };
      case 'maoDeObra': return { id: uid(), descricao: '', tipo: 'm2', valor: 0, qtd: 1 };
      case 'config.materiais': return { id: uid(), nome: 'Nova chapa', espessura: 15, chapaC: 2750, chapaL: 1850, preco: 0 };
      case 'config.fitas': return { id: uid(), nome: 'Nova fita', preco: 0 };
      case 'config.ferragens': return { id: uid(), nome: 'Nova ferragem', preco: 0 };
      default: return null;
    }
  }

  let excluirTimer;
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('button, [data-aba]');
    if (!alvo) return;

    if (alvo.dataset.aba) { mostrarAba(alvo.dataset.aba); return; }

    if (alvo.dataset.add) {
      const caminho = alvo.dataset.add;
      const item = novoItem(caminho);
      lista(caminho).push(item);
      renderTabela(caminho);
      aposMudanca();
      const primeiro = $(`[data-list="${caminho}"][data-id="${item.id}"][data-field="largura"]`) ||
        $(`[data-list="${caminho}"][data-id="${item.id}"]:not([disabled])`);
      if (primeiro) primeiro.focus();
      return;
    }

    if (alvo.dataset.remover) {
      const caminho = alvo.dataset.remover;
      const itens = lista(caminho);
      const i = itens.findIndex((x) => x.id === alvo.dataset.id);
      if (i >= 0) itens.splice(i, 1);
      renderTabela(caminho);
      if (caminho.startsWith('config.')) preencherFormModulo();
      aposMudanca();
      return;
    }

    if (alvo.dataset.duplicar) {
      const itens = lista(alvo.dataset.duplicar);
      const i = itens.findIndex((x) => x.id === alvo.dataset.id);
      if (i >= 0) itens.splice(i + 1, 0, { ...clonar(itens[i]), id: uid() });
      renderTabela(alvo.dataset.duplicar);
      aposMudanca();
      return;
    }

    switch (alvo.id) {
      case 'btn-novo':
        projeto = projetoEmBranco();
        salvar();
        renderTudo();
        mostrarAba('pecas');
        $('#proj-nome').select();
        break;
      case 'btn-duplicar': {
        const copia = { ...clonar(projeto), id: uid(), nome: `${projeto.nome || 'Orçamento'} (cópia)`, data: hoje() };
        projeto = copia;
        salvar();
        renderTudo();
        toast('Cópia criada.');
        break;
      }
      case 'btn-excluir':
        if (!alvo.classList.contains('confirmar')) {
          alvo.classList.add('confirmar');
          alvo.textContent = 'Confirmar exclusão';
          clearTimeout(excluirTimer);
          excluirTimer = setTimeout(() => { alvo.classList.remove('confirmar'); alvo.textContent = 'Excluir'; }, 4000);
          break;
        }
        clearTimeout(excluirTimer);
        alvo.classList.remove('confirmar');
        alvo.textContent = 'Excluir';
        delete projetos[projeto.id];
        projeto = Object.values(projetos)[0] || projetoEmBranco();
        salvar();
        renderTudo();
        toast('Orçamento excluído.');
        break;
      case 'btn-copiar':
        copiar(textoOrcamento(), 'Orçamento copiado. Cole no WhatsApp ou e-mail.');
        break;
      case 'btn-imprimir':
        montarImpressao();
        window.print();
        break;
      case 'btn-exportar':
        exportar();
        break;
      case 'btn-modulo': {
        const form = $('#form-modulo');
        form.hidden = !form.hidden;
        alvo.setAttribute('aria-expanded', String(!form.hidden));
        if (!form.hidden) { preencherFormModulo(); $('#mod-nome').focus(); }
        break;
      }
      case 'btn-modulo-fechar':
        $('#form-modulo').hidden = true;
        $('#btn-modulo').setAttribute('aria-expanded', 'false');
        break;
      default:
        break;
    }
  });

  // Navegação das abas pelo teclado
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const nomes = Object.keys(ABAS);
    const i = nomes.indexOf(abaAtual);
    const prox = nomes[(i + (e.key === 'ArrowRight' ? 1 : nomes.length - 1)) % nomes.length];
    mostrarAba(prox);
    $(`.tabs [data-aba="${prox}"]`).focus();
  });

  $('#form-modulo').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = (id) => $(`#${id}`).value;
    const caixa = config.materiais.find((m) => m.id === val('mod-mat-caixa'));
    if (!caixa) { toast('Cadastre uma chapa em Materiais e preços.'); return; }
    const r = C.gerarModulo({
      nome: val('mod-nome').trim() || 'Módulo',
      largura: val('mod-largura'),
      altura: val('mod-altura'),
      profundidade: val('mod-prof'),
      prateleiras: val('mod-prat'),
      portas: val('mod-portas'),
      gavetas: val('mod-gavetas'),
      espessura: caixa.espessura,
      materialCaixaId: caixa.id,
      materialFundoId: val('mod-mat-fundo'),
      materialPortaId: val('mod-mat-porta'),
      fitaCaixaId: val('mod-fita-caixa'),
      fitaPortaId: val('mod-fita-porta'),
    });
    if (!r.pecas.length) { toast('Informe largura, altura e profundidade do módulo.'); return; }
    r.pecas.forEach((p) => projeto.pecas.push({ id: uid(), ...p }));

    const somarFerragem = (ferragemId, qtd) => {
      if (!ferragemId || qtd <= 0) return false;
      const existente = projeto.ferragens.find((f) => f.ferragemId === ferragemId);
      if (existente) existente.qtd = C.num(existente.qtd) + qtd;
      else projeto.ferragens.push({ id: uid(), ferragemId, qtd });
      return true;
    };
    const extras = [];
    if (somarFerragem(val('mod-dobradica'), r.dobradicas)) extras.push(`${r.dobradicas} dobradiças`);
    if (somarFerragem(val('mod-corredica'), r.corredicas)) extras.push(`${r.corredicas} pares de corrediça`);
    renderTabela('pecas');
    aposMudanca();
    toast(`${r.pecas.length} tipos de peça adicionados${extras.length ? ` + ${extras.join(' e ')}` : ''}.`);
  });

  // ---------- Início ----------
  if (emMoldura) $$('[data-so-navegador]').forEach((el) => { el.hidden = true; });
  window.addEventListener('beforeprint', () => { if (resultado) montarImpressao(); });
  salvar();
  renderTudo();
})();

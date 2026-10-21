import { METODOS, dinheiroParaCampo, formatarDinheiro, formatarPercentual, lerDinheiro, lerPercentual } from '/shared/calc.js';
import { api, cache } from '../api.js';
import { h, icone, campo, segmentado, abrirModal, confirmar, aviso, avisoErro, substituir, vazio } from '../ui.js';
import { cabecalhoPagina, cabecalhoInterno } from '../comum.js';
import { atualizarMarca, irPara, sair } from '../main.js';

const ABAS = [
  ['empresa', 'Empresa', 'empresa'],
  ['moveis', 'Móveis', 'preco'],
  ['pagamento', 'Pagamento', 'pagamento'],
  ['conta', 'Conta', 'usuario'],
];
// Endereços antigos continuam funcionando.
const APELIDOS = { tipos: 'moveis', precos: 'moveis' };

function chavePushParaBytes(chave) {
  const base64 = chave.replace(/-/g, '+').replace(/_/g, '/');
  const dados = atob(base64);
  return Uint8Array.from(dados, (caractere) => caractere.charCodeAt(0));
}

export async function paginaConfiguracoes(aba) {
  const mostrarVisao = !aba;
  aba ||= 'empresa';
  aba = APELIDOS[aba] || aba;
  if (!ABAS.some(([a]) => a === aba) && !['padroes', 'senha'].includes(aba)) aba = 'empresa';
  const montar = { empresa: abaEmpresa, moveis: abaMoveis, pagamento: abaPagamento, conta: abaConta, padroes: () => abaEmpresa({ padroes: true }), senha: () => abaConta({ soSenha: true }) }[aba];
  const formulario = await montar();
  const resumoEmpresa = h('section', { class: 'config-empresa-resumo' },
    h('span', { class: 'config-logo-resumo', 'aria-hidden': 'true' },
      cache.empresa?.tem_logo
        ? h('img', { src: `/api/empresa/logo?v=${encodeURIComponent(cache.empresa.logo_atualizado_em || '')}`, alt: '' })
        : h('img', { src: '/icons/esquadro.svg', alt: '' }),
    ),
    h('div', {},
      h('strong', {}, cache.empresa?.nome || 'Sua marcenaria'),
      h('span', {}, 'Identidade da proposta'),
    ),
  );
  const itensVisao = [
    ['empresa', 'Empresa', 'Logo e informações da proposta', 'empresa'],
    ['moveis', 'Móveis e preços', 'Catálogo e valores', 'preco'],
    ['pagamento', 'Pagamento', 'Condições da proposta', 'pagamento'],
    ['conta', 'Minha conta', 'Acesso e notificações', 'usuario'],
  ];
  const titulo = h('span', {},
    h('span', { class: 'config-titulo-mobile' }, 'Ajustes'),
    h('span', { class: 'config-titulo-desktop' }, 'Empresa'),
  );
  const cabecalhoVisao = cabecalhoPagina(titulo, {
    subtitulo: h('span', {},
      h('span', { class: 'config-subtitulo-mobile' }, 'Sua empresa, do seu jeito.'),
      h('span', { class: 'config-subtitulo-desktop' }, 'Os dados e a identidade que acompanham suas propostas.'),
    ),
    acoes: aba === 'empresa' ? h('button', { type: 'submit', form: 'config-empresa-form', class: 'botao botao-primario config-salvar-topo' }, 'Salvar empresa') : null,
  });
  cabecalhoVisao.classList.add('config-cabecalho-visao');
  cabecalhoVisao.querySelector('.titulos').prepend(h('span', { class: 'page-eyebrow config-eyebrow' },
    h('span', { class: 'config-eyebrow-mobile' }, 'ESQUADRO'),
    h('span', { class: 'config-eyebrow-desktop' }, 'AJUSTES / EMPRESA'),
  ));
  const textos = {
    empresa: ['Empresa', 'IDENTIDADE E CONTATOS', 'Os dados que aparecem na proposta.', 'AJUSTES / EMPRESA', 'Os dados e a identidade que acompanham suas propostas.'],
    moveis: ['Móveis e preços', 'CATÁLOGO', 'Seu catálogo e os valores de referência.', 'AJUSTES / MÓVEIS', 'Seu catálogo de móveis e os valores usados nos próximos orçamentos.'],
    pagamento: ['Pagamento', 'CONDIÇÕES DE PAGAMENTO', 'Condições prontas para suas propostas.', 'AJUSTES / PAGAMENTO', 'Condições que você pode reutilizar nas propostas.'],
    conta: ['Minha conta', 'CONTA', 'Seu acesso e os avisos deste dispositivo.', 'AJUSTES / CONTA', 'Dados de acesso, senha e avisos deste dispositivo.'],
    padroes: ['Novos orçamentos', 'PADRÕES DA EMPRESA', 'Defina os valores iniciais das propostas.', 'AJUSTES / PADRÕES'],
    senha: ['Alterar senha', 'SEGURANÇA', 'Use pelo menos 6 caracteres na nova senha.', 'AJUSTES / CONTA'],
  }[aba];
  const acaoNova = formulario.querySelector('.config-acao-nova');
  if (acaoNova) acaoNova.remove();
  const cabecalho = cabecalhoInterno(textos[0], {
    voltar: aba === 'padroes' ? '#/config/empresa' : aba === 'senha' ? '#/config/conta' : '#/config',
    retorno: aba === 'padroes' ? 'Empresa' : aba === 'senha' ? 'Minha conta' : 'Ajustes',
    contexto: textos[1], subtitulo: textos[2], contextoDesktop: textos[3], subtituloDesktop: textos[4],
    acoes: acaoNova || (aba === 'empresa' ? h('button', { type: 'submit', form: 'config-empresa-form', class: 'botao botao-primario config-salvar-topo' }, 'Salvar empresa') : null),
  });
  cabecalho.classList.add('config-cabecalho-interno');

  return h(
    'div',
    { class: `pagina pagina-config config-aba-${aba}${mostrarVisao ? ' config-visao' : ' pagina-interna'}` },
    mostrarVisao ? cabecalhoVisao : null,
    cabecalho,
    h('div', { class: 'config-overview' },
      resumoEmpresa,
      h('h2', {}, 'Preferências'),
      h('nav', { class: 'config-opcoes', 'aria-label': 'Preferências' },
        itensVisao.map(([rota, texto, detalhe, ic]) =>
          h('a', { href: `#/config/${rota}`, class: 'config-opcao' },
            h('span', { class: 'config-opcao-icone' }, icone(ic)),
            h('span', { class: 'config-opcao-texto' }, h('strong', {}, texto), h('small', {}, detalhe)),
            icone('seta', 'icone config-opcao-seta'),
          ),
        ),
      ),
    ),
    h('div', { class: 'config-formulario' },
      h('nav', { class: 'abas', 'aria-label': 'Seções dos ajustes' },
        ABAS.map(([a, texto, ic]) =>
          h('a', { href: `#/config/${a}`, class: a === aba ? 'ativo' : '', 'aria-current': a === aba ? 'page' : null }, icone(ic, 'icone icone-mini'), texto),
        ),
      ),
      formulario,
    ),
  );
}

// ------------------------------------------------------------------- Empresa

async function abaEmpresa({ padroes = false } = {}) {
  const [empresa, condicoes] = await Promise.all([cache.carregarEmpresa(true), api.get('/condicoes-pagamento')]);
  const desktop = window.matchMedia('(min-width: 768px)').matches;
  const entradas = {};
  const texto = (chave, rotulo, attrs = {}, opcoes = {}) => {
    entradas[chave] = h(attrs.rows ? 'textarea' : 'input', { type: 'text', ...attrs, value: empresa[chave] ?? '' });
    return campo(rotulo, entradas[chave], opcoes);
  };
  entradas.condicao_pagamento_padrao_id = h(
    'select',
    {},
    h('option', { value: '' }, 'Nenhuma'),
    condicoes.map((c) => h('option', { value: String(c.id), selected: c.id === empresa.condicao_pagamento_padrao_id }, c.descricao)),
  );

  // Logo
  const previa = h('div', { class: 'logo-previa' });
  const desenharLogo = (e) =>
    substituir(
      previa,
      e.tem_logo
        ? h('img', { src: `/api/empresa/logo?v=${encodeURIComponent(e.logo_atualizado_em || '')}`, alt: 'Logo da empresa' })
        : h('span', { class: 'suave' }, 'Sem logo'),
      e.tem_logo
        ? h(
            'button',
            {
              type: 'button',
              class: 'botao botao-pequeno',
              onclick: async () => {
                try {
                  desenharLogo(await api.delete('/empresa/logo'));
                  aviso('Logo removida.');
                } catch (erro) {
                  avisoErro(erro);
                }
              },
            },
            'Remover logo',
          )
        : null,
    );
  desenharLogo(empresa);
  const arquivo = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg',
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) return aviso('A logo deve ter no máximo 2 MB.', 'erro');
      const leitor = new FileReader();
      leitor.onload = async () => {
        try {
          desenharLogo(await api.put('/empresa/logo', { imagem: leitor.result }));
          aviso('Logo atualizada.');
        } catch (erro) {
          avisoErro(erro);
        }
        e.target.value = '';
      };
      leitor.readAsDataURL(f);
    },
  });

  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, padroes ? 'Salvar padrões' : 'Salvar empresa');
  return h(
    'form',
    {
      class: `formulario config-form-empresa${padroes ? ' config-so-padroes' : ''}`,
      id: 'config-empresa-form',
      onsubmit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        try {
          const dados = Object.fromEntries(Object.entries(entradas).map(([k, el]) => [k, el.value]));
          dados.condicao_pagamento_padrao_id = dados.condicao_pagamento_padrao_id ? Number(dados.condicao_pagamento_padrao_id) : null;
          dados.validade_padrao_dias = Number(dados.validade_padrao_dias) || 0;
          cache.empresa = await api.put('/empresa', dados);
          atualizarMarca();
          aviso(padroes ? 'Padrões salvos.' : 'Dados da empresa salvos.');
        } catch (erro) {
          avisoErro(erro);
        } finally {
          botao.disabled = false;
        }
      },
    },
    h(
      'section',
      { class: 'cartao' },
      h('h2', {}, 'Dados da empresa'),
      h('div', { class: 'grade-formulario config-grade-empresa' },
        texto('nome', 'Nome da empresa', { maxlength: '200' }, { classe: 'campo-inteiro' }),
        texto('cnpj', 'CNPJ', { maxlength: '30', placeholder: 'Informe o CNPJ' }, { classe: 'campo-metade' }),
        texto('email', 'E-mail', { type: 'email', maxlength: '200', placeholder: 'E-mail da empresa' }, { classe: 'campo-metade' }),
        texto('telefone', 'Telefone', { type: 'tel', maxlength: '40', placeholder: desktop ? 'Adicionar telefone' : 'DDD + número' }, { classe: 'campo-metade' }),
        texto('whatsapp', 'WhatsApp', { type: 'tel', maxlength: '40', placeholder: desktop ? 'Adicionar WhatsApp' : 'DDD + número' }, { classe: 'campo-metade' }),
        texto('endereco', 'Endereço', { maxlength: '300', placeholder: 'Rua, número e complemento' }, { classe: 'campo-inteiro' }),
        texto('cidade', 'Cidade', { maxlength: '100', placeholder: 'Informe a cidade' }, { classe: 'campo-cidade' }),
        texto('estado', 'Estado', { maxlength: '50', placeholder: 'UF' }, { classe: 'campo-estado' }),
      ),
    ),
    h('div', { class: 'config-lateral-form' },
      h('section', { class: 'cartao config-cartao-logo' },
        h('div', { class: 'config-logo-cabecalho' },
          h('span', { class: 'config-logo-icone' }, icone('empresa')),
          h('span', {}, h('strong', {}, 'Logo da empresa'), h('small', {}, 'PNG ou JPG · até 2 MB')),
        ),
        h('label', { class: 'botao botao-pequeno config-enviar-logo' }, 'Enviar logo', arquivo),
        previa,
      ),
      h('section', { class: 'cartao config-cartao-padroes' },
        h('h2', {}, 'Novos orçamentos'),
        h('div', { class: 'grade-formulario config-grade-padroes' },
          texto('validade_padrao_dias', 'Validade (dias)', { type: 'number', min: '0', max: '3650', inputmode: 'numeric' }, { classe: 'campo-metade' }),
          texto('prazo_padrao', 'Prazo de entrega', { maxlength: '200', placeholder: '30 dias úteis' }, { classe: 'campo-metade' }),
          campo('Condição de pagamento', entradas.condicao_pagamento_padrao_id, { classe: 'campo-inteiro' }),
        ),
        h('p', { class: 'config-ajuda-padroes' }, 'Os padrões preenchem os novos orçamentos automaticamente.'),
        h('details', { class: 'config-padroes-avancados', open: padroes },
          h('summary', { class: 'botao' }, 'Editar padrões'),
          h('div', { class: 'grade-formulario' },
            texto('texto_padrao', 'Observações da proposta', { rows: '5', maxlength: '5000' }, { classe: 'campo-inteiro' }),
            texto('mensagem_whatsapp', 'Mensagem do WhatsApp', { rows: '3', maxlength: '1000' }, { classe: 'campo-inteiro', dica: 'Use {cliente} e {link} para personalizar a mensagem.' }),
          ),
        ),
      ),
    ),
    padroes ? null : h('a', { href: '#/config/padroes', class: 'botao config-padroes-mobile' }, 'Padrões para novos orçamentos'),
    h('div', { class: 'acoes-formulario config-salvar-inferior' }, botao),
  );
}

// ----------------------------------------------------------- Móveis e preços

async function abaMoveis() {
  const tipos = await api.get('/tipos-moveis');
  const recarregar = () => irPara(`#/config/moveis?${Date.now()}`);
  const entradas = new Map();
  const botaoSalvar = h('button', { type: 'submit', class: 'botao botao-primario', disabled: true }, icone('salvar'), 'Salvar preços');
  const alterados = () => [...entradas].filter(([t, el]) => lerDinheiro(el.value) !== t.preco_padrao_cents);
  const contador = h('span', { class: 'config-precos-alterados', 'aria-live': 'polite' }, 'Nenhum preço alterado');
  const atualizarAlterados = () => {
    const n = alterados().length;
    botaoSalvar.disabled = !n;
    contador.textContent = n ? `${n} ${n === 1 ? 'preço alterado' : 'preços alterados'}` : 'Nenhum preço alterado';
  };

  const editar = async (tipo) => {
    if (alterados().length && !(await confirmar('Há preços alterados que ainda não foram salvos. Continuar sem salvar?', { sim: 'Continuar' }))) return;
    const salvo = await abrirModal(tipo ? 'Editar móvel' : 'Novo tipo de móvel', (fechar) => formularioTipo(tipo, fechar), { largo: true, contexto: 'CATÁLOGO', classe: 'modal-tipo-movel' });
    if (salvo) recarregar();
  };

  const linha = (t) => {
    const el = h('input', {
      type: 'text',
      inputmode: 'decimal',
      class: 'entrada-preco',
      value: dinheiroParaCampo(t.preco_padrao_cents),
      'aria-label': `Preço de ${t.nome} (R$${METODOS[t.metodo_calculo].sufixo})`,
    });
    el.addEventListener('input', () => {
      el.classList.toggle('invalido', lerDinheiro(el.value) === null);
      atualizarAlterados();
    });
    el.addEventListener('blur', () => {
      const v = lerDinheiro(el.value);
      if (v !== null) el.value = dinheiroParaCampo(v);
    });
    entradas.set(t, el);
    return h(
      'div',
      { class: `linha-movel${t.ativo ? '' : ' inativo'}` },
      h(
        'button',
        { type: 'button', class: 'linha-movel-nome', onclick: () => editar(t), title: 'Editar nome, cálculo e situação' },
        h('strong', {}, t.nome, t.ativo ? '' : ' (inativo)'),
        h('span', { class: 'suave' }, `${t.metodo_calculo === 'unidade' ? 'Unidade' : METODOS[t.metodo_calculo].nome}${t.nome_cliente && t.nome_cliente !== t.nome ? ` · no orçamento: “${t.nome_cliente}”` : ''}`),
      ),
      h('label', { class: 'preco-com-unidade' }, h('span', {}, 'R$'), el, h('span', {}, METODOS[t.metodo_calculo].sufixo)),
      h('button', { type: 'button', class: 'botao-icone', 'aria-label': `Editar ${t.nome}`, title: 'Editar', onclick: () => editar(t) }, icone('editar')),
    );
  };

  return h(
    'form',
    {
      class: 'config-catalogo',
      onsubmit: async (e) => {
        e.preventDefault();
        const precos = [];
        for (const [t, el] of entradas) {
          const v = lerDinheiro(el.value);
          if (v === null) return aviso(`Confira o preço de ${t.nome}.`, 'erro');
          precos.push({ id: t.id, preco_padrao_cents: v });
        }
        botaoSalvar.disabled = true;
        try {
          const atualizados = await api.put('/precos', { precos });
          for (const [t] of entradas) t.preco_padrao_cents = atualizados.find((x) => x.id === t.id)?.preco_padrao_cents ?? t.preco_padrao_cents;
          atualizarAlterados();
          aviso('Preços salvos. Os próximos orçamentos já usam os novos valores.');
        } catch (erro) {
          avisoErro(erro);
          botaoSalvar.disabled = false;
        }
      },
    },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Móveis e preços'),
      h('button', { type: 'button', class: 'botao botao-primario config-acao-nova', 'aria-label': 'Novo tipo de móvel', onclick: () => editar(null) }, icone('mais'), h('span', {}, 'Novo tipo')),
    ),
    h(
      'p',
      { class: 'config-informacao' },
      h('span', { class: 'config-info-icone' }, icone('cadeado')),
      'Só você vê estes preços. Alterações valem para novos orçamentos; os anteriores mantêm seus valores.',
    ),
    tipos.length ? h('div', { class: 'lista-moveis' }, tipos.map(linha)) : vazio('Nenhum tipo cadastrado.'),
    tipos.length ? h('div', { class: 'acao-interna-fixa config-salvar-precos' }, contador, botaoSalvar) : null,
  );
}

function formularioTipo(tipo, fechar) {
  const dados = tipo ? { ...tipo } : { nome: '', nome_cliente: '', metodo_calculo: 'linear', preco_padrao_cents: 0, ativo: 1 };
  const nome = h('input', { type: 'text', required: true, maxlength: '100', value: dados.nome, placeholder: 'Ex.: Guarda-roupa' });
  const nomeCliente = h('input', { type: 'text', maxlength: '150', value: dados.nome_cliente, placeholder: 'Ex.: Guarda-roupa planejado' });
  const precoRotulo = h('label', { for: 'preco-tipo' }, '');
  const preco = h('input', { id: 'preco-tipo', type: 'text', inputmode: 'decimal', required: true, value: dinheiroParaCampo(dados.preco_padrao_cents) });
  const ativo = h('input', { type: 'checkbox', checked: Boolean(dados.ativo) });
  const atualizarRotulo = () => {
    precoRotulo.textContent = { linear: 'Preço interno por metro (R$)', quadrado: 'Preço interno por m² (R$)', unidade: 'Preço interno por unidade (R$)' }[dados.metodo_calculo];
  };
  const metodo = segmentado(
    Object.entries(METODOS).map(([v, m]) => [v, v === 'quadrado' ? 'm²' : v === 'unidade' ? 'Unidade' : m.nome]),
    dados.metodo_calculo,
    (v) => {
      dados.metodo_calculo = v;
      atualizarRotulo();
    },
    { rotulo: 'Método de cálculo' },
  );
  atualizarRotulo();

  const excluir = async () => {
    if (!(await confirmar(`Excluir “${tipo.nome}”? Orçamentos já feitos não serão alterados.`, { sim: 'Excluir', perigo: true }))) return;
    try {
      await api.delete(`/tipos-moveis/${tipo.id}`);
      aviso('Tipo excluído.');
      fechar(true);
    } catch (erro) {
      avisoErro(erro);
    }
  };

  return h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        const precoCents = lerDinheiro(preco.value);
        if (precoCents === null) return aviso('Preço inválido.', 'erro');
        const corpo = { nome: nome.value, nome_cliente: nomeCliente.value, metodo_calculo: dados.metodo_calculo, preco_padrao_cents: precoCents, ativo: ativo.checked };
        try {
          if (tipo) await api.put(`/tipos-moveis/${tipo.id}`, corpo);
          else await api.post('/tipos-moveis', corpo);
          aviso('Tipo de móvel salvo.');
          fechar(true);
        } catch (erro) {
          avisoErro(erro);
        }
      },
    },
    campo('Nome interno', nome),
    campo('Nome que aparece para o cliente', nomeCliente),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Como calcular'), metodo),
    h('div', { class: 'campo' }, precoRotulo, preco, h('small', { class: 'dica' }, 'Este preço não aparece para o cliente.')),
    h('label', { class: 'caixa-marcar' }, ativo, ' Ativo ao adicionar móveis'),
    h(
      'div',
      { class: 'acoes-modal' },
      tipo ? h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: excluir }, 'Excluir') : null,
      h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Salvar móvel'),
    ),
  );
}

// -------------------------------------------------------- Condições de pagamento

/** Seleção do parcelamento do restante (1 = de uma vez). */
export function seletorParcelas(valor) {
  const atual = Math.max(1, Number(valor) || 1);
  const opcoes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24];
  if (!opcoes.includes(atual)) opcoes.push(atual);
  return h(
    'select',
    {},
    opcoes
      .sort((a, b) => a - b)
      .map((n) => h('option', { value: String(n), selected: n === atual }, n === 1 ? 'De uma vez (na entrega)' : `Em ${n}x`)),
  );
}

function descreverCondicao(c) {
  const partes = [];
  if (c.entrada_tipo === 'percentual' && c.entrada_valor) partes.push(`entrada de ${formatarPercentual(c.entrada_valor)}%`);
  if (c.entrada_tipo === 'valor' && c.entrada_valor) partes.push(`entrada de ${formatarDinheiro(c.entrada_valor)}`);
  if (c.parcelas > 1) partes.push(`restante em ${c.parcelas}x`);
  return partes.join(' · ') || 'sem cálculo de entrada';
}

async function abaPagamento() {
  const condicoes = await api.get('/condicoes-pagamento');
  const recarregar = () => irPara(`#/config/pagamento?${Date.now()}`);
  const editar = async (c) => {
    const salvo = await abrirModal(c ? 'Editar condição' : 'Nova condição de pagamento', (fechar) => formularioCondicao(c, fechar), { largo: true, contexto: 'PAGAMENTO', classe: 'modal-condicao' });
    if (salvo) recarregar();
  };
  return h(
    'section',
    { class: 'config-pagamentos' },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Condições de pagamento'),
      h('button', { type: 'button', class: 'botao botao-primario config-acao-nova config-nova-condicao-topo', onclick: () => editar(null) }, 'Nova condição'),
    ),
    h('p', { class: 'config-informacao' }, h('span', { class: 'config-info-icone' }, icone('pagamento')), 'Editar uma condição não altera os orçamentos já criados.'),
    condicoes.length
      ? h(
          'div',
          { class: 'lista lista-condicoes' },
          condicoes.map((c) =>
            h(
              'button',
              { type: 'button', class: `linha-orcamento${c.ativo ? '' : ' inativo'}`, onclick: () => editar(c) },
              h('div', { class: 'linha-principal' }, h('strong', {}, c.descricao), h('span', { class: 'suave' }, descreverCondicao(c)), h('small', { class: c.ativo ? 'condicao-ativa' : 'suave' }, c.ativo ? 'Ativa' : 'Inativa')),
              h('span', { class: 'botao-icone' }, icone('editar')),
            ),
          ),
        )
      : vazio('Nenhuma condição cadastrada.'),
    h('div', { class: 'acao-interna-fixa config-nova-condicao' }, h('button', { type: 'button', class: 'botao botao-primario', onclick: () => editar(null) }, 'Nova condição')),
  );
}

function formularioCondicao(c, fechar) {
  const dados = c ? { ...c } : { descricao: '', entrada_tipo: 'nenhum', entrada_valor: 0, parcelas: 0, ativo: 1 };
  let unidade = dados.entrada_tipo === 'percentual' ? 'percentual' : 'valor';
  const descricao = h('input', { type: 'text', required: true, maxlength: '300', value: dados.descricao, placeholder: 'Ex.: Entrada + 3 parcelas' });
  const entrada = h('input', {
    id: 'entrada-condicao',
    type: 'text',
    inputmode: 'decimal',
    placeholder: 'Sem entrada',
    value: !dados.entrada_valor ? '' : unidade === 'percentual' ? formatarPercentual(dados.entrada_valor) : dinheiroParaCampo(dados.entrada_valor),
  });
  const parcelas = seletorParcelas(dados.parcelas);
  const ativo = h('input', { type: 'checkbox', checked: Boolean(dados.ativo) });

  const excluir = async () => {
    if (!(await confirmar(`Excluir “${c.descricao}”? Orçamentos já feitos não serão alterados.`, { sim: 'Excluir', perigo: true }))) return;
    try {
      await api.delete(`/condicoes-pagamento/${c.id}`);
      aviso('Condição excluída.');
      fechar(true);
    } catch (erro) {
      avisoErro(erro);
    }
  };

  return h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        const valor = entrada.value.trim() ? (unidade === 'percentual' ? lerPercentual(entrada.value) : lerDinheiro(entrada.value)) : 0;
        if (valor === null) return aviso('Entrada inválida.', 'erro');
        const corpo = {
          descricao: descricao.value,
          entrada_tipo: valor ? unidade : 'nenhum',
          entrada_valor: valor || 0,
          parcelas: Number(parcelas.value) || 0,
          ativo: ativo.checked,
        };
        try {
          if (c) await api.put(`/condicoes-pagamento/${c.id}`, corpo);
          else await api.post('/condicoes-pagamento', corpo);
          aviso('Condição salva.');
          fechar(true);
        } catch (erro) {
          avisoErro(erro);
        }
      },
    },
    campo('Descrição (aparece no orçamento)', descricao),
    h(
      'div',
      { class: 'grade-formulario' },
      h(
        'div',
        { class: 'campo campo-metade' },
        h('label', { for: 'entrada-condicao' }, 'Entrada sugerida'),
        h('div', { class: 'entrada-com-unidade' }, segmentado([['valor', 'R$'], ['percentual', '%']], unidade, (u) => { unidade = u; }, { rotulo: 'Tipo de entrada' }), entrada),
      ),
      campo('Restante', parcelas, { classe: 'campo-metade' }),
    ),
    h('label', { class: 'caixa-marcar' }, ativo, ' Ativa'),
    h(
      'div',
      { class: 'acoes-modal' },
      c ? h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: excluir }, 'Excluir') : null,
      h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Salvar'),
    ),
  );
}

// --------------------------------------------------------------- Minha conta

async function abaConta({ soSenha = false } = {}) {
  const { usuario } = await api.get('/auth/estado');
  const pushInfo = await api.get('/notificacoes/config');
  const suportaPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let inscricaoPush = null;
  let pushAtivo = false;
  const estadoPush = h('p', { class: 'config-push-estado' });
  const statusPush = h('p', { class: 'suave pequeno config-push-ajuda' });
  const botaoPush = h('button', { type: 'button', class: 'botao botao-secundario', onclick: alternarPush });
  const desenharPush = () => {
    if (!suportaPush) {
      statusPush.textContent = 'Este navegador não aceita notificações push. Os avisos continuarão aparecendo dentro do site.';
      botaoPush.disabled = true;
      botaoPush.textContent = 'Push indisponível neste navegador';
    } else if (!pushInfo.configurada) {
      statusPush.textContent = 'As notificações push ainda aguardam configuração do sistema.';
      botaoPush.disabled = true;
      botaoPush.textContent = 'Notificações não configuradas';
    } else if (Notification.permission === 'denied' && !pushAtivo) {
      statusPush.textContent = 'A permissão está bloqueada no navegador. Altere a permissão do esquadro nas configurações do navegador.';
      botaoPush.disabled = true;
      botaoPush.textContent = 'Permissão bloqueada';
    } else if (pushAtivo) {
      statusPush.textContent = 'Este dispositivo receberá avisos de atualização e atividades importantes dos clientes.';
      botaoPush.disabled = false;
      botaoPush.textContent = 'Desativar neste dispositivo';
    } else {
      statusPush.textContent = 'Receba avisos sobre propostas e atualizações mesmo com o PWA fechado.';
      botaoPush.disabled = false;
      botaoPush.textContent = 'Ativar neste dispositivo';
    }
    estadoPush.textContent = pushAtivo ? 'Ativas neste dispositivo' : 'Não ativas neste dispositivo';
    estadoPush.classList.toggle('config-push-ativo', pushAtivo);
  };
  async function alternarPush() {
    botaoPush.disabled = true;
    try {
      if (pushAtivo) {
        await api('DELETE', '/notificacoes/push', { endpoint: inscricaoPush.endpoint });
        await inscricaoPush.unsubscribe();
        inscricaoPush = null;
        pushAtivo = false;
        aviso('Avisos push desativados neste dispositivo.');
      } else {
        let permissao = Notification.permission;
        if (permissao === 'default') permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
          aviso('Permita as notificações no navegador para ativá-las.', 'erro');
          return;
        }
        const registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        inscricaoPush = await registro.pushManager.getSubscription();
        if (!inscricaoPush) {
          inscricaoPush = await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: chavePushParaBytes(pushInfo.chave_publica),
          });
        }
        await api.post('/notificacoes/push', { inscricao: inscricaoPush.toJSON() });
        pushAtivo = true;
        aviso('Avisos push ativados neste dispositivo.');
      }
    } catch (erro) {
      avisoErro(erro);
    } finally {
      desenharPush();
    }
  }
  desenharPush();
  if (suportaPush && pushInfo.configurada && Notification.permission === 'granted') {
    try {
      const registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      inscricaoPush = await registro.pushManager.getSubscription();
      if (inscricaoPush) {
        await api.post('/notificacoes/push', { inscricao: inscricaoPush.toJSON() });
        pushAtivo = true;
        desenharPush();
      }
    } catch {
      // A tela de conta segue disponível se o navegador bloquear o service worker.
    }
  }
  const nome = h('input', { type: 'text', required: true, value: usuario.nome, autocomplete: 'name' });
  const email = h('input', { type: 'email', required: true, value: usuario.email, autocomplete: 'username' });
  const atual = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const nova = h('input', { type: 'password', required: true, minlength: '6', autocomplete: 'new-password' });
  const confirmacao = h('input', { type: 'password', required: true, minlength: '6', autocomplete: 'new-password' });

  return h(
    'div',
    { class: `config-conta${soSenha ? ' config-so-senha' : ''}` },
    h(
      'section',
      { class: 'cartao notificacoes-conta' },
      h('h2', {}, 'Notificações no PWA'),
      estadoPush,
      statusPush,
      botaoPush,
    ),
    h(
      'form',
      {
        class: 'cartao formulario config-meus-dados',
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            await api.put('/conta', { nome: nome.value, email: email.value });
            aviso('Dados atualizados.');
          } catch (erro) {
            avisoErro(erro);
          }
        },
      },
      h('h2', {}, 'Meus dados'),
      campo('Nome', nome),
      campo('E-mail de acesso', email),
      h('div', { class: 'acoes-formulario' }, h('button', { type: 'submit', class: 'botao botao-primario' }, 'Salvar dados')),
    ),
    h(
      'form',
      {
        class: 'cartao formulario config-form-senha',
        onsubmit: async (e) => {
          e.preventDefault();
          if (nova.value !== confirmacao.value) return aviso('As senhas não conferem.', 'erro');
          try {
            await api.put('/conta/senha', { senha_atual: atual.value, nova_senha: nova.value });
            aviso('Senha alterada.');
            e.target.reset();
          } catch (erro) {
            avisoErro(erro);
          }
        },
      },
      h('h2', {}, 'Alterar senha'),
      h('p', { class: 'config-informacao config-senha-informacao' }, h('span', { class: 'config-info-icone' }, icone('cadeado')), 'Confirme sua senha atual para cadastrar uma nova.'),
      h('div', { class: 'config-campos-senha' }, campo('Senha atual', atual), campo('Nova senha', nova), campo('Confirmar nova senha', confirmacao)),
      h('p', { class: 'dica' }, soSenha ? 'A nova senha e a confirmação precisam ser iguais.' : 'A nova senha deve ter pelo menos 6 caracteres.'),
      h('div', { class: 'acoes-formulario' }, h('button', { type: 'submit', class: 'botao botao-primario' }, 'Alterar senha')),
    ),
    h(
      'section',
      { class: 'cartao cartao-sair' },
      h('h2', {}, 'Sair da conta'),
      h('p', { class: 'suave' }, 'Para entrar de novo, use seu e-mail e senha.'),
      h('div', { class: 'acoes-formulario' }, h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: sair }, 'Sair da conta')),
    ),
    h('a', { href: '#/config/senha', class: 'botao config-abrir-senha' }, 'Alterar senha'),
  );
}

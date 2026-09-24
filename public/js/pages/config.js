import { METODOS, dinheiroParaCampo, formatarDinheiro, formatarPercentual, lerDinheiro, lerPercentual } from '/shared/calc.js';
import { api, cache } from '../api.js';
import { h, icone, campo, segmentado, abrirModal, confirmar, aviso, avisoErro, substituir, vazio } from '../ui.js';
import { cabecalhoPagina } from '../comum.js';
import { atualizarMarca, irPara } from '../main.js';

const ABAS = [
  ['empresa', 'Empresa'],
  ['tipos', 'Tipos de móveis'],
  ['precos', 'Preços'],
  ['pagamento', 'Pagamento'],
  ['conta', 'Minha conta'],
];

export async function paginaConfiguracoes(aba = 'empresa') {
  if (!ABAS.some(([a]) => a === aba)) aba = 'empresa';
  const montar = { empresa: abaEmpresa, tipos: abaTipos, precos: abaPrecos, pagamento: abaPagamento, conta: abaConta }[aba];
  return h(
    'div',
    { class: 'pagina' },
    cabecalhoPagina('Configurações'),
    h(
      'nav',
      { class: 'abas', 'aria-label': 'Seções das configurações' },
      ABAS.map(([a, texto]) => h('a', { href: `#/config/${a}`, class: a === aba ? 'ativo' : '', 'aria-current': a === aba ? 'page' : null }, texto)),
    ),
    await montar(),
  );
}

// ------------------------------------------------------------------- Empresa

async function abaEmpresa() {
  const [empresa, condicoes] = await Promise.all([cache.carregarEmpresa(true), api.get('/condicoes-pagamento')]);
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

  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Salvar dados da empresa');
  return h(
    'form',
    {
      class: 'formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        botao.disabled = true;
        try {
          const dados = Object.fromEntries(Object.entries(entradas).map(([k, el]) => [k, el.value]));
          dados.condicao_pagamento_padrao_id = dados.condicao_pagamento_padrao_id ? Number(dados.condicao_pagamento_padrao_id) : null;
          dados.validade_padrao_dias = Number(dados.validade_padrao_dias) || 0;
          cache.empresa = await api.put('/empresa', dados);
          atualizarMarca();
          aviso('Dados da empresa salvos.');
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
      h('h2', {}, 'Dados que aparecem no orçamento'),
      h(
        'div',
        { class: 'grade-formulario' },
        texto('nome', 'Nome da empresa', { maxlength: '200' }, { classe: 'campo-inteiro' }),
        texto('cnpj', 'CNPJ', { maxlength: '30' }, { classe: 'campo-metade' }),
        texto('email', 'E-mail', { type: 'email', maxlength: '200' }, { classe: 'campo-metade' }),
        texto('telefone', 'Telefone', { type: 'tel', maxlength: '40' }, { classe: 'campo-metade' }),
        texto('whatsapp', 'WhatsApp', { type: 'tel', maxlength: '40' }, { classe: 'campo-metade' }),
        texto('endereco', 'Endereço', { maxlength: '300' }, { classe: 'campo-inteiro' }),
        texto('cidade', 'Cidade', { maxlength: '100' }, { classe: 'campo-metade' }),
        texto('estado', 'Estado', { maxlength: '50' }, { classe: 'campo-metade' }),
      ),
      h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Logo (PNG ou JPG)'), previa, arquivo),
    ),
    h(
      'section',
      { class: 'cartao' },
      h('h2', {}, 'Padrões para novos orçamentos'),
      h(
        'div',
        { class: 'grade-formulario' },
        texto('validade_padrao_dias', 'Validade padrão (dias)', { type: 'number', min: '0', max: '3650', inputmode: 'numeric' }, { classe: 'campo-metade' }),
        texto('prazo_padrao', 'Prazo de entrega padrão', { maxlength: '200', placeholder: 'Ex.: 30 dias úteis' }, { classe: 'campo-metade' }),
        campo('Condição de pagamento padrão', entradas.condicao_pagamento_padrao_id, { classe: 'campo-inteiro' }),
        texto('texto_padrao', 'Texto padrão do orçamento (observações)', { rows: '5', maxlength: '5000' }, { classe: 'campo-inteiro' }),
        texto('mensagem_whatsapp', 'Mensagem do WhatsApp', { rows: '3', maxlength: '1000' }, { classe: 'campo-inteiro', dica: 'Use {cliente} para inserir o primeiro nome do cliente.' }),
      ),
    ),
    h('div', { class: 'acoes-formulario' }, botao),
  );
}

// ------------------------------------------------------------ Tipos de móveis

async function abaTipos() {
  const tipos = await api.get('/tipos-moveis');
  const recarregar = () => irPara(`#/config/tipos?${Date.now()}`);

  const editar = async (tipo) => {
    const salvo = await abrirModal(tipo ? 'Editar tipo de móvel' : 'Novo tipo de móvel', (fechar) => formularioTipo(tipo, fechar), { largo: true });
    if (salvo) recarregar();
  };

  return h(
    'section',
    { class: 'cartao' },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Tipos de móveis'),
      h('button', { type: 'button', class: 'botao botao-primario', onclick: () => editar(null) }, icone('mais'), 'Novo tipo'),
    ),
    h('p', { class: 'suave' }, 'Cadastre os móveis que você vende com frequência. Ao adicionar um móvel no orçamento, o método de cálculo e o preço são preenchidos automaticamente.'),
    tipos.length
      ? h(
          'div',
          { class: 'lista' },
          tipos.map((t) =>
            h(
              'button',
              { type: 'button', class: `linha-orcamento${t.ativo ? '' : ' inativo'}`, onclick: () => editar(t) },
              h(
                'div',
                { class: 'linha-principal' },
                h('strong', {}, t.nome, t.ativo ? '' : ' (inativo)'),
                h('span', { class: 'suave' }, `${METODOS[t.metodo_calculo].nome}${t.nome_cliente && t.nome_cliente !== t.nome ? ` · no orçamento: “${t.nome_cliente}”` : ''}`),
              ),
              h('div', { class: 'linha-valor' }, h('strong', {}, `${formatarDinheiro(t.preco_padrao_cents)}${METODOS[t.metodo_calculo].sufixo}`)),
            ),
          ),
        )
      : vazio('Nenhum tipo cadastrado.'),
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
    precoRotulo.textContent = `Preço padrão (R$${METODOS[dados.metodo_calculo].sufixo})`;
  };
  const metodo = segmentado(
    Object.entries(METODOS).map(([v, m]) => [v, m.nome]),
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
    campo('Nome', nome),
    campo('Nome que aparece para o cliente', nomeCliente, { dica: 'Opcional. Se vazio, usa o nome acima.' }),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Como calcular'), metodo),
    h('div', { class: 'campo campo-interno' }, precoRotulo, preco, h('small', { class: 'dica' }, 'Preço interno: nunca aparece para o cliente.')),
    h('label', { class: 'caixa-marcar' }, ativo, ' Ativo (aparece ao adicionar móveis)'),
    h(
      'div',
      { class: 'acoes-modal' },
      tipo ? h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: excluir }, 'Excluir') : null,
      h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Salvar'),
    ),
  );
}

// -------------------------------------------------------------------- Preços

async function abaPrecos() {
  const tipos = (await api.get('/tipos-moveis')).filter((t) => t.ativo);
  const entradas = new Map();
  const botao = h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, 'Salvar preços');
  return h(
    'form',
    {
      class: 'cartao',
      onsubmit: async (e) => {
        e.preventDefault();
        const precos = [];
        for (const [id, el] of entradas) {
          const v = lerDinheiro(el.value);
          if (v === null) return aviso('Confira os preços: há um valor inválido.', 'erro');
          precos.push({ id, preco_padrao_cents: v });
        }
        botao.disabled = true;
        try {
          await api.put('/precos', { precos });
          aviso('Preços salvos. Novos orçamentos já usarão estes valores.');
        } catch (erro) {
          avisoErro(erro);
        } finally {
          botao.disabled = false;
        }
      },
    },
    h('h2', {}, 'Preços'),
    h(
      'p',
      { class: 'aviso-caixa' },
      icone('cadeado', 'icone icone-mini'),
      'Preços internos. Quando um preço muda, somente os novos orçamentos usam o novo valor — os orçamentos já feitos continuam com o preço da época.',
    ),
    tipos.length
      ? h(
          'div',
          { class: 'tabela-responsiva' },
          h(
            'table',
            { class: 'tabela tabela-precos' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Tipo de móvel'), h('th', {}, 'Unidade'), h('th', {}, 'Preço (R$)'))),
            h(
              'tbody',
              {},
              tipos.map((t) => {
                const el = h('input', { type: 'text', inputmode: 'decimal', value: dinheiroParaCampo(t.preco_padrao_cents), 'aria-label': `Preço de ${t.nome}` });
                el.addEventListener('blur', () => {
                  const v = lerDinheiro(el.value);
                  el.classList.toggle('invalido', v === null);
                  if (v !== null) el.value = dinheiroParaCampo(v);
                });
                entradas.set(t.id, el);
                return h('tr', {}, h('td', {}, t.nome), h('td', {}, METODOS[t.metodo_calculo].unidade), h('td', {}, el));
              }),
            ),
          ),
        )
      : vazio('Cadastre tipos de móveis primeiro.', h('a', { href: '#/config/tipos', class: 'botao' }, 'Ir para Tipos de móveis')),
    tipos.length ? h('div', { class: 'acoes-formulario' }, botao) : null,
  );
}

// -------------------------------------------------------- Condições de pagamento

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
    const salvo = await abrirModal(c ? 'Editar condição' : 'Nova condição de pagamento', (fechar) => formularioCondicao(c, fechar), { largo: true });
    if (salvo) recarregar();
  };
  return h(
    'section',
    { class: 'cartao' },
    h(
      'div',
      { class: 'cartao-titulo' },
      h('h2', {}, 'Condições de pagamento'),
      h('button', { type: 'button', class: 'botao botao-primario', onclick: () => editar(null) }, icone('mais'), 'Nova condição'),
    ),
    condicoes.length
      ? h(
          'div',
          { class: 'lista' },
          condicoes.map((c) =>
            h(
              'button',
              { type: 'button', class: `linha-orcamento${c.ativo ? '' : ' inativo'}`, onclick: () => editar(c) },
              h('div', { class: 'linha-principal' }, h('strong', {}, c.descricao, c.ativo ? '' : ' (inativa)'), h('span', { class: 'suave' }, descreverCondicao(c))),
            ),
          ),
        )
      : vazio('Nenhuma condição cadastrada.'),
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
  const parcelas = h('input', { type: 'number', min: '0', max: '120', inputmode: 'numeric', value: String(dados.parcelas || '') });
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
      campo('Parcelas do restante', parcelas, { classe: 'campo-metade', dica: '0 ou 1 = restante em uma vez' }),
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

async function abaConta() {
  const { usuario } = await api.get('/auth/estado');
  const nome = h('input', { type: 'text', required: true, value: usuario.nome, autocomplete: 'name' });
  const email = h('input', { type: 'email', required: true, value: usuario.email, autocomplete: 'username' });
  const atual = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const nova = h('input', { type: 'password', required: true, minlength: '6', autocomplete: 'new-password' });
  const confirmacao = h('input', { type: 'password', required: true, minlength: '6', autocomplete: 'new-password' });

  return h(
    'div',
    { class: 'colunas' },
    h(
      'form',
      {
        class: 'cartao formulario',
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
      h('div', { class: 'acoes-formulario' }, h('button', { type: 'submit', class: 'botao botao-primario' }, 'Salvar')),
    ),
    h(
      'form',
      {
        class: 'cartao formulario',
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
      campo('Senha atual', atual),
      campo('Nova senha', nova, { dica: 'Pelo menos 6 caracteres.' }),
      campo('Confirme a nova senha', confirmacao),
      h('div', { class: 'acoes-formulario' }, h('button', { type: 'submit', class: 'botao botao-primario' }, 'Alterar senha')),
    ),
  );
}

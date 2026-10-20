// Página da proposta que o cliente recebe por link (sem login).
// Mostra apenas o que vem de /api/publico — a mesma visão do PDF — e deixa o
// cliente aprovar a proposta.

import { formatarData, formatarDinheiro } from '/shared/calc.js';
import { h, icone, substituir } from '/js/ui.js';

const raiz = document.getElementById('proposta');
const token = decodeURIComponent(location.pathname.split('/p/')[1] || location.hash.slice(1) || '').replace(/\/$/, '');
const base = `/api/publico/propostas/${encodeURIComponent(token)}`;

async function pedir(metodo, caminho = '', corpo) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'X-Requested-With': 'fetch', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = new Error(dados.erro || 'Não foi possível carregar a proposta.');
    erro.status = r.status;
    throw erro;
  }
  return dados;
}

const numeroWhatsApp = (texto) => {
  let d = String(texto || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
};

const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

function dataHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function linkWhatsApp(p, mensagem) {
  const numero = numeroWhatsApp(p.empresa.whatsapp || p.empresa.telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

// ------------------------------------------------------------------ Partes

function marcaEmpresa(p) {
  const nome = p.empresa.nome || 'Proposta';
  const iniciais = nome
    .split(/\s+/)
    .filter((x) => x.length > 2)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
  return h(
    'div',
    { class: 'p-marca' },
    p.tem_logo
      ? h('img', { class: 'p-logo', src: `${base}/logo`, alt: nome })
      : h('span', { class: 'p-monograma', 'aria-hidden': 'true' }, iniciais || nome[0]),
    p.tem_logo ? null : h('strong', {}, nome),
  );
}

function faixaSituacao(p) {
  const s = p.situacao;
  if (s.status === 'aprovado') {
    return h(
      'div',
      { class: 'p-faixa p-faixa-ok', role: 'status' },
      icone('aprovado'),
      h(
        'div',
        {},
        h('strong', {}, 'Proposta aprovada'),
        h('span', {}, [s.aprovado_por ? `por ${s.aprovado_por}` : '', s.aprovado_em ? `em ${dataHora(s.aprovado_em)}` : ''].filter(Boolean).join(' ')),
      ),
    );
  }
  if (s.status === 'expirado') {
    return h(
      'div',
      { class: 'p-faixa p-faixa-alerta', role: 'status' },
      icone('relogio'),
      h('div', {}, h('strong', {}, `Esta proposta venceu em ${formatarData(p.data_validade)}`), h('span', {}, 'Fale com a gente para receber os valores atualizados.')),
    );
  }
  if (['recusado', 'cancelado'].includes(s.status)) {
    return h(
      'div',
      { class: 'p-faixa p-faixa-alerta', role: 'status' },
      icone('alerta'),
      h('div', {}, h('strong', {}, 'Esta proposta não está mais disponível'), h('span', {}, 'Se quiser retomar, fale com a gente.')),
    );
  }
  return null;
}

function ambientes(p) {
  return h(
    'section',
    { class: 'p-secao', 'aria-labelledby': 'titulo-ambientes' },
    h('h2', { id: 'titulo-ambientes', class: 'p-titulo-secao' }, 'O que está incluído'),
    p.ambientes.map((a, i) =>
      h(
        'article',
        { class: 'p-ambiente' },
        h(
          'header',
          {},
          h('span', { class: 'p-indice' }, String(i + 1).padStart(2, '0')),
          h('div', {}, h('h3', {}, a.nome), a.descricao ? h('p', {}, a.descricao) : null),
        ),
        h(
          'ul',
          { class: 'p-itens' },
          a.itens.length
            ? a.itens.map((item) =>
                h(
                  'li',
                  {},
                  h('span', { class: 'p-item-nome' }, item.descricao, item.quantidade > 1 ? h('small', {}, ` × ${item.quantidade}`) : null),
                  h('span', { class: 'p-valor' }, formatarDinheiro(item.valor_cents)),
                ),
              )
            : h('li', { class: 'p-vazio' }, 'Itens a definir'),
        ),
        h('footer', {}, h('span', {}, `Subtotal ${a.nome}`), h('strong', { class: 'p-valor' }, formatarDinheiro(a.subtotal_cents))),
      ),
    ),
    p.servicos.length
      ? h(
          'article',
          { class: 'p-ambiente p-servicos' },
          h('header', {}, h('span', { class: 'p-indice' }, '+'), h('div', {}, h('h3', {}, 'Serviços'))),
          h(
            'ul',
            { class: 'p-itens' },
            p.servicos.map((s) =>
              h(
                'li',
                {},
                h('span', { class: 'p-item-nome' }, s.descricao, s.quantidade > 1 ? h('small', {}, ` × ${s.quantidade}`) : null),
                h('span', { class: 'p-valor' }, formatarDinheiro(s.valor_cents)),
              ),
            ),
          ),
        )
      : null,
  );
}

function investimento(p) {
  const linha = (rotulo, valor, classe = '') => h('div', { class: `p-linha ${classe}` }, h('span', {}, rotulo), h('strong', { class: 'p-valor' }, valor));
  const ajustes = p.acrescimo || p.desconto_cents;
  return h(
    'section',
    { class: 'p-investimento', 'aria-label': 'Investimento' },
    ajustes ? linha('Subtotal', formatarDinheiro(p.subtotal_cents)) : null,
    p.acrescimo ? linha(p.acrescimo.descricao, formatarDinheiro(p.acrescimo.valor_cents)) : null,
    p.desconto_cents ? linha('Desconto', `− ${formatarDinheiro(p.desconto_cents)}`, 'p-desconto') : null,
    h('div', { class: 'p-total' }, h('span', {}, 'Investimento total'), h('strong', { class: 'p-valor' }, formatarDinheiro(p.total_cents))),
    p.pagamento.descricao || p.pagamento.linhas.length
      ? h(
          'div',
          { class: 'p-pagamento' },
          p.pagamento.descricao ? h('strong', {}, p.pagamento.descricao) : null,
          p.pagamento.linhas.map((l) => h('span', {}, l)),
        )
      : null,
  );
}

function condicoes(p) {
  const par = (rotulo, valor) => (valor ? h('div', { class: 'p-par' }, h('dt', {}, rotulo), h('dd', {}, valor)) : null);
  const observacoes = String(p.observacoes || '')
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  return h(
    'section',
    { class: 'p-secao', 'aria-labelledby': 'titulo-condicoes' },
    h('h2', { id: 'titulo-condicoes', class: 'p-titulo-secao' }, 'Condições'),
    h(
      'dl',
      { class: 'p-condicoes' },
      par('Pagamento', p.pagamento.descricao),
      par('Prazo de entrega', p.prazo_entrega),
      par('Validade', `${formatarData(p.data_validade)} (${p.validade_dias} dias)`),
      par('Data da proposta', formatarData(p.data)),
    ),
    observacoes.length ? h('ul', { class: 'p-observacoes' }, observacoes.map((o) => h('li', {}, o))) : null,
  );
}

function rodape(p) {
  const e = p.empresa;
  const local = [e.endereco, [e.cidade, e.estado].filter(Boolean).join(' – ')].filter(Boolean).join(' · ');
  return h(
    'footer',
    { class: 'p-rodape' },
    h('strong', {}, e.nome),
    h('span', {}, [e.telefone, e.whatsapp && e.whatsapp !== e.telefone ? `WhatsApp ${e.whatsapp}` : '', e.email].filter(Boolean).join(' · ')),
    local ? h('span', {}, local) : null,
    e.cnpj ? h('span', {}, `CNPJ ${e.cnpj}`) : null,
    h('a', { class: 'p-feito', href: '/', rel: 'noopener' }, 'feito com esquadro'),
  );
}

function barraAcoes(p) {
  const whats = linkWhatsApp(p, `Olá! Tenho uma dúvida sobre a proposta nº ${p.numero}.`);
  return h(
    'div',
    { class: 'p-barra' },
    h('div', { class: 'p-barra-total' }, h('span', {}, 'Total'), h('strong', { class: 'p-valor' }, formatarDinheiro(p.total_cents))),
    h(
      'div',
      { class: 'p-barra-botoes' },
      whats
        ? h('a', { class: 'p-botao p-botao-sec', href: whats, target: '_blank', rel: 'noopener' }, icone('whatsapp'), h('span', { class: 'p-texto-botao' }, 'Tirar dúvidas'))
        : null,
      p.situacao.pode_aprovar
        ? h('button', { type: 'button', class: 'p-botao p-botao-principal', onclick: () => aprovar(p) }, icone('check'), 'Aprovar proposta')
        : h('a', { class: 'p-botao p-botao-sec', href: `${base}/pdf` }, icone('baixar'), h('span', { class: 'p-texto-botao' }, 'Baixar PDF')),
    ),
  );
}

// ----------------------------------------------------------------- Aprovar

function aprovar(p) {
  const dialogo = h('dialog', { class: 'p-modal', 'aria-labelledby': 'titulo-aprovar' });
  const nome = h('input', { type: 'text', id: 'nome-aprovacao', autocomplete: 'name', maxlength: '100', required: true, value: p.cliente.nome || '' });
  const aceite = h('input', { type: 'checkbox', id: 'aceite' });
  const erro = h('p', { class: 'p-erro', role: 'alert', hidden: true });
  const botao = h('button', { type: 'submit', class: 'p-botao p-botao-principal p-botao-bloco' }, icone('check'), 'Confirmar aprovação');
  const atualizar = h('button', { type: 'button', class: 'p-botao p-botao-bloco', hidden: true, onclick: () => location.reload() }, 'Atualizar proposta e conferir');
  const fechar = () => {
    dialogo.close();
    dialogo.remove();
  };
  dialogo.addEventListener('cancel', fechar);
  dialogo.append(
    h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          erro.hidden = true;
          if (!aceite.checked) {
            erro.textContent = 'Marque a caixa confirmando que leu e concorda com a proposta.';
            erro.hidden = false;
            return;
          }
          botao.disabled = true;
          try {
            const atualizada = await pedir('POST', '/aprovar', { nome: nome.value, aceite: true, versao_proposta: p.versao_proposta });
            fechar();
            mostrar(atualizada, { acabouDeAprovar: true });
          } catch (falha) {
            erro.textContent = falha.message;
            erro.hidden = false;
            botao.disabled = falha.status === 409;
            atualizar.hidden = falha.status !== 409;
            if (falha.status === 409) aceite.checked = false;
          }
        },
      },
      h('div', { class: 'p-modal-topo' }, h('h2', { id: 'titulo-aprovar' }, `Aprovar a proposta nº ${p.numero}`), h('button', { type: 'button', class: 'p-fechar', 'aria-label': 'Fechar', onclick: fechar }, '×')),
      h('div', { class: 'p-modal-total' }, h('span', {}, 'Investimento total'), h('strong', { class: 'p-valor' }, formatarDinheiro(p.total_cents))),
      p.pagamento.descricao ? h('p', { class: 'p-suave' }, p.pagamento.descricao) : null,
      h('label', { class: 'p-rotulo', for: 'nome-aprovacao' }, 'Seu nome completo'),
      nome,
      h('label', { class: 'p-aceite', for: 'aceite' }, aceite, h('span', {}, 'Li a proposta e concordo com os itens, os valores e as condições.')),
      erro,
      botao,
      atualizar,
      h('p', { class: 'p-suave p-pequeno' }, `${p.empresa.nome || 'A empresa'} recebe a aprovação na hora e entra em contato para os próximos passos.`),
    ),
  );
  document.body.append(dialogo);
  dialogo.showModal();
  nome.focus();
}

function agradecimento(p) {
  const whats = linkWhatsApp(p, `Olá! Acabei de aprovar a proposta nº ${p.numero}.`);
  return h(
    'section',
    { class: 'p-obrigado', role: 'status' },
    h('span', { class: 'p-obrigado-selo' }, icone('check')),
    h('h2', {}, `Obrigado, ${primeiroNome(p.situacao.aprovado_por || p.cliente.nome)}!`),
    h('p', {}, `Sua aprovação foi registrada. ${p.empresa.nome || 'A empresa'} já foi avisada e vai falar com você sobre os próximos passos.`),
    whats ? h('a', { class: 'p-botao p-botao-sec', href: whats, target: '_blank', rel: 'noopener' }, icone('whatsapp'), 'Avisar pelo WhatsApp') : null,
  );
}

// ------------------------------------------------------------------ Página

function mostrar(p, { acabouDeAprovar = false } = {}) {
  document.title = `Proposta nº ${p.numero} · ${p.empresa.nome || 'Móveis planejados'}`;
  raiz.className = 'p-pagina';
  raiz.removeAttribute('aria-busy');
  const nome = primeiroNome(p.cliente.nome);
  substituir(
    raiz,
    h('header', { class: 'p-topo' }, marcaEmpresa(p), h('a', { class: 'p-link-pdf', href: `${base}/pdf` }, icone('baixar'), h('span', {}, 'PDF'))),
    h(
      'section',
      { class: 'p-capa' },
      h('span', { class: 'p-sobre' }, `Proposta nº ${p.numero}`),
      h('h1', {}, nome ? `Olá, ${nome}.` : 'Sua proposta'),
      h(
        'p',
        { class: 'p-intro' },
        `Preparamos esta proposta de móveis planejados sob medida para você. Confira os ambientes, os valores e as condições — e aprove por aqui mesmo quando estiver tudo certo.`,
      ),
      h(
        'dl',
        { class: 'p-meta' },
        h('div', {}, h('dt', {}, 'Data'), h('dd', {}, formatarData(p.data))),
        h('div', {}, h('dt', {}, 'Válida até'), h('dd', {}, formatarData(p.data_validade))),
        p.prazo_entrega ? h('div', {}, h('dt', {}, 'Prazo de entrega'), h('dd', {}, p.prazo_entrega)) : null,
      ),
      acabouDeAprovar ? null : faixaSituacao(p),
    ),
    acabouDeAprovar ? agradecimento(p) : null,
    ambientes(p),
    investimento(p),
    condicoes(p),
    rodape(p),
    barraAcoes(p),
  );
  if (acabouDeAprovar) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function falha(mensagem) {
  raiz.className = 'p-pagina p-falha';
  raiz.removeAttribute('aria-busy');
  substituir(
    raiz,
    h('span', { class: 'p-obrigado-selo p-selo-alerta' }, icone('alerta')),
    h('h1', {}, 'Não encontramos esta proposta'),
    h('p', {}, mensagem),
    h('p', { class: 'p-suave' }, 'Confira se o link está completo ou peça um novo para quem enviou.'),
  );
}

pedir('GET')
  .then((p) => mostrar(p))
  .catch((e) => falha(e.message));

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
  const nomePrincipal = nome.replace(/\s+planejados?$/i, '').trim() || nome;
  return h(
    'div',
    { class: 'p-marca' },
    p.tem_logo ? h('img', { class: 'p-logo', src: `${base}/logo`, alt: nome }) : null,
    p.tem_logo ? null : h('span', { class: 'p-marca-nome' }, h('strong', {}, nomePrincipal), h('small', {}, 'PLANEJADOS')),
  );
}

function capa(p) {
  const quantidade = p.ambientes.reduce((total, ambiente) => total + ambiente.itens.length, 0);
  return h('section', { class: 'p-folha p-folha-capa', 'aria-labelledby': 'titulo-proposta' },
    h('header', { class: 'p-topo' }, marcaEmpresa(p),
      h('div', { class: 'p-identificacao' }, h('span', {}, 'Proposta'), h('strong', {}, `Nº ${p.numero}`)),
    ),
    h('div', { class: 'p-apresentacao' },
      h('span', { class: 'p-sobre' }, 'Móveis feitos para o seu espaço'),
      h('h1', { id: 'titulo-proposta' }, 'Seu projeto,', h('br'), 'em cada detalhe.'),
      h('span', { class: 'p-assinatura', 'aria-hidden': 'true' }),
      h('p', { class: 'p-intro' }, 'Uma proposta de móveis planejados', h('br'), 'feita sob medida para o seu espaço.'),
    ),
    h('div', { class: 'p-capa-resumo p-vidro' },
      h('span', { class: 'p-sobre' }, 'Preparado para'),
      h('p', { class: 'p-cliente-nome' }, p.cliente.nome || 'Cliente'),
      h('dl', { class: 'p-meta' },
        h('div', {}, h('dt', {}, 'Emissão'), h('dd', {}, formatarData(p.data))),
        h('div', {}, h('dt', {}, 'Válida até'), h('dd', {}, formatarData(p.data_validade))),
        h('div', {}, h('dt', {}, 'Entrega'), h('dd', {}, p.prazo_entrega || 'A combinar')),
      ),
      h('div', { class: 'p-capa-investimento' },
        h('div', {}, h('span', { class: 'p-sobre' }, 'Investimento total'), h('strong', { class: 'p-valor' }, formatarDinheiro(p.total_cents))),
        h('span', { class: 'p-escopo' }, `${p.ambientes.length} ${p.ambientes.length === 1 ? 'ambiente' : 'ambientes'} · ${quantidade} ${quantidade === 1 ? 'móvel' : 'móveis'}`),
      ),
    ),
    h('a', { class: 'p-link-pdf', href: `${base}/pdf` }, icone('baixar'), 'Baixar PDF'),
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
    h('span', { class: 'p-sobre' }, 'O que está incluído'),
    h('h2', { id: 'titulo-ambientes', class: 'p-titulo-secao' }, 'O seu projeto'),
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
                  h('span', { class: 'p-item-nome' }, h('span', {}, item.descricao), h('small', {}, `${item.quantidade || 1} ${(item.quantidade || 1) === 1 ? 'unidade' : 'unidades'}`)),
                  h('span', { class: 'p-valor' }, formatarDinheiro(item.valor_cents)),
                ),
              )
            : h('li', { class: 'p-vazio' }, 'Itens a definir'),
        ),
        h('footer', {}, h('span', {}, 'Total do ambiente'), h('strong', { class: 'p-valor' }, formatarDinheiro(a.subtotal_cents))),
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
                h('span', { class: 'p-item-nome' }, h('span', {}, s.descricao), h('small', {}, `${s.quantidade || 1} ${(s.quantidade || 1) === 1 ? 'unidade' : 'unidades'}`)),
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
    h('div', { class: 'p-total p-vidro' }, h('span', { class: 'p-sobre' }, 'Investimento total'), h('strong', { class: 'p-valor' }, formatarDinheiro(p.total_cents))),
  );
}

function condicoes(p) {
  const par = (rotulo, valor) => (valor ? h('div', { class: 'p-par' }, h('dt', {}, rotulo), h('dd', {}, valor)) : null);
  const entrada = p.pagamento.linhas.find((linha) => /^entrada\s*:/i.test(linha));
  const restante = p.pagamento.linhas.filter((linha) => !/^entrada\s*:/i.test(linha));
  const percentual = p.pagamento.descricao.match(/(\d{1,3}%)\s*(?:de entrada)?/i)?.[1];
  const observacoes = String(p.observacoes || '')
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  return h(
    'section',
    { class: 'p-secao p-secao-condicoes', 'aria-labelledby': 'titulo-condicoes' },
    h('div', { class: 'p-condicoes-painel' },
      h('h2', { id: 'titulo-condicoes' }, 'Pagamento e prazo'),
      h('dl', { class: 'p-condicoes' },
        par(percentual ? `Entrada · ${percentual}` : 'Pagamento', entrada ? entrada.replace(/^entrada\s*:\s*/i, '') : p.pagamento.descricao || 'Conforme combinado'),
        par('Restante', restante.join(' · ') || 'Conforme combinado'),
        par('Entrega', p.prazo_entrega || 'A combinar'),
        par('Validade', `Até ${formatarData(p.data_validade)}`),
      ),
    ),
    observacoes.length ? h('div', { class: 'p-observacoes' }, h('span', { class: 'p-sobre' }, 'Observações'), observacoes.map((o) => h('p', {}, o))) : null,
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
        ? h('a', { class: 'p-botao p-botao-sec', href: whats, 'aria-label': 'Tirar dúvidas pelo WhatsApp', target: '_blank', rel: 'noopener' }, icone('whatsapp'), h('span', { class: 'p-texto-botao' }, 'Tirar dúvidas'))
        : null,
      p.situacao.pode_aprovar
        ? h('button', { type: 'button', class: 'p-botao p-botao-principal', 'aria-label': 'Aprovar proposta', onclick: () => aprovar(p) }, icone('check'), h('span', {}, 'Aprovar', h('span', { class: 'p-texto-aprovar-completo' }, ' proposta')))
        : h('a', { class: 'p-botao p-botao-sec', href: `${base}/pdf`, 'aria-label': 'Baixar proposta em PDF' }, icone('baixar'), h('span', { class: 'p-texto-botao' }, 'Baixar PDF')),
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
  substituir(
    raiz,
    capa(p),
    h('div', { class: 'p-folha p-folha-detalhes' },
      h('header', { class: 'p-cabecalho-detalhes' }, h('span', {}, p.empresa.nome), h('span', {}, `Proposta nº ${p.numero}`)),
      h('div', { class: 'p-projeto' },
        acabouDeAprovar ? agradecimento(p) : faixaSituacao(p),
        ambientes(p),
      ),
      h('aside', { class: 'p-resumo-proposta', 'aria-label': 'Resumo da proposta' },
        investimento(p),
        condicoes(p),
      ),
      rodape(p),
    ),
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

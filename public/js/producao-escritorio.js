// Ponte do escritório com a produção: mandar o orçamento para um funcionário
// cortar e acompanhar o andamento (com o custo de material, só aqui).
import { formatarDinheiro } from '/shared/calc.js';
import { api } from './api.js';
import { h, icone, substituir, aviso, avisoErro, abrirModal, campo } from './ui.js';

const SITUACOES = { novo: 'Novo', montando: 'Montando a lista', pronto: 'Pronto para cortar', cortando: 'Cortando', concluido: 'Concluído' };

/** Abre o modal para escolher o funcionário e escrever as instruções. */
export async function mandarParaProducao(orcamentoId, aoMandar) {
  let equipe;
  try {
    equipe = (await api.get('/funcionarios')).filter((f) => f.ativo);
  } catch (erro) {
    avisoErro(erro);
    return;
  }
  const mandado = await abrirModal(
    'Mandar para a produção',
    (fechar) => {
      if (!equipe.length) {
        return h(
          'div',
          {},
          h('p', { class: 'modal-texto' }, 'Ainda não há funcionários cadastrados. Crie o acesso de quem corta na oficina e volte aqui.'),
          h('div', { class: 'acoes-modal' }, h('a', { href: '#/config/equipe', class: 'botao botao-primario', onclick: () => fechar(null) }, 'Cadastrar equipe')),
        );
      }
      const funcionario = h('select', { required: true }, equipe.map((f) => h('option', { value: String(f.id) }, `${f.nome}${f.abertos ? ` · ${f.abertos} em aberto` : ''}`)));
      const instrucoes = h('textarea', { rows: '4', maxlength: '2000', placeholder: 'Ex.: portas com veio na vertical; cortar a cozinha primeiro.' });
      const nome = h('input', { type: 'text', maxlength: '150', placeholder: 'Opcional: ex.: Cozinha da Maria' });
      return h(
        'form',
        {
          class: 'formulario',
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              const plano = await api.post(`/orcamentos/${orcamentoId}/producao`, { funcionario_id: Number(funcionario.value), instrucoes: instrucoes.value, nome: nome.value });
              aviso(`Mandado para ${plano.funcionario_nome}. Aparece agora nos trabalhos dele.`);
              fechar(plano);
            } catch (erro) {
              avisoErro(erro);
            }
          },
        },
        campo('Quem vai cortar', funcionario),
        campo('Instruções para a oficina', instrucoes, { dica: 'O funcionário vê cliente, ambientes, móveis e medidas do orçamento. Valores nunca aparecem.' }),
        campo('Nome do trabalho', nome, { dica: 'Útil quando o mesmo orçamento vai para mais de uma pessoa.' }),
        h('div', { class: 'acoes-modal' }, h('button', { type: 'submit', class: 'botao botao-primario botao-grande' }, icone('serra'), 'Mandar')),
      );
    },
    { contexto: 'Produção', largo: true },
  );
  if (mandado) aoMandar?.(mandado);
}

/** Cartão do editor com os trabalhos deste orçamento na produção. */
export function secaoProducao() {
  const lista = h('div', { class: 'producao-lista' });
  let orcamentoId = null;
  const botao = h('button', { type: 'button', class: 'botao', onclick: () => orcamentoId && mandarParaProducao(orcamentoId, () => carregar()) }, icone('serra'), 'Mandar para a produção');
  const secao = h(
    'section',
    { class: 'cartao producao-secao', hidden: true },
    h('div', { class: 'cartao-titulo' }, h('h2', {}, icone('serra'), 'Produção'), botao),
    lista,
  );
  async function carregar() {
    if (!orcamentoId) return;
    try {
      const planos = await api.get(`/orcamentos/${orcamentoId}/producao`);
      substituir(
        lista,
        planos.length
          ? planos.map((p) => {
              const custo = p.custo ? (p.custo.chapas_cents || 0) + (p.custo.fitas_cents || 0) : 0;
              const parte = custo && p.orcamento_total_cents ? ` · ${String(Math.round((custo / p.orcamento_total_cents) * 1000) / 10).replace('.', ',')}% do orçamento` : '';
              const andamento = p.situacao === 'cortando' && p.passos ? ` · ${Math.round((p.passo / p.passos) * 100)}%` : '';
              return h(
                'a',
                { href: `/producao/#/plano/${p.id}`, class: 'producao-linha' },
                h('span', { class: `producao-situacao producao-situacao-${p.situacao}` }, `${SITUACOES[p.situacao] || p.situacao}${andamento}`),
                h('strong', {}, p.nome),
                h(
                  'small',
                  {},
                  [
                    p.funcionario_nome ? `com ${p.funcionario_nome}` : '',
                    p.chapas ? `${p.chapas} ${p.chapas === 1 ? 'chapa' : 'chapas'}` : '',
                    custo ? `material ${formatarDinheiro(custo)}${parte}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ),
                icone('externo', 'icone icone-mini'),
              );
            })
          : h('p', { class: 'suave' }, 'Este orçamento ainda não foi para a produção. Quando for aprovado, mande para quem vai cortar.'),
      );
    } catch {
      substituir(lista, h('p', { class: 'suave' }, 'Não foi possível carregar a produção agora.'));
    }
  }
  return {
    elemento: secao,
    definir(id) {
      if (id === orcamentoId) return;
      orcamentoId = id || null;
      secao.hidden = !orcamentoId;
      carregar();
    },
    recarregar: carregar,
  };
}

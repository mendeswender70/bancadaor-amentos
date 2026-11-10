// Ponte do escritório com a produção: mandar o orçamento para um funcionário
// cortar e acompanhar o andamento (com o custo de material, só aqui).
import { formatarDinheiro } from '/shared/calc.js';
import { api } from './api.js';
import { h, icone, substituir, aviso, avisoErro, abrirModal, campo, confirmar } from './ui.js';
import { baixarAnexo, ehPdf, enviarAnexo, formatarTamanho } from './anexos.js';

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
      const arquivos = h('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true });
      return h(
        'form',
        {
          class: 'formulario',
          onsubmit: async (e) => {
            e.preventDefault();
            const botao = e.submitter;
            const original = botao ? [...botao.childNodes] : [];
            if (botao) botao.disabled = true;
            // Se não mandou, o botão volta ao normal para tentar de novo.
            const destravar = () => {
              if (!botao) return;
              botao.disabled = false;
              botao.replaceChildren(...original);
            };
            let plano;
            try {
              plano = await api.post(`/orcamentos/${orcamentoId}/producao`, { funcionario_id: Number(funcionario.value), instrucoes: instrucoes.value, nome: nome.value });
            } catch (erro) {
              destravar();
              avisoErro(erro);
              return;
            }
            // O trabalho já foi criado. O projeto vai no orçamento: todos os trabalhos dele veem.
            let falhas = 0;
            for (const arquivo of arquivos.files) {
              try {
                await enviarAnexo(arquivo, { orcamento_id: orcamentoId }, (f) => {
                  if (botao) botao.textContent = `Enviando ${arquivo.name} ${Math.round(f * 100)}%`;
                });
              } catch (erro) {
                falhas++;
                avisoErro(erro);
              }
            }
            aviso(`Mandado para ${plano.funcionario_nome}. Aparece agora nos trabalhos dele.${falhas ? ' Algum anexo não foi enviado: tente de novo no cartão Produção.' : ''}`);
            fechar(plano);
          },
        },
        campo('Quem vai cortar', funcionario),
        campo('Instruções para a oficina', instrucoes, { dica: 'O funcionário vê cliente, ambientes, móveis e medidas do orçamento. Valores nunca aparecem.' }),
        campo('Nome do trabalho', nome, { dica: 'Útil quando o mesmo orçamento vai para mais de uma pessoa.' }),
        campo('Projeto (PDF do arquiteto ou fotos)', arquivos, { dica: 'Opcional. Fica no orçamento e aparece para quem for cortar, para conferir as medidas. Até 25 MB por arquivo.' }),
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
  const anexosEl = h('div', { class: 'producao-anexos' });
  const entrada = h('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, hidden: true });
  let orcamentoId = null;
  const botao = h('button', { type: 'button', class: 'botao', onclick: () => orcamentoId && mandarParaProducao(orcamentoId, () => carregar()) }, icone('serra'), 'Mandar para a produção');
  const secao = h(
    'section',
    { class: 'cartao producao-secao', hidden: true },
    h('div', { class: 'cartao-titulo' }, h('h2', {}, icone('serra'), 'Produção'), botao),
    lista,
    h(
      'div',
      { class: 'producao-projeto' },
      h('div', { class: 'producao-projeto-titulo' }, h('strong', {}, 'Projeto para a produção'), h('button', { type: 'button', class: 'botao botao-pequeno', onclick: () => entrada.click() }, icone('mais', 'icone icone-mini'), 'Anexar')),
      h('p', { class: 'suave pequeno' }, 'PDF do arquiteto e fotos. Quem corta vê junto com o trabalho, para conferir de onde vem cada medida. Até 25 MB por arquivo.'),
      anexosEl,
      entrada,
    ),
  );
  entrada.addEventListener('change', async () => {
    const arquivos = [...entrada.files];
    entrada.value = '';
    for (const arquivo of arquivos) {
      const estado = h('small', { class: 'suave' }, 'Preparando…');
      anexosEl.append(h('div', { class: 'producao-anexo' }, icone('historico', 'icone icone-mini'), h('span', {}, arquivo.name), estado));
      try {
        await enviarAnexo(arquivo, { orcamento_id: orcamentoId }, (f) => {
          estado.textContent = `${Math.round(f * 100)}%`;
        });
        aviso(`"${arquivo.name}" anexado ao orçamento.`);
      } catch (erro) {
        avisoErro(erro);
      }
    }
    carregarAnexos();
  });
  async function carregarAnexos() {
    if (!orcamentoId) return;
    try {
      const anexos = await api.get(`/orcamentos/${orcamentoId}/anexos`);
      substituir(
        anexosEl,
        anexos.length
          ? anexos.map((a) =>
              h(
                'div',
                { class: 'producao-anexo' },
                icone(ehPdf(a) ? 'pdf' : 'olho', 'icone icone-mini'),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'link-botao',
                    onclick: async () => {
                      try {
                        const blob = await baixarAnexo(a);
                        const url = URL.createObjectURL(blob);
                        const link = h('a', { href: url, download: a.nome });
                        document.body.append(link);
                        link.click();
                        link.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 60_000);
                      } catch (erro) {
                        avisoErro(erro);
                      }
                    },
                  },
                  a.nome,
                ),
                h('small', { class: 'suave' }, formatarTamanho(a.tamanho)),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'botao-icone',
                    'aria-label': `Excluir ${a.nome}`,
                    onclick: async () => {
                      if (!(await confirmar(`Excluir "${a.nome}"? Quem corta deixa de ver este anexo.`, { sim: 'Excluir', perigo: true }))) return;
                      try {
                        await api.delete(`/producao/anexos/${a.id}`);
                        carregarAnexos();
                      } catch (erro) {
                        avisoErro(erro);
                      }
                    },
                  },
                  icone('lixeira', 'icone icone-mini'),
                ),
              ),
            )
          : h('p', { class: 'suave pequeno' }, 'Nenhum arquivo anexado ainda.'),
      );
    } catch {
      substituir(anexosEl, h('p', { class: 'suave pequeno' }, 'Não foi possível carregar os anexos agora.'));
    }
  }
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
      carregarAnexos();
    },
    recarregar: () => {
      carregar();
      carregarAnexos();
    },
  };
}

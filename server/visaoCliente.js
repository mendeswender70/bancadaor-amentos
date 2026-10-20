import { descreverPagamento, formatarNumero } from '../public/shared/calc.js';

/**
 * Tudo o que o cliente pode ver de um orçamento — e nada além disso.
 *
 * O PDF (e qualquer futuro link público ou integração) deve ser montado
 * somente a partir deste objeto. Ele é construído por lista de campos
 * permitidos: preço por metro, preço por m², medidas usadas no cálculo,
 * fórmulas, preço padrão, desconto percentual e observações internas
 * nunca são copiados para cá.
 */
export function visaoCliente(orc, empresa) {
  const cliente = orc.cliente || {};
  return {
    empresa: {
      nome: empresa.nome,
      cnpj: empresa.cnpj,
      telefone: empresa.telefone,
      whatsapp: empresa.whatsapp,
      email: empresa.email,
      endereco: empresa.endereco,
      cidade: empresa.cidade,
      estado: empresa.estado,
    },
    numero: formatarNumero(orc.numero),
    data: orc.data,
    validade_dias: orc.validade_dias,
    data_validade: orc.data_validade,
    cliente: {
      nome: cliente.nome,
      telefone: cliente.telefone,
      whatsapp: cliente.whatsapp,
      email: cliente.email,
      cpf_cnpj: cliente.cpf_cnpj,
      endereco: cliente.endereco,
      cidade: cliente.cidade,
      estado: cliente.estado,
    },
    ambientes: orc.ambientes.map((a) => ({
      nome: a.nome,
      descricao: a.descricao,
      subtotal_cents: a.itens.reduce((soma, i) => soma + i.valor_total_cents, 0),
      itens: a.itens.map((i) => ({
        descricao: i.descricao || i.tipo_nome,
        quantidade: i.quantidade,
        valor_cents: i.valor_total_cents,
      })),
    })),
    servicos: orc.servicos.map((s) => ({
      descricao: s.descricao,
      quantidade: s.quantidade,
      valor_cents: s.total_cents,
    })),
    subtotal_cents: orc.subtotal_cents,
    acrescimo: orc.acrescimo_cents
      ? { descricao: orc.acrescimo_descricao || 'Acréscimo', valor_cents: orc.acrescimo_cents }
      : null,
    desconto_cents: orc.desconto_cents,
    total_cents: orc.total_cents,
    pagamento: {
      descricao: orc.pagamento_descricao,
      linhas: descreverPagamento(orc.total_cents, {
        entrada_tipo: orc.pagamento_entrada_tipo,
        entrada_valor: orc.pagamento_entrada_valor,
        parcelas: orc.pagamento_parcelas,
      }),
    },
    prazo_entrega: orc.prazo_entrega,
    observacoes: orc.observacoes,
  };
}

/**
 * O que a página pública da proposta recebe: a mesma visão do PDF, sem os
 * dados de contato do cliente (o link pode ser repassado adiante), mais a
 * situação da proposta para mostrar o botão de aprovar.
 */
export function propostaPublica(orc, empresa, { podeAprovar, temLogo }) {
  const visao = visaoCliente(orc, empresa);
  return {
    ...visao,
    versao_proposta: orc.versao_proposta,
    cliente: { nome: visao.cliente.nome, cidade: visao.cliente.cidade, estado: visao.cliente.estado },
    tem_logo: Boolean(temLogo),
    situacao: {
      status: orc.status,
      aprovado_em: orc.status === 'aprovado' ? orc.aprovado_em : null,
      aprovado_por: orc.status === 'aprovado' ? orc.aprovado_por : '',
      pode_aprovar: podeAprovar,
    },
  };
}

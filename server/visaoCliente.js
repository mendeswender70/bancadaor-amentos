import { descreverPagamento, formatarNumero } from '../shared/calc.js';

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
    itens: orc.itens.map((i) => ({
      descricao: i.descricao || i.tipo_nome,
      quantidade: i.quantidade,
      valor_cents: i.valor_total_cents,
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

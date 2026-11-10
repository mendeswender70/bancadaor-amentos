import { calcularOpcoesCartao, descreverPagamento, formatarNumero, ICONES_INCLUSO, TAXAS_CARTAO } from '../public/shared/calc.js';

/**
 * Itens "já está incluso" guardados como JSON (ou já lidos). Tolerante a valor
 * ausente ou inválido: a proposta nunca deixa de abrir por causa desta lista.
 */
export function lerInclusos(valor) {
  let lista = valor;
  if (typeof valor === 'string') {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((item) => item && typeof item.titulo === 'string' && item.titulo.trim())
    .map((item) => ({
      titulo: item.titulo,
      descricao: typeof item.descricao === 'string' ? item.descricao : '',
      icone: ICONES_INCLUSO.includes(item.icone) ? item.icone : 'check',
    }));
}

function taxasCartaoSalvas(orc, metodo) {
  try {
    const taxas = JSON.parse(orc.pagamento_cartao_taxas || '');
    if (
      taxas &&
      Array.isArray(taxas.credito) &&
      taxas.credito.length === 12 &&
      taxas.credito.every((taxa) => Number.isInteger(taxa) && taxa >= 0 && taxa < 10_000) &&
      (metodo !== 'tap_to_pay' || Number.isInteger(taxas.debito))
    ) return taxas;
  } catch {
    // Um registro antigo ou incompleto usa a tabela atual do canal escolhido.
  }
  return TAXAS_CARTAO[metodo];
}

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
    inclusos: lerInclusos(orc.inclusos),
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
      cartao: orc.pagamento_cartao_metodo && orc.pagamento_cartao_metodo !== 'nenhum' && orc.total_cents > 0
        ? calcularOpcoesCartao(
            orc.total_cents,
            orc.pagamento_cartao_metodo,
            orc.pagamento_cartao_parcelas,
            taxasCartaoSalvas(orc, orc.pagamento_cartao_metodo),
          )
        : null,
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

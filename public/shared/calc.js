// Regras de cálculo e formatação compartilhadas entre o servidor e o navegador.
//
// Todos os valores em dinheiro são inteiros em centavos, as medidas são
// inteiros em milímetros e os percentuais são inteiros em centésimos de
// ponto percentual (5% = 500). Assim nenhuma conta depende de ponto
// flutuante e o arredondamento acontece em um único lugar.

export const METODOS = {
  linear: { nome: 'Metro linear', unidade: 'm', sufixo: '/m' },
  quadrado: { nome: 'Metro quadrado', unidade: 'm²', sufixo: '/m²' },
  unidade: { nome: 'Por unidade', unidade: 'un.', sufixo: '/un.' },
};

export const STATUS = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  negociacao: 'Em negociação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

// Orçamentos que ainda aguardam resposta do cliente.
export const STATUS_ABERTOS = ['rascunho', 'enviado', 'negociacao'];

// Orçamentos que não viraram venda.
export const STATUS_PERDIDOS = ['recusado', 'cancelado', 'expirado'];

// Caminho normal de um orçamento (as outras situações ficam fora dele).
export const ETAPAS = ['rascunho', 'enviado', 'negociacao', 'aprovado'];

export const TIPOS_AJUSTE = ['nenhum', 'valor', 'percentual'];

// Sugestões rápidas ao criar um ambiente.
export const AMBIENTES_SUGERIDOS = [
  'Quarto do casal',
  'Quarto de solteiro',
  'Quarto infantil',
  'Sala de estar',
  'Sala de jantar',
  'Cozinha',
  'Banheiro',
  'Lavanderia',
  'Escritório',
  'Área gourmet',
  'Closet',
  'Varanda',
];

export const LIMITES = {
  medidaMm: 100_000, // 100 m
  quantidade: 9_999,
  centavos: 10_000_000_000, // R$ 100 milhões
  percentual: 10_000, // 100%
  parcelas: 120,
};

// Taxas recebidas da conta Nu Empresas em 22/10/2026. Os valores são
// centésimos de ponto percentual: 399 representa 3,99% sobre a transação.
export const TAXAS_CARTAO = {
  tap_to_pay: {
    nome: 'Tap to Pay presencial',
    recebimento: 'Recebimento na hora',
    debito: 89,
    credito: [309, 579, 609, 799, 809, 819, 949, 968, 1037, 1105, 1227, 1238],
  },
  link_pagamento: {
    nome: 'Link de pagamento',
    recebimento: 'Recebimento em até 1 dia útil',
    debito: null,
    credito: [399, 599, 699, 789, 879, 959, 1049, 1149, 1399, 1499, 1579, 1649],
  },
};

/** Calcula o total necessário para, descontada a taxa, receber o valor base. */
export function totalComTaxaCartao(baseCents, taxaCentesimosPercentual) {
  const base = Math.max(0, Math.round(Number(baseCents) || 0));
  const taxa = Math.max(0, Math.round(Number(taxaCentesimosPercentual) || 0));
  if (!base || !taxa) return base;
  if (taxa >= 10_000) return base;
  return dividirArredondando(base * 10_000, 10_000 - taxa);
}

/** Opções estimadas de débito e crédito para o canal selecionado. */
export function calcularOpcoesCartao(baseCents, metodo, parcelasMaximas = 12, taxas = TAXAS_CARTAO[metodo]) {
  if (!taxas || !['tap_to_pay', 'link_pagamento'].includes(metodo)) return null;
  const max = Math.min(12, Math.max(1, Math.floor(Number(parcelasMaximas) || 12)));
  const criarOpcao = (tipo, parcelas, taxa) => {
    const totalCents = totalComTaxaCartao(baseCents, taxa);
    return {
      tipo,
      parcelas,
      taxa_centesimos_percentual: taxa,
      taxa_cents: totalCents - Math.round(Number(baseCents) || 0),
      total_cents: totalCents,
      valores_parcelas_cents: dividirParcelas(totalCents, parcelas),
    };
  };
  return {
    canal: metodo,
    nome: taxas.nome || TAXAS_CARTAO[metodo].nome,
    recebimento: taxas.recebimento || TAXAS_CARTAO[metodo].recebimento,
    debito: metodo === 'tap_to_pay' && Number.isInteger(taxas.debito)
      ? criarOpcao('Débito à vista', 1, taxas.debito)
      : null,
    credito: (Array.isArray(taxas.credito) ? taxas.credito : []).slice(0, max).map((taxa, i) =>
      criarOpcao(i === 0 ? 'Crédito à vista' : `Crédito ${i + 1}x`, i + 1, taxa),
    ),
  };
}

// Divisão de inteiros positivos com arredondamento de metade para cima.
function dividirArredondando(numerador, divisor) {
  return Math.round(numerador / divisor);
}

// ---------------------------------------------------------------------------
// Leitura do que o usuário digita ("3,20", "1.800,00", "R$ 1800", "5%")
// ---------------------------------------------------------------------------

function normalizarDecimal(texto) {
  if (typeof texto === 'number') {
    return Number.isFinite(texto) && texto >= 0 ? String(texto) : null;
  }
  let s = String(texto ?? '')
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/%$/, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.800" é mil e oitocentos
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  return s;
}

function decimalParaInteiro(texto, casas) {
  const s = normalizarDecimal(texto);
  if (s === null) return null;
  const [inteira, fracao = ''] = s.split('.');
  const digitos = (fracao + '0'.repeat(casas + 1)).slice(0, casas + 1);
  let n = Number(inteira || 0) * 10 ** casas + Number(digitos.slice(0, casas) || 0);
  if (Number(digitos[casas]) >= 5) n += 1;
  return Number.isSafeInteger(n) ? n : null;
}

/** "1.800,00" → 180000 (centavos) */
export const lerDinheiro = (texto) => decimalParaInteiro(texto, 2);
/** "3,20" (metros) → 3200 (milímetros) */
export const lerMedida = (texto) => decimalParaInteiro(texto, 3);
/** "5" ou "5,5%" → 500 / 550 (centésimos de %) */
export const lerPercentual = (texto) => decimalParaInteiro(texto, 2);

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function separarMilhares(inteiro) {
  return String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 576000 → "R$ 5.760,00" */
export function formatarDinheiro(centavos) {
  const c = Math.round(Number(centavos) || 0);
  const abs = Math.abs(c);
  const texto = `R$ ${separarMilhares(Math.floor(abs / 100))},${String(abs % 100).padStart(2, '0')}`;
  return c < 0 ? `- ${texto}` : texto;
}

/** 180000 → "1.800,00" (para preencher campos) */
export function dinheiroParaCampo(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') return '';
  return formatarDinheiro(centavos).replace('R$ ', '');
}

/** Milésimos → "3,20" / "3,255" (mínimo de duas casas). */
export function formatarMilesimos(milesimos) {
  const n = Math.round(Number(milesimos) || 0);
  const inteira = Math.floor(n / 1000);
  let fracao = String(n % 1000).padStart(3, '0');
  if (fracao.endsWith('0')) fracao = fracao.slice(0, 2);
  return `${separarMilhares(inteira)},${fracao}`;
}

/** 3200 mm → "3,20" */
export const formatarMedida = formatarMilesimos;

/** 500 → "5" ; 550 → "5,5" */
export function formatarPercentual(centesimos) {
  const n = Math.round(Number(centesimos) || 0);
  const inteira = Math.floor(n / 100);
  const fracao = String(n % 100).padStart(2, '0').replace(/0+$/, '');
  return fracao ? `${inteira},${fracao}` : String(inteira);
}

/** "2026-09-24" → "24/09/2026" */
export function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function somarDias(iso, dias) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + Number(dias || 0)));
  return data.toISOString().slice(0, 10);
}

/** Número do orçamento com cinco dígitos: 124 → "00124" */
export function formatarNumero(numero) {
  return String(numero ?? '').padStart(5, '0');
}

// ---------------------------------------------------------------------------
// Cálculo de um móvel
// ---------------------------------------------------------------------------

/**
 * Calcula o valor de um móvel a partir da medida comercial.
 *
 * - linear:   largura × preço do metro
 * - quadrado: largura × altura = área; área × preço do m²
 * - unidade:  preço da unidade
 *
 * O valor de uma unidade é arredondado para centavos e depois multiplicado
 * pela quantidade, para que "2 × R$ 800,00" dê sempre R$ 1.600,00.
 */
export function calcularItem(item) {
  const metodo = item.metodo_calculo;
  const largura = Number(item.largura_mm) || 0;
  const altura = Number(item.altura_mm) || 0;
  const preco = Number(item.preco_unitario_interno_cents) || 0;
  const quantidade = Math.max(1, Math.floor(Number(item.quantidade) || 1));

  let medidaMilesimos = null;
  let valorUnitario = 0;
  if (metodo === 'linear') {
    medidaMilesimos = largura;
    valorUnitario = dividirArredondando(largura * preco, 1000);
  } else if (metodo === 'quadrado') {
    medidaMilesimos = dividirArredondando(largura * altura, 1000);
    valorUnitario = dividirArredondando(largura * altura * preco, 1_000_000);
  } else if (metodo === 'unidade') {
    valorUnitario = preco;
  }

  return {
    quantidade,
    medida_milesimos: medidaMilesimos,
    valor_unitario_cents: valorUnitario,
    valor_total_cents: valorUnitario * quantidade,
  };
}

/** Texto da medida para uso interno: "3,20 m", "3,20 × 2,70 = 8,64 m²". */
export function descreverMedida(item) {
  const r = calcularItem(item);
  if (item.metodo_calculo === 'linear') return `${formatarMedida(item.largura_mm)} m`;
  if (item.metodo_calculo === 'quadrado') {
    return `${formatarMedida(item.largura_mm)} × ${formatarMedida(item.altura_mm)} = ${formatarMilesimos(r.medida_milesimos)} m²`;
  }
  return `${r.quantidade} un.`;
}

/** Fórmula interna: "3,20 × R$ 1.800,00" — nunca vai para o cliente. */
export function descreverCalculo(item) {
  const r = calcularItem(item);
  const preco = formatarDinheiro(item.preco_unitario_interno_cents);
  let base;
  if (item.metodo_calculo === 'linear') base = `${formatarMedida(item.largura_mm)} m × ${preco}/m`;
  else if (item.metodo_calculo === 'quadrado') base = `${formatarMilesimos(r.medida_milesimos)} m² × ${preco}/m²`;
  else base = `${preco}/un.`;
  return r.quantidade > 1 ? `${r.quantidade} × (${base})` : base;
}

// ---------------------------------------------------------------------------
// Totais do orçamento
// ---------------------------------------------------------------------------

export function calcularAjuste(tipo, valor, base) {
  const v = Number(valor) || 0;
  if (!v || tipo === 'nenhum' || !tipo) return 0;
  if (tipo === 'percentual') return dividirArredondando(base * v, 10_000);
  if (tipo === 'valor') return v;
  return 0;
}

export function calcularServico(servico) {
  const quantidade = Math.max(1, Math.floor(Number(servico.quantidade) || 1));
  const valor = Number(servico.valor_cents) || 0;
  return { quantidade, total_cents: valor * quantidade };
}

/**
 * Subtotal = móveis + serviços adicionais.
 * Desconto e acréscimo percentuais incidem sobre o subtotal.
 * Total = subtotal + acréscimo − desconto (nunca negativo).
 */
/** Todos os móveis do orçamento, de todos os ambientes. */
export function todosOsItens(orc) {
  return orc.ambientes ? orc.ambientes.flatMap((a) => a.itens || []) : orc.itens || [];
}

export function subtotalAmbiente(ambiente) {
  return (ambiente.itens || []).reduce((s, i) => s + calcularItem(i).valor_total_cents, 0);
}

export function calcularTotais(orc) {
  const subtotalMoveis = todosOsItens(orc).reduce((s, i) => s + calcularItem(i).valor_total_cents, 0);
  const subtotalServicos = (orc.servicos || []).reduce((s, x) => s + calcularServico(x).total_cents, 0);
  const subtotal = subtotalMoveis + subtotalServicos;
  const acrescimo = calcularAjuste(orc.acrescimo_tipo, orc.acrescimo_valor, subtotal);
  const desconto = Math.min(calcularAjuste(orc.desconto_tipo, orc.desconto_valor, subtotal), subtotal + acrescimo);
  return {
    subtotal_moveis_cents: subtotalMoveis,
    subtotal_servicos_cents: subtotalServicos,
    subtotal_cents: subtotal,
    acrescimo_cents: acrescimo,
    desconto_cents: desconto,
    total_cents: subtotal + acrescimo - desconto,
  };
}

// ---------------------------------------------------------------------------
// Condições de pagamento
// ---------------------------------------------------------------------------

/** Divide um valor em parcelas; as primeiras absorvem os centavos que sobram. */
export function dividirParcelas(valor, quantidade) {
  const n = Math.max(0, Math.floor(Number(quantidade) || 0));
  if (!n || valor <= 0) return [];
  const base = Math.floor(valor / n);
  const sobra = valor - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < sobra ? 1 : 0));
}

export function calcularPagamento(total, { entrada_tipo, entrada_valor, parcelas } = {}) {
  const entrada = Math.min(calcularAjuste(entrada_tipo, entrada_valor, total), total);
  const restante = total - entrada;
  return {
    entrada_cents: entrada,
    restante_cents: restante,
    parcelas: dividirParcelas(restante, parcelas),
  };
}

/** Linhas de texto das condições de pagamento (usadas no PDF e na tela). */
export function descreverPagamento(total, pagamento) {
  const p = calcularPagamento(total, pagamento);
  const linhas = [];
  const parcelasTexto = () => {
    const grupos = [];
    for (const valor of p.parcelas) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.valor === valor) ultimo.vezes += 1;
      else grupos.push({ valor, vezes: 1 });
    }
    return grupos.map((g) => `${g.vezes}x de ${formatarDinheiro(g.valor)}`).join(' + ');
  };
  if (p.entrada_cents > 0) {
    linhas.push(`Entrada: ${formatarDinheiro(p.entrada_cents)}`);
    if (p.parcelas.length > 1) linhas.push(`Restante: ${formatarDinheiro(p.restante_cents)} em ${parcelasTexto()}`);
    else if (p.restante_cents > 0) linhas.push(`Restante: ${formatarDinheiro(p.restante_cents)}`);
  } else if (p.parcelas.length > 1) {
    linhas.push(`Parcelamento: ${parcelasTexto()}`);
  }
  return linhas;
}

/**
 * Texto da condição para o cliente, a partir da entrada e das parcelas:
 * "À vista", "50% de entrada + restante na entrega", "Entrada de R$ 1.000,00 + 3x".
 */
export function textoPagamento({ entrada_tipo, entrada_valor, parcelas } = {}) {
  const n = Math.max(0, Math.floor(Number(parcelas) || 0));
  const temEntrada = entrada_tipo !== 'nenhum' && Number(entrada_valor) > 0;
  const entrada =
    entrada_tipo === 'percentual' ? `${formatarPercentual(entrada_valor)}% de entrada` : `Entrada de ${formatarDinheiro(entrada_valor)}`;
  if (!temEntrada) return n > 1 ? `Parcelado em ${n}x` : 'À vista';
  return n > 1 ? `${entrada} + ${n}x` : `${entrada} + restante na entrega`;
}

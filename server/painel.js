import { somarDias } from '../public/shared/calc.js';
import { invalido } from './validacao.js';

export function deslocarMes(inicio, meses) {
  const [ano, mes] = inicio.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1 + meses, 1)).toISOString().slice(0, 10);
}

export function periodoComercial(hoje, escolha = 'mes') {
  if (!['mes', 'anterior', 'trimestre', 'semestre'].includes(escolha)) throw invalido('Período inválido.');
  const meses = escolha === 'semestre' ? 6 : escolha === 'trimestre' ? 3 : 1;
  const fim = deslocarMes(`${hoje.slice(0, 7)}-01`, escolha === 'anterior' ? 0 : 1);
  const inicio = deslocarMes(fim, -meses);
  return { escolha, inicio, fim, ate: somarDias(fim, -1), meses, anterior_inicio: deslocarMes(inicio, -meses) };
}

export function filtroAtencao(tipo, hoje) {
  const fuso = process.env.TZ_EMPRESA || 'America/Sao_Paulo';
  switch (tipo) {
    case 'visualizadas': return { sql: "o.status IN ('enviado','negociacao') AND o.visualizacoes > 0", params: [] };
    case 'vencimentos': return { sql: "o.status IN ('enviado','negociacao') AND o.data_validade >= ? AND o.data_validade <= ?", params: [hoje, somarDias(hoje, 7)] };
    case 'aprovados': return { sql: "o.status = 'aprovado' AND ((o.aprovado_em >= (?::date::timestamp AT TIME ZONE ?) AND o.aprovado_em < (?::date::timestamp AT TIME ZONE ?)) OR (o.aprovado_em IS NULL AND o.data >= ? AND o.data < ?))", params: [somarDias(hoje, -6), fuso, somarDias(hoje, 1), fuso, somarDias(hoje, -6), somarDias(hoje, 1)] };
    case 'sem_resposta': return { sql: "o.status = 'enviado' AND COALESCE(o.enviado_em, o.atualizado_em) < (?::date::timestamp AT TIME ZONE ?)", params: [somarDias(hoje, -5), fuso] };
    default: throw invalido('Filtro de atenção inválido.');
  }
}

export async function dadosComerciais(db, hoje, periodo, { atual, anterior, aprovadosMensais, situacoes }) {
  const atencoes = ['visualizadas', 'vencimentos', 'aprovados', 'sem_resposta'].map((tipo) => ({ tipo, ...filtroAtencao(tipo, hoje) }));
  const inicioSerie = deslocarMes(periodo.fim, -6);
  const consultas = [
    () => db.get(`SELECT ${atencoes.map((a) => `COUNT(*) FILTER (WHERE ${a.sql}) AS ${a.tipo}`).join(', ')} FROM orcamentos o`, ...atencoes.flatMap((a) => a.params)),
    () => db.all(`SELECT substring(data,1,7) AS mes, COUNT(*) AS quantidade, COALESCE(SUM(total_cents),0) AS valor_cents FROM orcamentos WHERE status <> 'cancelado' AND data >= ? AND data < ? GROUP BY 1 ORDER BY 1`, inicioSerie, periodo.fim),
    () => db.all(`SELECT CASE
        WHEN lower(a.nome) LIKE '%cozinha%' THEN 'Cozinha'
        WHEN lower(a.nome) LIKE '%quarto%' OR lower(a.nome) LIKE '%suíte%' OR lower(a.nome) LIKE '%suite%' THEN 'Quarto'
        WHEN lower(a.nome) LIKE '%sala%' THEN 'Sala'
        WHEN lower(a.nome) LIKE '%banh%' OR lower(a.nome) LIKE '%lavabo%' THEN 'Banheiro'
        ELSE 'Outros' END AS nome, COUNT(*) AS quantidade
      FROM orcamentos o LEFT JOIN LATERAL (SELECT nome FROM orcamento_ambientes WHERE orcamento_id=o.id ORDER BY ordem,id LIMIT 1) a ON true
      WHERE o.status <> 'cancelado' GROUP BY 1 ORDER BY 2 DESC,1`),
    () => db.all(`WITH eventos AS (
        SELECT 'historico-' || h.id AS chave, h.orcamento_id, NULL::integer AS cliente_id, h.evento, h.data_hora FROM orcamento_historico h WHERE h.evento NOT LIKE 'Cliente abriu%'
        UNION ALL SELECT 'cliente-' || c.id, NULL::integer, c.id, 'Cliente cadastrado', c.criado_em FROM clientes c
        UNION ALL SELECT 'visita-' || o.id, o.id, NULL::integer, 'Cliente abriu a proposta', o.ultima_visualizacao_em FROM orcamentos o WHERE o.ultima_visualizacao_em IS NOT NULL
      ) SELECT e.*, o.numero, COALESCE(e.cliente_id,o.cliente_id) AS contato_id, c.nome AS cliente_nome,
        (SELECT nome FROM orcamento_ambientes a WHERE a.orcamento_id=o.id ORDER BY a.ordem,a.id LIMIT 1) AS ambiente_nome
      FROM eventos e LEFT JOIN orcamentos o ON o.id=e.orcamento_id JOIN clientes c ON c.id=COALESCE(e.cliente_id,o.cliente_id)
      ORDER BY e.data_hora DESC,e.chave DESC LIMIT 5`),
    () => db.get(`SELECT COUNT(*) FILTER (WHERE data >= ?) AS enviados,
      COUNT(*) FILTER (WHERE data >= ? AND status='aprovado') AS aprovados,
      COUNT(*) FILTER (WHERE data < ?) AS enviados_anteriores,
      COUNT(*) FILTER (WHERE data < ? AND status='aprovado') AS aprovados_anteriores
      FROM orcamentos WHERE data >= ? AND data < ? AND status NOT IN ('rascunho','cancelado')`,
      somarDias(hoje,-89), somarDias(hoje,-89), somarDias(hoje,-89), somarDias(hoje,-89), somarDias(hoje,-179), somarDias(hoje,1)),
  ];
  const resultados = [];
  for (const consultar of consultas) resultados.push(await consultar());
  const [atencao, orcados, ambientes, atividades, conversaoAnterior] = resultados;
  const pendentes = situacoes.filter((s) => ['enviado','negociacao'].includes(s.status)).reduce((n,s) => n+s.quantidade,0);
  return {
    periodo, atual, anterior, atencao, pendentes, ambientes, atividades,
    conversao: { enviados: conversaoAnterior.enviados, aprovados: conversaoAnterior.aprovados },
    conversao_anterior: { enviados: conversaoAnterior.enviados_anteriores, aprovados: conversaoAnterior.aprovados_anteriores },
    ticket_cents: atual.validos ? Math.round(atual.valor_cents / atual.validos) : 0,
    ticket_anterior_cents: anterior.validos ? Math.round(anterior.valor_cents / anterior.validos) : 0,
    serie: Array.from({length:6},(_,i) => {
      const mes = deslocarMes(inicioSerie,i).slice(0,7);
      const orcado = orcados.find((o) => o.mes===mes);
      const aprovado = aprovadosMensais.find((o) => o.mes===mes);
      return { mes, orcado_cents: orcado?.valor_cents || 0, aprovados_cents: aprovado?.valor_cents || 0, quantidade: orcado?.quantidade || 0, aprovados: aprovado?.quantidade || 0 };
    }),
  };
}

import { somarDias } from '../public/shared/calc.js';
import { dataIso, inteiro, invalido } from './validacao.js';
import { deslocarMes } from './painel.js';
import { semAcento } from './db.js';

// O dia do aceite segue o fuso da empresa. Registros legados usam a emissão.
const BASE = `WITH base AS (
  SELECT o.*, COALESCE(to_char(o.aprovado_em AT TIME ZONE ?, 'YYYY-MM-DD'),o.data) AS aprovado_dia
  FROM orcamentos o
)`;
const fuso = () => process.env.TZ_EMPRESA || 'America/Sao_Paulo';

export function periodoRelatorio(hoje, filtros = {}) {
  const de = dataIso(filtros.de || deslocarMes(`${hoje.slice(0,7)}-01`, -5), 'Data inicial');
  const ate = dataIso(filtros.ate || hoje, 'Data final');
  if (de > ate) throw invalido('A data inicial deve ser anterior ou igual à data final.');
  if (ate > hoje) throw invalido('Escolha um período até a data de hoje.');
  const meses = (Number(ate.slice(0,4))-Number(de.slice(0,4)))*12 + Number(ate.slice(5,7))-Number(de.slice(5,7))+1;
  if (meses > 24) throw invalido('Consulte até 24 meses por vez.');
  const dias = Math.round((Date.parse(`${ate}T12:00Z`)-Date.parse(`${de}T12:00Z`))/86400000)+1;
  return { de, ate, anterior_de: somarDias(de,-dias), anterior_ate: somarDias(de,-1), dias, meses };
}

async function resumo(db, de, ate, hoje) {
  const r = await db.get(`${BASE} SELECT
    COUNT(*) FILTER (WHERE data BETWEEN ? AND ? AND status NOT IN ('rascunho','cancelado')) AS orcamentos,
    COALESCE(SUM(total_cents) FILTER (WHERE data BETWEEN ? AND ? AND status NOT IN ('rascunho','cancelado')),0) AS orcado_cents,
    COUNT(*) FILTER (WHERE data BETWEEN ? AND ? AND status NOT IN ('rascunho','cancelado')) AS apresentadas,
    COUNT(*) FILTER (WHERE data BETWEEN ? AND ? AND status='aprovado' AND aprovado_dia <= ?) AS coorte_aprovados,
    COUNT(*) FILTER (WHERE status='aprovado' AND aprovado_dia BETWEEN ? AND ?) AS aprovados,
    COALESCE(SUM(total_cents) FILTER (WHERE status='aprovado' AND aprovado_dia BETWEEN ? AND ?),0) AS aprovado_cents,
    COUNT(DISTINCT cliente_id) FILTER (WHERE status='aprovado' AND aprovado_dia BETWEEN ? AND ?) AS clientes_aprovados,
    COUNT(*) FILTER (WHERE data BETWEEN ? AND ? AND status IN ('enviado','negociacao')) AS pendentes,
    COALESCE(SUM(total_cents) FILTER (WHERE data BETWEEN ? AND ? AND status IN ('enviado','negociacao')),0) AS pendente_cents
    FROM base`, fuso(), de,ate, de,ate, de,ate, de,ate,hoje, de,ate, de,ate, de,ate, de,ate, de,ate);
  return { ...r, ticket_cents: r.aprovados ? Math.round(r.aprovado_cents/r.aprovados) : 0,
    taxa: r.apresentadas ? r.coorte_aprovados/r.apresentadas*100 : null };
}

function filtroAprovacoes(periodo, q = '') {
  const termo = String(q).trim();
  if (termo.length > 200) throw invalido('Use até 200 caracteres na busca.');
  const params = [periodo.de, periodo.ate];
  let sql = "b.status='aprovado' AND b.aprovado_dia BETWEEN ? AND ?";
  if (termo) {
    const padrao = `%${semAcento(termo).replace(/[\\%_]/g,c=>`\\${c}`)}%`;
    sql += " AND (c.nome_busca LIKE ? ESCAPE '\\' OR b.numero::text = ?)";
    params.push(padrao, /^#?\d{1,9}$/.test(termo) ? String(Number(termo.replace('#',''))) : '');
  }
  return { sql, params };
}

const COLUNAS_APROVACOES = `b.id,b.numero,b.cliente_id,c.nome AS cliente_nome,b.data,b.aprovado_dia,b.aprovado_pelo_link,b.total_cents,
  (SELECT string_agg(a.nome, ' · ' ORDER BY a.ordem,a.id) FROM orcamento_ambientes a WHERE a.orcamento_id=b.id) AS ambientes`;

export async function listarAprovacoesRelatorio(db, hoje, filtros = {}) {
  const periodo = periodoRelatorio(hoje, filtros);
  const limite = inteiro(filtros.limite ?? 20, {min:1,max:100,campo:'Limite'});
  const deslocamento = inteiro(filtros.deslocamento ?? 0, {min:0,max:1000000,campo:'Página'});
  const filtro = filtroAprovacoes(periodo, filtros.q);
  const total = await db.get(`${BASE} SELECT COUNT(*) AS quantidade, COALESCE(SUM(b.total_cents),0) AS valor_cents
    FROM base b JOIN clientes c ON c.id=b.cliente_id WHERE ${filtro.sql}`, fuso(), ...filtro.params);
  const linhas = await db.all(`${BASE} SELECT ${COLUNAS_APROVACOES}
    FROM base b JOIN clientes c ON c.id=b.cliente_id WHERE ${filtro.sql}
    ORDER BY b.aprovado_dia DESC,b.aprovado_em DESC NULLS LAST,b.numero DESC LIMIT ? OFFSET ?`, fuso(), ...filtro.params, limite, deslocamento);
  return { ...total, linhas, limite, deslocamento };
}

export async function relatorioComercial(db, hoje, filtros = {}) {
  const periodo = periodoRelatorio(hoje, filtros);
  // Consultas sequenciais também funcionam com o driver Postgres usado nos testes.
  const atual = await resumo(db, periodo.de, periodo.ate, hoje);
  const anterior = await resumo(db, periodo.anterior_de, periodo.anterior_ate, hoje);
  const mesesOrcados = await db.all(`SELECT substring(data,1,7) AS mes,COUNT(*) AS orcamentos,COALESCE(SUM(total_cents),0) AS orcado_cents
    FROM orcamentos WHERE data BETWEEN ? AND ? AND status NOT IN ('rascunho','cancelado') GROUP BY 1`,periodo.de,periodo.ate);
  const mesesAprovados = await db.all(`${BASE} SELECT substring(aprovado_dia,1,7) AS mes,COUNT(*) AS aprovados,COALESCE(SUM(total_cents),0) AS aprovado_cents
    FROM base WHERE status='aprovado' AND aprovado_dia BETWEEN ? AND ? GROUP BY 1`,fuso(),periodo.de,periodo.ate);
  const clientes = await db.all(`${BASE} SELECT c.id,c.nome,COUNT(*) AS aprovados,SUM(b.total_cents) AS valor_cents
    FROM base b JOIN clientes c ON c.id=b.cliente_id WHERE b.status='aprovado' AND b.aprovado_dia BETWEEN ? AND ?
    GROUP BY c.id,c.nome ORDER BY valor_cents DESC,c.nome,c.id LIMIT 5`,fuso(),periodo.de,periodo.ate);
  const serie = Array.from({length:periodo.meses},(_,i)=>{
    const mes = deslocarMes(`${periodo.de.slice(0,7)}-01`,i).slice(0,7);
    const orcado = mesesOrcados.find(m=>m.mes===mes), aprovado = mesesAprovados.find(m=>m.mes===mes);
    return { mes, orcamentos:orcado?.orcamentos || 0, orcado_cents:orcado?.orcado_cents || 0,
      aprovados:aprovado?.aprovados || 0, aprovado_cents:aprovado?.aprovado_cents || 0,
      ticket_cents:aprovado?.aprovados ? Math.round(aprovado.aprovado_cents/aprovado.aprovados) : 0 };
  });
  const aprovacoes = await listarAprovacoesRelatorio(db,hoje,{de:periodo.de,ate:periodo.ate});
  return { hoje, periodo, atual, anterior, serie, clientes, aprovacoes };
}

// Aspas resolvem separadores/quebras de linha; o apóstrofo neutraliza fórmulas de planilhas.
function celulaCsv(valor) {
  let s = String(valor ?? '');
  if (/^[\s]*[=+@-]/u.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g,'""')}"`;
}
export async function exportarRelatorio(db,hoje,filtros={}) {
  if (!['mensal','aprovacoes'].includes(filtros.tipo)) throw invalido('Tipo de relatório inválido.');
  const periodo = periodoRelatorio(hoje,filtros);
  const dinheiro = cents => (cents/100).toFixed(2).replace('.',',');
  const linhas = [];
  if (filtros.tipo === 'mensal') {
    const d = await relatorioComercial(db,hoje,filtros);
    linhas.push(['Mês','Orçamentos emitidos','Valor orçado (R$)','Propostas aprovadas','Valor aprovado (R$)','Ticket aprovado (R$)']);
    for (const m of d.serie) linhas.push([m.mes,m.orcamentos,dinheiro(m.orcado_cents),m.aprovados,dinheiro(m.aprovado_cents),dinheiro(m.ticket_cents)]);
    linhas.push(['TOTAL',d.atual.orcamentos,dinheiro(d.atual.orcado_cents),d.atual.aprovados,dinheiro(d.atual.aprovado_cents),dinheiro(d.atual.ticket_cents)]);
  } else {
    const filtro = filtroAprovacoes(periodo,filtros.q);
    const dados = await db.all(`${BASE} SELECT ${COLUNAS_APROVACOES} FROM base b JOIN clientes c ON c.id=b.cliente_id
      WHERE ${filtro.sql} ORDER BY b.aprovado_dia DESC,b.aprovado_em DESC NULLS LAST,b.numero DESC`, fuso(),...filtro.params);
    linhas.push(['Orçamento','Cliente','Ambientes','Emissão','Aprovação','Origem do aceite','Valor aprovado (R$)']);
    for (const o of dados) linhas.push([String(o.numero).padStart(5,'0'),o.cliente_nome,o.ambientes,o.data,o.aprovado_dia,o.aprovado_pelo_link?'Cliente':'Manual',dinheiro(o.total_cents)]);
    linhas.push(['TOTAL','','','','','',dinheiro(dados.reduce((n,o)=>n+o.total_cents,0))]);
  }
  return '\uFEFF'+linhas.map(l=>l.map(celulaCsv).join(';')).join('\r\n');
}

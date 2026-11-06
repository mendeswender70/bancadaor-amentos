import { api } from '../api.js';
import { h, icone } from '../ui.js';
import { formatarDinheiro } from '/shared/calc.js';
import { cabecalhoPagina } from '../comum.js';

export async function paginaRelatorios() {
  const d=await api.get('/dashboard');
  const baixar=()=>{
    const linhas=[['Mês','Propostas aprovadas','Valor aprovado (R$)'],...d.evolucao.map(m=>[m.mes,m.quantidade,(m.valor_cents/100).toFixed(2).replace('.',',')])];
    const blob=new Blob(['\uFEFF'+linhas.map(l=>l.join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=h('a',{href:url,download:`esquadro-aprovacoes-${d.data_hoje}.csv`});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const linhas=d.evolucao.toReversed().map(m=>h('tr',{},h('td',{},`${m.mes.slice(5)}/${m.mes.slice(0,4)}`),h('td',{},m.quantidade),h('td',{},formatarDinheiro(m.valor_cents))));
  const tabela=h('table',{class:'relatorios-tabela'},
    h('thead',{},h('tr',{},['Mês','Propostas aprovadas','Valor aprovado'].map(n=>h('th',{scope:'col'},n)))),
    h('tbody',{},linhas));
  return h('div',{class:'pagina pagina-relatorios'},
    cabecalhoPagina('Relatórios',{subtitulo:'Aprovações da sua marcenaria nos últimos 12 meses.',acoes:h('button',{type:'button',class:'botao',onclick:baixar},icone('baixar'),'Exportar CSV')}),
    h('section',{class:'pc-painel'},h('div',{class:'relatorios-tabela-scroll'},tabela)),
    h('p',{class:'pc-nota'},'Valores de propostas aprovadas, agrupados pela data da aprovação. Não representam recebimentos.'));
}

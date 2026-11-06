import { api, baixarBlob } from '../api.js';
import { h, icone, substituir, debounce, avisoErro, menuSuspenso } from '../ui.js';
import { substituirEndereco } from '../main.js';
import { desenharRelatorio, desenharAprovacoes } from '../relatorios-ui.js';

const fimMes=mes=>new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);

export async function paginaRelatorios(query=new URLSearchParams()) {
  const parametros=new URLSearchParams();
  for(const nome of ['de','ate']) if(query.get(nome)) parametros.set(nome,query.get(nome));
  let dados=await api.get(`/relatorios?${parametros}`);
  let pagina,sequencia=0,sequenciaDetalhe=0;
  let detalhe={q:'',mes:null,deslocamento:0};
  let detalheAplicado={...detalhe};
  const filtrosDetalhe=()=>{
    const p=dados.periodo,m=detalhe.mes;
    return {de:m?[p.de,`${m}-01`].sort().at(-1):p.de,ate:m?[p.ate,fimMes(m)].sort()[0]:p.ate,q:detalhe.q};
  };
  const marcarMes=()=>{
    pagina.querySelectorAll('[data-mes]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mes===detalhe.mes)));
    const aviso=pagina.querySelector('.rpt-filtro-mes');
    aviso.hidden=!detalhe.mes;
    substituir(aviso,detalhe.mes?h('span',{},`Aprovações de ${detalhe.mes.slice(5)}/${detalhe.mes.slice(0,4)}`):null,detalhe.mes?h('button',{type:'button',onclick:()=>aoMes(null)},'Mostrar todo o período','×'):null);
  };
  const carregarDetalhe=async()=>{
    const pedido=++sequenciaDetalhe;
    const erro=pagina.querySelector('.rpt-detalhe-erro'),alvo=pagina.querySelector('.rpt-detalhe-corpo');
    erro.hidden=true;alvo.setAttribute('aria-busy','true');
    const filtros={...filtrosDetalhe(),deslocamento:detalhe.deslocamento};
    try {
      const r=await api.get(`/relatorios/aprovacoes?${new URLSearchParams(filtros)}`);
      if(pedido!==sequenciaDetalhe||!pagina.isConnected)return;
      detalheAplicado={...filtros};
      substituir(alvo,desenharAprovacoes(r,{aoPagina}));
      marcarMes();
    } catch(e) {
      if(pedido!==sequenciaDetalhe||!pagina.isConnected)return;
      erro.hidden=false;
      substituir(erro,h('span',{},`${e.message} Os resultados anteriores foram mantidos.`),h('button',{type:'button',onclick:carregarDetalhe},'Tentar novamente'));
    } finally {if(pedido===sequenciaDetalhe)alvo.removeAttribute('aria-busy');}
  };
  const aoPagina=deslocamento=>{detalhe.deslocamento=deslocamento;carregarDetalhe();};
  const aoMes=mes=>{
    detalhe.mes=mes===detalhe.mes?null:mes;detalhe.deslocamento=0;
    carregarDetalhe().then(()=>pagina.querySelector('.rpt-aprovacoes')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  };
  const aoBuscar=debounce(q=>{detalhe.q=q.trim();detalhe.deslocamento=0;carregarDetalhe();},300);
  const exportar=async tipo=>{
    const filtros=tipo==='aprovacoes'?{...detalheAplicado}:dados.periodo;
    const p=new URLSearchParams({de:filtros.de||dados.periodo.de,ate:filtros.ate||dados.periodo.ate,tipo});
    if(filtros.q)p.set('q',filtros.q);
    const botao=pagina.querySelector('.rpt-exportar button');botao.disabled=true;
    try {
      const blob=await baixarBlob(`/relatorios/exportar?${p}`),url=URL.createObjectURL(blob);
      const a=h('a',{href:url,download:`esquadro-${tipo}-${p.get('de')}-${p.get('ate')}.csv`});
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) {avisoErro(e);} finally {botao.disabled=false;}
  };
  const montar=()=>{
    const menu=menuSuspenso([['orcamentos','Resumo mensal (.csv)',()=>exportar('mensal')],['aprovado','Aprovações filtradas (.csv)',()=>exportar('aprovacoes')]],{rotulo:'Exportar relatório em CSV'});
    menu.classList.add('rpt-exportar');
    const botao=menu.querySelector('button');botao.className='botao';substituir(botao,icone('baixar'),'Exportar CSV',icone('baixo'));
    const proxima=desenharRelatorio(dados,{exportar:menu,aoAplicar,aoMes,aoBuscar,aoPagina});
    pagina?.replaceWith(proxima);pagina=proxima;
  };
  const aoAplicar=async(de,ate)=>{
    const pedido=++sequencia;
    ++sequenciaDetalhe;
    const form=pagina.querySelector('.rpt-filtros form'),erro=pagina.querySelector('.rpt-filtro-erro');
    erro.hidden=true;form.setAttribute('aria-busy','true');
    const botaoAplicar=form.querySelector('button[type=submit]');botaoAplicar.textContent='Atualizando…';
    form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
    try {
      const proximo=await api.get(`/relatorios?${new URLSearchParams({de,ate})}`);
      if(pedido!==sequencia||!pagina.isConnected)return;
      dados=proximo;detalhe={q:'',mes:null,deslocamento:0};detalheAplicado={de,ate,q:''};
      montar();
      substituirEndereco(`#/relatorios?${new URLSearchParams({de,ate})}`);
      pagina.querySelector('.rpt-filtros select').focus({preventScroll:true});
    } catch(e) {
      if(pedido!==sequencia||!pagina.isConnected)return;
      erro.textContent=`${e.message} O relatório anterior foi mantido.`;erro.hidden=false;
    } finally {
      if(pedido===sequencia){botaoAplicar.textContent='Aplicar período';form.removeAttribute('aria-busy');form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);}
    }
  };
  detalheAplicado={de:dados.periodo.de,ate:dados.periodo.ate,q:''};
  montar();
  return pagina;
}

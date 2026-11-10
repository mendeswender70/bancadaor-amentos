import { api } from '../api.js';
import { avisoErro } from '../ui.js';
import { desenharDashboard } from '../gestao-dashboard.js';

export async function paginaDashboard() {
  let dados = await api.get('/dashboard');
  let periodo = 'mes', pagina, sequencia = 0, montado = false;
  const desenhar = (foco) => {
    const nova = desenharDashboard(dados,{periodo,aoMudarPeriodo:valor=>atualizar(valor,true),aoAtualizar:()=>atualizar(periodo,true)});
    pagina?.replaceWith(nova); pagina=nova;
    if (foco) pagina.querySelector(foco)?.focus({preventScroll:true});
  };
  const atualizar = async (valor=periodo,forcar=false) => {
    if (!pagina.isConnected || (!forcar && (document.hidden || document.querySelector('dialog[open],.menu-flutuante')))) return;
    const pedido=++sequencia;
    const seletor=pagina.querySelector('.pc-periodo select');
    seletor.disabled=true;
    try {
      const novos=await api.get(`/dashboard?periodo=${valor}`);
      if (pedido!==sequencia || !pagina.isConnected) return;
      const mudou=periodo!==valor || JSON.stringify(dados)!==JSON.stringify(novos);
      dados=novos;periodo=valor;
      if (mudou || forcar) desenhar(forcar?'.pc-periodo select':null);
    } catch (e) {if(forcar) avisoErro(e);}
    finally {if(pedido===sequencia){const s=pagina.querySelector('.pc-periodo select');s.disabled=false;s.value=periodo;}}
  };
  desenhar();
  const conferir=()=>atualizar();
  const intervalo=setInterval(conferir,30_000);
  window.addEventListener('focus',conferir);document.addEventListener('visibilitychange',conferir);
  const observador=new MutationObserver(()=>{
    if(pagina.isConnected) montado=true;
    else if(montado){clearInterval(intervalo);window.removeEventListener('focus',conferir);document.removeEventListener('visibilitychange',conferir);observador.disconnect();}
  });
  observador.observe(document.getElementById('conteudo')||document.body,{childList:true});
  return pagina;
}

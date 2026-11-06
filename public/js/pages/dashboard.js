import { api, cache } from '../api.js';
import { desenharDashboard } from '../gestao-dashboard.js';

export async function paginaDashboard() {
  const [d, empresa] = await Promise.all([api.get('/dashboard'), cache.carregarEmpresa()]);
  let meses = 6;
  let dadosAtuais = d;
  let pagina;
  const desenhar = () => desenharDashboard(dadosAtuais, empresa, meses, (valor) => {
    meses = valor;
    const nova = desenhar();
    pagina.replaceWith(nova);
    pagina = nova;
    pagina.querySelector('.gestao-periodo select')?.focus({ preventScroll: true });
  });
  pagina = desenhar();
  let assinatura = JSON.stringify(d);
  let carregando = false;
  let montado = false;
  const atualizar = async () => {
    if (carregando || !pagina.isConnected || document.hidden || document.querySelector('dialog[open]')) return;
    carregando = true;
    try {
      const dados = await api.get('/dashboard');
      const proxima = JSON.stringify(dados);
      if (pagina.isConnected && !document.querySelector('dialog[open]') && proxima !== assinatura) {
        dadosAtuais = dados;
        const nova = desenhar();
        pagina.replaceWith(nova);
        pagina = nova;
        assinatura = proxima;
      }
    } catch {
      // Mantém os dados atuais e tenta novamente ao voltar à tela ou no próximo ciclo.
    } finally { carregando = false; }
  };
  const intervalo = setInterval(atualizar, 30_000);
  window.addEventListener('focus', atualizar);
  document.addEventListener('visibilitychange', atualizar);
  const observador = new MutationObserver(() => {
    if (pagina.isConnected) montado = true;
    else if (montado) {
      clearInterval(intervalo);
      window.removeEventListener('focus', atualizar);
      document.removeEventListener('visibilitychange', atualizar);
      observador.disconnect();
    }
  });
  observador.observe(document.getElementById('conteudo') || document.body, { childList: true });
  return pagina;
}

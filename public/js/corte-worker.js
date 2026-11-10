// Calcula o plano de corte fora da tela principal, para a página não travar.
import { otimizarPlano } from '/shared/corte.js';

self.addEventListener('message', (evento) => {
  try {
    self.postMessage({ ok: true, resultado: otimizarPlano(evento.data) });
  } catch (erro) {
    self.postMessage({ ok: false, erro: erro?.message || String(erro) });
  }
});

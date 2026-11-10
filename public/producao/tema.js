// Executado antes das folhas de estilo para aplicar o tema sem piscar.
// Na produção o padrão é seguir o aparelho.
(() => {
  let preferencia = 'sistema';
  try {
    const salva = localStorage.getItem('esquadro.producao.tema');
    if (['claro', 'escuro', 'sistema'].includes(salva)) preferencia = salva;
  } catch { /* Armazenamento bloqueado: segue o aparelho. */ }
  const escuro = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const tema = preferencia === 'sistema' ? (escuro ? 'escuro' : 'claro') : preferencia;
  document.documentElement.dataset.temaPreferencia = preferencia;
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#f3efe8' : '#110f0c');
})();

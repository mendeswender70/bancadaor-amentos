// Executado antes das folhas de estilo para restaurar a preferência sem piscar.
(() => {
  let preferencia = 'escuro';
  try {
    const salva = localStorage.getItem('esquadro.tema');
    if (['claro', 'escuro', 'sistema'].includes(salva)) preferencia = salva;
  } catch { /* Navegadores que bloqueiam armazenamento mantêm o padrão escuro. */ }
  const tema = preferencia === 'sistema'
    ? (typeof window.matchMedia === 'function' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro') : 'escuro')
    : preferencia;
  document.documentElement.dataset.temaPreferencia = preferencia;
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#f6f3ed' : '#100d0b');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', tema === 'claro' ? 'default' : 'black-translucent');
})();

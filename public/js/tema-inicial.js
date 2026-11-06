// Executado antes das folhas de estilo para restaurar a preferência sem piscar.
(() => {
  let tema = 'escuro';
  try {
    if (localStorage.getItem('esquadro.tema') === 'claro') tema = 'claro';
  } catch { /* Navegadores que bloqueiam armazenamento mantêm o padrão escuro. */ }
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#f6f3ed' : '#100d0b');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', tema === 'claro' ? 'default' : 'black-translucent');
})();

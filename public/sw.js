/* Service worker mínimo do esquadro: recebe push e abre o app no toque. */
self.addEventListener('install', (evento) => evento.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data?.json() || {};
  } catch {
    dados.texto = evento.data?.text() || '';
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || 'Atualização no esquadro', {
      body: dados.texto || 'Uma nova versão está disponível. Abra o app para ver as novidades.',
      icon: '/icons/icon-192.png',
      badge: '/icons/esquadro.svg',
      tag: 'esquadro-atualizacao',
      data: { caminho: dados.caminho || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const caminho = evento.notification.data?.caminho || '/';
  const destino = new URL(caminho, self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (janelas) => {
      const janela = janelas.find((cliente) => new URL(cliente.url).origin === self.location.origin);
      if (janela) {
        await janela.navigate(destino);
        return janela.focus();
      }
      return self.clients.openWindow(destino);
    }),
  );
});

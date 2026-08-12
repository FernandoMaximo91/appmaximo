/**
 * service-worker.js
 * Cache básico do "app shell" (arquivos estáticos), pra permitir instalar como PWA
 * e abrir mais rápido. As chamadas à API (outro domínio) NUNCA são cacheadas aqui —
 * sempre vão direto pra rede, pra nunca mostrar dado desatualizado de prova/nota.
 */

const CACHE_NAME = 'appmaximo-shell-v1';
const ARQUIVOS_SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/config.js',
  './js/api.js',
  './js/ui.js',
  './js/questoes-ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Só cuida de arquivos do próprio site (mesma origem). Chamadas à API do
  // Apps Script (outra origem) passam direto, sem cache.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((resposta) => {
      if (resposta) return resposta;
      return fetch(event.request).then((rede) => {
        if (event.request.method === 'GET' && rede && rede.status === 200) {
          const clone = rede.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return rede;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

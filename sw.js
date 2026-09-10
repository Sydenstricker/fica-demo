/**
 * sw.js — service worker mínimo (ADR-041 passo 6).
 *
 * ── O que este arquivo NÃO é ────────────────────────────────────────────────
 *
 * Não é uma estratégia de offline completa. A `ADR-001` prometia "offline via
 * SW" e nada existia; isto entrega o **casco navegável** offline, e declara o
 * resto como trabalho.
 *
 * ── A regra que evita o pior modo de falha ──────────────────────────────────
 *
 * Nada que passe por `/api/` ou `/storage/` é cacheado, **nunca**. Um service
 * worker que sirva resposta velha de modelo ou de perfil produziria o defeito
 * mais difícil de diagnosticar deste projeto: o produto responderia com dado
 * antigo sem erro nenhum, e a telemetria registraria um turno que não houve.
 * Cache aqui é só para o casco estático.
 *
 * `cache-first` para o casco (rápido e funciona offline), `network-first` para
 * navegação (para não servir HTML velho depois de um deploy).
 */

const VERSAO = 'fica-v1';
const CASCO = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSAO).then(c => c.addAll(CASCO)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Dado vivo nunca é cacheado — ver comentário no topo.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) return;

  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
          return resp;
        })
        .catch(() => caches.match(req).then(r => r ?? caches.match('/index.html'))),
    );
    return;
  }

  evento.respondWith(
    caches.match(req).then(cacheado => {
      if (cacheado) return cacheado;
      return fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
        }
        return resp;
      });
    }),
  );
});

// Service worker do app publicado no navegador (GitHub Pages): guarda os arquivos do app para
// ele abrir sem rede. Os dados continuam no armazenamento da página; aqui só entra o código.
//
// No repositório a versão e a lista ficam vazias: quem preenche é tools/montar-web.mjs, no build
// da página. Só o build carimbado registra este arquivo (www/js/offline.js): o servidor de
// desenvolvimento e o APK não usam service worker.

const VERSAO = 'dev';
const ARQUIVOS = [];
const CACHE = `foco-${VERSAO}`;

// Versão nova: baixa tudo antes de assumir, para nunca misturar arquivos de duas versões. Direto
// do servidor ("reload"), sem passar pelo cache HTTP do navegador: o Pages manda guardar cada
// arquivo por 10 minutos, e a versão nova gravaria arquivos da anterior.
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(['./', ...ARQUIVOS].map((endereco) => new Request(endereco, { cache: 'reload' }))),
      )
      .then(() => self.skipWaiting()),
  );
});

// Assumiu: apaga as cópias das versões anteriores e passa a responder pelas páginas já abertas.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith('foco-') && nome !== CACHE)
            .map((nome) => caches.delete(nome)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Primeiro a cópia guardada; o que não estiver nela (arquivo novo, outro endereço) vai à rede.
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(pedido, { ignoreSearch: true }))
      .then((guardado) => guardado ?? fetch(pedido)),
  );
});

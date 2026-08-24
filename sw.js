/* GPS Pro - Service Worker
   Compatível com GitHub Pages / PWABuilder / Android PWA
*/
const CACHE_NAME = "gps-pro-v1.0.0";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Recursos externos usados diretamente pelo index.html.
// O Service Worker tenta armazená-los, mas não impede o funcionamento
// caso algum servidor externo não permita cache via fetch.
const EXTERNAL_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/leaflet-rotate@0.1.4/dist/leaflet-rotate.min.css",
  "https://cdn.jsdelivr.net/npm/leaflet-rotate@0.1.4/dist/leaflet-rotate.min.js",
  "https://cdn.jsdelivr.net/npm/togeojson@0.16.0/togeojson.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await cache.addAll(APP_SHELL);

        // Não falha a instalação se algum CDN estiver indisponível.
        await Promise.allSettled(
          EXTERNAL_ASSETS.map(async url => {
            try {
              const response = await fetch(url, { mode: "no-cors" });
              if (response) {
                await cache.put(url, response);
              }
            } catch (e) {
              console.warn("Não foi possível armazenar:", url);
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Não interceptar APIs de navegação, geocodificação, roteamento
  // ou tiles do mapa. Essas requisições precisam continuar online.
  const isMapTile =
    url.hostname === "tile.openstreetmap.org" ||
    url.hostname.endsWith(".tile.openstreetmap.org");

  const isNavigationAPI =
    url.hostname === "nominatim.openstreetmap.org" ||
    url.hostname === "router.project-osrm.org" ||
    url.hostname === "api.mapbox.com";

  if (isMapTile || isNavigationAPI) {
    return;
  }

  // Para arquivos locais: cache primeiro, rede depois.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Para CDNs: cache primeiro, rede depois.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Respostas CORS/opaque também podem ser armazenadas.
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Se estiver sem internet e não houver cache, devolve erro normal.
          return new Response("", {
            status: 503,
            statusText: "Offline"
          });
        });
    })
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

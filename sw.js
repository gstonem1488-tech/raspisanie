// Работа без интернета: сначала сеть, чтобы обновления приходили сразу, при её отсутствии — копия.
const CACHE = "oboi-v1";
const FILES = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "js/app.js", "js/names.js", "js/parse.js", "js/render.js",
  "vendor/xlsx.mini.min.js",
  "assets/background.webp", "assets/parchment.webp",
  "assets/fonts/OldStandard-Regular.ttf", "assets/fonts/OldStandard-Bold.ttf", "assets/fonts/OldStandard-Italic.ttf",
  "assets/icons/icon-180.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(event.request, { ignoreSearch: true });
        return hit || Response.error();
      }),
  );
});

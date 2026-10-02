/* =====================================================================
   Service worker: hra funguje i offline a sama se aktualizuje
   ---------------------------------------------------------------------
   Soubory hry: nejdřív síť (nová verze z GitHub Pages), když není signál
   nebo je pomalý (> 4 s), použije se uložená kopie.
   Sprity pokémonů (raw.githubusercontent.com): nejdřív cache – jednou
   stažený sprite už se nestahuje znovu a funguje bez internetu.
   ===================================================================== */
const APP_CACHE = 'poke-idle-app-v1';
const SPRITE_CACHE = 'poke-idle-sprites-v1';
const NET_TIMEOUT = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'raw.githubusercontent.com') e.respondWith(cacheFirst(req));
  else if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
});

async function cacheFirst(req){
  const cache = await caches.open(SPRITE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req){
  const cache = await caches.open(APP_CACHE);
  const net = fetch(req, { cache: 'no-store' }).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const hit = await cache.match(req, { ignoreSearch: true });
  if (!hit) return net;                                  // poprvé: čekat na síť
  const slow = new Promise(r => setTimeout(() => r(hit), NET_TIMEOUT));
  return Promise.race([net.catch(() => hit), slow]);     // offline / pomalá síť → uložená kopie
}

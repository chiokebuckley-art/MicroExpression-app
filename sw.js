/**
 * Offline Service Worker for Reading Faces (`sw.js`).
 * Caches application shell, Three.js modules, JSON curriculum catalogs,
 * and 3D head models for full offline execution after initial load.
 */

const CACHE_NAME = 'reading-faces-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './src/main.js',
  './lib/three.module.js',
  './models/registry.json',
  './content/aus.json',
  './content/expressions.json',
  './content/blends.json',
  './content/plutchik.json',
  './content/va.json',
  './content/emotions27.json',
  './content/anatomy.json',
  './content/ethics.json',
  './content/scenes.json',
  './content/conversations.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

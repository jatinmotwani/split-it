/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * App shell + offline page only (ARCHITECTURE §9). API responses are never cached here;
 * data for offline use lives in the client's own store (Phase 3).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
      handler: new StaleWhileRevalidate({
        cacheName: 'images',
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();

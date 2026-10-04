const CACHE='puppy-vocab-v1.0.0';
const ASSETS=['./','./index.html','./styles.css','./app.js','./core.js','./importers.js','./vendor/jszip.min.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('puppy-vocab-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;const scope=new URL(self.registration.scope);if(!new URL(e.request.url).pathname.startsWith(scope.pathname))return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));});
self.addEventListener('message',e=>{if(e.data==='CACHE_STATUS')e.source?.postMessage({type:'CACHE_READY',version:CACHE});});

const CACHE='forge-core-v1.3.0-ui';
const FILES=['./','./index.html','./styles.css','./forge-ui.css','./forge-ui.js','./app.js','./firebase-config.js','./sync-core.mjs','./sync-client.mjs','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('forge-core-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith(fetch(req).then(res=>{
   if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));}
   return res;
 }).catch(async()=>{const cached=await caches.match(req);return cached||(req.mode==='navigate'?caches.match('./index.html'):Response.error());}));
});

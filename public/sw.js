const CACHE='cbd-ventures-ai-chat-map-only-v7';
const CORE=['/','/index.html','/styles.css','/app.js','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;

  if(e.request.mode==='navigate'||['/app.js','/styles.css','/index.html'].includes(u.pathname)){
    e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))));return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok){const copy=n.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return n;})));
});

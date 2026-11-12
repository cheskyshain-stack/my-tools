'use strict';
// This worker only controls /catering/. It never handles other portal tools.
const CACHE='cj-catering-v3';
const CORE=['/catering/','/catering/index.html','/catering/manifest.json','/catering/cloud-config.js','/catering/icon.png','/catering/icon.png?v=1','/assets/cj.css','/assets/cj-refresh.js','/logo.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cj-catering-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET')return;
 if(url.origin!==self.location.origin){
  // Font styling is optional. An empty stylesheet uses system fonts offline.
  if(url.hostname==='fonts.googleapis.com')event.respondWith((async()=>{
   const cache=await caches.open(CACHE),saved=await cache.match(request);
   if(saved)return saved;
   try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}
   catch{return new Response('',{headers:{'Content-Type':'text/css'}});}
  })());
  if(url.hostname==='fonts.gstatic.com')event.respondWith((async()=>{
   const cache=await caches.open(CACHE),saved=await cache.match(request);
   if(saved)return saved;
   const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;
  })());
  return;
 }
 if(!CORE.includes(url.pathname)&&!url.pathname.startsWith('/catering/'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(request);
   if(response.ok){await cache.put(request,response.clone());return response;}
   const saved=await cache.match(request,{ignoreSearch:true});
   return saved||response;
  }catch(error){
   const saved=await cache.match(request,{ignoreSearch:true});
   if(saved)return saved;
   if(request.mode==='navigate'&&url.pathname.startsWith('/catering/'))return cache.match('/catering/');
   throw error;
  }
 })());
});

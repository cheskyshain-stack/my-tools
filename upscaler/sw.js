// Tombstone for Print Upscaler, which used to live at /upscaler/.
//
// The tool is gone, but deleting its files is not enough on its own. It registered a
// service worker at this exact path with about 13 MB of model weights precached, and a
// service worker outlives the files that installed it: on any device that had opened
// the tool, the old worker would carry on serving its own cached copy from this scope,
// and those 13 MB would sit in storage indefinitely. The tool would look like it was
// still there, and still broken.
//
// A browser checks for an update by fetching this path. Finding this file instead of
// the old worker, it installs it, and this one clears the caches and unregisters
// itself. That is what actually takes the tool off a phone.
//
// Safe to delete once you are confident nothing still has it installed. Nothing else on
// this site uses a service worker or the Cache Storage API.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only this tool's caches. Workbox names them after the scope, so both the
      // precache and the runtime cache carry "upscaler" in the key. Anything else on
      // the origin is left alone, in case a future tool here starts using caches.
      for (const key of await caches.keys()) {
        if (key.includes('upscaler') || key.startsWith('workbox-')) {
          await caches.delete(key)
        }
      }
      await self.registration.unregister()
      // Send anyone still sitting on the old page somewhere real.
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate('/')
      }
    })(),
  )
})

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open("dv-cache").then(cache => {
            return cache.addAll([
                "index.html",
                "manifest.json"
            ]);
        })
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(resp => {
            return resp || fetch(event.request);
        })
    );
});

const CACHE="mercatto-prompts-v1"

const ASSETS=[
"/",
"/prompt.html",
"/manifest.json"
]

self.addEventListener("install",e=>{

e.waitUntil(

caches.open(CACHE)
.then(cache=>cache.addAll(ASSETS))

)
})

self.addEventListener("fetch",e=>{

e.respondWith(

caches.match(e.request)
.then(res=>res||fetch(e.request))

)

})

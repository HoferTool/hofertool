// =================================================================
//  sw.js — hält die App auf dem Gerät, damit sie ohne Netz startet
//
//  Gehört neben die index.html auf GitHub. Holt die Seite immer
//  zuerst frisch aus dem Netz (damit neue Versionen sofort kommen)
//  und fällt nur ohne Verbindung auf die gemerkte Fassung zurück.
//  Die Bibliotheken aus dem Netz werden einmal geholt und behalten.
//
//  Die Daten selbst merkt sich die App in einem eigenen Speicher,
//  darum kümmert sich dieses Skript nicht.
// =================================================================

const HUELLE = "hofer-huelle-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(HUELLE).then((c) =>
    c.addAll(["./", "./index.html"]).catch(() => { /* beim ersten Mal egal */ })));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen
      .filter((n) => n.startsWith("hofer-huelle-") && n !== HUELLE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET") return;
  const url = new URL(anfrage.url);

  // Daten von Supabase: nicht hier, das macht die App selbst
  if (/supabase\.co$/.test(url.hostname)) return;

  // Die Seite: erst das Netz, sonst die gemerkte Fassung
  if (anfrage.mode === "navigate" || url.pathname.endsWith("/index.html")
      || url.pathname.endsWith("/")) {
    e.respondWith((async () => {
      try {
        const frisch = await fetch(anfrage);
        const c = await caches.open(HUELLE);
        c.put("./index.html", frisch.clone());
        return frisch;
      } catch (f) {
        const c = await caches.open(HUELLE);
        return (await c.match("./index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Bibliotheken, Schriften, Logo: einmal holen, dann behalten
  if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)
      || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(HUELLE);
      const gemerkt = await c.match(anfrage);
      if (gemerkt) return gemerkt;
      try {
        const frisch = await fetch(anfrage);
        if (frisch.ok) c.put(anfrage, frisch.clone());
        return frisch;
      } catch (f) { return Response.error(); }
    })());
  }
});

// =================================================================
//  sw.js — hält die App auf dem Gerät, damit sie ohne Netz startet
//
//  Liegt in public/ und wird beim Bauen neben die index.html kopiert.
//  Beim Bauen trägt vite.config.js die Liste aller Dateien der App
//  ein (DATEIEN). Die werden beim Einrichten auf einmal geholt, damit
//  das Tablet schon nach dem ersten Besuch ohne Netz startet.
//
//  Die Seite selbst kommt immer zuerst frisch aus dem Netz (damit
//  neue Versionen sofort kommen) und nur ohne Verbindung aus der
//  Ablage. Die Programmdateien unter assets/ tragen eine Prüfsumme im
//  Namen und ändern sich darum nie: einmal geholt, immer gültig.
//
//  Die Daten selbst merkt sich die App in einem eigenen Speicher,
//  darum kümmert sich dieses Skript nicht.
// =================================================================

const DATEIEN = self.__DATEIEN__;
// Die Ablage trägt den Pfad im Namen. So kommen sich die Live-App und
// die Vorschau unter .../vorschau/ auf demselben Gerät nicht in die
// Quere: Jede räumt nur ihre eigenen alten Fassungen weg.
const BEREICH = new URL(self.registration.scope).pathname;
const VORSILBE = "hofer-app-" + BEREICH + "-";
const HUELLE = VORSILBE + "__FASSUNG__";
// Die Ablage der früheren Einzeldatei-App (hofer-huelle-…) räumt nur
// die Live-App weg, sobald sie selbst diese Fassung ist.
const IST_VORSCHAU = /\/(vorschau|test)\/$/.test(BEREICH);

// Neue Fassung einrichten (Patrick 5. November 2026: „lädt alles sehr
// lange“). Vorher holte jedes Gerät bei jeder neuen Fassung alle rund
// 10 MB auf einmal neu, gleichzeitig mit dem Start der App. Jetzt kommt
// jede Programmdatei, die sich nicht geändert hat (gleicher Name =
// gleicher Inhalt), aus der Ablage der alten Fassung, und nur Neues aus dem Netz,
// höchstens drei Dateien zugleich, damit die App selbst Vorrang hat.
async function einrichten() {
  const c = await caches.open(HUELLE);
  const namen = (await caches.keys()).filter((n) => n.startsWith(VORSILBE) && n !== HUELLE);
  const alte = await Promise.all(namen.map((n) => caches.open(n)));
  const offen = [];
  for (const d of DATEIEN) {
    // Nur Programmdateien unter assets/ tragen eine Prüfsumme im Namen.
    // Andere (Logo, Einlagen, Archiv) können sich bei gleichem Namen ändern.
    let gemerkt = null;
    if (d.startsWith("./assets/")) {
      for (const a of alte) { gemerkt = await a.match(d); if (gemerkt) break; }
    }
    if (gemerkt) await c.put(d, gemerkt);
    else offen.push(d);
  }
  const holen = async () => {
    while (offen.length) {
      const d = offen.shift();
      try {
        const r = await fetch(d, { cache: "no-cache" });
        if (r.ok) await c.put(d, r);
      } catch (f) { /* beim nächsten Gebrauch */ }
    }
  };
  await Promise.all([holen(), holen(), holen()]);
  try { const s = await fetch("./"); if (s.ok) await c.put("./", s); } catch (f) { /* egal */ }
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(einrichten().catch(() => { /* beim ersten Mal egal */ }));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen
      .filter((n) => (n.startsWith(VORSILBE) && n !== HUELLE)
        || (!IST_VORSCHAU && n.startsWith("hofer-huelle-")))
      .map((n) => caches.delete(n)));
    // Push-Mitteilungen sind seit 1.83.0 weg (Wunsch Patrick 16. Oktober
    // 2026): ein altes Abo auf dem Gerät abmelden, damit nichts mehr kommt.
    if (!IST_VORSCHAU && self.registration.pushManager) {
      try {
        const abo = await self.registration.pushManager.getSubscription();
        if (abo) await abo.unsubscribe();
      } catch (f) { /* egal */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET") return;
  const url = new URL(anfrage.url);

  // Daten von Supabase: nicht hier, das macht die App selbst
  if (/supabase\.co$/.test(url.hostname)) return;

  // Die Vorschau der neuen Fassung unter .../vorschau/ hat ihren eigenen
  // Helfer. Ohne diese Zeile würde ihre Seite hier als gemerkte Fassung
  // der Live-App abgelegt und ohne Netz statt der Live-App erscheinen.
  // Dasselbe für die Test-Fassung unter .../test/.
  if (url.pathname.includes("/vorschau/") || url.pathname.includes("/test/")) return;

  // Einlagen Gen ist eine eigene Seite im Rahmen (public/einlagen/). Sie
  // darf nie als Seite der App abgelegt werden, sonst startet ohne Netz
  // der Konturscanner statt der App. Erst das Netz, sonst die eigene.
  if (url.pathname.includes("/einlagen/") && !/\.js$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(HUELLE);
      try {
        const frisch = await fetch(anfrage);
        if (frisch.ok) c.put(anfrage, frisch.clone());
        return frisch;
      } catch (f) {
        return (await c.match(anfrage, { ignoreSearch: true })) || (await c.match("./einlagen/index.html")) || Response.error();
      }
    })());
    return;
  }

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

  // Programmdateien, Bibliotheken, Schriften, Bilder: einmal holen,
  // dann behalten
  if (/cdn\.jsdelivr\.net|esm\.sh|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)
      || /\/assets\//.test(url.pathname)
      || /\.(png|svg|webmanifest|woff2?|js|css)$/.test(url.pathname)) {
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


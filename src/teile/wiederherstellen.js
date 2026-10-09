// =================================================================
//  WIEDERHERSTELLEN NACH DEM NEULADEN
//  Wunsch Patrick, 9. Oktober 2026: „wenn man neu ladet soll es das
//  fenster oder was auch immer so wieder öffnen wie es war“. Das gilt
//  für Strg + F5, das stündliche Neuladen, eine neue Fassung und das
//  Logo im Pad.
//
//  Kurz bevor die Seite geht (pagehide), legt die App in den Speicher
//  des Tabs (sessionStorage, nur dieses Gerät, nicht die Datenbank):
//  - welche Fenster offen waren (fensterOeffnen mit „merken“),
//  - die angemeldeten Teile: Reiter, Ordner der HOCO Nummern, Zeitraum
//    der Planwand, Pad, Rechner, Bildlauf (teilMerken).
//  Beim Start kommt das zurück, wenn es dieselbe Person, dieselbe
//  Adresse und höchstens eine halbe Stunde her ist. Fenster mit
//  Eingaben (neue Bestellung, Ferien, Zifferblock …) merken sich
//  nichts: Halb Eingetipptes wieder hinzustellen wäre gefährlicher,
//  als es neu zu tippen.
// =================================================================

const SCHLUESSEL = "hofer.wiederherstellen";
const HOECHSTENS = 30 * 60 * 1000;

const offen = [];      // { huelle, art, daten }
const oeffner = {};    // art → (daten) => Fenster öffnen
const teile = [];      // { name, lesen, setzen, nachher }
let nutzer = null;     // id der angemeldeten Person
let bereit = false;    // erst nach dem Wiederherstellen wieder sichern

export function fensterMerken(huelle, merken) {
  offen.push({ huelle, art: merken.art, daten: merken.daten || {} });
}

// Für das stündliche Neuladen: welche Art ein offenes Fenster ist
export function fensterArt(huelle) {
  const f = offen.find((x) => x.huelle === huelle);
  return f ? f.art : null;
}

export function wiederOeffner(art, fn) { oeffner[art] = fn; }

// nachher: erst nach dem Zeichnen der Seite setzen (etwa Bildlauf)
export function teilMerken(name, lesen, setzen, nachher) {
  if (teile.some((t) => t.name === name)) return;
  teile.push({ name, lesen, setzen, nachher: !!nachher });
}

export function zustandSichern() {
  if (!bereit || !nutzer) return;
  for (let i = offen.length - 1; i >= 0; i--) if (!offen[i].huelle.isConnected) offen.splice(i, 1);
  const z = { zeit: Date.now(), nutzer, hash: location.hash, teile: {},
    fenster: offen.map(({ art, daten }) => ({ art, daten })) };
  teile.forEach((t) => {
    try { const w = t.lesen(); if (w !== undefined && w !== null) z.teile[t.name] = w; } catch (f) { /* ohne */ }
  });
  try { sessionStorage.setItem(SCHLUESSEL, JSON.stringify(z)); } catch (f) { /* dann eben nicht */ }
}

// Beim Abmelden: Die nächste Person fängt frisch an
export function zustandVergessen() {
  bereit = false;
  nutzer = null;
  offen.length = 0;
  try { sessionStorage.removeItem(SCHLUESSEL); } catch (f) { /* egal */ }
}

// Vor dem Zeichnen der Seite. Gibt zurück, was nach dem Zeichnen
// kommt: die übrigen Teile und die Fenster.
export function zustandVorher(id) {
  nutzer = id || null;
  let z = null;
  try { z = JSON.parse(sessionStorage.getItem(SCHLUESSEL) || "null"); } catch (f) { z = null; }
  const gilt = z && z.nutzer && z.nutzer === nutzer && Date.now() - z.zeit < HOECHSTENS
    && z.hash === location.hash;
  if (!gilt) return () => { bereit = true; };
  const setzen = (t) => {
    if (!(t.name in z.teile)) return;
    try { t.setzen(z.teile[t.name]); } catch (f) { console.warn("Wiederherstellen", t.name, f); }
  };
  teile.filter((t) => !t.nachher).forEach(setzen);
  return () => {
    try {
      teile.filter((t) => t.nachher).forEach(setzen);
      (z.fenster || []).forEach((f) => {
        const fn = oeffner[f.art];
        if (!fn) return;
        try { fn(f.daten || {}); } catch (e) { console.warn("Fenster wieder öffnen", f.art, e); }
      });
    } finally { bereit = true; }
  };
}

window.addEventListener("pagehide", zustandSichern);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") zustandSichern();
});

// Bildlauf: die Seite selbst und die Tafel der Planwand. Die Daten
// kommen erst nach und nach, darum ein paar Sekunden lang nachsetzen,
// bis es passt. Greift jemand selbst ein, hört es sofort auf.
teilMerken("bildlauf", () => {
  const r = document.querySelector(".pw-rolle");
  const w = { y: Math.round(window.scrollY) };
  if (r) { w.pwx = Math.round(r.scrollLeft); w.pwy = Math.round(r.scrollTop); }
  return w.y || w.pwx || w.pwy ? w : null;
}, (w) => {
  let fertig = false;
  const halt = () => { fertig = true; };
  const arten = ["wheel", "touchstart", "pointerdown", "keydown"];
  arten.forEach((a) => window.addEventListener(a, halt, { once: true, capture: true, passive: true }));
  const ende = Date.now() + 5000;
  const schritt = () => {
    if (fertig) return;
    let ok = true;
    if (w.y) {
      window.scrollTo(0, w.y);
      ok = Math.abs(window.scrollY - w.y) < 2;
    }
    const r = document.querySelector(".pw-rolle");
    if (w.pwx || w.pwy) {
      if (!r) ok = false;
      else {
        r.scrollLeft = w.pwx || 0;
        r.scrollTop = w.pwy || 0;
        ok = ok && Math.abs(r.scrollTop - (w.pwy || 0)) < 2 && Math.abs(r.scrollLeft - (w.pwx || 0)) < 2;
      }
    }
    if (ok || Date.now() > ende) {
      arten.forEach((a) => window.removeEventListener(a, halt, { capture: true }));
      return;
    }
    setTimeout(schritt, 150);
  };
  setTimeout(schritt, 50);
}, true);

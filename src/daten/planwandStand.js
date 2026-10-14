// =================================================================
//  LETZTER STAND DER PLANWAND
//  Beim Öffnen der Planwand soll nicht erst „Planung wird geladen …“
//  aufblitzen (Wunsch Patrick, 13. Oktober 2026). Darum merkt sich das
//  Gerät nach jedem Laden, was auf der Tafel stand: im Speicher für den
//  Wechsel zwischen den Seiten, im IndexedDB für das nächste Öffnen
//  der App. Die Planwand zeichnet sofort diesen Stand und holt den
//  frischen still im Hintergrund nach.
//
//  Je Person getrennt, weil Externe nur ihre Parks sehen. Die Daten
//  liegen ohnehin schon im Offline-Zwischenspeicher des Geräts.
// =================================================================

import { alt } from "../bruecke.jsx";

const DB_NAME = "hofer-planwand";
const ABLAGE = "stand";
const ALTER_MAX = 14 * 86400000;   // älter lohnt das Zeigen nicht

let imSpeicher = null;

function dbOeffnen() {
  return new Promise((ok, nein) => {
    if (typeof indexedDB === "undefined") { nein(new Error("kein IndexedDB")); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ABLAGE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nein(r.error);
  });
}

function passt(s, wer) {
  return s && s.wer === wer && Date.now() - (s.zeit || 0) < ALTER_MAX;
}

// Den gemerkten Stand holen, oder null. Nie länger als einen Augenblick:
// Hängt das IndexedDB, lädt die Planwand eben wie bisher.
export async function standLesen(wer) {
  if (!wer) return null;
  if (passt(imSpeicher, wer)) return imSpeicher;
  try {
    const db = await Promise.race([dbOeffnen(),
      new Promise((_, nein) => setTimeout(() => nein(new Error("zu langsam")), 400))]);
    const s = await new Promise((ok) => {
      const r = db.transaction(ABLAGE).objectStore(ABLAGE).get(wer);
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
    db.close();
    if (!passt(s, wer)) return null;
    imSpeicher = s;
    return s;
  } catch (f) {
    return null;
  }
}

// Nach jedem erfolgreichen Laden ablegen. Fehler stören niemanden.
let schreibTimer = null;
export function standMerken(wer, daten) {
  if (!wer) return;
  imSpeicher = { ...daten, wer, zeit: Date.now() };
  // Gebündelt, weil der Abgleich oft kurz hintereinander lädt
  clearTimeout(schreibTimer);
  const s = imSpeicher;
  schreibTimer = setTimeout(async () => {
    try {
      const db = await dbOeffnen();
      db.transaction(ABLAGE, "readwrite").objectStore(ABLAGE).put(s, wer);
      db.close();
    } catch (f) { /* ohne Ablage lädt die Planwand nächstes Mal wie bisher */ }
  }, 1500);
}

// Während der Ladebildschirm nach dem Anmelden steht, die Planwand
// schon holen und als Stand ablegen: Öffnet man sie danach, steht sie
// sofort da (Wunsch Patrick, 14. Oktober 2026: „kannst ja Daten schon
// vorladen, dass es nachher weniger lange geht“). Fehler stören nicht,
// dann lädt die Planwand eben wie bisher beim Öffnen.
export async function planwandVorladen() {
  const wer = alt.meineProfilId();
  if (!wer || !alt.seiteSichtbar("planwand")) return;
  const ferien = alt.ladeFerien().then((liste) => liste.map((f) => {
    f.genehmigt_von_name = f.profiles ? f.profiles.full_name : null;
    return f;
  })).catch(() => []);
  const [parks, maschinen, auftraege, fer] = await Promise.all([
    alt.ladeParks(false, true), alt.ladeMaschinen(false, true), alt.ladePlanAuftraege(), ferien]);
  standMerken(wer, { parks, maschinen, parksAlle: alt.plan.parksAlle,
    auftraege, ferien: fer, geladenAb: alt.plan.geladenAb });
}

// Vorladen, aber höchstens so lange warten; was danach noch kommt,
// landet trotzdem im Stand
export function planwandVorladenHoechstens(ms) {
  const vor = planwandVorladen().catch((f) => console.warn("Planwand vorladen:", f));
  return Promise.race([vor, new Promise((ok) => setTimeout(ok, ms))]);
}

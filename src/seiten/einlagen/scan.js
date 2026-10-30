// =================================================================
//  EINLAGEN GEN: Scan (Foto und Kontur) sichern und Werkzeuge einzeln
//
//  Das Werkzeug hält Foto und Kontur nur im Speicher. Damit beim Hin und
//  Her zwischen Erfassen und Einlage, beim Wechsel des Reiters oder nach
//  einem Neuladen nichts verloren geht, liegt der aktuelle Scan auf dem
//  Gerät in IndexedDB (zu gross für den localStorage, Wunsch Patrick
//  30. Oktober 2026: „die Änderungen in der Kontur sollen nicht verloren
//  gehen“). Einzeln gespeicherte Werkzeuge stehen in der Tabelle
//  einlagen_werkzeuge (sql/einlagen-werkzeuge.sql) für alle Geräte.
// =================================================================

const DB = "hofer-einlagen", STORE = "kv";

function idb() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function idbTun(art, fn) {
  const db = await idb();
  try {
    return await new Promise((ok, fehler) => {
      const t = db.transaction(STORE, art), r = fn(t.objectStore(STORE));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => fehler(t.error);
    });
  } finally { db.close(); }
}
export const scanLesen = () => idbTun("readonly", (s) => s.get("scan")).catch(() => null);
export const scanAblegen = (wert) => idbTun("readwrite", (s) => s.put(wert, "scan")).catch(() => null);
export const scanWeg = () => idbTun("readwrite", (s) => s.delete("scan")).catch(() => null);

// Welche gespeicherten Werkzeuge zum Foto gehören, das gerade offen ist
const VERKNUEPFT = "hofer.einlagen.werkzeug";
export function verknuepftLesen() {
  try { return JSON.parse(localStorage.getItem(VERKNUEPFT) || "null"); } catch { return null; }
}
export function verknuepftSetzen(v) {
  try { v ? localStorage.setItem(VERKNUEPFT, JSON.stringify(v)) : localStorage.removeItem(VERKNUEPFT); } catch { /* nur dieser Tab */ }
}

// Kurzer Fingerabdruck von allem, was die Kontur bestimmt
export function signatur(w) {
  const st = w.scanState();
  if (!st || !st.srcCanvas || !st.result) return "";
  return JSON.stringify([st.scanId, st.corners, st.edit.strokes, st.edit.grips,
    st.result.tools.map((t) => [t.outer, t.holes]), w.settingsObj()]);
}

// Scan ohne Foto, im Format von „Projekt speichern“ des Werkzeugs
export function projektOhneFoto(w) {
  const st = w.scanState();
  return {
    app: "werkzeug-konturscanner", version: 1, saved: new Date().toISOString(), name: w.baseName(), scanId: st.scanId,
    settings: w.settingsObj(), sample: st.sample, corners: st.corners, autoCorners: st.autoCorners,
    edit: { strokes: st.edit.strokes, grips: st.edit.grips }, pointEdits: st.edit.pointEdits, result: st.result,
  };
}

// Das Foto ändert sich innerhalb eines Scans nie: einmal umwandeln reicht
const fotos = new WeakMap();
export function foto(w) {
  const c = w.scanState().srcCanvas;
  if (!fotos.has(c)) fotos.set(c, c.toDataURL("image/jpeg", 0.9));
  return fotos.get(c);
}

const bbox = (p) => p.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])], [1e9, 1e9, -1e9, -1e9]);
const r3 = (v) => Math.round(v * 1000) / 1000;

// Mitte eines Werkzeugs im Scan, daran erkennt man es nach Änderungen wieder
export function mitte(t) {
  const b = bbox(t.outer);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

// Werkzeug i des Scans als Kontur um seine Mitte (wie „Als Werkzeug speichern“)
export function werkzeugDaten(w, i, name) {
  const t = w.scanState().result.tools[i], b = bbox(t.outer), [cx, cy] = mitte(t);
  const sh = (r) => r.map((p) => [r3(p[0] - cx), r3(p[1] - cy)]);
  const tiefe = parseFloat(w.document.getElementById("newDepth")?.value);
  return {
    app: "werkzeug-kontur", version: 1, name, depth: Number.isFinite(tiefe) && tiefe > 0 ? tiefe : 20,
    polys: [{ outer: sh(t.outer), holes: t.holes.map(sh) }], grips: [],
    nr: i, mitte: [r3(cx), r3(cy)], mass: [r3(b[2] - b[0]), r3(b[3] - b[1])],
  };
}

// Welches Werkzeug im Scan ist das gespeicherte? Das mit der nächsten Mitte
export function finden(w, m, schon = new Set()) {
  const tools = w.scanState().result?.tools || [];
  let best = -1, d = 40; // weiter weg als 4 cm ist es ein anderes
  tools.forEach((t, i) => {
    if (schon.has(i)) return;
    const c = mitte(t), e = Math.hypot(c[0] - m[0], c[1] - m[1]);
    if (e < d) { d = e; best = i; }
  });
  return best;
}

// Kleines Bild der Kontur für die Liste
export function umrissPfad(daten) {
  const pl = (daten && daten.polys) || [];
  const alle = pl.flatMap((p) => p.outer);
  if (!alle.length) return null;
  const b = bbox(alle), f = (v) => Math.round(v * 10) / 10;
  const d = pl.flatMap((p) => [p.outer, ...p.holes])
    .map((r) => "M" + r.map((q) => f(q[0]) + " " + f(q[1])).join("L") + "Z").join("");
  const rand = Math.max(b[2] - b[0], b[3] - b[1]) * 0.06;
  return { d, box: [b[0] - rand, b[1] - rand, b[2] - b[0] + 2 * rand, b[3] - b[1] + 2 * rand].map(f).join(" ") };
}

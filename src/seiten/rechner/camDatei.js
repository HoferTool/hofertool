// ============================================================================
//  HOFERCAM → eingelesene Dateien beim Speichern aktualisieren
// ============================================================================
// Seit 1.562.0 (Wunsch Patrick 16. November 2026: „wenn ich ein Programm
// eingelesen und bearbeitet habe … beim Speichern dort, wo ich es eingelesen
// habe, aktualisiert“). Nur Chrome und Edge am Computer können eine Datei
// wieder beschreiben (File System Access API): „Einlesen“ öffnet dort die
// Dateiwahl des Browsers und merkt sich je Kanal den Griff zur Datei.
// „Speichern“ schreibt danach das angezeigte Programm (samt Handänderungen)
// in genau diese Datei. Die Griffe liegen nur im IndexedDB dieses Geräts,
// nie in der Datenbank: unter „aktuell“ und je gespeichertem Namen, damit
// ein später geöffnetes Programm wieder in seine Dateien schreibt.
// Alle Griffe gehen über das IndexedDB des Hauptfensters: aus dem eigenen
// Fenster gewählte Griffe gehören sonst zu jenem Fenster und wären nach
// dem Schliessen tot.
import { idbTun } from "../../teile/sicherung.js";

const AKTUELL = "hofercam:aktuell";
const JE_NAME = (n) => "hofercam:name:" + String(n || "").trim().toLowerCase();

let aktuell = {}; // {1: {griff, name, crlf, o}, 2: …}
const hoerer = new Set();
const melden = () => hoerer.forEach((f) => f());
export const dateiBeobachten = (f) => { hoerer.add(f); return () => hoerer.delete(f); };
export const dateiVon = (k) => aktuell[k] || null;

let geladen = null;
export function dateienLaden() {
  if (!geladen) geladen = idbTun("get", AKTUELL).then((x) => { aktuell = x || {}; melden(); }).catch(() => {});
  return geladen;
}
async function ablegen() {
  try { await idbTun("put", aktuell, AKTUELL); aktuell = (await idbTun("get", AKTUELL)) || aktuell; } catch (f) { /* privates Fenster: gilt bis zum Neuladen */ }
  melden();
}

// Kann dieses Fenster Dateien wieder beschreiben?
export const kannSchreiben = (fenster) => !!(fenster || window).showOpenFilePicker;

// Dateiwahl des Browsers; gibt [{datei, griff}] zurück, leer bei Abbruch
export async function dateienWaehlen(fenster, mehrere) {
  try {
    const griffe = await (fenster || window).showOpenFilePicker({ multiple: !!mehrere });
    return Promise.all(griffe.map(async (griff) => ({ datei: await griff.getFile(), griff })));
  } catch (f) {
    if (f && f.name === "AbortError") return [];
    throw f;
  }
}

// Nach dem Einlesen: Kanal k gehört jetzt zu dieser Datei (ohne Griff,
// etwa hineingezogen, ist der Kanal von keiner Datei mehr)
export async function dateiMerken(k, griff, text, o) {
  if (griff) aktuell = { ...aktuell, [k]: { griff, name: griff.name, crlf: /\r\n/.test(text), o } };
  else { const { [k]: weg, ...rest } = aktuell; aktuell = rest; }
  await ablegen();
}
export async function dateiVergessen(k) { await dateiMerken(k, null); }
export async function alleVergessen() { aktuell = {}; await ablegen(); }

// Beim Öffnen eines gespeicherten Programms seine Dateien holen
export async function dateienFuerName(name) {
  let x = null;
  try { x = name ? await idbTun("get", JE_NAME(name)) : null; } catch (f) { /* ohne IndexedDB */ }
  aktuell = x || {};
  await ablegen();
}

// Direkt nach dem Klick auf Speichern (noch mit Klick, sonst fragt der
// Browser nicht): Schreibrecht für die Dateien holen
export async function schreibrechtHolen() {
  const ok = {};
  for (const k of [1, 2]) {
    const d = aktuell[k];
    if (!d) continue;
    try {
      let p = await d.griff.queryPermission({ mode: "readwrite" });
      if (p !== "granted") p = await d.griff.requestPermission({ mode: "readwrite" });
      ok[k] = p === "granted";
    } catch (f) { ok[k] = false; }
  }
  return ok;
}

// Nach dem Speichern: Programme in ihre Dateien schreiben und die Dateien
// unter dem gespeicherten Namen merken. prog = programmeMitHand(w).
export async function dateienSchreiben(prog, name, recht) {
  const gut = [], fehler = [];
  for (const k of [1, 2]) {
    const d = aktuell[k];
    if (!d) continue;
    const zeilen = prog["k" + k];
    const o = Number(((zeilen.find((z) => /^O\d{1,4}/i.test(z.trim())) || "").trim().match(/^O(\d{1,4})/i) || [])[1]);
    // Programmnummer geändert: nicht in eine fremde Datei schreiben
    if (d.o && o && o !== d.o) { fehler.push(d.name + " (Programm-Nr. jetzt O" + String(o).padStart(4, "0") + ", Datei bleibt)"); continue; }
    if (recht && recht[k] === false) { fehler.push(d.name + " (kein Schreibrecht)"); continue; }
    try {
      const nl = d.crlf ? "\r\n" : "\n";
      const s = await d.griff.createWritable();
      await s.write(zeilen.join(nl) + nl);
      await s.close();
      gut.push(d.name);
    } catch (f) { fehler.push(d.name + " (" + (f && f.message ? f.message : f) + ")"); }
  }
  if (name && (aktuell[1] || aktuell[2])) { try { await idbTun("put", aktuell, JE_NAME(name)); } catch (f) { /* ohne IndexedDB */ } }
  return { gut, fehler };
}

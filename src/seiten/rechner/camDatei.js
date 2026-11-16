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
// Seit 1.565.1: Grund, warum eine Datei beim letzten Speichern nicht
// geschrieben wurde, bleibt beim Kanal stehen (Patrick: „Meldung kommt und
// verschwindet gleich wieder“), bis es klappt
let grund = {};
export const dateiFehler = (k) => grund[k] || "";

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
  delete grund[k];
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
  grund = {};
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
      ok[k] = p === "granted" ? true : "Chrome hat das Schreiben nicht erlaubt (" + p + ")";
    } catch (f) { ok[k] = "Chrome hat nicht nach dem Schreibrecht gefragt: " + ((f && (f.name + ": " + f.message)) || f); }
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
    const vorher = fehler.length;
    await einSchreiben(k, d, prog, recht, gut, fehler);
    if (fehler.length > vorher) grund[k] = fehler[fehler.length - 1]; else delete grund[k];
  }
  if (name && (aktuell[1] || aktuell[2])) { try { await idbTun("put", aktuell, JE_NAME(name)); } catch (f) { /* ohne IndexedDB */ } }
  melden();
  return { gut, fehler };
}
async function einSchreiben(k, d, prog, recht, gut, fehler) {
  {
    const zeilen = prog["k" + k];
    const o = Number(((zeilen.find((z) => /^O\d{1,4}/i.test(z.trim())) || "").trim().match(/^O(\d{1,4})/i) || [])[1]);
    // Programmnummer geändert: nicht in eine fremde Datei schreiben
    if (d.o && o && o !== d.o) { fehler.push(d.name + ": Programm-Nr. jetzt O" + String(o).padStart(4, "0") + " statt O" + String(d.o).padStart(4, "0") + ", Datei bleibt"); return; }
    if (recht && recht[k] !== undefined && recht[k] !== true) { fehler.push(d.name + ": " + recht[k]); return; }
    const nl = d.crlf ? "\r\n" : "\n";
    const inhalt = zeilen.join(nl) + nl;
    // Seit 1.566.1 (Patrick 16. November 2026, Laufwerk W:): Chrome meldet
    // auf Netzlaufwerken oft InvalidStateError („state had changed since it
    // was read from disk“). Dann nochmals mit frisch gelesenem Stand, dann
    // mit „bestehende Daten behalten“ und von vorne überschreiben
    const wege = [
      async () => { const s = await d.griff.createWritable(); await s.write(inhalt); await s.close(); },
      async () => { await d.griff.getFile(); const s = await d.griff.createWritable(); await s.write(inhalt); await s.close(); },
      async () => { await d.griff.getFile(); const s = await d.griff.createWritable({ keepExistingData: true });
        await s.truncate(0); await s.write({ type: "write", position: 0, data: inhalt }); await s.close(); },
    ];
    let letzter = null;
    for (const weg of wege) {
      try { await weg(); gut.push(d.name); return; } catch (f) { letzter = f; if (!(f && f.name === "InvalidStateError")) break; }
    }
    fehler.push(d.name + ": " + ((letzter && (letzter.name + ": " + letzter.message)) || letzter));
  }
}

// Letzter Ausweg (1.566.1): die Datei im Speichern-Fenster des Browsers neu
// wählen (startet im Ordner der Datei, Name vorgeschlagen); der neue Griff
// ersetzt den alten, danach wird geschrieben
export async function dateiNeuWaehlen(k, fenster) {
  const d = aktuell[k];
  if (!d) return false;
  // Seit 1.566.2: nur ein Aufruf, ohne startIn mit dem alten Griff (Patrick
  // 16. November 2026: der zweite Versuch hatte keinen Klick mehr und
  // Chrome lehnte ab); „id“ lässt Chrome sich den zuletzt benutzten Ordner
  // merken
  let neu;
  try {
    neu = await (fenster || window).showSaveFilePicker({ suggestedName: d.name, id: "hofercam-k" + k });
  } catch (f) {
    if (f && f.name === "AbortError") return false;
    throw f;
  }
  aktuell = { ...aktuell, [k]: { ...d, griff: neu, name: neu.name } };
  await ablegen();
  return true;
}

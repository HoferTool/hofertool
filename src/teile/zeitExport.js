// =================================================================
//  TÄGLICHER EXCEL-EXPORT HOFERTIME (seit 1.627.0, Wunsch Patrick
//  18. November 2026: „täglich eine Sicherung und ein Excel-Export, die
//  auf unserem Server abgelegt werden“). Die Sicherung macht schon die
//  tägliche Sicherung der App (alle Tabellen zeit_…). Hier dazu jeden Tag
//  „HOFERTIME JJJJ-MM-TT.xlsx“ in einen Ordner, den ein Admin wählt
//  (Chrome/Edge am PC, Griff im IndexedDB des Geräts), mit dem ganzen
//  laufenden Jahr bis heute (am 1. Januar das ganze Vorjahr).
//  Läuft auf dem gewählten Gerät, wenn dort ein Admin angemeldet ist,
//  einmal am Tag ab 5 Uhr; ältere Dateien als „Behalten“ fallen weg, die
//  neusten drei bleiben. Gleicher Aufbau wie qmsPdf.js.
// =================================================================
import { alt } from "../bruecke.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt, idbTun } from "./sicherung.js";

export const ZEIT_BEHALTEN = 60;
const DATEI_RE = /^HOFERTIME (\d{4}-\d{2}-\d{2})\.xlsx$/;

let griffHier = null;
export async function zeitOrdnerHolen() {
  if (griffHier) return griffHier;
  try { return (await idbTun("get", "zeit-export-ordner")) || null; } catch (f) { return null; }
}
export async function zeitOrdnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-zeit-export", mode: "readwrite" });
  griffHier = h;
  try { await idbTun("put", h, "zeit-export-ordner"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

const jsonOder = (t, ersatz) => { try { return t ? JSON.parse(t) : ersatz; } catch (f) { return ersatz; } };

export async function zeitKonfLaden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert").in("schluessel", ["zeit_export", "zeit_export_status"]), 8000, "HOFERTIME-Export");
  if (r && r.error) throw r.error;
  const w = {};
  ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert, null); });
  return { konf: w.zeit_export || {}, status: w.zeit_export_status || null };
}
export async function zeitKonfSpeichern(konf) {
  const r = await alt.db.from("app_config").upsert([{ schluessel: "zeit_export", wert: JSON.stringify(konf) }]);
  if (r.error) throw r.error;
}
async function statusMelden(s) {
  try { await alt.db.from("app_config").upsert([{ schluessel: "zeit_export_status", wert: JSON.stringify({ ...s, zeit: new Date().toISOString() }) }]); }
  catch (f) { /* Anzeige ist nicht das Wichtigste */ }
}

async function aufraeumen(h, behalten) {
  const namen = [];
  for await (const [name, x] of h.entries()) if (x.kind === "file" && DATEI_RE.test(name)) namen.push(name);
  namen.sort().reverse();
  const grenze = alt.isoDatum(new Date(Date.now() - behalten * 86400000));
  let weg = 0;
  for (const [i, n] of namen.entries()) {
    if (i < 3 || n.match(DATEI_RE)[1] >= grenze) continue;
    try { await h.removeEntry(n); weg++; } catch (f) { console.warn("HOFERTIME-Export löschen ging nicht:", n, f); }
  }
  return weg;
}

let laeuft = null;
export const zeitExportLaeuft = () => !!laeuft;

export async function zeitExportieren(h, { behalten = ZEIT_BEHALTEN } = {}) {
  if (laeuft) throw new Error("Der Export läuft schon.");
  laeuft = (async () => {
    const { auswertungLaden, auswertungRechnen, excelMachen } = await import("../daten/zeitAuswertung.js");
    const tag = alt.isoDatum(new Date());
    // Ganzes laufendes Jahr bis gestern; am 1. Januar das ganze Vorjahr
    const gestern = alt.plusTage(tag, -1);
    const von = gestern.slice(0, 4) + "-01-01";
    const daten = await auswertungLaden(von, tag);
    if (daten.fehlt) throw new Error("Zeiterfassung ist in der Datenbank nicht eingerichtet.");
    const blob = await excelMachen(auswertungRechnen(daten), von, tag);
    const name = "HOFERTIME " + tag + ".xlsx";
    const w = await (await h.getFileHandle(name, { create: true })).createWritable();
    try { await w.write(blob); await w.close(); }
    catch (f) { try { await w.abort(); } catch (f2) { /* egal */ } throw f; }
    const weg = await aufraeumen(h, behalten);
    return { tag, datei: name, personen: daten.personen.length, weg };
  })();
  try { return await laeuft; } finally { laeuft = null; }
}

export async function zeitExportUndMelden(h, optionen) {
  try {
    const l = await zeitExportieren(h, optionen);
    await statusMelden({ tag: l.tag, datei: h.name + "\\" + l.datei, personen: l.personen, geraet: geraetName() });
    return l;
  } catch (f) {
    await statusMelden({ fehler: alt.fehlertext(f), abbruch: true, geraet: geraetName() });
    throw f;
  }
}

let takt = null;
async function pruefen() {
  if (laeuft || !alt.db || !alt.profil || !alt.zeitAdmin || !alt.zeitAdmin()) return;
  if (new Date().getHours() < 5) return;
  let k;
  try { k = await zeitKonfLaden(); } catch (f) { return; }
  const konf = k.konf || {};
  if (!konf.geraet || konf.geraet.id !== geraetId()) return;
  const s = k.status || {};
  const heute = alt.isoDatum(new Date());
  if (s.tag === heute && !s.abbruch) return;
  if (s.abbruch && s.zeit && Date.now() - new Date(s.zeit).getTime() < 3600000) return;
  const h = await zeitOrdnerHolen();
  const erlaubt = await ordnerErlaubt(h, false);
  if (erlaubt !== "granted") { if (erlaubt === "prompt") freigabeKnopf(h); return; }
  freigabeKnopfWeg();
  try { await zeitExportUndMelden(h, { behalten: Number(konf.behalten) || ZEIT_BEHALTEN }); }
  catch (f) { console.warn("HOFERTIME-Export:", f); }
}

function freigabeKnopf(h) {
  if (document.getElementById("zeit-export-freigeben")) return;
  const k = document.createElement("button");
  k.id = "zeit-export-freigeben";
  k.className = "knopf knopf--klein si-freigeben zeit-export-freigeben";
  k.textContent = "HOFERTIME-Export: Ordner freigeben";
  k.onclick = async () => {
    if ((await ordnerErlaubt(h, true)) === "granted") { freigabeKnopfWeg(); pruefen().catch(() => {}); }
  };
  document.body.appendChild(k);
}
function freigabeKnopfWeg() {
  const k = document.getElementById("zeit-export-freigeben");
  if (k) k.remove();
}

export function zeitExportWaechter() {
  if (takt || !kannOrdner) return;
  takt = setInterval(() => { pruefen().catch(() => {}); }, 10 * 60000);
  setTimeout(() => { pruefen().catch(() => {}); }, 55000);
}

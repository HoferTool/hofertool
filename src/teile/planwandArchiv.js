// =================================================================
//  PLANWAND-ARCHIV — jeden Tag eine Planwand zum Nachschauen
//
//  Wunsch Patrick, 10. Oktober 2026: „in einem separaten Ordner eine
//  Planwandsicherung (gesamt), das Ziel ist nicht, sie im Fall
//  hochzuladen, sondern als Index-Datei im Browser zu öffnen und
//  nachzuschauen, wie es war; jeden Tag, Zeit und wie viele Tage
//  einstellbar; nur Planwand als Reiter, keine Zeichnungen, keine
//  sonstigen Dateien“.
//
//  Eine Datei Hofer-Planwand-JJJJ-MM-TT-HHMM.html: die ganze Planwand
//  (alle Aufträge, Maschinen, Ferien) mit eigenem kleinen Programm
//  darin, öffnet sich mit Doppelklick im Browser, ohne App, ohne Netz.
//  Aufbau der Seite in planwandArchivSeite.js.
//
//  Gleicher Ablauf wie die Sicherung (sicherung.js), aber eigener Ordner
//  und eigene Einstellung: Den Ordner wählt man einmal auf einem Gerät
//  (Chrome oder Edge), das ist dann das Archivgerät. Ist dort ein Admin,
//  das Konto Planwand oder das Sicherungskonto angemeldet, schreibt die
//  App ab der eingestellten Stunde einmal am Tag eine Datei und löscht
//  Dateien, die älter sind als eingestellt; die neuesten drei bleiben.
//
//  In app_config (sql/planwand-archiv.sql):
//    planwand_archiv         stunde, behalten, geraet
//    planwand_archiv_status  letzte Datei, Fehler, Liste im Ordner
// =================================================================
import { alt } from "../bruecke.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt, idbTun, wannAusName } from "./sicherung.js";
import { archivSeite } from "./planwandArchivSeite.js";

export const ARCHIV_PRAEFIX = "Hofer-Planwand-";

// ---------- Ordner (eigener als bei der Sicherung) ----------

let griffHier = null;
export async function archivOrdnerHolen() {
  if (griffHier) return griffHier;
  try { return (await idbTun("get", "planwand-ordner")) || null; } catch (f) { return null; }
}

export async function archivOrdnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-planwand", mode: "readwrite" });
  griffHier = h;
  try { await idbTun("put", h, "planwand-ordner"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

// Dateien im Ordner, neueste zuerst
export async function archivListe(h) {
  const liste = [];
  for await (const [name, e] of h.entries()) {
    if (e.kind !== "file" || !name.startsWith(ARCHIV_PRAEFIX) || !name.endsWith(".html")) continue;
    const f = await e.getFile();
    liste.push({ d: name, z: new Date(f.lastModified).toISOString(), kb: Math.round(f.size / 1024) });
  }
  return liste.sort((a, b) => (b.d > a.d ? 1 : b.d < a.d ? -1 : 0));
}

// Älter als eingestellt kommt weg, die neuesten drei bleiben immer
async function aufraeumen(h, tage) {
  const liste = await archivListe(h);
  const grenze = Date.now() - tage * 86400000;
  for (let i = 3; i < liste.length; i++) {
    const w = wannAusName(liste[i].d, liste[i].z);
    if (w && w.getTime() < grenze) { try { await h.removeEntry(liste[i].d); } catch (f) { /* bleibt eben */ } }
  }
}

// ---------- Einstellung und Stand ----------

function jsonOder(text, ersatz) {
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

export async function archivKonfLaden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
    .in("schluessel", ["planwand_archiv", "planwand_archiv_status", "sicherung"]), 8000, "Planwand-Archiv");
  if (r && r.error) throw r.error;
  const w = {};
  ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert, null); });
  return { konf: w.planwand_archiv || {}, status: w.planwand_archiv_status || null,
    sicherungKonto: (w.sicherung && w.sicherung.konto) || null };
}

export async function archivKonfSpeichern(konf) {
  const r = await alt.db.from("app_config").upsert([{ schluessel: "planwand_archiv", wert: JSON.stringify(konf) }]);
  if (r.error) throw r.error;
}

async function statusMelden(teil) {
  let alt0 = null;
  try { alt0 = (await archivKonfLaden()).status; } catch (f) { /* dann neu */ }
  const s = Object.assign({}, alt0 || {}, teil, { zeit: new Date().toISOString() });
  try {
    await alt.db.from("app_config").upsert([{ schluessel: "planwand_archiv_status", wert: JSON.stringify(s) }]);
  } catch (f) { /* Anzeige ist nicht das Wichtigste */ }
  return s;
}

// ---------- Datei schreiben ----------

const zwei = (n) => String(n).padStart(2, "0");
function dateiName(d) {
  return ARCHIV_PRAEFIX + d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate()) + "-"
    + zwei(d.getHours()) + zwei(d.getMinutes()) + ".html";
}

let laeuft = null;
export const archivLaeuft = () => !!laeuft;

export async function archivSchreiben(h) {
  if (laeuft) throw new Error("Die Planwand-Datei wird schon geschrieben.");
  laeuft = (async () => {
    const daten = await alt.planArchivDaten();
    const html = archivSeite(daten);
    const jetzt = new Date(daten.erstellt);
    const name = dateiName(jetzt);
    let ziel = name;
    for (let i = 2; ; i++) {
      try { await h.getFileHandle(ziel); ziel = name.replace(/\.html$/, "-" + i + ".html"); } catch (f) { break; }
    }
    const w = await (await h.getFileHandle(ziel, { create: true })).createWritable();
    await w.write(new Blob([html], { type: "text/html" }));
    await w.close();
    let auftraege = 0;
    daten.parks.forEach((p) => p.maschinen.forEach((m) => { auftraege += m.balken.length; }));
    return { zeit: daten.erstellt, datei: ziel, kb: Math.round(html.length / 1024), auftraege, geraet: geraetName() };
  })();
  try { return await laeuft; } finally { laeuft = null; }
}

export async function archivSchreibenUndMelden(h, tage) {
  try {
    const l = await archivSchreiben(h);
    try { await aufraeumen(h, tage || 30); } catch (f) { /* nächstes Mal */ }
    let liste = [];
    try { liste = (await archivListe(h)).slice(0, 400); } catch (f) { /* leer */ }
    await statusMelden({ letzte: l, fehler: null, liste, geraet: geraetName(), ordner: h.name });
    return l;
  } catch (f) {
    await statusMelden({ fehler: alt.fehlertext(f), geraet: geraetName() });
    throw f;
  }
}

// ---------- Täglich von selbst ----------

let takt = null;
let letzterVersuch = 0;

async function pruefen() {
  if (laeuft || !alt.db || !alt.profil || !alt.planArchivDaten) return;
  if (Date.now() - letzterVersuch < 60 * 60000) return;
  let k;
  try { k = await archivKonfLaden(); } catch (f) { return; }
  const konf = k.konf || {};
  if (!konf.geraet || konf.geraet.id !== geraetId()) return;
  const darf = (alt.darfDokumenteUndSicherung ? alt.darfDokumenteUndSicherung() : alt.istAdmin())
    || (k.sicherungKonto && k.sicherungKonto === alt.profil.id);
  if (!darf) return;
  const stunde = konf.stunde ?? 18;
  const letzte = k.status && k.status.letzte && k.status.letzte.zeit ? new Date(k.status.letzte.zeit) : null;
  const jetzt = new Date();
  const heuteAb = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde);
  // Einmal am Tag ab der Stunde; war die App zu, beim nächsten Öffnen
  const faellig = jetzt >= heuteAb ? (!letzte || letzte < heuteAb)
    : (!letzte || letzte < new Date(heuteAb.getTime() - 86400000));
  if (!faellig) return;
  const h = await archivOrdnerHolen();
  const erlaubt = await ordnerErlaubt(h, false);
  if (erlaubt !== "granted") {
    if (erlaubt === "prompt") freigabeKnopf(h);
    return;
  }
  freigabeKnopfWeg();
  letzterVersuch = Date.now();
  try { await archivSchreibenUndMelden(h, konf.behalten || 30); }
  catch (f) { console.warn("Planwand-Archiv:", f); }
}

// Nach einem Neustart des Browsers gibt er den Ordner nur nach einem
// Tipp wieder frei. Darum unten links ein Knopf, wie bei der Sicherung.
function freigabeKnopf(h) {
  if (document.getElementById("pa-freigeben")) return;
  const k = document.createElement("button");
  k.id = "pa-freigeben";
  k.className = "knopf knopf--klein si-freigeben pa-freigeben";
  k.textContent = "Planwand-Archiv: Ordner freigeben";
  k.onclick = async () => {
    if ((await ordnerErlaubt(h, true)) === "granted") {
      freigabeKnopfWeg();
      letzterVersuch = 0;
      pruefen().catch(() => {});
    }
  };
  document.body.appendChild(k);
}
function freigabeKnopfWeg() {
  const k = document.getElementById("pa-freigeben");
  if (k) k.remove();
}

export function planArchivWaechter() {
  if (takt || !kannOrdner) return;
  takt = setInterval(() => { pruefen().catch(() => {}); }, 5 * 60000);
  setTimeout(() => { pruefen().catch(() => {}); }, 25000);
}

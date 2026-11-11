// =================================================================
//  QMS-NOTFALLPLAN: jeden Tag das ganze QMS als PDF in einen Ordner
//  (seit 1.484.0, Wunsch Patrick 11. November 2026: „alles in PDF-Form
//  abgelegt, im Falle eines Datenverlusts … täglich inkl. Ordnerstruktur,
//  damit ich diese auf dem Server als Kopie habe“).
//
//  Gleicher Ablauf wie die Einrichtblätter als PDF (ebPdf.js): Den Ordner
//  wählt man einmal im QMS-Cockpit auf einem Gerät (Chrome oder Edge),
//  das ist dann das QMS-Gerät. Ist dort jemand angemeldet, der das QMS
//  sieht (nur dann darf die Datenbank die Inhalte lesen), legt die App
//  einmal am Tag ab 5 Uhr einen Ordner „QMS JJJJ-MM-TT“ mit allem an:
//    00 Notfallplan und Inhalt.pdf
//    01 Handbuch\…  02 Listen\…  03 Kompetenzen\…  04 Audits\…
//    05 Managementbewertung\…  06 Lieferanten\…
//  Ordner älter als „Behalten“ Tage löscht sie, die neusten drei bleiben.
//  Die Inhalte gehen nie in die Datenbank oder ins Repository, nur in den
//  Ordner.
//
//  In app_config:
//    qms_pdf          geraet, behalten
//    qms_pdf_status   tag, ordner, dateien, fehler, geraet, zeit
// =================================================================
import { alt } from "../bruecke.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt, idbTun } from "./sicherung.js";

export const QMS_BEHALTEN = 30;
const ORDNER_RE = /^QMS \d{4}-\d{2}-\d{2}$/;

let griffHier = null;
export async function qmsOrdnerHolen() {
  if (griffHier) return griffHier;
  try { return (await idbTun("get", "qms-pdf-ordner")) || null; } catch (f) { return null; }
}
export async function qmsOrdnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-qms-pdf", mode: "readwrite" });
  griffHier = h;
  try { await idbTun("put", h, "qms-pdf-ordner"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

const jsonOder = (t, ersatz) => { try { return t ? JSON.parse(t) : ersatz; } catch (f) { return ersatz; } };

export async function qmsKonfLaden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert").in("schluessel", ["qms_pdf", "qms_pdf_status"]), 8000, "QMS-Notfallplan");
  if (r && r.error) throw r.error;
  const w = {};
  ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert, null); });
  return { konf: w.qms_pdf || {}, status: w.qms_pdf_status || null };
}
export async function qmsKonfSpeichern(konf) {
  const r = await alt.db.from("app_config").upsert([{ schluessel: "qms_pdf", wert: JSON.stringify(konf) }]);
  if (r.error) throw r.error;
}
async function statusMelden(s) {
  try { await alt.db.from("app_config").upsert([{ schluessel: "qms_pdf_status", wert: JSON.stringify({ ...s, zeit: new Date().toISOString() }) }]); }
  catch (f) { /* Anzeige ist nicht das Wichtigste */ }
}

async function unterordner(h, teile) {
  let o = h;
  for (const t of teile) o = await o.getDirectoryHandle(t, { create: true });
  return o;
}
async function schreiben(ordner, name, blob) {
  const w = await (await ordner.getFileHandle(name, { create: true })).createWritable();
  try { await w.write(blob); await w.close(); }
  catch (f) { try { await w.abort(); } catch (f2) { /* egal */ } throw f; }
}

// Ältere Tagesordner weg, die neusten „behalten“ (mindestens drei) bleiben
async function aufraeumen(h, behalten) {
  const namen = [];
  for await (const [name, x] of h.entries()) if (x.kind === "directory" && ORDNER_RE.test(name)) namen.push(name);
  namen.sort().reverse();
  const grenze = alt.isoDatum(new Date(Date.now() - behalten * 86400000));
  let weg = 0;
  for (const [i, n] of namen.entries()) {
    if (i < 3 || n.slice(4) >= grenze) continue;
    try { await h.removeEntry(n, { recursive: true }); weg++; } catch (f) { console.warn("QMS-Ordner löschen ging nicht:", n, f); }
  }
  return weg;
}

let laeuft = null;
export const qmsLaeuft = () => !!laeuft;

export async function qmsAblegen(h, { behalten = QMS_BEHALTEN, fortschritt } = {}) {
  if (laeuft) throw new Error("Der Notfallplan wird schon abgelegt.");
  laeuft = (async () => {
    const [{ qmaLaden }, { notfallDateien }, { pdfAusHtml }] = await Promise.all([
      import("../daten/qmAlt.js"), import("../seiten/qmAlt/notfallInhalt.js"), import("../seiten/qmAlt/checklistePdf.js")]);
    const daten = await qmaLaden();
    const tag = alt.isoDatum(new Date());
    const stand = tag.slice(8, 10) + "." + tag.slice(5, 7) + "." + tag.slice(0, 4) + " " + new Date().toTimeString().slice(0, 5);
    const dateien = notfallDateien(daten, stand);
    const name = "QMS " + tag;
    // Zweites Mal am selben Tag: von vorne, damit nichts Veraltetes liegen bleibt
    try { await h.removeEntry(name, { recursive: true }); } catch (f) { /* gab es noch nicht */ }
    const tagOrdner = await h.getDirectoryHandle(name, { create: true });
    const fehler = [];
    let n = 0;
    for (const d of dateien) {
      if (fortschritt) fortschritt(n, dateien.length);
      try {
        const blob = d.url
          ? await (async () => { const r = await fetch(d.url); if (!r.ok) throw new Error("Bericht nicht gefunden (" + r.status + ")"); return r.blob(); })()
          : await pdfAusHtml(d.html, d.fuss + " · Notfallkopie " + stand);
        await schreiben(await unterordner(tagOrdner, d.pfad.slice(0, -1)), d.pfad[d.pfad.length - 1], blob);
      } catch (f) {
        fehler.push(d.pfad.join("\\") + ": " + alt.fehlertext(f));
      }
      n++;
    }
    const weg = await aufraeumen(h, behalten);
    return { tag, ordner: name, dateien: dateien.length - fehler.length, fehler, weg };
  })();
  try { return await laeuft; } finally { laeuft = null; }
}

export async function qmsAblegenUndMelden(h, optionen) {
  try {
    const l = await qmsAblegen(h, optionen);
    await statusMelden({ tag: l.tag, ordner: h.name + "\\" + l.ordner, dateien: l.dateien, fehler: l.fehler.length ? l.fehler.slice(0, 20) : null, geraet: geraetName() });
    return l;
  } catch (f) {
    await statusMelden({ fehler: [alt.fehlertext(f)], abbruch: true, geraet: geraetName() });
    throw f;
  }
}

// ---------- Einmal am Tag von selbst ----------
let takt = null;

async function pruefen() {
  if (laeuft || !alt.db || !alt.profil || !alt.seiteSichtbar || !alt.seiteSichtbar("qmalt")) return;
  if (new Date().getHours() < 5) return;
  let k;
  try { k = await qmsKonfLaden(); } catch (f) { return; }
  const konf = k.konf || {};
  if (!konf.geraet || konf.geraet.id !== geraetId()) return;
  const s = k.status || {};
  const heute = alt.isoDatum(new Date());
  // Nach einem Abbruch frühestens nach einer Stunde nochmals
  if (s.tag === heute && !s.abbruch) return;
  if (s.abbruch && s.zeit && Date.now() - new Date(s.zeit).getTime() < 3600000) return;
  const h = await qmsOrdnerHolen();
  const erlaubt = await ordnerErlaubt(h, false);
  if (erlaubt !== "granted") { if (erlaubt === "prompt") freigabeKnopf(h); return; }
  freigabeKnopfWeg();
  try { await qmsAblegenUndMelden(h, { behalten: Number(konf.behalten) || QMS_BEHALTEN }); }
  catch (f) { console.warn("QMS-Notfallplan:", f); }
}

// Nach einem Neustart des Browsers gibt er den Ordner nur nach einem Tipp frei
function freigabeKnopf(h) {
  if (document.getElementById("qms-pdf-freigeben")) return;
  const k = document.createElement("button");
  k.id = "qms-pdf-freigeben";
  k.className = "knopf knopf--klein si-freigeben qms-pdf-freigeben";
  k.textContent = "QMS-Notfallplan: Ordner freigeben";
  k.onclick = async () => {
    if ((await ordnerErlaubt(h, true)) === "granted") { freigabeKnopfWeg(); pruefen().catch(() => {}); }
  };
  document.body.appendChild(k);
}
function freigabeKnopfWeg() {
  const k = document.getElementById("qms-pdf-freigeben");
  if (k) k.remove();
}

export function qmsPdfWaechter() {
  if (takt || !kannOrdner) return;
  takt = setInterval(() => { pruefen().catch(() => {}); }, 10 * 60000);
  setTimeout(() => { pruefen().catch(() => {}); }, 50000);
}

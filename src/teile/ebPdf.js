// =================================================================
//  EINRICHTBLÄTTER ALS PDF SICHERN
//
//  Wunsch Patrick, 26. Oktober 2026: „wenn HoferTool-EB vorhanden ist,
//  soll diese als PDF abgesichert werden in einem Ordner, den ich
//  hinterlegen kann; es soll, wenn es geht, die aktuelle im Ordner
//  überschreiben, sonst soll es eine V-Nummer haben; das ist nur dafür,
//  dass ich, wenn alles weg wäre, noch Einrichtblätter habe“.
//
//  Jedes Blatt aus der App mit „EB OK“ (einrichtblatt_app.gut_am) kommt als PDF in
//  den gewählten Ordner, je Maschinentyp ein Unterordner:
//    <Ordner>\Star SB-20\10841-0009 Star SB-20.pdf
//  Ändert sich das Blatt, wird die Datei überschrieben. Geht das nicht
//  (zum Beispiel weil sie gerade im PDF-Programm offen ist), kommt eine
//  neue Datei „… V2.pdf“, „… V3.pdf“ daneben. Welches Blatt mit welchem
//  Stand schon im Ordner ist, steht in der Datei .hofer-eb-stand.json im
//  Ordner selbst, so bleibt es auch nach einem Browser-Wechsel richtig.
//  Gelöschte Blätter bleiben im Ordner, es ist ja eine Sicherung.
//
//  Gleicher Ablauf wie das Planwand-Archiv: Den Ordner wählt man einmal
//  auf einem Gerät (Chrome oder Edge), das ist dann das EB-Gerät. Ist
//  dort ein Admin, das Konto Planwand oder das Sicherungskonto
//  angemeldet, schaut die App alle 5 Minuten nach geänderten Blättern
//  und schreibt höchstens 40 je Durchgang (das erste Mal dauert es
//  darum ein paar Stunden, oder „Jetzt sichern“).
//
//  In app_config (sql/einrichtblatt-pdf.sql):
//    eb_pdf          geraet
//    eb_pdf_status   gesichert, gesamt, offen, letzte, fehler
// =================================================================
import { alt } from "../bruecke.jsx";
import { kannOrdner, geraetId, geraetName, ordnerErlaubt, idbTun } from "./sicherung.js";

const STAND_DATEI = ".hofer-eb-stand.json";
// Höher zählen, wenn das PDF anders aussehen soll: dann kommt alles neu
const FASSUNG = 1;

// ---------- Ordner ----------

let griffHier = null;
export async function ebOrdnerHolen() {
  if (griffHier) return griffHier;
  try { return (await idbTun("get", "eb-pdf-ordner")) || null; } catch (f) { return null; }
}

export async function ebOrdnerWaehlen() {
  const h = await window.showDirectoryPicker({ id: "hofer-eb-pdf", mode: "readwrite" });
  griffHier = h;
  try { await idbTun("put", h, "eb-pdf-ordner"); } catch (f) { /* dann nur bis zum Neuladen */ }
  return h;
}

// ---------- Einstellung und Stand ----------

function jsonOder(text, ersatz) {
  try { return text ? JSON.parse(text) : ersatz; } catch (f) { return ersatz; }
}

export async function ebKonfLaden() {
  const r = await alt.zeitlimit(alt.db.from("app_config").select("schluessel, wert")
    .in("schluessel", ["eb_pdf", "eb_pdf_status", "sicherung"]), 8000, "Einrichtblätter als PDF");
  if (r && r.error) throw r.error;
  const w = {};
  ((r && r.data) || []).forEach((x) => { w[x.schluessel] = jsonOder(x.wert, null); });
  return { konf: w.eb_pdf || {}, status: w.eb_pdf_status || null,
    sicherungKonto: (w.sicherung && w.sicherung.konto) || null };
}

export async function ebKonfSpeichern(konf) {
  const r = await alt.db.from("app_config").upsert([{ schluessel: "eb_pdf", wert: JSON.stringify(konf) }]);
  if (r.error) throw r.error;
}

async function statusMelden(teil) {
  let vorher = null;
  try { vorher = (await ebKonfLaden()).status; } catch (f) { /* dann neu */ }
  const s = Object.assign({}, vorher || {}, teil, { zeit: new Date().toISOString() });
  try {
    await alt.db.from("app_config").upsert([{ schluessel: "eb_pdf_status", wert: JSON.stringify(s) }]);
  } catch (f) { /* Anzeige ist nicht das Wichtigste */ }
  return s;
}

// ---------- Dateien im Ordner ----------

async function standLesen(h) {
  try {
    const f = await (await h.getFileHandle(STAND_DATEI)).getFile();
    return jsonOder(await f.text(), {}) || {};
  } catch (f) { return {}; }
}

async function standSchreiben(h, stand) {
  const w = await (await h.getFileHandle(STAND_DATEI, { create: true })).createWritable();
  await w.write(new Blob([JSON.stringify(stand)], { type: "application/json" }));
  await w.close();
}

// Zeichen, die Windows im Dateinamen nicht mag
const sauber = (t) => String(t || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "ohne Name";

async function gibt(ordner, name) {
  try { await ordner.getFileHandle(name); return true; } catch (f) { return false; }
}

async function inDatei(ordner, name, blob) {
  const w = await (await ordner.getFileHandle(name, { create: true })).createWritable();
  try { await w.write(blob); await w.close(); }
  catch (f) { try { await w.abort(); } catch (f2) { /* egal */ } throw f; }
}

// Überschreiben, wenn es geht, sonst die nächste freie V-Nummer
async function pdfAblegen(ordner, basis, blob) {
  const name = basis + ".pdf";
  try { await inDatei(ordner, name, blob); return name; }
  catch (f) { console.warn("EB-PDF überschreiben ging nicht:", name, f); }
  for (let v = 2; v < 1000; v++) {
    const n = basis + " V" + v + ".pdf";
    if (await gibt(ordner, n)) continue;
    await inDatei(ordner, n, blob);
    return n;
  }
  throw new Error("Keine freie V-Nummer für " + basis);
}

// ---------- Blätter ----------

// Alle Blätter mit „EB OK“, seitenweise (die Datenbank gibt höchstens
// 1000 auf einmal). Nur die bestätigten: Wunsch Patrick 26. Oktober 2026
// „es soll erst anfangen speichern nach EB OK, die Excel sind ja schon
// gesichert“. Gefiltert hier, nicht in der Abfrage, damit es auch im
// Prüfstand gilt.
async function alleBlaetter() {
  const aus = [];
  for (let ab = 0; ; ab += 1000) {
    const r = await alt.db.from("einrichtblatt_app").select("id, hoco_nr, type_id, geaendert_am, gut_am")
      .order("hoco_nr").range(ab, ab + 999);
    if (r.error) throw r.error;
    const d = r.data || [];
    aus.push(...d.filter((b) => b.gut_am));
    if (d.length < 1000) break;
  }
  return aus;
}

const stempel = (b) => FASSUNG + "|" + (b.geaendert_am || "");

let laeuft = null;
export const ebLaeuft = () => !!laeuft;

// Schreibt geänderte Blätter; hoechstens = wie viele in diesem Durchgang
// (0 = alle), fortschritt(n, offen) für die Anzeige
export async function ebSichern(h, { hoechstens = 40, fortschritt } = {}) {
  if (laeuft) throw new Error("Die Einrichtblätter werden schon gesichert.");
  laeuft = (async () => {
    const { blattPdf } = await import("../einrichtblatt/pdfMachen.jsx");
    const blaetter = await alleBlaetter();
    const typen = await alt.ladeTypen();
    const typName = (id) => ((typen || []).find((t) => t.id === id) || {}).name || "Ohne Typ";
    const stand = await standLesen(h);
    const offen = blaetter.filter((b) => (stand[b.id] || {}).s !== stempel(b));
    const reihe = hoechstens ? offen.slice(0, hoechstens) : offen;
    const fehler = [];
    let n = 0;
    let letzte = null;
    for (const b of reihe) {
      if (fortschritt) fortschritt(n, offen.length);
      try {
        const typ = typName(b.type_id);
        const ordner = await h.getDirectoryHandle(sauber(typ), { create: true });
        const { blob } = await blattPdf(b.hoco_nr, b.type_id);
        const datei = await pdfAblegen(ordner, sauber(b.hoco_nr + " " + typ), blob);
        stand[b.id] = { s: stempel(b), d: sauber(typ) + "/" + datei };
        letzte = { hoco: b.hoco_nr, typ, datei: sauber(typ) + "/" + datei };
      } catch (f) {
        // Nicht jedes Mal wieder versuchen, erst wenn das Blatt sich ändert
        stand[b.id] = { s: stempel(b), fehler: alt.fehlertext(f) };
        fehler.push(b.hoco_nr + " " + typName(b.type_id) + ": " + alt.fehlertext(f));
      }
      n++;
      // Zwischendurch den Stand ablegen, falls die App zugeht
      if (n % 10 === 0) { try { await standSchreiben(h, stand); } catch (f) { /* am Schluss nochmals */ } }
    }
    await standSchreiben(h, stand);
    const ids = new Set(blaetter.map((b) => b.id));
    const gesichert = Object.entries(stand).filter(([id, x]) => ids.has(id) && x.d && !x.fehler).length;
    return { geschrieben: n - fehler.length, fehler, gesamt: blaetter.length, gesichert,
      offen: offen.length - n, letzte };
  })();
  try { return await laeuft; } finally { laeuft = null; }
}

export async function ebSichernUndMelden(h, optionen) {
  try {
    const l = await ebSichern(h, optionen);
    const neu = { gesamt: l.gesamt, gesichert: l.gesichert, offen: l.offen,
      fehler: l.fehler.length ? l.fehler.slice(0, 20) : null, geraet: geraetName(), ordner: h.name };
    if (l.letzte) neu.letzte = Object.assign({ zeit: new Date().toISOString() }, l.letzte);
    await statusMelden(neu);
    return l;
  } catch (f) {
    await statusMelden({ fehler: [alt.fehlertext(f)], geraet: geraetName() });
    throw f;
  }
}

// ---------- Alle 5 Minuten von selbst ----------

let takt = null;

async function pruefen() {
  if (laeuft || !alt.db || !alt.profil || !alt.ladeTypen) return;
  let k;
  try { k = await ebKonfLaden(); } catch (f) { return; }
  const konf = k.konf || {};
  if (!konf.geraet || konf.geraet.id !== geraetId()) return;
  const darf = (alt.darfDokumenteUndSicherung ? alt.darfDokumenteUndSicherung() : alt.istAdmin())
    || (k.sicherungKonto && k.sicherungKonto === alt.profil.id);
  if (!darf) return;
  const h = await ebOrdnerHolen();
  const erlaubt = await ordnerErlaubt(h, false);
  if (erlaubt !== "granted") {
    if (erlaubt === "prompt") freigabeKnopf(h);
    return;
  }
  freigabeKnopfWeg();
  try {
    const l = await ebSichern(h, { hoechstens: 40 });
    // Nur melden, wenn sich etwas getan hat, sonst bleibt app_config ruhig
    if (l.geschrieben || l.fehler.length || !k.status || k.status.gesamt !== l.gesamt) {
      const neu = { gesamt: l.gesamt, gesichert: l.gesichert, offen: l.offen,
        fehler: l.fehler.length ? l.fehler.slice(0, 20) : (k.status && k.status.fehler) || null,
        geraet: geraetName(), ordner: h.name };
      if (l.geschrieben) neu.fehler = l.fehler.length ? l.fehler.slice(0, 20) : null;
      if (l.letzte) neu.letzte = Object.assign({ zeit: new Date().toISOString() }, l.letzte);
      await statusMelden(neu);
    }
  } catch (f) {
    console.warn("Einrichtblätter als PDF:", f);
    await statusMelden({ fehler: [alt.fehlertext(f)], geraet: geraetName() });
  }
}

// Nach einem Neustart des Browsers gibt er den Ordner nur nach einem
// Tipp wieder frei. Darum unten links ein Knopf, wie bei der Sicherung.
function freigabeKnopf(h) {
  if (document.getElementById("eb-pdf-freigeben")) return;
  const k = document.createElement("button");
  k.id = "eb-pdf-freigeben";
  k.className = "knopf knopf--klein si-freigeben eb-pdf-freigeben";
  k.textContent = "Einrichtblätter: Ordner freigeben";
  k.onclick = async () => {
    if ((await ordnerErlaubt(h, true)) === "granted") {
      freigabeKnopfWeg();
      pruefen().catch(() => {});
    }
  };
  document.body.appendChild(k);
}
function freigabeKnopfWeg() {
  const k = document.getElementById("eb-pdf-freigeben");
  if (k) k.remove();
}

export function ebPdfWaechter() {
  if (takt || !kannOrdner) return;
  takt = setInterval(() => { pruefen().catch(() => {}); }, 5 * 60000);
  setTimeout(() => { pruefen().catch(() => {}); }, 35000);
}

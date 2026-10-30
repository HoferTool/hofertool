// =================================================================
//  EINRICHTBLATT AUS EXCEL EINLESEN
//  Liest ein bisheriges Excel-Einrichtblatt („Werkzeug-Protokoll“ wie
//  beim SW-20) und macht daraus den Inhalt für das Blatt in der App
//  (Wunsch Patrick, 12. Oktober 2026: „alle Einrichtblätter lesen, neue
//  macht man im Tool“).
//
//  Gelesen wird die Datei selbst (jszip), nicht über exceljs: Die
//  HD-Kästchen sind Textfelder in der Zeichnungsebene, die exceljs
//  nicht kennt, und die Bilder hängen dort mit ihrer Zelle.
//
//  Aufbau eines Platzes im Excel, ab der Zelle mit „T100“:
//    darunter      Standzeit (Zahl, violett)
//    2 darunter    Tätigkeit („Abstechen“)
//    3 darunter    Mass („Planieren / Ø19.85“)
//    danach        Bild, dann Hersteller und Werkzeug (die letzten
//                  zwei Texte bis zum nächsten Platz darunter)
//  Ein Platz ist zwei Spalten breit. „HD“ ist ein Textfeld in der
//  Zeile des Platzes.
//  Links unten der Kopf mit Bezeichnungen in der ersten Spalte und
//  dem Wert rechts daneben.
//
//  Star hat dieselben Plätze (T100 …), Index dreimal T1 bis T10, je
//  einmal für Revolver 1, 2 und 3 untereinander; die werden zu „R1-T1“,
//  „R2-T1“ und „R3-T1“ (Patrick, 23. Oktober 2026: Blatt für alle Typen).
// =================================================================
import JSZip from "jszip";

const PLATZ = /^T\d{1,4}$/;
const REVOLVER_PLATZ = /^T\d{1,2}$/;
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function xml(text) { return new DOMParser().parseFromString(text, "application/xml"); }
const alle = (knoten, name) => [...knoten.getElementsByTagNameNS("*", name)];
const erstes = (knoten, name) => alle(knoten, name)[0] || null;

// „AB12“ → { s: 28, z: 12 } (Spalte und Zeile ab 1)
function zelleZerlegen(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || "");
  if (!m) return null;
  let s = 0;
  for (const c of m[1]) s = s * 26 + (c.charCodeAt(0) - 64);
  return { s, z: Number(m[2]) };
}

// Pfad einer Beziehung auflösen: „../media/image1.jpg“ von xl/drawings/
function pfadDazu(basis, ziel) {
  if (ziel.startsWith("/")) return ziel.slice(1);
  const teile = basis.split("/"); teile.pop();
  for (const t of ziel.split("/")) {
    if (t === "..") teile.pop(); else if (t !== ".") teile.push(t);
  }
  return teile.join("/");
}

async function beziehungen(zip, pfad) {
  const teile = pfad.split("/"); const name = teile.pop();
  const datei = zip.file(teile.concat(["_rels", name + ".rels"]).join("/"));
  const raus = {};
  if (!datei) return raus;
  for (const r of alle(xml(await datei.async("string")), "Relationship")) {
    raus[r.getAttribute("Id")] = pfadDazu(pfad, r.getAttribute("Target"));
  }
  return raus;
}

const TYP_BILD = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", emf: null, wmf: null };

// Die erste sichtbare Tabelle der Mappe: Zellen, Bilder und Textfelder
export async function excelRoh(daten) {
  // Altes .xls (vorne D0 CF 11 E0) liest SheetJS
  if (daten[0] === 0xd0 && daten[1] === 0xcf && daten[2] === 0x11 && daten[3] === 0xe0) return xlsRoh(daten);
  const zip = await JSZip.loadAsync(daten);
  const buch = zip.file("xl/workbook.xml");
  if (!buch) throw new Error("Keine Excel-Datei (.xlsx)");
  const bez = await beziehungen(zip, "xl/workbook.xml");
  const blaetter = alle(xml(await buch.async("string")), "sheet");
  const blatt = blaetter.find((b) => (b.getAttribute("state") || "visible") === "visible") || blaetter[0];
  if (!blatt) throw new Error("Die Mappe hat keine Tabelle");
  const rid = blatt.getAttributeNS(R_NS, "id")
    || blatt.getAttribute("r:id");
  const pfad = bez[rid] || "xl/worksheets/sheet1.xml";

  const texte = [];
  const sst = zip.file("xl/sharedStrings.xml");
  if (sst) {
    for (const si of alle(xml(await sst.async("string")), "si")) {
      texte.push(alle(si, "t").map((t) => t.textContent).join(""));
    }
  }

  const zellen = {};
  const dok = xml(await zip.file(pfad).async("string"));
  for (const c of alle(dok, "c")) {
    const ort = zelleZerlegen(c.getAttribute("r"));
    if (!ort) continue;
    const typ = c.getAttribute("t");
    const v = erstes(c, "v");
    let wert = null;
    if (typ === "s") wert = v ? texte[Number(v.textContent)] : null;
    else if (typ === "inlineStr") wert = alle(c, "t").map((t) => t.textContent).join("");
    else if (erstes(c, "f")) wert = null;   // Formeln (etwa =HEUTE()) zählen nicht
    else wert = v ? v.textContent : null;
    if (wert === null || String(wert).trim() === "") continue;
    zellen[ort.z + ":" + ort.s] = { s: ort.s, z: ort.z, text: String(wert).trim(), zahl: typ !== "s" && typ !== "inlineStr" && typ !== "str" };
  }

  // Zeichnungsebene: Bilder und Textfelder mit ihrer Ankerzelle
  const bilder = [], felder = [];
  const blattBez = await beziehungen(zip, pfad);
  const dz = erstes(dok, "drawing");
  const zeichnungRid = dz ? (dz.getAttributeNS(R_NS, "id") || dz.getAttribute("r:id")) : null;
  const zeichnungPfad = zeichnungRid ? blattBez[zeichnungRid] : null;
  if (zeichnungPfad && zip.file(zeichnungPfad)) {
    const zBez = await beziehungen(zip, zeichnungPfad);
    const zDok = xml(await zip.file(zeichnungPfad).async("string"));
    const anker = alle(zDok, "twoCellAnchor").concat(alle(zDok, "oneCellAnchor"));
    for (const a of anker) {
      const von = erstes(a, "from");
      if (!von) continue;
      const s = Number((erstes(von, "col") || {}).textContent) + 1;
      const z = Number((erstes(von, "row") || {}).textContent) + 1;
      for (const blip of alle(a, "blip")) {
        const id = blip.getAttributeNS(R_NS, "embed")
          || blip.getAttribute("r:embed");
        const datei = id && zBez[id];
        if (!datei || !zip.file(datei)) continue;
        const endung = (datei.split(".").pop() || "").toLowerCase();
        if (!TYP_BILD[endung]) continue;     // EMF/WMF zeigt der Browser nicht
        bilder.push({ s, z, pfad: datei, typ: TYP_BILD[endung], endung: endung === "jpeg" ? "jpg" : endung,
          lesen: () => zip.file(datei).async("uint8array") });
      }
      for (const sp of alle(a, "sp")) {
        const t = alle(sp, "t").map((x) => x.textContent).join("").trim();
        if (t) felder.push({ s, z, text: t });
      }
    }
  }
  return { zellen, bilder, felder };
}

// Alte .xls (Excel 97–2003, rund 400 Einrichtblätter; Wunsch Patrick,
// 26. Oktober 2026: „auch alte Version lesen“). SheetJS kennt dort nur
// die Zellen, keine Bilder und Textfelder: HD-Kästchen und Sinnbilder
// fehlen also, das ergänzt man beim Prüfen von Hand.
let sheetJs = null;
async function xlsRoh(daten) {
  if (!sheetJs) sheetJs = import("xlsx").then((m) => (m.default && m.default.read ? m.default : m));
  const XLSX = await sheetJs;
  const wb = XLSX.read(daten, { type: "array", cellFormula: true, cellHTML: false, cellStyles: false });
  const info = (wb.Workbook && wb.Workbook.Sheets) || [];
  const name = wb.SheetNames.find((n, i) => !(info[i] && info[i].Hidden)) || wb.SheetNames[0];
  const ws = name && wb.Sheets[name];
  if (!ws) throw new Error("Die Mappe hat keine Tabelle");
  const zellen = {};
  for (const ref of Object.keys(ws)) {
    if (ref[0] === "!") continue;
    const ort = zelleZerlegen(ref);
    const c = ws[ref];
    if (!ort || !c || c.f) continue;          // Formeln zählen nicht, wie beim .xlsx
    const wert = c.v;
    if (wert === null || wert === undefined || String(wert).trim() === "") continue;
    zellen[ort.z + ":" + ort.s] = { s: ort.s, z: ort.z, text: String(wert).trim(), zahl: c.t === "n" || c.t === "b" };
  }
  return { zellen, bilder: [], felder: [] };
}

// Bezeichnungen im Kopf, ohne Leerzeichen, Punkte und Striche
const schluessel = (t) => String(t || "").toLowerCase().replace(/[\s.\-_:/]+/g, "");
const KOPF = [
  [/^programmpath(\d+)/, "programm"],
  [/^geometrie/, "geometrie"],
  [/^ho&?co(nr)?/, "hoco"],
  [/^programm(nr|nummer)/, "prgnr"],
  [/^fabrik/, "fa_nr"],
  [/^artikelbez/, "bezeichnung"],
  [/^n1000/, "n1000"],
  [/^festanschlag/, "festanschlag"],
  // „Anschlag Länge“ ist im Index-Excel dasselbe wie „Festanschlag Länge“
  [/^anschlagl/, "festanschlag"],
  [/^anschlag/, "anschlag_von"],
  [/^zeichnungs?n(r|ummer)/, "zeichnungs_nr"],
  [/^index/, "index_nr"],
  [/^autom/, "autom"],
  [/^material/, "material"],
  [/^prod.*zeit/, "stueckzeit"],
  [/^waschgeb/, "waschgebinde"],
  [/^masch.*laufzeit/, "abend"],
];
const zahlDarin = (t) => { const m = /(\d+(?:[.,]\d+)?)/.exec(String(t || "").replace(/'/g, "")); return m ? Number(m[1].replace(",", ".")) : null; };

// Aus den Rohdaten das Blatt: { kopf, stamm, plaetze, hinweise }
export function blattAusExcel(roh) {
  const { zellen, felder } = roh;
  const bei = (z, s) => zellen[z + ":" + s] || null;
  const liste = Object.values(zellen);
  const maxZeile = liste.reduce((m, c) => Math.max(m, c.z), 0);
  const hinweise = [];

  // Werkzeugplätze
  const koepfe = liste.filter((c) => PLATZ.test(c.text)).sort((a, b) => a.z - b.z || a.s - b.s);
  const benutzt = new Set();
  const plaetze = {};
  const revolverZaehler = {};
  for (const k of koepfe) {
    benutzt.add(k.z + ":" + k.s);
    // Index: das wievielte T1 von oben, so viel Revolver
    let name = k.text;
    if (REVOLVER_PLATZ.test(name)) {
      revolverZaehler[name] = (revolverZaehler[name] || 0) + 1;
      name = "R" + revolverZaehler[name] + "-" + name;
    }
    const darunter = koepfe.filter((x) => x.s === k.s && x.z > k.z).map((x) => x.z);
    // Beim Star steht der Kopf oft gleich unter T100 und T200 („Programm
    // Nr. :“ eine Zeile höher als sonst, sein Wert unter T200): eine
    // Kopfzeile beendet den Platz
    for (let z = k.z + 1; z < k.z + 9; z++) {
      if ([bei(z, k.s), bei(z, k.s + 1)].some((x) => x && /:|laufzeit/i.test(x.text) && KOPF.some(([re]) => re.test(schluessel(x.text))))
        || [k.s - 3, k.s - 2, k.s - 1].map((s) => bei(z, s)).some((x) => x && /^programm(nr|nummer)/.test(schluessel(x.text)))) { darunter.push(z); break; }
    }
    const ende = darunter.length ? Math.min(...darunter) : Math.min(maxZeile + 1, k.z + 8);
    // Zwei Spalten breit, ausser der nächste Platz steht gleich daneben
    const nachbar = koepfe.filter((x) => x.z === k.z && x.s > k.s).map((x) => x.s);
    const breite = nachbar.length ? Math.max(1, Math.min(2, Math.min(...nachbar) - k.s)) : 2;
    const text = (z) => {
      if (z >= ende) return "";
      const zellen = [bei(z, k.s), breite > 1 ? bei(z, k.s + 1) : null].filter(Boolean);
      for (const x of zellen) benutzt.add(x.z + ":" + x.s);
      return zellen.map((x) => x.text).join(" ").trim();
    };
    const p = {};
    const zahl = text(k.z + 1);
    // Standzeit nur, wenn dort bloss eine Zahl steht; beim SB-16C steht
    // in dieser Zeile oft schon die Aufgabe („Zeichen Ø8.4“)
    const nurZahl = /^[\d'’.,\s]+(stk\.?|stück)?$/i.test(zahl);
    if (zahl && nurZahl) { const n = zahlDarin(zahl); if (n !== null) p.standzeit = n; }
    // Unten stehen Lieferant und Artikel-Nr. (zwei Zeilen direkt
    // untereinander), oben die Aufgabe. Im Excel stehen dazwischen oft
    // Leerzeilen („Bohren“, leer, „Ø 3.50“), darum zählen nur Zeilen mit
    // Text. Bei nur zwei Zeilen ist die untere die Artikel-Nr., wenn sie
    // ganz unten steht oder Platz fürs Bild dazwischen ist.
    const L = [];
    if (zahl && !nurZahl) L.push({ z: k.z + 1, t: zahl });
    for (let z = k.z + 2; z < ende; z++) { const t = text(z); if (t) L.push({ z, t }); }
    const unten = [];
    if (L.length >= 3 || (L.length === 2 && (L[1].z >= ende - 2 || L[1].z - L[0].z > 2))) {
      unten.unshift(L.pop());
      if (L.length >= 2 && L[L.length - 1].z === unten[0].z - 1) unten.unshift(L.pop());
    }
    if (L[0]) p.taetigkeit = L[0].t;
    if (L.length > 1) p.mass = L.slice(1).map((x) => x.t).join(" ");
    if (unten.length === 2) p.hersteller = unten[0].t;
    if (unten.length) p.werkzeug = unten[unten.length - 1].t;
    p.hd = felder.some((f) => /^HD$/i.test(f.text) && f.z >= k.z - 1 && f.z <= k.z && f.s >= k.s && f.s <= k.s + breite - 1);
    p._ende = ende;
    p._s = k.s; p._z = k.z;
    if (plaetze[name]) hinweise.push(name + " steht zweimal im Blatt, der erste zählt");
    else plaetze[name] = p;
  }

  // Bilder: das erste, dessen Ecke im Platz liegt
  for (const b of roh.bilder) {
    const nr = Object.keys(plaetze).find((n) => {
      const p = plaetze[n];
      return b.s >= p._s && b.s <= p._s + 1 && b.z > p._z && b.z < p._ende;
    });
    if (nr && !plaetze[nr]._bild) plaetze[nr]._bild = b;
  }

  // Kopf
  const kopf = { programme: {}, geometrie: null, maschine_nr: null, bemerkung: null, felder: {} };
  const stamm = {};
  const typDaten = {};
  let hoco = null, autom = null;
  const kopfZeilen = [];
  for (const c of liste.sort((a, b) => a.z - b.z || a.s - b.s)) {
    if (benutzt.has(c.z + ":" + c.s)) continue;
    const k = schluessel(c.text);
    const treffer = KOPF.find(([re]) => re.test(k));
    if (!treffer) continue;
    benutzt.add(c.z + ":" + c.s);
    // Werte rechts daneben, bis zum nächsten Werkzeugplatz
    const werte = [];
    for (let s = c.s + 1; s <= c.s + 3; s++) {
      const w = bei(c.z, s);
      if (!w || benutzt.has(w.z + ":" + w.s) || PLATZ.test(w.text)) continue;
      werte.push(w.text); benutzt.add(w.z + ":" + w.s);
    }
    // Beim Index steht der Wert oft in derselben Zelle („Prod.- Zeit: 109 sek.“)
    const inZelle = (/:\s*(.+)$/.exec(c.text) || [])[1];
    if (!werte.length && inZelle && inZelle.trim()) werte.push(inZelle.trim());
    // Die zweite Zeile beim Material (Mass wie „Ø16.0 h11“) steht im
    // Excel ohne Bezeichnung darunter
    const naechste = bei(c.z + 1, c.s);
    if (treffer[1] === "material" && (!naechste || benutzt.has(naechste.z + ":" + naechste.s))) {
      for (let s = c.s + 1; s <= c.s + 3; s++) {
        const w = bei(c.z + 1, s);
        if (!w || benutzt.has(w.z + ":" + w.s) || PLATZ.test(w.text)) continue;
        werte.push(w.text); benutzt.add(w.z + ":" + w.s);
      }
    }
    kopfZeilen.push(c.z);
    const wert = werte.join(" ").trim();
    const art = treffer[1];
    if (art === "programm") { if (wert) kopf.programme[treffer[0].exec(k)[1]] = wert; }
    else if (art === "geometrie") kopf.geometrie = wert || null;
    else if (art === "hoco") hoco = wert || null;
    else if (art === "prgnr") { if (wert) kopf.programme.nr = wert; }
    // Die FA Nr. gehört nicht ins Blatt (Wunsch Patrick, 24. Oktober 2026)
    else if (art === "fa_nr") continue;
    else if (["n1000", "festanschlag", "anschlag_von"].includes(art)) { if (wert) kopf.felder[art] = wert; }
    else if (art === "autom") {
      autom = werte[0] || null;
      const nr = werte.slice(1).join(" ").trim() || (/\bnr\.?\s*\S+/i.exec(wert) || [])[0];
      kopf.maschine_nr = nr || null;
    } else if (art === "stueckzeit") { const n = zahlDarin(wert); if (n) typDaten.stueckzeit_s = n; }
    else if (art === "abend") { const n = zahlDarin(wert); if (/laufen/i.test(wert)) typDaten.abend_stk = -1; else if (n) typDaten.abend_stk = Math.round(n); }
    else if (wert) stamm[art] = wert;
  }

  // Freie Zeilen im Kopf (etwa „Abgreifen mit Schnabelzange“): alles
  // in den Spalten des Kopfs unterhalb der ersten Kopfzeile, was kein
  // Platz ist; der Hinweis „Werkzeugwechsel“ ist nur ein Knopf im Excel
  if (kopfZeilen.length) {
    const ab = Math.min(...kopfZeilen);
    const spalteBis = Math.min(...liste.filter((c) => PLATZ.test(c.text) && c.z >= ab).map((c) => c.s), 99) - 1;
    const frei = liste.filter((c) => !benutzt.has(c.z + ":" + c.s) && c.z >= ab && c.s <= spalteBis
      && !/^werkzeugwechsel$/i.test(c.text))
      .sort((a, b) => a.z - b.z || a.s - b.s);
    const jeZeile = {};
    frei.forEach((c) => { (jeZeile[c.z] = jeZeile[c.z] || []).push(c.text); benutzt.add(c.z + ":" + c.s); });
    const zeilen = Object.keys(jeZeile).sort((a, b) => a - b).map((z) => jeZeile[z].join(" "));
    const bem = ohneFa(zeilen.join("\n"));
    if (bem) kopf.bemerkung = bem;
  }

  if (!Object.keys(plaetze).length) {
    // Bei Index liegen auch Kalkulationen im Ordner der Einrichtblätter
    hinweise.push(liste.some((c) => /kalkulation/i.test(c.text))
      ? "Das ist eine Kalkulation, kein Einrichtblatt" : "Keine Werkzeugplätze (T100 …) gefunden");
  }
  return { hoco, autom, kopf, stamm, typDaten, plaetze, hinweise };
}

// Die FA Nr. gehört nicht ins Einrichtblatt: es gilt für die HOCO Nr.,
// nicht für einen Fabrikauftrag (Patrick 25. Oktober 2026: „FA kann
// immer weg, das Dokument ist nicht an den FA gebunden“)
export function ohneFa(text) {
  return String(text || "").split("\n").filter((z) => !/^\s*(fabrik|fa[\s.\-]*nr)/i.test(z)).join("\n").trim();
}

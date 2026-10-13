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
// =================================================================
import JSZip from "jszip";

const PLATZ = /^T\d{3,4}$/;
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

// Bezeichnungen im Kopf, ohne Leerzeichen, Punkte und Striche
const schluessel = (t) => String(t || "").toLowerCase().replace(/[\s.\-_:/]+/g, "");
const KOPF = [
  [/^programmpath(\d+)/, "programm"],
  [/^geometrie/, "geometrie"],
  [/^ho&?co(nr)?/, "hoco"],
  [/^artikelbez/, "bezeichnung"],
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
  for (const k of koepfe) {
    benutzt.add(k.z + ":" + k.s);
    const darunter = koepfe.filter((x) => x.s === k.s && x.z > k.z).map((x) => x.z);
    const ende = darunter.length ? Math.min(...darunter) : Math.min(maxZeile + 1, k.z + 8);
    const text = (z) => {
      if (z >= ende) return "";
      const a = bei(z, k.s), b = bei(z, k.s + 1);
      for (const x of [a, b]) if (x) benutzt.add(x.z + ":" + x.s);
      return [a, b].filter(Boolean).map((x) => x.text).join(" ").trim();
    };
    const p = {};
    const zahl = text(k.z + 1);
    if (zahl) { const n = zahlDarin(zahl); if (n !== null) p.standzeit = n; else p.taetigkeit_vor = zahl; }
    const taet = text(k.z + 2), mass = text(k.z + 3);
    if (taet) p.taetigkeit = taet;
    if (mass) p.mass = mass;
    const rest = [];
    for (let z = k.z + 4; z < ende; z++) { const t = text(z); if (t) rest.push(t); }
    if (rest.length) p.werkzeug = rest[rest.length - 1];
    if (rest.length > 1) p.hersteller = rest[rest.length - 2];
    if (rest.length > 2) hinweise.push(k.text + ": mehr Zeilen als erwartet, „" + rest.slice(0, -2).join(" / ") + "“ fehlt");
    if (p.taetigkeit_vor) { hinweise.push(k.text + ": „" + p.taetigkeit_vor + "“ unter dem Platz ist keine Standzeit"); delete p.taetigkeit_vor; }
    p.hd = felder.some((f) => /^HD$/i.test(f.text) && f.z >= k.z - 1 && f.z <= k.z && f.s >= k.s && f.s <= k.s + 1);
    p._ende = ende;
    p._s = k.s; p._z = k.z;
    if (plaetze[k.text]) hinweise.push(k.text + " steht zweimal im Blatt, der erste zählt");
    else plaetze[k.text] = p;
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
  const kopf = { programme: {}, geometrie: null, maschine_nr: null, bemerkung: null };
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
    kopfZeilen.push(c.z);
    const wert = werte.join(" ").trim();
    const art = treffer[1];
    if (art === "programm") { if (wert) kopf.programme[treffer[0].exec(k)[1]] = wert; }
    else if (art === "geometrie") kopf.geometrie = wert || null;
    else if (art === "hoco") hoco = wert || null;
    else if (art === "autom") {
      autom = werte[0] || null;
      const nr = werte.slice(1).join(" ").trim() || (/\bnr\.?\s*\S+/i.exec(wert) || [])[0];
      kopf.maschine_nr = nr || null;
    } else if (art === "stueckzeit") { const n = zahlDarin(wert); if (n) typDaten.stueckzeit_s = n; }
    else if (art === "abend") { const n = zahlDarin(wert); if (n) typDaten.abend_stk = Math.round(n); }
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
    if (zeilen.length) kopf.bemerkung = zeilen.join("\n");
  }

  if (!Object.keys(plaetze).length) hinweise.push("Keine Werkzeugplätze (T100 …) gefunden");
  return { hoco, autom, kopf, stamm, typDaten, plaetze, hinweise };
}

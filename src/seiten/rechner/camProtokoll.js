// HOFERCAM: Werkzeuge aus dem Werkzeugprotokoll (seit 1.688.0)
//
// Wunsch Patrick 21. November 2026: „mach mir eine Option, um
// Werkzeugprotokolle einzulesen, um die Werkzeuge für die Simulation zu
// erzeugen“. Das Werkzeugprotokoll ist das Excel-Einrichtblatt (etwa
// „10844-0049_Werkzeugprotokoll.xlsx“ der SW-20) oder das Einrichtblatt in
// der App. Gelesen wird es mit demselben Leser wie beim Einrichtblatt
// (excelEinlesen.js): je Platz Tätigkeit, Mass, Lieferant und Artikel-Nr.
// Daraus schlägt die App je Bearbeitung mit derselben T-Nr. ein Werkzeug
// vor (b.wz wie im Fenster 🔧 Werkzeug). Es ist ein Vorschlag: Platten aus
// dem ISO-Code (DCMT 11T304 = D 55°, R0.4), Einstechplatten aus B = …,
// Bohrer aus dem Ø; Schneidenlage aussen unten, innen und an festen
// Frontwerkzeugen oben, wie Patrick es für 10844-0049_2 gesetzt hat.
// Fehlt etwas, nimmt die App übliche Werte (aussen R0.4, innen R0.1).

import { wzArten, plattenForm } from "./camWerkzeug.js";

const zahl = (t) => Number(String(t).replace(",", "."));
const rund = (x) => String(Math.round(x * 1000) / 1000);

// Platz eines Bearbeitungsblocks als T-Nr. („400“ → „T400“)
export const blockTnr = (b) => {
  const p = String((b && b.platz) || "").trim().toUpperCase().replace(/^T/, "");
  return /^\d+$/.test(p) ? "T" + Number(p) : "";
};

// Plätze aus dem Blatt (Excel oder App): { T400: {taetigkeit, mass, hersteller, werkzeug, bezeichnung} }
export function protokollPlaetze(plaetze) {
  const raus = {};
  for (const [nr, p] of Object.entries(plaetze || {})) {
    if (!p) continue;
    const t = String(p.tnr || nr).trim().toUpperCase();
    if (!/^T\d+$/.test(t)) continue;
    const e = { taetigkeit: p.taetigkeit || "", mass: p.mass || "", hersteller: p.hersteller || "", werkzeug: p.werkzeug || "", bezeichnung: p.bezeichnung || "" };
    if (!Object.values(e).some((x) => String(x).trim())) continue;
    if (p.article_id) e.article_id = p.article_id;
    raus["T" + Number(t.slice(1))] = e;
  }
  return raus;
}

export const protokollText = (p) => [p.taetigkeit, p.mass, [p.hersteller, p.werkzeug].filter(Boolean).join(" "), p.bezeichnung]
  .map((x) => String(x || "").trim()).filter(Boolean).join(" · ");

const BOHR_RE = /bohr|zentr|kernloch|gew(inde)?\.?\s*form|reib|senk|anbohr|pilot/i;
const FRAES_RE = /fräs|fraes|nut\b|schlitz|tauch/i;
const DREH_RE = /dreh|plan|schrupp|schlicht|stech|abstech|innen|aussen|ausdreh|gewinde(?!\s*form)|kopier|vorstech/i;
// „Vorstechen“ ist aussen (vor dem Abstechen), seit 1.757.2 nicht mehr innen
const INNEN_RE = /innen|ausdreh|bohrstange|bohrung\s*dreh/i;

// ISO-Code einer Wendeplatte: DCMT11T304, DCGT 11T301, VCGX 120302 …
function isoPlatte(t) {
  const m = /\b([CDVWTRSKX])[A-Z]{3}\s*([\dT]{2})\s*([\dT]{1,2})\s*(\d{2})\b/.exec(t);
  if (!m) return null;
  const buch = { X: "C", S: "C", K: "D" }[m[1]] || m[1];
  return { form: buch, r: zahl(m[4]) / 10 };
}

// Durchmesser im Text: „Ø 3.50“, „D4.5“, sonst „M1.6“
function durchmesser(...texte) {
  for (const t of texte) {
    const m = /(?:Ø|ø|⌀|\bD)\s*(\d+(?:[.,]\d+)?)/.exec(String(t || ""));
    if (m) return zahl(m[1]);
  }
  for (const t of texte) {
    const m = /\bM\s*(\d+(?:[.,]\d+)?)/.exec(String(t || ""));
    if (m) return zahl(m[1]);
  }
  return null;
}

// Vorschlag für ein Werkzeug; null, wenn nichts dazu passt
export function wzVorschlag(p, b) {
  const arten = wzArten(b.art);
  const aufgabe = [p.taetigkeit, p.mass].join(" ");
  const wzTxt = [p.hersteller, p.werkzeug, p.bezeichnung].join(" ");
  const alles = aufgabe + " " + wzTxt;
  const platte = isoPlatte(wzTxt) || isoPlatte(alles);
  const einstech = /stech|einstich/i.test(aufgabe) || /\bB\s*=\s*\d/i.test(wzTxt) || /\b(DGN|GFN|DGR|GIP)\s*\d{4}/i.test(wzTxt);
  let art;
  if (arten.length === 1) art = arten[0];
  else if (BOHR_RE.test(aufgabe) || (FRAES_RE.test(aufgabe) && !DREH_RE.test(aufgabe))) art = arten.includes("fraes") ? "fraes" : arten[0];
  else if (platte || einstech || DREH_RE.test(aufgabe)) art = arten.includes("dreh") ? "dreh" : arten[0];
  else if (durchmesser(aufgabe, wzTxt) !== null && arten.includes("fraes")) art = "fraes";
  else return null;

  if (art === "fraes") {
    // Beim Zentrieren gilt der Ø des Werkzeugs (HM Ø2.50), nicht das Gewinde (M1.60)
    const zentr = /zentr|anbohr/i.test(aufgabe);
    const d = zentr ? durchmesser(wzTxt, aufgabe) : durchmesser(p.mass, p.taetigkeit, wzTxt);
    if (!d || !(d > 0)) return null;
    let form = "bohrer";
    if (FRAES_RE.test(aufgabe) && !BOHR_RE.test(aufgabe)) form = /kugel/i.test(alles) ? "kugel" : /scheibe|t-?nut/i.test(alles) ? "scheibe" : "schaft";
    if (/fase|senk/i.test(aufgabe) && !/bohr/i.test(aufgabe)) form = "fase";
    const wz = { art: "fraes", form, d: rund(d) };
    if (form === "bohrer" || form === "fase") wz.winkel = zentr || form === "fase" ? "90" : /pilot|hss/i.test(alles) ? "118" : "140";
    if (form === "scheibe") { wz.breite = "1"; wz.hals = rund(d * 0.5); wz.laenge = "5"; }
    else wz.laenge = String(zentr ? Math.max(5, Math.round(d * 2.4)) : Math.max(5, Math.round(d * 4)));
    return wz;
  }

  // Drehwerkzeug
  const innen = INNEN_RE.test(aufgabe) || (/^(front|k3d|k3ff|k2b)$/.test(b.art) && !/aussen/i.test(aufgabe));
  const sl = innen ? "or" : "ur";
  const rText = /\bR\s*(\d+(?:[.,]\d+)?)/.exec(wzTxt);
  if (einstech) {
    const bm = /\bB\s*=?\s*(\d+(?:[.,]\d+)?)/i.exec(wzTxt) || /\b(?:DGN|GFN|DGR|GIP)\s*(\d{2})\d{2}/i.exec(wzTxt);
    let breite = bm ? zahl(bm[1]) : null;
    if (bm && /\b(?:DGN|GFN|DGR|GIP)/i.test(bm[0]) && !/[.,]/.test(bm[1])) breite = zahl(bm[1]) / 10;
    return { art: "dreh", form: "E", breite: rund(breite || 2), r: rText ? rund(zahl(rText[1])) : "0.05", sl };
  }
  if (/\b\d{2}\s*[EIA]R\b|\bgewinde/i.test(alles) && !platte) return { art: "dreh", form: "G", r: "0.05", sl };
  const form = platte && plattenForm(platte.form) ? platte.form : "D";
  const r = rText ? zahl(rText[1]) : platte ? platte.r : innen ? 0.1 : 0.4;
  if (form === "R") return { art: "dreh", form: "R", r: rund(r || 1) };
  return { art: "dreh", form, r: rund(r), sl };
}

// Je Bearbeitung: { b, tnr, p, wz } (wz null = nichts Passendes)
export function protokollZuordnen(bloecke, plaetze) {
  const pl = protokollPlaetze(plaetze);
  return (bloecke || []).map((b) => {
    const tnr = blockTnr(b);
    const p = pl[tnr] || null;
    return { b, tnr, p, wz: p ? wzVorschlag(p, b) : null };
  });
}

// Einrichtblatt in der App zur HOCO Nr.; beim Typ den passenden zuerst
export async function protokollAusApp(db, hoco, typ) {
  const r = await db.from("einrichtblatt_app").select("hoco_nr, type_id, plaetze").eq("hoco_nr", hoco);
  if (r.error) throw new Error(r.error.message);
  const zeilen = (r.data || []).filter((z) => z.plaetze && Object.keys(z.plaetze).length);
  if (!zeilen.length) return null;
  let namen = {};
  try {
    const t = await db.from("machine_types").select("id, name").in("id", zeilen.map((z) => z.type_id));
    (t.data || []).forEach((x) => { namen[x.id] = x.name || ""; });
  } catch (f) { namen = {}; }
  const muster = typ === "star-sw20" ? /sw\s*-?\s*20/i : /20\s*rg/i;
  zeilen.sort((a, b) => (muster.test(namen[b.type_id] || "") ? 1 : 0) - (muster.test(namen[a.type_id] || "") ? 1 : 0));
  return { plaetze: zeilen[0].plaetze, typName: namen[zeilen[0].type_id] || "" };
}

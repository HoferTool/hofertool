// =================================================================
//  MATERIAL-ÜBERSICHT
//  Wo liegt welches Material, und reicht es für die Aufträge?
//  (Wunsch Patrick 15. Oktober 2026: „habe Material überall und null
//  Übersicht“.)
//
//  Ein Posten ist ein Stück Material mit drei Angaben: was (dieselbe
//  Bezeichnung wie beim Auftrag), wie viel (ungefähr, kg oder Stangen)
//  und wo. Posten liegen in der Tabelle material_posten
//  (sql/material-uebersicht.sql).
//
//  Was die App von selbst weiss, schreibt niemand ein:
//   - Bestellungen: jede Bestellnummer („Mat BE: Notz 2026008261 680kg
//     24.10.26“) in Menge oder Notiz eines offenen Auftrags ist ein
//     Posten „bestellt“. Drückt jemand „Ist da“, wird daraus ein echter
//     Posten mit derselben Nummer, und der aus der Notiz verschwindet.
//   - An der Maschine: was auf Rüsten oder läuft steht, hat sein
//     Material dort.
//
//  Gleich ist Material, wenn Werkstoff, Form, Masse und Toleranz
//  stimmen. Nur die Toleranz anders (h8 statt h9) heisst „ähnlich“:
//  wird angezeigt, aber nicht gezählt (Wunsch Patrick: „Toleranz soll
//  stehen, kann aber manchmal nicht beachtet werden“).
//
//  Mindestmenge (nur als Hilfe, ohne Einrichten und Ausschuss): Stück
//  je Stange = (Stangenlänge − Rest-Stumpen) / Länge des Fertigteils,
//  beides beim Maschinentyp (3000 und 250 mm); Gewicht je Stange aus
//  dem Querschnitt in der Bezeichnung und der Dichte des Werkstoffs.
//  Die Länge kommt aus dem Einrichtblatt („Getriebedeckel 17 x 7.00“)
//  und gilt erst als sicher, wenn jemand sie bestätigt hat.
// =================================================================
import { alt } from "../bruecke.jsx";
import { alleBestellungenLesen } from "./materialBestellung.js";

export const ORTE_STANDARD = ["Restelager", "Aussenlager Nord", "Aussenlager Nord-Nord", "Halle",
  "Bei Zurbrügg", "Beim Lieferanten"];
const STANGE_MM = 3000, STUMPEN_MM = 250, PLANIEREN_MM = 0.5;
// Ab hier arbeitet die Firma mit der Übersicht (Wunsch Patrick
// 15. Oktober 2026: „alles was morgen kommen soll, nicht als ist da,
// alles andere schon“). Bestellungen aus den Aufträgen mit Termin vor
// diesem Tag, oder ohne Termin in einem Auftrag von vorher, gelten als
// geliefert. Was später kommt, bestätigt man mit „Ist da“.
export const STICHTAG = "2026-10-16";

// g/cm³ je Werkstoffgruppe aus werkstoffErkennen
const DICHTE = { stahl: 7.85, v2a: 7.9, v4a: 8.0, chrom: 7.7, alu: 2.7, messing: 8.5,
  messing_ohne_pb: 8.4, neusilber: 8.6, titan: 4.5, kunststoff: 1.41 };

const zahl = (t) => { const n = Number(String(t).replace(",", ".")); return isFinite(n) ? n : null; };

// „X14CrMoS17 rd 024 mm h9“ → Werkstoff, Form, Masse, Toleranz und die
// Schlüssel zum Vergleichen. Was sich nicht lesen lässt, vergleicht als
// ganzer Text (ohne Gross/klein und Leerzeichen).
export function materialZerlegen(bez) {
  const roh = String(bez || "").replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim();
  if (!roh) return null;
  const klein = roh.toLowerCase();
  const tolM = klein.match(/\b([hgfk]\d{1,2})\b/);
  const tol = tolM ? tolM[1] : "";
  let form = "rd", d = null, innen = null;
  const formM = klein.match(/\b(rd|rund|rohr|6kt|sechskant|4kt|vierkant|vk|sk|fl|flach)\b\.?\s*ø?\s*(\d+(?:[.,]\d+)?)(?:\s*[\/x×]\s*(\d+(?:[.,]\d+)?))?/);
  if (formM) {
    form = { rund: "rd", rohr: "rohr", sechskant: "6kt", vierkant: "4kt", vk: "4kt", sk: "6kt", flach: "fl" }[formM[1]] || formM[1];
    d = zahl(formM[2]);
    innen = formM[3] ? zahl(formM[3]) : null;
  } else {
    // „X5CrNiCuNb16-4 012 mm h8“, „1.4301 Rohr Ø4mm“: Zahl vor mm
    const mm = klein.match(/ø?\s*(\d+(?:[.,]\d+)?)\s*mm\b/);
    if (mm) d = zahl(mm[1]);
  }
  // Werkstoff: alles vor der Form oder dem ersten Mass
  const schnitt = klein.search(/\b(rd|rund|rohr|6kt|sechskant|4kt|vierkant|vk|sk|fl|flach)\b|ø|\b\d+(?:[.,]\d+)?\s*mm\b/);
  const werkstoff = (schnitt > 0 ? klein.slice(0, schnitt) : klein.split(" ")[0]).replace(/[\s()]+/g, "");
  const masse = d ? form + d + (innen ? "/" + innen : "") : "";
  const grund = masse ? werkstoff + "|" + masse : klein.replace(/[\s|]+/g, "");
  return { roh, werkstoff, form, d, innen, tol, grund, schluessel: grund + "|" + tol };
}

// Genaue Dichte je Werkstoff (Wunsch Patrick 16. Oktober 2026: „von
// X8CrNiS18-9 zur Nummer selber checken“): Kurzname oder Nummer in der
// Bezeichnung → Werkstoffnummer und Dichte in g/cm³ (Werte aus den
// Normblättern, z.B. EN 10088-1). Nur wenn nichts passt, gilt die
// Dichte der Gruppe aus DICHTE.
const WERKSTOFFE = [
  // Rostfrei ohne Molybdän
  ["1.4301", 7.9, "x5crni18-10"], ["1.4303", 7.9, "x4crni18-12"], ["1.4305", 7.9, "x8crnis18-9", "x10crnis18-9"],
  ["1.4306", 7.9, "x2crni19-11"], ["1.4307", 7.9, "x2crni18-9"], ["1.4310", 7.9, "x10crni18-8"],
  ["1.4311", 7.9, "x2crnin18-10"], ["1.4541", 7.9, "x6crniti18-10"], ["1.4550", 7.9, "x6crninb18-10"],
  ["1.4567", 7.9, "x3crnicu18-9-4"], ["1.4568", 7.8, "x7crnial17-7"],
  // Rostfrei mit Molybdän
  ["1.4401", 8.0, "x5crnimo17-12-2"], ["1.4404", 8.0, "x2crnimo17-12-2"], ["1.4432", 8.0, "x2crnimo17-12-3"],
  ["1.4435", 8.0, "x2crnimo18-14-3"], ["1.4436", 8.0, "x3crnimo17-13-3"], ["1.4439", 8.0, "x2crnimon17-13-5"],
  ["1.4571", 8.0, "x6crnimoti17-12-2"], ["1.4580", 8.0, "x6crnimonb17-12-2"], ["1.4539", 8.0, "x1nicrmocu25-20-5"],
  ["1.4547", 8.0, "x1crnimocun20-18-7"], ["1.4578", 7.9, "x3crnicumo17-11-3-2"], ["1.4462", 7.8, "x2crnimon22-5-3"],
  // Chromstahl und härtbare
  ["1.4005", 7.7, "x12crs13"], ["1.4016", 7.7, "x6cr17"], ["1.4021", 7.7, "x20cr13"], ["1.4028", 7.7, "x30cr13"],
  ["1.4034", 7.7, "x46cr13"], ["1.4057", 7.7, "x17crni16-2"], ["1.4104", 7.7, "x14crmos17"], ["1.4105", 7.7, "x6crmos17"],
  ["1.4112", 7.7, "x90crmov18"], ["1.4122", 7.7, "x39crmo17-1"], ["1.4125", 7.7, "x105crmo17"], ["1.4313", 7.7, "x3crnimo13-4"],
  ["1.4418", 7.7, "x4crnimo16-5-1"], ["1.4512", 7.7, "x2crti12"], ["1.4542", 7.8, "x5crnicunb16-4"],
  // Automatenstahl
  ["1.0715", 7.85, "11smn30"], ["1.0718", 7.85, "11smnpb30"], ["1.0736", 7.85, "11smn37"], ["1.0737", 7.85, "11smnpb37"],
  // Messing und Neusilber
  ["CW614N", 8.47, "cuzn39pb3"], ["CW617N", 8.43, "cuzn40pb2"], ["CW603N", 8.5, "cuzn36pb3"], ["CW724R", 8.3, "cuzn21si3p"],
  ["CW400J", 8.5, "cuni7zn39pb3mn2"], ["CW408J", 8.7, "cuni18zn19pb1"], ["CW409J", 8.7, "cuni18zn20"], ["CW403J", 8.7, "cuni12zn24"],
  // Aluminium
  ["EN AW-6082", 2.70, "aw-6082", "aw6082", "almgsi1"], ["EN AW-6061", 2.70, "aw-6061", "aw6061"],
  ["EN AW-6026", 2.72, "aw-6026", "aw6026"], ["EN AW-6012", 2.75, "aw-6012", "aw6012", "almgsipb"],
  ["EN AW-2007", 2.85, "aw-2007", "aw2007", "alcu4pbmgmn"], ["EN AW-2011", 2.84, "aw-2011", "aw2011", "alcu6bipb"],
  ["EN AW-7075", 2.81, "aw-7075", "aw7075", "alzn5,5mgcu"], ["EN AW-5083", 2.66, "aw-5083", "aw5083", "almg4,5mn"],
  // Titan
  ["3.7035", 4.51, "grade2", "grade 2"], ["3.7165", 4.43, "grade5", "grade 5", "tial6v4"],
  // Kunststoff
  ["PEEK", 1.31, "peek"], ["POM", 1.41, "pom", "pom-c"], ["PTFE", 2.17, "ptfe"], ["PA6", 1.14, "pa6"],
  ["PVDF", 1.78, "pvdf"], ["PE-HD", 0.95, "pe-hd", "pehd"], ["PP", 0.91, "pp"], ["PET", 1.38, "pet"], ["PVC", 1.40, "pvc"],
];
const NUR_BUCHSTABEN = /^[a-z-]+$/;
// → { nr, dichte } oder null
export function werkstoffGenau(bez) {
  const t = " " + String(bez || "").toLowerCase().replace(/[()|;\/]/g, " ").replace(/\s+/g, " ") + " ";
  const kompakt = t.replace(/\s+/g, "");
  for (const [nr, dichte, ...namen] of WERKSTOFFE) {
    for (const n of [nr.toLowerCase(), ...namen]) {
      // Kurze Wörter (pp, pet) nur als ganzes Wort, sonst auch ohne Leerzeichen
      const ganz = NUR_BUCHSTABEN.test(n.replace(/\d/g, "")) && n.length <= 5;
      const treffer = ganz || /^\d\.\d{4}$/.test(n)
        ? new RegExp("[\\s]" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=[\\s,]|$)").test(t)
        : kompakt.includes(n.replace(/\s+/g, ""));
      if (treffer) return { nr, dichte };
    }
  }
  return null;
}

// Kilo je Meter Stange, oder null, wenn Mass oder Dichte fehlt
export function kgJeMeter(bez) {
  const z = materialZerlegen(bez);
  if (!z || !z.d) return null;
  const genau = werkstoffGenau(bez);
  const w = genau ? null : alt.werkstoffErkennen ? alt.werkstoffErkennen(bez) : null;
  const dichte = genau ? genau.dichte : w && DICHTE[w.key];
  if (!dichte) return null;
  let flaeche;
  if (z.form === "rohr" && z.innen && z.innen < z.d) flaeche = Math.PI / 4 * (z.d * z.d - z.innen * z.innen);
  else if (z.form === "6kt") flaeche = Math.sqrt(3) / 2 * z.d * z.d;
  else if (z.form === "4kt") flaeche = z.d * z.d;
  else if (z.form === "fl" && z.innen) flaeche = z.d * z.innen;
  else flaeche = Math.PI / 4 * z.d * z.d;
  return flaeche * dichte / 1000;
}

// Menge eines Postens in kg (Stangen über das Gewicht je Stange)
export function postenKg(p, stangeMm) {
  if (p.menge === null || p.menge === undefined || p.menge === "") return null;
  const n = Number(p.menge);
  if (!isFinite(n)) return null;
  if (p.einheit !== "stg") return n;
  const kgm = kgJeMeter(p.material);
  return kgm ? n * kgm * (stangeMm || STANGE_MM) / 1000 : null;
}

export function mengeText(menge, einheit) {
  if (menge === null || menge === undefined || menge === "") return "Menge?";
  const n = Math.round(Number(menge) * 10) / 10;
  return (alt.zahlText ? alt.zahlText(n) : String(n)) + (einheit === "stg" ? (n === 1 ? " Stange" : " Stangen") : " kg");
}
// Stangen ↔ kg für ein Material, über Dichte und Querschnitt
// (kgJeMeter) und eine Stange von 3 m; null, wenn Werkstoff oder Mass
// nicht erkannt sind
export function kgJeStange(material) {
  const kgm = kgJeMeter(material);
  return kgm ? kgm * STANGE_MM / 1000 : null;
}
const eineStelle = (n) => (alt.zahlText ? alt.zahlText(Math.round(n * 10) / 10) : String(Math.round(n * 10) / 10));
// Restmaterial immer in kg (Wunsch Patrick 16. Oktober 2026); in
// Stangen Erfasstes zusätzlich klein mit der Zahl der Stangen
export function postenMengeText(p) {
  if (!p || p.menge === null || p.menge === undefined || p.menge === "") return "Menge?";
  const kg = postenKg(p);
  if (kg === null) return mengeText(p.menge, p.einheit);
  return eineStelle(kg) + " kg" + (p.einheit === "stg" ? " (" + mengeText(p.menge, "stg") + ")" : "");
}
export const kgText = (kg) => kg === null || kg === undefined ? "" : "ca. " + (alt.zahlText ? alt.zahlText(Math.round(kg)) : Math.round(kg)) + " kg";

// „500 kg“, „10 Stg.“ aus der Notiz → { menge, einheit }
function mengeLesen(t) {
  const m = String(t || "").match(/([\d']+(?:[.,]\d+)?)\s*(kg|stg)/i);
  if (!m) return { menge: null, einheit: "kg" };
  return { menge: zahl(m[1].replace(/'/g, "")), einheit: m[2].toLowerCase() === "stg" ? "stg" : "kg" };
}
// „24.09.26“ oder „KW41“ → Datum (ISO), sonst null
function terminDatum(t, jahrDerBestellung) {
  const s = String(t || "");
  const d = s.match(/^(\d{2})\.(\d{2})(?:\.(\d{2}))?$/);
  if (d) return "20" + (d[3] || String(jahrDerBestellung || new Date().getFullYear()).slice(2)) + "-" + d[2] + "-" + d[1];
  const kw = s.match(/^KW(\d{2})$/);
  if (kw) {
    // Freitag dieser Woche im Jahr der Bestellung
    const jahr = Number(jahrDerBestellung) || new Date().getFullYear();
    const j4 = new Date(Date.UTC(jahr, 0, 4));
    const mo = new Date(j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 86400000 + (Number(kw[1]) - 1) * 7 * 86400000);
    return new Date(mo.getTime() + 4 * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

const OFFEN = new Set(["geplant", "ruesten", "laeuft"]);
const AN_MASCHINE = new Set(["ruesten", "laeuft"]);
export const istOffen = (j) => !j.ended_at && OFFEN.has(j.plan_status || "geplant");

// ---------- Laden ----------

let stand = null;          // zuletzt geladen, für die Planwand
let fehlt = false;         // Tabelle noch nicht da: still nichts zeigen

export async function postenLaden(mitWeg) {
  let a = alt.db.from("material_posten").select("*").order("erstellt_am", { ascending: false });
  if (!mitWeg) a = a.is("weg_am", null);
  const r = await alt.zeitlimit(a, 10000, "Material");
  if (r.error) {
    // Ohne sql/material-uebersicht.sql gibt es die Tabelle nicht
    if (/material_posten|does not exist|schema cache/i.test(r.error.message || "")) { fehlt = true; return null; }
    throw r.error;
  }
  fehlt = false;
  return r.data || [];
}

// Länge und Durchmesser der Fertigteile für die gegebenen HOCO Nummern
export async function teileLaden(nummern) {
  const liste = [...new Set(nummern.filter(Boolean))];
  const raus = {};
  for (let i = 0; i < liste.length; i += 200) {
    const r = await alt.zeitlimit(alt.db.from("hoco_parts")
      .select("hoco_nr, teil_d_mm, teil_laenge_mm, teil_mass_bestaetigt, teil_mass_quelle")
      .in("hoco_nr", liste.slice(i, i + 200)), 10000, "HOCO Nummern");
    if (r.error) return raus;    // Spalten noch nicht da: ohne Längen
    (r.data || []).forEach((t) => { raus[t.hoco_nr] = t; });
  }
  return raus;
}

export async function orteLaden() {
  try {
    const r = await alt.db.from("app_config").select("wert").eq("schluessel", "material_orte").maybeSingle();
    const liste = r && r.data && r.data.wert ? JSON.parse(r.data.wert) : null;
    return Array.isArray(liste) && liste.length ? liste : ORTE_STANDARD;
  } catch (f) { return ORTE_STANDARD; }
}
export async function orteSpeichern(liste) {
  const { error } = await alt.db.from("app_config").upsert(
    [{ schluessel: "material_orte", wert: JSON.stringify(liste) }], { onConflict: "schluessel" });
  if (error) throw error;
}

// Alles, was die Rechnung braucht, in einem Zug
export async function materialDatenLaden(auftraege) {
  const offene = (auftraege || []).filter(istOffen);
  const [posten, teile, maschinen, typen] = await Promise.all([
    postenLaden(),
    teileLaden(offene.map((j) => j.job_number)),
    alt.ladeAlleMaschinen().catch(() => []),
    alt.ladeTypen().catch(() => []),
  ]);
  if (posten === null) return null;
  const typVon = {};
  typen.forEach((t) => { typVon[t.id] = t; });
  const maschineVon = {};
  maschinen.forEach((m) => { maschineVon[m.id] = { ...m, typ: typVon[m.type_id] || null }; });
  return { posten, teile, maschineVon };
}

// Für die Planwand: lädt still mit, merkt sich das Ergebnis. Ohne
// Tabelle oder bei Externen: null, dann zeigt die Wand nichts Neues.
export async function materialFuerPlanwand(auftraege) {
  if (fehlt || (alt.istExtern && alt.istExtern()) || (alt.istArchiv && alt.istArchiv())) { stand = null; return null; }
  try {
    const d = await materialDatenLaden(auftraege);
    // Die Daten bleiben dabei, für die Zeile „Mat. info.“ (matInfo)
    stand = d ? { ...materialRechnen(auftraege, d), daten: d } : null;
    // Fehlende Längen still nachholen, gezählt wird beim nächsten Laden
    if (d) setTimeout(() => laengenNachholen(d.teile), 5000);
  } catch (f) {
    console.warn("Material:", f.message);
  }
  return stand;
}
export const materialStand = () => stand;

// ---------- Längen selbst nachholen ----------
// (Wunsch Patrick 15. Oktober 2026: „soll überall versuchen, wir
// bestätigen ja immer wieder, irgendwann ist alles bestätigt“) Fehlt
// bei einer HOCO Nr. die Länge, liest die App sie still aus dem
// Einrichtblatt, legt sie unbestätigt ab und merkt sich sonst den Grund.
// Jede Nummer wird so nur einmal gelesen (je Fassung des Lesens, damit
// ein besseres Lesen es nochmals versucht). Bestätigt wird beim Beenden.
const LESEN_FASSUNG = "L2";
const versucht = new Set();

export function laengeFehlt(t) {
  if (!t || t.teil_laenge_mm) return false;
  return !String(t.teil_mass_quelle || "").startsWith("Nicht gefunden (" + LESEN_FASSUNG + ")");
}

// Liest die Länge einer HOCO Nr.; das Blatt vom Typ typId zuerst.
// → { mm, sicher: false, text } oder null
export async function laengeVersuchen(nr, typId) {
  if (!nr || versucht.has(nr)) return null;
  versucht.add(nr);
  const r = await alt.db.from("hoco_type_data").select("hoco_nr, type_id, blatt_url").eq("hoco_nr", nr);
  if (r.error) return null;
  const blaetter = (r.data || []).filter((b) => b.blatt_url)
    .sort((a, b) => (b.type_id === typId) - (a.type_id === typId));
  let grund = blaetter.length ? "" : "kein Einrichtblatt vorhanden";
  for (const b of blaetter) {
    let m = null;
    try { m = await massAusEinrichtblatt(b.blatt_url); } catch (f) { m = { grund: "Excel nicht lesbar" }; }
    // Nicht erreichbar heisst meist: kein Netz. Dann später nochmals.
    if (m && m.grund === "Einrichtblatt nicht erreichbar") { versucht.delete(nr); return null; }
    if (m && m.laenge) {
      // Nie eine schon eingetragene Länge überschreiben
      await alt.db.from("hoco_parts").update({ teil_d_mm: m.d, teil_laenge_mm: m.laenge,
        teil_mass_bestaetigt: false, teil_mass_quelle: "Einrichtblatt: " + m.text.slice(0, 120) })
        .eq("hoco_nr", nr).is("teil_laenge_mm", null);
      return { mm: m.laenge, sicher: false, text: m.text };
    }
    if (m && !grund) grund = m.grund + (m.text ? ": " + m.text : "");
  }
  await alt.db.from("hoco_parts").update({ teil_mass_quelle:
    ("Nicht gefunden (" + LESEN_FASSUNG + "): " + (grund || "keine Länge im Blatt")).slice(0, 160) })
    .eq("hoco_nr", nr).is("teil_laenge_mm", null);
  return null;
}

// Im Hintergrund für alle offenen Nummern ohne Länge, zwei gleichzeitig.
// fertig(n) kommt am Schluss mit der Zahl der gefundenen Längen.
export async function laengenNachholen(teile, fertig) {
  if (!alt.darfSchreiben || !alt.darfSchreiben() || (alt.istExtern && alt.istExtern())
    || (alt.istArchiv && alt.istArchiv())) return;
  const warte = Object.keys(teile || {}).filter((nr) => laengeFehlt(teile[nr]) && !versucht.has(nr));
  if (!warte.length) return;
  let gefunden = 0;
  await Promise.all([1, 2].map(async () => {
    while (warte.length) {
      const nr = warte.shift();
      try { if (await laengeVersuchen(nr, null)) gefunden++; } catch (f) { /* nächste */ }
    }
  }));
  if (fertig) fertig(gefunden);
}

// ---------- Wann ein Auftrag wirklich drankommt ----------
// Auf der Planwand steht der laufende Auftrag nicht immer genau beim
// Heute-Strich: manche Maschinen sind weiter, manche hinten nach
// (Hinweis Patrick 15. Oktober 2026: „bedenke das“). Darum schätzt die
// App je Maschine aus dem Fortschritt des laufenden Auftrags, wann er
// fertig ist, und schiebt alle folgenden Aufträge derselben Maschine
// um denselben Abstand. Ohne laufenden Auftrag: Was in der Vergangenheit
// geplant und noch nicht angefangen ist, rückt auf heute.
// Das Tempo kommt aus den gemeldeten Stückzahlen. Gerechnet in
// Arbeitstagen (Mo–Fr); bleibt eine Schätzung („voraussichtlich“).

const tagMs = 86400000;
const datumAus = (iso) => { const [j, m, t] = String(iso).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(j, m - 1, t)); };
const isoAus = (d) => d.toISOString().slice(0, 10);
const istWe = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
function werktagPlus(iso, n) {
  let d = datumAus(iso);
  while (istWe(d)) d = new Date(d.getTime() + tagMs);
  const schritt = n < 0 ? -1 : 1;
  for (let i = 0; i < Math.abs(Math.round(n)); i++) {
    do { d = new Date(d.getTime() + schritt * tagMs); } while (istWe(d));
  }
  return isoAus(d);
}
// Arbeitstage von a nach b, negativ wenn b vor a liegt
function werktageZwischen(a, b) {
  let von = datumAus(a), bis = datumAus(b), zeichen = 1;
  if (bis < von) { [von, bis] = [bis, von]; zeichen = -1; }
  let n = 0;
  for (let d = von; d < bis; d = new Date(d.getTime() + tagMs)) if (!istWe(d)) n++;
  return zeichen * n;
}

export function startSchaetzen(auftraege, heute) {
  heute = heute || isoAus(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
  const jeMaschine = new Map();
  for (const j of auftraege) {
    if (!istOffen(j) || !j.planned_from) continue;
    const k = j.machine_id || "ohne";
    if (!jeMaschine.has(k)) jeMaschine.set(k, []);
    jeMaschine.get(k).push(j);
  }
  const raus = {};
  for (const liste of jeMaschine.values()) {
    liste.sort((a, b) => String(a.planned_from).localeCompare(String(b.planned_from)));
    const dran = liste.filter((j) => AN_MASCHINE.has(j.plan_status || "geplant"));
    let versatz = 0;
    const lauf = dran[dran.length - 1];
    if (lauf) {
      const tage = Number(lauf.planned_days) || 1;
      const ziel = Number(lauf.target_quantity) || 0;
      const stand = Number(lauf.stand) || 0;
      const anteil = ziel ? Math.min(1, stand / ziel) : 0;
      // Wie schnell es wirklich geht: Stück je Arbeitstag seit dem Start
      // (Wunsch Patrick: „die App soll selbst herausfinden, wie schnell der
      // Auftrag geht“). Erst ab einem Tag Laufzeit, sonst nach Plan.
      let restTage = tage * (1 - anteil);
      // started_at ist Pflicht und manchmal nur der Tag des Anlegens: der
      // spätere von Start und geplantem Beginn gilt
      const ab = [String(lauf.started_at || "").slice(0, 10), String(lauf.planned_from || "")].filter(Boolean).sort().pop();
      const seit = ab ? werktageZwischen(ab, heute) : 0;
      if (ziel && stand > 0 && seit >= 1) restTage = (ziel - stand) / (stand / seit);
      const geschaetztEnde = werktagPlus(heute, Math.min(250, Math.ceil(Math.max(0, restTage))));
      const geplantEnde = werktagPlus(lauf.planned_from, tage);
      versatz = werktageZwischen(geplantEnde, geschaetztEnde);
    } else {
      // Nichts dran: der erste geplante kann frühestens heute anfangen
      const erster = liste.find((j) => (j.plan_status || "geplant") === "geplant");
      if (erster && erster.planned_from < heute) versatz = werktageZwischen(erster.planned_from, heute);
    }
    for (const j of liste) {
      if (AN_MASCHINE.has(j.plan_status || "geplant")) continue;
      let start = versatz ? werktagPlus(j.planned_from, versatz) : j.planned_from;
      if (start < heute) start = heute;
      raus[j.id] = { start, versatz };
    }
  }
  return raus;
}

// ---------- Rechnen ----------

// Mindestmenge eines Auftrags in kg, mit „sicher“ = Länge bestätigt
export function bedarfRechnen(j, teil, maschine) {
  const kgm = kgJeMeter(j.material_bez);
  const laenge = teil && Number(teil.teil_laenge_mm);
  if (!kgm || !laenge || laenge <= 0) return null;
  const typ = maschine && maschine.typ;
  const stange = (typ && Number(typ.stangen_mm)) || STANGE_MM;
  const stumpen = typ && typ.stumpen_mm !== undefined && typ.stumpen_mm !== null ? Number(typ.stumpen_mm) : STUMPEN_MM;
  // Je Teil Länge + Abstecher (beim Typ) + 0,5 mm fürs Planieren beider
  // Seiten (Wunsch Patrick 15. Oktober 2026); nur für die Menge
  const abstecher = (typ && Number(typ.abstecher_mm)) || 0;
  const jeTeil = laenge + abstecher + PLANIEREN_MM;
  const jeStange = Math.floor((stange - stumpen) / jeTeil);
  if (jeStange < 1) return null;
  const stueck = Math.max(0, (Number(j.target_quantity) || 0) - (Number(j.stand) || 0));
  if (!stueck) return { kg: 0, stangen: 0, sicher: !!teil.teil_mass_bestaetigt };
  const stangen = Math.ceil(stueck / jeStange);
  return { kg: stangen * stange / 1000 * kgm, stangen, jeStange, stange, stumpen, laenge, abstecher, jeTeil,
    sicher: !!teil.teil_mass_bestaetigt };
}

// Wer braucht dieses Material sonst noch? Für die Frage „Rest
// Material?“ beim Beenden (Wunsch Patrick 15. Oktober 2026): gleichzeitig
// an einer anderen Maschine oder später geplant, nach Start sortiert.
export function nochGebraucht(j, auftraege) {
  const z = materialZerlegen(j.material_bez);
  if (!z) return [];
  const geschaetzt = startSchaetzen(auftraege || []);
  return (auftraege || [])
    .filter((x) => x.id !== j.id && istOffen(x) && (materialZerlegen(x.material_bez) || {}).schluessel === z.schluessel)
    .map((x) => ({ auftrag: x, jetzt: AN_MASCHINE.has(x.plan_status || "geplant"),
      start: (geschaetzt[x.id] || {}).start || x.planned_from || null,
      maschine: [x.maschine, x.maschine_nr].filter(Boolean).join(" ") }))
    .sort((a, b) => (b.jetzt - a.jetzt) || String(a.start || "9").localeCompare(String(b.start || "9")));
}

// Gruppen je Material mit allem, was dazu gehört, und je Auftrag eine
// Ampel: gut (da), bestellt, fehlt, unklar (nur Text im Auftrag)
export function materialRechnen(auftraege, d) {
  const gruppen = new Map();
  const gruppe = (bez) => {
    const z = materialZerlegen(bez);
    if (!z) return null;
    if (!gruppen.has(z.schluessel)) {
      gruppen.set(z.schluessel, { schluessel: z.schluessel, grund: z.grund, tol: z.tol, material: z.roh,
        lager: [], bestellt: [], maschine: [], auftraege: [] });
    }
    return gruppen.get(z.schluessel);
  };
  const echteNr = new Set(d.posten.map((p) => p.be_nr).filter(Boolean));

  for (const p of d.posten) {
    const g = gruppe(p.material);
    if (!g) continue;
    const kg = postenKg(p);
    (p.art === "bestellt" ? g.bestellt : g.lager).push({ ...p, kg });
  }

  const offene = (auftraege || []).filter((j) => istOffen(j) && j.material_bez);
  const geschaetzt = startSchaetzen(auftraege || [], d.heute);
  const nrGesehen = new Set();
  for (const j of offene) {
    const g = gruppe(j.material_bez);
    if (!g) continue;
    const st = j.plan_status || "geplant";
    const m = d.maschineVon[j.machine_id];
    if (AN_MASCHINE.has(st)) {
      g.maschine.push({ auftrag: j, maschine: m });
      continue;
    }
    // Bestellungen aus Menge und Notiz, jede Nummer einmal
    for (const b of alleBestellungenLesen([j.material_menge, j.plan_note].filter(Boolean).join("\n"))) {
      if (echteNr.has(b.nr) || nrGesehen.has(b.nr + "|" + g.schluessel)) continue;
      nrGesehen.add(b.nr + "|" + g.schluessel);
      const mg = mengeLesen(b.menge);
      const termin = terminDatum(b.termin, b.nr.slice(0, 4))
        || (j.material_liefertermin ? terminDatum(j.material_liefertermin, b.nr.slice(0, 4)) : null);
      // Bei einem Rahmenauftrag gehört jede Bestellung zum Rahmen, bis
      // keiner seiner Aufträge mehr offen ist (Wunsch Patrick 15. Oktober 2026)
      const p = { id: "be-" + b.nr, aus_notiz: true, material: j.material_bez, art: "bestellt", be_nr: b.nr,
        lieferant: b.lieferant || "", termin, menge: mg.menge, einheit: mg.einheit, job: j,
        fuer_hoco: istRahmen(j) ? j.job_number : null };
      const alt_ = termin ? termin < STICHTAG : !j.created_at || String(j.created_at).slice(0, 10) < STICHTAG;
      if (alt_) g.lager.push({ ...p, art: "lager", ort: "", angenommen: true, kg: postenKg(p) });
      else g.bestellt.push({ ...p, kg: postenKg(p) });
    }
    // Ein Rahmen gilt als unendlich (Wunsch Patrick 15. Oktober 2026):
    // keine Mengenrechnung, alles Zugewiesene gehört ihm, am Schluss
    // zählt nur der Rest beim Beenden
    const rahmen = istRahmen(j);
    const bedarf = rahmen ? null : bedarfRechnen(j, d.teile[j.job_number], m);
    const s = geschaetzt[j.id] || { start: j.planned_from, versatz: 0 };
    g.auftraege.push({ auftrag: j, maschine: m, bedarf, rahmen, teil: d.teile[j.job_number] || null,
      start: s.start, versatz: s.versatz });
  }

  // Ähnliches (nur die Toleranz anders) für den Hinweis
  const jeGrund = new Map();
  for (const g of gruppen.values()) {
    if (!jeGrund.has(g.grund)) jeGrund.set(g.grund, []);
    jeGrund.get(g.grund).push(g);
  }

  const ampelVon = {};
  for (const g of gruppen.values()) {
    // Nach dem geschätzten Start, nicht nach dem Platz auf der Planwand
    g.auftraege.sort((a, b) => String(a.start || "9").localeCompare(String(b.start || "9")));
    g.bestellt.sort((a, b) => String(a.termin || "9").localeCompare(String(b.termin || "9")));
    const kgDa = summe(g.lager), kgBestellt = summe(g.bestellt);
    g.kgDa = kgDa; g.kgBestellt = kgBestellt;
    g.kgBedarf = g.auftraege.reduce((s, a) => s + (a.bedarf ? a.bedarf.kg : 0), 0);
    g.bedarfBekannt = g.auftraege.filter((a) => a.bedarf).length;
    g.bedarfSicher = g.auftraege.every((a) => !a.bedarf || a.bedarf.sicher);
    g.aehnlich = (jeGrund.get(g.grund) || []).filter((x) => x !== g && x.lager.length);
    // Der Reihe nach verteilen: zuerst was diesem Auftrag (oder seinem
    // Rahmen) zugewiesen ist, dann das Freie; je zuerst was da ist, dann
    // was kommt. Zugewiesenes bekommt kein anderer Auftrag.
    const toepfe = new Map();
    const topf = (k) => { if (!toepfe.has(k)) toepfe.set(k, neuerTopf()); return toepfe.get(k); };
    const frei = neuerTopf();
    const offenId = new Set([...g.auftraege, ...g.maschine].map((a) => a.auftrag.id));
    const offenNr = new Set([...g.auftraege, ...g.maschine].map((a) => a.auftrag.job_number));
    for (const p of g.lager.concat(g.bestellt)) {
      p.fuer = p.fuer_hoco && offenNr.has(p.fuer_hoco) ? "h:" + p.fuer_hoco
        : p.job_id && offenId.has(p.job_id) ? "j:" + p.job_id : null;
      if (p.fuer) p.fuerNr = p.fuer_hoco || [...g.auftraege, ...g.maschine].find((a) => a.auftrag.id === p.job_id)?.auftrag.job_number;
      const t = p.fuer ? topf(p.fuer) : frei;
      const bestellt = p.art === "bestellt";
      if (p.kg === null || p.kg === undefined) t[bestellt ? "kommtU" : "daU"]++;
      else { t[bestellt ? "kommt" : "da"] += p.kg; t[bestellt ? "kommtB" : "daB"]++; }
    }
    let fehltKg = 0;
    for (const a of g.auftraege) {
      const kg = a.bedarf ? a.bedarf.kg : null;
      const quellen = ["j:" + a.auftrag.id, "h:" + a.auftrag.job_number].filter((k) => toepfe.has(k))
        .map((k) => toepfe.get(k)).concat([frei]);
      let ampel;
      if (kg !== null) {
        let rest = kg, kamBestellt = false;
        for (const t of quellen) {
          if (rest <= 0.001) break;
          const r = nehmen(t, rest);
          rest = r.rest; kamBestellt = kamBestellt || r.bestellt;
        }
        if (rest > 0.001) { fehltKg += rest; a.fehltKg = rest; ampel = "fehlt"; }
        else ampel = kamBestellt ? "bestellt" : "gut";
      } else if (quellen.some((t) => t.daB || t.daU)) ampel = "gut";
      else if (quellen.some((t) => t.kommtB || t.kommtU)) ampel = "bestellt";
      else if (String(a.auftrag.material_menge || "").trim()) ampel = "unklar";
      else ampel = "fehlt";
      a.ampel = ampel;
      ampelVon[a.auftrag.id] = { ampel, gruppe: g, eintrag: a };
    }
    for (const x of g.maschine) ampelVon[x.auftrag.id] = { ampel: "maschine", gruppe: g, eintrag: x };
    g.fehltKg = fehltKg;
    const arten = new Set(g.auftraege.map((a) => a.ampel));
    g.ampel = arten.has("fehlt") ? "fehlt" : arten.has("unklar") ? "unklar" : arten.has("bestellt") ? "bestellt"
      : g.auftraege.length ? "gut" : g.maschine.length ? "maschine" : "lager";
    g.erster = g.auftraege[0] ? g.auftraege[0].start : null;
  }
  return { gruppen: [...gruppen.values()], ampelVon };
}

// Ein Rahmenauftrag: in der Abrufinformation steht „Rahmen“
export const istRahmen = (j) => /rahmen/i.test(String((j && j.abruf_info) || ""));

function neuerTopf() { return { da: 0, kommt: 0, daB: 0, kommtB: 0, daU: 0, kommtU: 0 }; }

// Nimmt kg aus einem Topf. Posten ohne Menge reichen nur, wenn im Topf
// keine Menge bekannt ist (wie bisher). → { rest, bestellt }
function nehmen(t, kg) {
  let rest = kg;
  if (t.daU && !t.daB) return { rest: 0, bestellt: false };
  const a = Math.min(rest, Math.max(0, t.da)); t.da -= a; rest -= a;
  if (rest <= 0.001) return { rest: 0, bestellt: false };
  if (t.kommtU && !t.kommtB) return { rest: 0, bestellt: true };
  const b = Math.min(rest, Math.max(0, t.kommt)); t.kommt -= b; rest -= b;
  return { rest: Math.max(0, rest), bestellt: b > 0 };
}

function summe(liste) {
  let kg = 0, unbekannt = 0;
  for (const p of liste) { if (p.kg === null || p.kg === undefined) unbekannt++; else kg += p.kg; }
  return { kg, unbekannt };
}

export const AMPEL = {
  gut:      { text: "da", zeichen: "✓", klasse: "gut" },
  maschine: { text: "an der Maschine", zeichen: "✓", klasse: "gut" },
  bestellt: { text: "bestellt", zeichen: "B", klasse: "warn" },
  unklar:   { text: "nur Text im Auftrag", zeichen: "?", klasse: "grau" },
  fehlt:    { text: "fehlt", zeichen: "!", klasse: "rot" },
  lager:    { text: "nur an Lager", zeichen: "", klasse: "grau" },
};

// Eine Zeile für Schnellvorschau und Balken
export function ampelText(eintrag) {
  if (!eintrag) return "";
  const { ampel, gruppe: g, eintrag: a } = eintrag;
  if (ampel === "maschine") return "Material an der Maschine";
  const teile = [];
  if (ampel === "fehlt") teile.push(a.fehltKg ? "fehlt " + kgText(a.fehltKg) : "fehlt, nichts da und nichts bestellt");
  else if (ampel === "bestellt") {
    const b = g.bestellt[0];
    teile.push("bestellt" + (b && b.termin ? ", kommt " + alt.kurzDatum(b.termin) : ""));
  } else if (ampel === "gut") teile.push("da");
  else if (ampel === "unklar") teile.push("nicht erfasst, im Auftrag steht nur Text");
  const zahlen = [];
  if (a.start && a.versatz) zahlen.push("voraussichtlich ab " + alt.kurzDatum(a.start));
  // Die Mindestmenge steht kurz in der eigenen Zeile „Mat. info.“ (seit 1.74.0)
  if (g.lager.length) zahlen.push("da " + (g.kgDa.kg ? kgText(g.kgDa.kg) : g.lager.length + " Posten"));
  if (g.bestellt.length) zahlen.push("bestellt " + (g.kgBestellt.kg ? kgText(g.kgBestellt.kg) : g.bestellt.length + "×"));
  if (g.aehnlich.length) zahlen.push("ähnlich an Lager: " + g.aehnlich.map((x) => x.tol || "ohne Toleranz").join(", "));
  return "Material: " + teile.join("") + (zahlen.length ? " (" + zahlen.join(", ") + ")" : "");
}

// Kurze Zeile „Mat. info.: min. 120 kg / 8 Stangen (✗L)“ für
// Auftragsfenster und Schnellvorschau (Wunsch Patrick 16. Oktober 2026:
// „immer, egal was für Status oder schon Material bestellt, so kurz wie
// möglich“). Gerechnet wie bei der Material-Übersicht (bedarfRechnen),
// für die noch offenen Stück. ✗L heisst: Länge nicht bestätigt.
// → { text, kg, stangen, sicher } oder null (nichts geladen, Externe,
// abgeschlossener Auftrag)
export const MAT_INFO_ERKLAERUNG = "✗L heisst: Die Länge des Fertigteils ist noch nicht bestätigt, "
  + "die Menge ist darum nur geschätzt. Bestätigt wird sie beim Beenden im Fenster „Art. Info“ "
  + "oder im Pad Mode mit der Kachel „Art. Info“.";
export function matInfo(j) {
  if (!stand || !stand.daten || !j || !istOffen(j)) return null;
  if (istRahmen(j)) return { text: "Rahmen, keine Mengenrechnung" };
  if (!String(j.material_bez || "").trim()) return { text: "kein Material eingetragen" };
  if (!kgJeMeter(j.material_bez)) return { text: "Material nicht erkannt" };
  const teil = stand.daten.teile[j.job_number];
  if (!teil || !Number(teil.teil_laenge_mm)) return { text: "Länge des Fertigteils fehlt" };
  const b = bedarfRechnen(j, teil, stand.daten.maschineVon[j.machine_id]);
  if (!b) return { text: "nicht berechenbar" };
  const kg = Math.ceil(b.kg);
  const z = (n) => (alt.zahlText ? alt.zahlText(n) : String(n));
  return { text: "min. " + z(kg) + " kg / " + z(b.stangen) + (b.stangen === 1 ? " Stange" : " Stangen"),
    kg, stangen: b.stangen, sicher: b.sicher };
}

// ---------- Länge aus dem Einrichtblatt ----------

// Sucht im Excel die Zeile „Artikel Bez.“ und darin „17 x 7.00“
// (Durchmesser x Länge). Gibt { d, laenge, text } oder, wenn nichts
// passt, { grund, text } — der Grund kommt in die Liste, damit man
// sieht, woran es lag (Patrick 15. Oktober 2026: „warum nur so 120?“).
const BEZ_FELD = /^(art(ikel)?bez|artikel$|artikelbezeichnung|teilbez|benennung|bezeichnung)/;

export async function massAusEinrichtblatt(url) {
  const antwort = await fetch(url);
  if (!antwort.ok) return { grund: "Einrichtblatt nicht erreichbar" };
  const daten = new Uint8Array(await antwort.arrayBuffer());
  const m = await import("xlsx");
  const XLSX = m.default && m.default.read ? m.default : m;
  let buch;
  try { buch = XLSX.read(daten, { type: "array" }); }
  catch (f) { return { grund: "Excel nicht lesbar" }; }
  let gesehen = "";
  let ersatz = null;
  for (const name of buch.SheetNames) {
    const blatt = buch.Sheets[name];
    const zeilen = XLSX.utils.sheet_to_json(blatt, { header: 1, raw: false, blankrows: false }).slice(0, 200);
    for (let z = 0; z < zeilen.length; z++) {
      const zeile = zeilen[z] || [];
      for (let s = 0; s < zeile.length; s++) {
        const roh = String(zeile[s] || "");
        const t = roh.toLowerCase().replace(/[\s.\-_:]+/g, "");
        if (!BEZ_FELD.test(t)) {
          // Ohne Feldname: eine Zelle mit Wort und „17 x 7“ merken, falls
          // das Blatt gar kein Feld „Art. Bez.“ hat
          if (!ersatz && z < 60 && /[a-zäöü]{3}/i.test(roh)) {
            const mass = massLesen(roh);
            if (mass) ersatz = mass;
          }
          continue;
        }
        // Wert rechts daneben (auch weit rechts bei verbundenen Zellen),
        // sonst darunter
        const unten = zeilen[z + 1] || [];
        const kandidaten = [String(roh).replace(/^[^:]*:/, "")]
          .concat(zeile.slice(s + 1, s + 25), unten.slice(s, s + 8));
        for (const k of kandidaten) {
          const mass = massLesen(k);
          if (mass) return mass;
        }
        const text = kandidaten.map((k) => String(k || "").trim()).filter(Boolean).join(" · ").slice(0, 80);
        if (text && !gesehen) gesehen = text;
      }
    }
  }
  if (ersatz) return { ...ersatz, text: "ohne Feld Art. Bez.: " + ersatz.text };
  return gesehen ? { grund: "Art. Bez. ohne „Ø x Länge“", text: gesehen } : { grund: "Kein Feld Art. Bez. im Blatt" };
}

// „17 x 7.00“, „17mm x 7mm“, „Ø17 x 7,5“; sonst „Ø 17 L 7“ oder „L=7“
export function massLesen(text) {
  const t = String(text || "");
  const zahlMuster = "(\\d+(?:[.,]\\d+)?)";
  // Gewinde wie „M6x0.75“ zählen nicht (Buchstabe direkt davor)
  const alle = [...t.matchAll(new RegExp("[øØ]?\\s*" + zahlMuster + "\\s*(?:mm)?\\s*[x×*]\\s*[øØ]?\\s*" + zahlMuster, "gi"))]
    .filter((m) => !/[a-zäöü]/i.test(t.charAt(m.index + m[0].search(/[øØ\d]/) - 1)));
  let d = null, laenge = null;
  if (alle.length) {
    const m = alle[alle.length - 1];
    d = zahl(m[1]); laenge = zahl(m[2]);
  } else {
    const l = t.match(new RegExp("\\bL(?:änge)?\\s*[=:]?\\s*" + zahlMuster, "i"));
    if (!l) return null;
    laenge = zahl(l[1]);
    const dm = t.match(new RegExp("(?:[øØ]|\\bD)\\s*[=:]?\\s*" + zahlMuster, "i"));
    d = dm ? zahl(dm[1]) : null;
  }
  if (!laenge || laenge > 1000 || (d && d > 120)) return null;
  return { d, laenge, text: t.trim() };
}

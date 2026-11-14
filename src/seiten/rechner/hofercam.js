// =================================================================
//  HOFER CAM: Programmkopf und Programmende je Maschinentyp
//  Seit 1.395.0, Schritt für Schritt nach Patricks Vorgaben (5. November
//  2026). Zuerst nur Star SB-20RG. Kanal 1 hat die Nummer O0001–O0999,
//  Kanal 2 dieselbe Nummer + 1000. Kopf und Ende stammen aus Patricks
//  Programm O0458 / O1458; „(Ende Kopf)“ und „(Start Ende)“ trennen sie
//  in beiden Kanälen. Die Bearbeitungen dazwischen kommen später.
// =================================================================

import { typ, vorlageArt, vorlageFuellen, blockEigene, eigeneVorgaben, feldAus, kopfEigene, wirksamB, wirksamW } from "./camTyp.js";

// Synchronisationsmarken der SB-20RG (Patrick 5. November 2026): M200
// bis M999, dazu M20, M40, M41, M82, M83. Vierstellige wie M1881 / M1891
// (Hochdruck ein / aus) sind keine.
const MARKEN_EINZELN = new Set([20, 40, 41, 82, 83]);
export function istMarkeNr(n) { return MARKEN_EINZELN.has(n) || (n >= 200 && n <= 999); }

// Marke einer Zeile oder null; Kommentare in Klammern zählen nicht
export function markeVon(zeile) {
  const ohne = String(zeile).replace(/\([^)]*\)?/g, "").toUpperCase();
  const re = /M(\d+)/g;
  let m;
  while ((m = re.exec(ohne))) {
    const n = Number(m[1]);
    if (m[1].length <= 3 && istMarkeNr(n)) return "M" + n;
  }
  return null;
}

// Zahl wie an der Steuerung: ohne Punkt getippt mit Punkt dahinter (17 → 17.),
// mit Punkt genau wie getippt (0.20 bleibt 0.20), Komma gilt als Punkt
export function zahl(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return t.includes(".") ? t : t + ".";
}

export const FELDER = [
  { gruppe: "Programm", felder: [
    { name: "nr", text: "Nr. Kanal 1", einheit: "1–999", lang: "Programm-Nr. Kanal 1, 1 bis 999 (Kanal 2 = Nr. + 1000)", art: "nr" },
    { name: "hoco", text: "HOCO Nr.", einheit: "z.B. 10007-0589", art: "text" },
    { name: "datum", text: "Datum", einheit: "TT.MM.JJ", lang: "Datum in G170", art: "text" },
    { name: "kuerzel", text: "Kürzel", einheit: "z.B. PR", lang: "Kürzel in G170", art: "text" },
  ] },
  { gruppe: "Grundvariablen G266", felder: [
    { name: "A", text: "A Material-Ø", einheit: "mm", lang: "A = #531 Materialdurchmesser" },
    { name: "W", text: "W Teilelänge", einheit: "mm", lang: "W = #530 Teilelänge" },
    { name: "S", text: "S Drehzahl", einheit: "U/min", lang: "S = #529 Abstechdrehzahl", ganz: true },
    { name: "X", text: "X Abstechende", einheit: "mm", lang: "X = #524 Abstechendposition" },
    { name: "Z", text: "Z Start", einheit: "mm", lang: "Z = #525 Z-Achse Startposition, höchstens 200: 200 mm minus Teilelänge minus inkl. evtl. vers. Abstecher minus Sicherheit" },
    { name: "F", text: "F Vorschub", einheit: "mm/U", lang: "F = #522 Vorschub Abstechen" },
    { name: "B", text: "B Stahlbreite", einheit: "mm", lang: "B = #528 Breite des Abstechstahls" },
  ] },
  { gruppe: "Kanal 1", felder: [
    { name: "schlicht", text: "Schlichtzugabe Z", einheit: "mm", lang: "Kopf: G0Z…T0(SCHLICHTZUGABE)" },
    { name: "plan", text: "Zugabe Plan hinten W", einheit: "mm", lang: "Ende: G0W…(ZUGABE PLANDREHEN HINTEN)" },
  ] },
  { gruppe: "Kanal 2 Abgreifen", felder: [
    { name: "annaehern", text: "Annähern Z vor das Teil", einheit: "mm", lang: "Abstand vor dem Teil, positiv eingeben; im Programm mit Minus: G0Z-…(EILGANG …MM VOR STUCK)" },
    { name: "ueber", text: "Über das Teil Z", einheit: "mm", lang: "Ende: G1G98Z…F5000.(…MM UBER DEM STUCK)" },
  ] },
];

function heute() {
  const d = new Date();
  const zz = (n) => String(n).padStart(2, "0");
  return zz(d.getDate()) + "." + zz(d.getMonth() + 1) + "." + zz(d.getFullYear() % 100);
}

// Vorgaben aus O0458 / O1458
export function vorgabe() {
  // Seit 1.441.0 je Maschinentyp änderbar (camTyp.js)
  // Seit 1.541.0 startet die Ansicht mit leeren Kopfdaten (Wunsch Patrick
  // 14. November 2026: „bei der Startansicht sollen die Felder für die
  // Kopfdaten leer sein“, „es soll aber angegeben werden, in welcher
  // Einheit“); die Einheit steht beim Feld (einheit in FELDER)
  const leer = Object.fromEntries(FELDER.flatMap((g) => g.felder.map((d) => [d.name, ""])));
  return { ...leer, eigen: eigeneVorgaben("kopf"), bloecke: [] };
}

// Fehler je Feld (Text) oder leer
export function pruefen(w) {
  const f = {};
  w = wirksamW(w);
  const nr = Number(w.nr);
  // Seit 1.541.0: leere Felder heissen „leer“ (nicht rot, nur genannt)
  if (String(w.nr ?? "").trim() === "") f.nr = "leer";
  else if (!/^\d{1,3}$/.test(String(w.nr).trim()) || nr < 1 || nr > 999) f.nr = "1 bis 999";
  for (const g of FELDER) for (const d of g.felder) {
    if (d.art || feldAus("kopf", d.name)) continue;
    if (String(w[d.name] ?? "").trim() === "") f[d.name] = "leer";
    else if (zahl(w[d.name]) == null) f[d.name] = "Zahl fehlt";
    else if (d.ganz && !Number.isInteger(Number(String(w[d.name]).replace(",", ".")))) f[d.name] = "ganze Zahl";
  }
  if (!f.Z && Number(String(w.Z).replace(",", ".")) > 200) f.Z = "höchstens 200";
  return f;
}

const nr4 = (n) => String(n).padStart(4, "0");
const v = (w, n) => zahl(w[n]) ?? String(w[n] ?? "");
const ohneMinus = (t) => String(t).replace(/^-/, "").replace(/\.$/, "");

// Seit 1.441.0 stehen Kopf und Ende als Vorlage in camTyp.js und sind je
// Maschinentyp änderbar; die Vorgabe gibt genau das alte Programm aus
function kopfWerte(w) {
  const nr = Number(w.nr) || 0;
  const an = "-" + String(v(w, "annaehern")).replace(/^[-+]/, ""), ue = v(w, "ueber");
  const datum = String(w.datum || "").trim(), kuerzel = String(w.kuerzel || "").trim();
  return {
    NR: nr4(nr), NR2: nr4(nr + 1000), NAME: w.hoco ? "(" + w.hoco + ")" : "", HOCO: String(w.hoco || ""),
    DATUM_KUERZEL: [datum, kuerzel].filter(Boolean).join(" "), DATUM: datum, KUERZEL: kuerzel,
    A: v(w, "A"), W: v(w, "W"), S: String(w.S ?? "").trim(), X: v(w, "X"), Z: v(w, "Z"), F: v(w, "F"), B: v(w, "B"),
    SCHLICHT: v(w, "schlicht"), PLAN: v(w, "plan"),
    // Seit 1.419.1: Annähern positiv eingeben, im Programm immer mit Minus
    ANNAEHERN: an, ANNAEHERN_MM: ohneMinus(an), UEBER: ue, UEBER_MM: ohneMinus(ue),
  };
}
// Seit 1.450.0 mit den eigenen Feldern oben (Werte und Bedingungen)
function kopfAlles(w) { const werte = kopfWerte(w); const bed = kopfEigene(w, werte); return { werte, bed }; }
function kanal1(w) {
  const t = typ().vorlagen, x = kopfAlles(w);
  return { kopf: vorlageFuellen(t.k1kopf, x), ende: vorlageFuellen(t.k1ende, x) };
}
function kanal2(w) {
  const t = typ().vorlagen, x = kopfAlles(w);
  return { kopf: vorlageFuellen(t.k2kopf, x), ende: vorlageFuellen(t.k2ende, x) };
}

// ---------- Bearbeitungen ----------
// Drehwerkzeuge Kanal 1 (Patrick 5. November 2026): T100 bis T600. Kopf
// der Bearbeitung: Aufruf, Hochdruck (M1881D…, nur T100–T600), Drehrichtung
// mit Drehzahl und Korrektur, Anfahren auf Rohmaterial + 1 mm. Dazwischen
// der NC-Code aus den Werkzeugen von NC-PRO. Ende: Wegfahren auf
// Rohmaterial + 0.2 mm (Winkel und Vorschub einstellbar, X30. fest),
// Hochdruck aus, Korrektur aus, M1.

// Seit 1.441.0 je Maschinentyp änderbar (camTyp.js)
export const plaetzeVon = (gruppe) => typ().plaetze[gruppe] || [];
// Die SB-20RG hat nur vier Hochdruck-Stufen (Patrick 7. November 2026: „es gibt nur 4 nicht 6“).
export const HD_STUFEN = ["", "1", "2", "3", "4"];

// Seit 1.400.0: feste Frontwerkzeuge T1100–T1400 (Patricks Beispiel
// T1400 Bohren D6.8, 5. November 2026). Wahl Haupt- oder Gegenspindel;
// seit 1.405.0 mit Gegenspindel: Kanal 1 nur Kopf und Ende ohne
// Verfahrwege und eine Wartemarke, Kanal 2 mit T2000 macht die Wege.

// Seit 1.415.0: angetriebene Querwerkzeuge T3421–T3423 an der
// Gegenspindel (Patricks O0458 / O1458, 5. November 2026): Kanal 1
// positioniert X, Kanal 2 schaltet das Werkzeug mit M37 / M38 ein und
// macht mit T2000 den Weg in Z

// Seit 1.418.0: quer angetriebene T3100–T3400, nur Hauptspindel, nach
// Patricks T3100 aus O0458 (5. November 2026)

// Seit 1.420.0: Drehwerkzeuge Kanal 2 nach Patricks T2100-Beispiel
// (5. November 2026); seit 1.423.0 T2100–T2400 gleich gebaut (Patrick:
// „kannst du identisch bauen“)


const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function neuerBlock(bloecke = [], art = "dreh") {
  const belegt = new Set(bloecke.map((b) => b.platz));
  const gruppe = art === "k2a" ? "k2" : art;
  const l = plaetzeVon(gruppe);
  const platz = l.find((p) => !belegt.has(p)) || l[0] || "";
  const nb = { id: neueId(), art, platz, bez: "", ...(typ().bloecke[art] || {}), eigen: eigeneVorgaben(art), code: "" };
  // Front- und frontangetriebene Werkzeuge zuerst an der Hauptspindel (1.417.0)
  if (art === "front" || art === "quer") nb.spindel = "haupt";
  return nb;
}

// Seit 1.401.0 (Wunsch Patrick 5. November 2026: „generell und optional
// anstelle der Drehzahl die Schnittgeschwindigkeit eingeben“): je Block
// sArt "vc" mit vc (m/min) und vcD (Ø in mm); die App rechnet daraus die
// Drehzahl S = Vc · 1000 / (π · Ø), auf ganze Umdrehungen gerundet. Beim
// Drehwerkzeug gilt ohne Ø der Material-Ø A aus G266.
export function vcDurchmesser(b, w = {}) {
  const d = zahl(b.vcD);
  if (d != null) return Number(d);
  if (b.art !== "front" && b.art !== "k2") { const a = zahl(w.A); if (a != null) return Number(a); }
  return null;
}
export function drehzahl(b, w = {}) {
  if (b.sArt !== "vc") return /^\d+$/.test(String(b.S).trim()) && Number(b.S) > 0 ? String(b.S).trim() : null;
  const vc = zahl(b.vc), d = vcDurchmesser(b, w);
  // Seit 1.403.0: mit G96 hält die Maschine Vc selbst, S ist dann Vc
  if (b.g96) return vc != null && Number(vc) > 0 ? String(b.vc).trim().replace(",", ".") : null;
  if (vc == null || !(Number(vc) > 0) || !(d > 0)) return null;
  return String(Math.round(Number(vc) * 1000 / (Math.PI * d)));
}

export function blockFehler(b, w = {}) {
  const f = {};
  b = wirksamB(b); w = wirksamW(w);
  if (b.art === "k2a") {
    if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    return f;
  }
  if (b.art === "k2") {
    if (b.sArt === "vc") {
      if (zahl(b.vc) == null || !(Number(zahl(b.vc)) > 0)) f.vc = "Zahl fehlt";
      if (!b.g96 && vcDurchmesser(b, w) == null) f.vcD = "Ø fehlt";
    } else if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    for (const n of ["vorX", "vorZ", "nX", "nZ"]) if (zahl(b[n]) == null) f[n] = "Zahl fehlt";
    return f;
  }
  if (b.art === "seite") {
    if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
    return f;
  }
  if (b.art === "quer") {
    if (!anGegenspindel(b)) {
      if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
      if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
      if (zahl(b.wegZ) == null) f.wegZ = "Zahl fehlt";
      return f;
    }
    if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    if (zahl(b.X) == null) f.X = "Zahl fehlt";
    if (String(b.Y ?? "").trim() !== "" && zahl(b.Y) == null) f.Y = "Zahl oder leer";
    if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
    const ms = ["m1", "m2", "m3"].map((n) => [n, markeNorm(b[n])]);
    for (const [n, m] of ms) if (String(b[n] ?? "").trim() !== "" && !m) f[n] = "M200–M999 oder leer";
    ms.forEach(([n, m], i) => { if (m && ms.slice(0, i).some(([, x]) => x === m)) f[n] = "doppelt"; });
    return f;
  }
  if (b.sArt === "vc") {
    if (zahl(b.vc) == null || !(Number(zahl(b.vc)) > 0)) f.vc = "Zahl fehlt";
    if (String(b.vcD ?? "").trim() !== "" && zahl(b.vcD) == null) f.vcD = "Zahl oder leer";
    else if (!b.g96 && vcDurchmesser(b, w) == null) f.vcD = b.art === "front" ? "Ø fehlt" : "Ø fehlt (oder A oben)";
  } else if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
  if (zahl(b.anZ) == null) f.anZ = "Zahl fehlt";
  if (b.art === "front") {
    if (zahl(b.wegZ) == null) f.wegZ = "Zahl fehlt";
    if (anGegenspindel(b)) {
      // Seit 1.407.0: Wartemarken von Hand, leer = von selbst
      const m1 = markeNorm(b.m1), m2 = markeNorm(b.m2);
      if (String(b.m1 ?? "").trim() !== "" && !m1) f.m1 = "M200–M999 oder leer";
      if (String(b.m2 ?? "").trim() !== "" && !m2) f.m2 = "M200–M999 oder leer";
      if (m1 && m1 === m2) f.m2 = "gleich wie Start";
    }
    return f;
  }
  if (zahl(b.wegF) == null) f.wegF = "Zahl fehlt";
  if (String(b.wegA).trim() !== "" && zahl(b.wegA) == null) f.wegA = "Zahl oder leer";
  return f;
}

// Seit 1.407.0: eingetippte Wartemarke ("500", "M500") als "M500", sonst null
export function markeNorm(t) {
  const m = String(t ?? "").trim().match(/^[mM]?(\d{1,3})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return istMarkeNr(n) ? "M" + n : null;
}

// Seit 1.419.0 (Wunsch Patrick 5. November 2026: „G99 G98 soll generell
// ausgewählt werden können“, „generell am Schluss wieder G99“): je
// Bearbeitung G99 (mm/U) oder G98 (mm/min), Vorgabe wie bisher (G98 nur an
// der Gegenspindel); die Zeile steht nach der Drehzahl, am Ende der
// Bearbeitung immer G99
export const vorschubArt = (b) => (b.vor === "98" || b.vor === "99" ? b.vor : anGegenspindel(b) ? "98" : "99");
const vorZeile = (b) => "G" + vorschubArt(b);

// Seit 1.441.0: die Zeilen jeder Bearbeitung kommen aus der Vorlage ihrer
// Art in camTyp.js (je Maschinentyp änderbar); hier werden nur die Werte
// gerechnet. Die Geschichte der einzelnen Zeilen (Patricks Vorgaben vom
// 5. November 2026) steht dort bei den Vorlagen.
const codeZeilen = (b) => String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
// Kanal 2: jede Zeile mit „/“ davor, Marken und Zeilen mit „/“ nicht
const schraeg = (z) => (markeVon(z) || z.startsWith("/") ? z : "/" + z);
const STANDARD_MARKEN = { quer: { m1: "M300", m2: "M310", m3: "M320" }, front: { m1: "M300", m2: "M310" } };
function blockWerte(b, w, marke) {
  b = wirksamB(b); w = wirksamW(w);
  const art = vorlageArt(b);
  const bez = String(b.bez || "").trim();
  const g96 = b.sArt === "vc" && !!b.g96;
  const roh = String(b.S ?? "").trim();
  const mitVc = art === "dreh" || art === "front" || art === "frontGegen" || art === "k2";
  const S = mitVc ? drehzahl(b, w) ?? roh : roh;
  // Drehrichtung je Art: stehend M3 / M4, angetrieben M36 / M37
  const dreh = art === "k2" ? (b.dreh === "3" ? 3 : 4)
    : art === "k2a" ? (b.dreh === "36" ? 36 : 37)
    : art === "seite" || art === "quer" || art === "querGegen" ? (b.dreh === "37" ? 37 : 36)
    : (b.dreh === "4" ? 4 : 3);
  const mk = marke || (anGegenspindel(b) ? STANDARD_MARKEN[b.art] : null) || {};
  const g = (n) => zahl(b[n]) ?? String(b[n] ?? "");
  const platz = String(b.platz ?? "");
  const werte = {
    PLATZ: platz, T: Number(b.platz) / 100, T2: platz.slice(-2), T2V: platz.slice(0, 2),
    BEZ: bez, BEZ_K: bez ? "(" + bez + ")" : "", BEZ_GEGEN: mitGegen(bez), HD: String(b.hd ?? ""),
    DREH: "M" + dreh, S, G96: g96 ? "G96" : "", VOR: vorZeile(b),
    ANZ: g("anZ"), WEGZ: g("wegZ"), WEGF: g("wegF"),
    WINKEL: String(b.wegA ?? "").trim() === "" ? "" : ",A" + (zahl(b.wegA) ?? b.wegA),
    X: g("X"), Y: zahl(b.Y) != null ? "Y" + zahl(b.Y) : "",
    VORX: g("vorX"), VORZ: g("vorZ"), NX: g("nX"), NZ: g("nZ"),
    M1: mk.m1 || "", M2: mk.m2 || "", M3: mk.m3 || "",
  };
  const bed = { hd: !!b.hd, hdaus: !!b.hd && !b.hdAn, g96, m38: !b.spAn, m5: !b.ohneM5, y: zahl(b.Y) != null };
  blockEigene(b, w, werte, bed);
  const listen = {
    CODE: codeZeilen(b),
    PAARE: markenPaare(b).flatMap(([x, y]) => [x, ...k1Zeilen(b, x, y), y]),
    PAARE2: markenPaare(b).flatMap(([x, y]) => [x, ...k1Zeilen(b, x, y, "k2"), y]),
  };
  return { art, werte, bed, listen };
}
export function blockZeilen(b, w = {}, marke) {
  const x = blockWerte(b, w, marke);
  return vorlageFuellen(typ().vorlagen[x.art + ".k1"], { ...x, schraeg });
}

// Seit 1.405.0: Kanal 2 bei einem Frontwerkzeug an der Gegenspindel,
// nach Patricks O1458 (T2000, Wege in Z, G28W0.): die Gegenspindel fährt
// mit dem Teil an das feste Werkzeug, die Marke danach gibt Kanal 1 frei
// Seit 1.412.0 (Patrick 5. November 2026): an der Gegenspindel bekommt
// die Bezeichnung in beiden Kanälen „MIT GEGENSPINDEL“ angehängt
export const mitGegen = (bez) => (bez ? bez + " " : "") + "MIT GEGENSPINDEL";
export function blockZeilen2(b, marke, w = {}) {
  const x = blockWerte(b, w, marke);
  return vorlageFuellen(typ().vorlagen[x.art + ".k2"], { ...x, schraeg });
}
// Seit 1.414.0 (Wunsch Patrick 5. November 2026: „innerhalb der
// Bearbeitung Wartemarken setzen … auf Kanal 2 z.B. M350 und M360 direkt
// nacheinander, dann soll auf Kanal 1 innerhalb der Wartemarken
// programmiert werden können“): zwei Marken direkt nacheinander im NC-Code
// an der Gegenspindel sind ein Paar; Kanal 1 bekommt dieselben Marken und
// dazwischen den Code aus `k1["M350-M360"]` am Block
// Seit 1.416.0 (Wunsch Patrick 5. November 2026: „generell, wenn ich in
// einem Kanal Wartemarken innerhalb der freien Programmierung setze, soll
// für den anderen Kanal das Fenster aufgehen“): auch bei Bearbeitungen
// in Kanal 1; dann steht der Code des Felds in Kanal 2 (`k2` am Block)
export function markenPaare(b) {
  const m = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean).map(markeVon);
  const paare = [];
  for (let i = 0; i + 1 < m.length; i++) if (m[i] && m[i + 1] && m[i] !== m[i + 1]) { paare.push([m[i], m[i + 1]]); i++; }
  return paare;
}
export const k1Zeilen = (b, x, y, feld = "k1") =>
  String((b[feld] || {})[x + "-" + y] || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
export const anGegenspindel = (b) => (b.art === "front" || b.art === "quer") && b.spindel === "gegen";

// Je Block an der Gegenspindel zwei Wartemarken {m1, m2}: von Hand
// gesetzte gelten, leere bekommen freie ab M300 in Zehnerschritten, die
// weder in Kopf und Ende, im NC-Code noch bei anderen Blöcken vorkommen
export function markenVergeben(bloecke, belegtZeilen = []) {
  const belegt = new Set(belegtZeilen.map(markeVon).filter(Boolean));
  bloecke.forEach((b) => {
    String(b.code || "").split(/\r?\n/).forEach((z) => { const m = markeVon(z); if (m) belegt.add(m); });
    if (anGegenspindel(b)) [b.m1, b.m2, b.m3].map(markeNorm).filter(Boolean).forEach((m) => belegt.add(m));
    [...Object.values(b.k1 || {}), ...Object.values(b.k2 || {})].forEach((c) => String(c).split(/\r?\n/).forEach((z) => { const m = markeVon(z); if (m) belegt.add(m); }));
  });
  const marken = {};
  // Beginn und Schritt seit 1.441.0 je Maschinentyp (Vorgabe M300, 10)
  const { ab: start, schritt } = typ().marken;
  let n = start;
  const frei = () => {
    while (belegt.has("M" + n) && n <= 999) n += schritt;
    const m = "M" + n;
    belegt.add(m);
    n += schritt;
    return m;
  };
  for (const b of bloecke) {
    if (!anGegenspindel(b)) continue;
    const m1 = markeNorm(b.m1) || frei();
    const m2 = markeNorm(b.m2) || frei();
    marken[b.id] = b.art === "quer" ? { m1, m2, m3: markeNorm(b.m3) || frei() } : { m1, m2 };
  }
  return marken;
}

// Ganze Programme je Kanal; die Bearbeitungen stehen zwischen Kopf und Ende
export function programme(w) {
  w = wirksamW(w);
  const k1 = kanal1(w), k2 = kanal2(w);
  // Seit 1.398.0: je Block die Zeilen in Kanal 1 (von–bis, ab 1), damit
  // die Anzeige die angewählte Bearbeitung hervorheben kann
  const bereiche = {}, bereiche2 = {};
  const bloecke = w.bloecke || [];
  const marken = markenVergeben(bloecke, [...k1.kopf, ...k1.ende, ...k2.kopf, ...k2.ende]);
  let ab = k1.kopf.length, ab2 = k2.kopf.length;
  const bearb2 = [];
  const bearb1 = bloecke.flatMap((b) => {
    const z = blockZeilen(b, w, marken[b.id]);
    bereiche[b.id] = [ab + 1, ab + z.length];
    ab += z.length;
    // Seit 1.416.0: Markenpaare im Code von Kanal 1 geben Kanal 2 die
    // Marken mit dem Code aus dem Feld dazwischen
    // (seit 1.441.0 auch das über die Vorlage der Art für Kanal 2)
    const z2 = blockZeilen2(b, marken[b.id], w);
    if (z2.length) {
      bereiche2[b.id] = [ab2 + 1, ab2 + z2.length];
      ab2 += z2.length;
      bearb2.push(...z2);
    }
    return z;
  });
  return {
    bereiche, bereiche2, marken,
    k1: [...k1.kopf, ...bearb1, ...k1.ende],
    k2: [...k2.kopf, ...bearb2, ...k2.ende],
    nr1: nr4(Number(w.nr) || 0), nr2: nr4((Number(w.nr) || 0) + 1000),
  };
}

// Zwei Kanäle nebeneinander: gleiche Marken auf dieselbe Zeile, dazwischen
// Leerzeilen. Gepaart wird über die längste gemeinsame Folge der Marken;
// eine Marke ohne Gegenstück im anderen Kanal bleibt allein (fehler).
export function synchronisieren(z1, z2) {
  const m1 = [], m2 = [];
  z1.forEach((z, i) => { const m = markeVon(z); if (m) m1.push({ i, m }); });
  z2.forEach((z, i) => { const m = markeVon(z); if (m) m2.push({ i, m }); });
  // Längste gemeinsame Folge
  const L = Array.from({ length: m1.length + 1 }, () => new Array(m2.length + 1).fill(0));
  for (let a = m1.length - 1; a >= 0; a--) for (let b = m2.length - 1; b >= 0; b--) {
    L[a][b] = m1[a].m === m2[b].m ? L[a + 1][b + 1] + 1 : Math.max(L[a + 1][b], L[a][b + 1]);
  }
  const paare = [];
  for (let a = 0, b = 0; a < m1.length && b < m2.length;) {
    if (m1[a].m === m2[b].m) { paare.push([m1[a].i, m2[b].i]); a++; b++; }
    else if (L[a + 1][b] >= L[a][b + 1]) a++;
    else b++;
  }
  const gepaart1 = new Set(paare.map((p) => p[0])), gepaart2 = new Set(paare.map((p) => p[1]));
  const zelle = (zeilen, i, gepaart) => {
    const m = markeVon(zeilen[i]);
    return { text: zeilen[i], nr: i + 1, marke: m, fehler: !!m && !gepaart.has(i) };
  };
  const reihen = [];
  let p1 = 0, p2 = 0;
  const abschnitt = (bis1, bis2) => {
    const n = Math.max(bis1 - p1, bis2 - p2);
    for (let k = 0; k < n; k++) {
      const i1 = p1 + k, i2 = p2 + k;
      reihen.push({
        k1: i1 < bis1 ? zelle(z1, i1, gepaart1) : null,
        k2: i2 < bis2 ? zelle(z2, i2, gepaart2) : null,
      });
    }
    p1 = bis1; p2 = bis2;
  };
  for (const [i1, i2] of paare) {
    abschnitt(i1, i2);
    reihen.push({ sync: true, k1: zelle(z1, i1, gepaart1), k2: zelle(z2, i2, gepaart2) });
    p1 = i1 + 1; p2 = i2 + 1;
  }
  abschnitt(z1.length, z2.length);
  const fehler = reihen.reduce((n, r) => n + (r.k1?.fehler ? 1 : 0) + (r.k2?.fehler ? 1 : 0), 0);
  return { reihen, fehler };
}

// ---------- Von Hand geändert ----------
// Seit 1.421.0 (Wunsch Patrick 5. November 2026: „alles im CNC-Programm-
// fenster auch bearbeitbar, gelb hervorgehoben, was gegenüber der
// automatischen Erzeugung geändert wurde“). Gespeichert wird je Kanal das
// erzeugte Programm zur Zeit der letzten Änderung (basis) und das von
// Hand geänderte (hand). Rechnet die App neu, setzt sie die Änderungen
// zwischen basis und hand an derselben Stelle im neuen Programm wieder
// ein; findet sie die Stelle nicht mehr, geht die Änderung als
// „verloren“ zurück, damit die Anzeige sie rot nennen kann.

// Paare gleicher Zeilen (längste gemeinsame Folge), als [i in a, j in b]
function gleicheZeilen(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const p = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { p.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return p;
}

// Abschnitte, in denen hand von basis abweicht: basis[von, bis) → zeilen
function abschnitte(basis, hand) {
  const p = [...gleicheZeilen(basis, hand), [basis.length, hand.length]];
  const res = [];
  let i = 0, j = 0;
  for (const [pi, pj] of p) {
    if (pi > i || pj > j) res.push({ von: i, bis: pi, zeilen: hand.slice(j, pj) });
    i = pi + 1; j = pj + 1;
  }
  return res;
}

// Ergebnis: { zeilen, gelb: Set der Zeilen (ab 0) aus Handänderungen,
// verloren: [{ zeilen, war }] }
export function handAnwenden(neu, h) {
  if (!h || !Array.isArray(h.hand) || !Array.isArray(h.basis)) return { zeilen: neu, gelb: new Set(), verloren: [] };
  const { basis, hand } = h;
  const zu = new Map(gleicheZeilen(basis, neu));
  const ab = abschnitte(basis, hand);
  // Stelle im neuen Programm: Zeile vor dem Abschnitt und Zeile danach
  // müssen dort noch stehen und dazwischen genauso viele Zeilen wie vorher
  const ersetzen = [], verloren = [];
  for (const a of ab) {
    const vor = a.von === 0 ? -1 : zu.get(a.von - 1);
    const nach = a.bis === basis.length ? neu.length : zu.get(a.bis);
    if (vor === undefined || nach === undefined || nach <= vor || nach - vor - 1 !== a.bis - a.von) {
      verloren.push({ zeilen: a.zeilen, war: basis.slice(a.von, a.bis) });
      continue;
    }
    ersetzen.push({ von: vor + 1, bis: nach, zeilen: a.zeilen });
  }
  const zeilen = [], gelb = new Set();
  let i = 0;
  for (const e of ersetzen) {
    if (e.von < i) { verloren.push({ zeilen: e.zeilen, war: [] }); continue; }
    zeilen.push(...neu.slice(i, e.von));
    e.zeilen.forEach((z) => { gelb.add(zeilen.length); zeilen.push(z); });
    i = e.bis;
  }
  zeilen.push(...neu.slice(i));
  return { zeilen, gelb, verloren };
}

// Programme mit den Handänderungen (w.hand = { k1: {basis, hand}, k2: … })
export function programmeMitHand(w) {
  const p = programme(w);
  const h = w.hand || {};
  const r1 = handAnwenden(p.k1, h.k1), r2 = handAnwenden(p.k2, h.k2);
  // Seit 1.541.0: Abweichungen, die so aus einem eingelesenen Programm
  // stammen, violett statt gelb (danach von Hand Geändertes bleibt gelb)
  const ein1 = ausEingelesen(r1, h.k1), ein2 = ausEingelesen(r2, h.k2);
  return { ...p, auto1: p.k1, auto2: p.k2, k1: r1.zeilen, k2: r2.zeilen,
    gelb1: ohne(r1.gelb, ein1), gelb2: ohne(r2.gelb, ein2), ein1, ein2,
    verloren1: r1.verloren, verloren2: r2.verloren };
}
const ohne = (a, b) => new Set([...a].filter((i) => !b.has(i)));
function ausEingelesen(r, h) {
  const ein = new Set();
  if (!h || !Array.isArray(h.ein) || !r.gelb.size) return ein;
  const gleich = new Set(gleicheZeilen(r.zeilen, h.ein).map(([i]) => i));
  r.gelb.forEach((i) => { if (gleich.has(i)) ein.add(i); });
  return ein;
}

// Seit 1.541.0 (Wunsch Patrick 14. November 2026: „bestehende Programme
// einlesen … das Abweichende, welches nicht mit dem Standard überein-
// stimmt, markieren, aber nicht mit der gleichen Farbe“): liest eine
// NC-Datei; Kanal aus der O-Nummer (O0001–O0999 Kanal 1, ab O1001
// Kanal 2), aus Kanal 1 dazu HOCO Nr., G170 und G266 für die Felder oben
export function programmLesen(text) {
  const zeilen = String(text || "").replace(/\r/g, "").split("\n").map((z) => z.replace(/\s+$/, ""));
  while (zeilen.length && zeilen[zeilen.length - 1] === "") zeilen.pop();
  while (zeilen.length && zeilen[0] === "") zeilen.shift();
  const oZeile = zeilen.find((z) => /^O\d{1,4}/i.test(z.trim()));
  if (!oZeile) return { fehler: "keine Programmnummer (O…) gefunden" };
  const o = Number(oZeile.trim().match(/^O(\d{1,4})/i)[1]);
  const kanal = o >= 1000 ? 2 : 1, nr = kanal === 2 ? o - 1000 : o;
  if (nr < 1 || nr > 999) return { fehler: "O" + o + " passt nicht (O0001–O0999 oder O1001–O1999)" };
  const felder = { nr: String(nr) };
  if (kanal === 1) {
    const name = oZeile.match(/\(([^)]*)\)/);
    if (name && name[1].trim()) felder.hoco = name[1].trim();
    const g170 = zeilen.map((z) => z.match(/^G170\(([^)]*)\)/i)).find(Boolean);
    if (g170) {
      const t = g170[1].trim().split(/\s+/);
      if (t.length > 1 && /^[A-Za-zÄÖÜäöü]{1,4}$/.test(t[t.length - 1])) felder.kuerzel = t.pop();
      felder.datum = t.join(" ");
    }
    const g266 = zeilen.find((z) => /^G266/i.test(z.trim()));
    if (g266) for (const m of g266.trim().slice(4).matchAll(/([AWSXZFB])([-+]?[\d.]+|#\d+)/gi)) felder[m[1].toUpperCase()] = m[2];
  }
  return { kanal, nr, zeilen, felder };
}

// Neue Handfassung eines Kanals: basis = jetzt erzeugt, hand = angezeigt
// und geändert; gleich wie erzeugt = keine Handänderung mehr
export function handNeu(w, kanal, auto, zeilen) {
  const hand = { ...(w.hand || {}) };
  if (zeilen.length === auto.length && zeilen.every((z, i) => z === auto[i])) delete hand["k" + kanal];
  else {
    const ein = hand["k" + kanal]?.ein;
    hand["k" + kanal] = { basis: auto, hand: zeilen, ...(ein ? { ein } : {}) };
  }
  return hand;
}

// Seit 1.426.0 (Wunsch Patrick 5. November 2026: „wenn ich über die
// Bearbeitungen fahre, soll das Bild oben rechts auftauchen und die
// Werkzeuge markieren“): Bereich im Bild der SB-20RG (public/hilfe/
// star-sb20rg.png, 512 × 512) je Bearbeitung, Zuordnung von Claude,
// Patrick: „kannst du es logisch zuordnen?“
// Seit 1.426.1 je Werkzeug einzeln nach Patricks Angaben: Platten T100–
// T600 von links, quer T3100–T3300 von links (T3400 verdeckt), zur
// Hauptspindel T3421–T3423 von unten (T1100–T1400 dort verdeckt), zur
// Gegenspindel rechts T1100–T1400 von unten, links T3421–T3423 von unten
const PLATTEN = [[123, 293], [143, 287], [163, 277], [187, 263], [207, 253], [223, 243]];
const ZUR_GEGEN_FRONT = [[385, 284, 46, 20], [385, 264, 46, 19], [385, 244, 46, 19], [385, 223, 46, 19]];
const ZUR_GEGEN_QUER = [[362, 285, 40, 14], [362, 262, 40, 14], [362, 239, 40, 14]];
const ZUR_HAUPT_QUER = [[300, 255, 32, 17], [300, 233, 32, 17], [300, 209, 32, 17]];
const QUER = [[255, 195, 15, 40], [269, 195, 15, 40], [284, 193, 16, 38]];
// Kanal 2 T2100–T2400 von rechts (Patrick 5. November 2026)
const KANAL2 = [[145, 354, 43, 35], [127, 364, 41, 35], [109, 374, 39, 35], [93, 383, 40, 35]];
const r4 = (a, text, verdeckt) => ({ x: a[0], y: a[1], w: a[2], h: a[3], text, verdeckt: !!verdeckt });
export function bildBereich(b) {
  const p = Number(b.platz);
  if (b.art === "k2" || b.art === "k2a") return r4(KANAL2[Math.max(0, Math.min(3, Math.round(p / 100) - 21))], "Kanal 2");
  if (b.art === "seite") {
    const i = Math.round(p / 100) - 31;
    return i >= 0 && i < 3 ? r4(QUER[i], "querangetrieben") : r4([298, 192, 14, 40], "querangetrieben (verdeckt)", true);
  }
  const gegen = anGegenspindel(b);
  if (b.art === "quer") {
    const i = Math.max(0, Math.min(2, p - 3421));
    return gegen ? r4(ZUR_GEGEN_QUER[i], "zur Gegenspindel") : r4(ZUR_HAUPT_QUER[i], "zur Hauptspindel");
  }
  if (b.art === "front") {
    const i = Math.max(0, Math.min(3, Math.round(p / 100) - 11));
    return gegen ? r4(ZUR_GEGEN_FRONT[i], "zur Gegenspindel") : r4([333, 205, 28, 95], "zur Hauptspindel (verdeckt)", true);
  }
  const i = Math.max(0, Math.min(5, Math.round(p / 100) - 1));
  const [x, y] = PLATTEN[i];
  return r4([x - 11, y - 95, 22, 100], "Werkzeugplatten");
}

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
// Seit 1.663.0 (SW-20, Handbuch Kap. 8-11): M131 / M133 (Z1 und Hauptspindel
// auf PATH1 bzw. PATH3) und M142 / M143 (Superposition Z1-Z3) lassen PATH1
// und PATH3 aufeinander warten; „(1)“ dahinter ist nur ein Kommentar
const MARKEN_K13 = new Set([131, 133, 142, 143]);
export function istMarkeNr(n) { return MARKEN_EINZELN.has(n) || (n >= 200 && n <= 999); }

// Marke einer Zeile oder null; Kommentare in Klammern zählen nicht
export function markeVon(zeile) {
  const ohne = String(zeile).replace(/\([^)]*\)?/g, "").toUpperCase();
  const re = /M(\d+)/g;
  let m;
  while ((m = re.exec(ohne))) {
    const n = Number(m[1]);
    if (m[1].length <= 3 && (istMarkeNr(n) || MARKEN_K13.has(n))) return "M" + n;
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

// Seit 1.675.2 (Patrick 21. November 2026: „bei dieser Maschine ist die
// höchste Position im Programmkopf 205 mm“): Z Start höchstens 205 bei der
// SW-20, sonst 200
export const zMax = (w) => (w && w.typ === "star-sw20" ? 205 : 200);
// Seit 1.675.2: bei der SW-20 ist „plan“ die Schlichtzugabe für die
// Gegenspindel (G1W…F0.10 im Ende von Kanal 1, Patrick 21. November 2026)
export const feldFuerTyp = (d, w) => (!w || w.typ !== "star-sw20" ? d
  : d.name === "plan" ? { ...d, text: "Schlichtzugabe Gegensp. W", lang: "Ende Kanal 1: G1W…F0.10 vor dem Abstechen (Schlichtzugabe für die Gegenspindel)" }
  : d.name === "schlicht" ? { ...d, text: "Plandrehzugabe Hauptsp. Z", lang: "Kopf Kanal 1: G0Z…T0(PLANDREH-ZUGABE)" } : d);
export const zLang = (w) => `Z = #525 Z-Achse Startposition, höchstens ${zMax(w)}: ${zMax(w)} mm minus Teilelänge minus inkl. evtl. vers. Abstecher minus Sicherheit`;

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
    // Seit 1.640.0 (Wunsch Patrick 19. November 2026): Länge, um die die
    // Schnabelzange der Gegenspindel aus der Überwurfmutter heraussteht
    { name: "schnabel", text: "B Schnabelzange", einheit: "mm", lang: "Ende Kanal 2: G131B… = Länge, um die die Schnabelzange aus der Überwurfmutter (Spindelnase) der Gegenspindel heraussteht; leer = B0." },
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
  if (!f.Z && Number(String(w.Z).replace(",", ".")) > zMax(w)) f.Z = "höchstens " + zMax(w);
  return f;
}

const nr4 = (n) => String(n).padStart(4, "0");
const v = (w, n) => zahl(w[n]) ?? String(w[n] ?? "");
const ohneMinus = (t) => String(t).replace(/^-/, "").replace(/\.$/, "");

// Seit 1.587.0 (Patrick 16. November 2026): Abstecher T100 normal oder
// versetzt. Beim versetzten sitzt die Platte rechts am Schaft, um den
// Versatz (Vorgabe 10 mm, bis 1.597.x 12 mm) minus Abstechbreite B weiter vorne; diesen
// wirksamen Versatz fährt der Kopf mit G0X[#531+4.]Z-… vor, normal Z-0.
export const AB_VERSATZ_VORGABE = 10;
export function abVersatz(w) {
  if (!w || w.abArt !== "versetzt") return 0;
  const v = Number(zahl(w.abVersatz) ?? AB_VERSATZ_VORGABE), b = Number(zahl(w.B) ?? 0);
  return Math.max(0, Math.round((v - b) * 1000) / 1000);
}
const mitPunkt = (n) => (Number.isInteger(n) ? n + "." : String(n));

// Seit 1.441.0 stehen Kopf und Ende als Vorlage in camTyp.js und sind je
// Maschinentyp änderbar; die Vorgabe gibt genau das alte Programm aus
function kopfWerte(w) {
  const nr = Number(w.nr) || 0, nn = typ().nummern || [0, 1000, 2000];
  const an = "-" + String(v(w, "annaehern")).replace(/^[-+]/, ""), ue = v(w, "ueber");
  const datum = String(w.datum || "").trim(), kuerzel = String(w.kuerzel || "").trim();
  return {
    NR: nr4(nr + nn[0]), NR2: nr4(nr + nn[1]), NR3: nr4(nr + (nn[2] ?? 2000)), NAME: w.hoco ? "(" + w.hoco + ")" : "", HOCO: String(w.hoco || ""),
    DATUM_KUERZEL: [datum, kuerzel].filter(Boolean).join(" "), DATUM: datum, KUERZEL: kuerzel,
    A: v(w, "A"), W: v(w, "W"), S: String(w.S ?? "").trim(), X: v(w, "X"), Z: v(w, "Z"), F: v(w, "F"), B: v(w, "B"),
    SCHLICHT: v(w, "schlicht"), PLAN: v(w, "plan"), ABZ: mitPunkt(abVersatz(w)),
    // Seit 1.419.1: Annähern positiv eingeben, im Programm immer mit Minus
    // Seit 1.640.0: leer wie bisher B0.
    SCHNABEL: zahl(w.schnabel) ?? "0.",
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

// Seit 1.663.0 Kanal 3 (SW-20), vorerst nur Kopf und Ende
function kanal3(w) {
  const t = typ().vorlagen, x = kopfAlles(w);
  if (!t.k3kopf && !t.k3ende) return { kopf: [], ende: [] };
  return { kopf: vorlageFuellen(t.k3kopf || "", x), ende: vorlageFuellen(t.k3ende || "", x) };
}
export const kanalZahl = () => typ().kanaele || 2;
export const nrKanal = (w, k) => nr4((Number(w && w.nr) || 0) + ((typ().nummern || [0, 1000, 2000])[k - 1] ?? 0));

// ---------- Bearbeitungen ----------
// Drehwerkzeuge Kanal 1 (Patrick 5. November 2026): T100 bis T600. Kopf
// der Bearbeitung: Aufruf, Hochdruck (M1881D…, nur T100–T600), Drehrichtung
// mit Drehzahl und Korrektur, Anfahren auf Rohmaterial + 1 mm. Dazwischen
// der NC-Code aus den Werkzeugen von NC-PRO. Ende: Wegfahren auf
// Rohmaterial + 0.2 mm (Winkel und Vorschub einstellbar, X30. fest),
// Hochdruck aus, Korrektur aus, M1.

// Seit 1.441.0 je Maschinentyp änderbar (camTyp.js)
export const plaetzeVon = (gruppe) => typ().plaetze[gruppe] || [];
// Platzgruppe einer Bearbeitungsart: beim SB-20RG teilen sich Kanal 2
// stehend und angetrieben die Plätze, die SW-20 hat eigene (1.667.0)
export const platzGruppe = (art) => (typ().plaetze[art] ? art : art === "k2a" || art === "k2b" ? "k2" : art);
// Seit 1.582.0 (Wunsch Patrick 16. November 2026: „oben in den Kopfdaten
// soll ausgewählt werden können, ob T3400 montiert ist oder T3421–T3423,
// beides geht nicht“): w.t34 "3400" oder "3421". Seit 1.591.0 leer = T3400
// (Wunsch Patrick 17. November 2026: „bei Bestückung soll T3400 Standard sein“)
export const t34Von = (w) => (w && String(w.t34) === "3421" ? "3421" : "3400");
// SW-20 (seit 1.665.0): Frontbearbeitung nur auf Plätzen mit Frontbohrapparat (Bestückung)
const istSw = () => (typ().kanaele || 2) > 2;
export function montiert(gruppe, w) {
  const l = plaetzeVon(gruppe);
  if (istSw()) return gruppe === "front" || gruppe === "k3f" ? l.filter((p) => swFrontVon(w).includes(Number(p))) : l;
  const t = t34Von(w);
  if (gruppe === "seite" && t !== "3400") return l.filter((p) => String(p) !== "3400");
  if (gruppe === "quer" && t === "3400") return [];
  return l;
}
export function nichtMontiert(b, w) {
  const p = String(b.platz ?? ""), t = t34Von(w);
  if (istSw()) return (b.art === "front" || b.art === "k3f") && !b.frei && !swFrontVon(w).includes(Number(p));
  return (p === "3400" && t !== "3400") || (/^342[1-3]$/.test(p) && t === "3400");
}
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

export function neuerBlock(bloecke = [], art = "dreh", w = null) {
  const belegt = new Set(bloecke.map((b) => b.platz));
  const gruppe = platzGruppe(art);
  const l = w ? montiert(gruppe, w) : plaetzeVon(gruppe);
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
  if (nichtMontiert(b, w)) f.platz = "T" + b.platz + (istSw() ? " hat keinen Frontbohrapparat (Bestückung)" : " ist nicht montiert (Kopfdaten: Platz 34)");
  if (b.frei) return f;
  b = wirksamB(b); w = wirksamW(w);
  // Kanal 3 SW-20 (1.666.0)
  if (b.art === "k3f" || b.art === "k3d") {
    if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    const pflicht = b.art === "k3f" ? ["X", "anZ", "zuZ", "wegZ"] : ["vorX", "anZ", "nZ"];
    for (const n of pflicht) if (zahl(b[n]) == null) f[n] = "Zahl fehlt";
    for (const n of ["Y", "C"]) if (String(b[n] ?? "").trim() !== "" && zahl(b[n]) == null) f[n] = "Zahl oder leer";
    return f;
  }
  // Kanal 2 SW-20 (1.667.0)
  if (istSw() && (b.art === "k2" || b.art === "k2a" || b.art === "k2b")) {
    if (b.art === "k2" && b.sArt === "vc") {
      if (zahl(b.vc) == null || !(Number(zahl(b.vc)) > 0)) f.vc = "Zahl fehlt";
      if (!b.g96 && vcDurchmesser(b, w) == null) f.vcD = "Ø fehlt";
    } else if (!/^\d+$/.test(String(b.S).trim()) || Number(b.S) <= 0) f.S = "ganze Zahl";
    const pflicht = b.art === "k2" ? ["vorX", "anZ"] : b.art === "k2b" ? ["anZ"] : [];
    for (const n of pflicht) if (zahl(b[n]) == null) f[n] = "Zahl fehlt";
    if (String(b.C ?? "").trim() !== "" && zahl(b.C) == null) f.C = "Zahl oder leer";
    return f;
  }
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
  // SW-20: Front mit X, G50 Z, Y freiwillig; Drehen ohne Wegfahren
  if (istSw()) {
    if (b.art === "front") {
      if (zahl(b.X) == null) f.X = "Zahl fehlt";
      if (String(b.Y ?? "").trim() !== "" && zahl(b.Y) == null) f.Y = "Zahl oder leer";
      if (zahl(b.nZ) == null) f.nZ = "Zahl fehlt";
    }
    if (b.g96 && String(b.S ?? "").trim() !== "" && !/^\d+$/.test(String(b.S).trim())) f.S = "ganze Zahl oder leer";
    return f;
  }
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
  // Seit 1.662.0: Drehzahlbegrenzung G50S… vor G96, nur mit G96 und Wert
  const g50 = g96 && zahl(b.g50) != null && Number(zahl(b.g50)) > 0 ? String(Math.round(Number(zahl(b.g50)))) : "";
  const roh = String(b.S ?? "").trim();
  const mitVc = art === "dreh" || art === "front" || art === "frontGegen" || art === "k2";
  const S = mitVc ? drehzahl(b, w) ?? roh : roh;
  // Drehrichtung je Art: stehend M3 / M4, angetrieben M36 / M37
  const dreh = art === "k2" ? (b.dreh === "3" ? 3 : 4)
    : art === "k2a" ? (istSw() ? (b.dreh === "57" ? 57 : 56) : b.dreh === "36" ? 36 : 37)
    : art === "seite" || art === "quer" || art === "querGegen" || art === "k3f" ? (b.dreh === "37" ? 37 : 36)
    : (b.dreh === "4" ? 4 : 3);
  const mk = marke || (anGegenspindel(b) ? STANDARD_MARKEN[b.art] : null) || {};
  const g = (n) => zahl(b[n]) ?? String(b[n] ?? "");
  const platz = String(b.platz ?? "");
  const werte = {
    PLATZ: platz, TK: String(Math.floor(Number(platz) / 100)).padStart(2, "0"),
    // SW-20 (1.665.0): mit G96 vorne die eingetippte Start-Drehzahl, sonst S
    SSTART: g96 ? (/^\d+$/.test(roh) ? roh : g50) : S,
    T: Number(b.platz) / 100, T2: platz.slice(-2), T2V: platz.slice(0, 2),
    BEZ: bez, BEZ_K: bez ? "(" + bez + ")" : "", BEZ_GEGEN: mitGegen(bez), HD: String(b.hd ?? ""),
    DREH: "M" + dreh, S, G96: g96 ? "G96" : "", G50: g50, VOR: vorZeile(b),
    ANZ: g("anZ"), WEGZ: g("wegZ"), WEGF: g("wegF"),
    WINKEL: String(b.wegA ?? "").trim() === "" ? "" : ",A" + (zahl(b.wegA) ?? b.wegA),
    X: g("X"), Y: zahl(b.Y) != null ? "Y" + zahl(b.Y) : "",
    VORX: g("vorX"), VORZ: g("vorZ"), NX: g("nX"), NZ: g("nZ"),
    // Kanal 3 SW-20 (1.666.0): C, Anfahren im Vorschub, Hochdruck-Ausgang M188x
    C: g("C"), ZUZ: g("zuZ"), HDN: String(b.hdN ?? "").trim() || "3",
    M1: mk.m1 || "", M2: mk.m2 || "", M3: mk.m3 || "",
  };
  const bed = { hd: !!b.hd, hdaus: !!b.hd && !b.hdAn, g96, g50: !!g50, m38: !b.spAn, m5: !b.ohneM5, y: zahl(b.Y) != null, c: zahl(b.C) != null };
  blockEigene(b, w, werte, bed);
  const listen = {
    CODE: codeZeilen(b),
    PAARE: paarZeilen(b, 1),
    PAARE2: paarZeilen(b, 2),
    PAARE3: paarZeilen(b, 3),
  };
  return { art, werte, bed, listen };
}
// Bearbeitung „wie eingelesen“ (seit 1.561.0): der NC-Code steht
// unverändert im Programm, ohne Vorlage, im Kanal ihrer Art
const freiZeilen = (b) => String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
const freiK2 = (b) => b.art === "k2" || b.art === "k2a" || b.art === "k2b";
export function blockZeilen(b, w = {}, marke) {
  if (b.frei) return freiK2(b) || istK3(b) ? [] : freiZeilen(b);
  const x = blockWerte(b, w, marke);
  const v = typ().vorlagen[x.art + ".k1"];
  return v ? vorlageFuellen(v, { ...x, schraeg }) : [];
}

// Seit 1.666.0 Kanal 3 (SW-20): nur Bearbeitungen mit Vorlage „….k3“
export const istK3 = (b) => String((b && b.art) || "").startsWith("k3");
export function blockZeilen3(b, w = {}, marke) {
  if (b.frei) return istK3(b) ? freiZeilen(b) : [];
  const x = blockWerte(b, w, marke);
  // Seit 1.668.0: auch Bearbeitungen in Kanal 1 und 2 geben Kanal 3 die
  // Marken mit P…3 samt Feld (Vorlage „….k3“ mit {PAARE3})
  const v = typ().vorlagen[x.art + ".k3"];
  return v ? vorlageFuellen(v, { ...x, schraeg }) : [];
}
// Zeilen eines Blocks im Kanal 1, 2 oder 3
export const blockZeilenK = (b, kanal, w = {}, marke) =>
  kanal === 3 ? blockZeilen3(b, w, marke) : kanal === 2 ? blockZeilen2(b, marke, w) : blockZeilen(b, w, marke);

// Seit 1.405.0: Kanal 2 bei einem Frontwerkzeug an der Gegenspindel,
// nach Patricks O1458 (T2000, Wege in Z, G28W0.): die Gegenspindel fährt
// mit dem Teil an das feste Werkzeug, die Marke danach gibt Kanal 1 frei
// Seit 1.412.0 (Patrick 5. November 2026): an der Gegenspindel bekommt
// die Bezeichnung in beiden Kanälen „MIT GEGENSPINDEL“ angehängt
export const mitGegen = (bez) => (bez ? bez + " " : "") + "MIT GEGENSPINDEL";
export function blockZeilen2(b, marke, w = {}) {
  if (b.frei) return freiK2(b) ? freiZeilen(b) : [];
  const x = blockWerte(b, w, marke);
  const v = typ().vorlagen[x.art + ".k2"];
  return v ? vorlageFuellen(v, { ...x, schraeg }) : [];
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
// Seit 1.668.0 (SW-20, Patrick 20. November 2026: „M300P123, müssen die
// Marken in alle 3 Kanäle. M300P12 nur in Kanal 1 und 2, M300P13 nur in
// Kanal 1 und 3“): das P an der Marke sagt, welche Kanäle warten. Jedes
// Paar bekommt als dritten Wert die anderen Kanäle (ohne P wie bisher der
// andere Kanal, 1 ↔ 2), als vierten und fünften die Marken samt P, wie sie
// in die anderen Kanäle kommen. Das Feld je Kanal heisst `k1`, `k2`, `k3`.
export const eigenerKanal = (b) => (istK3(b) ? 3 : ["k2", "k2a", "k2b"].includes(b.art) || anGegenspindel(b) ? 2 : 1);
export function markeMitP(zeile) {
  const ohne = String(zeile).replace(/\([^)]*\)?/g, "").toUpperCase();
  const re = /M(\d+)(P[123]+)?/g;
  let m;
  while ((m = re.exec(ohne))) {
    const n = Number(m[1]);
    if (m[1].length <= 3 && (istMarkeNr(n) || MARKEN_K13.has(n))) return { m: "M" + n, p: m[2] ? m[2].slice(1) : "" };
  }
  return null;
}
export function markenPaare(b) {
  const m = String(b.code || "").split(/\r?\n/).map((z) => z.trim()).filter(Boolean).map(markeMitP);
  const eigen = eigenerKanal(b);
  const ziele = (x) => {
    if (!x.p) return [eigen === 1 ? 2 : 1];
    return [...new Set(x.p.split("").map(Number))].filter((k) => k !== eigen && k <= kanalZahl()).sort();
  };
  const paare = [];
  for (let i = 0; i + 1 < m.length; i++) if (m[i] && m[i + 1] && m[i].m !== m[i + 1].m) {
    paare.push([m[i].m, m[i + 1].m, ziele(m[i]), m[i].m + (m[i].p ? "P" + m[i].p : ""), m[i + 1].m + (m[i + 1].p ? "P" + m[i + 1].p : "")]);
    i++;
  }
  return paare;
}
// Zeilen für Kanal k aus den Paaren: Marke, Code aus dem Feld, Marke
export const paarZeilen = (b, k) => markenPaare(b).filter((p) => p[2].includes(k))
  .flatMap(([x, y, , xt, yt]) => [xt, ...k1Zeilen(b, x, y, "k" + k), yt]);
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
    [...Object.values(b.k1 || {}), ...Object.values(b.k2 || {}), ...Object.values(b.k3 || {})].forEach((c) => String(c).split(/\r?\n/).forEach((z) => { const m = markeVon(z); if (m) belegt.add(m); }));
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

// Seit 1.579.0 (Wunsch Patrick 16. November 2026: „Button für Wartecodes
// … in 10er-Schritten … wenn ich Bearbeitungen in ihrer Reihenfolge ändere,
// sollen die Codes neu vergeben werden, damit immer die tiefen am Anfang
// stehen und die hohen am Schluss … die Codes im Kopf und Ende nicht
// anfassen“): Marken in Kopf und Ende bleiben, ebenso Marken unter dem
// Beginn des Typs (M20, M200–M299 …) und alles in Bearbeitungen „wie
// eingelesen“; alle anderen Marken der Bearbeitungen werden der Reihe
// nach ab dem Beginn in Zehnerschritten neu vergeben. Dieselbe alte Marke
// bekommt überall dieselbe neue, damit Paare über Bearbeitungen hinweg
// zusammenbleiben. An der Gegenspindel zählen Marke Start (und Marke 2)
// vor dem NC-Code, Marke Ende danach, leere werden dabei fest gesetzt.
function kopfEndeMarken(w) {
  w = wirksamW(w);
  const k1 = kanal1(w), k2 = kanal2(w), k3 = kanal3(w);
  return new Set([...k1.kopf, ...k1.ende, ...k2.kopf, ...k2.ende, ...k3.kopf, ...k3.ende].map(markeVon).filter(Boolean));
}
// alle Marken einer Zeile (ausserhalb von Klammern) ersetzen
function markenErsetzen(zeile, fn) {
  return String(zeile).replace(/(\([^)]*\)?)|[mM](\d+)/g, (alles, kl, d) => {
    if (kl) return kl;
    if (d.length > 3 || !istMarkeNr(Number(d))) return alles;
    return fn("M" + Number(d));
  });
}
const textMarken = (t, fn) => String(t || "").split(/\r?\n/).map((z) => markenErsetzen(z, fn)).join("\n");
export function markenOrdnen(w) {
  const bloecke = w.bloecke || [];
  const { ab, schritt } = typ().marken;
  const kopfEnde = kopfEndeMarken(w);
  const fest = (m) => kopfEnde.has(m) || Number(m.slice(1)) < ab;
  const reserviert = new Set(kopfEnde);
  const sammeln = (t) => textMarken(t, (m) => { if (fest(m)) reserviert.add(m); return m; });
  bloecke.forEach((b) => {
    if (b.frei) { sammeln(b.code); return; }
    sammeln(b.code);
    [...Object.values(b.k1 || {}), ...Object.values(b.k2 || {}), ...Object.values(b.k3 || {})].forEach(sammeln);
    if (anGegenspindel(b)) [b.m1, b.m2, b.m3].map(markeNorm).filter((m) => m && fest(m)).forEach((m) => reserviert.add(m));
  });
  let n = ab;
  const naechste = () => {
    while (reserviert.has("M" + n) && n <= 999) n += schritt;
    if (n > 999) return null;
    const m = "M" + n; n += schritt; return m;
  };
  const neu = new Map();
  const zu = (m) => {
    if (fest(m)) return m;
    if (!neu.has(m)) neu.set(m, naechste() || m);
    return neu.get(m);
  };
  // leere Marke an der Gegenspindel: eigener Platz in der Reihe
  const slot = (wert) => { const m = markeNorm(wert); return m ? zu(m) : naechste() || ""; };
  const felder = (obj) => {
    if (!obj) return obj;
    const r = {};
    Object.entries(obj).forEach(([k, v]) => {
      const [x, y] = k.split("-");
      r[(x ? zu(x) : x) + "-" + (y ? zu(y) : y)] = textMarken(v, zu);
    });
    return r;
  };
  return bloecke.map((b) => {
    if (b.frei) return b;
    const r = { ...b };
    const gegen = anGegenspindel(b);
    if (gegen) { r.m1 = slot(b.m1); if (b.art === "quer") r.m2 = slot(b.m2); }
    r.code = textMarken(b.code, zu);
    if (b.k1) r.k1 = felder(b.k1);
    if (b.k2) r.k2 = felder(b.k2);
    if (b.k3) r.k3 = felder(b.k3);
    if (gegen) { if (b.art === "quer") r.m3 = slot(b.m3); else r.m2 = slot(b.m2); }
    return r;
  });
}
// freie Marken ab dem Beginn des Typs in Zehnerschritten (für die Liste)
export function freieMarken(w) {
  const { ab, schritt } = typ().marken;
  const belegt = new Set(kopfEndeMarken(w));
  const p = programme(w);
  [...p.k1, ...p.k2, ...(p.k3 || [])].forEach((z) => markenErsetzen(z, (m) => { belegt.add(m); return m; }));
  const r = [];
  for (let n = ab; n <= 999; n += schritt) if (!belegt.has("M" + n)) r.push("M" + n);
  return r;
}
// Knopf „+ Wartemarken“: zwei freie Marken nach der Zeile mit der
// Schreibmarke einsetzen, danach alles der Reihe nach neu vergeben
// Seit 1.668.0: `kanaele` (SW-20, angeklickt) gibt das P an der Marke, z.B. [1, 3] → M300P13
export function wartemarkenEinsetzen(w, id, pos, einsetzen, kanaele) {
  const frei = freieMarken(w);
  if (frei.length < 2) return null;
  const p = kanaele && kanaele.length ? "P" + [...kanaele].sort().join("") : "";
  const bloecke = (w.bloecke || []).map((b) => (b.id === id ? { ...b, code: einsetzen(b.code, [frei[0] + p, frei[1] + p], pos) } : b));
  return markenOrdnen({ ...w, bloecke });
}

// Ganze Programme je Kanal; die Bearbeitungen stehen zwischen Kopf und Ende
export function programme(w) {
  w = wirksamW(w);
  const k1 = kanal1(w), k2 = kanal2(w), k3 = kanal3(w);
  // Seit 1.398.0: je Block die Zeilen in Kanal 1 (von–bis, ab 1), damit
  // die Anzeige die angewählte Bearbeitung hervorheben kann
  const bereiche = {}, bereiche2 = {}, bereiche3 = {};
  const bloecke = w.bloecke || [];
  const marken = markenVergeben(bloecke, [...k1.kopf, ...k1.ende, ...k2.kopf, ...k2.ende, ...k3.kopf, ...k3.ende]);
  let ab = k1.kopf.length, ab2 = k2.kopf.length, ab3 = k3.kopf.length;
  const bearb2 = [], bearb3 = [];
  const her3 = k3.kopf.map(() => "kopf");
  // Seit 1.624.0: Herkunft je Zeile, „kopf“ (Programmkopf und -ende),
  // „vorlage“ (feste Zeilen der Bearbeitung) oder „code“ (aus den Feldern
  // der Bearbeitung), Wunsch Patrick 18. November 2026
  const her1 = k1.kopf.map(() => "kopf"), her2 = k2.kopf.map(() => "kopf");
  const bearb1 = bloecke.flatMap((b) => {
    // Kanal 3 (1.666.0): eigene Bearbeitungen zwischen Kopf und Ende von Kanal 3
    // seit 1.668.0 geben alle Bearbeitungen jedem Kanal ihre Zeilen
    // (Kanal 3 auch die Marken mit P…3 aus Kanal 1 und 2)
    const z3 = blockZeilen3(b, w, marken[b.id]);
    if (z3.length || istK3(b)) {
      her3.push(...herkunft(b, z3, 3, w, marken[b.id]));
      bereiche3[b.id] = [ab3 + 1, ab3 + z3.length];
      ab3 += z3.length;
      bearb3.push(...z3);
    }
    const z = blockZeilen(b, w, marken[b.id]);
    if (z.length || !istK3(b)) {
      her1.push(...herkunft(b, z, 1, w, marken[b.id]));
      bereiche[b.id] = [ab + 1, ab + z.length];
      ab += z.length;
    }
    // Seit 1.416.0: Markenpaare im Code von Kanal 1 geben Kanal 2 die
    // Marken mit dem Code aus dem Feld dazwischen
    // (seit 1.441.0 auch das über die Vorlage der Art für Kanal 2)
    const z2 = blockZeilen2(b, marken[b.id], w);
    if (z2.length) {
      her2.push(...herkunft(b, z2, 2, w, marken[b.id]));
      bereiche2[b.id] = [ab2 + 1, ab2 + z2.length];
      ab2 += z2.length;
      bearb2.push(...z2);
    }
    return z;
  });
  her1.push(...k1.ende.map(() => "kopf")); her2.push(...k2.ende.map(() => "kopf"));
  return {
    bereiche, bereiche2, bereiche3, marken, her1, her2,
    her3: [...her3, ...k3.ende.map(() => "kopf")],
    k1: [...k1.kopf, ...bearb1, ...k1.ende],
    k2: [...k2.kopf, ...bearb2, ...k2.ende],
    k3: [...k3.kopf, ...bearb3, ...k3.ende],
    nr1: nrKanal(w, 1), nr2: nrKanal(w, 2), nr3: nrKanal(w, 3),
  };
}

// Kanäle nebeneinander: gleiche Marken auf dieselbe Zeile, dazwischen
// Leerzeilen. Gepaart wird über die längste gemeinsame Folge der Marken;
// eine Marke ohne Gegenstück in einem anderen Kanal bleibt allein (fehler).
// Seit 1.663.0 für zwei oder drei Kanäle (SW-20): die Marken werden Kanal
// für Kanal in eine gemeinsame Folge gelegt; was in mindestens zwei Kanälen
// steht, kommt auf eine Zeile, ein Kanal ohne diese Marke läuft weiter.
function lcsPaare(a, b) {
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const p = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { p.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return p;
}
export function synchronisieren(...listen) {
  const kan = listen.map((z, k) => (Array.isArray(z) ? k : -1)).filter((k) => k >= 0);
  const zl = (k) => listen[k];
  // gemeinsame Folge: [{ m, at: {k: i} }]
  let folge = [];
  for (const k of kan) {
    const mk = [];
    zl(k).forEach((z, i) => { const m = markeVon(z); if (m) mk.push({ i, m }); });
    const paare = lcsPaare(folge.map((e) => e.m), mk.map((x) => x.m));
    const neu = [];
    let a = 0, b = 0;
    for (const [pa, pb] of [...paare, [folge.length, mk.length]]) {
      while (a < pa) neu.push(folge[a++]);
      while (b < pb) { neu.push({ m: mk[b].m, at: { [k]: mk[b].i } }); b++; }
      if (pa < folge.length) { neu.push({ ...folge[pa], at: { ...folge[pa].at, [k]: mk[pb].i } }); a = pa + 1; b = pb + 1; }
    }
    folge = neu;
  }
  const anker = folge.filter((e) => Object.keys(e.at).length >= 2);
  const gepaart = {};
  kan.forEach((k) => { gepaart[k] = new Set(); });
  anker.forEach((e) => Object.entries(e.at).forEach(([k, i]) => gepaart[k].add(i)));
  const zelle = (k, i) => {
    const m = markeVon(zl(k)[i]);
    return { text: zl(k)[i], nr: i + 1, marke: m, fehler: !!m && !gepaart[k].has(i) };
  };
  const reihen = [];
  const pos = {};
  kan.forEach((k) => { pos[k] = 0; });
  const leer = () => { const r = {}; kan.forEach((k) => { r["k" + (k + 1)] = null; }); return r; };
  const abschnitt = (bis) => {
    const n = Math.max(...kan.map((k) => bis[k] - pos[k]));
    for (let j = 0; j < n; j++) {
      const r = leer();
      kan.forEach((k) => { const i = pos[k] + j; if (i < bis[k]) r["k" + (k + 1)] = zelle(k, i); });
      reihen.push(r);
    }
    kan.forEach((k) => { pos[k] = bis[k]; });
  };
  // Seit 1.670.0: ein Kanal, für den eine Marke nicht gilt (z.B. Kanal 2
  // bei M420P13), läuft daneben weiter bis zu seiner nächsten eigenen
  // Marke, statt mit leeren Zeilen auf die anderen zu warten (Patrick
  // 20. November 2026: „warum macht kanal 2 nichts bis m420P13?“)
  const naechste = (ai, k) => {
    for (let j = ai; j < anker.length; j++) if (k in anker[j].at) return anker[j].at[k];
    return zl(k).length;
  };
  anker.forEach((e, ai) => {
    const drin = kan.filter((k) => k in e.at);
    const n = Math.max(0, ...drin.map((k) => e.at[k] - pos[k]));
    const bis = {};
    kan.forEach((k) => { bis[k] = k in e.at ? e.at[k] : Math.min(pos[k] + n, naechste(ai, k)); });
    abschnitt(bis);
    const r = { ...leer(), sync: true, syncK: new Set(drin.map((k) => k + 1)) };
    Object.entries(e.at).forEach(([k, i]) => { r["k" + (Number(k) + 1)] = zelle(Number(k), i); pos[k] = i + 1; });
    kan.forEach((k) => { if (!(k in e.at) && pos[k] < naechste(ai, k)) { r["k" + (k + 1)] = zelle(k, pos[k]); pos[k]++; } });
    reihen.push(r);
  });
  const ende = {};
  kan.forEach((k) => { ende[k] = zl(k).length; });
  abschnitt(ende);
  const fehler = reihen.reduce((n, r) => n + kan.reduce((m, k) => m + (r["k" + (k + 1)]?.fehler ? 1 : 0), 0), 0);
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
  const r1 = handAnwenden(p.k1, h.k1), r2 = handAnwenden(p.k2, h.k2), r3 = handAnwenden(p.k3, h.k3);
  // Seit 1.541.0: Abweichungen, die so aus einem eingelesenen Programm
  // stammen, violett statt gelb (danach von Hand Geändertes bleibt gelb)
  // Seit 1.544.0 gelten Leerzeilen nie als Abweichung (Patrick 14. November
  // 2026: „du musst leerzeilen, nicht als differenz anzeigen“)
  const ohneLeer = (set, z) => new Set([...set].filter((i) => String(z[i] ?? "").trim() !== ""));
  const ein1 = ohneLeer(ausEingelesen(r1, h.k1), r1.zeilen), ein2 = ohneLeer(ausEingelesen(r2, h.k2), r2.zeilen);
  const ein3 = ohneLeer(ausEingelesen(r3, h.k3), r3.zeilen);
  return { ...p, auto1: p.k1, auto2: p.k2, auto3: p.k3, k1: r1.zeilen, k2: r2.zeilen, k3: r3.zeilen,
    her1: herkunftMitHand(p.k1, r1.zeilen, p.her1), her2: herkunftMitHand(p.k2, r2.zeilen, p.her2),
    her3: herkunftMitHand(p.k3, r3.zeilen, p.her3),
    gelb1: ohneLeer(ohne(r1.gelb, ein1), r1.zeilen), gelb2: ohneLeer(ohne(r2.gelb, ein2), r2.zeilen), ein1, ein2,
    gelb3: ohneLeer(ohne(r3.gelb, ein3), r3.zeilen), ein3,
    verloren1: r1.verloren, verloren2: r2.verloren, verloren3: r3.verloren };
}
const ohne = (a, b) => new Set([...a].filter((i) => !b.has(i)));
// Seit 1.618.1 (Patrick 17. November 2026: „du machst in der simulation
// nicht was im nc code steht … g0x16.0 obwohl es nicht im programm steht“):
// die Zeilen einer Bearbeitung so, wie sie im Programmfenster stehen, also
// mit Handänderungen. bereich = [von, bis] ab 1 im erzeugten Programm auto;
// über die gleichen Zeilen von auto und mit findet es Anfang und Ende dort.
export function bereichMitHand(auto, mit, bereich) {
  const l = bereichLage(auto, mit, bereich);
  return l ? mit.slice(l[0], l[1] + 1) : null;
}
// Seit 1.669.0: Lage [von, bis] (ab 0) des Bereichs im Programm mit
// Handänderungen, für die Simulation der SW-20 (M131 / M133 davor)
export function bereichLage(auto, mit, bereich) {
  if (!bereich) return null;
  if (auto === mit || auto.length === mit.length && auto.every((z, i) => z === mit[i])) return [bereich[0] - 1, bereich[1] - 1];
  const zu = new Map(gleicheZeilen(auto, mit));
  const a = bereich[0] - 1, b = bereich[1] - 1;
  let von = zu.get(a);
  if (von === undefined) {
    let k = a - 1; while (k >= 0 && !zu.has(k)) k--;
    von = k >= 0 ? zu.get(k) + 1 : 0;
  }
  let bis = zu.get(b);
  if (bis === undefined) {
    let k = b + 1; while (k < auto.length && !zu.has(k)) k++;
    bis = k < auto.length ? zu.get(k) - 1 : mit.length - 1;
  }
  return bis >= von ? [von, bis] : [von, von - 1];
}

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
  // Seit 1.663.0 je Maschinentyp: SB-20RG O0nnn / O1nnn, SW-20 O1nnn / O2nnn / O3nnn
  const nn = typ().nummern || [0, 1000];
  let kanal = 0, nr = 0;
  nn.forEach((b, k) => { if (o - b >= 1 && o - b <= 999) { kanal = k + 1; nr = o - b; } });
  if (!kanal) return { fehler: "O" + o + " passt nicht zu " + typ().name + " (" + nn.map((b) => "O" + nr4(b + 1) + "–O" + nr4(b + 999)).join(", ") + ")" };
  const felder = { nr: String(nr) };
  if (kanal === 1) {
    const name = oZeile.match(/\(([^)]*)\)/);
    if (name && name[1].trim()) felder.hoco = name[1].trim();
    const g170 = zeilen.map((z) => z.match(/^G170\(([^)]*)\)/i)).find(Boolean);
    if (g170) {
      const t = g170[1].trim().split(/\s+/);
      if (t.length > 1 && /^[A-Za-zÄÖÜäöü]{1,4}$/.test(t[t.length - 1])) felder.kuerzel = t.pop();
      felder.datum = t.join(" ");
    } else {
      // SW-20: Datum und Kürzel als Kommentar unter der O-Zeile, „(10.02.2026 T.ECKER)“
      const dk = zeilen.map((z) => z.trim().match(/^\((\d{1,2}\.\d{1,2}\.\d{2,4})\s*([^)]*)\)$/)).find(Boolean);
      if (dk) { felder.datum = dk[1]; if (dk[2].trim()) felder.kuerzel = dk[2].trim(); }
    }
    const g266 = zeilen.find((z) => /^G266/i.test(z.trim()));
    if (g266) for (const m of g266.trim().slice(4).matchAll(/([AWSXZFB])([-+]?[\d.]+|#\d+)/gi)) felder[m[1].toUpperCase()] = m[2];
  }
  return { kanal, nr, zeilen, felder };
}

// Neue Handfassung eines Kanals: basis = jetzt erzeugt, hand = angezeigt
// und geändert; gleich wie erzeugt = keine Handänderung mehr
// Herkunft der Zeilen eines Blocks: NC-Code über codeLage, die Felder für
// den anderen Kanal (Markenpaare) über einen Platzhalter je Zeile
function herkunft(b, gen, kanal, w, marke) {
  const her = gen.map(() => "vorlage");
  const lage = codeLage(b, gen, kanal, w, marke);
  if (lage) for (let i = lage.k; i < lage.k + lage.n; i++) her[i] = "code";
  if (!b.frei && (b.k1 || b.k2 || b.k3)) {
    const platz = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v).split(/\r?\n/).map((z) => (z.trim() ? "\u0002" : "")).join("\n")]));
    const b2 = { ...b, k1: platz(b.k1), k2: platz(b.k2), k3: platz(b.k3) };
    const s = blockZeilenK(b2, kanal, w, marke);
    if (s.length === gen.length) s.forEach((z, i) => { if (String(z).includes("\u0002")) her[i] = "code"; });
  }
  return her;
}
// Herkunft auf die angezeigten Zeilen (mit Handänderungen) übertragen;
// eine von Hand eingefügte Zeile nimmt die Herkunft der Zeile davor
function herkunftMitHand(auto, mit, her) {
  if (auto === mit) return her;
  const zu = new Map(gleicheZeilen(auto, mit).map(([a, m]) => [m, a]));
  let vorher = "kopf";
  return mit.map((_, j) => { const a = zu.get(j); if (a !== undefined) vorher = her[a]; return vorher; });
}
// Seit 1.619.0 (Patrick 17. November 2026: „es steht in der bearbeitung,
// aber nicht im programm, weil ich es von hand gelöscht habe. du musst auch
// vom programm zurück in die bearbeitung anpassen“): eine Änderung im
// Programmfenster, die im NC-Code einer Bearbeitung liegt, kommt in deren
// Feld NC-Code; nur was in den festen Zeilen der Vorlage geändert ist, bleibt
// eine Handänderung (gelb). Ergebnis: { hand, bloecke } (bloecke nur, wenn
// sich ein NC-Code geändert hat).
export function handZurueck(w, kanal, zeilen) {
  const wv = wirksamW(w);
  const bloecke = w.bloecke || [];
  const p = programme(w);
  const auto = kanal === 1 ? p.k1 : kanal === 2 ? p.k2 : p.k3;
  const ber = kanal === 1 ? p.bereiche : kanal === 2 ? p.bereiche2 : p.bereiche3;
  let geaendert = false;
  const neuBl = bloecke.map((b) => {
    const r = bereichMitHand(auto, zeilen, ber[b.id]);
    if (!r) return b;
    const gen = blockZeilenK(b, kanal, wv, p.marken[b.id]);
    const lage = codeLage(b, gen, kanal, wv, p.marken[b.id]);
    if (!lage) return b;
    const code = codeAusBereich(gen, lage.k, lage.n, r);
    if (!code) return b;
    const roh = lage.schraeg ? code.map((z) => (z.startsWith("/") ? z.slice(1) : z)) : code;
    const alt = codeZeilen(b);
    if (roh.length === alt.length && roh.every((z, i) => z.trim() === alt[i])) return b;
    geaendert = true;
    return { ...b, code: roh.join("\n") };
  });
  if (!geaendert) return { hand: handNeu(w, kanal, auto, zeilen) };
  const w2 = { ...w, bloecke: neuBl };
  const p2 = programme(w2);
  return { hand: handNeu(w2, kanal, kanal === 1 ? p2.k1 : kanal === 2 ? p2.k2 : p2.k3, zeilen), bloecke: neuBl };
}
// Wo im erzeugten Block der NC-Code steht: { k: erste Zeile, n: Anzahl, schraeg }
function codeLage(b, gen, kanal, w, marke) {
  if (b.frei) return gen.length ? { k: 0, n: gen.length, schraeg: false } : null;
  const c = codeZeilen(b);
  if (!c.length) {
    const s = blockZeilenK({ ...b, code: "\u0001" }, kanal, w, marke);
    const k = s.findIndex((z) => String(z).includes("\u0001"));
    return k < 0 ? null : { k, n: 0, schraeg: String(s[k]).startsWith("/") };
  }
  const passt = (k, liste) => liste.every((z, i) => gen[k + i] === z);
  const sch = c.map(schraeg);
  for (let k = 0; k + c.length <= gen.length; k++) {
    if (passt(k, c)) return { k, n: c.length, schraeg: false };
    if (passt(k, sch)) return { k, n: c.length, schraeg: true };
  }
  return null;
}
// Zeilen im Programmfenster r, die dem NC-Code gen[k, k+n) entsprechen.
// Zeilen davor und danach (feste Zeilen der Vorlage) werden über die gleichen
// Zeilen zugeordnet; eine geänderte feste Zeile gleich neben dem Code bleibt
// bei den festen Zeilen.
function codeAusBereich(gen, k, n, r) {
  const zu = new Map(gleicheZeilen(gen, r));
  let gPre = k - 1; while (gPre >= 0 && !zu.has(gPre)) gPre--;
  const rPre = gPre >= 0 ? zu.get(gPre) : -1, n1 = k - 1 - gPre;
  let gPost = k + n; while (gPost < gen.length && !zu.has(gPost)) gPost++;
  const rPost = gPost < gen.length ? zu.get(gPost) : r.length, n0 = gPost - (k + n);
  if (rPost <= rPre) return null;
  const m = r.slice(rPre + 1, rPost);
  const treffer = [];
  for (let g = k; g < k + n; g++) if (zu.has(g)) treffer.push(zu.get(g) - rPre - 1);
  let vorne, hinten;
  if (treffer.length) { vorne = Math.min(n1, treffer[0]); hinten = Math.min(n0, m.length - 1 - treffer[treffer.length - 1]); }
  else { vorne = Math.min(n1, m.length); hinten = Math.min(n0, m.length - vorne); }
  return m.slice(vorne, m.length - hinten).map((z) => String(z).trim()).filter(Boolean);
}
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
// Seit 1.654.3 (Patrick 19. November 2026): im Bild mit T3400 sind die vier
// Frontwerkzeuge zur Hauptspindel sichtbar, Rücken an Rücken zu denen der
// Gegenspindel, gleiche Höhe; seit 1.654.5 kommen sie hinten aus dem Block,
// der Block verdeckt ihr Ende (Patrick)
const ZUR_HAUPT_FRONT = [[316, 256, 36, 20], [316, 236, 36, 19], [316, 216, 36, 19], [316, 195, 36, 19]];
const ZUR_GEGEN_QUER = [[362, 285, 40, 14], [362, 262, 40, 14], [362, 239, 40, 14]];
const ZUR_HAUPT_QUER = [[300, 255, 32, 17], [300, 233, 32, 17], [300, 209, 32, 17]];
const QUER = [[255, 195, 15, 40], [269, 195, 15, 40], [284, 193, 16, 38], [298, 181, 16, 38]];
// Kanal 2 T2100–T2400 von rechts (Patrick 5. November 2026)
const KANAL2 = [[145, 354, 43, 35], [127, 364, 41, 35], [109, 374, 39, 35], [93, 383, 40, 35]];
const r4 = (a, text, verdeckt) => ({ x: a[0], y: a[1], w: a[2], h: a[3], text, verdeckt: !!verdeckt });
// Seit 1.664.0 (Patrick 20. November 2026): Bild der SW-20 (public/hilfe/
// star-sw20.png, 603 × 637) mit den Plätzen je Block aus dem Handbuch
// Kapitel 8 („T-Befehle je PATH“): Kanal 1 Platten T100–T400 (unten nach
// oben), angetrieben quer T500–T700; Kanal 3 Platten T1100–T1200,
// angetrieben quer T1300–T1500, Frontbohrapparat fest T1600–T1900;
// Kanal 2 Rückseiteneinheit oben T2400–T2100, unten T2800–T2500 (von
// links). Lage von Claude geschätzt, Patrick: „wir können immer noch
// korrigieren“
export const SW20_BILD = { datei: "hilfe/star-sw20.png", b: 603, h: 637 };
const SW20_FLAECHEN = {
  100: [228, 393, 34, 15], 200: [228, 377, 34, 15], 300: [228, 361, 34, 15], 400: [228, 345, 34, 15],
  500: [233, 296, 28, 21], 600: [233, 275, 28, 20], 700: [233, 255, 28, 20],
  1100: [325, 299, 38, 16], 1200: [325, 277, 38, 16],
  1300: [335, 238, 30, 17], 1400: [333, 206, 45, 18], 1500: [333, 190, 45, 15],
  1600: [340, 131, 40, 19], 1700: [340, 111, 40, 19], 1800: [340, 91, 40, 19], 1900: [340, 71, 40, 19],
};
[2400, 2300, 2200, 2100].forEach((p, i) => { SW20_FLAECHEN[p] = [160 + 25 * i, 485, 26, 50]; });
[2800, 2700, 2600, 2500].forEach((p, i) => { SW20_FLAECHEN[p] = [160 + 25 * i, 537, 26, 50]; });
// Plätze, auf denen statt des querangetriebenen Werkzeugs der
// Frontbohrapparat sitzen kann (Handbuch: T500, T600, T1300–T1500; T700
// laut Handbuch nur Schlitzapparat, Patrick nannte auch T700)
export const SW20_FRONT_PLAETZE = [500, 600, 1300, 1400, 1500];
export const SW20_KANAL_PLAETZE = {
  1: [100, 200, 300, 400, 500, 600, 700],
  3: [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900],
  2: [2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800],
};
// Seit 1.670.0 (Wunsch Patrick 20. November 2026: „wenn Frontbohrapparate
// montiert sind, sollst du sie im Bild auch so anzeigen“): je Platz die
// Fläche, die das querangetriebene Werkzeug im Bild überdeckt (deck), und
// wo der Frontbohrapparat sitzt (bei); er zeigt wie die festen
// Frontwerkzeuge T1600–T1900 in Richtung Z (SW20_FRONT_RICHTUNG)
export const SW20_FRONT_BILD = {
  500: { deck: [243, 293, 40, 22], bei: [240, 303] },
  600: { deck: [243, 272, 32, 20], bei: [240, 283] },
  1300: { deck: [326, 240, 27, 18], bei: [350, 250] },
  1400: { deck: [326, 206, 35, 21], bei: [356, 216] },
  1500: { deck: [326, 189, 35, 18], bei: [356, 198] },
};
export const SW20_FRONT_RICHTUNG = [0.78, 0.62];
// Bestückung: Liste der Plätze mit Frontbohrapparat in w.swFront
export function swFrontVon(w) {
  const l = Array.isArray(w && w.swFront) ? w.swFront.map(Number) : [];
  return SW20_FRONT_PLAETZE.filter((p) => l.includes(p));
}
export function sw20Bereich(platz, w) {
  const p = Number(platz);
  const a = SW20_FLAECHEN[p];
  if (!a) return null;
  let text;
  if (p <= 400) text = p === 100 ? "Kanal 1 · Abstechen" : "Kanal 1 · Drehwerkzeug";
  else if (p <= 700) text = "Kanal 1 · " + (swFrontVon(w).includes(p) ? "Frontbohrapparat" : "angetrieben quer");
  else if (p <= 1200) text = "Kanal 3 · Drehwerkzeug";
  else if (p <= 1500) text = "Kanal 3 · " + (swFrontVon(w).includes(p) ? "Frontbohrapparat" : "angetrieben quer");
  else if (p <= 1900) text = "Kanal 3 · Frontbohrapparat fest";
  else text = "Kanal 2 · Rückseite " + (p === 2400 || p === 2800 ? "fest" : "fest oder angetrieben");
  return r4(a, text);
}
export function bildBereich(b, t34) {
  const p = Number(b.platz);
  if (b.art === "k2" || b.art === "k2a") return r4(KANAL2[Math.max(0, Math.min(3, Math.round(p / 100) - 21))], "Kanal 2");
  if (b.art === "seite") {
    const i = Math.round(p / 100) - 31;
    // T3400 ist seit 1.654.1 im Bild mit T3400 als viertes Werkzeug gezeichnet
    // (Patrick 19. November 2026), im anderen Bild ist es nie montiert.
    return r4(QUER[Math.max(0, Math.min(3, i))], "querangetrieben");
  }
  const gegen = anGegenspindel(b);
  if (b.art === "quer") {
    const i = Math.max(0, Math.min(2, p - 3421));
    return gegen ? r4(ZUR_GEGEN_QUER[i], "zur Gegenspindel") : r4(ZUR_HAUPT_QUER[i], "zur Hauptspindel");
  }
  if (b.art === "front") {
    const i = Math.max(0, Math.min(3, Math.round(p / 100) - 11));
    return gegen ? r4(ZUR_GEGEN_FRONT[i], "zur Gegenspindel") : (t34 === "3400" ? r4(ZUR_HAUPT_FRONT[i], "zur Hauptspindel") : r4([333, 205, 28, 95], "zur Hauptspindel (verdeckt)", true));
  }
  const i = Math.max(0, Math.min(5, Math.round(p / 100) - 1));
  const [x, y] = PLATTEN[i];
  return r4([x - 11, y - 95, 22, 100], "Werkzeugplatten");
}

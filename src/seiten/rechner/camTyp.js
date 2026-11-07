// =================================================================
//  HOFERCAM: Einstellungen je Maschinentyp
//  Seit 1.441.0 (Wunsch Patrick 6. November 2026: „pro Maschinentyp eine
//  Konfigurationsoberfläche, bei welcher ich selber Änderungen vornehmen
//  kann“, „ich will alles, was du gemacht hast, ändern können“). Zuerst
//  nur Star SB-20RG, weitere Typen später als Kopie.
//
//  Alles, was HOFERCAM schreibt, steht hier als Vorlage in Textform:
//  Kopf und Ende beider Kanäle und je Bearbeitungsart die Zeilen in
//  Kanal 1 und Kanal 2. Die Vorgaben geben genau das aus, was vorher fest
//  im Code stand (Prüfstand hofer_cam_typ.py vergleicht beides).
//
//  Schreibweise einer Vorlage, eine Programmzeile je Zeile:
//    {NAME}        Platzhalter, die App setzt den Wert ein
//    [hd] …        Zeile nur, wenn die Bedingung gilt; [!hd] nur, wenn nicht
//    {CODE}        allein auf der Zeile: der NC-Code der Bearbeitung
//    /{CODE}       ebenso, jede Zeile mit „/“ davor (Marken ohne)
//    {PAARE}       allein auf der Zeile: Markenpaare aus dem NC-Code mit
//                  dem Code aus dem Feld „Kanal 1 zwischen …“ dazwischen
//    {PAARE2}      ebenso mit dem Feld „Kanal 2 zwischen …“
//  Leere Zeilen fallen weg.
//
//  Gespeichert werden nur die Abweichungen von der Vorgabe, in
//  app_config.hofercam_typen = { "<typ>": { vorlagen, plaetze, vorgaben,
//  bloecke, marken } }; Vorgaben, die später im Code dazukommen, gelten so
//  von selbst.
// =================================================================

export const TYP = "star-sb20rg";
export const TYP_NAME = "Star SB-20RG";
export const CONFIG_SCHLUESSEL = "hofercam_typen";

// ---------- Vorgaben (Stand 1.440.0, Patricks O0458 / O1458) ----------
const V = {
  k1kopf: `%
O{NR}{NAME}
G40G97M9G18
G170({DATUM_KUERZEL})
(GRUNDVARIABLEN DEFINIEREN)
G266A{A}W{W}S{S}X{X}Z{Z}F{F}B{B}
(A = #531 = MATERIALDURCHMESSER)
(W = #530 = TEILELAENGE)
(S = #529 = ABSTECHDREHZAHL)
(X = #524 = ABSTECHENDPOSITION)
(Z = #525 = Z-ACHSE STARTPOSITION 200MM.MAX)
(F = #522 = VORSCHUB ABSTECHEN)
(B = #528 = BREITE DES ABSTECHSTAHLS)
#510=[#531+1.](#510 = WEG-/ANFAHRPOSITION)
G300
G125
N1
G18
G170
G40G97M9
G99M3S500
M11
G4U0.1
G125
G0Z{SCHLICHT}T0(SCHLICHTZUGABE)
M10
G4U0.1
G1W-0.2F0.5
M5
N12
M200
M20
M25
M3S1000
G0X[#531+4.]Z-12.
M27
M1
(Ende Kopf)`,
  k1ende: `(Start Ende)
T100(ABSTECHEN)
M25
M1891(HD AUS)
M1882D5
N100
M800
G97M3S#529
G00G99X#510Z[#530+#528]T1
G0W{PLAN}(ZUGABE PLANDREHEN HINTEN)
M82
M40
G96
G50S4000
M3S80
G1X#524F#522
M1894
M1892
M41
G4
M83
M3S500
M80(CONTROLLIERT STANGENENDE SIGNAL VOM LADER)
/M98P7000
M81(ENDE M80)
M99P1(GEHEN AUF PROGRAMMANFANG POS N1)
%`,
  k2kopf: `%
O{NR2}{NAME}
G130
G97G99G40
G18
M5
G28W0
T0
T2000
M200
M20
M5(SPINDEL STOP)
(Ende Kopf)`,
  k2ende: `(Start Ende)
M75
/T2900(AUSWERFEN)
/M84
/M4S200
/G0Z38.
/G4U1.
/M11
/G4U2.
/G28W0.
M1884D2
M76
T0
M1
T2000(ABGREIFEN)
M11
M14
M5
G900J50
T2000
M800
M1894
M1883D3(HD EIN)
M82
G131B0.
M15
G0Z{ANNAEHERN}(EILGANG {ANNAEHERN_MM}MM VOR STUCK)
M68
G1G98Z{UEBER}F5000.({UEBER_MM}MM UBER DEM STUCK)
M69
M1893(HD AUS)
M10
G4U0.1
G31
M40
M41
M83
M68
M69
G28W0
G0T0
G99
M99
%`,
  "dreh.k1": `T{PLATZ}{BEZ_K}
[hd] M1881D{HD}
{G96}{DREH}S{S}T{T}
{VOR}
G0X[#531+1.]Z{ANZ}
{CODE}
G1X[#531+0.2]{WINKEL}F{WEGF}
G0X30.
[hdaus] M1891
[g96] G97
G99
T0
M1`,
  "dreh.k2": `{PAARE2}`,
  "front.k1": `T{PLATZ}{BEZ_K}
[hd] M1882D{HD}
{G96}{DREH}S{S}T{T}
{VOR}
G0Z{ANZ}
{CODE}
[hdaus] M1892
G0Z{WEGZ}
[g96] G97
G99
T0
M1`,
  "front.k2": `{PAARE2}`,
  "frontGegen.k1": `T{PLATZ}({BEZ_GEGEN})
[hd] M1882D{HD}
T{T}
{M1}
{PAARE}
{M2}
[hdaus] M1892
T0
M1`,
  "frontGegen.k2": `M75
/T2000({BEZ_GEGEN})
{M1}
/{G96}{DREH}S{S}
/{VOR}
/G0Z{ANZ}
/{CODE}
/G0Z{WEGZ}
[g96] /G97
/G99
{M2}
G0G28W0.
T0
M1`,
  "seite.k1": `T{PLATZ}{BEZ_K}
[hd] M1883D{HD}
G0T{T}
{DREH}S{S}
G0X[#531+1.]Z{ANZ}
{VOR}
M8
M7
G0
G28H0.
G1Y0.C0.F1.
{CODE}
G0X30.
G0Y0.
[hdaus] M1893
T0
[m38] M38
M9
G99
T0
M1`,
  "seite.k2": `{PAARE2}`,
  "quer.k1": `T{PLATZ}{BEZ_K}
[hd] M1883D{HD}
{DREH}S{S}T{T2}
{VOR}
G0Z{ANZ}
{CODE}
[hdaus] M1893
G0Z{WEGZ}
[m38] M38
G99
T0
M1`,
  "quer.k2": `{PAARE2}`,
  "querGegen.k1": `T{PLATZ}({BEZ_GEGEN})
[hd] M1883D{HD}
{M1}
G0X{X}{Y}T{T2}
{M2}
{PAARE}
{M3}
[hdaus] M1893
T0
M1`,
  "querGegen.k2": `M75
/T2000({BEZ_GEGEN})
/{VOR}
/M8
/M7
/G0
/G28H0.
/M6
{M1}
{M2}
/{DREH}S{S}
/G0Z{ANZ}
/{CODE}
/G1Z{ANZ}F2000
/G0Z20.
[m38] /M38
/G99
G0G28W0.
T0
M1
{M3}`,
  "k2.k1": `{PAARE}`,
  "k2.k2": `M75
[hd] /M1884D{HD}
/T{PLATZ}{BEZ_K}
/G23
/{G96}{DREH}S{S}T{T2V}
/{VOR}
/G0X{VORX}
/G0Z{VORZ}
/G50X{NX}Z{NZ}
/G1Z-1.F0.5
/G1X-11.
/{CODE}
/G1Z{NZ}F0.5
/G1X{NX}
/G50Z{VORZ}X{VORX}
/G0Z20.0
/G0X0.0
[g96] /G97
/G99
G28W0.0
M76
[hdaus] M1894
G22
T0
M1
[m5] M5`,
  "k2a.k1": `{PAARE}`,
  "k2a.k2": `M75
[hd] /M1884D{HD}
/T{PLATZ}{BEZ_K}
/{DREH}S{S}
/{VOR}
/M8
/M7
/G0
/G28H0.
/M6
/{CODE}
G28W0.
T0
/M7
[m38] /M38
/M9
/G99
M76
[hdaus] M1894
M1`,
};

// Bearbeitungsarten in der Reihenfolge der Knöpfe; `art` und `spindel`
// am Block bestimmen die Vorlage (Gegenspindel hat eigene)
export const ARTEN = [
  { id: "dreh", text: "Drehwerkzeug", plaetze: "dreh" },
  { id: "front", text: "Frontwerkzeug, Hauptspindel", plaetze: "front" },
  { id: "frontGegen", text: "Frontwerkzeug, Gegenspindel", plaetze: "front" },
  { id: "seite", text: "Querangetrieben", plaetze: "seite" },
  { id: "quer", text: "Frontangetrieben, Hauptspindel", plaetze: "quer" },
  { id: "querGegen", text: "Frontangetrieben, Gegenspindel", plaetze: "quer" },
  { id: "k2", text: "Kanal 2 stehende Werkzeuge", plaetze: "k2" },
  { id: "k2a", text: "Kanal 2 angetrieben", plaetze: "k2" },
];
export const vorlageArt = (b) => ((b.art === "front" || b.art === "quer") && b.spindel === "gegen" ? b.art + "Gegen" : b.art || "dreh");

// Werkzeugplätze je Knopf; Kanal 2 stehend und angetrieben teilen sich die Plätze
export const PLATZ_GRUPPEN = [
  { id: "dreh", text: "Drehwerkzeuge Kanal 1" },
  { id: "front", text: "Frontwerkzeuge fest" },
  { id: "seite", text: "Querangetrieben" },
  { id: "quer", text: "Frontangetrieben" },
  { id: "k2", text: "Kanal 2" },
];
const PLAETZE = {
  dreh: ["100", "200", "300", "400", "500", "600"],
  front: ["1100", "1200", "1300", "1400"],
  seite: ["3100", "3200", "3300", "3400"],
  quer: ["3421", "3422", "3423"],
  k2: ["2100", "2200", "2300", "2400"],
};

// Vorgaben der Felder oben (Programm) und je neue Bearbeitung
const VORGABEN = { A: "17", W: "15.125", S: "3000", X: "-0.8", Z: "167.85", F: "0.03", B: "1.5",
  schlicht: "-0.1", plan: "0.20", annaehern: "10", ueber: "4" };
const BLOECKE = {
  dreh: { hd: "4", dreh: "3", S: "3000", anZ: "0", wegF: "0.05", wegA: "45" },
  front: { hd: "4", dreh: "3", S: "2500", anZ: "5.0", wegZ: "0" },
  seite: { hd: "3", dreh: "36", S: "6000", anZ: "0" },
  quer: { hd: "3", dreh: "36", S: "6000", X: "", anZ: "5.0", wegZ: "0" },
  k2: { hd: "3", dreh: "4", S: "2500", vorX: "-45.4", vorZ: "61.40", nX: "-10", nZ: "-0.5" },
  k2a: { hd: "", dreh: "37", S: "6000", vor: "98" },
};
// Beschriftung der Felder je Bearbeitung im Fenster
export const BLOCK_FELDER = {
  hd: "Hochdruck-Stufe (leer = kein)", dreh: "Drehrichtung (Zahl hinter M)", S: "Drehzahl S",
  anZ: "Anfahren Z", wegZ: "Zurück Z", wegF: "Wegfahren F", wegA: "Wegfahren Winkel",
  X: "Position X", vorX: "Vorpositionieren X", vorZ: "Vorpositionieren Z", nX: "G50 X", nZ: "G50 Z",
  vor: "Vorschub 98 oder 99 (leer = von selbst)",
};
const MARKEN = { ab: 300, schritt: 10 };

export function vorgabeTyp() {
  return {
    vorlagen: { ...V },
    plaetze: Object.fromEntries(Object.entries(PLAETZE).map(([k, l]) => [k, [...l]])),
    vorgaben: { ...VORGABEN },
    bloecke: Object.fromEntries(Object.entries(BLOECKE).map(([k, o]) => [k, { ...o }])),
    marken: { ...MARKEN },
    felder: { aus: {}, eigene: [] },
  };
}

// Gespeicherte Abweichungen über die Vorgabe legen
export function typMischen(ab = {}) {
  const t = vorgabeTyp();
  for (const [k, txt] of Object.entries(ab.vorlagen || {})) if (k in t.vorlagen && typeof txt === "string") t.vorlagen[k] = txt;
  for (const [k, l] of Object.entries(ab.plaetze || {})) if (k in t.plaetze && Array.isArray(l) && l.length) t.plaetze[k] = l.map(String);
  for (const [k, w] of Object.entries(ab.vorgaben || {})) if (k in t.vorgaben) t.vorgaben[k] = String(w);
  for (const [a, o] of Object.entries(ab.bloecke || {})) if (t.bloecke[a]) for (const [k, w] of Object.entries(o || {})) if (k in t.bloecke[a]) t.bloecke[a][k] = String(w);
  const ms = ab.marken || {};
  if (Number(ms.ab) >= 200 && Number(ms.ab) <= 999) t.marken.ab = Number(ms.ab);
  if (Number(ms.schritt) >= 1 && Number(ms.schritt) <= 100) t.marken.schritt = Number(ms.schritt);
  const fe = ab.felder || {};
  for (const [o, l] of Object.entries(fe.aus || {})) if (Array.isArray(l) && l.length) t.felder.aus[o] = l.map(String);
  if (Array.isArray(fe.eigene)) t.felder.eigene = fe.eigene.filter((f) => f && f.id && FELD_ORTE.some(([o]) => o === f.ort))
    .map((f) => ({ id: String(f.id), ort: f.ort, text: String(f.text || ""), ph: String(f.ph || "").toUpperCase(),
      art: FELD_ARTEN.some(([a]) => a === f.art) ? f.art : "zahl", vorgabe: String(f.vorgabe ?? ""),
      liste: Array.isArray(f.liste) ? f.liste.map(String) : [], aus: !!f.aus }));
  return t;
}

// Nur die Abweichungen von der Vorgabe, zum Speichern
export function typAbweichungen(t) {
  const v = vorgabeTyp(), ab = {};
  const vorl = Object.fromEntries(Object.entries(t.vorlagen).filter(([k, x]) => x !== v.vorlagen[k]));
  if (Object.keys(vorl).length) ab.vorlagen = vorl;
  const pl = Object.fromEntries(Object.entries(t.plaetze).filter(([k, l]) => l.join(",") !== v.plaetze[k].join(",")));
  if (Object.keys(pl).length) ab.plaetze = pl;
  const vg = Object.fromEntries(Object.entries(t.vorgaben).filter(([k, x]) => x !== v.vorgaben[k]));
  if (Object.keys(vg).length) ab.vorgaben = vg;
  const bl = {};
  for (const [a, o] of Object.entries(t.bloecke)) {
    const d = Object.fromEntries(Object.entries(o).filter(([k, x]) => x !== v.bloecke[a][k]));
    if (Object.keys(d).length) bl[a] = d;
  }
  if (Object.keys(bl).length) ab.bloecke = bl;
  if (t.marken.ab !== v.marken.ab || t.marken.schritt !== v.marken.schritt) ab.marken = { ...t.marken };
  const aus = Object.fromEntries(Object.entries(t.felder.aus).filter(([, l]) => l.length));
  if (Object.keys(aus).length || t.felder.eigene.length) ab.felder = { aus, eigene: t.felder.eigene };
  return ab;
}

// Der Typ, mit dem gerade gerechnet wird (eins für alle, solange es nur
// die SB-20RG gibt); `typSetzen` beim Laden und nach dem Speichern
let aktiv = vorgabeTyp();
const typHoerer = new Set();
export const typ = () => aktiv;
export function typSetzen(t) { aktiv = t; typHoerer.forEach((f) => f()); }
export function typBeobachten(f) { typHoerer.add(f); return () => typHoerer.delete(f); }
// Für die Vorschau im Fenster: mit einem ungespeicherten Stand rechnen,
// ohne jemanden zu benachrichtigen
export function mitTyp(t, f) { const vorher = aktiv; aktiv = t; try { return f(); } finally { aktiv = vorher; } }

// ---------- Vorlage ausfüllen ----------
// `werte`: Platzhalter → Text, `bed`: Bedingung → wahr/falsch,
// `listen`: CODE / PAARE / PAARE2 → Zeilen, `schraeg`: setzt „/“ davor
const BED_RE = /^\s*\[(!?)([a-z0-9]+)\]\s?/i;
export function vorlageFuellen(text, { werte = {}, bed = {}, listen = {}, schraeg = (z) => z } = {}) {
  const aus = [];
  for (const roh of String(text || "").split(/\r?\n/)) {
    let z = roh, m, weg = false;
    while ((m = z.match(BED_RE))) {
      const ok = !!bed[m[2].toLowerCase()];
      if (m[1] ? ok : !ok) weg = true;
      z = z.slice(m[0].length);
    }
    if (weg) continue;
    const t = z.trim();
    const lm = t.match(/^(\/?)\{(CODE|PAARE|PAARE2)\}$/);
    if (lm) { const l = listen[lm[2]] || []; aus.push(...(lm[1] ? l.map(schraeg) : l)); continue; }
    const fertig = t.replace(/\{([A-Z0-9_]+)\}/g, (a, n) => (n in werte ? String(werte[n]) : a));
    if (fertig !== "") aus.push(fertig);
  }
  return aus;
}

// Platzhalter und Bedingungen zum Nachschlagen im Fenster
export const PLATZHALTER_KOPF = [
  ["NR", "Programm-Nr. Kanal 1, vierstellig (0001)"], ["NR2", "Programm-Nr. Kanal 2 (Nr. + 1000)"],
  ["NAME", "HOCO Nr. in Klammern, leer ohne HOCO Nr."], ["HOCO", "HOCO Nr. ohne Klammern"],
  ["DATUM_KUERZEL", "Datum und Kürzel mit Leerzeichen"], ["DATUM", "Datum"], ["KUERZEL", "Kürzel"],
  ["A", "A Material-Ø"], ["W", "W Teilelänge"], ["S", "S Abstechdrehzahl"], ["X", "X Abstechende"],
  ["Z", "Z Start"], ["F", "F Vorschub Abstechen"], ["B", "B Stahlbreite"],
  ["SCHLICHT", "Schlichtzugabe Z"], ["PLAN", "Zugabe Plan hinten W"],
  ["ANNAEHERN", "Annähern Z mit Minus (-10.)"], ["ANNAEHERN_MM", "Annähern ohne Minus und Punkt (10)"],
  ["UEBER", "Über das Teil Z"], ["UEBER_MM", "Über das Teil ohne Minus und Punkt"],
];
export const PLATZHALTER_BLOCK = [
  ["PLATZ", "Werkzeugplatz (1400)"], ["T", "Platz durch 100 (14), Korrektur"],
  ["T2", "letzte zwei Ziffern des Platzes (21 bei 3421)"], ["T2V", "erste zwei Ziffern (21 bei 2100)"],
  ["BEZ", "Bezeichnung"], ["BEZ_K", "Bezeichnung in Klammern, leer ohne"],
  ["BEZ_GEGEN", "Bezeichnung mit „MIT GEGENSPINDEL“"], ["HD", "Hochdruck-Stufe"],
  ["DREH", "Drehrichtung mit M (M3, M4, M36, M37)"], ["S", "Drehzahl (bei Vc gerechnet, bei G96 Vc)"],
  ["G96", "„G96“, wenn G96 gewählt, sonst leer"], ["VOR", "G98 oder G99"],
  ["ANZ", "Anfahren Z"], ["WEGZ", "Zurück Z"], ["WEGF", "Wegfahren F"], ["WINKEL", "„,A45.“ oder leer"],
  ["X", "Position X"], ["Y", "„Y…“ oder leer"], ["VORX", "Vorpositionieren X"], ["VORZ", "Vorpositionieren Z"],
  ["NX", "G50 X"], ["NZ", "G50 Z"], ["M1", "Marke Start"], ["M2", "Marke 2 bzw. Ende"], ["M3", "Marke Ende (Frontangetrieben)"],
  ["CODE", "NC-Code der Bearbeitung (allein auf der Zeile, /{CODE} mit „/“)"],
  ["PAARE", "Markenpaare mit Code aus „Kanal 1 zwischen …“"], ["PAARE2", "Markenpaare mit Code aus „Kanal 2 zwischen …“"],
];
export const BEDINGUNGEN = [
  ["hd", "Hochdruck gewählt"], ["hdaus", "Hochdruck gewählt und „HD am Ende aus“ an"],
  ["g96", "G96 gewählt"], ["m38", "„M38 am Ende“ an"], ["m5", "„M5 am Ende“ an"], ["y", "Position Y eingetragen"],
];

// Unbekannte Platzhalter und Bedingungen einer Vorlage, für den Hinweis
export function vorlageFehler(text, block, extra = { namen: [], bed: [] }) {
  const namen = new Set([...(block ? PLATZHALTER_BLOCK : PLATZHALTER_KOPF).map(([n]) => n), ...extra.namen]);
  const bed = new Set([...BEDINGUNGEN.map(([n]) => n), ...extra.bed]);
  const f = new Set();
  for (const z of String(text || "").split(/\r?\n/)) {
    let r = z, m;
    while ((m = r.match(BED_RE))) { if (!bed.has(m[2].toLowerCase())) f.add("[" + m[2] + "]"); r = r.slice(m[0].length); }
    for (const p of r.matchAll(/\{([^}]*)\}/g)) if (!namen.has(p[1])) f.add("{" + p[1] + "}");
  }
  return [...f];
}

// =================================================================
//  Eingabefelder je Maschinentyp
//  Seit 1.450.0 (Wunsch Patrick 7. November 2026: „eigene Eingabefelder
//  hinzufügen und bestehende deaktivieren oder löschen“, „Auswahlliste als
//  Feldart ist gut“): `felder.aus[ort]` = Namen eingebauter Felder, die im
//  Formular fehlen; ihr Platzhalter nimmt dann fest die Vorgabe.
//  `felder.eigene` = [{ id, ort, text, ph, art, vorgabe, liste, aus }]:
//  ort "kopf" (oben bei den Programmangaben, der Platzhalter gilt auch in
//  den Bearbeitungen) oder eine Bearbeitungsart; art zahl / text / haken /
//  liste. {PH} setzt den Wert ein, [ph] gilt, wenn ausgefüllt bzw. an.
//  Eingebaute Felder lassen sich nur deaktivieren, weil die App mit
//  manchen rechnet (A für die Drehzahl aus Vc).
//  Die Werte stehen im Programm unter w.eigen bzw. b.eigen, je Platzhalter.
// =================================================================
// wie zahl() in hofercam.js (dort eingebunden, hier ohne Kreis)
const zahl = (text) => {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return t.includes(".") ? t : t + ".";
};
export const FELD_ORTE = [
  ["kopf", "Oben (Programm)"], ["dreh", "Drehwerkzeug"], ["front", "Frontwerkzeug"], ["seite", "Querangetrieben"],
  ["quer", "Frontangetrieben"], ["k2", "Kanal 2 stehende Werkzeuge"], ["k2a", "Kanal 2 angetrieben"],
];
export const FELD_ARTEN = [["zahl", "Zahl"], ["text", "Text"], ["haken", "Häkchen"], ["liste", "Auswahlliste"]];
// Eingebaute Felder, die sich deaktivieren lassen: die mit einer Vorgabe
export const eingebauteFelder = (t, ort) => (ort === "kopf" ? Object.keys(t.vorgaben) : Object.keys(t.bloecke[ort] || {}));
export const feldAus = (ort, name, t = aktiv) => (t.felder.aus[ort] || []).includes(name);
export const eigeneFelder = (ort, t = aktiv) => t.felder.eigene.filter((f) => f.ort === ort && !f.aus);
const eigeneFuer = (ort, t) => t.felder.eigene.filter((f) => f.ort === ort);

// Wert eines eigenen Felds: eingetippt, sonst die Vorgabe
export const eigenWert = (f, o) => { const e = (o && o.eigen) || {}; return f.ph in e ? String(e[f.ph] ?? "") : f.vorgabe; };
function eigeneWerte(liste, o, werte, bed) {
  for (const f of liste) {
    const roh = eigenWert(f, o);
    if (f.art === "haken") { const an = roh === "1"; werte[f.ph] = an ? "1" : ""; bed[f.ph.toLowerCase()] = an; continue; }
    const t = roh.trim();
    werte[f.ph] = f.art === "zahl" ? (zahl(t) ?? t) : t;
    bed[f.ph.toLowerCase()] = t !== "";
  }
}
export function kopfEigene(w, werte, bed = {}) { eigeneWerte(aktiv.felder.eigene.filter((f) => f.ort === "kopf"), w, werte, bed); return bed; }
export function blockEigene(b, w, werte, bed) {
  kopfEigene(w, werte, bed);
  eigeneWerte(aktiv.felder.eigene.filter((f) => f.ort === b.art), b, werte, bed);
}
// Vorgaben eigener Felder für ein neues Programm oder eine neue Bearbeitung
export const eigeneVorgaben = (ort, t = aktiv) => Object.fromEntries(eigeneFuer(ort, t).map((f) => [f.ph, f.vorgabe]));

// Deaktivierte eingebaute Felder bekommen fest die Vorgabe
export function wirksamW(w) {
  const aus = aktiv.felder.aus.kopf || [];
  if (!aus.length) return w;
  const n = { ...w };
  for (const k of aus) if (k in aktiv.vorgaben) n[k] = aktiv.vorgaben[k];
  return n;
}
export function wirksamB(b) {
  const aus = aktiv.felder.aus[b.art] || [], vg = aktiv.bloecke[b.art] || {};
  if (!aus.length) return b;
  const n = { ...b };
  for (const k of aus) if (k in vg) n[k] = vg[k];
  // Drehzahl fest: dann auch keine Schnittgeschwindigkeit
  if (aus.includes("S")) { n.sArt = "S"; n.g96 = false; }
  return n;
}

// Platzhalter und Bedingungen der eigenen Felder für die Prüfung einer Vorlage
export function eigeneNamen(t, artId) {
  const ort = artId ? artId.replace("Gegen", "") : null;
  const l = t.felder.eigene.filter((f) => f.ort === "kopf" || (ort && f.ort === ort));
  return { namen: l.map((f) => f.ph), bed: l.map((f) => f.ph.toLowerCase()), liste: l };
}

// Fehler je eigenem Feld (id → Text): Platzhalter leer, ungültig, doppelt
// oder schon eingebaut
export function eigeneFehler(t) {
  const f = {};
  const eingebaut = new Set([...PLATZHALTER_KOPF, ...PLATZHALTER_BLOCK].map(([n]) => n));
  const bed = new Set(BEDINGUNGEN.map(([n]) => n));
  const gesehen = new Set();
  for (const e of t.felder.eigene) {
    if (!e.text.trim()) f[e.id] = "Name fehlt";
    if (!/^[A-Z][A-Z0-9_]*$/.test(e.ph)) f[e.id] = "Platzhalter: Grossbuchstaben, Ziffern, _ (mit Buchstabe vorne)";
    else if (eingebaut.has(e.ph) || ["CODE", "PAARE", "PAARE2"].includes(e.ph)) f[e.id] = "{" + e.ph + "} gibt es schon eingebaut";
    else if (bed.has(e.ph.toLowerCase())) f[e.id] = "[" + e.ph.toLowerCase() + "] gibt es schon als Bedingung";
    else if (gesehen.has(e.ph)) f[e.id] = "{" + e.ph + "} doppelt";
    gesehen.add(e.ph);
    if (e.art === "liste" && !e.liste.length) f[e.id] = f[e.id] || "Auswahlliste ist leer";
  }
  return f;
}

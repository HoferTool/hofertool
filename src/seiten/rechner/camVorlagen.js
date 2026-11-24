// =================================================================
//  HOFER CAM: Vorlagen für den NC-Code einer Bearbeitung
//  Seit 1.427.0 (Wunsch Patrick 5. November 2026: „vordefinierte
//  Bearbeitungen aus einer Liste einfügen … in eine bestehende
//  Bearbeitung“, zuerst Gewindestrählen und Tieflochbohren). Man wählt
//  eine Vorlage, tippt die Werte, die App schreibt die Zeilen in den
//  NC-Code der offenen Bearbeitung. Aufbau genau nach Patricks
//  Programmen O0458/O1458:
//    Tieflochbohren  G83W18.5Q5250F0.06 / G80
//    Gewindestrählen G76P030060Q40R10 / G76X8.3Z4.74P330Q80F0.5
//    Querbohren über den Umfang: Schleife #100–#102 mit G87 und G1H
//    (nach Patricks T3200 „QUERBOHRUNG BOHREN 6 X D1.52“)
//  Q, P (Tiefe beim G76) und R stehen wie an der Fanuc ohne Punkt in
//  Mikrometern, eingetippt wird in mm.
// =================================================================
import { zahl } from "./hofercam.js";
import { EINSTICH_START, einstichZeilen } from "./camEinstich.js";

const num = (t) => {
  const n = parseFloat(String(t ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const um = (t) => { const n = num(t); return n == null ? null : Math.round(n * 1000); };
const zwei = (n) => String(Math.max(0, Math.min(99, Math.round(n)))).padStart(2, "0");
// Gerundet ohne lange Nachkommastellen, als Text für das Feld
const rund = (n, s = 3) => String(Math.round(n * 10 ** s) / 10 ** s);

// Felder je Vorlage: name, text, lang (Erklärung beim Darüberfahren),
// typ "haken" für Häkchen; vorgabe(w) rechnet einen Vorschlag aus
// anderen Feldern, solange das Feld leer ist.
// Bearbeitungsarten mit angetriebenem Werkzeug (Quer, Frontangetrieben,
// Kanal 2 angetrieben, SW-20 Kanal 3); alle anderen stehen
export const ANGETRIEBEN = ["seite", "quer", "querGegen", "k2a", "k3f", "k3s", "k1f"];

export const VORLAGEN = [
  {
    id: "g83", name: "Tieflochbohren G83",
    felder: [
      // Seit 1.695.0 (Patrick 22. November 2026): stehendes Werkzeug bohrt
      // nur in der Mitte, angetriebenes auch ausserhalb und an mehreren
      // Stellen, über Lochkreis und C-Achse oder über X/Y
      { name: "art", text: "Werkzeug", typ: "wahl", start: "stehend",
        optionen: [["stehend", "Stehend (nur Mitte)"], ["an", "Angetrieben"]],
        // Seit 1.695.1 aus der Bearbeitung (Patrick 22. November 2026: „du
        // erkennst doch anhand der gewählten Bearbeitung, ob das Werkzeug
        // stehend oder angetrieben ist“); gewählt wird nur ohne bekannte Art
        ausArt: (art) => !art ? null : ANGETRIEBEN.includes(art) ? "an" : "stehend", lang: "Stehendes Werkzeug bohrt nur zentrisch, angetriebenes auch ausserhalb der Mitte" },
      { name: "lage", text: "Positionen", typ: "wahl", start: "kreis", zeigen: (w) => w.art === "an",
        optionen: [["kreis", "Lochkreis + C-Achse"], ["xy", "X / Y Positionen"]], lang: "Wie die Bohrungen liegen" },
      // Seit 1.427.1 (Patrick 5. November 2026: „beim Tieflochbohren mit
      // T1100–T1400 und T3421–T3423 brauche ich für die Vorpositionierung
      // vom Material einen variablen Z-Wert“): G0Z… direkt vor dem G83
      { name: "Z", text: "Vorposition Z", einheit: "mm", lang: "Material vor dem Bohren auf Z fahren (G0Z…), leer = ohne" },
      { name: "D", text: "Lochkreis-Ø", einheit: "mm", lang: "Ø des Lochkreises, im Programm als X (G0X…)", pflicht: true, zeigen: (w) => w.art === "an" && w.lage !== "xy" },
      { name: "N", text: "Anzahl", einheit: "Stk", lang: "Anzahl Bohrungen gleich verteilt, ab Start C", start: "1", zeigen: (w) => w.art === "an" && w.lage !== "xy",
        pflicht: (g) => !g.CF },
      { name: "C", text: "Start C", einheit: "Grad", lang: "C-Achse für die erste Bohrung", start: "0", zeigen: (w) => w.art === "an" && w.lage !== "xy" },
      { name: "CF", text: "Winkel C frei", einheit: "Grad mit ;", typ: "text", lang: "Unregelmässig geteilt: alle Winkel mit ; getrennt (0; 45; 200), ersetzt Anzahl und Start C",
        zeigen: (w) => w.art === "an" && w.lage !== "xy" },
      { name: "XY", text: "Positionen X/Y", einheit: "X/Y mit ;", typ: "text", pflicht: true, zeigen: (w) => w.art === "an" && w.lage === "xy",
        lang: "Je Bohrung X (Ø wie im Programm) / Y, mit ; getrennt, z. B. 6/0; 0/3; -6/0" },
      { name: "W", text: "Tiefe W", einheit: "mm", lang: "Bohrtiefe schrittweise ab der Lage davor, in mm (G83W…)", pflicht: true },
      { name: "Q", text: "Zustellung Q", einheit: "mm", lang: "Zustellung je Schritt in mm, im Programm in µm (5.25 → Q5250)", pflicht: true },
      { name: "P", text: "Verweilen P", einheit: "ms", lang: "Verweilen am Grund in ms (P500), leer = ohne" },
      { name: "F", text: "Vorschub F", einheit: "mm/U", lang: "Vorschub (F0.06)", pflicht: true },
      { name: "G80", text: "G80 danach", lang: "Zyklus mit G80 aufheben", typ: "haken", start: true },
    ],
  },
  {
    // Seit 1.767.0 (Patrick 24. November 2026, nach seinem Block mit
    // „EILGANG AUF 15M“: „mach mir eine vorlage dafür“): Anbohren, in die
    // Pilotbohrung fahren mit wenig Hochdruck, dann G83 mit viel Hochdruck,
    // der Eilgang der Achse ist für den Zyklus mit G10L52 / N1420 gesenkt
    id: "tiefpilot", name: "Tieflochbohren mit Pilot und Eilgang",
    felder: [
      { name: "EIL", text: "Eilgang senken", typ: "haken", start: true, lang: "Eilgang der Achse während dem Bohren mit G10L52 N1420 heruntersetzen und danach zurück" },
      { name: "ACHSE", text: "Achse P", start: "5", zeigen: (w) => !!w.EIL, pflicht: (g) => !!g.EIL, lang: "Nummer der Achse im Parameter 1420 (P5 in deinem Programm)" },
      { name: "E1", text: "Eilgang beim Bohren", einheit: "m/min", start: "15", zeigen: (w) => !!w.EIL, pflicht: (g) => !!g.EIL, lang: "Eilgang während G83 (15 → R15000000)" },
      { name: "E2", text: "Eilgang danach", einheit: "m/min", start: "35", zeigen: (w) => !!w.EIL, pflicht: (g) => !!g.EIL, lang: "Eilgang nach dem Bohren wieder (35 → R35000000)" },
      { name: "MAN", text: "Code am Anfang", typ: "text", start: "M1110P1", lang: "Zeile vor dem Bohren, leer = ohne" },
      { name: "MAUS", text: "Code am Ende", typ: "text", start: "M1111P1", lang: "Zeile nach dem Bohren, leer = ohne" },
      { name: "Z", text: "Vorposition Z", einheit: "mm", start: "5.00", lang: "Material auf Z fahren (G0Z…), leer = ohne" },
      { name: "ZA", text: "Anbohren bis Z", einheit: "mm", start: "6.50", lang: "Anbohren im Vorschub bis Z (G1Z…), leer = ohne" },
      { name: "FA", text: "Vorschub Anbohren", einheit: "mm/U", start: "0.05", pflicht: (g) => num(g.ZA) != null },
      { name: "HDA", text: "HD-Ausgang", start: "5", lang: "Ausgang im M188…D… / M189… (M1885 = Ausgang 5)", pflicht: true },
      { name: "HD1", text: "HD-Stufe Pilot", start: "2", lang: "Hochdruck beim Fahren in die Pilotbohrung (D2), leer = ohne" },
      { name: "WP", text: "Pilot Tiefe W", einheit: "mm", start: "10.00", lang: "In die Pilotbohrung fahren, schrittweise (G1W…), leer = ohne" },
      { name: "FP", text: "Vorschub Pilot", einheit: "mm/U", start: "0.22", pflicht: (g) => num(g.WP) != null },
      { name: "HD2", text: "HD-Stufe Bohren", start: "7", lang: "Hochdruck beim Tieflochbohren (D7), leer = ohne", pflicht: true },
      { name: "W", text: "Tiefe W", einheit: "mm", lang: "Bohrtiefe schrittweise ab der Pilotbohrung (G83W…)", pflicht: true },
      { name: "Q", text: "Zustellung Q", einheit: "mm", start: "6", lang: "Zustellung je Schritt in mm, im Programm in µm (6 → Q6000)", pflicht: true },
      { name: "P", text: "Verweilen P", einheit: "ms", start: "200", lang: "Verweilen am Grund in ms, leer = ohne" },
      { name: "F", text: "Vorschub F", einheit: "mm/U", start: "0.05", pflicht: true },
      { name: "U", text: "Verweilen nach G80", einheit: "s", start: "0.02", lang: "G4U… nach dem Zyklus, leer = ohne" },
      { name: "ZR", text: "Zurück Z", einheit: "mm", start: "-1.0", lang: "Wegfahren im Vorschub (G1Z…), leer = ohne" },
      { name: "FR", text: "Vorschub zurück", einheit: "mm/U", start: "10.0", pflicht: (g) => num(g.ZR) != null },
    ],
  },
  {
    // Seit 1.767.0 (Patrick 24. November 2026: „Vorlage für die
    // Zählerfunktion … auch verschachtelt, also Zähler innerhalb eines
    // Zählers … mit Grafik“): WHILE … DO / END bis drei Ebenen, Zähler
    // zählen von 0 aufwärts, damit man sie im Code für Lagen braucht
    id: "zaehler", name: "Zähler (Schleife), verschachtelt",
    felder: [
      { name: "EB", text: "Ebenen", typ: "wahl", start: "2", optionen: [["1", "1 Zähler"], ["2", "Zähler im Zähler"], ["3", "3 Ebenen"]], lang: "Wie viele Zähler ineinander" },
      { name: "N1", text: "Ebene 1: Anzahl", einheit: "Stk", start: "4", pflicht: (g) => Number(g.EB) >= 1, lang: "So oft läuft Ebene 1" },
      { name: "V1", text: "Ebene 1: Zähler", einheit: "#", start: "110", pflicht: (g) => Number(g.EB) >= 1, lang: "Variable des Zählers (#110), zählt 0, 1, 2 … und lässt sich im Code brauchen, z. B. G0C[#110*90]" },
      { name: "VOR1", text: "Ebene 1: Code je Durchgang", typ: "code", zeigen: (w) => Number(w.EB) === 1, lang: "NC-Code, der in jedem Durchgang läuft" },
      { name: "VOR1x", text: "Ebene 1: Code vor Ebene 2", typ: "code", zeigen: (w) => Number(w.EB) > 1, lang: "Läuft je Durchgang von Ebene 1, bevor Ebene 2 startet, leer = ohne" },
      { name: "NACH1", text: "Ebene 1: Code nach Ebene 2", typ: "code", zeigen: (w) => Number(w.EB) > 1, lang: "Läuft je Durchgang von Ebene 1, nachdem Ebene 2 fertig ist (z. B. weiterdrehen G1H…), leer = ohne" },
      { name: "N2", text: "Ebene 2: Anzahl", einheit: "Stk", start: "3", pflicht: (g) => Number(g.EB) >= 2, zeigen: (w) => Number(w.EB) >= 2, lang: "So oft läuft Ebene 2" },
      { name: "V2", text: "Ebene 2: Zähler", einheit: "#", start: "111", pflicht: (g) => Number(g.EB) >= 2, zeigen: (w) => Number(w.EB) >= 2, lang: "Variable des Zählers (#111), zählt 0, 1, 2 … und lässt sich im Code brauchen, z. B. G0C[#111*90]" },
      { name: "VOR2", text: "Ebene 2: Code je Durchgang", typ: "code", zeigen: (w) => Number(w.EB) === 2, lang: "NC-Code, der in jedem Durchgang läuft" },
      { name: "VOR2x", text: "Ebene 2: Code vor Ebene 3", typ: "code", zeigen: (w) => Number(w.EB) > 2, lang: "Läuft je Durchgang von Ebene 2, bevor Ebene 3 startet, leer = ohne" },
      { name: "NACH2", text: "Ebene 2: Code nach Ebene 3", typ: "code", zeigen: (w) => Number(w.EB) > 2, lang: "Läuft je Durchgang von Ebene 2, nachdem Ebene 3 fertig ist (z. B. weiterdrehen G1H…), leer = ohne" },
      { name: "N3", text: "Ebene 3: Anzahl", einheit: "Stk", start: "2", pflicht: (g) => Number(g.EB) >= 3, zeigen: (w) => Number(w.EB) >= 3, lang: "So oft läuft Ebene 3" },
      { name: "V3", text: "Ebene 3: Zähler", einheit: "#", start: "112", pflicht: (g) => Number(g.EB) >= 3, zeigen: (w) => Number(w.EB) >= 3, lang: "Variable des Zählers (#112), zählt 0, 1, 2 … und lässt sich im Code brauchen, z. B. G0C[#112*90]" },
      { name: "VOR3", text: "Ebene 3: Code je Durchgang", typ: "code", zeigen: (w) => Number(w.EB) === 3, lang: "NC-Code, der in jedem Durchgang läuft" },
      { name: "VOR3x", text: "Ebene 3: Code vor Ebene 4", typ: "code", zeigen: (w) => Number(w.EB) > 3, lang: "Läuft je Durchgang von Ebene 3, bevor Ebene 4 startet, leer = ohne" },
      { name: "NACH3", text: "Ebene 3: Code nach Ebene 4", typ: "code", zeigen: (w) => Number(w.EB) > 3, lang: "Läuft je Durchgang von Ebene 3, nachdem Ebene 4 fertig ist (z. B. weiterdrehen G1H…), leer = ohne" },
    ],
  },
  {
    id: "g87", name: "Querbohren G87, mehrere Positionen",
    felder: [
      { name: "N", text: "Anzahl", einheit: "Stk", lang: "Anzahl Bohrungen gleichmässig über den Umfang (#100=…)", start: "6", pflicht: (g) => !g.CF },
      // Seit 1.695.0 (Patrick 22. November 2026: „bei der Vorlage Querbohren
      // G87 fehlt noch die Startposition der C-Achse für die erste Bohrung“)
      { name: "C", text: "Start C", einheit: "Grad", lang: "C-Achse für die erste Bohrung (G0C…), leer = ohne", start: "0" },
      // Seit 1.695.0 (Patrick: „auch unregelmässig geteilt und mit
      // verschiedenen Z-Positionen“): dann jede Bohrung ausgeschrieben
      { name: "CF", text: "Winkel C frei", einheit: "Grad mit ;", typ: "text", lang: "Unregelmässig geteilt: alle Winkel mit ; getrennt (0; 90; 135), ersetzt Anzahl und Start C" },
      { name: "ZL", text: "Z je Bohrung", einheit: "mm mit ;", typ: "text", lang: "Z-Lage je Bohrung mit ; getrennt (G0Z… vor jeder Bohrung), ein Wert = alle gleich, leer = ohne" },
      { name: "XA", text: "Anfahren X", einheit: "mm", lang: "X vor jeder Bohrung (G1X…F0.5)", pflicht: true },
      { name: "X", text: "Tiefe X", einheit: "mm", lang: "Bohrtiefe als Ø (G87X…)", pflicht: true },
      { name: "Q", text: "Zustellung Q", einheit: "mm", lang: "Zustellung je Schritt in mm, im Programm in µm (1 → Q1000), leer = ohne" },
      { name: "P", text: "Verweilen P", einheit: "ms", lang: "Verweilen am Grund in ms (P200), leer = ohne" },
      { name: "F", text: "Vorschub F", einheit: "mm/U", lang: "Vorschub beim Bohren (F0.01)", pflicht: true },
      { name: "XZ", text: "Zurück X", einheit: "mm", lang: "X nach jeder Bohrung vor dem Drehen in C, leer = Anfahren X",
        vorgabe: (w) => String(w.XA ?? "").trim() },
    ],
  },
  {
    id: "g76", name: "Gewindestrählen G76",
    felder: [
      // Seit 1.727.0 (Wunsch Patrick 23. November 2026): Aussen- oder
      // Innengewinde. Das Programm bleibt gleich gebaut, nur X ist innen der
      // Nenn-Ø (grösser als die Bohrung), die Steuerung fährt dann nach aussen.
      { name: "lage", text: "Gewinde", typ: "wahl", start: "aussen",
        optionen: [["aussen", "Aussengewinde"], ["innen", "Innengewinde"]],
        lang: "Aussen: X ist der Kern-Ø. Innen: X ist der Nenn-Ø, die Bohrung vorher auf Kern-Ø" },
      { name: "D", text: "Nenn-Ø", einheit: "mm", lang: "Nur für die Vorschläge End-Ø und Gewindetiefe (M9 → 9)" },
      { name: "F", text: "Steigung F", einheit: "mm", lang: "Steigung in mm (F0.5)", pflicht: true },
      { name: "X", text: "End-Ø X", einheit: "mm", pflicht: true,
        lang: "Ø am Ende des Gewindes (G76X…). Aussen Kern-Ø, Vorschlag Nenn-Ø − 1.4 × Steigung. Innen Nenn-Ø, die Bohrung vorher auf Nenn-Ø − Steigung",
        vorgabe: (w) => (num(w.D) == null ? "" : w.lage === "innen" ? rund(num(w.D))
          : num(w.F) != null ? rund(num(w.D) - 1.4 * num(w.F)) : "") },
      { name: "Z", text: "Z Ende", einheit: "mm", lang: "Gewindeende Z (G76…Z…)", pflicht: true },
      { name: "P", text: "Gewindetiefe", einheit: "mm", lang: "Gewindetiefe in mm, im Programm in µm (0.33 → P330), Vorschlag 0.66 × Steigung", pflicht: true,
        vorgabe: (w) => (num(w.F) != null ? rund(0.66 * num(w.F), 2) : "") },
      { name: "Q", text: "1. Zustellung", einheit: "mm", lang: "Erste Zustellung in mm, im Programm in µm (0.08 → Q80)", pflicht: true, start: "0.08" },
      { name: "Qmin", text: "Min. Zustellung", einheit: "mm", lang: "Kleinste Zustellung in mm, im Programm in µm (0.04 → Q40)", pflicht: true, start: "0.04" },
      { name: "R", text: "Schlichtzugabe", einheit: "mm", lang: "Schlichtzugabe in mm, im Programm in µm (0.01 → R10)", pflicht: true, start: "0.01" },
      { name: "m", text: "Schlichtschnitte", einheit: "Anzahl", lang: "Anzahl Schlichtschnitte (P03…)", pflicht: true, start: "3" },
      { name: "r", text: "Fase", einheit: "1/10 Steigung", lang: "Gewindeauslauf (Fase) in Zehntel der Steigung (P..00..)", pflicht: true, start: "0" },
      { name: "a", text: "Flankenwinkel", einheit: "Grad", lang: "Flankenwinkel in Grad (P....60)", pflicht: true, start: "60" },
    ],
  },  // Seit 1.603.0: Einstich am Mantel und an der Front, eingegeben in einer
  // Skizze (CamEinstichBild.jsx), gerechnet in camEinstich.js
  { id: "einstich", name: "Einstich Mantel / Innen / Front", grafik: true, felder: [] },
  // Seit 1.726.0 (Wunsch Patrick 23. November 2026, Handbuch SW-20 8-11 und
  // 8-14-19): X-Y Synchronsteuerung. Die Vorlage kommt in die führende
  // Bearbeitung (Kanal 1 oder 3); M50 und M51 kommen von selbst auch in den
  // anderen Kanal, dort mit den Feldern davor, dazwischen und danach.
  {
    id: "m50", name: "Synchronsteuerung M50 / M51", nurSw: true,
    felder: [
      { name: "achse", text: "Achsen", typ: "wahl", start: (w) => (w._kanal === 3 ? "X[31]" : "X[13]"),
        optionen: (w) => (w._kanal === 3
          ? [["X[31]", "X[31] X1 folgt X3"]]
          : [["X[13]", "X[13] X3 folgt X1"], ["Y[13]", "Y[13] Y3 folgt Y1"], ["Y[-13]", "Y[-13] Y3 gegenläufig"],
             ["X[13]Y[13]", "X[13]Y[13]"], ["X[13]Y[-13]", "X[13]Y[-13]"]]),
        lang: "Welche Achse des anderen Kanals mitfährt. Die erste Zahl ist der führende Kanal, die zweite der folgende; -13 = Y gegenläufig" },
      { name: "wege", text: "Wege", typ: "code", lang: "Die Wege dieses Kanals zwischen M50 und M51 (G1X… usw.), leer = später im NC-Code eintragen" },
    ],
  },
  // Seit 1.726.0 (Wunsch Patrick 23. November 2026, Handbuch SW-20 8-14-22):
  // Superposition Z1-Z3, beide Kanäle arbeiten gleichzeitig, Z3 fährt
  // überlagert zu Z1
  {
    id: "m142", name: "Superposition Z1-Z3 M142 / M143", nurSw: true,
    felder: [
      { name: "wege", text: "Wege", typ: "code", lang: "Die Wege dieses Kanals zwischen M142 und M143, leer = später im NC-Code eintragen" },
    ],
  },
];
// Optionen einer Wahl (fest oder je nach Kanal der Bearbeitung, w._kanal)
export const feldOptionen = (f, w) => (typeof f.optionen === "function" ? f.optionen(w || {}) : f.optionen || []);
const startVon = (f, w) => (typeof f.start === "function" ? f.start(w || {}) : f.start);

export const vorlageVon = (id) => VORLAGEN.find((v) => v.id === id) || VORLAGEN[0];

// Startwerte einer Vorlage
export function vorlageStart(id, kanal) {
  if (id === "einstich") return { ...EINSTICH_START };
  const w = { _kanal: kanal };
  for (const f of vorlageVon(id).felder) if (f.start !== undefined) w[f.name] = startVon(f, w);
  return w;
}

// Wert eines Felds: eingetippt, sonst Vorschlag
export function feldWert(v, w, f) {
  const t = w[f.name];
  if (f.typ === "haken") return t === undefined ? !!f.start : !!t;
  if (f.typ === "wahl") {
    const o = feldOptionen(f, w);
    const x = t === undefined || t === "" ? startVon(f, w) : t;
    return o.length && !o.some((p) => p[0] === x) ? o[0][0] : x;
  }
  if (t !== undefined && String(t).trim() !== "") return String(t).trim();
  return f.vorgabe ? f.vorgabe(w) : "";
}

// Liste „0; 45; 200“ → Zahlen, null bei etwas anderem als Zahlen
export function zahlenListe(t) {
  const teile = String(t || "").split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
  const z = teile.map(num);
  return z.some((x) => x == null) ? null : z;
}
// Feld sichtbar? (zeigen(w) mit den Werten samt Wahl-Vorgaben)
export const feldSichtbar = (f, g) => !f.zeigen || f.zeigen(g);

// Zeilen der Vorlage oder { fehler }
export function vorlageZeilen(id, w = {}) {
  const v = vorlageVon(id);
  if (v.id === "einstich") return einstichZeilen(w);
  const g = {};
  for (const f of v.felder) g[f.name] = feldWert(v, w, f);
  const sicht = v.felder.filter((f) => feldSichtbar(f, g));
  const fehlt = sicht.filter((f) => (f.pflicht === true || (typeof f.pflicht === "function" && f.pflicht(g)))
    && (g[f.name] === "" || (f.typ !== "text" && f.typ !== "code" && num(g[f.name]) == null))).map((f) => f.text);
  if (fehlt.length) return { fehler: "Fehlt: " + fehlt.join(", ") };
  if (v.id === "m50" || v.id === "m142") {
    const wege = String(w.wege || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const an = v.id === "m50" ? "M50" + g.achse : "M142", aus = v.id === "m50" ? "M51" : "M143";
    return { zeilen: [an, ...(wege.length ? wege : ["(WEGE " + (v.id === "m50" ? "DIESES KANALS" : "UEBERLAGERT") + " HIER)"]), aus] };
  }
  if (v.id === "g83") {
    const p = num(g.P) != null && num(g.P) > 0 ? "P" + Math.round(num(g.P)) : "";
    const zyk = "G83W" + zahl(g.W) + "Q" + um(g.Q) + p + "F" + zahl(g.F);
    const z = num(g.Z) != null ? ["G0Z" + zahl(g.Z)] : [];
    // Stehend nur in der Mitte, ohne X und Y
    if (g.art !== "an") { z.push(zyk); if (g.G80) z.push("G80"); return { zeilen: z }; }
    // Weitere Lagen im offenen Zyklus nur mit der Achse, ohne G0 (G0 hebt
    // den Zyklus an der Fanuc auf)
    if (g.lage === "xy") {
      const lagen = [];
      for (const t of String(g.XY).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean)) {
        const m = t.split(/[/\s]+/).map(num);
        if (m.length !== 2 || m.some((x) => x == null)) return { fehler: "Positionen X/Y: „" + t + "“ ist nicht X/Y" };
        lagen.push(m);
      }
      if (!lagen.length) return { fehler: "Fehlt: Positionen X/Y" };
      lagen.forEach(([x, y], i) => {
        if (!i) { z.push("G0X" + zahl(rund(x)) + "Y" + zahl(rund(y))); z.push(zyk); }
        else z.push("X" + zahl(rund(x)) + "Y" + zahl(rund(y)));
      });
      if (g.G80) z.push("G80");
      if (lagen.some(([, y]) => y !== 0)) z.push("G0Y0.");
      return { zeilen: z };
    }
    const w = winkelListe(g);
    if (w.fehler) return w;
    w.liste.forEach((c, i) => {
      if (!i) { z.push("G0X" + zahl(g.D) + "C" + zahl(rund(c))); z.push(zyk); }
      else z.push("C" + zahl(rund(c)));
    });
    if (g.G80) z.push("G80");
    return { zeilen: z };
  }
  if (v.id === "tiefpilot") {
    const z = [];
    const eil = (m) => ["(EILGANG AUF " + rund(num(m), 1) + "M)", "G10L52", "N1420P" + Math.round(num(g.ACHSE)) + "R" + Math.round(num(m) * 1e6), "G11"];
    const a = String(g.HDA).trim();
    if (g.EIL) z.push(...eil(g.E1));
    if (String(g.MAN).trim()) z.push(String(g.MAN).trim().toUpperCase());
    if (num(g.Z) != null) z.push("G0Z" + zahl(g.Z));
    if (num(g.ZA) != null) z.push("G1Z" + zahl(g.ZA) + "F" + zahl(g.FA));
    if (num(g.HD1) != null) z.push("M188" + a + "D" + Math.round(num(g.HD1)));
    if (num(g.WP) != null) z.push("G1W" + zahl(g.WP) + "F" + zahl(g.FP));
    z.push("M188" + a + "D" + Math.round(num(g.HD2)) + "(HD EIN)");
    const p = num(g.P) != null && num(g.P) > 0 ? "P" + Math.round(num(g.P)) : "";
    z.push("G83W" + zahl(g.W) + "Q" + um(g.Q) + p + "F" + zahl(g.F));
    if (g.EIL) z.push(...eil(g.E2));
    z.push("M189" + a + "(HD AUS)", "G80");
    if (num(g.U) != null && num(g.U) > 0) z.push("G4U" + zahl(g.U));
    if (num(g.ZR) != null) z.push("G1Z" + zahl(g.ZR) + "F" + zahl(g.FR));
    if (String(g.MAUS).trim()) z.push(String(g.MAUS).trim().toUpperCase());
    return { zeilen: z };
  }
  if (v.id === "zaehler") {
    const n = Math.max(1, Math.min(3, Number(g.EB) || 1));
    const code = (t) => String(t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const vars = [];
    for (let k = 1; k <= n; k++) {
      const vn = String(g["V" + k]).replace(/^#/, "").trim();
      if (!/^\d+$/.test(vn)) return { fehler: "Ebene " + k + ": Zähler muss eine Zahl sein (z. B. 110)" };
      if (vars.includes(vn)) return { fehler: "Ebene " + k + ": Zähler #" + vn + " ist schon vergeben" };
      if (!(Math.round(num(g["N" + k])) >= 1)) return { fehler: "Ebene " + k + ": Anzahl mindestens 1" };
      vars.push(vn);
    }
    const ebene = (k) => {
      const vn = vars[k - 1], z = ["#" + vn + "=0(ZAEHLER " + k + ")", "WHILE[#" + vn + "LT" + Math.round(num(g["N" + k])) + "]DO" + k];
      if (k === n) { const c = code(g["VOR" + k]); z.push(...(c.length ? c : ["(CODE EBENE " + k + " HIER)"])); }
      else z.push(...code(g["VOR" + k + "x"]), ...ebene(k + 1), ...code(g["NACH" + k]));
      z.push("#" + vn + "=#" + vn + "+1", "END" + k);
      return z;
    };
    return { zeilen: ebene(1) };
  }
  if (v.id === "g87") {
    const q = um(g.Q) != null && num(g.Q) > 0 ? "Q" + um(g.Q) : "";
    const p = num(g.P) != null && num(g.P) > 0 ? "P" + Math.round(num(g.P)) : "";
    const bohren = ["G1X" + zahl(g.XA) + "F0.5", "G87X" + zahl(g.X) + q + p + "F" + zahl(g.F), "G80", "G1X" + zahl(g.XZ) + "F0.5"];
    const frei = !!String(g.CF).trim(), mitZ = !!String(g.ZL).trim();
    if (frei || mitZ) {
      // Unregelmässig oder mit Z je Bohrung: jede Bohrung ausgeschrieben
      const w = winkelListe(g);
      if (w.fehler) return w;
      let zs = [];
      if (mitZ) {
        zs = zahlenListe(g.ZL);
        if (!zs) return { fehler: "Z je Bohrung: nur Zahlen mit ; getrennt" };
        if (zs.length !== 1 && zs.length !== w.liste.length) return { fehler: "Z je Bohrung: " + zs.length + " Werte für " + w.liste.length + " Bohrungen" };
      }
      const absolut = frei || num(g.C) != null;
      const z = [];
      w.liste.forEach((c, i) => {
        if (absolut) z.push("G0C" + zahl(rund(c)) + "(BOHRUNG " + (i + 1) + ")");
        else if (i) z.push("G1H" + zahl(rund(w.liste[i] - w.liste[i - 1])) + "F1.");
        if (mitZ) z.push("G0Z" + zahl(rund(zs.length === 1 ? zs[0] : zs[i])));
        z.push(...bohren);
      });
      return { zeilen: z };
    }
    return { zeilen: [
      "#100=" + Math.round(num(g.N)) + "(ANZAHL BOHRUNGEN)",
      "#101=360/#100(INKREMENTAL TEILUNG)",
      "#102=#100-1",
      ...(num(g.C) != null ? ["G0C" + zahl(g.C) + "(START C)"] : []),
      "WHILE[#102GE#0]DO1",
      ...bohren,
      "G1H#101F1.",
      "#102=#102-1",
      "END1",
    ] };
  }
  // g76
  return { zeilen: [
    "G76P" + zwei(num(g.m)) + zwei(num(g.r)) + zwei(num(g.a)) + "Q" + um(g.Qmin) + "R" + um(g.R),
    "G76X" + zahl(g.X) + "Z" + zahl(g.Z) + "P" + um(g.P) + "Q" + um(g.Q) + "F" + zahl(g.F),
  ] };
}

// Winkel der Bohrungen: frei eingetippt oder gleich verteilt ab Start C
function winkelListe(g) {
  if (String(g.CF || "").trim()) {
    const l = zahlenListe(g.CF);
    if (!l || !l.length) return { fehler: "Winkel C frei: nur Zahlen mit ; getrennt" };
    return { liste: l };
  }
  const n = Math.round(num(g.N));
  if (!(n >= 1 && n <= 360)) return { fehler: "Anzahl: 1 bis 360" };
  const c0 = num(g.C) ?? 0;
  return { liste: Array.from({ length: n }, (_, i) => c0 + (i * 360) / n) };
}

// Zeilen nach der Zeile mit der Schreibmarke einsetzen, ohne Marke am Ende
export function zeilenEinsetzen(code, zeilen, pos) {
  const t = String(code || "");
  const neu = zeilen.join("\n");
  if (!t.trim()) return neu;
  if (pos == null || pos < 0 || pos >= t.length) return t.replace(/\s*$/, "") + "\n" + neu;
  const ende = t.indexOf("\n", pos);
  if (ende < 0) return t + "\n" + neu;
  return t.slice(0, ende) + "\n" + neu + t.slice(ende);
}

// Seit 1.732.0 (Wunsch Patrick 23. November 2026: „wenn ich in der
// Bearbeitung auf dem NC-Code für den Einstich bin, wieder in das
// Vorlagenfenster springen, um eine Änderung vorzunehmen“): jede
// eingefügte Vorlage merkt sich am Block unter b.vorlagen ihre Werte und
// Zeilen [{k, id, w, z}]. Steht die Schreibmarke in genau diesen Zeilen,
// lässt sich die Vorlage wieder öffnen und ersetzt beim Übernehmen nur
// ihre eigenen Zeilen. Von Hand darin geänderte Zeilen lösen die Verbindung.
const zeileGleich = (a, b) => String(a).replace(/\r$/, "").trim() === String(b).replace(/\r$/, "").trim();
function stellen(zeilen, z) {
  const aus = [];
  if (!z || !z.length) return aus;
  for (let i = 0; i + z.length <= zeilen.length; i++) {
    let ok = true;
    for (let j = 0; j < z.length && ok; j++) ok = zeileGleich(zeilen[i + j], z[j]);
    if (ok) aus.push(i);
  }
  return aus;
}
export function vorlageBeiMarke(code, eintraege, pos) {
  if (!eintraege || !eintraege.length || pos == null) return null;
  const t = String(code || "");
  const zeilen = t.split("\n");
  const zeile = t.slice(0, Math.max(0, Math.min(pos, t.length))).split("\n").length - 1;
  for (let n = eintraege.length - 1; n >= 0; n--) {
    const e = eintraege[n];
    for (const i of stellen(zeilen, e.z)) if (zeile >= i && zeile < i + e.z.length) return { e, von: i, bis: i + e.z.length };
  }
  return null;
}
export function vorlageErsetzen(code, von, bis, neu) {
  const zeilen = String(code || "").split("\n");
  return [...zeilen.slice(0, von), ...neu, ...zeilen.slice(bis)].join("\n");
}
// Einträge, deren Zeilen nicht mehr im Code stehen, fallen weg
export function vorlagenAufraeumen(code, eintraege) {
  const zeilen = String(code || "").split("\n");
  return (eintraege || []).filter((e) => stellen(zeilen, e.z).length);
}

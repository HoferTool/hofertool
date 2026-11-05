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
export const VORLAGEN = [
  {
    id: "g83", name: "Tieflochbohren G83",
    felder: [
      { name: "W", text: "Tiefe W", lang: "Bohrtiefe schrittweise ab der Lage davor, in mm (G83W…)", pflicht: true },
      { name: "Q", text: "Zustellung Q", lang: "Zustellung je Schritt in mm, im Programm in µm (5.25 → Q5250)", pflicht: true },
      { name: "P", text: "Verweilen P", lang: "Verweilen am Grund in ms (P500), leer = ohne" },
      { name: "F", text: "Vorschub F", lang: "Vorschub (F0.06)", pflicht: true },
      { name: "G80", text: "G80 danach", lang: "Zyklus mit G80 aufheben", typ: "haken", start: true },
    ],
  },
  {
    id: "g87", name: "Querbohren G87, mehrere Positionen",
    felder: [
      { name: "N", text: "Anzahl", lang: "Anzahl Bohrungen gleichmässig über den Umfang (#100=…)", pflicht: true, start: "6" },
      { name: "XA", text: "Anfahren X", lang: "X vor jeder Bohrung (G1X…F0.5)", pflicht: true },
      { name: "X", text: "Tiefe X", lang: "Bohrtiefe als Ø (G87X…)", pflicht: true },
      { name: "Q", text: "Zustellung Q", lang: "Zustellung je Schritt in mm, im Programm in µm (1 → Q1000), leer = ohne" },
      { name: "P", text: "Verweilen P", lang: "Verweilen am Grund in ms (P200), leer = ohne" },
      { name: "F", text: "Vorschub F", lang: "Vorschub beim Bohren (F0.01)", pflicht: true },
      { name: "XZ", text: "Zurück X", lang: "X nach jeder Bohrung vor dem Drehen in C, leer = Anfahren X",
        vorgabe: (w) => String(w.XA ?? "").trim() },
    ],
  },
  {
    id: "g76", name: "Gewindestrählen G76",
    felder: [
      { name: "D", text: "Nenn-Ø", lang: "Nur für die Vorschläge Kern-Ø und Gewindetiefe (M9 → 9)" },
      { name: "F", text: "Steigung F", lang: "Steigung in mm (F0.5)", pflicht: true },
      { name: "X", text: "Kern-Ø X", lang: "Ø am Ende des Gewindes (G76X…), Vorschlag aussen Nenn-Ø − 1.4 × Steigung", pflicht: true,
        vorgabe: (w) => (num(w.D) != null && num(w.F) != null ? rund(num(w.D) - 1.4 * num(w.F)) : "") },
      { name: "Z", text: "Z Ende", lang: "Gewindeende Z (G76…Z…)", pflicht: true },
      { name: "P", text: "Gewindetiefe", lang: "Gewindetiefe in mm, im Programm in µm (0.33 → P330), Vorschlag 0.66 × Steigung", pflicht: true,
        vorgabe: (w) => (num(w.F) != null ? rund(0.66 * num(w.F), 2) : "") },
      { name: "Q", text: "1. Zustellung", lang: "Erste Zustellung in mm, im Programm in µm (0.08 → Q80)", pflicht: true, start: "0.08" },
      { name: "Qmin", text: "Min. Zustellung", lang: "Kleinste Zustellung in mm, im Programm in µm (0.04 → Q40)", pflicht: true, start: "0.04" },
      { name: "R", text: "Schlichtzugabe", lang: "Schlichtzugabe in mm, im Programm in µm (0.01 → R10)", pflicht: true, start: "0.01" },
      { name: "m", text: "Schlichtschnitte", lang: "Anzahl Schlichtschnitte (P03…)", pflicht: true, start: "3" },
      { name: "r", text: "Fase", lang: "Gewindeauslauf (Fase) in Zehntel der Steigung (P..00..)", pflicht: true, start: "0" },
      { name: "a", text: "Flankenwinkel", lang: "Flankenwinkel in Grad (P....60)", pflicht: true, start: "60" },
    ],
  },
];

export const vorlageVon = (id) => VORLAGEN.find((v) => v.id === id) || VORLAGEN[0];

// Startwerte einer Vorlage
export function vorlageStart(id) {
  const w = {};
  for (const f of vorlageVon(id).felder) if (f.start !== undefined) w[f.name] = f.start;
  return w;
}

// Wert eines Felds: eingetippt, sonst Vorschlag
export function feldWert(v, w, f) {
  const t = w[f.name];
  if (f.typ === "haken") return t === undefined ? !!f.start : !!t;
  if (t !== undefined && String(t).trim() !== "") return String(t).trim();
  return f.vorgabe ? f.vorgabe(w) : "";
}

// Zeilen der Vorlage oder { fehler }
export function vorlageZeilen(id, w = {}) {
  const v = vorlageVon(id);
  const g = {};
  for (const f of v.felder) g[f.name] = feldWert(v, w, f);
  const fehlt = v.felder.filter((f) => f.pflicht && (g[f.name] === "" || num(g[f.name]) == null)).map((f) => f.text);
  if (fehlt.length) return { fehler: "Fehlt: " + fehlt.join(", ") };
  if (v.id === "g83") {
    const p = um(g.P) != null && num(g.P) > 0 ? "P" + Math.round(num(g.P)) : "";
    const z = ["G83W" + zahl(g.W) + "Q" + um(g.Q) + p + "F" + zahl(g.F)];
    if (g.G80) z.push("G80");
    return { zeilen: z };
  }
  if (v.id === "g87") {
    const q = um(g.Q) != null && num(g.Q) > 0 ? "Q" + um(g.Q) : "";
    const p = num(g.P) != null && num(g.P) > 0 ? "P" + Math.round(num(g.P)) : "";
    return { zeilen: [
      "#100=" + Math.round(num(g.N)) + "(ANZAHL BOHRUNGEN)",
      "#101=360/#100(INKREMENTAL TEILUNG)",
      "#102=#100-1",
      "WHILE[#102GE#0]DO1",
      "G1X" + zahl(g.XA) + "F0.5",
      "G87X" + zahl(g.X) + q + p + "F" + zahl(g.F),
      "G80",
      "G1X" + zahl(g.XZ) + "F0.5",
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

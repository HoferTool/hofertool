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
export const VORLAGEN = [
  {
    id: "g83", name: "Tieflochbohren G83",
    felder: [
      // Seit 1.695.0 (Patrick 22. November 2026): stehendes Werkzeug bohrt
      // nur in der Mitte, angetriebenes auch ausserhalb und an mehreren
      // Stellen, über Lochkreis und C-Achse oder über X/Y
      { name: "art", text: "Werkzeug", typ: "wahl", start: "stehend",
        optionen: [["stehend", "Stehend (nur Mitte)"], ["an", "Angetrieben"]], lang: "Stehendes Werkzeug bohrt nur zentrisch, angetriebenes auch ausserhalb der Mitte" },
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
      { name: "D", text: "Nenn-Ø", einheit: "mm", lang: "Nur für die Vorschläge Kern-Ø und Gewindetiefe (M9 → 9)" },
      { name: "F", text: "Steigung F", einheit: "mm", lang: "Steigung in mm (F0.5)", pflicht: true },
      { name: "X", text: "Kern-Ø X", einheit: "mm", lang: "Ø am Ende des Gewindes (G76X…), Vorschlag aussen Nenn-Ø − 1.4 × Steigung", pflicht: true,
        vorgabe: (w) => (num(w.D) != null && num(w.F) != null ? rund(num(w.D) - 1.4 * num(w.F)) : "") },
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
];

export const vorlageVon = (id) => VORLAGEN.find((v) => v.id === id) || VORLAGEN[0];

// Startwerte einer Vorlage
export function vorlageStart(id) {
  if (id === "einstich") return { ...EINSTICH_START };
  const w = {};
  for (const f of vorlageVon(id).felder) if (f.start !== undefined) w[f.name] = f.start;
  return w;
}

// Wert eines Felds: eingetippt, sonst Vorschlag
export function feldWert(v, w, f) {
  const t = w[f.name];
  if (f.typ === "haken") return t === undefined ? !!f.start : !!t;
  if (f.typ === "wahl") return t === undefined || t === "" ? f.start : t;
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
    && (g[f.name] === "" || (f.typ !== "text" && num(g[f.name]) == null))).map((f) => f.text);
  if (fehlt.length) return { fehler: "Fehlt: " + fehlt.join(", ") };
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

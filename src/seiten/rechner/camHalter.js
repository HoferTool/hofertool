// =================================================================
//  HOFERCAM: Halter 12 × 12 zu den Drehplatten (seit 1.696.0)
//  Wunsch Patrick 22. November 2026: „kannst du bei Dreh-, Einstech- und
//  Ausdrehwerkzeugen auch die passenden Halter dazu finden und sie in der
//  Simulation anzeigen? wir verwenden auf beiden Maschinen Drehhalter mit
//  12 x 12 mm. mir wäre es wichtig, dass die Platten korrekt in den Haltern
//  sitzen“, „die Position, an der die Platte im Halter sitzt, müsste aber
//  korrekt sein“, „eigentlich müsstest du die Halter bei den Lieferanten
//  finden“.
//
//  Lage der Platte im Halter wie im Katalog:
//  - Spanfläche = Schaftoberkante = Drehmitte (h1 = h = 12)
//  - f1 = Abstand der Spitze zur Rückseite des Schafts quer zur
//    Schaftachse; die Spitze steht f1 − b vor der Seite des Schafts
//  - Schaft radial (+X) bei Aussenwerkzeugen, Bohrstange in Z bei
//    Ausdrehwerkzeugen
//  Werte je Halter in HALTER, die Zuordnung zur Platte über den Artikel
//  (Lieferant, Art.-Nr., Text) und sonst nach der Form der Platte.
// =================================================================

import { plattenForm } from "./camWerkzeug.js";

// typ: schraube (Platte mit Schraube in der Senkung), klinge (Einstechen,
// Platte zwischen zwei Backen), bohrstange (Ausdrehen)
// Masse in mm; quelle nennt den Katalog
export const HALTER = {
  // ISO-Klemmhalter 12 × 12, Katalogwerte ISO 5610 für h = b = 12
  "SDJCR 1212": { typ: "schraube", name: "SDJCR/L 1212 H11", b: 12, h: 12, f1: 16, kr: 93, quelle: "ISO 5610" },
  "SVJCR 1212": { typ: "schraube", name: "SVJCR/L 1212 H11", b: 12, h: 12, f1: 16, kr: 93, quelle: "ISO 5610" },
  "SVJBR 1212": { typ: "schraube", name: "SVJBR/L 1212 H11", b: 12, h: 12, f1: 16, kr: 93, quelle: "ISO 5610" },
  "SVVBN 1212": { typ: "schraube", name: "SVVBN 1212 H11", b: 12, h: 12, f1: 6, kr: 72.5, quelle: "ISO 5610" },
  "SCLCR 1212": { typ: "schraube", name: "SCLCR/L 1212 F06", b: 12, h: 12, f1: 16, kr: 95, quelle: "ISO 5610" },
  "SWLCR 1212": { typ: "schraube", name: "SWLCR/L 1212 F06", b: 12, h: 12, f1: 16, kr: 95, quelle: "ISO 5610" },
  "STGCR 1212": { typ: "schraube", name: "STGCR/L 1212 F11", b: 12, h: 12, f1: 16, kr: 91, quelle: "ISO 5610" },
  "SRDCN 1212": { typ: "schraube", name: "SRDCN 1212", b: 12, h: 12, f1: 6, kr: 0, quelle: "ISO 5610" },
  "GEWINDE 1212": { typ: "schraube", name: "Gewindehalter 1212 (Laydown 11/16)", b: 12, h: 12, f1: 16, kr: 90, quelle: "ISO 5610" },
  "STECH 1212": { typ: "klinge", name: "Stechhalter 1212", b: 12, h: 12, f1: 12, quelle: "Annahme" },
  "BOHRSTANGE 6": { typ: "bohrstange", name: "Bohrstange Schaft Ø6 in Hülse", schaft: 6, quelle: "Annahme" },
  // Lieferanten (Recherche 22. November 2026, Masse aus den ISO-13399-Daten
  // der Händler: WF = f1, LF = l1; was nicht veröffentlicht ist, steht als
  // Annahme da)
  "SVXCR 1212 H11 U": { typ: "schraube", name: "Utilis SVXCR/L 1212 H11 U", b: 12, h: 12, f1: 16, kr: 93, l1: 100, quelle: "Utilis (l1 100), f1 nicht veröffentlicht, wie ISO angenommen" },
  "SDJCR 1212 SH": { typ: "schraube", name: "SDJCR/L 1212 K11-SH (Swiss kurz)", b: 12, h: 12, f1: 12, kr: 93, l1: 125, quelle: "Ingersoll SDJCR1212K11-SH" },
  "GHDR 12-3": { typ: "klinge", name: "Iscar GHDR 12-3 (Cut-Grip)", b: 12, h: 12, f1: 10.8, l1: 110, quelle: "Iscar über Hoffmann 2800143" },
  "SGTFR 1212-2": { typ: "klinge", name: "Iscar SGTFR/L 1212-2 (Self-Grip)", b: 12, h: 12, f1: 12, l1: 110, quelle: "Iscar SGTFR 1212-3 (l1 110), Sitz 2 angenommen gleich" },
  "RH100 1212": { typ: "klinge", name: "Horn RH/LH100.1212.02 (S100)", b: 12, h: 12, f1: 12, l1: 125, quelle: "Horn RH100.1212.02, f1 nicht veröffentlicht" },
  "UTILIS 5000 1212": { typ: "klinge", name: "Utilis 5000-12x100 R/L", b: 12, h: 12, f1: 12, l1: 100, quelle: "Utilis multidec-5000 Katalog 2025, f1 angenommen" },
  "UTILIS 1600 1212": { typ: "klinge", name: "Utilis 1600-12x100 90 ST RA/LA", b: 12, h: 12, f1: 15, l1: 100, quelle: "Utilis Shop (w = 15)" },
};

// Halter nach der Form der Platte (ohne Angaben des Lieferanten)
function nachForm(wz) {
  const f = plattenForm(wz && wz.form);
  if (!f) return null;
  if (f.art === "einstech") return "STECH 1212";
  if (f.art === "gewinde") return "GEWINDE 1212";
  if (f.id === "D") return "SDJCR 1212";
  if (f.id === "V") return "SVJCR 1212";
  if (f.id === "C") return "SCLCR 1212";
  if (f.id === "W") return "SWLCR 1212";
  if (f.id === "T") return "STGCR 1212";
  if (f.id === "R") return "SRDCN 1212";
  if (f.art === "frei") return "STECH 1212";
  return "SDJCR 1212";
}

// Regeln je Lieferant/Artikel: erste passende gilt (Text in Grossbuchstaben)
// Text = Lieferant, Art.-Nr. und Bezeichnung des Artikels in Grossbuchstaben
const hat = (...w) => (t) => w.some((x) => t.includes(x));
const REGELN = [
  { test: hat("SVXC", "H11 U", "UTILIS SV"), halter: "SVXCR 1212 H11 U" },
  { test: (t) => /\bGIP\b|CUT-GRIP|GHDR/.test(t), halter: "GHDR 12-3" },
  { test: (t) => /\bDGN\b|SELF-GRIP|SGTF/.test(t), halter: "SGTFR 1212-2" },
  { test: (t) => /\bS100\b|\b100\.\d{4}|H100/.test(t) && t.includes("HORN"), halter: "RH100 1212" },
  { test: (t) => /CUT\s*50\d\d|\b50\d\d-\d/.test(t), halter: "UTILIS 5000 1212" },
  { test: (t) => /CUT\s*16\d\d|\b16[01]\d\b/.test(t) && t.includes("UTILIS"), halter: "UTILIS 1600 1212" },
  { test: (t) => /VC[GM][TX]/.test(t), halter: "SVXCR 1212 H11 U" },
];
export function halterRegeln(neu) { REGELN.length = 0; REGELN.push(...neu); }

// Halter zum Werkzeug; innen = Ausdrehen (Schneidenlage nach aussen)
export function halterFuer(wz, innen) {
  if (!wz || wz.art !== "dreh") return null;
  if (wz.halter && HALTER[wz.halter]) return { id: wz.halter, ...HALTER[wz.halter] };
  if (innen) return { id: "BOHRSTANGE 6", ...HALTER["BOHRSTANGE 6"] };
  const a = wz.artikel || {};
  const t = [a.lief, a.nr, a.text].filter(Boolean).join(" ").toUpperCase();
  for (const r of REGELN) if (r.test(t, wz)) return { id: r.halter, ...HALTER[r.halter], ...(r.mass || {}) };
  const id = nachForm(wz);
  return id ? { id, ...HALTER[id] } : null;
}

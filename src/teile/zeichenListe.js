// Zeichen zum Einfügen in der Schreibleiste, in der Leiste des
// Einrichtblatts und beim Soll in den Prüfmassen.
// Seit 1.867.0 (Wunsch Patrick 26. November 2026: „Baue auch noch zur
// Symbolpalette wie Durchmesser die Form- und Lagetoleranzen ein, als
// Symbol einfügbar“): die Zeichen der Form- und Lagetoleranzen nach
// ISO 1101 als Unicode, damit sie wie Text gespeichert, gesucht und
// gedruckt werden (keine Bilder).
export const ZEICHEN = [
  ["Ø", "Durchmesserzeichen Ø einfügen"],
  ["±", "Plus/Minus ± einfügen"],
];

export const FORM_LAGE = [
  ["⏤", "Geradheit"],
  ["⏥", "Ebenheit"],
  ["○", "Rundheit"],
  ["⌭", "Zylinderform"],
  ["⌒", "Linienform"],
  ["⌓", "Flächenform"],
  ["∥", "Parallelität"],
  ["⟂", "Rechtwinkligkeit"],
  ["∠", "Neigung"],
  ["⌖", "Position"],
  ["◎", "Koaxialität / Konzentrizität"],
  ["⌯", "Symmetrie"],
  ["↗", "Lauf (Rundlauf)"],
  ["⌰", "Gesamtlauf"],
  ["Ⓜ", "Maximum-Material"],
  ["Ⓛ", "Minimum-Material"],
  ["Ⓔ", "Hüllbedingung"],
  ["°", "Grad"],
  ["□", "Quadrat"],
  ["⌀", "Norm-Durchmesser ⌀"],
];

// Seit 1.888.0 (Wunsch Patrick 27. November 2026: „die Symbole sollen
// grösser sein, manche kann man nicht erkennen“): die Zeichen der Form- und
// Lagetoleranzen stehen in einer eigenen Symbolschrift, grösser und alle
// gleich breit (CSS .gdt am Ende von stil.css).
const GDT_SET = new Set(FORM_LAGE.map(([z]) => z).filter((z) => z !== "°"));
const GDT_RE = new RegExp("[" + [...GDT_SET].join("").replace(/[\]\\^-]/g, "\\$&") + "]", "g");

// Für React: Text mit den Symbolen in <span class="gdt">.
export function gdtTeile(text) {
  const s = String(text ?? "");
  if (!GDT_RE.test(s)) return s;
  GDT_RE.lastIndex = 0;
  const teile = [];
  let ab = 0, m, i = 0;
  while ((m = GDT_RE.exec(s))) {
    if (m.index > ab) teile.push(s.slice(ab, m.index));
    teile.push({ gdt: m[0], k: i++ });
    ab = m.index + 1;
  }
  if (ab < s.length) teile.push(s.slice(ab));
  return teile;
}

// Für HTML (PDF): schon maskierter Text, die Symbole in <span class="gdt">.
export function gdtHtml(htmlText) {
  return String(htmlText ?? "").replace(GDT_RE, (z) => '<span class="gdt">' + z + "</span>");
}

// Alte Excel-Berichte schrieben die Symbole mit Symbolschriften (Symbol,
// Wingdings, GDT-Schriften). Ausgelesen kommen dann Zeichen aus dem privaten
// Bereich (U+F0xx) statt der Symbole. Bekannte werden umgewandelt.
const SYMBOL_PUA = {
  0xF0C6: "Ø", 0xF0C5: "Ø", 0xF0B1: "±", 0xF0B0: "°", 0xF05E: "⟂", 0xF0D0: "∠",
  0xF0A4: "○", 0xF0B7: "○", 0xF0AE: "↗", 0xF0BD: "∥", 0xF0E0: "◎", 0xF0C4: "⌖",
};
export function symbolUmwandeln(text) {
  return rahmenText(String(text ?? "").replace(/[\uf020-\uf0ff]/g, (z) => SYMBOL_PUA[z.charCodeAt(0)] || z)
    .replace(/∅/g, "Ø"));
}
// Toleranzrahmen aus der GDT-Schrift alter Berichte, z. B. „{µ~|Ø~0~.~0~2~|A~}“
// (Patrick 27. November 2026, 10007-0044): Klammern und Tilden weg, Felder mit
// Leerschlag, also „µ Ø0.02 A“. Das Zeichen vorne ist das Symbol in der Schrift.
function rahmenText(s) {
  const m = /^\s*\{(.*)\}\s*$/.exec(s);
  if (!m || !/[~|]/.test(m[1])) return s;
  return m[1].split("|").map((f) => f.replace(/~/g, "").trim()).filter(Boolean)
    .map((f) => RAHMEN_SYMBOL[f] || f).join(" ");
}
const RAHMEN_SYMBOL = {};

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

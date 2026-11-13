// =================================================================
//  AKTUELLER NC-CODE DER MODULE
//  Seit 1.436.0 (Wunsch Patrick 6. November 2026: „im HoferCam in den
//  Bearbeitungen ein Button, um die aktuellen Codes aus den Modulen
//  Bohren/Fräsen, Entgraten, C-Achse G12, Gravur und DXF zu übernehmen“;
//  seit 1.530.0 auch HOFERCONTUR, Wunsch Patrick 13. November 2026):
//  jeder dieser Reiter meldet hier seinen gerade erzeugten NC-Code.
//  Gemerkt im sessionStorage, damit er nach Reiterwechsel und Neuladen
//  noch da ist; ein Reiter, der im Tab noch nie offen war, hat keinen.
// =================================================================
import { kopfZeilen, fussZeilen } from "./kopf.jsx";

export const NC_QUELLEN = [
  ["kontur", "HOFERCONTUR"], ["bohren", "Bohren / Fräsen"], ["entgraten", "Entgraten"], ["cachse", "C-Achse G12.1"],
  ["gravur", "Gravur"], ["dxf", "DXF"],
];
const SCHLUESSEL = "hofer.ncAktuell";
let stand = null;
const lesen = () => {
  if (stand) return stand;
  try { stand = JSON.parse(sessionStorage.getItem(SCHLUESSEL) || "{}") || {}; } catch (e) { stand = {}; }
  return stand;
};

export function ncMelden(art, text) {
  const s = lesen();
  if (s[art] && s[art].text === text) return;
  s[art] = { text: String(text || ""), zeit: Date.now() };
  try { sessionStorage.setItem(SCHLUESSEL, JSON.stringify(s)); } catch (e) { /* voll oder gesperrt: bleibt im Speicher */ }
}

export const ncAktuell = (art) => lesen()[art] || null;

// Zeilen ohne Leerzeilen; mit ohneSpann ohne den Vor- und Nachspann für
// die Maschine (kopf.jsx), der im HoferCam schon im Kopf und Ende steht
export function ncZeilen(text, ohneSpann) {
  let z = String(text || "").split(/\r?\n/).filter((x) => x.trim());
  if (!ohneSpann) return z;
  const weg = (block, vonHinten) => {
    if (!block.length) return;
    const gleich = (i) => block.every((b, k) => (z[i + k] || "").trim() === b.trim());
    const r = [];
    for (let i = 0; i + block.length <= z.length; i++) if (gleich(i)) r.push(i);
    if (!r.length) return;
    const i = vonHinten ? r[r.length - 1] : r[0];
    z = z.slice(0, i).concat(z.slice(i + block.length));
  };
  weg(kopfZeilen(), false);
  weg(fussZeilen(), true);
  return z;
}

export const hatSpann = () => kopfZeilen().length > 0 || fussZeilen().length > 0;

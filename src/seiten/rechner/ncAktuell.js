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
import { alt } from "../../bruecke.jsx";

export const NC_QUELLEN = [
  ["kontur", "HOFERCONTUR"], ["bohren", "Bohren / Fräsen"], ["entgraten", "Entgraten"], ["cachse", "C-Achse G12.1"],
  ["gravur", "Gravur"], ["dxf", "DXF"],
];
const SCHLUESSEL = "hofer.ncAktuell";
let stand = null;
// Im eigenen Tab eines Moduls für HOFERCAM (modulTab.jsx, seit 1.588.0)
// nichts aus dem Speicher des Tabs lesen oder hineinschreiben: der Tab
// hat beim Öffnen eine Kopie davon und soll leer anfangen
const imModulTab = () => /^#\/?nc\/modul\//.test(location.hash);
const hoerer = new Set();
export function ncBeobachten(f) { hoerer.add(f); return () => { hoerer.delete(f); }; }
const lesen = () => {
  if (stand) return stand;
  if (imModulTab()) { stand = {}; return stand; }
  try { stand = JSON.parse(sessionStorage.getItem(SCHLUESSEL) || "{}") || {}; } catch (e) { stand = {}; }
  return stand;
};

export function ncMelden(art, text) {
  const s = lesen();
  if (s[art] && s[art].text === text) return;
  s[art] = { text: String(text || ""), zeit: Date.now(), v: alt.APP_VERSION || "" };
  hoerer.forEach((f) => f());
  if (imModulTab()) return;
  try { sessionStorage.setItem(SCHLUESSEL, JSON.stringify(s)); } catch (e) { /* voll oder gesperrt: bleibt im Speicher */ }
}

// Seit 1.620.2 nur Code aus derselben Fassung der App: nach einem Neuladen
// mit neuer Fassung lag sonst noch der alte Code im Speicher des Tabs
// (Patrick 18. November 2026: HOFERCAM brachte G0X16.0 aus HOFERCONTUR,
// das die neue Fassung gar nicht mehr ausgibt); der Reiter meldet sich
// beim nächsten Öffnen wieder
export const ncAktuell = (art) => {
  const a = lesen()[art];
  if (!a) return null;
  if ((a.v || "") !== (alt.APP_VERSION || "")) return null;
  return a;
};

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

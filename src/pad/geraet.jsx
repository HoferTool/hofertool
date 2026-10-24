// =================================================================
//  WELCHE MASCHINE IST DIESES iPAD?
// =================================================================
import { alt } from "../bruecke.jsx";

// Das Konto „Pad Mode“ läuft auf rund 25 iPads gleichzeitig (Wunsch
// Patrick 24. Oktober 2026: „bei jedem kurz fragen, welche Maschine es
// ist, zum Unterscheiden“). Die Wahl gehört zum Gerät, nicht zum Konto,
// darum im localStorage. Danach geht das iPad nach jedem Start und
// Neuladen gleich auf das Dashboard dieser Maschine.
const GERAET = "hofer.pad.geraet";

export function padGeraet() {
  try { return JSON.parse(localStorage.getItem(GERAET) || "null"); } catch (f) { return null; }
}
export function geraetSetzen(w) {
  try { localStorage.setItem(GERAET, JSON.stringify(w)); } catch (f) { /* privates Fenster: dann eben jedes Mal */ }
}

// Gerätekonto Pad Mode: Vermerk padGeraet am Konto (profiles.einstellungen),
// sonst an der Adresse erkannt
export function istPadKonto() {
  const pr = alt.profil;
  if (!pr) return false;
  if (pr.einstellungen && pr.einstellungen.padGeraet) return true;
  return /^pad\.mode@/i.test(pr.email || "");
}

// Zustand fürs Öffnen des Pads auf diesem Gerät: die gemerkte Maschine,
// oder die Frage, solange noch nichts gewählt ist
export function padGeraetZustand() {
  if (!istPadKonto()) return null;
  const g = padGeraet();
  if (!g) return { wo: "geraet" };
  if (g.maschineId) return { wo: "maschine", maschineId: g.maschineId, parkId: g.parkId || null, reiter: "uebersicht" };
  return null;
}

// Klein oben im Balken, im Pad Mode wie sonst in der App, damit man die
// iPads auseinanderhält (Wunsch Patrick 24. Oktober 2026: „soll auch
// irgendwo immer kurz stehen, die Nummer, aber klein“)
export function geraetText() {
  const g = istPadKonto() ? padGeraet() : null;
  if (!g || !g.maschineId) return "";
  return g.nr || g.name || "";
}
export function GeraetMarke() {
  const t = geraetText();
  if (!t) return null;
  return <span className="geraet-marke" data-geraetmarke="" title="Dieses iPad">iPad {t}</span>;
}

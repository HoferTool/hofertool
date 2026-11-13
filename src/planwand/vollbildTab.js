// =================================================================
//  PLANWAND IM VOLLBILD (eigener Tab)
//  Seit 1.522.0 (Wunsch Patrick 13. November 2026: „die Planwand soll einen
//  Button für Vollbildmodus haben, sie soll dann in einem eigenen Tab aufgehen
//  und Vollbild zeigen“). #/planwand/vollbild zeigt dieselbe Seite Planwand,
//  nur ohne Kopfzeile und Menü (Klasse pw-vollbild am body, stil.css). Fester
//  Name des Tabs, damit ein zweiter Klick in denselben Tab geht, wie beim Planer.
// =================================================================
import { alt } from "../bruecke.jsx";

const NAME = "hofer-planwand-vollbild";

// Nur am Computer mit Maus, nicht im Archiv, nicht für Externe (neue
// Funktionen nur auf Nachfrage) und nicht im Vollbild-Tab selbst
export const vollbildSichtbar = () =>
  !alt.istExtern() && !(alt.istArchiv && alt.istArchiv()) && !istVollbildTab()
  && window.matchMedia("(pointer: fine)").matches;

export const istVollbildTab = () => /^#\/?planwand\/vollbild(\/|$)/.test(location.hash);

export function vollbildTabOeffnen() {
  const basis = location.href.split("#")[0].replace(/([?&])fassung=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const w = window.open(basis + "#/planwand/vollbild", NAME);
  if (w) { try { w.focus(); } catch (f) {} }
  else alt.meldung("Der Browser hat den Tab gesperrt. Bitte Pop-ups für das HoferTool erlauben.", "warn");
}

// Echtes Vollbild des Browsers geht nur nach einem Tipp oder Klick; darum
// holt es der erste Klick im Tab nach (wie beim Infoboard). Escape des
// Browsers beendet es wieder, der Tab bleibt dann ohne Kopf und Menü.
let angemeldet = false;
export function vollbildNachholen() {
  if (angemeldet) return;
  angemeldet = true;
  const holen = () => {
    if (!istVollbildTab() || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen().catch(() => {});
  };
  document.addEventListener("pointerdown", holen, { once: true, capture: true });
}

// Escape ganz am Schluss: Tab schliessen, nach einer Rückfrage
let fragt = false;
export async function vollbildVerlassenFragen() {
  if (fragt) return;
  fragt = true;
  try {
    const ja = await alt.nachfragen({ titel: "Vollbild schliessen?", text: "Enter schliesst diesen Tab, Escape bleibt hier.", bestaetigen: "Schliessen" });
    if (!ja) return;
    window.close();
    // Hat der Browser den Tab nicht zugemacht (nicht von der App geöffnet),
    // dann normal weiter auf der Planwand
    setTimeout(() => { history.replaceState(null, "", "#/planwand"); alt.zeichneSeite && alt.zeichneSeite(); }, 200);
  } finally { fragt = false; }
}

// Sprung von den Stammdaten einer HOCO Nr. in QS → Prüfberichte zum
// Bearbeiten der Prüfmasse (seit 1.837.0). Eigene Datei, damit Qs.jsx,
// Pruefberichte.jsx und hoco/Pruefung.jsx sich nicht gegenseitig laden.
import { alt } from "../../bruecke.jsx";

export const qsSprung = { ansicht: null, masse: null };

export function masseInQsOeffnen(hoco) {
  qsSprung.ansicht = "pruefberichte";
  qsSprung.masse = hoco;
  // offene Fenster (Stammdaten) schliessen
  document.querySelectorAll(".dialog-huelle").forEach((d) => { try { d.__hoferZu ? d.__hoferZu() : d.remove(); } catch (_) { /* egal */ } });
  if (location.hash === "#/qs") alt.zeichneSeite();
  else location.hash = "#/qs";
}

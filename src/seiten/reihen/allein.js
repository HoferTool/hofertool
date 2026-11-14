// Direktlink #/reihen (Wunsch Patrick 14. November 2026: „über diesen Link
// soll man nur ins Rider-Programm kommen, wenn man schliesst nicht zurück ins
// HoferTool“): Wurde die App mit #/reihen in der Adresse geöffnet, bleibt
// dieser Tab im Spiel. Kein Schliessen, keine anderen Seiten. Gemerkt im
// sessionStorage, damit Neuladen und Anmelden es nicht verlieren; ein neuer
// Tab ohne den Link ist wieder das normale HoferTool. Ausgewertet beim Laden
// des Moduls, bevor die App die Adresse ändert.
const SCHLUESSEL = "hofer.reihen.allein";
const amStart = /^#\/?reihen(\/|$)/.test(location.hash);
export const reihenAllein = (() => {
  try {
    if (amStart) sessionStorage.setItem(SCHLUESSEL, "1");
    return sessionStorage.getItem(SCHLUESSEL) === "1";
  } catch (e) { return amStart; }
})();
export const istReihenAdresse = () => /^#\/?reihen(\/|$)/.test(location.hash);

// =================================================================
//  PLANER ALS EIGENER TAB (seit 1.521.0, Wunsch Patrick 13. November
//  2026: „Dashboard aus Pad Mode raus und als Button bei Planwand neben
//  Symbole, soll immer als extra Tab aufgehen“). Der Knopf auf der
//  Planwand öffnet #/planer in einem Tab mit festem Namen, so geht ein
//  zweiter Klick wieder in denselben Tab statt in einen neuen.
// =================================================================
import { alt } from "../bruecke.jsx";

export const planerSichtbar = () => alt.istAdmin() && !alt.istExtern();
// Todos in der Seitenleiste haben seit 1.707.0 alle ausser Externen, dem
// Dienstkonto und reinen HOFERTIME-Konten (Wunsch Patrick 22. November 2026)
// Todos für alle ausser Externen, Dienst und reinen HOFERTIME-Konten
// (seit 1.711.0, Patrick 23. November 2026: „mit Todos für alle“); false = nur Admins.
export const TODOS_FUER_ALLE = true;
export const todosSichtbar = () => {
  if (!TODOS_FUER_ALLE) return planerSichtbar();
  const r = alt.meineRolle && alt.meineRolle();
  return !!r && !alt.istExtern() && r !== "dienst" && !(alt.profil && alt.profil.nur_zeit);
};
export const istPlanerTab = () => /^#\/?planer(\/|$)/.test(location.hash);

export function planerTabOeffnen() {
  const basis = location.href.split("#")[0].replace(/([?&])fassung=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const w = window.open(basis + "#/planer", "hofer-planer");
  if (w) { try { w.focus(); } catch (f) { /* egal */ } }
  else alt.meldung("Der Browser hat den Tab gesperrt. Bitte Pop-ups für das HoferTool erlauben.", "warn");
}

// Planer verlassen: der Tab geht zu. Hat ihn nicht die App geöffnet
// (Adresse von Hand), lässt der Browser das nicht zu, dann zur Planwand.
export function planerTabVerlassen() {
  window.close();
  setTimeout(() => {
    history.replaceState(null, "", "#/planwand");
    alt.padSchliessen();
  }, 200);
}

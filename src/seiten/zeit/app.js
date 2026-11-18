// =================================================================
//  EIGENE APP-ADRESSE DER ZEITERFASSUNG (seit 1.626.0, Wunsch Patrick
//  18. November 2026: „können wir dafür eine eigene App-Adresse machen?“,
//  „alles im Stil vom HoferTool“)
//  …/hofertool/hofertime/ leitet auf …/hofertool/?app=hofertime#/zeit. Mit ?app=hofertime
//  in der Adresse zeigt die App nur die Zeiterfassung, ohne Kopfzeile und
//  Menü (Klasse ze-app am body), jede andere Seite führt zurück. Name,
//  Symbol und Manifest wechseln auf „HOFERTIME“, damit das Symbol auf dem
//  Startbildschirm (iPad, Handy) direkt hierher führt. Ausgewertet beim
//  Laden des Moduls, bevor die App die Adresse ändert.
// =================================================================
export const zeitApp = /(^|[?&])app=hofertime(&|$)/.test(location.search);
export const istZeitAdresse = () => /^#\/?zeit(\/|$)/.test(location.hash);

if (zeitApp) {
  try {
    const m = document.querySelector('link[rel="manifest"]');
    if (m) m.setAttribute("href", "./hofertime.webmanifest");
    document.title = "HOFERTIME";
    let t = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!t) { t = document.createElement("meta"); t.setAttribute("name", "apple-mobile-web-app-title"); document.head.appendChild(t); }
    t.setAttribute("content", "HOFERTIME");
    if (!istZeitAdresse()) history.replaceState(null, "", location.pathname + location.search + "#/zeit");
  } catch (f) { /* egal */ }
}

// Stempel-Terminal: ein iPad in der Firma, an dem viele stempeln. Das
// Gerät merkt sich keine Anmeldung (sonst käme jeder mit einem Tipp in
// fremde Konten), und nach dem Stempeln meldet es von selbst ab.
// Eingeschaltet von einem Admin in HOFERTIME → Alle Mitarbeiter.
const TERMINAL = "hofer.hofertime.terminal";
export function istTerminal() {
  try { return localStorage.getItem(TERMINAL) === "1"; } catch (f) { return false; }
}
export function terminalSetzen(an) {
  try { if (an) localStorage.setItem(TERMINAL, "1"); else localStorage.removeItem(TERMINAL); } catch (f) { /* egal */ }
}

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
// Seit 1.627.1 hat HOFERTIME eine echte eigene Adresse …/hofertime/
// (eigenes Manifest, sonst bot Chrome nur „In App öffnen“ des HoferTools an).
// Alte Adressen mit ?app=hofertime führen dorthin.
export const zeitApp = /\/hofertime\/(index\.html)?$/.test(location.pathname)
  || /(^|[?&])app=hofertime(&|$)/.test(location.search);
if (zeitApp && !/\/hofertime\//.test(location.pathname) && location.protocol === "https:") {
  location.replace(new URL("hofertime/", location.href.split(/[?#]/)[0].replace(/[^/]*$/, "")).href + "#/zeit");
}
export const istZeitAdresse = () => /^#\/?zeit(\/|$)/.test(location.hash);

if (zeitApp) {
  try {
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

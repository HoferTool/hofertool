// =================================================================
//  PLANUNG: PLANWAND UND PLANER IN EINEM TAB (seit 1.700.0)
//  Wunsch Patrick 22. November 2026: „wenn man Admin hat, soll man ein
//  Kombi-Fenster haben mit Planer-Dashboard und Planwand, sonst einfach
//  Planwand“. Der Knopf „Planwand“ auf dem neuen Dashboard öffnet bei
//  Admins einen Tab mit festem Namen: oben in der Mitte ein Umschalter
//  Planwand / Planer. Die Planwand ist die Vollbild-Planwand
//  (#/planwand/vollbild/kombi), der Planer das bisherige Dashboard
//  (#/planer/kombi). Gezeichnet als einfaches Element am body, damit er
//  über der Planwand und über dem Planer (Pad) liegt.
// =================================================================
import { alt } from "../bruecke.jsx";

const NAME = "hofer-planung";
const MERK = "hofer.kombi";

export const kombiDarf = () => alt.istAdmin() && !alt.istExtern() && !(alt.istArchiv && alt.istArchiv());

// Kombi ist ein Tab, sobald er einmal mit …/kombi geöffnet wurde
export function istKombi() {
  if (/\/kombi(\/|$)/.test(location.hash)) { try { sessionStorage.setItem(MERK, "1"); } catch (f) { /* egal */ } return true; }
  try { return sessionStorage.getItem(MERK) === "1"; } catch (f) { return false; }
}

export function planungOeffnen() {
  const basis = location.href.split("#")[0].replace(/([?&])fassung=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const ziel = kombiDarf() ? "#/planwand/vollbild/kombi" : "#/planwand/vollbild";
  const w = window.open(basis + ziel, kombiDarf() ? NAME : "hofer-planwand-vollbild");
  if (w) { try { w.focus(); } catch (f) { /* egal */ } return; }
  location.hash = "#/planwand";
}

const istPlaner = () => /^#\/?planer(\/|$)/.test(location.hash);

export function kombiPlanwand(balkenId) {
  // Erst die Adresse, dann das Pad zu: padSchliessen zeichnet die Seite
  // neu und würde mit #/planer sonst gleich wieder den Planer öffnen
  if (document.getElementById("pad")) {
    history.pushState(null, "", "#/planwand/vollbild/kombi");
    alt.padSchliessen();
  } else location.hash = "#/planwand/vollbild/kombi";
  if (balkenId) setTimeout(() => alt.balkenZeigen && alt.balkenZeigen(balkenId), 400);
}
export function kombiPlaner() { location.hash = "#/planer/kombi"; }

function leiste() {
  let el = document.getElementById("kombi-leiste");
  const zeigen = istKombi() && kombiDarf() && (istPlaner() || /^#\/?planwand\/vollbild/.test(location.hash));
  if (!zeigen) { if (el) el.remove(); document.body.classList.remove("kombi-tab"); return; }
  document.body.classList.add("kombi-tab");
  if (!el) {
    el = document.createElement("div");
    el.id = "kombi-leiste";
    el.className = "kombi-leiste";
    el.setAttribute("role", "tablist");
    el.innerHTML = '<button type="button" data-kombi="planwand">Planwand</button>'
      + '<button type="button" data-kombi="planer">Planer</button>';
    el.addEventListener("click", (e) => {
      const k = e.target.closest("[data-kombi]");
      if (!k) return;
      if (k.dataset.kombi === "planer") { if (!istPlaner()) kombiPlaner(); }
      else if (istPlaner()) kombiPlanwand();
    });
    document.body.appendChild(el);
  }
  el.querySelectorAll("[data-kombi]").forEach((b) => {
    const an = (b.dataset.kombi === "planer") === istPlaner();
    b.classList.toggle("aktiv", an);
    b.setAttribute("aria-selected", an ? "true" : "false");
  });
}

// Nach jedem Seitenwechsel neu: der Planer und die Planwand bauen den body um
export function kombiLeisteAnwenden() { setTimeout(leiste, 0); }
window.addEventListener("hashchange", kombiLeisteAnwenden);

// =================================================================
//  KW bei Datumsfeldern (seit 1.809.0, Wunsch Patrick 25. November 2026:
//  „ich will bei datumsauswahlfenstern auch die kw sehen“). Den Kalender
//  des Browsers selbst kann eine Webseite nicht ändern, darum steht, solange
//  ein Datumsfeld (oder ein Textfeld mit nur einem Datum) die Schreibmarke
//  hat, oben rechts am Feld ein kleines Schild „KW 48“. Es geht beim
//  Tippen und Wählen mit und verschwindet beim Verlassen.
//  data-ohne-kw am Feld schaltet es ab.
// =================================================================
import { datumLesen } from "./datumTasten.js";

// KW nach ISO 8601 (Woche mit dem ersten Donnerstag ist KW 1)
export function isoKw(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wt = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wt);
  const jahr = t.getUTCFullYear();
  const kw = Math.ceil(((t - Date.UTC(jahr, 0, 1)) / 86400000 + 1) / 7);
  return { kw, jahr };
}

function passendesFeld(f) {
  if (!f || f.tagName !== "INPUT" || f.hasAttribute("data-ohne-kw")) return false;
  const typ = (f.type || "text").toLowerCase();
  return typ === "date" || typ === "text" || typ === "search";
}

function anbinden(d) {
  let feld = null;
  let schild = null;
  const zeigen = () => {
    if (!feld || !feld.isConnected) return weg();
    const typ = (feld.type || "text").toLowerCase();
    const g = feld.value ? datumLesen(feld.value) : null;
    if (!g || (typ !== "date" && !g)) { if (schild) schild.style.display = "none"; return; }
    if (!schild) {
      schild = d.createElement("div");
      schild.setAttribute("data-kw-schild", "");
      schild.style.cssText = "position:fixed;z-index:2147483000;pointer-events:none;background:#003884;color:#fff;"
        + "-webkit-text-fill-color:#fff;font:600 11px/1 system-ui,sans-serif;padding:3px 6px;border-radius:6px;"
        + "box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap";
      d.body.appendChild(schild);
    }
    const { kw, jahr } = isoKw(g.datum);
    const heuteJahr = new Date().getFullYear();
    schild.textContent = "KW " + kw + (jahr !== heuteJahr ? " / " + jahr : "");
    const r = feld.getBoundingClientRect();
    if (!r.width) { schild.style.display = "none"; return; }
    schild.style.display = "block";
    const sb = schild.offsetWidth;
    schild.style.left = Math.max(2, r.right - sb - 4) + "px";
    schild.style.top = Math.max(2, r.top - 16) + "px";
  };
  const weg = () => { feld = null; if (schild) schild.style.display = "none"; };
  d.addEventListener("focusin", (e) => { if (passendesFeld(e.target)) { feld = e.target; zeigen(); } else weg(); }, true);
  d.addEventListener("focusout", (e) => { if (e.target === feld) weg(); }, true);
  d.addEventListener("input", (e) => { if (e.target === feld) zeigen(); }, true);
  d.addEventListener("change", (e) => { if (e.target === feld) zeigen(); }, true);
  d.addEventListener("scroll", () => { if (feld) zeigen(); }, true);
}

export function kwAnzeigeAnbinden(d) {
  if (!d || d.__kwAnzeige) return;
  d.__kwAnzeige = true;
  anbinden(d);
}

if (typeof document !== "undefined") kwAnzeigeAnbinden(document);

// =================================================================
//  Datumstasten im ganzen HoferTool (seit 1.603.0, Wunsch Patrick
//  17. November 2026: „wenn ein Datum steht, soll mit w eine Woche nach
//  vorne gesprungen werden, mit m einen Monat, mit j ein Jahr, mit der
//  Minustaste einen Tag zurück … mit t jeweils einen Tag nach vorne“).
//  Gilt in jedem Datumsfeld (input type="date") und in jedem Textfeld,
//  in dem genau ein Datum steht (17.11.26, 17.11.2026, 2026-11-17).
//  H setzt heute, wie schon im Kopf von HOFERCAM. Die Schreibweise des
//  Felds bleibt, wie sie war. Ein Feld mit anderem Text tippt normal.
// =================================================================

const SCHRITT = { t: [0, 0, 1], w: [0, 0, 7], m: [0, 1, 0], j: [1, 0, 0], "-": [0, 0, -1] };

const zwei = (n) => String(n).padStart(2, "0");

// Text → { datum, art } oder null
export function datumLesen(text) {
  const s = String(text || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return gueltig(+m[1], +m[2], +m[3], { iso: true });
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const kurz = m[3].length === 2;
    const j = kurz ? 2000 + +m[3] : +m[3];
    return gueltig(j, +m[2], +m[1], { kurz, ohneNull: m[1].length === 1 && m[2].length === 1 });
  }
  return null;
}

function gueltig(j, mo, t, art) {
  const d = new Date(j, mo - 1, t);
  if (d.getFullYear() !== j || d.getMonth() !== mo - 1 || d.getDate() !== t) return null;
  return { datum: d, art };
}

export function datumSchreiben(d, art) {
  if (art.iso) return d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
  const t = art.ohneNull ? String(d.getDate()) : zwei(d.getDate());
  const mo = art.ohneNull ? String(d.getMonth() + 1) : zwei(d.getMonth() + 1);
  const j = art.kurz ? zwei(d.getFullYear() % 100) : String(d.getFullYear());
  return t + "." + mo + "." + j;
}

// Monate und Jahre: 31. Januar + 1 Monat = 28./29. Februar, nicht 3. März
export function datumSchieben(d, [dj, dm, dt]) {
  if (dt) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dt);
  const ziel = new Date(d.getFullYear() + dj, d.getMonth() + dm, 1);
  const letzter = new Date(ziel.getFullYear(), ziel.getMonth() + 1, 0).getDate();
  ziel.setDate(Math.min(d.getDate(), letzter));
  return ziel;
}

// Wert setzen, so dass React es als Eingabe merkt
function wertSetzen(feld, wert) {
  const proto = Object.getPrototypeOf(feld);
  const setzer = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setzer) setzer.call(feld, wert); else feld.value = wert;
  feld.dispatchEvent(new Event("input", { bubbles: true }));
  feld.dispatchEvent(new Event("change", { bubbles: true }));
}

function tasteVerarbeiten(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const taste = e.key === "Subtract" ? "-" : String(e.key || "").toLowerCase();
  if (!SCHRITT[taste] && taste !== "h") return;
  const feld = e.target;
  if (!feld || feld.tagName !== "INPUT" || feld.readOnly || feld.disabled) return;
  const typ = (feld.type || "text").toLowerCase();
  if (typ !== "date" && typ !== "text" && typ !== "search") return;
  if (feld.hasAttribute("data-ohne-datumtasten")) return;

  let gelesen = typ === "date"
    ? (feld.value ? datumLesen(feld.value) : null)
    : datumLesen(feld.value);
  // Leeres Datumsfeld: nur H (heute) tut etwas
  if (!gelesen) {
    if (typ === "date" && taste === "h") gelesen = { datum: new Date(), art: { iso: true } };
    else return;
  }
  // In einem Textfeld mit Markierung eines Teils tippt man wohl gerade neu
  if (typ !== "date" && feld.selectionStart != null && feld.selectionEnd - feld.selectionStart > 0
    && feld.selectionEnd - feld.selectionStart < feld.value.length) return;

  e.preventDefault();
  const heute = new Date();
  const neu = taste === "h" ? new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()) : datumSchieben(gelesen.datum, SCHRITT[taste]);
  wertSetzen(feld, datumSchreiben(neu, typ === "date" ? { iso: true } : gelesen.art));
  if (typ !== "date") try { feld.setSelectionRange(feld.value.length, feld.value.length); } catch { /* egal */ }
}

export function datumTastenAnbinden(d) {
  if (!d || d.__datumTasten) return;
  d.__datumTasten = true;
  // Nach den Feldern selbst (Bubbling), damit eigene Tasten eines Felds vorgehen
  d.addEventListener("keydown", tasteVerarbeiten);
}

if (typeof document !== "undefined") datumTastenAnbinden(document);

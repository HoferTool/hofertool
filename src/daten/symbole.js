// =================================================================
//  SYMBOLE AUF DEN BALKEN
//  Der Admin legt unter Einstellungen → Symbole kleine Bilder mit
//  einer Erklärung an (zum Beispiel „Kack Teili“). Im Auftragsfenster
//  lassen sie sich einem Auftrag geben, sie stehen dann auf dem Balken
//  gleich hinter der HOCO Nr. Wer darüberfährt, sieht ein Fenster mit
//  dem Bild und darunter der Erklärung (Wunsch Patrick 8. Oktober 2026).
//
//  Die Liste liegt in app_config.plan_symbole als JSON
//  [{id, bild, text}], das Bild als kleine PNG-Adresse (data:). So
//  braucht sie keine eigene Tabelle und keine Dateiablage. Welche
//  Symbole ein Auftrag hat, steht in jobs.symbole als „id1,id2“
//  (sql/plan-symbole.sql). Ohne das SQL fehlt nur die Spalte: Symbole
//  anlegen geht, ans Auftrag hängen meldet, was fehlt.
// =================================================================
import { alt } from "../bruecke.jsx";

const SCHLUESSEL = "plan_symbole";
let liste = [];

export function symbole() { return liste; }

export async function symboleLaden() {
  try {
    const r = await alt.zeitlimit(alt.db.from("app_config").select("wert")
      .eq("schluessel", SCHLUESSEL).maybeSingle(), 6000, "Symbole");
    const roh = !r.error && r.data && r.data.wert ? JSON.parse(r.data.wert) : [];
    liste = Array.isArray(roh) ? roh.filter((s) => s && s.id && s.bild) : [];
  } catch (f) { /* ohne Symbole steht die Wand genauso */ }
  return liste;
}

export async function symboleSpeichern(neu) {
  const { error } = await alt.db.from("app_config").upsert(
    { schluessel: SCHLUESSEL, wert: JSON.stringify(neu) }, { onConflict: "schluessel" });
  if (error) throw error;
  liste = neu;
}

// „id1,id2“ → die Ids, in der gespeicherten Reihenfolge
export function symbolIds(text) {
  return String(text || "").split(",").map((x) => x.trim()).filter(Boolean);
}

// Kennt die Datenbank die Spalte schon? Die Planwand-Sicht liefert sie
// erst nach sql/plan-symbole.sql mit.
export function symbolSpalte() {
  return (alt.plan.auftraege || []).some((x) => x && "symbole" in x);
}

const esc = (t) => String(t === null || t === undefined ? "" : t)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Für den Balken: die kleinen Bilder hinter der Nummer. Ein Symbol,
// das der Admin inzwischen gelöscht hat, fällt still weg.
export function symbolHtml(j) {
  const ids = symbolIds(j && j.symbole);
  if (!ids.length || !liste.length) return "";
  return ids.map((id) => liste.find((s) => s.id === id)).filter(Boolean)
    .map((s) => '<img class="pw-balken__symbol" data-plsymbol="' + esc(s.id) + '" src="'
      + esc(s.bild) + '" alt="' + esc(s.text) + '" draggable="false">').join("");
}

// ---------- Fenster beim Darüberfahren ----------
// Wie die Schnellvorschau des Balkens, nur mit Bild und Erklärung.
// Solange es steht, hat die Schnellvorschau des Balkens Pause.

let fenster = null;

export function symbolInfoWeg() {
  document.querySelectorAll(".pw-symbolinfo").forEach((x) => x.remove());
  fenster = null;
}

export function symbolInfoOffen() { return !!fenster; }

export function symbolInfoZeigen(el, x, y) {
  const s = liste.find((z) => z.id === el.dataset.plsymbol);
  if (!s) return;
  symbolInfoWeg();
  document.querySelectorAll(".pw-info").forEach((z) => z.remove());
  fenster = document.createElement("div");
  fenster.className = "pw-symbolinfo";
  fenster.innerHTML = '<img src="' + esc(s.bild) + '" alt="">'
    + '<div class="pw-symbolinfo__text">' + esc(s.text || "") + '</div>';
  document.body.appendChild(fenster);
  symbolInfoSetzen(x, y);
}

export function symbolInfoSetzen(x, y) {
  if (!fenster) return;
  const b = fenster.offsetWidth, h = fenster.offsetHeight, abstand = 14;
  const oben = y - abstand - h >= 8;
  fenster.style.left = Math.max(8, Math.min(window.innerWidth - b - 8, x - b / 2)) + "px";
  fenster.style.top = (oben ? y - abstand - h
    : Math.min(window.innerHeight - h - 8, y + abstand + 6)) + "px";
}

// Das „M“ statt des Geplant-Kreises: weisses Feld, rotes M. Es heisst,
// dass bei „Menge vorhanden oder bestellt“ nichts steht (Bild von
// Patrick, 8. Oktober 2026). Als SVG, damit es in jeder Grösse scharf ist.
export const M_SYMBOL = '<svg class="pw-msymbol" viewBox="0 0 19 22" aria-hidden="true">'
  + '<rect x="0.6" y="0.6" width="17.8" height="20.8" fill="#fff" stroke="#111" stroke-width="1.2"/>'
  + '<path d="M4.6 16.6V5.4h2.3l2.6 7.2 2.6-7.2h2.3v11.2h-1.9V8.6l-2.3 6.4H8.8L6.5 8.6v8z"'
  + ' fill="#e3141b" stroke="#5a0a0a" stroke-width=".45" stroke-linejoin="round"/></svg>';

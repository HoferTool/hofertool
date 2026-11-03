// =================================================================
//  VORSCHAU IM EIGENEN FENSTER
//  Die Schnellvorschau beim Darüberfahren über einen Auftrag (und über
//  Ferien) kann in einem eigenen kleinen Browserfenster stehen, das man
//  hinstellt, wo man will, auch ausserhalb des HoferTools oder auf einem
//  anderen Bildschirm (Wunsch Patrick 3. November 2026: „das Fenster,
//  wenn man über die Aufträge fährt, in einem eigenen kleinen Tab“).
//
//  Ein- und ausgeschaltet mit dem Knopf oben auf der Planwand. Solange
//  das Fenster offen ist, zeigt es den Auftrag unter der Maus und bleibt
//  danach beim zuletzt gezeigten stehen; in der Planwand selbst geht
//  dann keine Vorschau mehr auf. Lage und Grösse merkt das Gerät.
//
//  Seit 1.380.1 bleibt es immer zuoberst (Patrick 3. November 2026:
//  „beim Verschieben der Zeitachse darf das Fenster nicht verschwinden“;
//  ein normales Browserfenster rutschte beim ersten Klick in die
//  Planwand hinter sie). Dafür das Bild-im-Bild-Fenster von Chrome und
//  Edge (Document Picture-in-Picture); wo es das nicht gibt, wie bisher
//  ein eigenes Browserfenster. Das Bild-im-Bild-Fenster geht beim
//  Neuladen zu, darum wartet das stündliche Neuladen, solange es offen
//  ist. Das normale Fenster holt die App nach dem Neuladen über seinen
//  Namen zurück. Schliessen des Fensters schaltet es aus, Abmelden
//  schliesst es.
// =================================================================
import { stileUebertragen } from "../teile/eigenesFenster.js";
import { alt } from "../bruecke.jsx";

const NAME = "hofer-vorschau";
const LAGE = "hofer.vorschauFenster.lage";
const AN = "hofer.vorschauFenster.an";

let w = null;
let pip = false;
let wache = null;
const zuhoerer = new Set();

const merken = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (f) { /* ohne Speicher */ } };
const lesen = (k) => { try { return localStorage.getItem(k); } catch (f) { return null; } };

function lageMerken() {
  if (!w || w.closed) return;
  try { merken(LAGE, JSON.stringify({ x: w.screenX, y: w.screenY, b: w.outerWidth, h: w.outerHeight })); } catch (f) { /* egal */ }
}

function melden() { zuhoerer.forEach((f) => { try { f(!!vorschauFensterOffen()); } catch (e) { /* weiter */ } }); }

// Für den Knopf: meldet jede Änderung (offen / zu)
export function vorschauFensterBeobachten(f) {
  zuhoerer.add(f);
  return () => zuhoerer.delete(f);
}

export const vorschauFensterOffen = () => (w && !w.closed ? w : null);
export const vorschauImmerOben = () => !!(pip && vorschauFensterOffen());

// Das Dokument im Fenster neu aufbauen: Gestaltung, hell/dunkel und
// eine leere Fläche mit Hinweis
function aufbauen() {
  const d = w.document;
  if (!d.head) d.documentElement.appendChild(d.createElement("head"));
  if (!d.body) d.documentElement.appendChild(d.createElement("body"));
  d.head.innerHTML = "";
  d.body.innerHTML = "";
  d.title = "Vorschau – HoferTool";
  stileUebertragen(d);
  d.body.classList.add("vf-body");
  d.body.innerHTML = '<div class="vf-inhalt"><div class="vf-leer">Mit der Maus über einen Auftrag auf der Planwand fahren.</div></div>';
}

function wacheStarten() {
  clearInterval(wache);
  wache = setInterval(() => {
    if (!w || w.closed) {
      // Von Hand geschlossen: ausgeschaltet
      clearInterval(wache); wache = null; w = null; pip = false;
      merken(AN, null);
      melden();
      return;
    }
    lageMerken();
  }, 1000);
}

// Knopf: öffnen oder schliessen
export async function vorschauFensterUmschalten() {
  if (vorschauFensterOffen()) { vorschauFensterZu(); return; }
  let lage = null;
  try { lage = JSON.parse(lesen(LAGE) || "null"); } catch (f) { lage = null; }
  const b = (lage && lage.b) || 300, h = (lage && lage.h) || 520;
  // Zuerst das Fenster, das immer zuoberst bleibt. Wo und wie gross es
  // steht, merkt sich der Browser selbst.
  const dpip = window.documentPictureInPicture;
  if (dpip && dpip.requestWindow && !(window.TEST && !window.TEST.bildImBild)) {
    try {
      w = await dpip.requestWindow({ width: b, height: h });
      pip = true;
      aufbauen();
      // nicht merken: nach dem Neuladen geht es ohne Klick nicht wieder auf
      merken(AN, null);
      wacheStarten();
      melden();
      return;
    } catch (f) { w = null; pip = false; /* dann das normale Fenster */ }
  }
  const x = lage ? lage.x : window.screenX + 40, y = lage ? lage.y : window.screenY + 120;
  w = window.open("", NAME, `popup=yes,width=${b},height=${h},left=${x},top=${y}`);
  if (!w) {
    alt.meldung("Der Browser hat das Fenster blockiert. Oben rechts in der Adresszeile Pop-ups für das HoferTool erlauben.", "warn");
    return;
  }
  pip = false;
  aufbauen();
  merken(AN, "1");
  wacheStarten();
  melden();
}

export function vorschauFensterZu() {
  clearInterval(wache); wache = null;
  if (w && !w.closed) { lageMerken(); w.close(); }
  w = null; pip = false;
  merken(AN, null);
  melden();
}

// Nach dem Neuladen: war das Fenster an, das noch offene über seinen
// Namen zurückholen. Ein schon bestehendes Fenster mit diesem Namen
// sperrt der Browser nicht; gibt es keines mehr, lässt er ohne Klick
// meist keines aufgehen, dann bleibt es eben aus.
export function vorschauFensterWiederholen() {
  if (vorschauFensterOffen() || lesen(AN) !== "1") return;
  if (alt.isMobil && alt.isMobil()) return;
  let lage = null;
  try { lage = JSON.parse(lesen(LAGE) || "null"); } catch (f) { lage = null; }
  const b = (lage && lage.b) || 300, h = (lage && lage.h) || 520;
  const x = lage ? lage.x : 40, y = lage ? lage.y : 120;
  let neu = null;
  try { neu = window.open("", NAME, `popup=yes,width=${b},height=${h},left=${x},top=${y}`); } catch (f) { neu = null; }
  if (!neu) { merken(AN, null); return; }
  w = neu;
  aufbauen();
  wacheStarten();
  melden();
}

// Die fertige Vorschau (ein .pw-info) ins Fenster stellen statt in die
// Planwand. Gibt false zurück, wenn kein Fenster offen ist.
export function vorschauInsFenster(el) {
  const f = vorschauFensterOffen();
  if (!f) return false;
  const d = f.document;
  let platz = d.querySelector(".vf-inhalt");
  if (!platz) { aufbauen(); platz = d.querySelector(".vf-inhalt"); }
  // hell/dunkel und Themenfarbe können inzwischen gewechselt haben
  for (const a of document.body.attributes) if (a.name !== "class") d.body.setAttribute(a.name, a.value);
  d.body.className = document.body.className + " vf-body";
  platz.innerHTML = "";
  platz.appendChild(el);
  el.classList.add("pw-info--eigen");
  return true;
}

export const imVorschauFenster = (el) => !!(el && el.classList && el.classList.contains("pw-info--eigen") && el.isConnected);

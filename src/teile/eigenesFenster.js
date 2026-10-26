// =================================================================
//  EIGENES FENSTER
//  Ein offenes Fenster der App (eine .dialog-huelle) zieht in ein
//  eigenes Browserfenster um, das man frei verschieben kann, auch auf
//  einen anderen Bildschirm (Wunsch Patrick 26. Oktober 2026, zuerst
//  fürs Auftragsfenster der Planwand).
//
//  Das Fenster ist dasselbe Stück Seite, nur umgehängt: React zeichnet
//  weiter darin, alle Knöpfe und Felder tun dasselbe wie vorher, und
//  die Planwand dahinter bleibt frei bedienbar. Die Gestaltung wird
//  mitgenommen (Stilblätter, hell oder dunkel, Themenfarbe).
//
//  Was dort eine Rückfrage oder ein weiteres Fenster öffnet (Löschen,
//  Zeichnung gross …), kommt auch dorthin, solange man in diesem
//  Fenster arbeitet. Wird das Fenster der App geschlossen, geht das
//  Browserfenster mit zu, und umgekehrt.
// =================================================================
import { alt } from "../bruecke.jsx";

const LAGE = "hofer.eigenesFenster.lage";
const offen = new Set();

function lageLesen() {
  try { return JSON.parse(localStorage.getItem(LAGE) || "null"); } catch (f) { return null; }
}
function lageMerken(w) {
  try {
    localStorage.setItem(LAGE, JSON.stringify({
      x: w.screenX, y: w.screenY, b: w.outerWidth, h: w.outerHeight }));
  } catch (f) { /* ohne Speicher eben nicht gemerkt */ }
}

export const eigeneFensterOffen = () => offen.size > 0;

// Beim Abmelden und vor dem Neuladen: alles zu
export function eigeneFensterZu() {
  offen.forEach((e) => e.schliessen());
}

// lage = { x, y } in Bildschirmpunkten (beim Herausziehen: dort, wo die
// Maus das Fenster hingezogen hat), sonst die zuletzt gemerkte Lage
// still: ohne Meldung, wenn der Browser das Fenster nicht aufgehen lässt
// (beim Öffnen von selbst bleibt es dann einfach in der App)
export function inEigenesFenster(huelle, zu, { titel, lage, still } = {}) {
  const dialog = huelle.firstElementChild || huelle;
  const r = dialog.getBoundingClientRect();
  const vorher = lageLesen();
  const breite = Math.round((vorher && !lage && vorher.b) || r.width + 16);
  const hoehe = Math.round((vorher && !lage && vorher.h) || r.height + 60);
  const x = Math.round(lage ? lage.x : vorher ? vorher.x : window.screenX + r.left);
  const y = Math.round(lage ? lage.y : vorher ? vorher.y : window.screenY + r.top);
  const w = window.open("", "hofer-" + Date.now(),
    `popup=yes,width=${breite},height=${hoehe},left=${x},top=${y}`);
  if (!w) {
    if (!still) alt.meldung("Der Browser hat das eigene Fenster blockiert. Oben rechts in der Adresszeile Pop-ups für das HoferTool erlauben.", "warn");
    return false;
  }

  const d = w.document;
  if (!d.head) d.documentElement.appendChild(d.createElement("head"));
  if (!d.body) d.documentElement.appendChild(d.createElement("body"));
  d.title = titel || document.title;
  // Gestaltung mitnehmen: die Regeln der Stilblätter als Text, damit
  // nichts neu geladen werden muss (Adressen darin voll ausgeschrieben),
  // fremde wie Google Fonts als Verweis; dazu die Klassen und Merkmale
  // an html und body (dunkel, Themenfarbe …)
  document.querySelectorAll("link[rel='stylesheet'], style").forEach((s) => {
    let text = null;
    try { if (s.sheet) text = Array.from(s.sheet.cssRules, (r) => r.cssText).join("\n"); } catch (f) { /* fremd */ }
    if (text !== null) {
      const basis = s.sheet.href || location.href;
      const st = d.createElement("style");
      st.textContent = text.replace(/url\((['"]?)(?!data:|#|[a-z]+:)([^'")]+)\1\)/gi,
        (_, q, u) => `url("${new URL(u, basis).href}")`);
      d.head.appendChild(st);
    } else if (s.href) {
      const l = d.createElement("link"); l.rel = "stylesheet"; l.href = s.href; d.head.appendChild(l);
    }
  });
  const ikon = document.querySelector("link[rel~='icon']");
  if (ikon) { const k = d.createElement("link"); k.rel = "icon"; k.href = ikon.href; d.head.appendChild(k); }
  for (const a of document.documentElement.attributes) d.documentElement.setAttribute(a.name, a.value);
  for (const a of document.body.attributes) d.body.setAttribute(a.name, a.value);

  huelle.classList.add("dialog-huelle--eigen");
  huelle.classList.remove("auftrag-huelle--unten");
  d.body.appendChild(huelle);

  // Wer im eigenen Fenster arbeitet, ist nicht untätig: sonst meldet
  // die Minute ohne Bedienung im Hauptfenster ab
  const aktiv = () => { if (alt.leerlaufAktiv) alt.leerlaufAktiv(); };
  ["pointerdown", "keydown", "wheel", "input"].forEach((art) =>
    d.addEventListener(art, aktiv, { capture: true, passive: true }));
  let bewegt = 0;
  d.addEventListener("mousemove", () => {
    if (Date.now() - bewegt > 3000) { bewegt = Date.now(); aktiv(); }
  }, { passive: true });

  // Escape schliesst das oberste Fenster hier drin: eine Rückfrage über
  // ihren Rand (wie ein Klick daneben), sonst das Fenster selbst
  d.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const huellen = d.querySelectorAll(".dialog-huelle");
    const oben = huellen[huellen.length - 1];
    if (!oben) return;
    e.preventDefault();
    if (oben === huelle) { zu(); return; }
    oben.dispatchEvent(new w.PointerEvent("pointerdown", { bubbles: true }));
    oben.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  });

  // Neue Fenster der App, während man hier arbeitet, kommen hierher
  const neue = new MutationObserver((meldungen) => {
    if (!d.hasFocus()) return;
    meldungen.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1 || !n.classList || !n.classList.contains("dialog-huelle")) return;
      d.body.appendChild(n);
      const f = n.querySelector("[data-fokus], [autofocus]") || n.querySelector("input, button");
      if (f) f.focus();
    }));
  });
  neue.observe(document.body, { childList: true });

  let fertig = false;
  const eintrag = {
    schliessen: () => {
      if (fertig) return;
      fertig = true;
      offen.delete(eintrag);
      neue.disconnect();
      wache.disconnect();
      clearInterval(zuPruefen);
      removeEventListener("pagehide", eintrag.schliessen);
      if (!w.closed) { lageMerken(w); w.close(); }
      // Rückfragen, die hier drüben noch offen waren, kommen zurück
      d.querySelectorAll(".dialog-huelle").forEach((n) => { if (n !== huelle) document.body.appendChild(n); });
      zu();
    },
  };
  offen.add(eintrag);
  // Das Fenster der App ging zu (Speichern, X …): Browserfenster mit
  const wache = new MutationObserver(() => { if (!huelle.isConnected) eintrag.schliessen(); });
  wache.observe(d.body, { childList: true });
  // Browserfenster selbst geschlossen: das Fenster der App auch
  const zuPruefen = setInterval(() => { if (w.closed) eintrag.schliessen(); }, 400);
  w.addEventListener("beforeunload", () => lageMerken(w));
  // Hauptfenster lädt neu oder geht zu: das eigene Fenster auch
  addEventListener("pagehide", eintrag.schliessen);
  w.focus();
  const f = huelle.querySelector("[data-fokus]");
  if (f) f.focus();
  return true;
}

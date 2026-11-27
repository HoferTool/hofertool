// =================================================================
//  KLEINE LEISTE BEIM MARKIEREN (wie die Minisymbolleiste in Word)
//  Wunsch Patrick 27. November 2026: „wenn man bei egal was für einer
//  Eingabe was markiert, soll automatisch so wie bei Word die
//  Farbpalette kommen in klein, mit Symbolen, die man einfügen kann“.
//
//  Markiert man in einem gewöhnlichen Textfeld (einzeilig oder
//  mehrzeilig) etwas, erscheint daneben eine kleine Blase mit Zeichen:
//  Ø ± ° ≤ ≥ × und aufklappbar die Form- und Lagetoleranzen. Ein Tipp
//  ersetzt das Markierte durch das Zeichen. Farben gibt es hier nicht,
//  weil reine Textfelder nur Text speichern (eine Farbe wäre nach dem
//  Speichern weg); Felder mit Format haben schon die Schreibleiste mit
//  Farben, Fett und Grösse, darum dort keine Blase.
//
//  Bewusst nur beim Markieren, nicht beim blossen Antippen: seit 1.749.0
//  will Patrick kein Ø mehr ständig über jedem Feld.
//  Ohne React, damit sie auch in eigenen Browserfenstern geht.
// =================================================================
import { FORM_LAGE } from "./zeichenListe.js";

const ZEICHEN = [
  ["Ø", "Durchmesser"], ["±", "Plus/Minus"], ["°", "Grad"],
  ["≤", "kleiner gleich"], ["≥", "grösser gleich"], ["×", "mal"],
];
const TEXT_TYPEN = new Set(["text", "search", ""]);

// Gewöhnliches Textfeld, in dem markiert werden kann, sonst null
function textfeld(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") return null;
  if (el.readOnly || el.disabled) return null;
  if (el.closest("[data-ohne-leiste], .login, .schreibleiste, .markier-blase")) return null;
  if (el.tagName === "INPUT") {
    const typ = (el.getAttribute("type") || "text").toLowerCase();
    if (!TEXT_TYPEN.has(typ)) return null;
    const im = (el.getAttribute("inputmode") || "").toLowerCase();
    if (im === "numeric" || im === "decimal" || im === "tel" || im === "email") return null;
  }
  return el;
}

export function markierBlaseAnbinden(d) {
  if (!d || d.__markierBlase) return;
  d.__markierBlase = true;
  const w = d.defaultView;
  let blase = null, feld = null, fl = null, zeigerX = null, beruehrt = false, plan = 0;

  function einfuegen(z) {
    if (!feld) return;
    if (d.activeElement !== feld) feld.focus({ preventScroll: true });
    let ok = false;
    // insertText behält das Rückgängig des Browsers und meldet React die Änderung
    try { ok = d.execCommand("insertText", false, z); } catch (f) { ok = false; }
    if (!ok) {
      const a = feld.selectionStart == null ? feld.value.length : feld.selectionStart;
      const b = feld.selectionEnd == null ? a : feld.selectionEnd;
      feld.setRangeText(z, a, b, "end");
      feld.dispatchEvent(new w.Event("input", { bubbles: true }));
    }
    verstecken();
  }

  function knopf(z, titel, tun, klasse) {
    const b = d.createElement("button");
    b.type = "button";
    b.className = "markier-blase__knopf" + (klasse ? " " + klasse : "");
    b.textContent = z;
    b.title = titel;
    b.setAttribute("aria-label", titel);
    // Schon beim Antippen handeln und den Fokus im Feld lassen, sonst geht
    // die Markierung verloren und am Tablet die Tastatur zu
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); tun(); });
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", (e) => { e.preventDefault(); if (e.detail === 0) tun(); });
    return b;
  }

  function bauen() {
    blase = d.createElement("div");
    blase.className = "markier-blase";
    blase.setAttribute("role", "toolbar");
    blase.setAttribute("aria-label", "Zeichen einfügen");
    blase.hidden = true;
    const reihe = d.createElement("div");
    reihe.className = "markier-blase__reihe";
    ZEICHEN.forEach(([z, t]) => reihe.appendChild(knopf(z, t + " " + z + " einfügen", () => einfuegen(z))));
    const flk = knopf("⌖▾", "Form- und Lagetoleranzen", () => { fl.hidden = !fl.hidden; legen(); }, "markier-blase__mehr");
    reihe.appendChild(flk);
    blase.appendChild(reihe);
    fl = d.createElement("div");
    fl.className = "markier-blase__formlage";
    fl.hidden = true;
    FORM_LAGE.forEach(([z, t]) => fl.appendChild(knopf(z, t + " einfügen", () => einfuegen(z), "gdt-knopf")));
    blase.appendChild(fl);
    blase.addEventListener("mousedown", (e) => e.preventDefault());
    d.body.appendChild(blase);
  }

  function legen() {
    plan = 0;
    if (!blase || blase.hidden || !feld) return;
    if (!feld.isConnected) { verstecken(); return; }
    const r = feld.getBoundingClientRect();
    const vw = w.innerWidth, vh = w.innerHeight;
    const bb = blase.offsetWidth, bh = blase.offsetHeight;
    // waagrecht dort, wo die Markierung losgelassen wurde, sonst am Feldanfang
    const mitte = zeigerX != null && zeigerX >= r.left - 20 && zeigerX <= r.right + 20 ? zeigerX : r.left + Math.min(r.width, 60);
    const x = Math.max(4, Math.min(mitte - bb / 2, vw - bb - 4));
    // Am Tablet und Handy legt das Gerät sein eigenes Menü (Kopieren …)
    // über die Markierung, darum dort unter das Feld, mit der Maus darüber
    let y = beruehrt ? r.bottom + 6 : r.top - bh - 6;
    if (beruehrt && y + bh > vh - 4) y = r.top - bh - 6;
    if (!beruehrt && y < 4) y = r.bottom + 6;
    y = Math.max(4, Math.min(y, vh - bh - 4));
    blase.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  const neuLegen = () => { if (blase && !blase.hidden && !plan) plan = w.requestAnimationFrame(legen); };

  function verstecken() {
    if (blase) { blase.hidden = true; if (fl) fl.hidden = true; }
    feld = null;
  }

  function pruefen() {
    const a = textfeld(d.activeElement);
    let markiert = false;
    try { markiert = !!a && a.selectionStart != null && a.selectionEnd > a.selectionStart; } catch (f) { markiert = false; }
    if (!markiert) { if (blase && !blase.hidden) verstecken(); return; }
    if (!blase) bauen();
    const neu = feld !== a || blase.hidden;
    feld = a;
    if (neu) {
      fl.hidden = true;
      // ans Ende, damit sie über neu geöffneten Fenstern liegt
      if (blase.nextSibling) d.body.appendChild(blase);
      blase.hidden = false;
    }
    legen();
  }
  // Markieren mit Maus, Finger, Umschalt + Pfeil, Strg + A oder Doppelklick:
  // selectionchange kommt nicht in jedem Browser für Textfelder, darum auch
  // select, Loslassen und Tasten
  let warte = 0;
  const bald = () => { if (!warte) warte = w.setTimeout(() => { warte = 0; pruefen(); }, 60); };
  d.addEventListener("selectionchange", bald);
  d.addEventListener("select", bald, true);
  d.addEventListener("pointerup", (e) => {
    if (blase && blase.contains(e.target)) return;
    zeigerX = e.clientX; beruehrt = e.pointerType === "touch" || e.pointerType === "pen";
    bald();
  }, true);
  d.addEventListener("keyup", (e) => { if (e.key !== "Escape") { zeigerX = null; beruehrt = false; bald(); } }, true);
  d.addEventListener("focusout", () => w.setTimeout(pruefen, 0), true);
  d.addEventListener("input", (e) => { if (blase && !blase.hidden && e.target === feld) pruefen(); }, true);
  // Escape schliesst nur die Blase (oberste Ebene), das Fenster darunter
  // bleibt; am Fenster statt am Dokument, damit es vor dem zentralen
  // Escape der Fenster (fensterUeberwachen in app.js) drankommt
  w.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || !blase || blase.hidden) return;
    e.preventDefault(); e.stopPropagation();
    verstecken();
  }, true);
  w.addEventListener("scroll", neuLegen, { capture: true, passive: true });
  w.addEventListener("resize", neuLegen, { passive: true });
  if (w.visualViewport) w.visualViewport.addEventListener("resize", neuLegen);
}

// =================================================================
//  SCHREIBLEISTE ÜBER JEDEM TEXTFELD
//  Wunsch Patrick 6. November 2026: „Füge über, wo man was angeben
//  kann, den Button hinzu mit dem grossen Durchmesserzeichen, und das
//  Zeugs mit Farben und dick soll auch überall verfügbar sein.“
//
//  Sobald ein Feld zum Schreiben den Fokus hat (Textfeld, mehrzeiliges
//  Feld, bearbeitbare Fläche), steht direkt darüber eine kleine Leiste:
//    - immer ein grosser Knopf Ø, der das Zeichen an der Schreibmarke
//      einfügt (das Zeichen fehlt auf Tablet- und Schweizer Tastaturen)
//    - in Feldern, die Schrift mit Format speichern (Fett, Kursiv …,
//      FettText.jsx: Info an der Maschine, Meldungen, Notizbücher und
//      die Dialoge mit B / I / U), dazu Farben, Fett und Grösse für den
//      markierten Text wie im Einrichtblatt
//  Reine Textfelder speichern keinen Format, darum dort nur Ø.
//
//  Ohne React, damit sie auch in eigenen Browserfenstern geht
//  (eigenesFenster.js bindet dort dasselbe an). Zahlen-, Passwort-,
//  Datums- und Ziffernfelder bekommen keine Leiste, ebenso die
//  Anmeldung; ein Bereich mit data-ohne-leiste schaltet sie ab.
// =================================================================
import { alt } from "../bruecke.jsx";

const ZEICHEN = "Ø";
const TEXT_TYPEN = new Set(["text", "search", ""]);
const FARBEN = [["Schwarz", null, "#000000"], ["Rot", "#e03030"], ["Blau", "#1f5fd6"], ["Grün", "#1a8f3c"], ["Orange", "#e07a00"]];
// Flächen, deren Inhalt FettText.jsx mit Farbe und Grösse speichert
const MIT_FORMAT = "[data-stilfeld], .nb-text__feld, .nb-tab__zelle";
const HINWEIS = "Zuerst den Text im Feld markieren, dann Farbe, Fett oder Grösse wählen.";
const GR_MIN = 8, GR_MAX = 60;

// Das Feld zum Schreiben, zu dem dieses Element gehört, oder null
function feldVon(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.closest("[data-ohne-leiste], .login, .schreibleiste")) return null;
  if (el.tagName === "TEXTAREA") return el.readOnly || el.disabled ? null : el;
  if (el.tagName === "INPUT") {
    const typ = (el.getAttribute("type") || "text").toLowerCase();
    if (!TEXT_TYPEN.has(typ) || el.readOnly || el.disabled) return null;
    const im = (el.getAttribute("inputmode") || "").toLowerCase();
    if (im === "numeric" || im === "decimal" || im === "tel" || im === "email") return null;
    return el;
  }
  if (!el.isContentEditable) return null;
  // die oberste bearbeitbare Fläche
  let f = el;
  while (f.parentElement && f.parentElement.isContentEditable) f = f.parentElement;
  return f;
}

export function schreibleisteAnbinden(d) {
  if (!d || d.__schreibleiste) return;
  d.__schreibleiste = true;
  const w = d.defaultView;
  let leiste = null, feld = null, format = false, gemerkt = null, plan = 0;

  const behalten = (e) => { e.preventDefault(); };
  const meldung = (t) => { if (alt.meldung) alt.meldung(t, "warn"); };

  // Markierung im Feld merken: der Farbwähler des Geräts nimmt sie weg
  d.addEventListener("selectionchange", () => {
    if (!feld || !format) return;
    const sel = d.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (feld.contains(r.commonAncestorContainer)) gemerkt = r.cloneRange();
  });

  function markierung() {
    if (!gemerkt || gemerkt.collapsed || !feld || !feld.contains(gemerkt.commonAncestorContainer)) return null;
    return gemerkt;
  }
  function zurueck(r) {
    const sel = d.getSelection();
    if (!sel) return;
    if (d.activeElement !== feld) feld.focus({ preventScroll: true });
    sel.removeAllRanges(); sel.addRange(r);
  }

  function zeichenEinfuegen() {
    if (!feld) return;
    if (format || feld.isContentEditable) {
      if (d.activeElement !== feld && gemerkt) zurueck(gemerkt);
      else if (d.activeElement !== feld) feld.focus({ preventScroll: true });
    } else if (d.activeElement !== feld) feld.focus({ preventScroll: true });
    let ok = false;
    try { ok = d.execCommand("insertText", false, ZEICHEN); } catch (f) { ok = false; }
    if (!ok && (feld.tagName === "INPUT" || feld.tagName === "TEXTAREA")) {
      // Ersatz für Browser ohne insertText: React merkt die Änderung am
      // input-Ereignis, weil der Wert nicht mehr dem gemerkten entspricht
      const a = feld.selectionStart == null ? feld.value.length : feld.selectionStart;
      const b = feld.selectionEnd == null ? a : feld.selectionEnd;
      feld.setRangeText(ZEICHEN, a, b, "end");
      feld.dispatchEvent(new w.Event("input", { bubbles: true }));
    }
  }

  // Farbe oder Grösse auf den markierten Text legen (wie markiert.jsx im
  // Einrichtblatt): Innen alte Angaben derselben Art weg, dann ein Span
  function formatieren(z) {
    const r = markierung();
    if (!r) { meldung(HINWEIS); return; }
    zurueck(r);
    const frag = r.extractContents();
    const weg = [];
    if ("farbe" in z) weg.push("color", "-webkit-text-fill-color");
    if ("groesse" in z) weg.push("font-size", "line-height");
    frag.querySelectorAll("span, font").forEach((s) => {
      weg.forEach((p) => s.style && s.style.removeProperty(p));
      if ("farbe" in z && s.tagName === "FONT") s.removeAttribute("color");
    });
    const sp = d.createElement("span");
    if (z.farbe) { sp.style.color = z.farbe; sp.style.setProperty("-webkit-text-fill-color", z.farbe); }
    if (z.groesse) { sp.style.fontSize = z.groesse + "px"; sp.style.lineHeight = "1.2"; }
    sp.appendChild(frag);
    r.insertNode(sp);
    const neu = d.createRange();
    neu.selectNodeContents(sp);
    zurueck(neu);
    gemerkt = neu.cloneRange();
    feld.dispatchEvent(new w.Event("input", { bubbles: true }));
  }
  function groesseAendern(schritt) {
    const r = markierung();
    if (!r) { meldung(HINWEIS); return; }
    let n = r.startContainer;
    if (n.nodeType !== 1) n = n.parentElement;
    if (n && !feld.contains(n)) n = feld;
    const jetzt = Math.round(parseFloat(w.getComputedStyle(n || feld).fontSize) || 16);
    formatieren({ groesse: Math.max(GR_MIN, Math.min(GR_MAX, jetzt + schritt)) });
  }
  function fett() {
    const r = markierung();
    if (!r) { meldung(HINWEIS); return; }
    zurueck(r);
    try { d.execCommand("bold", false, null); } catch (f) { /* egal */ }
    feld.dispatchEvent(new w.Event("input", { bubbles: true }));
  }

  function knopf(text, titel, tun, klasse) {
    const b = d.createElement("button");
    b.type = "button";
    b.className = "schreibleiste__knopf" + (klasse ? " " + klasse : "");
    b.innerHTML = text;
    b.title = titel;
    b.setAttribute("aria-label", titel);
    // Schon beim Antippen handeln und den Fokus im Feld lassen, sonst
    // geht am Tablet die Tastatur zu und die Markierung verloren
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); tun(); });
    b.addEventListener("mousedown", behalten);
    b.addEventListener("click", (e) => { e.preventDefault(); if (e.detail === 0) tun(); });
    return b;
  }

  function bauen() {
    leiste = d.createElement("div");
    leiste.className = "schreibleiste";
    leiste.setAttribute("role", "toolbar");
    leiste.setAttribute("aria-label", "Schreiben");
    leiste.setAttribute("data-schreibleiste", "");
    leiste.appendChild(knopf(ZEICHEN, "Durchmesserzeichen Ø einfügen", zeichenEinfuegen, "schreibleiste__zeichen"));
    const fmt = d.createElement("span");
    fmt.className = "schreibleiste__format";
    FARBEN.forEach(([name, wert, zeige]) => {
      const b = knopf("", name, () => formatieren({ farbe: wert }), "schreibleiste__farbe");
      b.style.setProperty("--f", zeige || wert);
      fmt.appendChild(b);
    });
    const wahl = d.createElement("label");
    wahl.className = "schreibleiste__knopf schreibleiste__farbe schreibleiste__wahl";
    wahl.title = "Andere Farbe wählen";
    const inp = d.createElement("input");
    inp.type = "color"; inp.value = "#000000";
    inp.addEventListener("change", () => formatieren({ farbe: inp.value.toLowerCase() }));
    wahl.appendChild(inp);
    fmt.appendChild(wahl);
    fmt.appendChild(knopf("<b>Fett</b>", "Fett", fett, "schreibleiste__fett"));
    fmt.appendChild(knopf("A−", "Kleiner", () => groesseAendern(-2)));
    fmt.appendChild(knopf("A+", "Grösser", () => groesseAendern(2)));
    fmt.appendChild(knopf("Normal", "Grösse wieder normal", () => formatieren({ groesse: null })));
    leiste.appendChild(fmt);
    leiste.addEventListener("mousedown", (e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); });
    d.body.appendChild(leiste);
  }

  function legen() {
    plan = 0;
    if (!leiste || !feld) return;
    if (!feld.isConnected) { zeigen(null); return; }
    if (leiste.classList.contains("schreibleiste--drin")) return;
    const r = feld.getBoundingClientRect();
    const vw = w.innerWidth;
    const lb = leiste.offsetWidth, lh = leiste.offsetHeight;
    // rechtsbündig über dem Feld: links steht meist die Beschriftung
    let x = Math.max(4, Math.min(r.right - lb, vw - lb - 4));
    let y = r.top - lh - 4;
    if (y < 4) y = Math.min(r.bottom + 4, w.innerHeight - lh - 4);
    leiste.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  const neuLegen = () => { if (feld && !plan) plan = w.requestAnimationFrame(legen); };

  function zeigen(f) {
    feld = f;
    format = !!(f && f.isContentEditable && f.matches(MIT_FORMAT));
    if (!f) { if (leiste) leiste.hidden = true; gemerkt = null; return; }
    if (!leiste) bauen();
    // Hat das Feld schon seine Knöpfe B / I / U (TextMitStil, Notizbuch),
    // kommt die Leiste gleich dort in die Reihe, statt sie zu überdecken;
    // im Notizbuch schlösse ein Tipp ausserhalb sonst das Textfeld
    const reihe = !format ? null
      : f.previousElementSibling && f.previousElementSibling.classList.contains("stilleiste") ? f.previousElementSibling
      : (f.closest("[data-nbedit]") && f.closest("[data-nbedit]").querySelector(".nb-textleiste")) || null;
    if (reihe) {
      if (leiste.parentNode !== reihe) reihe.appendChild(leiste);
    } else if (leiste.parentNode !== d.body || leiste.nextSibling) {
      // die Leiste ans Ende, damit sie über neu geöffneten Fenstern liegt
      d.body.appendChild(leiste);
    }
    leiste.classList.toggle("schreibleiste--drin", !!reihe);
    leiste.style.transform = "";
    leiste.classList.toggle("schreibleiste--format", format);
    leiste.hidden = false;
    legen();
  }

  d.addEventListener("focusin", (e) => {
    if (leiste && leiste.contains(e.target)) return;
    zeigen(feldVon(e.target));
  });
  d.addEventListener("focusout", (e) => {
    if (leiste && e.relatedTarget && leiste.contains(e.relatedTarget)) return;
    setTimeout(() => {
      const a = d.activeElement;
      if (leiste && a && leiste.contains(a)) return;
      if (!feldVon(a)) zeigen(null);
    }, 0);
  });
  w.addEventListener("scroll", neuLegen, { capture: true, passive: true });
  w.addEventListener("resize", neuLegen, { passive: true });
  if (w.visualViewport) w.visualViewport.addEventListener("resize", neuLegen);
  d.addEventListener("input", neuLegen, true);
}

if (typeof document !== "undefined") schreibleisteAnbinden(document);

// Schrift nur für markierten Text im Einrichtblatt (seit 1.406.0, Wunsch
// Patrick 5. November 2026: „Es soll nur die Sachen machen, welche
// markiert wurden“, Entscheid „Nur markierten Text“ wie in Word).
//
// Die Felder, in die man selbst schreibt (Tätigkeit, Mass, Notiz Mitte im
// Platz, die Textfelder im Kopf und die Bemerkung), sind darum keine
// <input> mehr, sondern bearbeitbare Flächen (RichFeld). Der Text selbst
// bleibt wie bisher als reiner Text gespeichert, weil Vorbereiten,
// Werkzeugwechsel, Suche und Stammdaten ihn so lesen. Die Formatierung
// steht daneben als kleines HTML (nur <span> mit Farbe, Dicke, Grösse
// und <br>) unter fmt. Passt das HTML nicht mehr zum Text (etwa weil die
// Stammdaten anderswo geändert wurden), gilt nur der Text.
import { useLayoutEffect, useRef } from "react";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const gleich = (s) => String(s == null ? "" : s).replace(/ /g, " ").replace(/\r/g, "").trim();

// Reiner Text als HTML
export function textHtml(text) {
  return esc(String(text == null ? "" : text)).replace(/\n/g, "<br>");
}

// Nur erlaubtes behalten: Text, Zeilenumbrüche und Spans mit Farbe,
// Dicke und Grösse. Was Browser beim Tippen einfügen (div, b, font,
// &nbsp;), wird dabei vereinheitlicht.
export function htmlSauber(html) {
  if (!html) return { html: "", text: "", formatiert: false };
  const t = document.createElement("template");
  t.innerHTML = String(html);
  // Jeder Text bekommt die Schrift aller Spans darüber zusammen (innen
  // gewinnt). So entstehen beim mehrmaligen Formatieren keine
  // verschachtelten Spans, und gleiche Nachbarn werden ein Span.
  const stilVon = (el, erbe) => {
    const s = { ...erbe };
    const tag = el.tagName;
    let farbe = el.style && el.style.color;
    if (!farbe && tag === "FONT" && el.getAttribute("color")) farbe = el.getAttribute("color");
    let dicke = el.style && el.style.fontWeight;
    if (!dicke && (tag === "B" || tag === "STRONG")) dicke = "700";
    if (dicke === "bold") dicke = "700";
    if (dicke === "normal") dicke = "400";
    const groesse = el.style && /^\d+(\.\d+)?px$/.test(el.style.fontSize || "") ? el.style.fontSize : "";
    if (farbe) s.farbe = farbe;
    if (dicke === "700" || dicke === "400") s.dicke = dicke;
    if (groesse) s.groesse = groesse;
    return s;
  };
  const stilText = (s) => {
    const a = [];
    if (s.farbe) a.push("color:" + s.farbe, "-webkit-text-fill-color:" + s.farbe);
    if (s.dicke) a.push("font-weight:" + s.dicke);
    if (s.groesse) a.push("font-size:" + s.groesse, "line-height:1.15");
    return a.join(";");
  };
  const teile = [];
  const endetUmbruch = () => !teile.length || /\n$/.test(teile[teile.length - 1].t);
  const gehen = (knoten, erbe, oben) => {
    knoten.childNodes.forEach((k, i) => {
      if (k.nodeType === 3) { teile.push({ t: k.nodeValue.replace(/\u00a0/g, " ").replace(/\r/g, ""), st: stilText(erbe) }); return; }
      if (k.nodeType !== 1) return;
      if (k.tagName === "BR") { teile.push({ t: "\n", st: stilText(erbe) }); return; }
      const block = k.tagName === "DIV" || k.tagName === "P";
      if (block && (i > 0 || !oben) && !endetUmbruch()) teile.push({ t: "\n", st: "" });
      gehen(k, block ? erbe : stilVon(k, erbe), false);
    });
  };
  gehen(t.content, {}, true);
  let text = teile.map((x) => x.t).join("");
  const ende = text.replace(/\n+$/, "").length;
  let h = "", formatiert = false, pos = 0, lauf = null;
  const raus = () => {
    if (!lauf || !lauf.t) return;
    const inhalt = esc(lauf.t).replace(/\n/g, "<br>");
    if (lauf.st && lauf.t.replace(/\n/g, "")) { formatiert = true; h += '<span style="' + esc(lauf.st) + '">' + inhalt + "</span>"; }
    else h += inhalt;
  };
  teile.forEach((x) => {
    let tt = x.t;
    if (pos + tt.length > ende) tt = tt.slice(0, Math.max(0, ende - pos));
    pos += x.t.length;
    if (!tt) return;
    if (lauf && lauf.st === x.st) lauf.t += tt;
    else { raus(); lauf = { t: tt, st: x.st }; }
  });
  raus();
  text = text.slice(0, ende);
  if (!formatiert) h = textHtml(text);
  return { html: h, text, formatiert };
}

// Gilt die Formatierung noch für diesen Text?
export function fmtGueltig(html, text) {
  if (!html) return false;
  const s = htmlSauber(html);
  return s.formatiert && gleich(s.text) === gleich(text);
}

// Text mit Formatierung zum Anzeigen (auf dem Blatt, im Druck, im Pad)
export function MitFormat({ html, text }) {
  if (fmtGueltig(html, text)) return <span className="eba-fmt" dangerouslySetInnerHTML={{ __html: htmlSauber(html).html }} />;
  return text == null ? "" : String(text);
}

// Die zuletzt markierte Stelle in einem RichFeld. Gemerkt, damit auch der
// Farbwähler des Geräts (der die Markierung wegnimmt) und ein Tipp am
// iPad noch wissen, was markiert war.
let gemerkt = null;
if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const n = r.commonAncestorContainer;
    const el = (n.nodeType === 1 ? n : n.parentElement);
    const feld = el && el.closest ? el.closest("[data-rich]") : null;
    if (feld) gemerkt = { el: feld, range: r.cloneRange() };
  });
}

// Ist in diesem Feld (oder irgendeinem, ohne Angabe) etwas markiert?
export function markierung(feld) {
  const g = gemerkt;
  if (!g || !g.el.isConnected || g.range.collapsed) return null;
  if (feld && g.el !== feld) return null;
  if (!g.el.contains(g.range.commonAncestorContainer)) return null;
  return g;
}

// Grösse an der Markierung in Punkten, für − und +
export function markierteGroesse(feld, start = 12) {
  const g = markierung(feld);
  if (!g) return null;
  // Nur eine selbst gesetzte Grösse zählt, nicht die Schrift des Fensters,
  // sonst würde ein Schritt im Fenster (16) auf dem Blatt (12) ein Sprung.
  let n = g.range.startContainer;
  let el = n.nodeType === 1 ? n : n.parentElement;
  while (el && el !== g.el) {
    const fs = el.style && el.style.fontSize;
    if (fs && /px$/.test(fs)) return Math.round(parseFloat(fs));
    el = el.parentElement;
  }
  return start;
}

// Farbe, Dicke oder Grösse auf den markierten Text legen. z hat farbe
// ("#rrggbb"), fett (true/false) und/oder groesse (Zahl, null = wieder
// normal). Gibt false zurück, wenn nichts markiert ist.
export function markiertFormatieren(z, feld) {
  const g = markierung(feld);
  if (!g) return false;
  const r = g.range;
  const frag = r.extractContents();
  const weg = [];
  if ("farbe" in z) weg.push("color", "-webkit-text-fill-color");
  if ("fett" in z) weg.push("font-weight");
  if ("groesse" in z) weg.push("font-size", "line-height");
  frag.querySelectorAll("span, font, b, strong").forEach((s) => {
    weg.forEach((p) => s.style && s.style.removeProperty(p));
    if ("fett" in z && (s.tagName === "B" || s.tagName === "STRONG")) {
      const sp = document.createElement("span");
      while (s.firstChild) sp.appendChild(s.firstChild);
      s.replaceWith(sp);
    }
    if ("farbe" in z && s.tagName === "FONT") s.removeAttribute("color");
  });
  const sp = document.createElement("span");
  if (z.farbe) { sp.style.color = z.farbe; sp.style.setProperty("-webkit-text-fill-color", z.farbe); }
  if ("fett" in z) sp.style.fontWeight = z.fett ? "700" : "400";
  if (z.groesse) { sp.style.fontSize = z.groesse + "px"; sp.style.lineHeight = "1.15"; }
  sp.appendChild(frag);
  r.insertNode(sp);
  const neu = document.createRange();
  neu.selectNodeContents(sp);
  const sel = document.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(neu); }
  gemerkt = { el: g.el, range: neu.cloneRange() };
  g.el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

// Bearbeitbare Fläche statt <input>/<textarea>. aendern(text, html):
// html nur, wenn etwas formatiert ist, sonst null.
export function RichFeld({ text, html, aendern, einzeilig, className, style, platzhalter, onFocus, ...rest }) {
  const ref = useRef(null);
  const zuletzt = useRef(null);
  const soll = fmtGueltig(html, text) ? htmlSauber(html).html : textHtml(text);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && soll !== zuletzt.current) { el.innerHTML = soll; zuletzt.current = soll; }
  }, [soll]);
  const lesen = () => {
    const el = ref.current;
    if (!el) return;
    let s = htmlSauber(el.innerHTML);
    if (einzeilig && /\n/.test(s.text)) s = htmlSauber(s.html.replace(/<br>/g, " "));
    if (!s.text) { el.innerHTML = ""; }
    zuletzt.current = s.formatiert ? htmlSauber(s.html).html : textHtml(s.text);
    aendern(s.text, s.formatiert ? s.html : null);
  };
  return <div ref={ref} contentEditable suppressContentEditableWarning data-rich="" role="textbox"
    aria-multiline={einzeilig ? undefined : "true"} data-platzhalter={platzhalter || ""}
    className={"eba-rich" + (einzeilig ? " eba-rich--zeile" : "") + (className ? " " + className : "")} style={style}
    onInput={lesen} onFocus={onFocus}
    onKeyDown={(e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!einzeilig) document.execCommand("insertLineBreak");
    }}
    onPaste={(e) => {
      e.preventDefault();
      const t = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
      document.execCommand("insertText", false, einzeilig ? t.replace(/\s*\n\s*/g, " ") : t);
    }}
    {...rest} />;
}

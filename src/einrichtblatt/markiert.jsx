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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { ZEICHEN, FORM_LAGE } from "../teile/zeichenListe.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const gleich = (s) => String(s == null ? "" : s).replace(/ /g, " ").replace(/\r/g, "").trim();

// Reiner Text als HTML
export function textHtml(text) {
  return esc(String(text == null ? "" : text)).replace(/\n/g, "<br>");
}

// Nur erlaubtes behalten: Text, Zeilenumbrüche und Spans mit Farbe,
// Dicke und Grösse. Was Browser beim Tippen einfügen (div, b, font,
// &nbsp;), wird dabei vereinheitlicht.
// Ausrichtung links / Mitte / rechts gilt fürs ganze Feld (seit 1.576.0,
// Wunsch Patrick 16. November 2026: „überall, wo man mit Farbpalette und
// dick bearbeiten kann, auch zentrieren oder rechts/links bündig“). Sie
// steht als Vermerk vorne im HTML, so braucht es keine neue Spalte.
const AUSR = /^\s*<!--ausr:(left|center|right)-->/;
export function ausrVon(html) {
  const m = AUSR.exec(String(html || ""));
  return m ? m[1] : "";
}
function ohneAusr(html) { return String(html || "").replace(AUSR, ""); }
// Für die Anzeige über innerHTML: Vermerk als Block mit text-align
export function anzeigeHtml(html) {
  const a = ausrVon(html);
  return a ? '<div style="text-align:' + a + '">' + ohneAusr(html) + "</div>" : String(html || "");
}

export function htmlSauber(html) {
  if (!html) return { html: "", text: "", formatiert: false, ausr: "" };
  const ausr = ausrVon(html);
  const t = document.createElement("template");
  t.innerHTML = ohneAusr(html);
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
  if (ausr) { h = "<!--ausr:" + ausr + "-->" + h; formatiert = true; }
  return { html: h, text, formatiert, ausr };
}

// Gilt die Formatierung noch für diesen Text?
export function fmtGueltig(html, text) {
  if (!html) return false;
  const s = htmlSauber(html);
  return s.formatiert && gleich(s.text) === gleich(text);
}

// Text mit Formatierung zum Anzeigen (auf dem Blatt, im Druck, im Pad)
export function MitFormat({ html, text }) {
  if (fmtGueltig(html, text)) {
    const s = htmlSauber(html);
    return <span className={"eba-fmt" + (s.ausr ? " eba-fmt--ausr" : "")} style={s.ausr ? { textAlign: s.ausr } : undefined}
      data-ausr={s.ausr || undefined} dangerouslySetInnerHTML={{ __html: ohneAusr(s.html) }} />;
  }
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

// Vergisst die gemerkte Markierung, etwa beim Antippen des Werkzeugbilds:
// dann gilt eine Farbe oben der Werkzeugmarkierung, nicht altem Text
export function markierungVergessen() { gemerkt = null; }

// Ist in diesem Feld (oder irgendeinem, ohne Angabe) etwas markiert?
export function markierung(feld) {
  const g = gemerkt;
  if (!g || !g.el.isConnected || g.range.collapsed) return null;
  if (feld && g.el !== feld) return null;
  if (!g.el.contains(g.range.commonAncestorContainer)) return null;
  return g;
}

// Das Feld, in dem zuletzt die Schreibmarke stand (auch ohne Markierung):
// Ausrichten braucht keinen markierten Text
export function aktivesFeld(feld) {
  const g = gemerkt;
  if (!g || !g.el.isConnected) return null;
  if (feld && g.el !== feld) return null;
  return g.el;
}

// Ganzes Feld links, zentriert oder rechts. Gibt false zurück, wenn kein
// Feld gewählt ist.
export function feldAusrichten(a, feld) {
  const el = aktivesFeld(feld);
  if (!el) return false;
  el.dataset.ausr = a;
  el.style.textAlign = a;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

// Zeichen wie Ø oder ± an der Schreibmarke im zuletzt angetippten Feld
// einsetzen (seit 1.749.0, unter „Zeichen“ in der MarkierLeiste)
export function zeichenEinsetzen(z, feld) {
  const g = gemerkt;
  if (!g || !g.el.isConnected || (feld && g.el !== feld)) return false;
  if (g.el.hasAttribute("data-nur-lesen") || !g.el.contains(g.range.commonAncestorContainer)) return false;
  g.el.focus({ preventScroll: true });
  const sel = document.getSelection();
  sel.removeAllRanges(); sel.addRange(g.range);
  let ok = false;
  try { ok = document.execCommand("insertText", false, z); } catch (f) { ok = false; }
  if (!ok) {
    const r = g.range; r.deleteContents();
    const t = document.createTextNode(z); r.insertNode(t);
    r.setStartAfter(t); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    g.el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
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
// nurLesen: Text, den man hier nicht ändert (aus dem Werkzeug, fest im
// Kopf), aber markieren und formatieren kann (seit 1.462.0, Wunsch
// Patrick 10. November 2026). Tippen, Einfügen, Ausschneiden und Ziehen
// sperrt das Feld; die Leiste ändert das HTML direkt und meldet es mit
// einem input-Ereignis, das geht weiter.
export function RichFeld({ text, html, aendern, einzeilig, nurLesen, className, style, platzhalter, onFocus, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !nurLesen) return;
    const sperren = (e) => e.preventDefault();
    el.addEventListener("beforeinput", sperren);
    el.addEventListener("drop", sperren);
    el.addEventListener("cut", sperren);
    return () => { el.removeEventListener("beforeinput", sperren); el.removeEventListener("drop", sperren); el.removeEventListener("cut", sperren); };
  }, [nurLesen]);
  const zuletzt = useRef(null);
  const soll = fmtGueltig(html, text) ? htmlSauber(html).html : textHtml(text);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && soll !== zuletzt.current) {
      const a = ausrVon(soll);
      el.innerHTML = ohneAusr(soll);
      if (a) el.dataset.ausr = a; else delete el.dataset.ausr;
      el.style.textAlign = a;
      zuletzt.current = soll;
    }
  }, [soll]);
  const lesen = () => {
    const el = ref.current;
    if (!el) return;
    let s = htmlSauber(el.innerHTML);
    if (einzeilig && /\n/.test(s.text)) s = htmlSauber(s.html.replace(/<br>/g, " "));
    if (!s.text) { el.innerHTML = ""; }
    const a = el.dataset.ausr || "";
    let h = s.formatiert ? s.html : null;
    if (a && s.text) h = "<!--ausr:" + a + "-->" + (s.formatiert ? s.html : textHtml(s.text));
    zuletzt.current = h ? htmlSauber(h).html : textHtml(s.text);
    aendern(s.text, h);
  };
  return <div ref={ref} contentEditable suppressContentEditableWarning data-rich="" role="textbox"
    aria-multiline={einzeilig ? undefined : "true"} data-platzhalter={platzhalter || ""}
    className={"eba-rich" + (einzeilig ? " eba-rich--zeile" : "") + (nurLesen ? " eba-rich--lesen" : "") + (className ? " " + className : "")} style={style}
    data-nur-lesen={nurLesen ? "" : undefined} inputMode={nurLesen ? "none" : undefined}
    onInput={lesen} onFocus={onFocus}
    onKeyDown={(e) => {
      // Nur lesen: Pfeile, Markieren und Kopieren gehen, alles andere nicht
      if (nurLesen && !e.ctrlKey && !e.metaKey && (e.key.length === 1 || ["Backspace", "Delete", "Enter", "Tab"].includes(e.key))) {
        if (e.key !== "Tab") e.preventDefault();
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!einzeilig) document.execCommand("insertLineBreak");
    }}
    onPaste={(e) => {
      e.preventDefault();
      if (nurLesen) return;
      const t = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
      document.execCommand("insertText", false, einzeilig ? t.replace(/\s*\n\s*/g, " ") : t);
    }}
    {...rest} />;
}

// Die Leiste oben für markierten Text: feste Farben und Farbwähler des
// Geräts, Dünn / Fett, Grösse. Gebaut fürs Einrichtblatt (1.406.0,
// 1.462.0), seit 1.518.0 auch für die Wartung mit Text, damit beide
// gleich aussehen. ohneMarkierung(z): was ohne markierten Text geschieht
// (true = erledigt), sonst ein Hinweis. start: Grösse ohne eigene Angabe.
export const MARKIER_FARBEN = [["Schwarz", "#000000"], ["Rot", "#e03030"], ["Blau", "#1f5fd6"], ["Grün", "#1a8f3c"], ["Orange", "#e07a00"]];
export function MarkierLeiste({ ohneMarkierung, hinweis, feld, start = 12, min = 6, max = 40 }) {
  const behalten = (e) => e.preventDefault();
  const sagen = () => alt.meldung(hinweis || "Zuerst den Text markieren, dann Farbe, Dünn/Fett oder Grösse wählen.", "warn");
  const tun = (z) => {
    if (markiertFormatieren(z, feld)) return;
    if (ohneMarkierung && ohneMarkierung(z)) return;
    sagen();
  };
  const ausrichten = (a) => {
    if (feldAusrichten(a, feld)) return;
    alt.meldung("Zuerst ins Feld tippen, dann links, Mitte oder rechts wählen.", "warn");
  };
  const gr = (d) => {
    const g = markierteGroesse(feld, start);
    if (!g) { sagen(); return; }
    tun({ groesse: Math.max(min, Math.min(max, g + d)) });
  };
  return (
    <span className="eba-schriftleiste" data-schriftleiste="" data-markierleiste="">
      <span className="eba-pf-geostil" data-pf-geostil="">
        {MARKIER_FARBEN.map(([name, wert]) => <button key={wert} type="button" title={name} aria-label={name} onMouseDown={behalten}
          data-pf-geofarbe={wert} className="eba-pf-geofarbe" style={{ "--f": wert }} onClick={() => tun({ farbe: wert })} />)}
        <label className="eba-pf-geofarbe eba-pf-geofarbe--waehler" style={{ "--f": "#000000" }} title="Andere Farbe wählen"
          aria-label="Andere Farbe wählen" onMouseDown={behalten}>
          <input type="color" data-pf-geowahl="" defaultValue="#000000" onChange={(e) => tun({ farbe: e.target.value.toLowerCase() })} /></label>
        <span className="eba-pf-geodicke">
          <button type="button" data-pf-geodicke="duenn" onMouseDown={behalten} onClick={() => tun({ fett: false })}>Dünn</button>
          <button type="button" data-pf-geodicke="fett" onMouseDown={behalten} onClick={() => tun({ fett: true })}><b>Fett</b></button>
        </span>
      </span>
      <span className="eba-pf-geogroesse" data-pf-geogroesse="">
        <span>Grösse</span>
        <button type="button" data-pf-geogr="auto" onMouseDown={behalten} onClick={() => tun({ groesse: null })}>Normal</button>
        <button type="button" data-pf-geogr="minus" aria-label="Kleiner" onMouseDown={behalten} onClick={() => gr(-1)}>−</button>
        <button type="button" data-pf-geogr="plus" aria-label="Grösser" onMouseDown={behalten} onClick={() => gr(1)}>+</button>
        <GroesseZahl min={min} max={max} feld={feld} start={start} setzen={(g) => tun({ groesse: g })} />
      </span>
      <span className="eba-pf-ausr" data-pf-ausr="">
        {AUSR_KNOEPFE.map(([a, titel]) => <button key={a} type="button" title={titel} aria-label={titel}
          data-pf-ausr-knopf={a} onMouseDown={behalten} onClick={() => ausrichten(a)}><AusrZeichen a={a} /></button>)}
      </span>
      <span className="eba-pf-zeichen" data-pf-zeichen="">
        <span>Zeichen</span>
        {ZEICHEN.map(([z, titel]) => <button key={z} type="button"
          title={titel} aria-label={titel} data-pf-zeichen-knopf={z} onMouseDown={behalten}
          onClick={() => { if (!zeichenEinsetzen(z, feld)) alt.meldung("Zuerst ins Feld tippen, dann das Zeichen wählen.", "warn"); }}>{z}</button>)}
        <FormLage behalten={behalten} einsetzen={(z) => { if (!zeichenEinsetzen(z, feld)) alt.meldung("Zuerst ins Feld tippen, dann das Zeichen wählen.", "warn"); }} />
      </span>
    </span>
  );
}

// Schriftgrösse als Zahl (seit 1.786.0, Wunsch Patrick 24. November 2026:
// „auch per Zahleingabe einstellen“). Enter oder Verlassen setzt sie auf
// die gemerkte Markierung; das Feld zeigt die Grösse an der Markierung.
function GroesseZahl({ min, max, feld, start, setzen }) {
  const ref = useRef(null);
  const zuletzt = useRef("");
  useEffect(() => {
    const neu = () => {
      const el = ref.current;
      if (!el || document.activeElement === el) return;
      const g = markierteGroesse(feld, start);
      el.value = g ? String(g) : "";
    };
    document.addEventListener("selectionchange", neu);
    return () => document.removeEventListener("selectionchange", neu);
  }, [feld, start]);
  const setzenAusFeld = () => {
    const el = ref.current;
    const v = String((el && el.value) || "").trim();
    if (!v || v === zuletzt.current) return;
    const n = Math.round(parseFloat(v.replace(",", ".")));
    if (!isFinite(n)) return;
    const g = Math.max(min, Math.min(max, n));
    el.value = String(g);
    zuletzt.current = String(g);
    setzen(g);
  };
  return <input ref={ref} type="number" inputMode="numeric" min={min} max={max} step="1" placeholder="Zahl"
    className="eba-pf-geozahl" data-pf-geozahl="" aria-label="Schriftgrösse als Zahl"
    title={"Schriftgrösse als Zahl (" + min + " bis " + max + "), Enter setzt sie"}
    onFocus={(e) => { zuletzt.current = e.target.value; }}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); zuletzt.current = ""; setzenAusFeld(); } }}
    onBlur={setzenAusFeld} />;
}

// Knöpfe und Zeichen für die Ausrichtung (auch in der Schreibleiste)
export const AUSR_KNOEPFE = [["left", "Linksbündig"], ["center", "Zentriert"], ["right", "Rechtsbündig"]];
export function AusrZeichen({ a }) {
  const x = (i) => (a === "left" ? 1 : a === "right" ? 15 - [14, 9, 14, 9][i] : (15 - [14, 9, 14, 9][i]) / 2 + 0.5);
  return <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => <rect key={i} x={x(i)} y={1 + i * 3.4} width={[14, 9, 14, 9][i]} height="1.8" rx=".9" fill="currentColor" />)}
  </svg>;
}

// Text mit Formatierung als HTML zum Hineinsetzen (gültig oder nur Text)
export function formatHtml(html, text) {
  return fmtGueltig(html, text) ? anzeigeHtml(htmlSauber(html).html) : textHtml(text);
}

// Form- und Lagetoleranzen aufklappbar (seit 1.867.0, Wunsch Patrick
// 26. November 2026), auch beim Soll der Prüfmasse gebraucht
export function FormLage({ behalten, einsetzen }) {
  const [auf, setAuf] = useState(false);
  return (
    <span className="formlage">
      <button type="button" title="Form- und Lagetoleranzen" aria-label="Form- und Lagetoleranzen" data-formlage-auf=""
        className={auf ? "an" : ""} onMouseDown={behalten} onClick={() => setAuf(!auf)}>⌖▾</button>
      {auf && <span className="formlage__liste" data-formlage-liste="">
        {FORM_LAGE.map(([z, titel]) => <button key={z} type="button" title={titel + " einfügen"} aria-label={titel}
          data-formlage-knopf={z} onMouseDown={behalten} onClick={() => einsetzen(z)}>{z}</button>)}
      </span>}
    </span>
  );
}

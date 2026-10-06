// =================================================================
//  TEXT MIT FETT, KURSIV UND UNTERSTRICHEN
//  Für die Info an der Maschine im Pad Mode (Wunsch Patrick
//  5. Oktober 2026). Auf dem Tablet gibt es keine Tastenkürzel, darum
//  drei Knöpfe B, I, U. Sie wirken auf zwei Arten, wie in Word:
//    - Text markiert (oder Cursor in einem Wort): das wird umgeschaltet
//    - nichts markiert: Knopf ist an, alles Weitergeschriebene ist so,
//      bis man ihn wieder antippt
//  Das Feld ist darum ein bearbeitbarer Bereich statt eines Textfelds;
//  der Browser kann beides von sich aus (execCommand).
//
//  Gespeichert wird nur ein kleiner, sicherer Teil von HTML: <b>, <i>,
//  <u> und <br>. Text ohne Auszeichnung bleibt reiner Text. Ältere
//  Einträge mit **fett** werden weiter fett gezeigt.
//    <FettText text="..." />     zeigt gespeicherten Text an
//    <TextMitStil ... />         Eingabefeld mit den drei Knöpfen
//    stilWert(element)           liest das Feld als Speichertext
//    infoTeilen(text), infoZusammen(schrift, text)
//                                Schriftgrösse, die vorne im Text steht
// =================================================================
import { useEffect, useRef, useState } from "react";

const ALT_FETT = /\*\*([^*\n]+?)\*\*/g;
const IST_HTML = /<(b|i|u|br|strong|em)\b[^>]*>/i;

const escHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Gespeicherten Text in sicheres HTML für das Eingabefeld umwandeln
function alsHtml(text) {
  text = text || "";
  if (IST_HTML.test(text)) return sauber(text);
  return escHtml(text).replace(ALT_FETT, "<b>$1</b>").replace(/\n/g, "<br>");
}

// Liest beliebiges HTML (auch was Safari oder Chrome beim Bearbeiten
// erzeugen, etwa <div> je Zeile oder <span style="font-weight:bold">)
// und gibt nur Text, <b>, <i>, <u> und <br> zurück.
function sauber(html) {
  const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
  return serialisieren(doc.body.firstChild).replace(/(<br>)+$/, "");
}

function serialisieren(knoten) {
  let aus = "";
  knoten.childNodes.forEach((k, nr) => {
    if (k.nodeType === 3) { aus += escHtml(k.nodeValue.replace(/ /g, " ")); return; }
    if (k.nodeType !== 1) return;
    const tag = k.tagName.toLowerCase();
    if (tag === "br") { aus += "<br>"; return; }
    let innen = serialisieren(k);
    const st = k.style || {};
    const fett = tag === "b" || tag === "strong" || /^(bold|[6-9]00)$/.test(st.fontWeight || "");
    const kursiv = tag === "i" || tag === "em" || st.fontStyle === "italic";
    const unter = tag === "u" || /underline/.test(st.textDecoration || st.textDecorationLine || "");
    if (innen) {
      if (unter) innen = "<u>" + innen + "</u>";
      if (kursiv) innen = "<i>" + innen + "</i>";
      if (fett) innen = "<b>" + innen + "</b>";
    }
    // Zeilen als <div> oder <p>: Zeilenumbruch davor, ausser ganz am Anfang
    if ((tag === "div" || tag === "p") && nr > 0 && !/<br>$/.test(aus)) aus += "<br>";
    aus += innen;
  });
  return aus;
}

// Fürs Speichern: ohne Auszeichnung reiner Text mit Zeilenumbrüchen
export function stilWert(el) {
  const html = sauber(el.innerHTML);
  if (/<(b|i|u)>/.test(html)) return html.trim();
  const tmp = document.createElement("div");
  tmp.innerHTML = html.replace(/<br>/g, "\n");
  return tmp.textContent.trim();
}

// Anzeige als React-Elemente, nie über innerHTML
function zuReact(knoten, weg) {
  const teile = [];
  knoten.childNodes.forEach((k, i) => {
    const key = weg + "." + i;
    if (k.nodeType === 3) teile.push(k.nodeValue);
    else if (k.nodeType === 1) {
      const tag = k.tagName.toLowerCase();
      if (tag === "br") teile.push(<br key={key} />);
      else if (tag === "b") teile.push(<strong key={key}>{zuReact(k, key)}</strong>);
      else if (tag === "i") teile.push(<em key={key}>{zuReact(k, key)}</em>);
      else if (tag === "u") teile.push(<u key={key}>{zuReact(k, key)}</u>);
      else teile.push(...zuReact(k, key));
    }
  });
  return teile;
}

// Die Schriftgrösse der Info steht als unsichtbarer Vermerk vorne im
// Text, damit dafür keine neue Spalte in der Datenbank nötig ist
const SCHRIFT = /^<!--schrift:([a-z]+)-->/;
export function infoTeilen(text) {
  const t = text || "";
  const m = t.match(SCHRIFT);
  return m ? { schrift: m[1], text: t.slice(m[0].length) } : { schrift: "auto", text: t };
}
export function infoZusammen(schrift, text) {
  if (!text) return "";
  return (schrift && schrift !== "auto" ? "<!--schrift:" + schrift + "-->" : "") + text;
}

export function FettText({ text }) {
  text = infoTeilen(text).text;
  const doc = new DOMParser().parseFromString("<div>" + alsHtml(text) + "</div>", "text/html");
  return <>{zuReact(doc.body.firstChild, "t")}</>;
}

const KNOEPFE = [
  { befehl: "bold", zeichen: "B", name: "Fett", stil: { fontWeight: 900 } },
  { befehl: "italic", zeichen: "I", name: "Kursiv", stil: { fontStyle: "italic", fontFamily: "Georgia, serif" } },
  { befehl: "underline", zeichen: "U", name: "Unterstrichen", stil: { textDecoration: "underline" } },
];

// Eingabefeld mit den Knöpfen. Die Knöpfe handeln schon beim Antippen
// (pointerdown) und verhindern dort, dass das Feld den Fokus verliert,
// sonst wäre auf dem Tablet die Markierung weg und die Tastatur zu.
export function TextMitStil({ id, wert, platzhalter, erstes }) {
  const feld = useRef(null);
  const [an, setAn] = useState({});

  useEffect(() => {
    feld.current.innerHTML = alsHtml(wert);
    try { document.execCommand("styleWithCSS", false, false); } catch (f) { /* egal */ }
    // Knöpfe zeigen, ob an der Cursorstelle fett, kursiv oder unterstrichen gilt
    const pruefen = () => {
      const sel = document.getSelection();
      if (!feld.current || !sel || !feld.current.contains(sel.anchorNode)) return;
      const neu = {};
      KNOEPFE.forEach((k) => { try { neu[k.befehl] = document.queryCommandState(k.befehl); } catch (f) { /* egal */ } });
      setAn(neu);
    };
    document.addEventListener("selectionchange", pruefen);
    return () => document.removeEventListener("selectionchange", pruefen);
  }, []);

  const druecken = (e, befehl) => {
    e.preventDefault();
    const el = feld.current;
    const sel = document.getSelection();
    if (!el.contains(sel.anchorNode)) {
      // Cursor ans Ende, falls das Feld noch nicht angetippt war
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand(befehl, false, null);
    setAn((a) => ({ ...a, [befehl]: document.queryCommandState(befehl) }));
  };

  return (
    <>
      <div className="stilleiste" role="toolbar" aria-label="Schrift">
        {KNOEPFE.map((k) => (
          <button key={k.befehl} type="button" className={"knopf stilknopf" + (an[k.befehl] ? " aktiv" : "")}
            data-stil={k.befehl} aria-label={k.name} aria-pressed={!!an[k.befehl]} title={k.name}
            onPointerDown={(e) => druecken(e, k.befehl)} onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { if (e.detail === 0) druecken(e, k.befehl); }}>
            <span style={k.stil}>{k.zeichen}</span></button>
        ))}
      </div>
      <div id={id} ref={feld} className="stilfeld" contentEditable suppressContentEditableWarning
        role="textbox" aria-multiline="true" data-stilfeld="" data-platzhalter={platzhalter || ""}
        data-fokus={erstes ? "" : undefined} />
    </>
  );
}

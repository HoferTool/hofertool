// =================================================================
//  INFOBOARD: TEXT WIE IN WORD
//  Statt der Zeichenfläche ein Feld mit Text (Wunsch Patrick
//  20. Oktober 2026: „nicht die Zeichenfläche, sondern einen
//  Texteditor, am liebsten Word“). Das Feld ist ein Blatt in echten
//  Massen: A4 hochkant 210 × 297 mm oder A3 quer 420 × 297 mm, Schrift
//  in Punkt wie in Word. Auf der Tafel wird das Blatt als Ganzes auf das
//  Feld verkleinert; am 50-Zoll-Bildschirm ist es fast so gross wie
//  ein echtes Blatt, 12 pt sieht also aus wie ausgedruckt.
//
//  Bearbeitet wird in einem grossen Fenster mit Knöpfen wie in Word.
//  Bilder lassen sich einfügen (Ablage wie die anderen Dateien) und die
//  Schriftart wählen (1.123.0, Wunsch Patrick 20. Oktober 2026).
//  Eine Word-Datei (.docx) lässt sich dort einlesen: Text, Fett,
//  Kursiv, Unterstrichen, Farbe, Grösse, Ausrichtung, Aufzählungen und
//  Tabellen kommen mit, Bilder nicht (Fotos und PDFs gehören in ein
//  eigenes Feld).
//
//  Gespeichert wird nur ein sicherer Teil von HTML (sauber()).
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import { dateiHochladen } from "./daten.js";

// Blatt in CSS-Pixeln (96 je Zoll): 210 mm = 793,7 px
const MM = 96 / 25.4;
// a4q: A4 quer, für die weiteren Seiten des Einrichtblatts
export const BLATT_MM = { a4: [210, 297], a3: [420, 297], a4q: [297, 210] };
export const RAND_MM = 12;
// Höhe des Texts je A4-Seite im PDF der Maschinen-Notizen: A4 ohne Rand oben und unten
export const SEITE_INHALT_MM = 297 - 2 * RAND_MM;

export const GROESSEN = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];
export const STANDARD_PT = 14;
const FARBEN = ["#000000", "#1f3a63", "#2f7cf6", "#c62828", "#e65100", "#2e7d32", "#6a1b9a", "#757575"];

// ---------- Sicheres HTML ----------
const TAGS = new Set(["p", "div", "br", "span", "b", "strong", "i", "em", "u", "s", "strike", "del",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "table", "thead", "tbody", "tr", "td", "th", "sup", "sub", "font", "img"]);
const STILE = ["color", "background-color", "font-size", "font-weight", "font-style", "text-decoration",
  "text-decoration-line", "text-align", "width", "border", "padding", "vertical-align", "font-family"];
// Bilder nur aus der Ablage (https) oder als eingebettetes Bild
const BILD_SRC = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i;

// Schriftarten, die auf Windows (der Bildschirm am Infoboard) da sind;
// die erste ist die Vorgabe des Blatts
export const SCHRIFTEN = [
  ["Aptos, Calibri, Carlito, sans-serif", "Aptos / Calibri"],
  ["Arial, Helvetica, sans-serif", "Arial"],
  ["'Arial Black', Arial, sans-serif", "Arial Black"],
  ["Verdana, sans-serif", "Verdana"],
  ["Tahoma, sans-serif", "Tahoma"],
  ["'Segoe UI', sans-serif", "Segoe UI"],
  ["'Times New Roman', Times, serif", "Times New Roman"],
  ["Georgia, serif", "Georgia"],
  ["Cambria, serif", "Cambria"],
  ["'Courier New', monospace", "Courier New"],
  ["Consolas, monospace", "Consolas"],
  ["Impact, sans-serif", "Impact"],
  ["'Comic Sans MS', cursive", "Comic Sans MS"],
];

const escHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (t) => escHtml(t).replace(/"/g, "&quot;");

export function sauber(html) {
  const doc = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
  return knotenText(doc.body.firstChild);
}

function knotenText(knoten) {
  let aus = "";
  knoten.childNodes.forEach((k) => {
    if (k.nodeType === 3) { aus += escHtml(k.nodeValue); return; }
    if (k.nodeType !== 1) return;
    let tag = k.tagName.toLowerCase();
    const innen = knotenText(k);
    if (!TAGS.has(tag)) { aus += innen; return; }
    if (tag === "br") { aus += "<br>"; return; }
    if (tag === "img") {
      const src = k.getAttribute("src") || "";
      const b = k.style && k.style.width;
      if (BILD_SRC.test(src) && !/["<>\s]/.test(src.slice(0, 200)))
        aus += '<img src="' + escAttr(src) + '"' + (b && /^\d+(\.\d+)?(%|px)$/.test(b) ? ' style="width: ' + b + '"' : "") + ">";
      return;
    }
    const stil = [];
    for (const n of STILE) {
      const w = k.style && k.style.getPropertyValue(n);
      // Nur einfache Werte: keine url(), kein expression(); Schriftnamen
      // dürfen Anführungszeichen haben („Times New Roman“)
      const muster = n === "font-family" ? /^[\w\s,"'-]+$/ : /^[#\w\s.,%()-]+$/;
      if (w && muster.test(w) && !/url|expression/i.test(w)) stil.push(n + ": " + w);
    }
    if (tag === "font" && k.getAttribute("face") && /^[\w\s,"'-]+$/.test(k.getAttribute("face")))
      stil.push("font-family: " + k.getAttribute("face"));
    if (tag === "font") {
      const f = k.getAttribute("color");
      if (f && /^#?\w+$/.test(f)) stil.push("color: " + f);
      tag = "span";
    }
    // Die Farbe auch als --tf: Im dunklen Modus macht die App sonst
    // alle Schrift weiss (body.dunkel * mit !important), siehe stil.css
    const farbe = stil.find((x) => x.startsWith("color: "));
    if (farbe) stil.push("--tf: " + farbe.slice(7));
    const at = [];
    if (stil.length) at.push('style="' + escAttr(stil.join("; ")) + '"');
    for (const a of ["colspan", "rowspan"]) {
      const w = k.getAttribute(a);
      if (w && /^\d{1,2}$/.test(w)) at.push(a + '="' + w + '"');
    }
    aus += "<" + tag + (at.length ? " " + at.join(" ") : "") + ">" + innen + "</" + tag + ">";
  });
  return aus;
}

// Farben, die der Browser beim Bearbeiten setzt, auch als --tf merken
function farbenMerken(el) {
  el.querySelectorAll("[style]").forEach((k) => {
    const f = k.style.color;
    if (f) { if (k.style.getPropertyValue("--tf") !== f) k.style.setProperty("--tf", f); }
    else if (k.style.getPropertyValue("--tf")) k.style.removeProperty("--tf");
  });
}

// Helligkeit einer Farbe #rrggbb (wahrgenommen), unter der Hälfte = dunkel
function istDunkel(farbe) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(farbe || "");
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

// ---------- Anzeige ----------
// Das Blatt in echten Massen, eingepasst auf breite × hoehe Punkte der Tafel
// ohneGrund: Text frei auf der Tafel, ohne weisses Blatt und ohne Rand
// (Wunsch Patrick 26. Oktober 2026: „Text ohne Hintergrund direkt platzieren“);
// grund ist dann die Farbe der Tafel, damit man im Fenster sieht, wie es wirkt
// tafel: Farbe der Tafel dahinter; ist sie dunkel (Infoboard), ist die
// Schrift ohne Hintergrund von selbst weiss, sonst stünde schwarz auf
// Dunkelblau (Wunsch Patrick 28. Oktober 2026: „im Infoboard auch Text ohne
// Hintergrund wie beim Empfang“); eine von Hand gewählte Farbe bleibt (--tf)
// wachsen: das Blatt wird mit dem Text länger, über mehrere A4-Seiten
// (eigene Maschinen-Notizen, seit 1.221.0); die gestrichelten Linien
// zeigen ungefähr, wo im PDF eine neue Seite beginnt
export function TextBlatt({ html, format, breite, hoehe, bearbeiten, innenRef, onInput, ohneGrund, grund, tafel, wachsen }) {
  const schrift = ohneGrund && istDunkel(tafel || grund) ? "#ffffff" : undefined;
  const [bw] = BLATT_MM[format] || BLATT_MM.a4;
  const k = breite / (bw * MM);
  const eigen = useRef(null);
  const el = innenRef || eigen;
  const [lang, setLang] = useState(0);
  // Beim Bearbeiten nur einmal füllen, sonst springt die Schreibmarke
  useLayoutEffect(() => {
    if (el.current && (!bearbeiten || !el.current.innerHTML)) el.current.innerHTML = sauber(html);
  }, [html, bearbeiten, el]);
  // Die Hülle ist so hoch wie das verkleinerte Blatt
  useLayoutEffect(() => {
    if (!wachsen || !el.current) return;
    const messen = () => el.current && setLang(el.current.offsetHeight * k);
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [wachsen, k, el]);
  const seite = SEITE_INHALT_MM * MM;
  return (
    <div className={"ib-text" + (ohneGrund ? " ib-text--ohne-grund" : "") + (wachsen ? " ib-text--wachsen" : "")}
      style={{ width: breite, height: wachsen ? Math.max(hoehe, lang) : hoehe,
        background: ohneGrund ? grund || "transparent" : undefined, "--tf": schrift }}>
      <div ref={el} className="ib-text__blatt" contentEditable={bearbeiten || undefined}
        suppressContentEditableWarning spellCheck={bearbeiten ? true : undefined} onInput={onInput}
        style={{ width: bw * MM, height: wachsen ? "auto" : hoehe / k, minHeight: wachsen ? hoehe / k : undefined,
          padding: ohneGrund ? 0 : RAND_MM * MM, fontSize: STANDARD_PT + "pt", transform: "scale(" + k + ")",
          backgroundImage: wachsen ? "repeating-linear-gradient(to bottom, transparent 0, transparent "
            + (seite - 2) + "px, #9aa4b1 " + (seite - 2) + "px, #9aa4b1 " + seite + "px)" : undefined,
          backgroundSize: wachsen ? "100% " + seite + "px" : undefined,
          // Nur im Textbereich, damit oben im Rand keine Linie steht
          backgroundClip: wachsen ? "content-box" : undefined, backgroundOrigin: wachsen ? "content-box" : undefined,
          backgroundRepeat: wachsen ? "repeat-y" : undefined }} />
    </div>
  );
}

// ---------- Fenster zum Bearbeiten ----------
// fortlaufend: mehrere Seiten, das Fenster rollt (Maschinen-Notizen)
export function textBearbeiten({ html, format, seitenVerhaeltnis, titel, ohneGrund, grund, fortlaufend }) {
  return new Promise((fertig) => {
    const huelle = document.createElement("div");
    huelle.className = "dialog-huelle ib-texteditor-huelle";
    document.body.appendChild(huelle);
    const wurzel = createRoot(huelle);
    const zu = (wert) => { wurzel.unmount(); huelle.remove(); fertig(wert); };
    wurzel.render(<TextEditor html={html} format={format} verhaeltnis={seitenVerhaeltnis}
      titel={titel} zu={zu} ohneGrund={ohneGrund} grund={grund} fortlaufend={fortlaufend} />);
  });
}

function TextEditor({ html, format, verhaeltnis, titel, zu, ohneGrund, grund, fortlaufend }) {
  const blatt = useRef(null);
  const platz = useRef(null);
  const datei = useRef(null);
  const [mass, setMass] = useState([0, 0]);
  const [zuViel, setZuViel] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [, neu] = useState(0);
  const [start] = useState(html || "");

  // So gross wie möglich im Fenster, im Seitenverhältnis des Felds
  useLayoutEffect(() => {
    const el = platz.current;
    const rechnen = () => {
      const w = el.clientWidth - 8, h = el.clientHeight - 8;
      if (w <= 0 || h <= 0) return;
      // Fortlaufend nach der Breite, nach unten rollt es
      const b = fortlaufend ? Math.min(w - 16, 900) : Math.min(w, h / verhaeltnis);
      setMass([Math.floor(b), Math.floor(b * verhaeltnis)]);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [verhaeltnis]);

  const pruefen = () => {
    const el = blatt.current;
    if (el) farbenMerken(el);
    if (el && !fortlaufend) setZuViel(el.scrollHeight > el.clientHeight + 2);
    neu((n) => n + 1);
  };
  useEffect(() => { if (mass[0]) { pruefen(); blatt.current && blatt.current.focus(); } }, [mass[0]]);
  // Knöpfe zeigen, was an der Schreibmarke gilt (fett, kursiv …)
  useEffect(() => {
    const sel = () => neu((n) => n + 1);
    document.addEventListener("selectionchange", sel);
    return () => document.removeEventListener("selectionchange", sel);
  }, []);

  useEffect(() => {
    const taste = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      zu(null);
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [zu]);

  const befehl = (name, wert) => {
    blatt.current.focus();
    try { document.execCommand("styleWithCSS", false, true); } catch (f) { /* egal */ }
    document.execCommand(name, false, wert);
    pruefen();
  };

  // Grösse in Punkt: der Browser kennt nur 1 bis 7, darum mit 7 setzen
  // und gleich durch die gewünschte Grösse ersetzen
  const groesse = (pt) => {
    blatt.current.focus();
    try { document.execCommand("styleWithCSS", false, false); } catch (f) { /* egal */ }
    document.execCommand("fontSize", false, "7");
    blatt.current.querySelectorAll('font[size="7"]').forEach((f) => {
      const s = document.createElement("span");
      s.style.fontSize = pt + "pt";
      if (f.getAttribute("color")) s.style.color = f.getAttribute("color");
      while (f.firstChild) s.appendChild(f.firstChild);
      f.replaceWith(s);
    });
    blatt.current.querySelectorAll("span").forEach((s) => {
      if (/xxx-large/.test(s.style.fontSize)) s.style.fontSize = pt + "pt";
    });
    pruefen();
  };

  const schrift = (familie) => {
    blatt.current.focus();
    try { document.execCommand("styleWithCSS", false, true); } catch (f) { /* egal */ }
    document.execCommand("fontName", false, familie);
    pruefen();
  };

  // Bild an der Schreibmarke einfügen: die Stelle merken, bevor das
  // Fenster zum Wählen der Datei den Fokus nimmt
  const stelle = useRef(null);
  const bildDatei = useRef(null);
  const [bild, setBild] = useState(null);
  const stelleMerken = () => {
    const sel = window.getSelection();
    stelle.current = sel.rangeCount && blatt.current.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  };
  const bildLaden = async (e) => {
    const d = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!d) return;
    if (!/^image\//.test(d.type) && !/\.(png|jpe?g|gif|webp)$/i.test(d.name)) { setMeldung("Nur Bilder (JPG, PNG, GIF)."); return; }
    setMeldung("Bild wird hochgeladen …");
    try {
      const neu = await dateiHochladen(d);
      blatt.current.focus();
      const sel = window.getSelection();
      if (stelle.current) { sel.removeAllRanges(); sel.addRange(stelle.current); }
      else { const r = document.createRange(); r.selectNodeContents(blatt.current); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
      document.execCommand("insertHTML", false, '<img src="' + escAttr(neu.url) + '" style="width: 50%">');
      setMeldung("Bild eingefügt. Antippen, um die Grösse zu wählen.");
      pruefen();
    } catch (f) { setMeldung("Bild ging nicht: " + ((f && f.message) || f)); }
  };
  // Ein Bild antippen wählt es: Grösse 25 bis 100 % oder entfernen
  const blattKlick = (e) => {
    if (bild) bild.style.outline = "";
    if (e.target.tagName === "IMG" && blatt.current.contains(e.target)) {
      e.target.style.outline = "4px solid #2f7cf6";   // sauber() speichert nur die Breite
      setBild(e.target);
      return;
    }
    setBild(null);
  };
  const bildBreite = (p) => { if (bild) { bild.style.width = p + "%"; pruefen(); } };
  const bildWeg = () => { if (bild) { bild.remove(); setBild(null); pruefen(); } };

  const aktiv = (name) => { try { return document.queryCommandState(name); } catch (f) { return false; } };
  const aussen = (e) => e.preventDefault();   // Markierung beim Knopfdruck behalten

  const wordLaden = async (e) => {
    const d = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!d) return;
    try {
      const h = await wordLesen(d);
      blatt.current.innerHTML = sauber(h);
      setMeldung("Aus " + d.name + " übernommen. Bilder kommen nicht mit.");
      pruefen();
    } catch (f) { setMeldung("Die Datei liess sich nicht lesen: " + ((f && f.message) || f)); }
  };

  const K = ({ was, t, titel: tt, an }) => (
    <button type="button" className={"ib-te__knopf" + (an ? " aktiv" : "")} title={tt} data-ibte={was}
      onMouseDown={aussen} onClick={() => befehl(was)}>{t}</button>
  );

  return (
    <div className="dialog ib-te" role="dialog" aria-label={titel}>
      <div className="ib-te__kopf">
        <h2>{titel}</h2>
        <button type="button" className="knopf knopf--still" onClick={() => datei.current.click()} data-ibte="word">
          Word-Datei laden …</button>
        <input ref={datei} type="file" hidden onChange={wordLaden}
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </div>
      <div className="ib-te__leiste" onMouseDown={(e) => { if (e.target.tagName !== "SELECT" && e.target.tagName !== "INPUT") e.preventDefault(); }}>
        <select className="ib-te__groesse" data-ibte="groesse" defaultValue="" title="Schriftgrösse"
          onChange={(e) => { if (e.target.value) groesse(Number(e.target.value)); e.target.value = ""; }}>
          <option value="" disabled>Grösse</option>
          {GROESSEN.map((g) => <option key={g} value={g}>{g} pt</option>)}
        </select>
        <select className="ib-te__schrift" data-ibte="schrift" defaultValue="" title="Schriftart"
          onChange={(e) => { if (e.target.value) schrift(e.target.value); e.target.value = ""; }}>
          <option value="" disabled>Schriftart</option>
          {SCHRIFTEN.map(([w, t]) => <option key={t} value={w} style={{ fontFamily: w }}>{t}</option>)}
        </select>
        <span className="ib-te__trenner" />
        <K was="bold" t={<b>F</b>} titel="Fett (Strg + B)" an={aktiv("bold")} />
        <K was="italic" t={<i>K</i>} titel="Kursiv (Strg + I)" an={aktiv("italic")} />
        <K was="underline" t={<u>U</u>} titel="Unterstrichen (Strg + U)" an={aktiv("underline")} />
        <K was="strikeThrough" t={<s>S</s>} titel="Durchgestrichen" an={aktiv("strikeThrough")} />
        <span className="ib-te__trenner" />
        {FARBEN.map((f) => (
          <button key={f} type="button" className="ib-te__farbe" style={{ background: f }} title="Schriftfarbe"
            onMouseDown={aussen} onClick={() => befehl("foreColor", f)} />
        ))}
        <label className="ib-te__farbe ib-te__farbe--frei" title="Andere Farbe">
          <input type="color" onChange={(e) => befehl("foreColor", e.target.value)} /></label>
        <button type="button" className="ib-te__knopf" title="Text markieren (gelb)" onMouseDown={aussen}
          onClick={() => befehl("hiliteColor", "#fff176")}>▮</button>
        <span className="ib-te__trenner" />
        <K was="justifyLeft" t="⯇" titel="Links" an={aktiv("justifyLeft")} />
        <K was="justifyCenter" t="≡" titel="Mitte" an={aktiv("justifyCenter")} />
        <K was="justifyRight" t="⯈" titel="Rechts" an={aktiv("justifyRight")} />
        <span className="ib-te__trenner" />
        <K was="insertUnorderedList" t="• Liste" titel="Aufzählung" an={aktiv("insertUnorderedList")} />
        <K was="insertOrderedList" t="1. Liste" titel="Nummerierung" an={aktiv("insertOrderedList")} />
        <span className="ib-te__trenner" />
        <button type="button" className="ib-te__knopf" title="Bild einfügen" data-ibte="bild"
          onMouseDown={(e) => { e.preventDefault(); stelleMerken(); }}
          onClick={() => bildDatei.current.click()}>🖼 Bild</button>
        <input ref={bildDatei} type="file" hidden accept="image/*" onChange={bildLaden} />
        <span className="ib-te__trenner" />
        <K was="undo" t="↶" titel="Rückgängig (Strg + Z)" />
        <K was="redo" t="↷" titel="Wiederholen (Strg + Y)" />
        <K was="removeFormat" t="Tx" titel="Formatierung entfernen" />
      </div>
      {bild && bild.isConnected &&
        <div className="ib-te__bild" data-ibte="bildleiste">
          <span>Bild:</span>
          {[25, 50, 75, 100].map((p) => (
            <button key={p} type="button" className="ib-te__knopf" data-ibte={"bild" + p}
              onClick={() => bildBreite(p)}>{p} %</button>))}
          <button type="button" className="ib-te__knopf" onClick={bildWeg}>Entfernen</button>
        </div>}
      <div className={"ib-te__platz" + (fortlaufend ? " ib-te__platz--rollen" : "")} ref={platz} onClick={blattKlick}>
        {mass[0] > 0 &&
          <div className={"ib-te__seite" + (zuViel ? " ib-te__seite--voll" : "")}>
            <TextBlatt html={start} format={format} breite={mass[0]} hoehe={mass[1]} bearbeiten
              innenRef={blatt} onInput={pruefen} ohneGrund={ohneGrund} grund={grund} wachsen={fortlaufend} />
          </div>}
      </div>
      <div className="ib-te__fuss">
        <span className={"klein" + (zuViel ? " ib-te__warnung" : "")}>
          {zuViel ? "Der Text ist länger als das Feld: Was unter dem Rand steht, ist am Bildschirm nicht zu sehen."
            : meldung || (fortlaufend ? "Mehrere Seiten gehen: Die graue Linie zeigt ungefähr, wo im PDF eine neue Seite beginnt."
              : "So wie hier steht es auf dem Bildschirm.")}</span>
        <button type="button" className="knopf knopf--still" onClick={() => zu(null)}>Abbrechen</button>
        <button type="button" className="knopf" data-ibte="fertig"
          onClick={() => zu(sauber(blatt.current ? blatt.current.innerHTML : ""))}>Speichern</button>
      </div>
    </div>
  );
}

// ---------- Word-Datei lesen ----------
// Eine .docx ist eine ZIP-Datei; der Text steht in word/document.xml.
// Gelesen wird, was auf dem Infoboard Sinn ergibt.
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function wordLesen(datei) {
  const zip = await JSZip.loadAsync(datei);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Keine Word-Datei (.docx).");
  const xml = new DOMParser().parseFromString(await doc.async("string"), "application/xml");
  // Welche Listen nummeriert sind und welche Punkte haben
  const nummeriert = {};
  const nf = zip.file("word/numbering.xml");
  if (nf) {
    const nx = new DOMParser().parseFromString(await nf.async("string"), "application/xml");
    const abstrakt = {};
    kinder(nx.documentElement, "abstractNum").forEach((a) => {
      const lvl = kinder(a, "lvl").find((l) => wa(l, "ilvl") === "0") || kinder(a, "lvl")[0];
      const fmt = lvl && kind(lvl, "numFmt");
      abstrakt[wa(a, "abstractNumId")] = !!fmt && wa(fmt, "val") !== "bullet";
    });
    kinder(nx.documentElement, "num").forEach((n) => {
      const ab = kind(n, "abstractNumId");
      nummeriert[wa(n, "numId")] = ab ? abstrakt[wa(ab, "val")] : false;
    });
  }
  // Grundgrösse aus den Formatvorlagen
  let grund = 11;
  const sf = zip.file("word/styles.xml");
  if (sf) {
    const sx = new DOMParser().parseFromString(await sf.async("string"), "application/xml");
    const sz = sx.getElementsByTagNameNS(W, "docDefaults")[0];
    const s = sz && sz.getElementsByTagNameNS(W, "sz")[0];
    if (s && Number(wa(s, "val"))) grund = Number(wa(s, "val")) / 2;
  }
  const koerper = xml.getElementsByTagNameNS(W, "body")[0];
  return '<div style="font-size: ' + grund + 'pt">' + bloecke(koerper, nummeriert, grund) + "</div>";
}

const kinder = (el, name) => Array.from(el.childNodes).filter((k) => k.namespaceURI === W && k.localName === name);
const kind = (el, name) => (el ? kinder(el, name)[0] : undefined);
const wa = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute("w:" + name) || "" : "");

function bloecke(el, nummeriert, grund) {
  let aus = "", liste = null;
  const listeZu = () => { if (liste) { aus += "</" + liste + ">"; liste = null; } };
  Array.from(el.childNodes).forEach((k) => {
    if (k.namespaceURI !== W) return;
    if (k.localName === "p") {
      const ppr = kind(k, "pPr");
      const num = kind(kind(ppr, "numPr"), "numId");
      const inhalt = absatzText(k, grund) || "<br>";
      const stil = absatzStil(ppr);
      if (num && wa(num, "val") !== "0") {
        const art = nummeriert[wa(num, "val")] ? "ol" : "ul";
        if (liste !== art) { listeZu(); aus += "<" + art + ">"; liste = art; }
        aus += "<li" + stil + ">" + inhalt + "</li>";
        return;
      }
      listeZu();
      const vorlage = wa(kind(ppr, "pStyle"), "val").toLowerCase();
      const tag = /^(title|titel)$/.test(vorlage) || /heading1|berschrift1/.test(vorlage) ? "h1"
        : /heading2|berschrift2/.test(vorlage) ? "h2" : /heading3|berschrift3/.test(vorlage) ? "h3" : "p";
      aus += "<" + tag + stil + ">" + inhalt + "</" + tag + ">";
    } else if (k.localName === "tbl") {
      listeZu();
      aus += "<table>" + kinder(k, "tr").map((tr) => "<tr>" + kinder(tr, "tc").map((tc) => {
        const span = wa(kind(kind(tc, "tcPr"), "gridSpan"), "val");
        return "<td" + (span && Number(span) > 1 ? ' colspan="' + Number(span) + '"' : "") + ">"
          + bloecke(tc, nummeriert, grund) + "</td>";
      }).join("") + "</tr>").join("") + "</table>";
    } else if (k.localName === "sdt") {
      const c = kind(k, "sdtContent");
      if (c) { listeZu(); aus += bloecke(c, nummeriert, grund); }
    }
  });
  listeZu();
  return aus;
}

function absatzStil(ppr) {
  const jc = wa(kind(ppr, "jc"), "val");
  const a = { center: "center", right: "right", end: "right", both: "justify", distribute: "justify" }[jc];
  return a ? ' style="text-align: ' + a + '"' : "";
}

function absatzText(p, grund) {
  let aus = "";
  Array.from(p.childNodes).forEach((k) => {
    if (k.namespaceURI !== W) return;
    if (k.localName === "r") aus += laufText(k, grund);
    else if (k.localName === "hyperlink" || k.localName === "smartTag" || k.localName === "ins")
      Array.from(k.childNodes).forEach((r) => { if (r.localName === "r") aus += laufText(r, grund); });
  });
  return aus;
}

function laufText(r, grund) {
  let t = "";
  Array.from(r.childNodes).forEach((k) => {
    if (k.namespaceURI !== W) return;
    if (k.localName === "t") t += escHtml(k.textContent);
    else if (k.localName === "tab") t += "&emsp;";
    else if (k.localName === "br" || k.localName === "cr") t += "<br>";
  });
  if (!t) return "";
  const rpr = kind(r, "rPr");
  if (!rpr) return t;
  const an = (n) => { const e = kind(rpr, n); return !!e && !/^(0|false|none)$/.test(wa(e, "val")); };
  const stil = [];
  const farbe = wa(kind(rpr, "color"), "val");
  if (farbe && /^[0-9a-f]{6}$/i.test(farbe)) stil.push("color: #" + farbe);
  const sz = Number(wa(kind(rpr, "sz"), "val"));
  if (sz) stil.push("font-size: " + sz / 2 + "pt");
  const hl = wa(kind(rpr, "highlight"), "val");
  const HL = { yellow: "#fff176", green: "#a5d6a7", cyan: "#80deea", magenta: "#f48fb1", red: "#ef9a9a",
    blue: "#90caf9", lightGray: "#e0e0e0", darkGray: "#9e9e9e" };
  if (HL[hl]) stil.push("background-color: " + HL[hl]);
  if (an("b")) t = "<b>" + t + "</b>";
  if (an("i")) t = "<i>" + t + "</i>";
  if (an("u")) t = "<u>" + t + "</u>";
  if (an("strike")) t = "<s>" + t + "</s>";
  const va = wa(kind(rpr, "vertAlign"), "val");
  if (va === "superscript") t = "<sup>" + t + "</sup>";
  if (va === "subscript") t = "<sub>" + t + "</sub>";
  return stil.length ? '<span style="' + stil.join("; ") + '">' + t + "</span>" : t;
}

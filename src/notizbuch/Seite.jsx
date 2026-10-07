// =================================================================
//  NOTIZBÜCHER · Eine Seite
//  Ein weisses Blatt wie in OneNote: zeichnen mit Finger, Stift oder
//  Maus (gleiche Striche wie die Skizze im Pad Mode, src/teile/
//  zeichnen.jsx), Textfelder mit Fett, Kursiv, Unterstrichen,
//  Durchgestrichen und Grösse, eingefügte Bilder und PDFs.
//
//  Alles auf der Seite steht in einer Liste (Spalte inhalt):
//    Strich    { f: "#hex", d: Dicke, p: [x, y, …] }
//    Text      { t: 1, h: Text mit <b> <i> <u> <s> <br>, x, y, g: Grösse, f: Farbe,
//                b: Breite des Felds (fehlt = so breit wie der Text),
//                m: Mindesthöhe (fehlt = so hoch wie der Text), p: [] }
//    Bild      { t: "bild", u: Adresse, x, y, b: Breite, v: Höhe/Breite,
//                q: Adresse des PDFs (bei PDF-Seiten), s: Seitennummer, n: Name, p: [] }
//    Tabelle   { t: "tab", z: [[Zelle, …], …] Zeilen mit Zellen (Text wie oben),
//                x, y, b: Breite, g: Grösse, f: Farbe, v: gemessene Höhe, p: [] }
//  Alle Lagen und Grössen sind durch die Breite des Blatts geteilt:
//  Die Seite sieht auf PC, iPad und Handy gleich aus, nur grösser oder
//  kleiner. Das Blatt wächst nach unten mit, so weit wie nötig.
//
//  Werkzeuge: Schreiben (Start: hintippen und lostippen, Felder und
//  Bilder antippen zum Bearbeiten, mit dem Finger rollen), Stift,
//  Radierer. Gezeichnet wird nur mit dem Stift (Wunsch Patrick
//  7. Oktober 2026); mit dem Stift rollt man mit zwei Fingern. Die Zeichenfläche ist nur so gross wie der sichtbare Teil
//  und folgt beim Rollen: Ein langes Blatt mit vielen PDF-Seiten wäre
//  als eine Fläche zu gross für Safari auf dem iPad.
// =================================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { FettText, alsHtml, stilWert } from "../teile/FettText.jsx";
import { rund, strichZeichnen, getroffen, Symbol, RADIERER, ZURUECK, TEXT, EIMER } from "../teile/zeichnen.jsx";
import { seiteLaden, seiteSpeichern, bildEinfuegen, pdfEinfuegen, istPdf, istBild, SEITEN } from "./daten.js";

// Höhe des leeren Blatts (A4 hochkant) und Platz unter dem Inhalt
const A4 = 1.414;
const RAND_UNTEN = 0.45;
const BLATT_MAX = 1100;
// Dicke und Schrift in Bildpunkten bei 1000 px Breite
const DICKEN = [["duenn", 2.5], ["mittel", 5], ["dick", 11]];
const SCHRIFTEN = [["klein", "Klein", 16], ["mittel", "Mittel", 22], ["gross", "Gross", 32],
                   ["riesig", "Sehr gross", 46]];
const schriftPx = (g) => (SCHRIFTEN.find((x) => x[0] === g) || SCHRIFTEN[1])[2];
const STILE = [["bold", "B", "Fett", { fontWeight: 900 }],
  ["italic", "I", "Kursiv", { fontStyle: "italic", fontFamily: "Georgia, serif" }],
  ["underline", "U", "Unterstrichen", { textDecoration: "underline" }],
  ["strikeThrough", "S", "Durchgestrichen", { textDecoration: "line-through" }]];
const istText = (s) => !!(s && s.t === 1);
const istBildEl = (s) => !!(s && s.t === "bild");
const istTab = (s) => !!(s && s.t === "tab");

// Tabelle (Wunsch Patrick 7. Oktober 2026): „3 3“ ins Textfeld tippen
// und Tab drücken gibt 3 Spalten und 3 Zeilen, wie in Word zuerst die
// Spalten. Höchstens 12 Spalten und 60 Zeilen.
const TAB_MUSTER = /^\s*(\d{1,2})\s*[x×*\s]\s*(\d{1,2})\s*$/i;
function neueTabelle(s, spalten, zeilen) {
  const b = Math.max(0.15, Math.min(1 - s.x - 0.02, spalten * 0.18));
  return { t: "tab", x: s.x, y: s.y, b: rund(b), g: s.g, f: s.f,
    z: Array.from({ length: zeilen }, () => Array(spalten).fill("")), p: [] };
}
// Eine Zeile oder Spalte mehr; die Tabelle wird für die Spalte breiter,
// soweit das Blatt reicht
function tabMehr(s, art) {
  const n = s.z[0].length, m = s.z.length;
  if (art === "zeile") {
    const neu = { ...s, z: [...s.z, s.z[0].map(() => "")] };
    if (s.v) neu.v = rund(s.v * (m + 1) / m);
    return neu;
  }
  return { ...s, z: s.z.map((r) => [...r, ""]), b: rund(Math.min(1 - s.x, s.b * (n + 1) / n)) };
}

const ZIEHEN = "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3";
const STIFT = "M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1zM14.5 6.5l3 3";
const BILD = "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1 1 0 1 0 0-.01";

// Was sich die Person zuletzt eingestellt hat, gilt beim nächsten Blatt wieder
// Dunkle Ansicht (Wunsch Patrick 7. Oktober 2026): Das Blatt ist dunkel,
// schwarze Schrift und Striche erscheinen weiss; im hellen umgekehrt
// weisse als schwarz. Gespeichert wird die gewählte Farbe, nur die
// Anzeige wechselt, damit dieselbe Seite in beiden Ansichten lesbar ist.
function hell(f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(f || ""));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
export function anzeigeFarbe(f, dunkel) {
  const h = hell(f);
  if (dunkel && h < 0.3) return "#eef1f5";
  if (!dunkel && h > 0.85) return "#1d2430";
  return f;
}
function useDunkel() {
  const [d, setD] = useState(() => document.body.classList.contains("dunkel"));
  useEffect(() => {
    const b = new MutationObserver(() => setD(document.body.classList.contains("dunkel")));
    b.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => b.disconnect();
  }, []);
  return d;
}

const merk = { werkzeug: "text", farbe: "#1d2430", dicke: "mittel", schrift: "mittel" };

// Unterkante eines Elements in Breitenanteilen
function unterkante(s) {
  if (istBildEl(s)) return s.y + s.b * s.v;
  if (istText(s)) return s.y + Math.max(0.08, s.m || 0);
  if (istTab(s)) return s.y + (s.v || s.z.length * schriftPx(s.g) * 1.75 / 1000);
  let m = 0;
  const p = s.p || [];
  for (let i = 1; i < p.length; i += 2) m = Math.max(m, p[i]);
  return m + (s.d || 0);
}
export const seitenHoehe = (liste) =>
  Math.max(A4, (liste || []).reduce((m, s) => Math.max(m, unterkante(s)), 0) + RAND_UNTEN);

function istTextfeld(el) {
  return !!(el && (el.isContentEditable || el.tagName === "TEXTAREA"
    || (el.tagName === "INPUT" && !/^(color|button|checkbox|radio|range|file)$/i.test(el.type || ""))));
}

export default function Seite({ id, darf, onTitel, huelle }) {
  const [inhalt, setInhalt] = useState(null);
  const [titel, setTitel] = useState("");
  const [werkzeug, setWerkzeug] = useState(merk.werkzeug);
  const [farbe, setFarbe] = useState(merk.farbe);
  const dunkel = useDunkel();
  const dunkelRef = useRef(dunkel);
  dunkelRef.current = dunkel;
  const [dicke, setDicke] = useState(merk.dicke);
  const [w, setW] = useState(0);              // Breite des Blatts in px
  const [sicht, setSicht] = useState({ oben: 0, hoehe: 0 });
  const [wahl, setWahl] = useState(-1);       // gewähltes Bild (Hand)
  const [zieh, setZieh] = useState(null);     // Element, das gerade verschoben wird
  const [laeuft, setLaeuft] = useState("");   // Einfügen läuft
  const [kannZurueck, setKannZurueck] = useState(false);
  const [edit, setEdit] = useState(null);     // Textfeld, in dem gerade geschrieben wird
  const [hinweis, setHinweis] = useState(false);
  const editRef = useRef(null);
  const editorEl = useRef(null);
  const zelleEl = useRef(null);               // Zelle der offenen Tabelle mit dem Fokus
  const tabelleEl = useRef(null);
  const editHuelle = useRef(null);
  const tipp = useRef(null);
  const offenBeimTipp = useRef(false);
  const aendernRef = useRef(null);
  const textSchliessenRef = useRef(() => {});
  const inhaltRef = useRef([]);
  const titelRef = useRef("");
  const anfang = useRef(null);                // Stand beim Öffnen, für Rückgängig der App
  const verlauf = useRef([]);
  const rolle = useRef(null);
  const blatt = useRef(null);
  const leinwand = useRef(null);
  const datei = useRef(null);
  const aktuell = useRef(null);
  const zeiger = useRef(new Map());
  const rollen = useRef(null);
  const ziehen = useRef(null);
  const getippt = useRef(null);
  const offen = useRef(null);
  const wRef = useRef(0);
  wRef.current = w;
  const sichtRef = useRef(sicht);
  sichtRef.current = sicht;
  const darfZeichnen = darf && inhalt !== null;

  // ---------- Laden ----------
  useEffect(() => {
    let weg = false;
    seiteLaden(id).then((d) => {
      if (weg) return;
      const liste = Array.isArray(d && d.inhalt) ? d.inhalt : [];
      const t = (d && d.titel) || "";
      inhaltRef.current = liste; titelRef.current = t;
      anfang.current = { inhalt: liste, titel: t };
      setInhalt(liste); setTitel(t);
    }).catch((e) => {
      if (weg) return;
      alt.meldung("Seite nicht geladen: " + alt.fehlertext(e), "fehler");
      setInhalt([]);
    });
    return () => { weg = true; };
  }, [id]);

  // ---------- Speichern ----------
  const senden = useCallback(async () => {
    offen.current = null;
    try {
      await seiteSpeichern(id, { inhalt: inhaltRef.current, titel: titelRef.current });
    } catch (e) {
      alt.meldung("Seite nicht gespeichert: " + alt.fehlertext(e), "fehler");
    }
  }, [id]);
  const speichern = useCallback(() => {
    clearTimeout(offen.current);
    offen.current = setTimeout(senden, 600);
  }, [senden]);

  // Beim Wechseln der Seite oder Schliessen: Wartendes sofort senden und
  // für das Rückgängig der App den Stand von vorher ablegen
  useEffect(() => () => {
    if (editRef.current) textSchliessenRef.current();
    if (offen.current) { clearTimeout(offen.current); senden(); }
    const a = anfang.current;
    if (a && (a.titel !== titelRef.current || JSON.stringify(a.inhalt) !== JSON.stringify(inhaltRef.current))) {
      alt.merkeSchritt("Notizbuch-Seite ändern",
        alt.rueckSetz(SEITEN, { inhalt: a.inhalt, titel: a.titel }, { id }));
    }
  }, [id, senden]);

  const aendern = (liste) => {
    verlauf.current.push(inhaltRef.current);
    if (verlauf.current.length > 80) verlauf.current.shift();
    setKannZurueck(true);
    inhaltRef.current = liste; setInhalt(liste); speichern();
  };
  aendernRef.current = aendern;
  const zurueck = useCallback(() => {
    const vorher = verlauf.current.pop();
    setKannZurueck(verlauf.current.length > 0);
    if (!vorher) return;
    setWahl(-1);
    inhaltRef.current = vorher; setInhalt(vorher); speichern();
  }, [speichern]);

  const titelAendern = (t) => {
    titelRef.current = t; setTitel(t); onTitel(id, t); speichern();
  };

  // ---------- Grösse und Rollen ----------
  useLayoutEffect(() => {
    const r = rolle.current;
    if (!r) return;
    const messen = () => {
      // Auf dem Handy mindestens 560 px breit (dann seitlich rollen),
      // sonst wäre normale Schrift kaum mehr lesbar
      const breite = Math.max(560, Math.min(BLATT_MAX, r.clientWidth - (r.clientWidth > 700 ? 48 : 16)));
      setW(Math.floor(breite));
      setSicht({ oben: r.scrollTop, hoehe: r.clientHeight });
    };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(r);
    let rahmen = 0;
    const gerollt = () => {
      cancelAnimationFrame(rahmen);
      rahmen = requestAnimationFrame(() => setSicht({ oben: r.scrollTop, hoehe: r.clientHeight }));
    };
    r.addEventListener("scroll", gerollt, { passive: true });
    return () => { ro.disconnect(); r.removeEventListener("scroll", gerollt); cancelAnimationFrame(rahmen); };
  }, [inhalt !== null]);

  // Oberkante des Blatts im Rollbereich (es hat oben etwas Abstand)
  const blattOben = () => (blatt.current ? blatt.current.offsetTop : 0);

  // ---------- Zeichnen ----------
  const allesZeichnen = useCallback(() => {
    const cv = leinwand.current;
    if (!cv || !wRef.current) return;
    const breite = wRef.current;
    const { oben, hoehe } = sichtRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Die Fläche deckt nur den sichtbaren Teil des Blatts
    const ab = Math.max(0, oben - blattOben());
    const h = Math.max(1, Math.round(hoehe));
    if (cv.width !== Math.round(breite * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(breite * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = breite + "px"; cv.style.height = h + "px";
    }
    cv.style.top = ab + "px";
    const c = cv.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, -ab * dpr);
    const von = ab / breite - 0.05, bis = (ab + h) / breite + 0.05;
    inhaltRef.current.forEach((s) => {
      if (s.t) return;
      // Nur, was im sichtbaren Teil liegt
      const p = s.p || [];
      let drin = false;
      for (let i = 1; i < p.length && !drin; i += 2) drin = p[i] >= von && p[i] <= bis;
      if (drin) strichZeichnen(c, { ...s, f: anzeigeFarbe(s.f, dunkelRef.current) }, breite);
    });
    const a = aktuell.current;
    if (a) strichZeichnen(c, { ...a, f: anzeigeFarbe(a.f, dunkelRef.current) }, breite);
  }, []);
  useLayoutEffect(() => { allesZeichnen(); }, [inhalt, w, sicht, dunkel, allesZeichnen]);

  // ---------- Stift, Radierer, zwei Finger rollen ----------
  const punkt = (e) => {
    const r = blatt.current.getBoundingClientRect();
    const b = wRef.current || 1;
    return [rund((e.clientX - r.left) / b), rund((e.clientY - r.top) / b)];
  };
  const radieren = (x, y) => {
    const r = 10 / (wRef.current || 1000);
    const rest = inhaltRef.current.filter((s) => !!s.t || !getroffen(s, x, y, r));
    if (rest.length !== inhaltRef.current.length) { inhaltRef.current = rest; setInhalt(rest); }
  };
  const mitte = () => {
    let y = 0;
    zeiger.current.forEach((p) => { y += p.y; });
    return y / (zeiger.current.size || 1);
  };

  const runter = (e) => {
    if (!darfZeichnen || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    zeiger.current.set(e.pointerId, { y: e.clientY });
    try { leinwand.current.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    if (zeiger.current.size >= 2) {
      // Zweiter Finger: der angefangene Strich fällt weg, es wird gerollt
      aktuell.current = null; rollen.current = mitte(); allesZeichnen();
      return;
    }
    rollen.current = null;
    const [x, y] = punkt(e);
    if (werkzeug === "radierer") {
      aktuell.current = { radiert: inhaltRef.current };
      radieren(x, y); return;
    }
    const px = (DICKEN.find((d) => d[0] === dicke) || DICKEN[1])[1];
    aktuell.current = { f: farbe, d: rund(px / 1000), p: [x, y] };
    allesZeichnen();
  };
  const bewegen = (e) => {
    if (!zeiger.current.has(e.pointerId)) return;
    e.preventDefault();
    zeiger.current.set(e.pointerId, { y: e.clientY });
    if (rollen.current !== null) {
      const m = mitte();
      rolle.current.scrollTop -= m - rollen.current;
      rollen.current = m;
      return;
    }
    const liste = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (liste.length ? liste : [e]).forEach((ev) => {
      const [x, y] = punkt(ev);
      const s = aktuell.current;
      if (!s) return;
      if (s.radiert) { radieren(x, y); return; }
      const n = s.p.length;
      if (Math.hypot(x - s.p[n - 2], y - s.p[n - 1]) < 0.0015) return;
      s.p.push(x, y);
    });
    if (werkzeug !== "radierer") allesZeichnen();
  };
  const hoch = (e) => {
    if (!zeiger.current.has(e.pointerId)) return;
    zeiger.current.delete(e.pointerId);
    if (zeiger.current.size) { if (rollen.current !== null) rollen.current = mitte(); return; }
    rollen.current = null;
    const s = aktuell.current;
    aktuell.current = null;
    if (!s) return;
    if (s.radiert) {
      if (s.radiert !== inhaltRef.current) {
        verlauf.current.push(s.radiert); setKannZurueck(true); speichern();
      }
      return;
    }
    aendern([...inhaltRef.current, s]);
  };

  // ---------- Textfelder: direkt auf dem Blatt schreiben ----------
  // Wie in OneNote (Wunsch Patrick 7. Oktober 2026): Mit dem Werkzeug
  // „Schreiben“ (Start) tippt man irgendwo aufs Blatt und schreibt dort
  // los. Ein Textfeld antippen bearbeitet es an Ort und Stelle. Über
  // dem Feld stehen B, I, U, S, Grösse und Löschen, links der Griff zum
  // Verschieben, rechts der Griff für die Breite des Felds.
  // Der Entwurf liegt in editRef, damit Schliessen und Seitenwechsel
  // ihn auch dann noch speichern, wenn das Feld schon weg ist.
  const textSchliessen = useCallback(() => {
    const ed = editRef.current;
    if (!ed) return;
    // Höhe der Tabelle messen, solange sie noch da ist (für die Länge des Blatts)
    const t = tabelleEl.current;
    const v = t && wRef.current ? rund(t.offsetHeight / wRef.current) : 0;
    editRef.current = null; setEdit(null); zelleEl.current = null;
    let neu = null;
    if (ed.weg) neu = null;
    else if (istTab(ed.s)) neu = { ...ed.s, z: ed.s.z.map((r) => r.map((c) => (c || "").trim())), v: v || ed.s.v };
    else if ((ed.s.h || "").trim()) neu = { ...ed.s, h: ed.s.h.trim() };
    const liste = inhaltRef.current.slice();
    if (ed.i >= 0) {
      if (liste[ed.i] !== ed.alt) return;     // inzwischen anders geworden (Rückgängig)
      if (!neu) liste.splice(ed.i, 1);
      else if (JSON.stringify(ed.alt) === JSON.stringify(neu)) return;
      else liste[ed.i] = neu;
    } else {
      if (!neu) return;
      liste.push(neu);
    }
    aendernRef.current(liste);
  }, []);

  textSchliessenRef.current = textSchliessen;

  const textAnfangen = (i, s, klick, ziel) => {
    textSchliessen();
    setHinweis(false);
    const ed = { i, alt: i >= 0 ? inhaltRef.current[i] : null, s: { ...s }, klick, nr: Date.now(),
      ziel: ziel ? { ...ziel, n: 1 } : null };
    editRef.current = ed; setEdit(ed);
  };
  const editSetzen = (aenderung) => {
    const ed = editRef.current;
    if (!ed) return;
    const neu = { ...ed, s: { ...ed.s, ...aenderung } };
    editRef.current = neu; setEdit(neu);
  };

  // Neues Feld an der Stelle des Tipps: die Zeile sitzt mittig auf dem Finger
  const textNeuHier = (e) => {
    const [x, y] = punkt(e);
    const g = merk.schrift;
    const zeile = schriftPx(g) * 1.3 / 1000;
    textAnfangen(-1, { t: 1, h: "", x: rund(Math.max(0, Math.min(0.94, x - 0.004))),
      y: rund(Math.max(0, y - zeile / 2)), g, f: farbe, p: [] }, null);
  };

  // Feld mit Inhalt füllen, Fokus und Schreibmarke dorthin, wo getippt wurde
  useLayoutEffect(() => {
    const el = editorEl.current;
    if (!edit || !el) return;
    el.innerHTML = alsHtml(edit.s.h);
    try { document.execCommand("styleWithCSS", false, false); } catch (f) { /* egal */ }
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    let r = null;
    if (edit.klick && document.caretRangeFromPoint) {
      r = document.caretRangeFromPoint(edit.klick[0], edit.klick[1]);
      if (r && !el.contains(r.startContainer)) r = null;
    }
    if (!r) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
    sel.removeAllRanges(); sel.addRange(r);
  }, [edit && edit.nr]);

  // ---------- Tabellen ----------
  // Die Zellen sind eigene Schreibfelder; React füllt sie nicht, sonst
  // spränge die Schreibmarke. Beim Öffnen kommt der Text hinein, danach
  // schreibt jede Eingabe in den Entwurf zurück.
  const zelleSetzen = (el) => {
    const ed = editRef.current;
    if (!ed || !istTab(ed.s)) return;
    const [r, c] = el.dataset.nbzelle.split("-").map(Number);
    if (!ed.s.z[r]) return;
    const z = ed.s.z.map((x) => x.slice());
    z[r][c] = stilWert(el);
    const neu = { ...ed, s: { ...ed.s, z } };
    editRef.current = neu; setEdit(neu);
  };
  const zielSetzen = (s, r, c) => {
    const ed = editRef.current;
    if (!ed) return;
    const neu = { ...ed, s, klick: null, ziel: { r, c, n: ((ed.ziel && ed.ziel.n) || 0) + 1 } };
    editRef.current = neu; setEdit(neu);
  };
  // Tab: nächste Zelle, in der letzten eine neue Zeile; Umschalt + Tab zurück
  const zelleTaste = (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ed = editRef.current;
    if (!ed || !istTab(ed.s)) return;
    const [r, c] = e.currentTarget.dataset.nbzelle.split("-").map(Number);
    const n = ed.s.z[0].length;
    const k = r * n + c + (e.shiftKey ? -1 : 1);
    if (k < 0) return;
    if (k >= ed.s.z.length * n) { zielSetzen(tabMehr(ed.s, "zeile"), ed.s.z.length, 0); return; }
    zielSetzen(ed.s, Math.floor(k / n), k % n);
  };
  // Plus am Rand: eine Spalte oder Zeile mehr, die Schreibmarke kommt hinein
  const tabPlus = (e, i, art) => {
    e.preventDefault(); e.stopPropagation();
    const ed = editRef.current;
    if (ed && ed.i === i && istTab(ed.s)) {
      const r = zelleEl.current ? Number(zelleEl.current.dataset.nbzelle.split("-")[0]) : 0;
      zielSetzen(tabMehr(ed.s, art), art === "zeile" ? ed.s.z.length : r, art === "zeile" ? 0 : ed.s.z[0].length);
      return;
    }
    const s = inhaltRef.current[i];
    if (!istTab(s)) return;
    textAnfangen(i, tabMehr(s, art), null, art === "zeile" ? { r: s.z.length, c: 0 } : { r: 0, c: s.z[0].length });
  };
  // Im Textfeld „3 3“ und Tab: aus dem Feld wird eine Tabelle
  const feldTaste = (e) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    const m = TAB_MUSTER.exec(e.currentTarget.innerText || "");
    const ed = editRef.current;
    if (!m || !ed) return;
    const spalten = Math.min(12, Number(m[1])), zeilen = Math.min(60, Number(m[2]));
    if (!spalten || !zeilen) return;
    e.preventDefault();
    const neu = { ...ed, s: neueTabelle(ed.s, spalten, zeilen), klick: null, nr: Date.now(), ziel: { r: 0, c: 0, n: 1 } };
    editRef.current = neu; setEdit(neu);
  };

  // Tabelle öffnen: alle Zellen füllen; danach die Zielzelle fokussieren
  const gefuellt = useRef(0);
  useLayoutEffect(() => {
    const t = tabelleEl.current;
    const ed = editRef.current;
    if (!t || !ed || !istTab(ed.s)) return;
    const alle = t.querySelectorAll("[data-nbzelle]");
    alle.forEach((el) => {
      const [r, c] = el.dataset.nbzelle.split("-").map(Number);
      const h = (ed.s.z[r] && ed.s.z[r][c]) || "";
      // Neue Zellen sind leer; vorhandene behalten, was darin steht
      if (gefuellt.current !== ed.nr || (!el.innerHTML && h)) el.innerHTML = alsHtml(h);
    });
    gefuellt.current = ed.nr;
    let el = null, r = null;
    if (ed.klick) {
      const unter = document.elementFromPoint(ed.klick[0], ed.klick[1]);
      el = unter && unter.closest ? unter.closest("[data-nbzelle]") : null;
      if (el && document.caretRangeFromPoint) {
        r = document.caretRangeFromPoint(ed.klick[0], ed.klick[1]);
        if (r && !el.contains(r.startContainer)) r = null;
      }
    }
    if (!el && ed.ziel) el = t.querySelector("[data-nbzelle=\"" + ed.ziel.r + "-" + ed.ziel.c + "\"]");
    if (!el) el = alle[0];
    if (!el) return;
    el.focus({ preventScroll: true });
    zelleEl.current = el;
    if (!r) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  }, [edit && edit.nr, edit && edit.ziel && edit.ziel.n]);

  const stilDruecken = (e, befehl) => {
    e.preventDefault(); e.stopPropagation();
    const el = editorEl.current || zelleEl.current;
    if (!el) return;
    if (!el.contains(window.getSelection().anchorNode)) el.focus();
    document.execCommand(befehl, false, null);
    if (el.dataset.nbzelle) zelleSetzen(el);
    else editSetzen({ h: stilWert(el) });
  };

  // Tippen daneben schliesst das Feld; Escape auch (vor dem Fenster)
  useEffect(() => {
    if (!edit) return;
    const daneben = (e) => {
      const t = e.target;
      if (t.closest && (t.closest(".nb-text--edit") || t.closest(".nb-leiste") || t.closest(".dialog-huelle:not(.nb-huelle)"))) return;
      offenBeimTipp.current = e;
      textSchliessen();
    };
    const taste = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      textSchliessen();
    };
    document.addEventListener("pointerdown", daneben, true);
    window.addEventListener("keydown", taste, true);
    return () => { document.removeEventListener("pointerdown", daneben, true); window.removeEventListener("keydown", taste, true); };
  }, [!!edit, textSchliessen]);

  // Feld verschieben (Griff links) und Breite ändern (Griff rechts)
  const editZiehen = (e, art) => {
    e.preventDefault(); e.stopPropagation();
    const ed = editRef.current;
    if (!ed) return;
    const start = { x: e.clientX, y: e.clientY, s: ed.s };
    const ziel = e.currentTarget;
    try { ziel.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const b = wRef.current || 1;
    const bewegt = (ev) => {
      const dx = (ev.clientX - start.x) / b, dy = (ev.clientY - start.y) / b;
      if (art === "breite") {
        // Ecke unten rechts: Breite und Höhe zugleich (Wunsch Patrick
        // 7. Oktober 2026: „in beide Richtungen“). Die Höhe ist eine
        // Mindesthöhe m; längerer Text macht das Feld weiter höher.
        const r = editHuelle.current ? editHuelle.current.getBoundingClientRect() : null;
        const alt0 = start.s.b || (r ? r.width / b : 0.3);
        const h0 = start.h || (r ? r.height / b : 0.05);
        if (!start.h) start.h = h0;
        const breite = rund(Math.max(0.05, Math.min(1 - start.s.x, alt0 + dx)));
        // Tabellen werden nur breiter oder schmaler, die Höhe ergibt sich aus den Zeilen
        editSetzen(istTab(start.s) ? { b: breite } : { b: breite, m: rund(Math.max(0.02, h0 + dy)) });
      } else {
        editSetzen({ x: rund(Math.max(0, Math.min(0.95, start.s.x + dx))), y: rund(Math.max(0, start.s.y + dy)) });
      }
    };
    const fertig = () => {
      ziel.removeEventListener("pointermove", bewegt);
      ziel.removeEventListener("pointerup", fertig);
      ziel.removeEventListener("pointercancel", fertig);
      const f = editorEl.current || zelleEl.current;
      if (f) f.focus({ preventScroll: true });
    };
    ziel.addEventListener("pointermove", bewegt);
    ziel.addEventListener("pointerup", fertig);
    ziel.addEventListener("pointercancel", fertig);
  };

  // ---------- Tippen aufs Blatt ----------
  const blattRunter = (e) => {
    if (e.target === e.currentTarget) setWahl(-1);
    tipp.current = { x: e.clientX, y: e.clientY, ziel: e.target, zu: offenBeimTipp.current === e.nativeEvent };
    offenBeimTipp.current = false;
  };
  const blattHoch = (e) => {
    const t = tipp.current;
    tipp.current = null;
    if (!t || !darfZeichnen || werkzeug !== "text" || e.type !== "pointerup") return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return;
    if (t.ziel !== blatt.current) return;
    // War ein Feld offen, schliesst der Tipp daneben es nur
    if (t.zu) return;
    textNeuHier(e);
  };

  // ---------- Bilder verschieben, Texte antippen ----------
  // art: "text" | "bild" | "groesse"
  const greifen = (e, i, art) => {
    if (!darfZeichnen || ziehen.current) return;
    if (werkzeug === "radierer" && art === "text") {
      e.preventDefault(); e.stopPropagation();
      aendern(inhaltRef.current.filter((_, n) => n !== i)); return;
    }
    if (werkzeug !== "text") return;
    e.stopPropagation();
    const s = inhaltRef.current[i];
    // Text: antippen bearbeitet; ziehen rollt das Blatt (Finger)
    if (art === "text") { ziehen.current = { i, s, art: "texttipp", sx: e.clientX, sy: e.clientY }; return; }
    // Ein Bild, das nicht gewählt ist, wird erst gewählt: so lässt sich
    // auf einer Seite voller PDF-Seiten mit dem Finger weiter rollen
    if (art === "bild" && wahl !== i) { ziehen.current = { i, s, art: "waehlen", sx: e.clientX, sy: e.clientY }; return; }
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    ziehen.current = { i, s, art, sx: e.clientX, sy: e.clientY, weit: false, id: e.pointerId };
  };
  const ziehBewegen = (e) => {
    const z = ziehen.current;
    if (!z || z.art === "waehlen" || z.art === "texttipp" || z.id !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - z.sx, dy = e.clientY - z.sy;
    if (!z.weit && Math.hypot(dx, dy) < 6) return;
    z.weit = true;
    const b = wRef.current || 1;
    let neu;
    if (z.art === "groesse") {
      neu = { ...z.s, b: rund(Math.max(0.06, Math.min(1 - z.s.x, z.s.b + dx / b))) };
    } else {
      neu = { ...z.s, x: rund(Math.max(-0.02, Math.min(0.96, z.s.x + dx / b))),
              y: rund(Math.max(0, z.s.y + dy / b)) };
    }
    z.neu = neu;
    setZieh({ i: z.i, s: neu });
  };
  const loslassen = (e) => {
    const z = ziehen.current;
    if (!z) return;
    ziehen.current = null; setZieh(null);
    const getippt = e.type === "pointerup" && Math.hypot(e.clientX - z.sx, e.clientY - z.sy) < 8;
    if (z.art === "waehlen") { if (getippt) setWahl(z.i); return; }
    if (z.art === "texttipp") {
      if (getippt && inhaltRef.current[z.i] === z.s) textAnfangen(z.i, z.s, [e.clientX, e.clientY]);
      return;
    }
    if (inhaltRef.current[z.i] !== z.s) return;
    if (z.weit && z.neu) {
      const liste = inhaltRef.current.slice();
      liste[z.i] = z.neu;
      aendern(liste);
    }
  };
  const bildWeg = (i) => { setWahl(-1); aendern(inhaltRef.current.filter((_, n) => n !== i)); };

  // ---------- Bilder und PDFs einfügen ----------
  const einfuegen = async (dateien, ort) => {
    const liste = Array.from(dateien || []).filter((d) => istPdf(d) || istBild(d));
    if (!liste.length) {
      if (dateien && dateien.length) alt.meldung("Nur Bilder und PDFs lassen sich einfügen.", "warn");
      return;
    }
    // Ohne Ort: unter allem, was schon auf der Seite steht
    let y = ort ? ort.y : inhaltRef.current.reduce((m, s) => Math.max(m, unterkante(s) + 0.04), 0.04);
    const x = ort ? ort.x : 0.04;
    const neu = [];
    let ersteY = y;
    try {
      for (const d of liste) {
        setLaeuft("Wird eingefügt: " + d.name);
        if (istPdf(d)) {
          const r = await pdfEinfuegen(d, (i, n) => setLaeuft("PDF " + d.name + ": Seite " + i + " von " + n));
          r.seiten.forEach((s) => {
            neu.push({ t: "bild", u: s.u, q: s.q, s: s.s, n: d.name, x: rund(x), y: rund(y), b: rund(Math.min(0.92, 1 - x)), v: rund(s.v), p: [] });
            y += Math.min(0.92, 1 - x) * s.v + 0.03;
          });
          if (r.alle > r.seiten.length) {
            alt.meldung("Nur die ersten " + r.seiten.length + " von " + r.alle + " Seiten eingefügt.", "warn");
          }
        } else {
          const r = await bildEinfuegen(d);
          const b = Math.min(0.92, 1 - x, Math.max(0.2, r.px / 1000));
          neu.push({ t: "bild", u: r.u, n: d.name, x: rund(x), y: rund(y), b: rund(b), v: rund(r.v), p: [] });
          y += b * r.v + 0.03;
        }
      }
    } catch (e) {
      alt.fehlerMerken && alt.fehlerMerken("Notizbuch einfügen", alt.fehlertext(e));
      alt.meldung("Einfügen ging nicht: " + alt.fehlertext(e), "fehler");
    } finally {
      setLaeuft("");
    }
    if (!neu.length) return;
    aendern([...inhaltRef.current, ...neu]);
    // Hinrollen, damit man sieht, was dazugekommen ist
    requestAnimationFrame(() => {
      const r = rolle.current;
      if (r && !ort) r.scrollTo({ top: blattOben() + ersteY * (wRef.current || 1) - 20, behavior: "smooth" });
    });
  };

  const fallen = (e) => {
    if (!darfZeichnen || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const [x, y] = punkt(e);
    einfuegen(e.dataTransfer.files, { x: Math.max(0, Math.min(0.9, x)), y: Math.max(0, y) });
  };

  // Strg + Z nimmt im Fenster den letzten Schritt auf der Seite zurück,
  // Strg + V fügt ein kopiertes Bild ein
  useEffect(() => {
    const oben = () => {
      // Kleines Notizbuch: nur wenn man zuletzt hineingetippt hat und
      // kein anderes Fenster darüber offen ist
      if (huelle && huelle.classList.contains("nb-schwebend")) {
        return huelle.dataset.aktiv === "1" && !document.querySelector(".dialog-huelle");
      }
      const alle = document.querySelectorAll(".dialog-huelle");
      return alle[alle.length - 1] === huelle;
    };
    const taste = (e) => {
      if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z")) return;
      if (istTextfeld(e.target) || !oben()) return;
      e.preventDefault();
      zurueck();
    };
    const kleben = (e) => {
      if (!darfZeichnen || istTextfeld(e.target) || !oben()) return;
      const f = e.clipboardData && e.clipboardData.files;
      if (f && f.length) { e.preventDefault(); einfuegen(f); }
    };
    document.addEventListener("keydown", taste);
    document.addEventListener("paste", kleben);
    return () => { document.removeEventListener("keydown", taste); document.removeEventListener("paste", kleben); };
  });

  const werkzeugSetzen = (wz) => {
    if (wz !== "text") textSchliessen();
    setWerkzeug(wz); merk.werkzeug = wz; setWahl(-1); setHinweis(false);
  };
  // Knopf T: Hinweis zeigen, dann kommt das Feld dorthin, wo man tippt
  const textKnopf = () => { textSchliessen(); werkzeugSetzen("text"); setHinweis(true); };
  // Farbe gilt für das offene Textfeld, neue Texte und den Stift
  const farbeSetzen = (f) => {
    setFarbe(f); merk.farbe = f;
    if (editRef.current) { editSetzen({ f }); return; }
    if (werkzeug === "radierer") werkzeugSetzen("stift");
  };
  const dickeWechseln = () => {
    const i = DICKEN.findIndex((d) => d[0] === dicke);
    const d = DICKEN[(i + 1) % DICKEN.length][0];
    setDicke(d); merk.dicke = d;
    if (werkzeug !== "stift") werkzeugSetzen("stift");
  };
  const dickePx = (DICKEN.find((d) => d[0] === dicke) || DICKEN[1])[1];

  if (inhalt === null) return <div className="nb-seite"><p className="nb-leer">Wird geladen …</p></div>;

  // Lage, Farbe, Grösse und Breite eines Textfelds auf dem Blatt
  const textStil = (s) => ({ left: s.x * w, top: s.y * w, color: anzeigeFarbe(s.f, dunkel), "--nbf": anzeigeFarbe(s.f, dunkel),
    fontSize: schriftPx(s.g) * w / 1000, minHeight: s.m ? s.m * w : undefined,
    width: s.b ? s.b * w : undefined, maxWidth: s.b ? undefined : Math.max(80, (1 - s.x) * w - 6) });
  const hoehe = seitenHoehe(zieh ? inhalt.map((s, i) => (i === zieh.i ? zieh.s : s)) : inhalt);
  const ansicht = (s, i) => (zieh && zieh.i === i ? zieh.s : s);
  // Leiste über dem offenen Feld oder der offenen Tabelle
  const leiste = edit && (
    <div className={"nb-textleiste" + (edit.s.y * w < 52 ? " nb-textleiste--unten" : "")}
      role="toolbar" aria-label="Schrift">
      <span className="nb-textleiste__griff" data-nbtextziehen="" title="Verschieben"
        aria-label="Verschieben" onPointerDown={(e) => editZiehen(e, "lage")}><Symbol d={ZIEHEN} /></span>
      {STILE.map(([befehl, zeichen, name, stil]) => (
        <button key={befehl} type="button" className="nb-textleiste__knopf" data-stil={befehl}
          aria-label={name} title={name} onPointerDown={(e) => stilDruecken(e, befehl)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { if (e.detail === 0) stilDruecken(e, befehl); }}>
          <span style={stil}>{zeichen}</span></button>))}
      <select value={edit.s.g} data-nbschrift="" aria-label="Schriftgrösse"
        onChange={(e) => { merk.schrift = e.target.value; editSetzen({ g: e.target.value });
          requestAnimationFrame(() => { const f = editorEl.current || zelleEl.current; if (f) f.focus({ preventScroll: true }); }); }}>
        {SCHRIFTEN.map(([g, name]) => <option key={g} value={g}>{name}</option>)}
      </select>
      <button type="button" className="nb-textleiste__knopf nb-textleiste__weg" data-nbtextweg=""
        aria-label={istTab(edit.s) ? "Tabelle löschen" : "Textfeld löschen"}
        title={istTab(edit.s) ? "Tabelle löschen" : "Textfeld löschen"}
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation();
          if (editRef.current) editRef.current = { ...editRef.current, weg: true };
          textSchliessen(); }}>
        <Symbol d={EIMER} /></button>
    </div>);
  // Rand rechts und unten: beim Drüberfahren erscheint ein Plus für eine
  // Spalte oder Zeile mehr (Wunsch Patrick 7. Oktober 2026)
  const plusRand = (i) => (<>
    <button type="button" className="nb-tab__plus nb-tab__plus--spalte" data-nbspalteplus=""
      aria-label="Spalte dazu" title="Spalte dazu"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => tabPlus(e, i, "spalte")}><span>+</span></button>
    <button type="button" className="nb-tab__plus nb-tab__plus--zeile" data-nbzeileplus=""
      aria-label="Zeile dazu" title="Zeile dazu"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => tabPlus(e, i, "zeile")}><span>+</span></button>
  </>);
  const knopf = (wz, d, name) => (
    <button type="button" className={"nb-knopf" + (werkzeug === wz ? " aktiv" : "")} data-nbwerkzeug={wz}
      aria-label={name} title={name} aria-pressed={werkzeug === wz} onClick={() => werkzeugSetzen(wz)}>
      <Symbol d={d} /></button>);

  return (
    <div className={"nb-seite nb-seite--" + werkzeug}>
      {darf &&
        <div className="nb-leiste" role="toolbar" aria-label="Werkzeuge">
          <button type="button" className={"nb-knopf" + (werkzeug === "text" ? " aktiv" : "")} data-nbwerkzeug="text"
            data-nb="text" aria-label="Schreiben: Textfeld setzen" title="Schreiben: dort hintippen, wo der Text hin soll"
            aria-pressed={werkzeug === "text"} onClick={textKnopf}><Symbol d={TEXT} /></button>
          {knopf("stift", STIFT, "Stift: zeichnen")}
          <label className="nb-farbe" style={{ "--f": farbe }} aria-label="Farbe wählen" title="Farbe wählen">
            <input type="color" value={farbe} data-nbfarbe=""
              onChange={(e) => farbeSetzen(e.target.value.toLowerCase())} />
          </label>
          <button type="button" className="nb-knopf" aria-label={"Stiftdicke " + dicke} title="Stiftdicke wechseln"
            data-nbdicke={dicke} onClick={dickeWechseln}>
            <i style={{ width: 3 + dickePx * 1.3, height: 3 + dickePx * 1.3, background: anzeigeFarbe(farbe, dunkel) }} /></button>
          {knopf("radierer", RADIERER, "Radierer")}
          <span className="nb-trenner" />
          <button type="button" className="nb-knopf" data-nb="einfuegen" aria-label="Bild oder PDF einfügen"
            title="Bild oder PDF einfügen" disabled={!!laeuft} onClick={() => datei.current.click()}>
            <Symbol d={BILD} /></button>
          <input ref={datei} type="file" hidden multiple accept="image/*,application/pdf,.pdf" data-nbdatei=""
            onChange={(e) => { const f = e.target.files; einfuegen(f); e.target.value = ""; }} />
          <span className="nb-trenner" />
          <button type="button" className="nb-knopf" data-nb="zurueck" aria-label="Rückgängig"
            title="Rückgängig (Strg + Z)" disabled={!kannZurueck} onClick={zurueck}><Symbol d={ZURUECK} /></button>
          {laeuft && <span className="nb-laeuft" role="status">{laeuft}</span>}
        </div>}
      {hinweis && <div className="nb-tipp" role="status" data-nbtipp="">Tippe dort hin, wo das Textfeld hin soll.</div>}
      <div className="nb-rolle" ref={rolle} onDragOver={(e) => { if (darfZeichnen) e.preventDefault(); }}
        onDrop={fallen} onPointerDown={(e) => { if (e.target === e.currentTarget) setWahl(-1); }}>
        <input className="nb-titel" value={titel} placeholder="Titel der Seite" readOnly={!darf}
          style={{ width: w || undefined }} data-nbtitel="" maxLength={120}
          onChange={(e) => titelAendern(e.target.value)} />
        <div className="nb-blatt" ref={blatt} data-nbblatt=""
          style={{ width: w, height: Math.round(hoehe * w) }}
          onPointerDown={blattRunter} onPointerUp={blattHoch} onPointerCancel={blattHoch}>
          {w > 0 && inhalt.map((s0, i) => {
            if (!istBildEl(s0)) return null;
            const s = ansicht(s0, i);
            return (
              <div key={"b" + i} className={"nb-bild" + (wahl === i ? " nb-bild--wahl" : "")} data-nbbild={i}
                style={{ left: s.x * w, top: s.y * w, width: s.b * w, height: s.b * s.v * w }}
                onPointerDown={(e) => greifen(e, i, "bild")} onPointerMove={ziehBewegen}
                onPointerUp={loslassen} onPointerCancel={loslassen}>
                <img src={s.u} alt={s.n || "Bild"} draggable={false} loading="lazy" />
                {wahl === i && darf && <>
                  <button type="button" className="nb-bild__weg" data-nbbildweg="" aria-label="Bild entfernen"
                    title="Entfernen" onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => bildWeg(i)}>×</button>
                  {s.q && <button type="button" className="nb-bild__pdf" title="PDF öffnen"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => alt.betrachter(s.q, s.n || "PDF", true)}>PDF öffnen</button>}
                  <span className="nb-bild__griff" data-nbgriff="" aria-label="Grösse ändern"
                    onPointerDown={(e) => greifen(e, i, "groesse")} onPointerMove={ziehBewegen}
                    onPointerUp={loslassen} onPointerCancel={loslassen} />
                </>}
              </div>);
          })}
          <canvas ref={leinwand} className="nb-leinwand"
            onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}
            onLostPointerCapture={hoch} />
          {w > 0 && inhalt.map((s0, i) => {
            if (!istText(s0) || (edit && edit.i === i)) return null;
            const s = ansicht(s0, i);
            return (
              <div key={"t" + i} className="nb-text" data-nbtext={i}
                style={textStil(s)}
                onPointerDown={(e) => greifen(e, i, "text")}
                onPointerUp={loslassen} onPointerCancel={loslassen}>
                <FettText text={s.h} /></div>);
          })}
          {w > 0 && inhalt.map((s0, i) => {
            if (!istTab(s0) || (edit && edit.i === i)) return null;
            const s = ansicht(s0, i);
            return (
              <div key={"z" + i} className="nb-text nb-tab" data-nbtab={i} style={textStil(s)}
                onPointerDown={(e) => greifen(e, i, "text")}
                onPointerUp={loslassen} onPointerCancel={loslassen}>
                <table><tbody>
                  {s.z.map((zeile, r) => (
                    <tr key={r}>{zeile.map((c, k) => <td key={k}><FettText text={c} /></td>)}</tr>))}
                </tbody></table>
                {darf && werkzeug === "text" && plusRand(i)}
              </div>);
          })}
          {edit && w > 0 && !istTab(edit.s) &&
            <div ref={editHuelle} className="nb-text nb-text--edit" style={{ ...textStil(edit.s), minWidth: 60 }}
              data-nbedit="">
              {leiste}
              <div ref={editorEl} className="nb-text__feld" contentEditable suppressContentEditableWarning
                role="textbox" aria-multiline="true" data-nbfeld="" onKeyDown={feldTaste}
                onInput={(e) => editSetzen({ h: stilWert(e.currentTarget) })} />
              <span className="nb-text__breite" data-nbbreite="" title="Grösse ändern" aria-label="Grösse ändern"
                onPointerDown={(e) => editZiehen(e, "breite")} />
            </div>}
          {edit && w > 0 && istTab(edit.s) &&
            <div ref={editHuelle} className="nb-text nb-text--edit nb-tab nb-tab--edit" style={textStil(edit.s)}
              data-nbedit="" data-nbtabedit="">
              {leiste}
              <table ref={tabelleEl}><tbody>
                {edit.s.z.map((zeile, r) => (
                  <tr key={r}>{zeile.map((_, k) => (
                    <td key={k}><div className="nb-tab__zelle" contentEditable suppressContentEditableWarning
                      role="textbox" aria-label={"Zeile " + (r + 1) + ", Spalte " + (k + 1)} data-nbzelle={r + "-" + k}
                      onFocus={(e) => { zelleEl.current = e.currentTarget; }}
                      onInput={(e) => zelleSetzen(e.currentTarget)} onKeyDown={zelleTaste} /></td>))}
                  </tr>))}
              </tbody></table>
              {plusRand(edit.i)}
              <span className="nb-text__breite" data-nbbreite="" title="Breite ändern" aria-label="Breite ändern"
                onPointerDown={(e) => editZiehen(e, "breite")} />
            </div>}
          {!inhalt.length && darf && !edit && !hinweis &&
            <span className="nb-hinweis">Irgendwo hintippen und schreiben. Zum Zeichnen den Stift wählen.
              Bilder und PDFs mit dem Bild-Knopf einfügen oder hierher ziehen.</span>}
        </div>
      </div>
    </div>
  );
}

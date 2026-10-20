// =================================================================
//  INFOBOARD: DIE TAFEL
//  Zeichnet das Infoboard immer auf einem Blatt von 1080 × 1920
//  Punkten (der Bildschirm hochkant) und verkleinert oder vergrössert
//  es als Ganzes auf den Platz, den es hat: in der Gestaltung klein
//  neben den Knöpfen, am Bildschirm über die ganze Fläche. So sieht
//  die Gestaltung genau aus wie nachher der Bildschirm.
//
//  Oben der Kopf mit Logo, Uhr, Wetter und Solaranlage, darunter drei
//  Reihen mit drei A4 oder einem A3 und einem A4.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Uhr, Wetter, Solaranlage } from "../seiten/Start.jsx";
import { pdfjs } from "../teile/PdfAnsicht.jsx";
import Skizze from "../pad/Skizze.jsx";
import { BREITE, HOEHE, LUECKE, FELD_B, FELD_H, KOPF_H, BLATT, SEKUNDEN } from "./daten.js";

// Welche Spalten jedes Feld einer Reihe belegt: [erste Spalte, Breite]
const SPALTEN_JE_FORMAT = { a4: [[0, 1], [1, 1], [2, 1]], a3l: [[0, 2], [2, 1]], a3r: [[0, 1], [1, 2]] };

// Lage jedes sichtbaren Felds auf dem Blatt
export function felderLage(aufbau) {
  const aus = [];
  aufbau.reihen.forEach((r, ri) => {
    const top = KOPF_H + ri * (FELD_H + LUECKE);
    (SPALTEN_JE_FORMAT[r.format] || SPALTEN_JE_FORMAT.a4).forEach(([sp, breit], pi) => {
      aus.push({ feld: r.felder[pi], reihe: ri, platz: pi, spalte: sp, breit, format: breit === 2 ? "a3" : "a4",
        left: LUECKE + sp * (FELD_B + LUECKE), top, width: breit * FELD_B + (breit - 1) * LUECKE, height: FELD_H });
    });
  });
  return aus;
}

// Das Blatt passt sich ganz in den Platz ein, hochkant mittig
function useMassstab(rahmen) {
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    const rechnen = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setK(w && h ? Math.min(w / BREITE, h / HOEHE) : 0);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rahmen]);
  return k;
}

const ZIEH_ART = "application/x-hofer-ibfeld";

export function Tafel({ aufbau, bearbeiten, gewaehlt, waehlen, grossZiel, ablegen }) {
  const rahmen = useRef(null);
  const k = useMassstab(rahmen);
  const lage = felderLage(aufbau);
  const [ziel, setZiel] = useState(null);
  // Ziehen und Ablegen in der Gestaltung: eine Datei vom Computer auf ein
  // Feld oder ein Feld auf ein anderes (dann tauschen sie)
  const ziehen = (l) => !ablegen ? {} : {
    draggable: l.feld.art !== "leer",
    onDragStart: (e) => { e.dataTransfer.setData(ZIEH_ART, l.feld.id); e.dataTransfer.effectAllowed = "move"; },
    onDragOver: (e) => {
      const t = e.dataTransfer.types;
      if (!t || (!Array.from(t).includes("Files") && !Array.from(t).includes(ZIEH_ART))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = Array.from(t).includes("Files") ? "copy" : "move";
      if (ziel !== l.feld.id) setZiel(l.feld.id);
    },
    onDragLeave: () => setZiel((z) => (z === l.feld.id ? null : z)),
    onDragEnd: () => setZiel(null),
    onDrop: (e) => {
      e.preventDefault(); setZiel(null);
      const datei = e.dataTransfer.files && e.dataTransfer.files[0];
      if (datei) ablegen(l.feld, { datei });
      else ablegen(l.feld, { feldId: e.dataTransfer.getData(ZIEH_ART) });
    },
  };
  return (
    <div className="ib-rahmen" ref={rahmen}
      // Daneben fallen gelassen öffnet der Browser die Datei sonst selbst
      onDragOver={ablegen ? (e) => e.preventDefault() : undefined}
      onDrop={ablegen ? (e) => e.preventDefault() : undefined}>
      {k > 0 &&
      <div className={"ib-blatt" + (bearbeiten ? " ib-blatt--bearbeiten" : "")}
        style={{ width: BREITE, height: HOEHE, transform: "translate(-50%, -50%) scale(" + k + ")" }}>
        <Kopf />
        {lage.map((l) => (
          <div key={l.feld.id} className={"ib-feld ib-feld--" + l.format + " ib-feld--" + l.feld.art
            + (gewaehlt === l.feld.id ? " ib-feld--gewaehlt" : "") + (ziel === l.feld.id ? " ib-feld--ziel" : "")}
            data-ibfeld={l.reihe + "-" + l.platz}
            style={{ left: l.left, top: l.top, width: l.width, height: l.height }}>
            <FeldInhalt feld={l.feld} format={l.format} bearbeiten={bearbeiten} grossZiel={grossZiel} />
            {bearbeiten &&
              <button type="button" className="ib-feld__wahl" aria-label="Bereich wählen"
                onClick={() => waehlen && waehlen(l.feld.id)} {...ziehen(l)} />}
          </div>
        ))}
      </div>}
    </div>
  );
}

// Der Kopf ist eine einzige Karte über die ganze Breite: die Solaranlage
// mit dem Logo darin, Uhr und Wetter oben rechts (Wunsch Patrick
// 20. Oktober 2026: „Solaranlage über die volle Breite, das Logo
// integriert“). Ist der Inhalt höher als der Platz über den Feldern
// (etwa mit Feiertag beim Wetter), wird er etwas verkleinert, statt in
// die Felder zu ragen.
function Kopf() {
  const innen = useRef(null);
  const [k, setK] = useState(1);
  const hoehe = KOPF_H - 2 * LUECKE;
  useLayoutEffect(() => {
    const el = innen.current;
    if (!el) return;
    const rechnen = () => {
      const h = el.offsetHeight;
      setK(h > hoehe ? hoehe / h : 1);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hoehe]);
  return (
    <div className="ib-kopf solar" style={{ height: hoehe, top: LUECKE, left: LUECKE, width: BREITE - 2 * LUECKE }}>
      <div className="ib-kopf__innen" ref={innen}
        style={{ transform: k < 1 ? "scale(" + k + ")" : undefined, width: k < 1 ? 100 / k + "%" : undefined }}>
        <div className="ib-kopf__zeile">
          <img className="ib-kopf__logo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
          <div className="ib-kopf__rechts">
            <Uhr ohneId />
            <Wetter ohneId />
          </div>
        </div>
        <Solaranlage ohneId />
      </div>
    </div>
  );
}

function FeldInhalt({ feld, format, bearbeiten, grossZiel }) {
  if (feld.art === "skizze") {
    return (
      <div className="ib-skizze">
        <Skizze key={feld.id + format} blatt={BLATT[format]} grossZiel={grossZiel}
          speicher={{ tabelle: "infoboard_skizzen", spalte: "bereich", wert: feld.id,
            hinweis: "Mit dem Finger zeichnen oder schreiben.",
            loeschenText: "Die ganze Zeichnung verschwindet vom Infoboard." }} />
      </div>
    );
  }
  if (feld.art === "datei" && feld.datei && feld.datei.url) {
    const d = feld.datei;
    if (d.typ === "pdf") return <PdfFlaeche url={d.url} sekunden={feld.sekunden || SEKUNDEN} />;
    if (d.typ === "bild") return <img className="ib-bild" src={d.url} alt={d.name || ""} />;
    if (d.typ === "video") return <video className="ib-bild" src={d.url} autoPlay muted loop playsInline />;
  }
  return bearbeiten ? <div className="ib-leer">{format === "a3" ? "A3" : "A4"}<br />leer</div> : null;
}

// Ein PDF füllt sein Feld mit der ganzen Seite. Hat es mehrere Seiten,
// wechseln sie von selbst; antippen zeigt sofort die nächste.
function PdfFlaeche({ url, sekunden }) {
  const box = useRef(null);
  const leinwand = useRef(null);
  const [doc, setDoc] = useState(null);
  const [seite, setSeite] = useState(1);
  const [fehler, setFehler] = useState("");
  const [groesse, setGroesse] = useState(0);

  useEffect(() => {
    let gueltig = true, aufgabe = null;
    setDoc(null); setSeite(1); setFehler("");
    (async () => {
      try {
        const lib = await pdfjs();
        const antwort = await fetch(url);
        if (!antwort.ok) throw new Error("Datei nicht erreichbar (" + antwort.status + ")");
        const daten = new Uint8Array(await antwort.arrayBuffer());
        aufgabe = lib.getDocument({ data: daten, isEvalSupported: false });
        const d = await aufgabe.promise;
        if (gueltig) setDoc(d);
      } catch (e) { if (gueltig) setFehler(alt.fehlertext(e)); }
    })();
    return () => { gueltig = false; if (aufgabe) aufgabe.destroy().catch(() => {}); };
  }, [url]);

  // Neu zeichnen, wenn das Feld seine Grösse auf dem Bildschirm ändert
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGroesse(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    setGroesse(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || doc.numPages < 2) return;
    const t = setInterval(() => setSeite((s) => (s % doc.numPages) + 1), Math.max(3, sekunden) * 1000);
    return () => clearInterval(t);
  }, [doc, sekunden]);

  useEffect(() => {
    if (!doc || !groesse) return;
    let gueltig = true, zeichnen = null;
    (async () => {
      try {
        const p = await doc.getPage(Math.min(seite, doc.numPages));
        if (!gueltig) return;
        // Die Tafel ist als Ganzes verkleinert oder vergrössert: Grösse
        // im Feld aus clientWidth (ungezoomt), Schärfe aus der echten
        // Grösse am Bildschirm. Ohne feste CSS-Grösse stand das Blatt in
        // der Gestaltung nur halb so gross im Feld (1.120.2).
        const el = box.current;
        const v1 = p.getViewport({ scale: 1 });
        const passt = Math.min(el.clientWidth / v1.width, el.clientHeight / v1.height);
        const zoom = el.clientWidth ? el.getBoundingClientRect().width / el.clientWidth : 1;
        const dpr = Math.min((window.devicePixelRatio || 1) * zoom, 3);
        const v = p.getViewport({ scale: passt * dpr });
        const cv = leinwand.current;
        cv.width = Math.floor(v.width); cv.height = Math.floor(v.height);
        cv.style.width = Math.floor(v1.width * passt) + "px";
        cv.style.height = Math.floor(v1.height * passt) + "px";
        zeichnen = p.render({ canvasContext: cv.getContext("2d"), viewport: v });
        await zeichnen.promise;
      } catch (e) { /* abgebrochen oder Seite kaputt: das Bild bleibt */ }
    })();
    return () => { gueltig = false; if (zeichnen) zeichnen.cancel(); };
  }, [doc, seite, groesse]);

  const weiter = () => doc && doc.numPages > 1 && setSeite((s) => (s % doc.numPages) + 1);
  return (
    <div className="ib-pdf" ref={box} onClick={weiter}>
      <canvas ref={leinwand} className="ib-pdf__seite" />
      {fehler && <div className="ib-leer">PDF nicht lesbar<br /><small>{fehler}</small></div>}
      {doc && doc.numPages > 1 && <span className="ib-pdf__nr">{seite} / {doc.numPages}</span>}
    </div>
  );
}

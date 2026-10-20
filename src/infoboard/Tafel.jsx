// =================================================================
//  INFOBOARD: DIE TAFEL
//  Zeichnet das Infoboard immer auf einem Blatt von 1080 × 1920
//  Punkten (der Bildschirm hochkant) und verkleinert oder vergrössert
//  es als Ganzes auf den Platz, den es hat: in der Gestaltung klein
//  neben den Knöpfen, am Bildschirm über die ganze Fläche. So sieht
//  die Gestaltung genau aus wie nachher der Bildschirm.
//
//  Oben der Kopf wie auf der Startseite (Uhr, Logo, Wetter und die
//  Solaranlage), darunter zwei Reihen mit A4- oder A3-Feldern.
// =================================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Uhr, Wetter, Solaranlage } from "../seiten/Start.jsx";
import { pdfjs } from "../teile/PdfAnsicht.jsx";
import Skizze from "../pad/Skizze.jsx";
import { BREITE, HOEHE, LUECKE, A4_B, A4_H, KOPF_H, BLATT, SEKUNDEN } from "./daten.js";

// Lage jedes sichtbaren Felds auf dem Blatt
export function felderLage(aufbau) {
  const aus = [];
  aufbau.reihen.forEach((r, ri) => {
    const top = KOPF_H + LUECKE + ri * (A4_H + LUECKE);
    if (r.format === "a3") {
      aus.push({ feld: r.felder[0], reihe: ri, platz: 0, format: "a3",
        left: LUECKE, top, width: BREITE - 2 * LUECKE, height: A4_H });
    } else {
      r.felder.forEach((f, pi) => aus.push({ feld: f, reihe: ri, platz: pi, format: "a4",
        left: LUECKE + pi * (A4_B + LUECKE), top, width: A4_B, height: A4_H }));
    }
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

export function Tafel({ aufbau, bearbeiten, gewaehlt, waehlen, grossZiel }) {
  const rahmen = useRef(null);
  const k = useMassstab(rahmen);
  const lage = felderLage(aufbau);
  return (
    <div className="ib-rahmen" ref={rahmen}>
      {k > 0 &&
      <div className={"ib-blatt" + (bearbeiten ? " ib-blatt--bearbeiten" : "")}
        style={{ width: BREITE, height: HOEHE, transform: "translate(-50%, -50%) scale(" + k + ")" }}>
        <Kopf />
        {lage.map((l) => (
          <div key={l.feld.id} className={"ib-feld ib-feld--" + l.format + " ib-feld--" + l.feld.art
            + (gewaehlt === l.feld.id ? " ib-feld--gewaehlt" : "")}
            data-ibfeld={l.reihe + "-" + l.platz}
            style={{ left: l.left, top: l.top, width: l.width, height: l.height }}>
            <FeldInhalt feld={l.feld} format={l.format} bearbeiten={bearbeiten} grossZiel={grossZiel} />
            {bearbeiten &&
              <button type="button" className="ib-feld__wahl" aria-label="Bereich wählen"
                onClick={() => waehlen && waehlen(l.feld.id)} />}
          </div>
        ))}
      </div>}
    </div>
  );
}

// Der Kopf ist so hoch wie der Platz über den Feldern. Ist sein Inhalt
// höher (etwa mit Feiertag beim Wetter), wird er etwas verkleinert,
// statt in die Felder zu ragen.
function Kopf() {
  const innen = useRef(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = innen.current;
    if (!el) return;
    const rechnen = () => {
      const h = el.offsetHeight;
      setK(h > KOPF_H - LUECKE ? (KOPF_H - LUECKE) / h : 1);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="ib-kopf" style={{ height: KOPF_H - LUECKE, top: LUECKE, left: LUECKE, width: BREITE - 2 * LUECKE }}>
      <div className="ib-kopf__innen" ref={innen} style={{ transform: k < 1 ? "scale(" + k + ")" : undefined }}>
        <section className="kopfkarte">
          <Uhr ohneId />
          <img className="kopfkarte__logo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
          <Wetter ohneId />
        </section>
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
  return bearbeiten ? <div className="ib-leer">{format === "a3" ? "A3 quer" : "A4"}<br />leer</div> : null;
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
        const r = box.current.getBoundingClientRect();
        const v1 = p.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const s = Math.min(r.width / v1.width, r.height / v1.height) * dpr;
        const v = p.getViewport({ scale: s });
        const cv = leinwand.current;
        cv.width = Math.floor(v.width); cv.height = Math.floor(v.height);
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

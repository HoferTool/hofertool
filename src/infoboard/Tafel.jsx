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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Uhr, Wetter, Solaranlage } from "../seiten/Start.jsx";
import Huehner from "../seiten/start/Huehner.jsx";
import { pdfjs } from "../teile/PdfAnsicht.jsx";
import Skizze from "../pad/Skizze.jsx";
import { TextBlatt } from "./TextFeld.jsx";
import { Seite as ExcelSeite, seitenRechnen } from "../teile/ExcelAnsicht.jsx";
import { excelLesen } from "../teile/excelLesen.js";
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

export function Tafel({ aufbau, bearbeiten, gewaehlt, waehlen, grossZiel, ablegen, doppelt }) {
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
            <FeldInhalt feld={l.feld} format={l.format} bearbeiten={bearbeiten} grossZiel={grossZiel}
              breite={l.width} hoehe={l.height} />
            {bearbeiten &&
              <button type="button" className="ib-feld__wahl" aria-label="Bereich wählen"
                onClick={() => waehlen && waehlen(l.feld.id)}
                onDoubleClick={() => doppelt && doppelt(l.feld.id)} {...ziehen(l)} />}
          </div>
        ))}
      </div>}
    </div>
  );
}

// Der Kopf ist genau der Kopf der Startseite (Uhr, Logo, Wetter und
// darunter die Solaranlage), nur über die ganze Breite der Tafel
// (Wunsch Patrick 20. Oktober 2026: „genau so wie in der Startseite,
// einfach über die volle Breite“). Ist er höher als der Platz über den
// Feldern, wird er als Ganzes etwas verkleinert, statt in die Felder zu
// ragen.
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
  const breite = BREITE - 2 * LUECKE;
  return (
    <div className="ib-kopf" style={{ height: hoehe, top: LUECKE, left: LUECKE, width: breite }}>
      <div className="ib-kopf__innen" ref={innen}
        style={{ transform: k < 1 ? "scale(" + k + ")" : undefined, width: k < 1 ? breite / k : breite }}>
        <section className="kopfkarte">
          <Huehner />
          <Uhr ohneId />
          <img className="kopfkarte__logo" src={alt.LOGO_WEISS} alt="Hofer + Co." />
          <Wetter ohneId />
        </section>
        <Solaranlage ohneId />
      </div>
    </div>
  );
}

function FeldInhalt({ feld, format, bearbeiten, grossZiel, breite, hoehe }) {
  if (feld.art === "text") return <TextBlatt html={feld.html} format={format} breite={breite} hoehe={hoehe} />;
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
    if (d.typ === "pdf") return <PdfFlaeche url={d.url} sekunden={feld.sekunden ?? SEKUNDEN} />;
    if (d.typ === "bild") return <img className="ib-bild" src={d.url} alt={d.name || ""} />;
    if (d.typ === "excel") return <ExcelFlaeche url={d.url} sekunden={feld.sekunden ?? SEKUNDEN} />;
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
    if (!doc || doc.numPages < 2 || !(sekunden > 0)) return;
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
        // Mindestens doppelt so fein zeichnen: Bildschirme wie das Samsung-
        // Display melden oft Faktor 1, verkleinert wirkt die Schrift ruhiger
        const dpr = Math.min(Math.max((window.devicePixelRatio || 1) * zoom, 2), 3);
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

// Ein Excel-Blatt wie ausgedruckt (dieselbe Seite wie im Betrachter),
// ganz ins Feld eingepasst. Alle Seiten aller Blätter wechseln wie beim PDF.
function ExcelFlaeche({ url, sekunden }) {
  const box = useRef(null);
  const [blaetter, setBlaetter] = useState(null);
  const [fehler, setFehler] = useState("");
  const [nr, setNr] = useState(0);
  const [mass, setMass] = useState(null);

  useEffect(() => {
    let gueltig = true;
    setBlaetter(null); setFehler(""); setNr(0);
    (async () => {
      try {
        const antwort = await fetch(url);
        if (!antwort.ok) throw new Error("Datei nicht erreichbar (" + antwort.status + ")");
        const b = await excelLesen(new Uint8Array(await antwort.arrayBuffer()));
        if (gueltig) setBlaetter(b);
      } catch (e) { if (gueltig) setFehler(alt.fehlertext(e)); }
    })();
    return () => { gueltig = false; };
  }, [url]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const messen = () => setMass({ b: el.clientWidth, h: el.clientHeight });
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seiten = useMemo(() => {
    if (!blaetter) return [];
    const aus = [];
    blaetter.forEach((b) => {
      const s = seitenRechnen(b);
      s.fenster.forEach((w) => aus.push({ b, s, w }));
    });
    return aus;
  }, [blaetter]);
  const bildUrls = useMemo(() => (blaetter || []).map((b) =>
    b.bilder.map((x) => (x.blob ? URL.createObjectURL(x.blob) : null))), [blaetter]);
  useEffect(() => () => bildUrls.forEach((l) => l.forEach((u) => u && URL.revokeObjectURL(u))), [bildUrls]);

  useEffect(() => {
    if (seiten.length < 2 || !(sekunden > 0)) return;
    const t = setInterval(() => setNr((n) => (n + 1) % seiten.length), Math.max(3, sekunden) * 1000);
    return () => clearInterval(t);
  }, [seiten.length, sekunden]);

  const p = seiten[Math.min(nr, seiten.length - 1)];
  const k = p && mass ? Math.min(mass.b / p.s.papier.b, mass.h / p.s.papier.h) : 0;
  const weiter = () => seiten.length > 1 && setNr((n) => (n + 1) % seiten.length);
  return (
    <div className="ib-pdf ib-excel" ref={box} onClick={weiter}>
      {p && k > 0 &&
        <div className="ib-excel__seite" style={{ width: p.s.papier.b * k, height: p.s.papier.h * k }}>
          <div style={{ transform: "scale(" + k + ")", transformOrigin: "0 0", width: p.s.papier.b }}>
            <ExcelSeite b={p.b} s={p.s} w={p.w} bildUrls={bildUrls[blaetter.indexOf(p.b)] || []} />
          </div>
        </div>}
      {!blaetter && !fehler && <div className="ib-leer">Excel wird geladen …</div>}
      {fehler && <div className="ib-leer">Excel nicht lesbar<br /><small>{fehler}</small></div>}
      {seiten.length > 1 && <span className="ib-pdf__nr">{nr + 1} / {seiten.length}</span>}
    </div>
  );
}


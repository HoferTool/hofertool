// =================================================================
//  INFOBOARD: DIE TAFEL
//  Zeichnet das Infoboard immer auf einem Blatt von 1080 × 1920
//  Punkten (der Bildschirm hochkant) und verkleinert oder vergrössert
//  es als Ganzes auf den Platz, den es hat: in der Gestaltung klein
//  neben den Knöpfen, am Bildschirm über die ganze Fläche. So sieht
//  die Gestaltung genau aus wie nachher der Bildschirm.
//
//  Oben der Kopf mit Logo, Uhr, Wetter und Solaranlage, darauf frei
//  verschiebbare, vergrösserbare und drehbare Teile (seit 1.132.0;
//  vorher drei Reihen mit drei A4 oder einem A3 und einem A4).
// =================================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { alt } from "../bruecke.jsx";
import { Uhr, Wetter, Solaranlage } from "../seiten/Start.jsx";
import Durchfahrt from "../seiten/start/Durchfahrt.jsx";
import Huehnerhimmel from "./Nacht.jsx";
import { pdfjs } from "../teile/PdfAnsicht.jsx";
import Skizze from "../pad/Skizze.jsx";
import { TextBlatt } from "./TextFeld.jsx";
import { Seite as ExcelSeite, seitenRechnen } from "../teile/ExcelAnsicht.jsx";
import { excelLesen } from "../teile/excelLesen.js";
import { LUECKE, BLATT, SEKUNDEN, MIN_GROESSE, TAFELN, TafelMass, useTafelMass } from "./daten.js";

// Das Blatt passt sich ganz in den Platz ein, hochkant mittig
function useMassstab(rahmen, mass) {
  const [k, setK] = useState(0);
  useLayoutEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    const rechnen = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setK(w && h ? Math.min(w / mass.breite, h / mass.hoehe) : 0);
    };
    rechnen();
    const ro = new ResizeObserver(rechnen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rahmen, mass]);
  return k;
}

// Punkt am Bildschirm → Punkt auf der Tafel
function tafelPunkt(blatt, k, e) {
  const r = blatt.getBoundingClientRect();
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
}
const RAD = Math.PI / 180;
// Auf 0, 90, 180 und 270 Grad schnappt die Drehung ein, sonst ganze Grad
function drehungRunden(g) {
  let d = ((Math.round(g) % 360) + 360) % 360;
  for (const z of [0, 90, 180, 270, 360]) if (Math.abs(d - z) <= 4) d = z % 360;
  return d;
}

// Die Tafel: Kopf oben fest, darauf frei liegende Teile. In der
// Gestaltung verschiebt man ein Teil durch Ziehen, die Ecke unten rechts
// ändert die Grösse (Seitenverhältnis bleibt, damit nichts verzerrt), der
// runde Griff oben dreht es (Wunsch Patrick 21. Oktober 2026). Erst beim
// Loslassen wird gespeichert.
// nacht: Bildschirmschoner, statt der Teile fliegen Hühner (Nacht.jsx)
// mass: welcher Bildschirm (TAFELN in daten.js), hochkant im Gang oder quer am Empfang
export function Tafel({ mass = TAFELN.haupt, aufbau, bearbeiten, gewaehlt, waehlen, grossZiel, teilAendern, ablegen, doppelt, nacht }) {
  const rahmen = useRef(null);
  const blatt = useRef(null);
  const k = useMassstab(rahmen, mass);
  const [zug, setZug] = useState(null);       // { id, x, y, w, h, drehung } während des Ziehens
  const [ziel, setZiel] = useState(false);

  const greifen = (e, t, art) => {
    if (!bearbeiten || e.button > 0) return;
    e.stopPropagation(); e.preventDefault();
    if (waehlen) waehlen(t.id);
    if (!teilAendern) return;
    const start = tafelPunkt(blatt.current, k, e);
    const vorher = { x: t.x, y: t.y, w: t.w, h: t.h, drehung: t.drehung || 0 };
    const mitte = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
    let jetzt = { id: t.id, ...vorher };
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch (f) { /* egal */ }
    const bewegen = (ev) => {
      const p = tafelPunkt(blatt.current, k, ev);
      const dx = p.x - start.x, dy = p.y - start.y;
      if (art === "schieben") {
        jetzt = { ...jetzt, x: Math.round(vorher.x + dx), y: Math.round(vorher.y + dy) };
      } else if (art === "drehen") {
        jetzt = { ...jetzt, drehung: drehungRunden(Math.atan2(p.y - mitte.y, p.x - mitte.x) / RAD + 90) };
      } else {
        // Grösse: die Ecke oben links bleibt, wo sie ist, auch gedreht.
        // Gerechnet im gedrehten Teil, damit die Ecke dem Finger folgt.
        const c = Math.cos(vorher.drehung * RAD), sn = Math.sin(vorher.drehung * RAD);
        const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
        const f = Math.max(MIN_GROESSE / Math.min(vorher.w, vorher.h), (vorher.w + lx) / vorher.w, (vorher.h + ly) / vorher.h);
        const w = vorher.w * f, h = vorher.h * f;
        const ecke = { x: mitte.x - (vorher.w / 2) * c + (vorher.h / 2) * sn, y: mitte.y - (vorher.w / 2) * sn - (vorher.h / 2) * c };
        const m = { x: ecke.x + (w / 2) * c - (h / 2) * sn, y: ecke.y + (w / 2) * sn + (h / 2) * c };
        jetzt = { ...jetzt, w: Math.round(w), h: Math.round(h), x: Math.round(m.x - w / 2), y: Math.round(m.y - h / 2) };
      }
      setZug(jetzt);
    };
    const los = () => {
      el.removeEventListener("pointermove", bewegen);
      el.removeEventListener("pointerup", los);
      el.removeEventListener("pointercancel", los);
      setZug(null);
      const { id, ...neu } = jetzt;
      if (Object.keys(neu).some((key) => neu[key] !== vorher[key])) teilAendern(id, neu);
    };
    el.addEventListener("pointermove", bewegen);
    el.addEventListener("pointerup", los);
    el.addEventListener("pointercancel", los);
  };

  // Eine Datei vom Computer irgendwo auf die Tafel ziehen: dort entsteht
  // ein neues Teil
  const dateiZiehen = !ablegen ? {} : {
    onDragOver: (e) => {
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!ziel) setZiel(true);
    },
    onDragLeave: (e) => { if (e.currentTarget === e.target) setZiel(false); },
    onDrop: (e) => {
      e.preventDefault(); setZiel(false);
      const dateien = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (dateien.length && blatt.current) ablegen(dateien, tafelPunkt(blatt.current, k, e));
    },
  };

  return (
    <TafelMass.Provider value={mass}>
    <div className="ib-rahmen" ref={rahmen}
      // Daneben fallen gelassen öffnet der Browser die Datei sonst selbst
      onDragOver={ablegen ? (e) => e.preventDefault() : undefined}
      onDrop={ablegen ? (e) => e.preventDefault() : undefined}>
      {k > 0 &&
      <div ref={blatt} className={"ib-blatt" + (bearbeiten ? " ib-blatt--bearbeiten" : "") + (ziel ? " ib-blatt--ziel" : "")}
        data-ibtafel={mass.id}
        style={{ width: mass.breite, height: mass.hoehe, transform: "translate(-50%, -50%) scale(" + k + ")" }}
        onPointerDown={bearbeiten && waehlen ? () => waehlen(null) : undefined} {...dateiZiehen}>
        <Kopf />
        {nacht && <Huehnerhimmel />}
        {!nacht && aufbau.teile.map((t0) => {
          const t = zug && zug.id === t0.id ? { ...t0, ...zug } : t0;
          const format = t.w > t.h ? "a3" : "a4";
          const an = bearbeiten && gewaehlt === t.id;
          return (
            <div key={t.id} className={"ib-teil" + (an ? " ib-teil--gewaehlt" : "")} data-ibteil={t.id}
              style={{ left: t.x, top: t.y, width: t.w, height: t.h,
                transform: t.drehung ? "rotate(" + t.drehung + "deg)" : undefined }}>
              <div className={"ib-feld ib-feld--" + format + " ib-feld--" + t.art}>
                <FeldInhalt feld={t} format={format} bearbeiten={bearbeiten} grossZiel={grossZiel}
                  breite={t.w} hoehe={t.h} />
              </div>
              {bearbeiten && <>
                <div className="ib-teil__griff" aria-label="Verschieben"
                  onPointerDown={(e) => greifen(e, t, "schieben")}
                  onDoubleClick={() => doppelt && doppelt(t.id)} />
                {an && teilAendern && <>
                  <div className="ib-teil__ecke" data-ibecke="" aria-label="Grösse ändern"
                    onPointerDown={(e) => greifen(e, t, "groesse")} />
                  <div className="ib-teil__stiel" />
                  <div className="ib-teil__drehen" data-ibdrehen="" aria-label="Drehen"
                    onPointerDown={(e) => greifen(e, t, "drehen")} />
                </>}
              </>}
            </div>
          );
        })}
      </div>}
    </div>
    </TafelMass.Provider>
  );
}

// Der Kopf ist genau der Kopf der Startseite (Uhr, Logo, Wetter und
// darunter die Solaranlage), nur über die ganze Breite der Tafel
// (Wunsch Patrick 20. Oktober 2026: „genau so wie in der Startseite,
// einfach über die volle Breite“). Ist er höher als der Platz über den
// Feldern, wird er als Ganzes etwas verkleinert, statt in die Felder zu
// ragen.
function Kopf() {
  const mass = useTafelMass();
  const innen = useRef(null);
  const [k, setK] = useState(1);
  const hoehe = mass.kopf - 2 * LUECKE;
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
  const breite = mass.breite - 2 * LUECKE;
  return (
    <div className="ib-kopf" style={{ height: hoehe, top: LUECKE, left: LUECKE, width: breite }}>
      <div className="ib-kopf__innen" ref={innen}
        style={{ transform: k < 1 ? "scale(" + k + ")" : undefined, width: k < 1 ? breite / k : breite }}>
        <section className="kopfkarte">
          <Durchfahrt />
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


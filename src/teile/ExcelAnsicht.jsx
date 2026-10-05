// =================================================================
//  EXCEL-ANSICHT
//  Zeigt eine Excel-Datei (meist ein Einrichtblatt) direkt in der App,
//  ohne Excel auf dem Gerät: Zellen mit Schrift, Farben, Rahmen,
//  verbundene Zellen und Bilder, mehrere Blätter über die Reiter unten.
//  Das Blatt füllt zuerst die Breite (100 %). Vergrössern geht wie beim
//  PDF mit zwei Fingern, Strg + Mausrad, Doppeltipp oder − / % / +.
//
//  Gezeichnet wird mit festen Pixeln je Spalte und Zeile, genau wie
//  Excel es speichert. So sitzen Bilder dort, wo sie im Blatt sitzen.
//  Alle Masse stehen direkt am Element, damit Drucken eine Kopie in
//  ein eigenes Fenster legen kann.
// =================================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { excelLesen } from "./excelLesen.js";

const ZOOM_MIN = 0.25, ZOOM_MAX = 6;
// Ein kleines Blatt nicht riesig aufblasen
const EINPASSEN_MAX = 2.5;
const RAND = 12;

export function ExcelAnsicht({ daten, beiFehler }) {
  const buehne = useRef(null);
  const blatt = useRef(null);
  const [blaetter, setBlaetter] = useState(null);
  const [aktiv, setAktiv] = useState(0);
  const [flaeche, setFlaeche] = useState(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const anker = useRef(null);

  useEffect(() => {
    let weg = false;
    excelLesen(daten)
      .then((b) => { if (!weg) setBlaetter(b); })
      .catch((f) => { if (!weg) beiFehler(f); });
    return () => { weg = true; };
  }, [daten]);

  useLayoutEffect(() => {
    const el = buehne.current;
    const messen = () => setFlaeche({ b: el.clientWidth, h: el.clientHeight });
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const b = blaetter && blaetter[Math.min(aktiv, blaetter.length - 1)];
  // 100 % = Blatt so breit wie die Fläche
  const grund = b && flaeche ? Math.min(EINPASSEN_MAX, Math.max(0.05, (flaeche.b - 2 * RAND) / Math.max(1, b.breite))) : 1;
  const massstab = grund * zoom;

  // Bilder als Adressen, beim Schliessen wieder freigeben
  const bildUrls = useMemo(() => (b ? b.bilder.map((x) => URL.createObjectURL(x.blob)) : []), [b]);
  useEffect(() => () => bildUrls.forEach((u) => URL.revokeObjectURL(u)), [bildUrls]);

  useLayoutEffect(() => {
    const a = anker.current, el = buehne.current;
    if (!a || !el) return;
    anker.current = null;
    const f = zoom / a.alt;
    el.scrollLeft = (a.x + el.scrollLeft) * f - a.x;
    el.scrollTop = (a.y + el.scrollTop) * f - a.y;
  }, [zoom]);

  const zoomSetzen = (neu, x, y) => {
    const el = buehne.current;
    neu = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, neu));
    if (Math.abs(neu - zoomRef.current) < 0.001) return;
    anker.current = { alt: zoomRef.current, x: x ?? el.clientWidth / 2, y: y ?? el.clientHeight / 2 };
    setZoom(neu);
  };

  // Zwei Finger und Strg + Mausrad, wie in der PDF-Ansicht: während
  // der Geste nur mit CSS, am Ende scharf neu
  useEffect(() => {
    const el = buehne.current;
    let start = null;
    const abstand = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mitte = (t) => {
      const r = el.getBoundingClientRect();
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };
    const beginn = (e) => {
      if (e.touches.length !== 2 || !blatt.current) return;
      const m = mitte(e.touches);
      start = { d: abstand(e.touches), x: m.x, y: m.y, f: 1 };
      blatt.current.style.transformOrigin = (m.x + el.scrollLeft) + "px " + (m.y + el.scrollTop) + "px";
    };
    const bewegen = (e) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const roh = abstand(e.touches) / start.d;
      start.f = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomRef.current * roh)) / zoomRef.current;
      blatt.current.style.transform = "scale(" + start.f + ")";
    };
    const ende = () => {
      if (!start) return;
      const s = start; start = null;
      if (blatt.current) blatt.current.style.transform = "";
      zoomSetzen(zoomRef.current * s.f, s.x, s.y);
    };
    const rad = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomSetzen(zoomRef.current * Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
    };
    const geste = (e) => e.preventDefault();
    el.addEventListener("touchstart", beginn, { passive: true });
    el.addEventListener("touchmove", bewegen, { passive: false });
    el.addEventListener("touchend", ende);
    el.addEventListener("touchcancel", ende);
    el.addEventListener("wheel", rad, { passive: false });
    el.addEventListener("gesturestart", geste);
    el.addEventListener("gesturechange", geste);
    return () => {
      el.removeEventListener("touchstart", beginn);
      el.removeEventListener("touchmove", bewegen);
      el.removeEventListener("touchend", ende);
      el.removeEventListener("touchcancel", ende);
      el.removeEventListener("wheel", rad);
      el.removeEventListener("gesturestart", geste);
      el.removeEventListener("gesturechange", geste);
    };
  }, []);

  const doppelt = (e) => {
    const r = buehne.current.getBoundingClientRect();
    if (zoomRef.current > 1.05) zoomSetzen(1);
    else zoomSetzen(2.5, e.clientX - r.left, e.clientY - r.top);
  };

  const reiterWahl = (i) => {
    setAktiv(i); setZoom(1);
    if (buehne.current) { buehne.current.scrollLeft = 0; buehne.current.scrollTop = 0; }
  };

  return (
    <div className="excelansicht">
      <div className="excelansicht__buehne" ref={buehne} onDoubleClick={doppelt}>
        {b && flaeche && <div ref={blatt} className="excelansicht__rahmen"
          style={{ width: b.breite * massstab + 2 * RAND, minHeight: "100%", padding: RAND, boxSizing: "border-box" }}>
          <div style={{ width: b.breite * massstab, height: b.hoehe * massstab, margin: "0 auto" }}>
            <Blatt b={b} massstab={massstab} bildUrls={bildUrls} />
          </div>
        </div>}
        {!b && <div className="pdfansicht__laden">Excel wird geladen …</div>}
      </div>
      {b && <div className="excelansicht__leiste">
        <div className="excelansicht__reiter" role="tablist">
          {blaetter.length > 1 && blaetter.map((x, i) => (
            <button key={i} role="tab" aria-selected={i === aktiv} data-blattreiter={i}
              className={"excelansicht__reiterknopf" + (i === aktiv ? " ist-aktiv" : "")}
              onClick={() => reiterWahl(i)}>{x.name}</button>
          ))}
        </div>
        <div className="excelansicht__zoom">
          <button className="knopf knopf--klein" aria-label="Verkleinern" data-kleiner=""
            onClick={() => zoomSetzen(zoom / 1.4)} disabled={zoom <= ZOOM_MIN}>−</button>
          <button className="knopf knopf--klein" data-einpassen="" title="Ganze Breite"
            onClick={() => zoomSetzen(1)}>{Math.round(zoom * 100)}%</button>
          <button className="knopf knopf--klein" aria-label="Vergrössern" data-groesser=""
            onClick={() => zoomSetzen(zoom * 1.4)} disabled={zoom >= ZOOM_MAX}>+</button>
        </div>
      </div>}
    </div>
  );
}

// Das Blatt selbst in Originalgrösse, mit CSS „zoom“ vergrössert. So
// bleibt die Schrift bei jeder Grösse scharf.
function Blatt({ b, massstab, bildUrls }) {
  return (
    <div className="excelansicht__blatt" data-excelblatt="" style={{
      position: "relative", width: b.breite, height: b.hoehe, zoom: massstab, background: "#fff",
      color: "#000", fontFamily: "Calibri, Carlito, Arial, sans-serif", fontSize: "14.7px", lineHeight: 1.2,
      overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,.08)",
    }}>
      {b.gitter && <Gitter b={b} />}
      {b.felder.map((f, i) => <Feld key={i} f={f} gitter={b.gitter} />)}
      {b.striche.map((s, i) => (
        <div key={"s" + i} style={{
          position: "absolute", left: s.x, top: s.y, width: s.b, height: s.h, boxSizing: "border-box",
          [s.waag ? "borderTop" : "borderLeft"]: s.dicke + "px " + s.art + " " + s.farbe,
        }} />
      ))}
      {b.bilder.map((x, i) => <Bild key={"b" + i} x={x} url={bildUrls[i]} />)}
    </div>
  );
}

// Ein Bild im Rahmen, den es im Blatt hat. Zugeschnitten (in Excel
// „Zuschneiden“) wird über einen Ausschnitt: das ganze Bild liegt
// grösser darunter, und nur der gewählte Teil ist zu sehen.
function Bild({ x, url }) {
  const z = x.zuschnitt;
  const breit = z ? 1 - z.l - z.r : 1, hoch = z ? 1 - z.t - z.b : 1;
  const iw = breit > 0.001 ? x.b / breit : x.b, ih = hoch > 0.001 ? x.h / hoch : x.h;
  const dreh = [];
  if (x.drehung) dreh.push("rotate(" + x.drehung + "deg)");
  if (x.spiegelH) dreh.push("scaleX(-1)");
  if (x.spiegelV) dreh.push("scaleY(-1)");
  return (
    <div style={{ position: "absolute", left: x.x, top: x.y, width: x.b, height: x.h, overflow: "hidden",
      transform: dreh.length ? dreh.join(" ") : undefined }}>
      <img src={url} alt="" draggable={false} style={{ position: "absolute", maxWidth: "none",
        left: z ? -z.l * iw : 0, top: z ? -z.t * ih : 0, width: iw, height: ih }} />
    </div>
  );
}

// Die hellgrauen Hilfslinien von Excel, als eine einzige Grafik
function Gitter({ b }) {
  let d = "";
  b.x.forEach((x, i) => { if (i && b.spalten[i - 1]) d += "M" + (x - 0.5) + " 0V" + b.hoehe; });
  b.y.forEach((y, i) => { if (i && b.zeilen[i - 1]) d += "M0 " + (y - 0.5) + "H" + b.breite; });
  return (
    <svg width={b.breite} height={b.hoehe} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden="true">
      <path d={d} stroke="#e2e4e8" strokeWidth="1" fill="none" shapeRendering="crispEdges" />
    </svg>
  );
}

const WAAG = { left: "flex-start", center: "center", centerContinuous: "center", right: "flex-end",
  fill: "flex-start", justify: "flex-start", distributed: "center" };
const SENK = { top: "flex-start", middle: "center", center: "center", bottom: "flex-end",
  justify: "flex-start", distributed: "center" };

function Feld({ f, gitter }) {
  const stil = {
    position: "absolute", left: f.x, top: f.y, width: f.b, height: f.h, boxSizing: "border-box",
    display: "flex", alignItems: SENK[f.v] || "flex-end", justifyContent: WAAG[f.ha] || "flex-start",
    padding: "0 3px", overflow: f.ueber ? "visible" : "hidden",
    whiteSpace: f.umbruch ? "pre-wrap" : "pre", overflowWrap: f.umbruch ? "anywhere" : undefined,
    textAlign: f.ha === "center" || f.ha === "centerContinuous" ? "center" : f.ha === "right" ? "right"
      : f.ha === "justify" ? "justify" : "left",
    ...f.schrift,
  };
  // Verbundene Zellen und gefüllte decken die Hilfslinien ab
  if (f.fill) stil.background = f.fill;
  else if (f.verbunden && gitter) stil.background = "#fff";
  if (f.einzug) stil.paddingLeft = 3 + f.einzug * 9;
  // Gedrehter Text (90° nach oben, -90° nach unten, senkrecht gestapelt)
  let innen = null;
  if (f.drehung === 90 || f.drehung === "vertical") innen = { writingMode: "vertical-rl", transform: "rotate(180deg)" };
  else if (f.drehung === -90 || f.drehung === 180) innen = { writingMode: "vertical-rl" };
  const inhalt = f.runs
    ? <span>{f.runs.map((r, i) => <span key={i} style={r.stil}>{r.text}</span>)}</span>
    : f.text;
  return <div style={stil}>{innen ? <span style={innen}>{inhalt}</span>
    : f.umbruch ? <span style={{ width: "100%" }}>{inhalt}</span> : inhalt}</div>;
}

// Drucken: eine Kopie des Blattes in ein eigenes Fenster, auf die
// Seitenbreite verkleinert, damit nicht die ganze App mitgedruckt wird
export function excelDrucken(wurzel, titel, meldung) {
  const el = wurzel && wurzel.querySelector("[data-excelblatt]");
  if (!el) return false;
  const w = window.open("", "_blank");
  if (!w) { meldung("Das Fenster wurde blockiert.", "warn"); return true; }
  const breite = parseFloat(el.style.width) || 1000;
  const hoehe = parseFloat(el.style.height) || 700;
  // A4: quer, wenn das Blatt breiter als hoch ist
  const quer = breite > hoehe;
  const seiteB = quer ? 1040 : 720;
  const kopie = el.cloneNode(true);
  kopie.style.zoom = String(Math.min(1, seiteB / breite));
  kopie.style.boxShadow = "none";
  const t = String(titel || "Excel").replace(/[<>&"]/g, "");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + t + "</title>"
    + "<style>@page{size:A4 " + (quer ? "landscape" : "portrait") + ";margin:8mm}body{margin:0}"
    + "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body></body></html>");
  w.document.close();
  w.document.body.appendChild(w.document.importNode(kopie, true));
  // Bilder abwarten, sonst fehlen sie auf dem Papier
  const bilder = [...w.document.images];
  Promise.all(bilder.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))))
    .then(() => setTimeout(() => { w.focus(); w.print(); }, 50));
  return true;
}

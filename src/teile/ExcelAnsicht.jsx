// =================================================================
//  EXCEL-ANSICHT
//  Zeigt eine Excel-Datei (meist ein Einrichtblatt) direkt in der App,
//  ohne Excel auf dem Gerät: Zellen mit Schrift, Farben, Rahmen,
//  verbundene Zellen und Bilder, mehrere Blätter über die Reiter unten.
//  Jedes Blatt erscheint als A4-Seite wie beim Drucken: hoch oder quer,
//  mit den Rändern, dem Druckbereich und dem Massstab aus Excel
//  („Auf eine Seite einpassen“). Wunsch von Tristan, 5. Oktober 2026:
//  so sieht es aus wie das ausgedruckte Blatt an der Maschine. 100 % =
//  ganze Seite sichtbar. Vergrössern wie beim PDF mit zwei Fingern,
//  Strg + Mausrad, Doppeltipp oder − / % / +.
//
//  Gezeichnet wird mit festen Pixeln je Spalte und Zeile, genau wie
//  Excel es speichert. So sitzen Bilder dort, wo sie im Blatt sitzen.
//  Alle Masse stehen direkt am Element, damit Drucken eine Kopie in
//  ein eigenes Fenster legen kann.
// =================================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { excelLesen } from "./excelLesen.js";

const ZOOM_MIN = 0.5, ZOOM_MAX = 6;
const RAND = 12, LUECKE = 16;
// A4 bei 96 Punkten je Zoll (210 × 297 mm)
const A4 = { b: 794, h: 1123 };

// Wie Excel das Blatt auf Seiten verteilt: Massstab aus „Einpassen“
// oder „Verkleinern auf … %“, dann von oben nach unten an ganzen
// Zeilen umbrechen, so viele Seiten wie nötig
export function seitenRechnen(b) {
  const s = b.seite;
  const papier = s.quer ? { b: A4.h, h: A4.b } : A4;
  const r = s.raender;
  const pb = Math.max(100, papier.b - r.l - r.r), ph = Math.max(100, papier.h - r.o - r.u);
  const inh = s.inhalt;
  let f;
  if (s.einpassen) {
    const fw = s.einpassen.b > 0 ? (pb * s.einpassen.b) / Math.max(1, inh.b) : Infinity;
    const fh = s.einpassen.h > 0 ? (ph * s.einpassen.h) / Math.max(1, inh.h) : Infinity;
    f = Math.min(fw, fh, 1);
  } else {
    // Zu breit für die Seite: lieber verkleinern als quer aufteilen
    f = Math.min(s.massstab || 1, pb / Math.max(1, inh.b));
  }
  if (!isFinite(f) || f <= 0) f = 1;
  const proSeite = ph / f;
  const fenster = [];
  let z = inh.z0, y0 = inh.y;
  while (fenster.length < 60) {
    let zz = z;
    while (zz < inh.z1 && b.y[zz + 1] - y0 <= proSeite + 0.5) zz++;
    if (zz === z) zz = Math.min(z + 1, inh.z1);
    const y1 = b.y[zz];
    fenster.push({ y0, y1 });
    if (zz >= inh.z1) break;
    z = zz; y0 = y1;
  }
  const links = r.l + (s.mitte ? Math.max(0, (pb - inh.b * f) / 2) : 0);
  return { papier, f, r, links, fenster, x0: inh.x, w: inh.b };
}

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
  const seiten = useMemo(() => (b ? seitenRechnen(b) : null), [b]);
  // 100 % = eine ganze Seite passt in die Fläche, mit etwas Rand
  const grund = seiten && flaeche ? Math.max(0.05, Math.min((flaeche.b - 2 * RAND) / seiten.papier.b,
    (flaeche.h - 2 * RAND) / seiten.papier.h)) : 1;
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
        {b && flaeche && <div ref={blatt} className="excelansicht__rahmen" style={{ padding: RAND }}>
          <div className="excelansicht__seiten" data-excelseiten="" style={{ zoom: massstab, display: "flex",
            flexDirection: "column", alignItems: "center", gap: LUECKE }}>
            {seiten.fenster.map((w, i) => (
              <Seite key={i} b={b} s={seiten} w={w} bildUrls={bildUrls} />
            ))}
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
          <button className="knopf knopf--klein" data-einpassen="" title="Ganze Seite"
            onClick={() => zoomSetzen(1)}>{Math.round(zoom * 100)}%</button>
          <button className="knopf knopf--klein" aria-label="Vergrössern" data-groesser=""
            onClick={() => zoomSetzen(zoom * 1.4)} disabled={zoom >= ZOOM_MAX}>+</button>
        </div>
      </div>}
    </div>
  );
}

// Eine Papierseite: weiss, mit den Rändern aus Excel. Darin ein
// Fenster auf den Teil des Blattes, der auf diese Seite kommt. Alles
// mit CSS „zoom“ statt transform, damit die Schrift scharf bleibt.
function Seite({ b, s, w, bildUrls }) {
  const hoehe = w.y1 - w.y0;
  return (
    <div className="excelansicht__papier" data-excelseite="" style={{
      position: "relative", flex: "none", width: s.papier.b, height: s.papier.h, background: "#fff",
      boxShadow: "0 2px 12px rgba(0,0,0,.45)", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: s.links, top: s.r.o, width: s.w * s.f, height: hoehe * s.f, overflow: "hidden" }}>
        <div style={{ zoom: s.f, position: "relative", width: s.w, height: hoehe }}>
          <div style={{ position: "absolute", left: -s.x0, top: -w.y0 }}>
            <Blatt b={b} bildUrls={bildUrls} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Das Blatt selbst in Originalgrösse
function Blatt({ b, bildUrls }) {
  return (
    <div className="excelansicht__blatt" data-excelblatt="" style={{
      position: "relative", width: b.breite, height: b.hoehe, background: "#fff",
      color: "#000", fontFamily: "Calibri, Carlito, Arial, sans-serif", fontSize: "14.7px", lineHeight: 1.2,
      overflow: "hidden",
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

// Drucken: die Seiten so, wie sie auf dem Bildschirm stehen, je eine
// A4-Seite, in ein eigenes Fenster, damit nicht die ganze App mitkommt
export function excelDrucken(wurzel, titel, meldung) {
  const el = wurzel && wurzel.querySelector("[data-excelseiten]");
  if (!el) return false;
  const w = window.open("", "_blank");
  if (!w) { meldung("Das Fenster wurde blockiert.", "warn"); return true; }
  const erste = el.querySelector("[data-excelseite]");
  const quer = erste && parseFloat(erste.style.width) > parseFloat(erste.style.height);
  const kopie = el.cloneNode(true);
  kopie.style.zoom = "1"; kopie.style.gap = "0";
  kopie.querySelectorAll("[data-excelseite]").forEach((p) => {
    p.style.boxShadow = "none";
    // Ein Hauch kleiner als A4, sonst rutscht beim Drucker eine leere Seite nach
    p.style.height = (parseFloat(p.style.height) - 2) + "px";
    p.style.breakAfter = "page";
  });
  const t = String(titel || "Excel").replace(/[<>&"]/g, "");
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + t + "</title>"
    + "<style>@page{size:A4 " + (quer ? "landscape" : "portrait") + ";margin:0}body{margin:0}"
    + "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body></body></html>");
  w.document.close();
  w.document.body.appendChild(w.document.importNode(kopie, true));
  // Bilder abwarten, sonst fehlen sie auf dem Papier
  const bilder = [...w.document.images];
  Promise.all(bilder.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))))
    .then(() => setTimeout(() => { w.focus(); w.print(); }, 50));
  return true;
}
